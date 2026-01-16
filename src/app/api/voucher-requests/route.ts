import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete } from '@/lib/audit-logger'

// GET - List voucher requests with filters
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const activity_availability_id = searchParams.get('activity_availability_id')
    const date_from = searchParams.get('date_from')
    const date_to = searchParams.get('date_to')
    const partner_id = searchParams.get('partner_id')

    const supabase = getServiceRoleClient()
    let query = supabase
      .from('voucher_requests')
      .select(`
        *,
        partners (partner_id, name, email),
        ticket_categories (id, name)
      `)
      .order('created_at', { ascending: false })

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }
    if (activity_availability_id) {
      query = query.eq('activity_availability_id', activity_availability_id)
    }
    if (partner_id) {
      query = query.eq('partner_id', partner_id)
    }
    if (date_from) {
      query = query.gte('visit_date', date_from)
    }
    if (date_to) {
      query = query.lte('visit_date', date_to)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching voucher requests:', error)
      return NextResponse.json({ error: 'Failed to fetch voucher requests' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new voucher request (draft)
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      activity_availability_id,
      ticket_category_id,
      partner_id,
      requested_quantity,
      visit_date,
      entry_time,
      activity_name,
      customer_names,
      total_pax,
      notes
    } = body

    // Validation
    if (!activity_availability_id) {
      return NextResponse.json({ error: 'activity_availability_id is required' }, { status: 400 })
    }
    if (!ticket_category_id) {
      return NextResponse.json({ error: 'ticket_category_id is required' }, { status: 400 })
    }
    if (!partner_id) {
      return NextResponse.json({ error: 'partner_id is required' }, { status: 400 })
    }
    if (!requested_quantity || requested_quantity < 1) {
      return NextResponse.json({ error: 'requested_quantity must be at least 1' }, { status: 400 })
    }
    if (!visit_date) {
      return NextResponse.json({ error: 'visit_date is required' }, { status: 400 })
    }
    if (!activity_name) {
      return NextResponse.json({ error: 'activity_name is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('voucher_requests')
      .insert([{
        activity_availability_id,
        ticket_category_id,
        partner_id,
        requested_quantity,
        visit_date,
        entry_time: entry_time || null,
        activity_name,
        customer_names: customer_names || [],
        total_pax: total_pax || requested_quantity,
        notes: notes || null,
        status: 'draft',
        created_by: user.id
      }])
      .select(`
        *,
        partners (partner_id, name, email),
        ticket_categories (id, name)
      `)
      .single()

    if (error) {
      console.error('Error creating voucher request:', error)
      return NextResponse.json({ error: 'Failed to create voucher request' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'voucher_request', data.id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update voucher request (only drafts can be updated)
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      id,
      requested_quantity,
      entry_time,
      customer_names,
      total_pax,
      notes
    } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Check if request exists and is still a draft
    const { data: existingRequest, error: fetchError } = await supabase
      .from('voucher_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existingRequest) {
      return NextResponse.json({ error: 'Voucher request not found' }, { status: 404 })
    }

    if (existingRequest.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft requests can be updated' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('voucher_requests')
      .update({
        requested_quantity: requested_quantity ?? existingRequest.requested_quantity,
        entry_time: entry_time !== undefined ? entry_time : existingRequest.entry_time,
        customer_names: customer_names ?? existingRequest.customer_names,
        total_pax: total_pax ?? existingRequest.total_pax,
        notes: notes !== undefined ? notes : existingRequest.notes
      })
      .eq('id', id)
      .select(`
        *,
        partners (partner_id, name, email),
        ticket_categories (id, name)
      `)
      .single()

    if (error) {
      console.error('Error updating voucher request:', error)
      return NextResponse.json({ error: 'Failed to update voucher request' }, { status: 500 })
    }

    // Audit log
    await auditUpdate(request, user, 'voucher_request', id, existingRequest, data)

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete voucher request (only drafts can be deleted)
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

    // Check if request exists and is still a draft
    const { data: existingRequest, error: fetchError } = await supabase
      .from('voucher_requests')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existingRequest) {
      return NextResponse.json({ error: 'Voucher request not found' }, { status: 404 })
    }

    if (existingRequest.status !== 'draft') {
      return NextResponse.json({ error: 'Only draft requests can be deleted' }, { status: 400 })
    }

    const { error } = await supabase
      .from('voucher_requests')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting voucher request:', error)
      return NextResponse.json({ error: 'Failed to delete voucher request' }, { status: 500 })
    }

    // Audit log
    await auditDelete(request, user, 'voucher_request', id, existingRequest)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
