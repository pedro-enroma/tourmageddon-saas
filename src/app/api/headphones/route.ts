import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete } from '@/lib/audit-logger'

// GET - List all headphones
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('headphones')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching headphones:', error)
      return NextResponse.json({ error: 'Failed to fetch headphones' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new headphone
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
      .from('headphones')
      .insert([{
        name,
        email: email || null,
        phone_number: phone_number || null,
        active: active ?? true
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating headphone:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A headphone contact with this email already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create headphone' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'headphone', data.headphone_id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update headphone
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { headphone_id, name, email, phone_number, active } = body

    if (!headphone_id) {
      return NextResponse.json({ error: 'headphone_id is required' }, { status: 400 })
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
      .from('headphones')
      .select('*')
      .eq('headphone_id', headphone_id)
      .single()

    const { data, error } = await supabase
      .from('headphones')
      .update({
        name,
        email: email || null,
        phone_number: phone_number || null,
        active
      })
      .eq('headphone_id', headphone_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating headphone:', error)
      return NextResponse.json({ error: 'Failed to update headphone' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Headphone not found' }, { status: 404 })
    }

    // Audit log
    if (oldData) {
      await auditUpdate(request, user, 'headphone', headphone_id, oldData, data)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete headphone
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const headphone_id = searchParams.get('headphone_id')

    if (!headphone_id) {
      return NextResponse.json({ error: 'headphone_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('headphones')
      .select('*')
      .eq('headphone_id', headphone_id)
      .single()

    const { error } = await supabase
      .from('headphones')
      .delete()
      .eq('headphone_id', headphone_id)

    if (error) {
      console.error('Error deleting headphone:', error)
      return NextResponse.json({ error: 'Failed to delete headphone' }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await auditDelete(request, user, 'headphone', headphone_id, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
