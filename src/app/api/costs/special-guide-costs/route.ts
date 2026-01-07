import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - List special guide rules and their costs
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const guideId = searchParams.get('guide_id')
    const activityId = searchParams.get('activity_id')

    const supabase = getServiceRoleClient()

    // Fetch special guide rules with guide info
    let rulesQuery = supabase
      .from('special_guide_rules')
      .select(`
        *,
        guides (
          guide_id,
          first_name,
          last_name
        )
      `)
      .order('created_at', { ascending: false })

    if (guideId) rulesQuery = rulesQuery.eq('guide_id', guideId)
    if (activityId) rulesQuery = rulesQuery.eq('activity_id', activityId)

    const { data: rules, error: rulesError } = await rulesQuery

    if (rulesError) {
      console.error('Error fetching special guide rules:', rulesError)
      return NextResponse.json({ error: 'Failed to fetch special guide rules' }, { status: 500 })
    }

    // Fetch guide-specific seasonal costs
    let seasonalQuery = supabase
      .from('guide_specific_seasonal_costs')
      .select(`
        *,
        cost_seasons (
          id,
          name,
          year,
          start_date,
          end_date,
          color
        )
      `)

    if (guideId) seasonalQuery = seasonalQuery.eq('guide_id', guideId)
    if (activityId) seasonalQuery = seasonalQuery.eq('activity_id', activityId)

    const { data: seasonalCosts, error: seasonalError } = await seasonalQuery

    if (seasonalError) {
      console.error('Error fetching guide-specific seasonal costs:', seasonalError)
      return NextResponse.json({ error: 'Failed to fetch seasonal costs' }, { status: 500 })
    }

    // Fetch guide-specific special date costs
    let specialDateQuery = supabase
      .from('guide_specific_special_date_costs')
      .select(`
        *,
        special_cost_dates (
          id,
          name,
          date
        )
      `)

    if (guideId) specialDateQuery = specialDateQuery.eq('guide_id', guideId)
    if (activityId) specialDateQuery = specialDateQuery.eq('activity_id', activityId)

    const { data: specialDateCosts, error: specialDateError } = await specialDateQuery

    if (specialDateError) {
      console.error('Error fetching guide-specific special date costs:', specialDateError)
      return NextResponse.json({ error: 'Failed to fetch special date costs' }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        rules,
        seasonal_costs: seasonalCosts,
        special_date_costs: specialDateCosts
      }
    })
  } catch (err) {
    console.error('Special guide costs fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create special guide rule(s) or costs
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      guide_id,
      activity_ids, // Array for creating rules
      activity_id,  // Single for creating costs
      season_id,
      special_date_id,
      cost_amount,
      currency,
      notes
    } = body

    if (!guide_id) {
      return NextResponse.json({ error: 'Guide ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Creating rules (guide + multiple activities)
    if (activity_ids && Array.isArray(activity_ids)) {
      const rulesToInsert = activity_ids.map(actId => ({
        guide_id,
        activity_id: actId,
        notes: notes || null
      }))

      const { data, error } = await supabase
        .from('special_guide_rules')
        .upsert(rulesToInsert, {
          onConflict: 'guide_id,activity_id'
        })
        .select(`
          *,
          guides (
            guide_id,
            first_name,
            last_name
          )
        `)

      if (error) {
        console.error('Error creating special guide rules:', error)
        return NextResponse.json({ error: 'Failed to create rules' }, { status: 500 })
      }

      return NextResponse.json({ data }, { status: 201 })
    }

    // Creating seasonal cost
    if (activity_id && season_id) {
      if (cost_amount === undefined || cost_amount < 0) {
        return NextResponse.json({ error: 'Valid cost amount is required' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('guide_specific_seasonal_costs')
        .upsert([{
          guide_id,
          activity_id,
          season_id,
          cost_amount,
          currency: currency || 'EUR',
          updated_at: new Date().toISOString()
        }], {
          onConflict: 'guide_id,activity_id,season_id'
        })
        .select(`
          *,
          cost_seasons (
            id,
            name,
            year,
            start_date,
            end_date,
            color
          )
        `)
        .single()

      if (error) {
        console.error('Error creating guide-specific seasonal cost:', error)
        return NextResponse.json({ error: 'Failed to create seasonal cost' }, { status: 500 })
      }

      return NextResponse.json({ data }, { status: 201 })
    }

    // Creating special date cost
    if (activity_id && special_date_id) {
      if (cost_amount === undefined || cost_amount < 0) {
        return NextResponse.json({ error: 'Valid cost amount is required' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('guide_specific_special_date_costs')
        .upsert([{
          guide_id,
          activity_id,
          special_date_id,
          cost_amount,
          currency: currency || 'EUR',
          updated_at: new Date().toISOString()
        }], {
          onConflict: 'guide_id,activity_id,special_date_id'
        })
        .select(`
          *,
          special_cost_dates (
            id,
            name,
            date
          )
        `)
        .single()

      if (error) {
        console.error('Error creating guide-specific special date cost:', error)
        return NextResponse.json({ error: 'Failed to create special date cost' }, { status: 500 })
      }

      return NextResponse.json({ data }, { status: 201 })
    }

    return NextResponse.json(
      { error: 'Either activity_ids (for rules) or activity_id with season_id/special_date_id (for costs) is required' },
      { status: 400 }
    )
  } catch (err) {
    console.error('Special guide cost creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update a special guide rule
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, notes } = body

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('special_guide_rules')
      .update({
        notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        guides (
          guide_id,
          first_name,
          last_name
        )
      `)
      .single()

    if (error) {
      console.error('Error updating special guide rule:', error)
      return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Special guide rule update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete a special guide rule (cascades to costs)
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const guideId = searchParams.get('guide_id')
    const activityId = searchParams.get('activity_id')

    const supabase = getServiceRoleClient()

    // Delete by rule ID
    if (id) {
      // First get the rule to know guide_id and activity_id
      const { data: rule } = await supabase
        .from('special_guide_rules')
        .select('guide_id, activity_id')
        .eq('id', id)
        .single()

      if (rule) {
        // Delete related costs first
        await supabase
          .from('guide_specific_seasonal_costs')
          .delete()
          .eq('guide_id', rule.guide_id)
          .eq('activity_id', rule.activity_id)

        await supabase
          .from('guide_specific_special_date_costs')
          .delete()
          .eq('guide_id', rule.guide_id)
          .eq('activity_id', rule.activity_id)
      }

      // Delete the rule
      const { error } = await supabase
        .from('special_guide_rules')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting special guide rule:', error)
        return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    // Delete by guide_id + activity_id
    if (guideId && activityId) {
      // Delete related costs first
      await supabase
        .from('guide_specific_seasonal_costs')
        .delete()
        .eq('guide_id', guideId)
        .eq('activity_id', activityId)

      await supabase
        .from('guide_specific_special_date_costs')
        .delete()
        .eq('guide_id', guideId)
        .eq('activity_id', activityId)

      // Delete the rule
      const { error } = await supabase
        .from('special_guide_rules')
        .delete()
        .eq('guide_id', guideId)
        .eq('activity_id', activityId)

      if (error) {
        console.error('Error deleting special guide rule:', error)
        return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Either id or guide_id+activity_id is required' }, { status: 400 })
  } catch (err) {
    console.error('Special guide rule deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
