import { NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - Fetch headphones and printing resources
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()

    const [headphonesRes, printingRes] = await Promise.all([
      supabase
        .from('headphones')
        .select('*')
        .eq('active', true)
        .order('name'),
      supabase
        .from('printing')
        .select('*')
        .eq('active', true)
        .order('name')
    ])

    if (headphonesRes.error) {
      console.error('Error fetching headphones:', headphonesRes.error)
      return NextResponse.json({ error: 'Failed to fetch headphones' }, { status: 500 })
    }

    if (printingRes.error) {
      console.error('Error fetching printing:', printingRes.error)
      return NextResponse.json({ error: 'Failed to fetch printing' }, { status: 500 })
    }

    return NextResponse.json({
      headphones: headphonesRes.data || [],
      printing: printingRes.data || []
    })
  } catch (err) {
    console.error('Resources fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
