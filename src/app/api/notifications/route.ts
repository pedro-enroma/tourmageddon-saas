import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession, isAdmin } from '@/lib/supabase-server'
import { auditCreate, auditUpdate } from '@/lib/audit-logger'

// GET - List all notifications (admin only)
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user is an admin
  const adminCheck = await isAdmin(user.id)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unread_only') === 'true'
    const unresolvedOnly = searchParams.get('unresolved_only') === 'true'
    const limit = parseInt(searchParams.get('limit') || '100')

    const supabase = getServiceRoleClient()
    let query = supabase
      .from('booking_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    if (unresolvedOnly) {
      query = query.eq('is_resolved', false)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching notifications:', error)
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new notification (admin only)
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user is an admin
  const adminCheck = await isAdmin(user.id)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { activity_booking_id, notification_type, message, details } = body

    if (!notification_type || !message) {
      return NextResponse.json({ error: 'notification_type and message are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('booking_notifications')
      .insert([{
        activity_booking_id: activity_booking_id || null,
        notification_type,
        message,
        details: details || null,
        is_read: false,
        is_resolved: false
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating notification:', error)
      return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
    }

    await auditCreate(request, user, 'notification', data.id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update notification (mark as read/resolved) - admin only
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user is an admin
  const adminCheck = await isAdmin(user.id)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id, is_read, is_resolved } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data: oldData } = await supabase
      .from('booking_notifications')
      .select('*')
      .eq('id', id)
      .single()

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }
    if (typeof is_read === 'boolean') updateData.is_read = is_read
    if (typeof is_resolved === 'boolean') {
      updateData.is_resolved = is_resolved
      // Capture who resolved it and when
      if (is_resolved === true) {
        updateData.resolved_at = new Date().toISOString()
        updateData.resolved_by = user.email || user.id
      } else {
        // If un-resolving, clear the resolved info
        updateData.resolved_at = null
        updateData.resolved_by = null
      }
    }

    const { data, error } = await supabase
      .from('booking_notifications')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating notification:', error)
      return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
    }

    if (oldData) {
      await auditUpdate(request, user, 'notification', id, oldData, data)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
