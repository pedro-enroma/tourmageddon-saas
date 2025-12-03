import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete } from '@/lib/audit-logger'

// GET - List all escorts
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('escorts')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching escorts:', error)
      return NextResponse.json({ error: 'Failed to fetch escorts' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new escort
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { first_name, last_name, email, phone_number, languages, active } = body

    // Validation
    if (!first_name || !last_name || !email) {
      return NextResponse.json({ error: 'First name, last name, and email are required' }, { status: 400 })
    }

    if (!languages || languages.length === 0) {
      return NextResponse.json({ error: 'At least one language is required' }, { status: 400 })
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('escorts')
      .insert([{
        first_name,
        last_name,
        email,
        phone_number: phone_number || null,
        languages,
        active: active ?? true
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating escort:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'An escort with this email already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create escort' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'escort', data.escort_id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update escort
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { escort_id, first_name, last_name, email, phone_number, languages, active } = body

    if (!escort_id) {
      return NextResponse.json({ error: 'escort_id is required' }, { status: 400 })
    }

    // Validation
    if (!first_name || !last_name || !email) {
      return NextResponse.json({ error: 'First name, last name, and email are required' }, { status: 400 })
    }

    if (!languages || languages.length === 0) {
      return NextResponse.json({ error: 'At least one language is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('escorts')
      .select('*')
      .eq('escort_id', escort_id)
      .single()

    const { data, error } = await supabase
      .from('escorts')
      .update({
        first_name,
        last_name,
        email,
        phone_number: phone_number || null,
        languages,
        active
      })
      .eq('escort_id', escort_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating escort:', error)
      return NextResponse.json({ error: 'Failed to update escort' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Escort not found' }, { status: 404 })
    }

    // Audit log
    if (oldData) {
      await auditUpdate(request, user, 'escort', escort_id, oldData, data)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete escort
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const escort_id = searchParams.get('escort_id')

    if (!escort_id) {
      return NextResponse.json({ error: 'escort_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('escorts')
      .select('*')
      .eq('escort_id', escort_id)
      .single()

    const { error } = await supabase
      .from('escorts')
      .delete()
      .eq('escort_id', escort_id)

    if (error) {
      console.error('Error deleting escort:', error)
      return NextResponse.json({ error: 'Failed to delete escort' }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await auditDelete(request, user, 'escort', escort_id, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
