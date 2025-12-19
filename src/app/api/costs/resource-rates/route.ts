import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete } from '@/lib/audit-logger'

// GET - List resource rates
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const resource_type = searchParams.get('resource_type')
    const resource_id = searchParams.get('resource_id')

    const supabase = getServiceRoleClient()
    let query = supabase
      .from('resource_rates')
      .select('*')
      .order('created_at', { ascending: false })

    if (resource_type) {
      query = query.eq('resource_type', resource_type)
    }
    if (resource_id) {
      query = query.eq('resource_id', resource_id)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching resource rates:', error)
      return NextResponse.json({ error: 'Failed to fetch resource rates' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new resource rate
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { resource_type, resource_id, rate_type, rate_amount, currency, notes } = body

    // Validation
    if (!resource_type || !resource_id) {
      return NextResponse.json({ error: 'resource_type and resource_id are required' }, { status: 400 })
    }

    if (!['escort', 'headphone', 'printing'].includes(resource_type)) {
      return NextResponse.json({ error: 'resource_type must be escort, headphone, or printing' }, { status: 400 })
    }

    if (!rate_type || !['daily', 'per_pax'].includes(rate_type)) {
      return NextResponse.json({ error: 'rate_type must be daily or per_pax' }, { status: 400 })
    }

    // Validate rate_type matches resource_type
    if (resource_type === 'escort' && rate_type !== 'daily') {
      return NextResponse.json({ error: 'Escorts must use daily rate type' }, { status: 400 })
    }
    if (['headphone', 'printing'].includes(resource_type) && rate_type !== 'per_pax') {
      return NextResponse.json({ error: 'Headphones and printing must use per_pax rate type' }, { status: 400 })
    }

    if (rate_amount === undefined || rate_amount === null || rate_amount < 0) {
      return NextResponse.json({ error: 'Valid rate_amount is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('resource_rates')
      .insert([{
        resource_type,
        resource_id,
        rate_type,
        rate_amount,
        currency: currency || 'EUR',
        notes: notes || null
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating resource rate:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A rate entry for this resource already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create resource rate' }, { status: 500 })
    }

    // Audit log
    await auditCreate(request, user, 'resource_rate', data.id, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update resource rate
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, rate_amount, currency, notes } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (rate_amount !== undefined && rate_amount < 0) {
      return NextResponse.json({ error: 'rate_amount cannot be negative' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('resource_rates')
      .select('*')
      .eq('id', id)
      .single()

    const updateData: Record<string, unknown> = {}
    if (rate_amount !== undefined) updateData.rate_amount = rate_amount
    if (currency !== undefined) updateData.currency = currency
    if (notes !== undefined) updateData.notes = notes

    const { data, error } = await supabase
      .from('resource_rates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating resource rate:', error)
      return NextResponse.json({ error: 'Failed to update resource rate' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Resource rate not found' }, { status: 404 })
    }

    // Audit log
    if (oldData) {
      await auditUpdate(request, user, 'resource_rate', id, oldData, data)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete resource rate
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
      .from('resource_rates')
      .select('*')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('resource_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting resource rate:', error)
      return NextResponse.json({ error: 'Failed to delete resource rate' }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await auditDelete(request, user, 'resource_rate', id, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
