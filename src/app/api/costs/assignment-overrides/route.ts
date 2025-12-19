import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditDelete } from '@/lib/audit-logger'

// GET - Get assignment cost override
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const assignment_type = searchParams.get('assignment_type')
    const assignment_id = searchParams.get('assignment_id')

    const supabase = getServiceRoleClient()
    let query = supabase
      .from('assignment_cost_overrides')
      .select('*')
      .order('created_at', { ascending: false })

    if (assignment_type) {
      query = query.eq('assignment_type', assignment_type)
    }
    if (assignment_id) {
      query = query.eq('assignment_id', assignment_id)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching assignment cost overrides:', error)
      return NextResponse.json({ error: 'Failed to fetch assignment cost overrides' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create assignment cost override
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { assignment_type, assignment_id, override_amount, currency, reason } = body

    // Validation
    if (!assignment_type || !assignment_id) {
      return NextResponse.json({ error: 'assignment_type and assignment_id are required' }, { status: 400 })
    }

    if (!['guide', 'escort', 'headphone', 'printing'].includes(assignment_type)) {
      return NextResponse.json({ error: 'assignment_type must be guide, escort, headphone, or printing' }, { status: 400 })
    }

    if (override_amount === undefined || override_amount === null || override_amount < 0) {
      return NextResponse.json({ error: 'Valid override_amount is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Delete existing override for this assignment if exists (replace behavior)
    await supabase
      .from('assignment_cost_overrides')
      .delete()
      .eq('assignment_type', assignment_type)
      .eq('assignment_id', assignment_id)

    const { data, error } = await supabase
      .from('assignment_cost_overrides')
      .insert([{
        assignment_type,
        assignment_id,
        override_amount,
        currency: currency || 'EUR',
        reason: reason || null,
        created_by: user.id
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating assignment cost override:', error)
      return NextResponse.json({ error: 'Failed to create assignment cost override' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'assignment_cost_override', data.id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete assignment cost override
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const assignment_type = searchParams.get('assignment_type')
    const assignment_id = searchParams.get('assignment_id')

    const supabase = getServiceRoleClient()

    if (id) {
      // Delete by ID
      const { data: oldData } = await supabase
        .from('assignment_cost_overrides')
        .select('*')
        .eq('id', id)
        .single()

      const { error } = await supabase
        .from('assignment_cost_overrides')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting assignment cost override:', error)
        return NextResponse.json({ error: 'Failed to delete assignment cost override' }, { status: 500 })
      }

      if (oldData) {
        await auditDelete(request, user, 'assignment_cost_override', id, oldData)
      }
    } else if (assignment_type && assignment_id) {
      // Delete by assignment_type and assignment_id
      const { data: oldData } = await supabase
        .from('assignment_cost_overrides')
        .select('*')
        .eq('assignment_type', assignment_type)
        .eq('assignment_id', assignment_id)
        .single()

      const { error } = await supabase
        .from('assignment_cost_overrides')
        .delete()
        .eq('assignment_type', assignment_type)
        .eq('assignment_id', assignment_id)

      if (error) {
        console.error('Error deleting assignment cost override:', error)
        return NextResponse.json({ error: 'Failed to delete assignment cost override' }, { status: 500 })
      }

      if (oldData) {
        await auditDelete(request, user, 'assignment_cost_override', oldData.id, oldData)
      }
    } else {
      return NextResponse.json({ error: 'id or (assignment_type and assignment_id) is required' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
