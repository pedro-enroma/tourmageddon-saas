import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession, isAdmin } from '@/lib/supabase-server'
import { auditCreate, logAudit, getRequestContext } from '@/lib/audit-logger'

// GET - List all users
export async function GET() {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getServiceRoleClient()
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching users:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Invite new user (sends email with password setup link)
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only admins can create users
  const userIsAdmin = await isAdmin(user.id)
  if (!userIsAdmin) {
    return NextResponse.json({ error: 'Only administrators can create users' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { email, full_name, role } = body

    // Validation
    if (!email || !full_name) {
      return NextResponse.json({ error: 'email and full_name are required' }, { status: 400 })
    }

    const validRoles = ['admin', 'editor', 'viewer']
    if (role && !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be admin, editor, or viewer' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get the site URL for the redirect
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    // Invite user via Supabase - this sends an email with a magic link
    const { data: authData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/set-password`,
      data: {
        full_name,
        role: role || 'viewer'
      }
    })

    if (inviteError) {
      console.error('Error inviting user:', inviteError)
      if (inviteError.message.includes('already registered') || inviteError.message.includes('already been registered')) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: inviteError.message || 'Failed to invite user' }, { status: 500 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user invitation' }, { status: 500 })
    }

    // Create app_users record
    const { data, error } = await supabase
      .from('app_users')
      .insert([{
        id: authData.user.id,
        email,
        full_name,
        role: role || 'viewer',
        is_active: true,
        mfa_enabled: false,
        created_by: user.id
      }])
      .select()
      .single()

    if (error) {
      console.error('Error creating app_users record:', error)
      // Try to clean up the auth user
      await supabase.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await auditCreate(user.id, user.email, 'user', data.id, {
      email,
      full_name,
      role: role || 'viewer',
      invited: true
    }, ip, userAgent)

    return NextResponse.json({
      data,
      message: `Invitation email sent to ${email}`
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Update user (for bulk operations like marking all as inactive)
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userIsAdmin = await isAdmin(user.id)
  if (!userIsAdmin) {
    return NextResponse.json({ error: 'Only administrators can update users' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id, full_name, role, is_active } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    const { data: oldData } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', id)
      .single()

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (full_name) updateData.full_name = full_name
    if (role) updateData.role = role
    if (typeof is_active === 'boolean') updateData.is_active = is_active

    const { data, error } = await supabase
      .from('app_users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating user:', error)
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }

    const { ip, userAgent } = getRequestContext(request)
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      action: is_active === false ? 'USER_DISABLED' : is_active === true ? 'USER_ENABLED' : 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      changes: { old: oldData, new: data },
      ipAddress: ip,
      userAgent
    })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete user
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userIsAdmin = await isAdmin(user.id)
  if (!userIsAdmin) {
    return NextResponse.json({ error: 'Only administrators can delete users' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Prevent self-deletion
    if (id === user.id) {
      return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get user data for audit log
    const { data: userData } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', id)
      .single()

    // Delete from app_users
    const { error: deleteError } = await supabase
      .from('app_users')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting user from app_users:', deleteError)
      return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
    }

    // Delete from Supabase auth
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id)
    if (authDeleteError) {
      console.error('Error deleting user from auth:', authDeleteError)
      // User is already deleted from app_users, so we continue
    }

    const { ip, userAgent } = getRequestContext(request)
    await logAudit({
      userId: user.id,
      userEmail: user.email,
      action: 'DELETE',
      entityType: 'user',
      entityId: id,
      changes: { old: userData },
      ipAddress: ip,
      userAgent
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
