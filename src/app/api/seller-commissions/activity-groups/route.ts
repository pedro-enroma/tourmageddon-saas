import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - List all activity groups
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('seller_activity_groups')
      .select('*')
      .order('name')

    if (error) {
      // Table might not exist yet
      if (error.code === '42P01') {
        return NextResponse.json({ data: [] })
      }
      console.error('Error fetching activity groups:', error)
      return NextResponse.json({ error: 'Failed to fetch activity groups' }, { status: 500 })
    }

    // Get all activities to normalize activity_ids
    // (in case groups were created with integer IDs instead of string activity_ids)
    const { data: allActivities } = await supabase
      .from('activities')
      .select('id, activity_id')

    const activityIdMap = new Map<string, string>()
    const activityIntIdMap = new Map<number, string>()
    allActivities?.forEach(a => {
      activityIdMap.set(a.activity_id, a.activity_id)
      activityIntIdMap.set(a.id, a.activity_id)
    })

    // Normalize activity_ids in each group
    const normalizedData = (data || []).map(group => {
      const normalizedIds = (group.activity_ids || []).map((id: string | number) => {
        // If it's already a valid string activity_id, keep it
        if (typeof id === 'string' && activityIdMap.has(id)) {
          return id
        }
        // If it's an integer, look up the string activity_id
        const intId = typeof id === 'number' ? id : parseInt(String(id), 10)
        if (!isNaN(intId) && activityIntIdMap.has(intId)) {
          return activityIntIdMap.get(intId)
        }
        // Return as string (might be a valid activity_id we don't have)
        return String(id)
      }).filter(Boolean)

      return {
        ...group,
        activity_ids: normalizedIds
      }
    })

    return NextResponse.json({ data: normalizedData })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new activity group
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { name, activity_ids } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    if (!Array.isArray(activity_ids) || activity_ids.length === 0) {
      return NextResponse.json({ error: 'activity_ids must be a non-empty array' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('seller_activity_groups')
      .insert([{ name, activity_ids }])
      .select()
      .single()

    if (error) {
      console.error('Error creating activity group:', error)
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A group with this name already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create activity group' }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update activity group
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, name, activity_ids } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('seller_activity_groups')
      .update({ name, activity_ids, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating activity group:', error)
      return NextResponse.json({ error: 'Failed to update activity group' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete activity group
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

    const { error } = await supabase
      .from('seller_activity_groups')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting activity group:', error)
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
