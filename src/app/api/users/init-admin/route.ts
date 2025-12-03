import { NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// This endpoint creates the first admin user
// It only works if there are no users in app_users table yet
export async function POST() {
  try {
    // Verify the user is authenticated
    const { user, error: authError } = await verifySession()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized - must be logged in' }, { status: 401 })
    }

    const supabase = getServiceRoleClient()

    // Check if any admin users exist
    const { data: existingUsers, error: checkError } = await supabase
      .from('app_users')
      .select('id')
      .limit(1)

    if (checkError) {
      console.error('Error checking existing users:', checkError)
      return NextResponse.json({ error: 'Failed to check existing users' }, { status: 500 })
    }

    // If users already exist, don't allow this endpoint
    if (existingUsers && existingUsers.length > 0) {
      return NextResponse.json({
        error: 'Admin user already exists. Use the User Management page to add more users.'
      }, { status: 403 })
    }

    // Create the first admin user with the currently logged-in user's details
    const fullName = user.email?.split('@')[0] || 'Admin'
    const { data, error } = await supabase
      .from('app_users')
      .insert([{
        id: user.id,
        email: user.email,
        full_name: fullName,
        role: 'admin',
        is_active: true,
        mfa_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating admin user:', error)
      return NextResponse.json({ error: 'Failed to create admin user: ' + error.message }, { status: 500 })
    }

    // Log this action
    await supabase.from('audit_logs').insert([{
      user_id: user.id,
      user_email: user.email,
      action: 'USER_CREATED',
      entity_type: 'user',
      entity_id: user.id,
      changes: { new: { email: user.email, role: 'admin', is_first_admin: true } },
      created_at: new Date().toISOString()
    }])

    return NextResponse.json({
      success: true,
      message: 'Admin user created successfully',
      data
    }, { status: 201 })

  } catch (err) {
    console.error('Init admin error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
