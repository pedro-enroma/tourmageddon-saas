import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

interface CostSeason {
  id: string
  year: number
  name: string
  start_date: string
  end_date: string
  color: string
  created_at: string
  updated_at: string
}

// GET - List seasons, optionally filtered by year
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
      .from('cost_seasons')
      .select('*')
      .order('start_date', { ascending: true })

    if (year) {
      query = query.eq('year', parseInt(year))
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching seasons:', error)
      return NextResponse.json({ error: 'Failed to fetch seasons' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Seasons fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create a new season
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { year, name, start_date, end_date, color } = body

    if (!year || !name || !start_date || !end_date) {
      return NextResponse.json(
        { error: 'Year, name, start_date, and end_date are required' },
        { status: 400 }
      )
    }

    // Validate date range
    if (new Date(end_date) < new Date(start_date)) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('cost_seasons')
      .insert([{
        year,
        name,
        start_date,
        end_date,
        color: color || '#3b82f6'
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating season:', error)
      return NextResponse.json({ error: 'Failed to create season' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Season creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update a season
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, year, name, start_date, end_date, color } = body

    if (!id) {
      return NextResponse.json({ error: 'Season ID is required' }, { status: 400 })
    }

    // Validate date range if both provided
    if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      )
    }

    const supabase = getServiceRoleClient()

    const updateData: Partial<CostSeason> = { updated_at: new Date().toISOString() }
    if (year !== undefined) updateData.year = year
    if (name !== undefined) updateData.name = name
    if (start_date !== undefined) updateData.start_date = start_date
    if (end_date !== undefined) updateData.end_date = end_date
    if (color !== undefined) updateData.color = color

    const { data, error } = await supabase
      .from('cost_seasons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating season:', error)
      return NextResponse.json({ error: 'Failed to update season' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Season update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete a season
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Season ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { error } = await supabase
      .from('cost_seasons')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting season:', error)
      return NextResponse.json({ error: 'Failed to delete season' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Season deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
