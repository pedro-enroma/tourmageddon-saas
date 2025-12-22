import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - List splits for a date or specific availability
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const availability_id = searchParams.get('availability_id')

    const supabase = getServiceRoleClient()

    // If specific availability_id is provided
    if (availability_id) {
      const { data, error } = await supabase
        .from('time_slot_splits')
        .select(`
          id,
          activity_availability_id,
          split_name,
          guide_id,
          display_order,
          created_at,
          time_slot_split_bookings (
            id,
            activity_booking_id
          ),
          time_slot_split_vouchers (
            id,
            voucher_id
          )
        `)
        .eq('activity_availability_id', parseInt(availability_id))
        .order('display_order', { ascending: true })

      if (error) {
        console.error('Error fetching splits:', error)
        return NextResponse.json({ error: 'Failed to fetch splits' }, { status: 500 })
      }

      return NextResponse.json({ data })
    }

    // If date is provided, get all splits for that date
    if (date) {
      // First get all availability IDs for this date
      const { data: availabilities, error: availError } = await supabase
        .from('activity_availability')
        .select('id')
        .eq('local_date', date)

      if (availError) {
        console.error('Error fetching availabilities:', availError)
        return NextResponse.json({ error: 'Failed to fetch availabilities' }, { status: 500 })
      }

      const availabilityIds = availabilities?.map(a => a.id) || []

      if (availabilityIds.length === 0) {
        return NextResponse.json({ data: [] })
      }

      const { data, error } = await supabase
        .from('time_slot_splits')
        .select(`
          id,
          activity_availability_id,
          split_name,
          guide_id,
          display_order,
          created_at,
          time_slot_split_bookings (
            id,
            activity_booking_id
          ),
          time_slot_split_vouchers (
            id,
            voucher_id
          )
        `)
        .in('activity_availability_id', availabilityIds)
        .order('display_order', { ascending: true })

      if (error) {
        console.error('Error fetching splits:', error)
        return NextResponse.json({ error: 'Failed to fetch splits' }, { status: 500 })
      }

      return NextResponse.json({ data })
    }

    return NextResponse.json({ error: 'date or availability_id parameter required' }, { status: 400 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new split
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { activity_availability_id, split_name, guide_id } = body

    if (!activity_availability_id || !split_name) {
      return NextResponse.json({ error: 'activity_availability_id and split_name are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get the current max display_order for this availability
    const { data: existingSplits } = await supabase
      .from('time_slot_splits')
      .select('display_order')
      .eq('activity_availability_id', activity_availability_id)
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = existingSplits && existingSplits.length > 0
      ? (existingSplits[0].display_order || 0) + 1
      : 0

    const { data, error } = await supabase
      .from('time_slot_splits')
      .insert({
        activity_availability_id,
        split_name,
        guide_id: guide_id || null,
        display_order: nextOrder
      })
      .select(`
        id,
        activity_availability_id,
        split_name,
        guide_id,
        display_order,
        created_at
      `)
      .single()

    if (error) {
      console.error('Error creating split:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A split with this name already exists for this time slot' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create split' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update split (rename, change guide)
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { split_id, split_name, guide_id } = body

    if (!split_id) {
      return NextResponse.json({ error: 'split_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Build update object with only provided fields
    const updateData: { split_name?: string; guide_id?: string | null } = {}
    if (split_name !== undefined) updateData.split_name = split_name
    if (guide_id !== undefined) updateData.guide_id = guide_id

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('time_slot_splits')
      .update(updateData)
      .eq('id', split_id)
      .select(`
        id,
        activity_availability_id,
        split_name,
        guide_id,
        display_order,
        created_at,
        time_slot_split_bookings (
          id,
          activity_booking_id
        ),
        time_slot_split_vouchers (
          id,
          voucher_id
        )
      `)
      .single()

    if (error) {
      console.error('Error updating split:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A split with this name already exists for this time slot' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to update split' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete split
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

    // Bookings and vouchers will be automatically removed due to CASCADE
    const { error } = await supabase
      .from('time_slot_splits')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting split:', error)
      return NextResponse.json({ error: 'Failed to delete split' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
