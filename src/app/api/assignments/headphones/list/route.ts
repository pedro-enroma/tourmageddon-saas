import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - List headphone assignments for given headphone IDs
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const headphoneIds = searchParams.get('headphone_ids')?.split(',').filter(Boolean)

    if (!headphoneIds || headphoneIds.length === 0) {
      return NextResponse.json({ error: 'headphone_ids parameter is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('headphone_assignments')
      .select('assignment_id, headphone_id, activity_availability_id')
      .in('headphone_id', headphoneIds)

    if (error) {
      console.error('Error fetching headphone assignments:', error)
      return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
