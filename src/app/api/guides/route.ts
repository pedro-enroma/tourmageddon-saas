import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete } from '@/lib/audit-logger'

// GET - List all guides
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('guides')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching guides:', error)
      return NextResponse.json({ error: 'Failed to fetch guides' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new guide
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { first_name, last_name, email, phone_number, license_number, languages, active } = body

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
      .from('guides')
      .insert([{
        first_name,
        last_name,
        email,
        phone_number: phone_number || null,
        license_number: license_number || null,
        languages,
        active: active ?? true
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating guide:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A guide with this email already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create guide' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'guide', data.guide_id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update guide
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { guide_id, first_name, last_name, email, phone_number, license_number, languages, active } = body

    if (!guide_id) {
      return NextResponse.json({ error: 'guide_id is required' }, { status: 400 })
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
      .from('guides')
      .select('*')
      .eq('guide_id', guide_id)
      .single()

    const { data, error } = await supabase
      .from('guides')
      .update({
        first_name,
        last_name,
        email,
        phone_number: phone_number || null,
        license_number: license_number || null,
        languages,
        active
      })
      .eq('guide_id', guide_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating guide:', error)
      return NextResponse.json({ error: 'Failed to update guide' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
    }

    // Audit log
    if (oldData) {
      await auditUpdate(request, user, 'guide', guide_id, oldData, data)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete guide
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const guide_id = searchParams.get('guide_id')

    if (!guide_id) {
      return NextResponse.json({ error: 'guide_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('guides')
      .select('*')
      .eq('guide_id', guide_id)
      .single()

    const { error } = await supabase
      .from('guides')
      .delete()
      .eq('guide_id', guide_id)

    if (error) {
      console.error('Error deleting guide:', error)
      return NextResponse.json({ error: 'Failed to delete guide' }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await auditDelete(request, user, 'guide', guide_id, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
