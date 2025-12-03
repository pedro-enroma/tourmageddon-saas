import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditUpdate, getRequestContext } from '@/lib/audit-logger'

// PUT - Upsert calendar setting (excluded activities or activity groups)
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { setting_key, setting_value } = body

    if (!setting_key || setting_value === undefined) {
      return NextResponse.json({ error: 'setting_key and setting_value are required' }, { status: 400 })
    }

    // Validate setting_key
    const validKeys = ['excluded_activity_ids', 'activity_groups']
    if (!validKeys.includes(setting_key)) {
      return NextResponse.json({ error: 'Invalid setting_key' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get existing setting for audit
    const { data: oldData } = await supabase
      .from('guide_calendar_settings')
      .select('*')
      .eq('setting_key', setting_key)
      .single()

    const { data, error } = await supabase
      .from('guide_calendar_settings')
      .upsert({
        setting_key,
        setting_value,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_key'
      })
      .select()
      .single()

    if (error) {
      console.error('Error updating calendar setting:', error)
      return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    if (oldData) {
      await auditUpdate(user.id, user.email, 'calendar_setting', setting_key, oldData, data, ip, userAgent)
    } else {
      await auditCreate(user.id, user.email, 'calendar_setting', setting_key, data, ip, userAgent)
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Calendar settings error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
