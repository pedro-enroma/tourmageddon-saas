import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - List all commission rules with seller names
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('seller_commission_rules')
      .select(`
        id,
        seller_id,
        activity_id,
        commission_percentage,
        rule_type,
        applicable_year,
        date_range_start,
        date_range_end,
        priority,
        is_active,
        notes,
        created_at,
        updated_at,
        sellers (
          id,
          title
        )
      `)
      .eq('is_active', true)
      .order('seller_id')

    if (error) {
      console.error('Error fetching commission rules:', error)
      return NextResponse.json({ error: 'Failed to fetch commission rules' }, { status: 500 })
    }

    // Get activity details
    const activityIds = [...new Set((data || []).filter(d => d.activity_id).map(d => d.activity_id))]
    let activitiesMap = new Map<number, { id: number; activity_id: string; title: string }>()

    if (activityIds.length > 0) {
      const { data: activitiesData } = await supabase
        .from('activities')
        .select('id, activity_id, title')
        .in('id', activityIds)

      activitiesData?.forEach(a => {
        activitiesMap.set(a.id, a)
      })
    }

    // Transform data
    const transformedData = (data || []).map(item => {
      const sellerInfo = item.sellers as unknown as { id: number; title: string } | null
      const activity = item.activity_id ? activitiesMap.get(item.activity_id) : null

      return {
        id: item.id,
        seller_id: item.seller_id,
        seller_name: sellerInfo?.title || 'Unknown',
        activity_id: activity?.activity_id || null,
        activity_title: activity?.title || null,
        commission_percentage: item.commission_percentage,
        rule_type: item.rule_type,
        year: item.applicable_year,
        start_date: item.date_range_start,
        end_date: item.date_range_end,
        priority: item.priority,
        notes: item.notes,
        created_at: item.created_at,
        updated_at: item.updated_at
      }
    })

    return NextResponse.json({ data: transformedData })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new commission rule
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
    const { seller_name, activity_id, commission_percentage, rule_type, year, start_date, end_date, notes } = body

    if (!seller_name) {
      return NextResponse.json({ error: 'seller_name is required' }, { status: 400 })
    }

    const percentage = parseFloat(commission_percentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      return NextResponse.json({ error: 'commission_percentage must be between 0 and 100' }, { status: 400 })
    }

    if (!['always', 'year', 'date_range'].includes(rule_type)) {
      return NextResponse.json({ error: 'rule_type must be always, year, or date_range' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Find seller ID by title
    const { data: sellerData, error: sellerError } = await supabase
      .from('sellers')
      .select('id, seller_id')
      .eq('title', seller_name)
      .single()

    if (sellerError || !sellerData) {
      return NextResponse.json({ error: `Seller "${seller_name}" not found` }, { status: 404 })
    }

    // Find activity ID if provided
    let activityDbId = null
    if (activity_id) {
      const { data: activityData } = await supabase
        .from('activities')
        .select('id')
        .eq('activity_id', activity_id)
        .single()

      activityDbId = activityData?.id || null
    }

    // Calculate priority based on specificity
    let priority = 6
    const hasActivity = activityDbId !== null
    if (rule_type === 'date_range') priority = hasActivity ? 1 : 4
    else if (rule_type === 'year') priority = hasActivity ? 2 : 5
    else priority = hasActivity ? 3 : 6

    const basePayload = {
      activity_id: activityDbId,
      commission_percentage: percentage,
      rule_type,
      applicable_year: rule_type === 'year' ? parseInt(year) : null,
      date_range_start: rule_type === 'date_range' ? start_date : null,
      date_range_end: rule_type === 'date_range' ? end_date : null,
      priority,
      is_active: true,
      notes: notes || null
    }

    const primaryPayload = { ...basePayload, seller_id: sellerData.id }

    let { data, error } = await supabase
      .from('seller_commission_rules')
      .insert([primaryPayload])
      .select()
      .single()

    if (error && error.code === '23503' && sellerData.seller_id && sellerData.seller_id !== sellerData.id) {
      const fallbackPayload = { ...basePayload, seller_id: sellerData.seller_id }
      const fallback = await supabase
        .from('seller_commission_rules')
        .insert([fallbackPayload])
        .select()
        .single()

      data = fallback.data
      error = fallback.error
    }

    if (error) {
      console.error('Error creating commission rule:', error)
      return NextResponse.json(
        { error: `Failed to create commission rule: ${formatSupabaseError(error)}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update commission rule
export async function PUT(request: NextRequest) {
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
    const { id, seller_name, activity_id, commission_percentage, rule_type, year, start_date, end_date, notes } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (!seller_name) {
      return NextResponse.json({ error: 'seller_name is required' }, { status: 400 })
    }

    const percentage = parseFloat(commission_percentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      return NextResponse.json({ error: 'commission_percentage must be between 0 and 100' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Find seller ID by title
    const { data: sellerData, error: sellerError } = await supabase
      .from('sellers')
      .select('id, seller_id')
      .eq('title', seller_name)
      .single()

    if (sellerError || !sellerData) {
      return NextResponse.json({ error: `Seller "${seller_name}" not found` }, { status: 404 })
    }

    // Find activity ID if provided
    let activityDbId = null
    if (activity_id) {
      const { data: activityData } = await supabase
        .from('activities')
        .select('id')
        .eq('activity_id', activity_id)
        .single()

      activityDbId = activityData?.id || null
    }

    // Calculate priority
    let priority = 6
    const hasActivity = activityDbId !== null
    if (rule_type === 'date_range') priority = hasActivity ? 1 : 4
    else if (rule_type === 'year') priority = hasActivity ? 2 : 5
    else priority = hasActivity ? 3 : 6

    const basePayload = {
      activity_id: activityDbId,
      commission_percentage: percentage,
      rule_type,
      applicable_year: rule_type === 'year' ? parseInt(year) : null,
      date_range_start: rule_type === 'date_range' ? start_date : null,
      date_range_end: rule_type === 'date_range' ? end_date : null,
      priority,
      notes: notes || null,
      updated_at: new Date().toISOString()
    }

    const primaryPayload = { ...basePayload, seller_id: sellerData.id }

    let { data, error } = await supabase
      .from('seller_commission_rules')
      .update(primaryPayload)
      .eq('id', id)
      .select()
      .single()

    if (error && error.code === '23503' && sellerData.seller_id && sellerData.seller_id !== sellerData.id) {
      const fallbackPayload = { ...basePayload, seller_id: sellerData.seller_id }
      const fallback = await supabase
        .from('seller_commission_rules')
        .update(fallbackPayload)
        .eq('id', id)
        .select()
        .single()

      data = fallback.data
      error = fallback.error
    }

    if (error) {
      console.error('Error updating commission rule:', error)
      return NextResponse.json(
        { error: `Failed to update commission rule: ${formatSupabaseError(error)}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Deactivate commission rule (soft delete)
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { error } = await supabase
      .from('seller_commission_rules')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Error deleting commission rule:', error)
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
