import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete, getRequestContext } from '@/lib/audit-logger'

// GET - List tour groups
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('tour_groups')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching tour groups:', error)
      return NextResponse.json({ error: 'Failed to fetch tour groups' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Tour groups fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create new tour group (or upsert)
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, name, tour_ids, upsert } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)

    let data, error

    if (upsert && id) {
      // Upsert mode (for migration)
      const result = await supabase
        .from('tour_groups')
        .upsert({
          id,
          name,
          tour_ids: tour_ids || []
        })
        .select()
        .single()

      data = result.data
      error = result.error
    } else {
      // Regular insert
      const result = await supabase
        .from('tour_groups')
        .insert({
          name,
          tour_ids: tour_ids || []
        })
        .select()
        .single()

      data = result.data
      error = result.error
    }

    if (error) {
      console.error('Error creating tour group:', error)
      return NextResponse.json({ error: 'Failed to create tour group' }, { status: 500 })
    }

    await auditCreate(user.id, user.email, 'tour_group', data.id, data, ip, userAgent)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Tour group creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update tour group
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, name, tour_ids } = body

    if (!id) {
      return NextResponse.json({ error: 'Tour group ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)

    // Get old data for audit
    const { data: oldData } = await supabase
      .from('tour_groups')
      .select('*')
      .eq('id', id)
      .single()

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updateData.name = name
    if (tour_ids !== undefined) updateData.tour_ids = tour_ids

    const { data, error } = await supabase
      .from('tour_groups')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating tour group:', error)
      return NextResponse.json({ error: 'Failed to update tour group' }, { status: 500 })
    }

    await auditUpdate(user.id, user.email, 'tour_group', id, oldData, data, ip, userAgent)

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Tour group update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete tour group
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Tour group ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)

    // Get old data for audit
    const { data: oldData } = await supabase
      .from('tour_groups')
      .select('*')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('tour_groups')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting tour group:', error)
      return NextResponse.json({ error: 'Failed to delete tour group' }, { status: 500 })
    }

    await auditDelete(user.id, user.email, 'tour_group', id, oldData, ip, userAgent)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Tour group deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
