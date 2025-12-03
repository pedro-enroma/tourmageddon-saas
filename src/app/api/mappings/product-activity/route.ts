import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditDelete } from '@/lib/audit-logger'

// GET - List all product-activity mappings
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('product_activity_mappings')
      .select('*, activities(title), ticket_categories(name)')
      .order('product_name', { ascending: true })

    if (error) {
      console.error('Error fetching product-activity mappings:', error)
      return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new product-activity mapping
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { product_name, activity_id, category_id } = body

    if (!product_name) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('product_activity_mappings')
      .insert([{
        product_name,
        activity_id: activity_id || null,
        category_id: category_id || null
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating product-activity mapping:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A mapping for this product already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 })
    }

    await auditCreate(request, user, 'product_activity_mapping', data.id || data.product_name, data)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete product-activity mapping
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const product_name = searchParams.get('product_name')

    const supabase = getServiceRoleClient()

    let query = supabase.from('product_activity_mappings').delete()
    let oldDataQuery = supabase.from('product_activity_mappings').select('*')

    if (id) {
      query = query.eq('id', id)
      oldDataQuery = oldDataQuery.eq('id', id)
    } else if (product_name) {
      query = query.eq('product_name', product_name)
      oldDataQuery = oldDataQuery.eq('product_name', product_name)
    } else {
      return NextResponse.json({ error: 'id or product_name is required' }, { status: 400 })
    }

    const { data: oldData } = await oldDataQuery.single()

    const { error } = await query

    if (error) {
      console.error('Error deleting product-activity mapping:', error)
      return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 })
    }

    if (oldData) {
      await auditDelete(request, user, 'product_activity_mapping', id || product_name || '', oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
