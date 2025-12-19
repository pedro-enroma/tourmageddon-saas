import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - List seasonal costs and special date costs
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const activityId = searchParams.get('activity_id')
    const seasonId = searchParams.get('season_id')
    const specialDateId = searchParams.get('special_date_id')
    const type = searchParams.get('type') // 'season' or 'special_date'

    const supabase = getServiceRoleClient()

    // Fetch seasonal costs
    if (!type || type === 'season') {
      let seasonalQuery = supabase
        .from('guide_seasonal_costs')
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

      if (activityId) seasonalQuery = seasonalQuery.eq('activity_id', activityId)
      if (seasonId) seasonalQuery = seasonalQuery.eq('season_id', seasonId)

      const { data: seasonalCosts, error: seasonalError } = await seasonalQuery

      if (seasonalError) {
        console.error('Error fetching seasonal costs:', seasonalError)
        return NextResponse.json({ error: 'Failed to fetch seasonal costs' }, { status: 500 })
      }

      if (type === 'season') {
        return NextResponse.json({ data: seasonalCosts })
      }

      // Also fetch special date costs if no type specified
      let specialQuery = supabase
        .from('guide_special_date_costs')
        .select(`
          *,
          special_cost_dates (
            id,
            name,
            date
          )
        `)

      if (activityId) specialQuery = specialQuery.eq('activity_id', activityId)
      if (specialDateId) specialQuery = specialQuery.eq('special_date_id', specialDateId)

      const { data: specialCosts, error: specialError } = await specialQuery

      if (specialError) {
        console.error('Error fetching special date costs:', specialError)
        return NextResponse.json({ error: 'Failed to fetch special date costs' }, { status: 500 })
      }

      return NextResponse.json({
        data: {
          seasonal_costs: seasonalCosts,
          special_date_costs: specialCosts
        }
      })
    }

    // Fetch only special date costs
    if (type === 'special_date') {
      let specialQuery = supabase
        .from('guide_special_date_costs')
        .select(`
          *,
          special_cost_dates (
            id,
            name,
            date
          )
        `)

      if (activityId) specialQuery = specialQuery.eq('activity_id', activityId)
      if (specialDateId) specialQuery = specialQuery.eq('special_date_id', specialDateId)

      const { data: specialCosts, error: specialError } = await specialQuery

      if (specialError) {
        console.error('Error fetching special date costs:', specialError)
        return NextResponse.json({ error: 'Failed to fetch special date costs' }, { status: 500 })
      }

      return NextResponse.json({ data: specialCosts })
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  } catch (err) {
    console.error('Seasonal costs fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create a seasonal cost or special date cost
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { activity_id, season_id, special_date_id, cost_amount, currency } = body

    if (!activity_id) {
      return NextResponse.json({ error: 'Activity ID is required' }, { status: 400 })
    }

    if (cost_amount === undefined || cost_amount < 0) {
      return NextResponse.json({ error: 'Valid cost amount is required' }, { status: 400 })
    }

    if (!season_id && !special_date_id) {
      return NextResponse.json(
        { error: 'Either season_id or special_date_id is required' },
        { status: 400 }
      )
    }

    if (season_id && special_date_id) {
      return NextResponse.json(
        { error: 'Cannot set both season_id and special_date_id' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    if (season_id) {
      // Create seasonal cost
      const { data, error } = await supabase
        .from('guide_seasonal_costs')
        .upsert([{
          activity_id,
          season_id,
          cost_amount,
          currency: currency || 'EUR',
          updated_at: new Date().toISOString()
        }], {
          onConflict: 'activity_id,season_id'
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
        console.error('Error creating seasonal cost:', error)
        return NextResponse.json({ error: 'Failed to create seasonal cost' }, { status: 500 })
      }

      return NextResponse.json({ data }, { status: 201 })
    }

    // Create special date cost
    const { data, error } = await supabase
      .from('guide_special_date_costs')
      .upsert([{
        activity_id,
        special_date_id,
        cost_amount,
        currency: currency || 'EUR',
        updated_at: new Date().toISOString()
      }], {
        onConflict: 'activity_id,special_date_id'
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
      console.error('Error creating special date cost:', error)
      return NextResponse.json({ error: 'Failed to create special date cost' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Seasonal cost creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update a seasonal cost or special date cost
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, type, cost_amount, currency } = body

    if (!id || !type) {
      return NextResponse.json({ error: 'ID and type are required' }, { status: 400 })
    }

    if (cost_amount !== undefined && cost_amount < 0) {
      return NextResponse.json({ error: 'Cost amount cannot be negative' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (cost_amount !== undefined) updateData.cost_amount = cost_amount
    if (currency !== undefined) updateData.currency = currency

    const tableName = type === 'season' ? 'guide_seasonal_costs' : 'guide_special_date_costs'

    const { data, error } = await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating cost:', error)
      return NextResponse.json({ error: 'Failed to update cost' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Cost update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete a seasonal cost or special date cost
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const type = searchParams.get('type') // 'season' or 'special_date'

    if (!id || !type) {
      return NextResponse.json({ error: 'ID and type are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const tableName = type === 'season' ? 'guide_seasonal_costs' : 'guide_special_date_costs'

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting cost:', error)
      return NextResponse.json({ error: 'Failed to delete cost' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Cost deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
