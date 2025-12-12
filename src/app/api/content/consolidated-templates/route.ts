import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - List all consolidated templates
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('consolidated_email_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching consolidated templates:', error)
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Consolidated templates fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create new consolidated template
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, subject, body: templateBody, service_item_template, is_default, template_type } = body

    if (!name || !subject || !templateBody) {
      return NextResponse.json({ error: 'Name, subject, and body are required' }, { status: 400 })
    }

    if (!template_type || !['guide_consolidated', 'escort_consolidated', 'headphone_consolidated', 'printing_consolidated'].includes(template_type)) {
      return NextResponse.json({ error: 'Invalid template type' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // If this is set as default, unset other defaults first (within same type)
    if (is_default) {
      await supabase
        .from('consolidated_email_templates')
        .update({ is_default: false })
        .eq('is_default', true)
        .eq('template_type', template_type)
    }

    const { data, error } = await supabase
      .from('consolidated_email_templates')
      .insert([{
        name,
        subject,
        body: templateBody,
        service_item_template: service_item_template || null,
        is_default: is_default || false,
        template_type
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating consolidated template:', error)
      return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Consolidated template creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update consolidated template
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, name, subject, body: templateBody, service_item_template, is_default, template_type } = body

    if (!id) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get old data
    const { data: oldData } = await supabase
      .from('consolidated_email_templates')
      .select('*')
      .eq('id', id)
      .single()

    // If this is set as default, unset other defaults first (within same type)
    if (is_default) {
      const typeToUse = template_type || oldData?.template_type
      await supabase
        .from('consolidated_email_templates')
        .update({ is_default: false })
        .neq('id', id)
        .eq('template_type', typeToUse)
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updateData.name = name
    if (subject !== undefined) updateData.subject = subject
    if (templateBody !== undefined) updateData.body = templateBody
    if (service_item_template !== undefined) updateData.service_item_template = service_item_template
    if (is_default !== undefined) updateData.is_default = is_default
    if (template_type !== undefined) updateData.template_type = template_type

    const { data, error } = await supabase
      .from('consolidated_email_templates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating consolidated template:', error)
      return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Consolidated template update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete consolidated template
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

    const { error } = await supabase
      .from('consolidated_email_templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting consolidated template:', error)
      return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Consolidated template deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
