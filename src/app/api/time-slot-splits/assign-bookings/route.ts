import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// POST - Assign bookings to a split
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { split_id, booking_ids } = body

    if (!split_id) {
      return NextResponse.json({ error: 'split_id is required' }, { status: 400 })
    }

    if (!booking_ids || !Array.isArray(booking_ids) || booking_ids.length === 0) {
      return NextResponse.json({ error: 'booking_ids array is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Verify the split exists and get its availability_id
    const { data: split, error: splitError } = await supabase
      .from('time_slot_splits')
      .select('id, activity_availability_id')
      .eq('id', split_id)
      .single()

    if (splitError || !split) {
      return NextResponse.json({ error: 'Split not found' }, { status: 404 })
    }

    // Get the activity_availability to find the activity_id and local_date/time
    const { data: availability, error: availError } = await supabase
      .from('activity_availability')
      .select('id, activity_id, local_date, local_time')
      .eq('id', split.activity_availability_id)
      .single()

    if (availError || !availability) {
      return NextResponse.json({ error: 'Availability not found' }, { status: 404 })
    }

    // Validate that all bookings belong to this time slot
    const { data: bookings, error: bookingsError } = await supabase
      .from('activity_bookings')
      .select('activity_booking_id, activity_id, start_date_time')
      .in('activity_booking_id', booking_ids)

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError)
      return NextResponse.json({ error: 'Failed to validate bookings' }, { status: 500 })
    }

    // Check each booking belongs to the correct activity and time slot
    const invalidBookings = bookings?.filter((b: { activity_id: string; start_date_time: string }) => {
      const bookingDate = b.start_date_time.split('T')[0]
      const bookingTime = b.start_date_time.split('T')[1]?.substring(0, 5)
      const availTime = availability.local_time?.substring(0, 5)

      return b.activity_id !== availability.activity_id ||
             bookingDate !== availability.local_date ||
             bookingTime !== availTime
    }) || []

    if (invalidBookings.length > 0) {
      return NextResponse.json({
        error: 'Some bookings do not belong to this time slot',
        invalid_booking_ids: invalidBookings.map((b: { activity_booking_id: number }) => b.activity_booking_id)
      }, { status: 400 })
    }

    // Use RPC for atomic operation, or fallback to sequential with error handling
    // Remove any existing assignments for these bookings (move from other splits)
    const { error: deleteError } = await supabase
      .from('time_slot_split_bookings')
      .delete()
      .in('activity_booking_id', booking_ids)

    if (deleteError) {
      console.error('Error removing existing assignments:', deleteError)
      return NextResponse.json({ error: 'Failed to update assignments' }, { status: 500 })
    }

    // Insert new assignments
    const inserts = booking_ids.map((booking_id: number) => ({
      split_id,
      activity_booking_id: booking_id
    }))

    const { data, error } = await supabase
      .from('time_slot_split_bookings')
      .insert(inserts)
      .select()

    if (error) {
      console.error('Error assigning bookings:', error)
      return NextResponse.json({ error: 'Failed to assign bookings' }, { status: 500 })
    }

    return NextResponse.json({ data, count: data?.length || 0 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Remove bookings from a split (return to unsplit pool)
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { booking_ids } = body

    if (!booking_ids || !Array.isArray(booking_ids) || booking_ids.length === 0) {
      return NextResponse.json({ error: 'booking_ids array is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { error } = await supabase
      .from('time_slot_split_bookings')
      .delete()
      .in('activity_booking_id', booking_ids)

    if (error) {
      console.error('Error removing bookings:', error)
      return NextResponse.json({ error: 'Failed to remove bookings' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
