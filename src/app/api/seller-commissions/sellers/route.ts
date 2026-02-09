import { NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - List all sellers from the sellers table
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()

    const { data, error } = await supabase
      .from('sellers')
      .select('id, title')
      .order('title')

    if (error) {
      console.error('Error fetching sellers:', error)
      return NextResponse.json({ error: 'Failed to fetch sellers' }, { status: 500 })
    }

    // Return seller titles (names)
    const sellers = (data || []).map(s => s.title).filter(Boolean)

    return NextResponse.json({ sellers, sellersData: data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
