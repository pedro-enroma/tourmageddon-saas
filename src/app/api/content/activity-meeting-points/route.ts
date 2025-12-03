import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete, getRequestContext } from '@/lib/audit-logger'

// POST - Create activity meeting point assignment
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { activity_id, meeting_point_id, is_default } = body

    if (!activity_id || !meeting_point_id) {
      return NextResponse.json({ error: 'Activity ID and meeting point ID are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('activity_meeting_points')
      .insert([{
        activity_id,
        meeting_point_id,
        is_default: is_default || false
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating assignment:', error)
      return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await auditCreate(user.id, user.email, 'activity_meeting_point', data.id, data, ip, userAgent)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Assignment creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update activity meeting point (for setting default)
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { activity_id, meeting_point_id, is_default, unset_others } = body

    if (!activity_id || !meeting_point_id) {
      return NextResponse.json({ error: 'Activity ID and meeting point ID are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // If unset_others is true, first unset all defaults for this activity
    if (unset_others) {
      await supabase
        .from('activity_meeting_points')
        .update({ is_default: false })
        .eq('activity_id', activity_id)
    }

    // Get old data for audit
    const { data: oldData } = await supabase
      .from('activity_meeting_points')
      .select('*')
      .eq('activity_id', activity_id)
      .eq('meeting_point_id', meeting_point_id)
      .single()

    const { data, error } = await supabase
      .from('activity_meeting_points')
      .update({ is_default })
      .eq('activity_id', activity_id)
      .eq('meeting_point_id', meeting_point_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating assignment:', error)
      return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await auditUpdate(user.id, user.email, 'activity_meeting_point', data.id, oldData, data, ip, userAgent)

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Assignment update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete activity meeting point assignment
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Assignment ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get old data for audit
    const { data: oldData } = await supabase
      .from('activity_meeting_points')
      .select('*')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('activity_meeting_points')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting assignment:', error)
      return NextResponse.json({ error: 'Failed to delete assignment' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await auditDelete(user.id, user.email, 'activity_meeting_point', id, oldData, ip, userAgent)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Assignment deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
