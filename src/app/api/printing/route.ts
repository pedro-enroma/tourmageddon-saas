import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete } from '@/lib/audit-logger'

// GET - List all printing contacts
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('printing')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching printing:', error)
      return NextResponse.json({ error: 'Failed to fetch printing contacts' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new printing contact
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, email, phone_number, active } = body

    // Validation
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Email format validation (if provided)
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
      }
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('printing')
      .insert([{
        name,
        email: email || null,
        phone_number: phone_number || null,
        active: active ?? true
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating printing:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A printing contact with this email already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create printing contact' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'printing', data.printing_id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update printing contact
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { printing_id, name, email, phone_number, active } = body

    if (!printing_id) {
      return NextResponse.json({ error: 'printing_id is required' }, { status: 400 })
    }

    // Validation
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Email format validation (if provided)
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
      }
    }

    const supabase = getServiceRoleClient()

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('printing')
      .select('*')
      .eq('printing_id', printing_id)
      .single()

    const { data, error } = await supabase
      .from('printing')
      .update({
        name,
        email: email || null,
        phone_number: phone_number || null,
        active
      })
      .eq('printing_id', printing_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating printing:', error)
      return NextResponse.json({ error: 'Failed to update printing contact' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Printing contact not found' }, { status: 404 })
    }

    // Audit log
    if (oldData) {
      await auditUpdate(request, user, 'printing', printing_id, oldData, data)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete printing contact
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const printing_id = searchParams.get('printing_id')

    if (!printing_id) {
      return NextResponse.json({ error: 'printing_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('printing')
      .select('*')
      .eq('printing_id', printing_id)
      .single()

    const { error } = await supabase
      .from('printing')
      .delete()
      .eq('printing_id', printing_id)

    if (error) {
      console.error('Error deleting printing:', error)
      return NextResponse.json({ error: 'Failed to delete printing contact' }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await auditDelete(request, user, 'printing', printing_id, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
