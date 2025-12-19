import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

export interface BookingChangeLog {
  id: string
  activity_booking_id: number
  booking_id: number | null
  user_id: string
  user_email: string
  change_type: string
  field_changed: string
  old_value: string | null
  new_value: string | null
  participant_id: number | null
  created_at: string
}

// GET - Fetch booking change logs
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const activity_booking_id = searchParams.get('activity_booking_id')

    const supabase = getServiceRoleClient()

    let query = supabase
      .from('booking_change_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (activity_booking_id) {
      query = query.eq('activity_booking_id', activity_booking_id)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching booking logs:', error)
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
    }

    return NextResponse.json({ data, count })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create a new booking change log
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      activity_booking_id,
      booking_id,
      change_type,
      field_changed,
      old_value,
      new_value,
      participant_id
    } = body

    if (!activity_booking_id || !change_type || !field_changed) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('booking_change_logs')
      .insert({
        activity_booking_id,
        booking_id,
        user_id: user.id,
        user_email: user.email || 'Unknown',
        change_type,
        field_changed,
        old_value: old_value || null,
        new_value: new_value || null,
        participant_id: participant_id || null
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating booking log:', error)
      return NextResponse.json({ error: 'Failed to create log' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
