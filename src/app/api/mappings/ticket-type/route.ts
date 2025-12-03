import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete } from '@/lib/audit-logger'

// GET - List all ticket type mappings
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('ticket_type_mappings')
      .select('*, ticket_categories(name)')
      .order('ticket_type', { ascending: true })

    if (error) {
      console.error('Error fetching ticket type mappings:', error)
      return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new ticket type mapping
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { ticket_type, category_id, activity_id, booked_titles } = body

    if (!ticket_type || !category_id) {
      return NextResponse.json({ error: 'ticket_type and category_id are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('ticket_type_mappings')
      .insert([{
        ticket_type,
        category_id,
        activity_id: activity_id || null,
        booked_titles: booked_titles || []
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating ticket type mapping:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A mapping for this ticket type already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 })
    }

    await auditCreate(request, user, 'ticket_type_mapping', data.id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update ticket type mapping
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, ticket_type, category_id, activity_id, booked_titles } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (!ticket_type || !category_id) {
      return NextResponse.json({ error: 'ticket_type and category_id are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data: oldData } = await supabase
      .from('ticket_type_mappings')
      .select('*')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('ticket_type_mappings')
      .update({
        ticket_type,
        category_id,
        activity_id: activity_id || null,
        booked_titles: booked_titles || []
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating ticket type mapping:', error)
      return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 })
    }

    if (oldData) {
      await auditUpdate(request, user, 'ticket_type_mapping', id, oldData, data)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete ticket type mapping
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
      .from('ticket_type_mappings')
      .select('*')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('ticket_type_mappings')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting ticket type mapping:', error)
      return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 })
    }

    if (oldData) {
      await auditDelete(request, user, 'ticket_type_mapping', id, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
