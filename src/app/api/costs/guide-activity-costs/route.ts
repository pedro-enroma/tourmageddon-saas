import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete } from '@/lib/audit-logger'

// GET - List guide activity costs
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const guide_id = searchParams.get('guide_id')
    const activity_id = searchParams.get('activity_id')

    const supabase = getServiceRoleClient()
    let query = supabase
      .from('guide_activity_costs')
      .select('*')
      .order('created_at', { ascending: false })

    if (guide_id) {
      query = query.eq('guide_id', guide_id)
    }
    if (activity_id) {
      query = query.eq('activity_id', activity_id)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching guide activity costs:', error)
      return NextResponse.json({ error: 'Failed to fetch guide activity costs' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new guide activity cost
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { guide_id, activity_id, cost_amount, currency, notes } = body

    // Validation - activity_id is required, guide_id is optional (null = global cost for all guides)
    if (!activity_id) {
      return NextResponse.json({ error: 'activity_id is required' }, { status: 400 })
    }

    if (cost_amount === undefined || cost_amount === null || cost_amount < 0) {
      return NextResponse.json({ error: 'Valid cost_amount is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('guide_activity_costs')
      .insert([{
        guide_id: guide_id || null,  // null means global cost for all guides
        activity_id,
        cost_amount,
        currency: currency || 'EUR',
        notes: notes || null
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating guide activity cost:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A cost entry for this guide and activity already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create guide activity cost' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'guide_activity_cost', data.id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update guide activity cost
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, guide_id, activity_id, cost_amount, currency, notes } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (cost_amount !== undefined && cost_amount < 0) {
      return NextResponse.json({ error: 'cost_amount cannot be negative' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('guide_activity_costs')
      .select('*')
      .eq('id', id)
      .single()

    const updateData: Record<string, unknown> = {}
    if (guide_id !== undefined) updateData.guide_id = guide_id
    if (activity_id !== undefined) updateData.activity_id = activity_id
    if (cost_amount !== undefined) updateData.cost_amount = cost_amount
    if (currency !== undefined) updateData.currency = currency
    if (notes !== undefined) updateData.notes = notes

    const { data, error } = await supabase
      .from('guide_activity_costs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating guide activity cost:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A cost entry for this guide and activity already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to update guide activity cost' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Guide activity cost not found' }, { status: 404 })
    }

    // Audit log
    if (oldData) {
      await auditUpdate(request, user, 'guide_activity_cost', id, oldData, data)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete guide activity cost
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

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('guide_activity_costs')
      .select('*')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('guide_activity_costs')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting guide activity cost:', error)
      return NextResponse.json({ error: 'Failed to delete guide activity cost' }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await auditDelete(request, user, 'guide_activity_cost', id, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
