import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete } from '@/lib/audit-logger'

// GET - List all partners
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching partners:', error)
      return NextResponse.json({ error: 'Failed to fetch partners' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new partner
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, email, phone_number, active, notes, available_times } = body

    // Validation
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('partners')
      .insert([{
        name,
        email,
        phone_number: phone_number || null,
        active: active ?? true,
        notes: notes || null,
        available_times: available_times || ['09:00', '10:00', '11:00', '12:00']
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating partner:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A partner with this email already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'partner', data.partner_id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update partner
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { partner_id, name, email, phone_number, active, notes, available_times } = body

    if (!partner_id) {
      return NextResponse.json({ error: 'partner_id is required' }, { status: 400 })
    }

    // Validation
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('partners')
      .select('*')
      .eq('partner_id', partner_id)
      .single()

    const { data, error } = await supabase
      .from('partners')
      .update({
        name,
        email,
        phone_number: phone_number || null,
        active,
        notes: notes || null,
        available_times: available_times || ['09:00', '10:00', '11:00', '12:00']
      })
      .eq('partner_id', partner_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating partner:', error)
      return NextResponse.json({ error: 'Failed to update partner' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 })
    }

    // Audit log
    if (oldData) {
      await auditUpdate(request, user, 'partner', partner_id, oldData, data)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete partner
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const partner_id = searchParams.get('partner_id')

    if (!partner_id) {
      return NextResponse.json({ error: 'partner_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Check if partner is linked to any category
    const { data: linkedCategories } = await supabase
      .from('ticket_categories')
      .select('id, name')
      .eq('partner_id', partner_id)

    if (linkedCategories && linkedCategories.length > 0) {
      const categoryNames = linkedCategories.map(c => c.name).join(', ')
      return NextResponse.json({
        error: `Cannot delete partner. It is linked to categories: ${categoryNames}. Remove the link first.`
      }, { status: 400 })
    }

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('partners')
      .select('*')
      .eq('partner_id', partner_id)
      .single()

    const { error } = await supabase
      .from('partners')
      .delete()
      .eq('partner_id', partner_id)

    if (error) {
      console.error('Error deleting partner:', error)
      return NextResponse.json({ error: 'Failed to delete partner' }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await auditDelete(request, user, 'partner', partner_id, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
