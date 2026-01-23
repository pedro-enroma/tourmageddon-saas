import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// PUT - Update guide assignment status
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { assignment_id, status } = body

    if (!assignment_id) {
      return NextResponse.json({ error: 'assignment_id is required' }, { status: 400 })
    }

    const validStatuses = ['confirmed', 'extra', 'to_be_confirmed']
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('guide_assignments')
      .update({ status })
      .eq('assignment_id', assignment_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating guide assignment status:', error)
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }

    console.log(`[Guide Assignment] Status updated to ${status} for assignment ${assignment_id} by ${user.email}`)

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Guide assignment status error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
