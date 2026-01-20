import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// POST - Create a reply to a note
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { note_id, content } = body

    if (!note_id) {
      return NextResponse.json({ error: 'Note ID is required' }, { status: 400 })
    }

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Verify note exists and is not deleted
    const { data: note } = await supabase
      .from('operation_notes')
      .select('id')
      .eq('id', note_id)
      .eq('is_deleted', false)
      .single()

    if (!note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('operation_note_replies')
      .insert({
        note_id,
        content: content.trim(),
        created_by: user.id,
        created_by_email: user.email
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating reply:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Error creating reply:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Soft delete a reply
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Reply ID is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { error } = await supabase
      .from('operation_note_replies')
      .update({ is_deleted: true })
      .eq('id', id)

    if (error) {
      console.error('Error deleting reply:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error deleting reply:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
