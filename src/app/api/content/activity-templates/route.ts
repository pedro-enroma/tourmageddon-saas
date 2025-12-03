import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditDelete, getRequestContext } from '@/lib/audit-logger'

// GET - List activity template assignments
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const activity_id = searchParams.get('activity_id')

    const supabase = getServiceRoleClient()

    let query = supabase
      .from('activity_template_assignments')
      .select(`
        id,
        activity_id,
        template_id,
        template_type,
        created_at,
        template:email_templates (
          id,
          name,
          subject,
          body,
          template_type
        )
      `)
      .order('created_at', { ascending: false })

    if (activity_id) {
      query = query.eq('activity_id', activity_id)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching activity template assignments:', error)
      return NextResponse.json({ error: 'Failed to fetch activity template assignments' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create or update activity template assignment
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { activity_id, template_id, template_type } = body

    if (!activity_id || !template_id || !template_type) {
      return NextResponse.json({ error: 'activity_id, template_id, and template_type are required' }, { status: 400 })
    }

    if (!['guide', 'escort', 'headphone'].includes(template_type)) {
      return NextResponse.json({ error: 'Invalid template_type' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)

    // Check if assignment already exists for this activity+type (upsert)
    const { data: existing } = await supabase
      .from('activity_template_assignments')
      .select('id')
      .eq('activity_id', activity_id)
      .eq('template_type', template_type)
      .single()

    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('activity_template_assignments')
        .update({ template_id })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('Error updating activity template assignment:', error)
        return NextResponse.json({ error: 'Failed to update activity template assignment' }, { status: 500 })
      }

      return NextResponse.json({ data })
    } else {
      // Create new
      const { data, error } = await supabase
        .from('activity_template_assignments')
        .insert([{ activity_id, template_id, template_type }])
        .select()
        .single()

      if (error) {
        console.error('Error creating activity template assignment:', error)
        return NextResponse.json({ error: 'Failed to create activity template assignment' }, { status: 500 })
      }

      await auditCreate(user.id, user.email, 'activity_template_assignment', data.id, data, ip, userAgent)

      return NextResponse.json({ data }, { status: 201 })
    }
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Remove activity template assignment
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const activity_id = searchParams.get('activity_id')
    const template_type = searchParams.get('template_type')

    if (!activity_id || !template_type) {
      return NextResponse.json({ error: 'activity_id and template_type are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)

    // Get existing for audit
    const { data: existing } = await supabase
      .from('activity_template_assignments')
      .select('*')
      .eq('activity_id', activity_id)
      .eq('template_type', template_type)
      .single()

    const { error } = await supabase
      .from('activity_template_assignments')
      .delete()
      .eq('activity_id', activity_id)
      .eq('template_type', template_type)

    if (error) {
      console.error('Error deleting activity template assignment:', error)
      return NextResponse.json({ error: 'Failed to delete activity template assignment' }, { status: 500 })
    }

    if (existing) {
      await auditDelete(user.id, user.email, 'activity_template_assignment', existing.id, existing, ip, userAgent)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
