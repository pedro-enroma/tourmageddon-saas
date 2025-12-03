import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, auditDelete, getRequestContext } from '@/lib/audit-logger'

// POST - Create new meeting point
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, description, address, google_maps_url, instructions } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('meeting_points')
      .insert([{
        name,
        description: description || null,
        address: address || null,
        google_maps_url: google_maps_url || null,
        instructions: instructions || null
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating meeting point:', error)
      return NextResponse.json({ error: 'Failed to create meeting point' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await auditCreate(user.id, user.email, 'meeting_point', data.id, data, ip, userAgent)

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Meeting point creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update meeting point
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, name, description, address, google_maps_url, instructions } = body

    if (!id) {
      return NextResponse.json({ error: 'Meeting point ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get old data for audit
    const { data: oldData } = await supabase
      .from('meeting_points')
      .select('*')
      .eq('id', id)
      .single()

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description || null
    if (address !== undefined) updateData.address = address || null
    if (google_maps_url !== undefined) updateData.google_maps_url = google_maps_url || null
    if (instructions !== undefined) updateData.instructions = instructions || null

    const { data, error } = await supabase
      .from('meeting_points')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating meeting point:', error)
      return NextResponse.json({ error: 'Failed to update meeting point' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await auditUpdate(user.id, user.email, 'meeting_point', id, oldData, data, ip, userAgent)

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Meeting point update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Delete meeting point
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Meeting point ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get old data for audit
    const { data: oldData } = await supabase
      .from('meeting_points')
      .select('*')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('meeting_points')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting meeting point:', error)
      return NextResponse.json({ error: 'Failed to delete meeting point' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await auditDelete(user.id, user.email, 'meeting_point', id, oldData, ip, userAgent)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Meeting point deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
