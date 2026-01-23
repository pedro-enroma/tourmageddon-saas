import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// PUT - Update visibility_locked status for an availability
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { availability_id, visibility_locked } = body

    if (!availability_id) {
      return NextResponse.json({ error: 'availability_id is required' }, { status: 400 })
    }

    if (typeof visibility_locked !== 'boolean') {
      return NextResponse.json({ error: 'visibility_locked must be a boolean' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('activity_availability')
      .update({ visibility_locked })
      .eq('id', availability_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating visibility lock:', error)
      return NextResponse.json({ error: 'Failed to update visibility lock' }, { status: 500 })
    }

    console.log(`[Visibility Lock] Availability ${availability_id} visibility_locked set to ${visibility_locked} by ${user.email}`)

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Visibility lock error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
