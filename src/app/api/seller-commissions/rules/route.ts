import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

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

// GET - List all commission rules with seller names and activity associations
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
        commission_percentage,
        rule_type,
        date_basis,
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
        ),
        seller_commission_rule_activities (
          activity_id
        )
      `)
      .eq('is_active', true)
      .order('priority', { ascending: false })

    if (error) {
      console.error('Error fetching commission rules:', error)
      return NextResponse.json({ error: 'Failed to fetch commission rules' }, { status: 500 })
    }

    // Collect all activity IDs from junction table to fetch titles
    const allActivityIds = [...new Set(
      (data || []).flatMap(d =>
        (d.seller_commission_rule_activities as { activity_id: number }[]).map(a => a.activity_id)
      )
    )]
    const activitiesMap = new Map<number, { id: number; activity_id: string; title: string }>()

    if (allActivityIds.length > 0) {
      const { data: activitiesData } = await supabase
        .from('activities')
        .select('id, activity_id, title')
        .in('id', allActivityIds)

      activitiesData?.forEach(a => {
        activitiesMap.set(a.id, a)
      })
    }

    // Transform data
    const transformedData = (data || []).map(item => {
      const sellerInfo = item.sellers as unknown as { id: number; title: string } | null
      const ruleActivities = (item.seller_commission_rule_activities as { activity_id: number }[]) || []
      const activityIds = ruleActivities.map(a => a.activity_id)
      const activityDetails = activityIds.map(id => {
        const activity = activitiesMap.get(id)
        return activity ? { id: activity.id, activity_id: activity.activity_id, title: activity.title } : { id, activity_id: String(id), title: String(id) }
      })

      return {
        id: item.id,
        seller_id: item.seller_id,
        seller_name: sellerInfo?.title || 'Unknown',
        activity_ids: activityIds,
        activity_details: activityDetails,
        commission_percentage: item.commission_percentage,
        rule_type: item.rule_type,
        date_basis: item.date_basis || 'travel_date',
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

// POST - Create new commission rule with activity associations
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { seller_name, activity_ids, commission_percentage, rule_type, date_basis, year, start_date, end_date, priority, notes } = body

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

    if (date_basis && !['travel_date', 'creation_date'].includes(date_basis)) {
      return NextResponse.json({ error: 'date_basis must be travel_date or creation_date' }, { status: 400 })
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

    const rulePayload = {
      seller_id: sellerData.id,
      commission_percentage: percentage,
      rule_type,
      date_basis: date_basis || 'travel_date',
      applicable_year: rule_type === 'year' ? parseInt(year) : null,
      date_range_start: rule_type === 'date_range' ? start_date : null,
      date_range_end: rule_type === 'date_range' ? end_date : null,
      priority: priority ?? 0,
      is_active: true,
      notes: notes || null
    }

    // Step 1: Insert the rule
    let { data: newRule, error } = await supabase
      .from('seller_commission_rules')
      .insert([rulePayload])
      .select()
      .single()

    // Fallback to seller_id field if FK constraint fails
    if (error && error.code === '23503' && sellerData.seller_id && sellerData.seller_id !== sellerData.id) {
      const fallback = await supabase
        .from('seller_commission_rules')
        .insert([{ ...rulePayload, seller_id: sellerData.seller_id }])
        .select()
        .single()

      newRule = fallback.data
      error = fallback.error
    }

    if (error || !newRule) {
      console.error('Error creating commission rule:', error)
      return NextResponse.json(
        { error: `Failed to create commission rule: ${formatSupabaseError(error)}` },
        { status: 500 }
      )
    }

    // Step 2: Link activities (if specific activities selected)
    const activityIdsList: number[] = Array.isArray(activity_ids) ? activity_ids : []
    if (activityIdsList.length > 0) {
      const { error: linkError } = await supabase
        .from('seller_commission_rule_activities')
        .insert(
          activityIdsList.map(activityId => ({
            rule_id: newRule.id,
            activity_id: activityId
          }))
        )

      if (linkError) {
        console.error('Error linking activities:', linkError)
        // Clean up the rule we just created
        await supabase.from('seller_commission_rules').delete().eq('id', newRule.id)
        return NextResponse.json(
          { error: `Failed to link activities: ${formatSupabaseError(linkError)}` },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ data: newRule }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update commission rule and its activity associations
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, seller_name, activity_ids, commission_percentage, rule_type, date_basis, year, start_date, end_date, priority, notes } = body

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

    const rulePayload = {
      seller_id: sellerData.id,
      commission_percentage: percentage,
      rule_type,
      date_basis: date_basis || 'travel_date',
      applicable_year: rule_type === 'year' ? parseInt(year) : null,
      date_range_start: rule_type === 'date_range' ? start_date : null,
      date_range_end: rule_type === 'date_range' ? end_date : null,
      priority: priority ?? 0,
      notes: notes || null,
      updated_at: new Date().toISOString()
    }

    // Step 1: Update the rule
    let { data, error } = await supabase
      .from('seller_commission_rules')
      .update(rulePayload)
      .eq('id', id)
      .select()
      .single()

    if (error && error.code === '23503' && sellerData.seller_id && sellerData.seller_id !== sellerData.id) {
      const fallback = await supabase
        .from('seller_commission_rules')
        .update({ ...rulePayload, seller_id: sellerData.seller_id })
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

    // Step 2: Replace activity associations
    // Delete existing links
    const { error: deleteError } = await supabase
      .from('seller_commission_rule_activities')
      .delete()
      .eq('rule_id', id)

    if (deleteError) {
      console.error('Error deleting activity links:', deleteError)
    }

    // Insert new links
    const activityIdsList: number[] = Array.isArray(activity_ids) ? activity_ids : []
    if (activityIdsList.length > 0) {
      const { error: linkError } = await supabase
        .from('seller_commission_rule_activities')
        .insert(
          activityIdsList.map(activityId => ({
            rule_id: id,
            activity_id: activityId
          }))
        )

      if (linkError) {
        console.error('Error linking activities:', linkError)
      }
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Deactivate commission rule (soft delete, junction entries cascade)
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
