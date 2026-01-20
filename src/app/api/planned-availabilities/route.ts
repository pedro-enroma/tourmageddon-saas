import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/supabase-server'

// GET - Fetch planned availabilities for a date range and activity
export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceRoleClient()
    const { searchParams } = new URL(request.url)

    const activityId = searchParams.get('activityId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status') // 'pending', 'matched', or null for all

    let query = supabase
      .from('planned_availabilities')
      .select('*')
      .order('local_date', { ascending: true })
      .order('local_time', { ascending: true })

    if (activityId) {
      query = query.eq('activity_id', activityId)
    }

    if (startDate) {
      query = query.gte('local_date', startDate)
    }

    if (endDate) {
      query = query.lte('local_date', endDate)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching planned availabilities:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error in GET planned-availabilities:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create a new planned availability
export async function POST(request: NextRequest) {
  try {
    const supabase = getServiceRoleClient()
    const body = await request.json()

    const { activity_id, local_date, local_time, notes, created_by } = body

    if (!activity_id || !local_date || !local_time) {
      return NextResponse.json(
        { error: 'activity_id, local_date, and local_time are required' },
        { status: 400 }
      )
    }

    // Check if a real availability already exists for this slot
    const { data: existingReal } = await supabase
      .from('activity_availability')
      .select('id')
      .eq('activity_id', activity_id)
      .eq('local_date', local_date)
      .eq('local_time', local_time)
      .single()

    if (existingReal) {
      return NextResponse.json(
        { error: 'A real availability already exists for this time slot', existingId: existingReal.id },
        { status: 409 }
      )
    }

    // Check if a planned availability already exists
    const { data: existingPlanned } = await supabase
      .from('planned_availabilities')
      .select('id')
      .eq('activity_id', activity_id)
      .eq('local_date', local_date)
      .eq('local_time', local_time)
      .single()

    if (existingPlanned) {
      return NextResponse.json(
        { error: 'A planned availability already exists for this time slot', existingId: existingPlanned.id },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('planned_availabilities')
      .insert({
        activity_id,
        local_date,
        local_time,
        notes,
        created_by,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating planned availability:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Error in POST planned-availabilities:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Remove a planned availability
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getServiceRoleClient()
    const { searchParams } = new URL(request.url)

    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('planned_availabilities')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting planned availability:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in DELETE planned-availabilities:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
