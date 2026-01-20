import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - Fetch notes for a date range or specific context
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const localDate = searchParams.get('localDate')
    const activityAvailabilityId = searchParams.get('activityAvailabilityId')
    const guideId = searchParams.get('guideId')
    const escortId = searchParams.get('escortId')
    const voucherId = searchParams.get('voucherId')

    const supabase = getServiceRoleClient()

    let query = supabase
      .from('operation_notes')
      .select(`
        *,
        replies:operation_note_replies(
          id,
          content,
          created_by,
          created_by_email,
          created_at
        )
      `)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    // Filter by date range
    if (startDate && endDate) {
      query = query.gte('local_date', startDate).lte('local_date', endDate)
    } else if (localDate) {
      query = query.eq('local_date', localDate)
    }

    // Filter by specific context
    if (activityAvailabilityId) {
      query = query.eq('activity_availability_id', activityAvailabilityId)
    }
    if (guideId) {
      query = query.eq('guide_id', guideId)
    }
    if (escortId) {
      query = query.eq('escort_id', escortId)
    }
    if (voucherId) {
      query = query.eq('voucher_id', voucherId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching notes:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filter out deleted replies
    const notesWithFilteredReplies = data?.map(note => ({
      ...note,
      replies: (note.replies || []).filter((r: { is_deleted?: boolean }) => !r.is_deleted)
    }))

    return NextResponse.json({ data: notesWithFilteredReplies })
  } catch (err) {
    console.error('Error fetching notes:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Create a new note
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      local_date,
      activity_availability_id,
      guide_id,
      escort_id,
      voucher_id,
      content,
      note_type = 'general'
    } = body

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    // At least one context must be provided
    if (!local_date && !activity_availability_id && !guide_id && !escort_id && !voucher_id) {
      return NextResponse.json({ error: 'At least one context (date, slot, guide, escort, or voucher) is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('operation_notes')
      .insert({
        local_date,
        activity_availability_id,
        guide_id,
        escort_id,
        voucher_id,
        content: content.trim(),
        note_type,
        created_by: user.id,
        created_by_email: user.email
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating note:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Error creating note:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PUT - Update a note
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { id, content, note_type } = body

    if (!id) {
      return NextResponse.json({ error: 'Note ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const updateData: Record<string, unknown> = {}
    if (content !== undefined) updateData.content = content.trim()
    if (note_type !== undefined) updateData.note_type = note_type

    const { data, error } = await supabase
      .from('operation_notes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating note:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error updating note:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Soft delete a note
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Note ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { error } = await supabase
      .from('operation_notes')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('Error deleting note:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting note:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
