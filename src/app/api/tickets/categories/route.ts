import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete } from '@/lib/audit-logger'

// GET - List all ticket categories
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('ticket_categories')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching ticket categories:', error)
      return NextResponse.json({ error: 'Failed to fetch ticket categories' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new ticket category
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, description, product_names, guide_requires_ticket, skip_name_check, extraction_mode, ticket_class, default_source, b2b_indicator_text, b2b_price_adjustment, partner_id, short_code, display_order, name_deadline_days_b2c, name_deadline_days_b2b } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('ticket_categories')
      .insert([{
        name,
        description: description || null,
        product_names: product_names || [],
        guide_requires_ticket: guide_requires_ticket ?? false,
        skip_name_check: skip_name_check ?? false,
        extraction_mode: extraction_mode || 'per_ticket',
        ticket_class: ticket_class || 'entrance',
        default_source: default_source || 'auto',
        b2b_indicator_text: b2b_indicator_text || null,
        b2b_price_adjustment: b2b_price_adjustment || null,
        partner_id: partner_id || null,
        short_code: short_code || name.substring(0, 3).toUpperCase(),
        display_order: display_order ?? 999,
        name_deadline_days_b2c: name_deadline_days_b2c ?? null,
        name_deadline_days_b2b: name_deadline_days_b2b ?? null
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating ticket category:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A category with this name already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create category' }, { status: 500 })
    }

    await auditCreate(request, user, 'ticket_category', data.id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update ticket category
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, name, description, product_names, guide_requires_ticket, skip_name_check, extraction_mode, ticket_class, default_source, b2b_indicator_text, b2b_price_adjustment, partner_id, short_code, display_order, name_deadline_days_b2c, name_deadline_days_b2b } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data: oldData } = await supabase
      .from('ticket_categories')
      .select('*')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('ticket_categories')
      .update({
        name,
        description: description || null,
        product_names: product_names || [],
        guide_requires_ticket,
        skip_name_check: skip_name_check ?? false,
        extraction_mode: extraction_mode || 'per_ticket',
        ticket_class: ticket_class || 'entrance',
        default_source: default_source || 'auto',
        b2b_indicator_text: b2b_indicator_text || null,
        b2b_price_adjustment: b2b_price_adjustment || null,
        partner_id: partner_id || null,
        short_code: short_code || null,
        display_order: display_order ?? 999,
        name_deadline_days_b2c: name_deadline_days_b2c ?? null,
        name_deadline_days_b2b: name_deadline_days_b2b ?? null
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating ticket category:', error)
      return NextResponse.json({ error: 'Failed to update category' }, { status: 500 })
    }

    if (oldData) {
      await auditUpdate(request, user, 'ticket_category', id, oldData, data)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete ticket category
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

    const { data: oldData } = await supabase
      .from('ticket_categories')
      .select('*')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('ticket_categories')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting ticket category:', error)
      return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 })
    }

    if (oldData) {
      await auditDelete(request, user, 'ticket_category', id, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
