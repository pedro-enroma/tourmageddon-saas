import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession, isAdmin } from '@/lib/supabase-server'

// GET - List all notification rules
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminCheck = await isAdmin(user.id)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const trigger = searchParams.get('trigger')
    const isActive = searchParams.get('is_active')

    const supabase = getServiceRoleClient()

    let query = supabase
      .from('notification_rules')
      .select('*')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })

    if (trigger) {
      query = query.eq('trigger_event', trigger)
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching notification rules:', error)
      return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Notification rules fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create a new notification rule
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminCheck = await isAdmin(user.id)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const {
      name,
      description,
      trigger_event,
      conditions,
      channels,
      email_recipients,
      telegram_chat_ids,
      recipient_roles,
      notification_title,
      notification_body,
      notification_url,
      is_active,
      priority,
    } = body

    if (!name || !trigger_event) {
      return NextResponse.json({ error: 'Name and trigger_event are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('notification_rules')
      .insert({
        name,
        description: description || null,
        trigger_event,
        conditions: conditions || { type: 'group', operator: 'AND', children: [] },
        channels: channels || ['push'],
        email_recipients: email_recipients || [],
        telegram_chat_ids: telegram_chat_ids || [],
        recipient_roles: recipient_roles || ['admin'],
        notification_title: notification_title || null,
        notification_body: notification_body || null,
        notification_url: notification_url || null,
        is_active: is_active !== false,
        priority: priority || 0,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating notification rule:', error)
      return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Notification rule creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update an existing notification rule
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminCheck = await isAdmin(user.id)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('notification_rules')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating notification rule:', error)
      return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Notification rule update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete a notification rule
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminCheck = await isAdmin(user.id)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Rule ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { error } = await supabase
      .from('notification_rules')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting notification rule:', error)
      return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Notification rule deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
