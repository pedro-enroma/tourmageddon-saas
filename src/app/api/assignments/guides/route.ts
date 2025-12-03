import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditDelete } from '@/lib/audit-logger'

// POST - Create guide assignment
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { guide_id, activity_booking_id } = body

    if (!guide_id || !activity_booking_id) {
      return NextResponse.json({ error: 'guide_id and activity_booking_id are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('guide_assignments')
      .insert([{
        guide_id,
        activity_booking_id,
        assigned_at: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating guide assignment:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This guide is already assigned to this activity' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'guide_assignment', data.id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Remove guide assignment
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const guide_id = searchParams.get('guide_id')
    const activity_booking_id = searchParams.get('activity_booking_id')

    const supabase = getServiceRoleClient()

    let query = supabase.from('guide_assignments').delete()

    // Support deletion by ID or by guide_id + activity_booking_id
    if (id) {
      query = query.eq('id', id)
    } else if (guide_id && activity_booking_id) {
      query = query.eq('guide_id', guide_id).eq('activity_booking_id', activity_booking_id)
    } else {
      return NextResponse.json({ error: 'Either id or both guide_id and activity_booking_id are required' }, { status: 400 })
    }

    // Get current data for audit
    let oldDataQuery = supabase.from('guide_assignments').select('*')
    if (id) {
      oldDataQuery = oldDataQuery.eq('id', id)
    } else if (guide_id && activity_booking_id) {
      oldDataQuery = oldDataQuery.eq('guide_id', guide_id).eq('activity_booking_id', activity_booking_id)
    }
    const { data: oldData } = await oldDataQuery.single()

    const { error } = await query

    if (error) {
      console.error('Error deleting guide assignment:', error)
      return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await auditDelete(request, user, 'guide_assignment', oldData.id || id || `${guide_id}-${activity_booking_id}`, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
