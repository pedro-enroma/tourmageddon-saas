import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete, getRequestContext } from '@/lib/audit-logger'

// POST - Create new template
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, subject, body: templateBody, is_default } = body

    if (!name || !subject || !templateBody) {
      return NextResponse.json({ error: 'Name, subject, and body are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // If this is set as default, unset other defaults first
    if (is_default) {
      await supabase
        .from('email_templates')
        .update({ is_default: false })
        .eq('is_default', true)
    }

    const { data, error } = await supabase
      .from('email_templates')
      .insert([{ name, subject, body: templateBody, is_default: is_default || false }])
      .select()
      .single()

    if (error) {
      console.error('Error creating template:', error)
      return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await auditCreate(user.id, user.email, 'email_template', data.id, data, ip, userAgent)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Template creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update template
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, name, subject, body: templateBody, is_default } = body

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get old data for audit
    const { data: oldData } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', id)
      .single()

    // If this is set as default, unset other defaults first
    if (is_default) {
      await supabase
        .from('email_templates')
        .update({ is_default: false })
        .neq('id', id)
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updateData.name = name
    if (subject !== undefined) updateData.subject = subject
    if (templateBody !== undefined) updateData.body = templateBody
    if (is_default !== undefined) updateData.is_default = is_default

    const { data, error } = await supabase
      .from('email_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating template:', error)
      return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await auditUpdate(user.id, user.email, 'email_template', id, oldData, data, ip, userAgent)

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Template update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete template
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get old data for audit
    const { data: oldData } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting template:', error)
      return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await auditDelete(user.id, user.email, 'email_template', id, oldData, ip, userAgent)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Template deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
