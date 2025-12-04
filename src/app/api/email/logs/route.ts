import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - Fetch email logs for a specific date
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')

    if (!date) {
      return NextResponse.json({ error: 'date parameter is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get start and end of the day
    const startOfDay = `${date}T00:00:00`
    const endOfDay = `${date}T23:59:59`

    const { data, error } = await supabase
      .from('email_logs')
      .select('*')
      .gte('sent_at', startOfDay)
      .lte('sent_at', endOfDay)
      .order('sent_at', { ascending: false })

    if (error) {
      console.error('Error fetching email logs:', error)
      return NextResponse.json({ error: 'Failed to fetch email logs' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Email logs fetch error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
