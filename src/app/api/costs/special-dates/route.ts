import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - List special dates
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year')

    const supabase = getServiceRoleClient()

    let query = supabase
      .from('special_cost_dates')
      .select('*')
      .order('date', { ascending: true })

    if (year) {
      // Filter by year using date range
      query = query
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching special dates:', error)
      return NextResponse.json({ error: 'Failed to fetch special dates' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Special dates fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create a new special date
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, date } = body

    if (!name || !date) {
      return NextResponse.json(
        { error: 'Name and date are required' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('special_cost_dates')
      .insert([{ name, date }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A special date already exists for this date' },
          { status: 409 }
        )
      }
      console.error('Error creating special date:', error)
      return NextResponse.json({ error: 'Failed to create special date' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Special date creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update a special date
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, name, date } = body

    if (!id) {
      return NextResponse.json({ error: 'Special date ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (date !== undefined) updateData.date = date

    const { data, error } = await supabase
      .from('special_cost_dates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A special date already exists for this date' },
          { status: 409 }
        )
      }
      console.error('Error updating special date:', error)
      return NextResponse.json({ error: 'Failed to update special date' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Special date update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete a special date
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Special date ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { error } = await supabase
      .from('special_cost_dates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting special date:', error)
      return NextResponse.json({ error: 'Failed to delete special date' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Special date deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
