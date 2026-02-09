import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - List all seller-activity assignments with seller names
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()

    // Join seller_activities with sellers to get seller names
    const { data, error } = await supabase
      .from('seller_activities')
      .select(`
        id,
        seller_id,
        activity_id,
        is_active,
        sellers (
          id,
          title
        )
      `)
      .eq('is_active', true)
      .order('seller_id')

    if (error) {
      console.error('Error fetching seller activities:', error)
      return NextResponse.json({ error: 'Failed to fetch seller activities' }, { status: 500 })
    }

    // Get activity details to map activity IDs to titles
    const activityIds = [...new Set((data || []).map(item => item.activity_id).filter(Boolean))]

    const activitiesMapById = new Map<number, { id: number; activity_id: string; title: string }>()
    const activitiesMapByActivityId = new Map<string, { id: number; activity_id: string; title: string }>()

    if (activityIds.length > 0) {
      const activityIdStrings = activityIds.map(id => String(id))
      const numericIds = activityIds
        .map(id => (typeof id === 'number' ? id : Number(id)))
        .filter(id => Number.isInteger(id))

      const [byActivityIdResult, byIdResult] = await Promise.all([
        supabase
          .from('activities')
          .select('id, activity_id, title')
          .in('activity_id', activityIdStrings),
        numericIds.length > 0
          ? supabase
            .from('activities')
            .select('id, activity_id, title')
            .in('id', numericIds)
          : Promise.resolve({ data: [], error: null })
      ])

      if (byActivityIdResult.error) {
        console.error('Error fetching activities by activity_id:', byActivityIdResult.error)
      }
      if (byIdResult.error) {
        console.error('Error fetching activities by id:', byIdResult.error)
      }

      byActivityIdResult.data?.forEach(a => {
        activitiesMapByActivityId.set(a.activity_id, a)
      })
      byIdResult.data?.forEach(a => {
        activitiesMapById.set(a.id, a)
      })
    }

    // Transform data to include seller_name and activity details
    const transformedData = (data || []).map(item => {
      const activityKey = String(item.activity_id)
      const activityByActivityId = activitiesMapByActivityId.get(activityKey)
      const activityById = typeof item.activity_id === 'number'
        ? activitiesMapById.get(item.activity_id)
        : Number.isInteger(Number(item.activity_id))
          ? activitiesMapById.get(Number(item.activity_id))
          : undefined

      const activity = activityByActivityId || activityById
      const sellerInfo = item.sellers as unknown as { id: number; title: string } | null
      return {
        id: item.id,
        seller_id: item.seller_id,
        seller_name: sellerInfo?.title || 'Unknown',
        activity_id: activity?.activity_id || activityKey,
        activity_db_id: activity?.id ?? (typeof item.activity_id === 'number' ? item.activity_id : null),
        activity_title: activity?.title || 'Unknown',
        is_active: item.is_active
      }
    })

    return NextResponse.json({ data: transformedData })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Bulk upsert assignments for a seller
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formatSupabaseError = (err: unknown) => {
      if (!err) return 'Unknown error'
      if (typeof err === 'string') return err
      if (err instanceof Error) return err.message
      const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
      return [
        anyErr.message,
        anyErr.details,
        anyErr.hint,
        anyErr.code ? `code:${anyErr.code}` : null
      ].filter(Boolean).join(' | ')
    }

    const body = await request.json()
    const { seller_name, activity_ids } = body

    if (!seller_name) {
      return NextResponse.json({ error: 'seller_name is required' }, { status: 400 })
    }

    if (!Array.isArray(activity_ids)) {
      return NextResponse.json({ error: 'activity_ids must be an array' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Find seller ID by title
    const { data: sellerData, error: sellerError } = await supabase
      .from('sellers')
      .select('id, seller_id')
      .eq('title', seller_name)
      .single()

    if (sellerError || !sellerData) {
      console.error('Error finding seller:', sellerError)
      return NextResponse.json({ error: `Seller "${seller_name}" not found` }, { status: 404 })
    }

    const uniqueActivityIds = Array.from(new Set(activity_ids.filter(Boolean)))
    const now = new Date().toISOString()

    const mapActivityIdsToNumeric = async (ids: string[]) => {
      const { data: activitiesData, error: activitiesError } = await supabase
        .from('activities')
        .select('id, activity_id')
        .in('activity_id', ids)

      if (activitiesError) {
        return { error: activitiesError, resolved: [] as number[], missing: ids }
      }

      const activityIdMap = new Map<string, number>()
      activitiesData?.forEach(a => {
        activityIdMap.set(a.activity_id, a.id)
      })

      const missing = ids.filter(id => !activityIdMap.has(id))
      const resolved = ids.map(id => activityIdMap.get(id)).filter((id): id is number => typeof id === 'number')
      return { error: null, resolved, missing }
    }

    const isMissingColumnError = (error: { code?: string; message?: string } | null | undefined, column: string) => {
      if (!error) return false
      if (error.code === '42703') return true
      return Boolean(error.message && error.message.includes(`column "${column}"`))
    }

    const saveAssignmentsForSeller = async (sellerId: string | number) => {
      const { data: existingAssignments, error: existingError } = await supabase
        .from('seller_activities')
        .select('id, activity_id')
        .eq('seller_id', sellerId)

      if (existingError) {
        return { error: existingError, stage: 'fetch_existing' }
      }

      const inferActivityIdType = async (): Promise<'numeric' | 'string' | 'unknown'> => {
        try {
          const { data: columnInfo, error: columnError } = await supabase
            .from('information_schema.columns')
            .select('data_type, udt_name')
            .eq('table_schema', 'public')
            .eq('table_name', 'seller_activities')
            .eq('column_name', 'activity_id')
            .single()

          if (!columnError && columnInfo) {
            const dataType = String(columnInfo.data_type || '').toLowerCase()
            const udtName = String(columnInfo.udt_name || '').toLowerCase()
            if (['integer', 'bigint', 'smallint', 'numeric'].includes(dataType)) return 'numeric'
            if (['int2', 'int4', 'int8', 'numeric'].includes(udtName)) return 'numeric'
            if (['character varying', 'text', 'uuid'].includes(dataType)) return 'string'
          }
        } catch (err) {
          console.error('Error reading activity_id column type:', err)
        }

        if (Array.isArray(existingAssignments) && existingAssignments.length > 0) {
          return typeof existingAssignments[0].activity_id === 'number' ? 'numeric' : 'string'
        }

        return 'unknown'
      }

      const updateAssignments = async (ids: Array<string | number>, isActive: boolean) => {
        if (ids.length === 0) return null
        const { error } = await supabase
          .from('seller_activities')
          .update({ is_active: isActive, updated_at: now })
          .in('id', ids)

        if (error && isMissingColumnError(error, 'updated_at')) {
          const retry = await supabase
            .from('seller_activities')
            .update({ is_active: isActive })
            .in('id', ids)
          return retry.error || null
        }

        return error || null
      }

      const insertAssignments = async (ids: Array<string | number>) => {
        if (ids.length === 0) return null
        const payloadWithTimestamps = ids.map(id => ({
          seller_id: sellerId,
          activity_id: id,
          is_active: true,
          created_at: now,
          updated_at: now
        }))

        const { error } = await supabase
          .from('seller_activities')
          .insert(payloadWithTimestamps)

        if (error && (isMissingColumnError(error, 'created_at') || isMissingColumnError(error, 'updated_at'))) {
          const payload = ids.map(id => ({
            seller_id: sellerId,
            activity_id: id,
            is_active: true
          }))

          const retry = await supabase
            .from('seller_activities')
            .insert(payload)
          return retry.error || null
        }

        return error || null
      }

      const applyAssignments = async (resolvedActivityIds: Array<string | number>) => {
        const existingMap = new Map<string, { id: string | number; activity_id: string | number }>()
        existingAssignments?.forEach(row => {
          existingMap.set(String(row.activity_id), row)
        })

        const selectedSet = new Set(resolvedActivityIds.map(id => String(id)))
        const toActivateIds: Array<string | number> = []
        const toInsert: Array<string | number> = []

        resolvedActivityIds.forEach(id => {
          const key = String(id)
          const existing = existingMap.get(key)
          if (existing) {
            toActivateIds.push(existing.id)
          } else {
            toInsert.push(id)
          }
        })

        const toDeactivateIds = (existingAssignments || [])
          .filter(row => !selectedSet.has(String(row.activity_id)))
          .map(row => row.id)

        const activateError = await updateAssignments(toActivateIds, true)
        if (activateError) {
          return { error: activateError, stage: 'activate' }
        }

        const insertError = await insertAssignments(toInsert)
        if (insertError) {
          return { error: insertError, stage: 'insert' }
        }

        const deactivateError = await updateAssignments(toDeactivateIds, false)
        if (deactivateError) {
          return { error: deactivateError, stage: 'deactivate' }
        }

        return { error: null }
      }

      const activityIdType = await inferActivityIdType()

      if (activityIdType === 'numeric') {
        const { resolved, missing, error: mapError } = await mapActivityIdsToNumeric(uniqueActivityIds)
        if (mapError) {
          return { error: mapError, stage: 'map_activities' }
        }
        if (missing.length > 0) {
          return { error: new Error(`Activities not found: ${missing.join(', ')}`), stage: 'missing_activities' }
        }
        return applyAssignments(resolved)
      }

      if (activityIdType === 'string') {
        return applyAssignments(uniqueActivityIds)
      }

      // Unknown type (likely empty table and info_schema not accessible).
      // Try string first, then retry as numeric if it fails.
      const stringResult = await applyAssignments(uniqueActivityIds)
      if (!stringResult.error) return stringResult

      const { resolved, missing, error: mapError } = await mapActivityIdsToNumeric(uniqueActivityIds)
      if (mapError || missing.length > 0) {
        return { error: stringResult.error, stage: 'unknown_type' }
      }
      return applyAssignments(resolved)
    }

    const primarySellerId = sellerData.id
    const fallbackSellerId = sellerData.seller_id
    const primaryResult = await saveAssignmentsForSeller(primarySellerId)

    if (!primaryResult.error) {
      return NextResponse.json({ success: true })
    }

    if (
      primaryResult.error &&
      (primaryResult.error as { code?: string }).code === '23503' &&
      fallbackSellerId &&
      fallbackSellerId !== primarySellerId
    ) {
      const fallbackResult = await saveAssignmentsForSeller(fallbackSellerId)
      if (!fallbackResult.error) {
        return NextResponse.json({ success: true })
      }

      console.error('Error saving assignments with fallback seller_id:', fallbackResult.error)
      return NextResponse.json(
        { error: `Failed to update assignments: ${formatSupabaseError(fallbackResult.error)}` },
        { status: 500 }
      )
    }

    console.error('Error saving assignments:', primaryResult.error)
    return NextResponse.json(
      { error: `Failed to update assignments: ${formatSupabaseError(primaryResult.error)}` },
      { status: 500 }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Deactivate all assignments for a seller
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const seller_name = searchParams.get('seller_name')

    if (!seller_name) {
      return NextResponse.json({ error: 'seller_name is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Find seller ID by title
    const { data: sellerData, error: sellerError } = await supabase
      .from('sellers')
      .select('id, seller_id')
      .eq('title', seller_name)
      .single()

    if (sellerError || !sellerData) {
      console.error('Error finding seller:', sellerError)
      return NextResponse.json({ error: `Seller "${seller_name}" not found` }, { status: 404 })
    }

    // Deactivate assignments (soft delete)
    const sellerIdsToMatch = [sellerData.id, sellerData.seller_id].filter(Boolean)
    const { error } = await supabase
      .from('seller_activities')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('seller_id', sellerIdsToMatch)

    if (error) {
      console.error('Error deactivating seller activities:', error)
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
