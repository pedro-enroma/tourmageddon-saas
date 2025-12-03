import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditDelete } from '@/lib/audit-logger'

// POST - Create escort assignment
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { escort_id, activity_booking_id } = body

    if (!escort_id || !activity_booking_id) {
      return NextResponse.json({ error: 'escort_id and activity_booking_id are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('escort_assignments')
      .insert([{
        escort_id,
        activity_booking_id,
        assigned_at: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating escort assignment:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This escort is already assigned to this activity' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'escort_assignment', data.id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Remove escort assignment
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const escort_id = searchParams.get('escort_id')
    const activity_booking_id = searchParams.get('activity_booking_id')

    const supabase = getServiceRoleClient()

    let query = supabase.from('escort_assignments').delete()

    // Support deletion by ID or by escort_id + activity_booking_id
    if (id) {
      query = query.eq('id', id)
    } else if (escort_id && activity_booking_id) {
      query = query.eq('escort_id', escort_id).eq('activity_booking_id', activity_booking_id)
    } else {
      return NextResponse.json({ error: 'Either id or both escort_id and activity_booking_id are required' }, { status: 400 })
    }

    // Get current data for audit
    let oldDataQuery = supabase.from('escort_assignments').select('*')
    if (id) {
      oldDataQuery = oldDataQuery.eq('id', id)
    } else if (escort_id && activity_booking_id) {
      oldDataQuery = oldDataQuery.eq('escort_id', escort_id).eq('activity_booking_id', activity_booking_id)
    }
    const { data: oldData } = await oldDataQuery.single()

    const { error } = await query

    if (error) {
      console.error('Error deleting escort assignment:', error)
      return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await auditDelete(request, user, 'escort_assignment', oldData.id || id || `${escort_id}-${activity_booking_id}`, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
