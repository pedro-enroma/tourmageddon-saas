import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditUpdate } from '@/lib/audit-logger'

// POST - Create user account for escort
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { escort_id, password } = body

    if (!escort_id || !password) {
      return NextResponse.json({ error: 'escort_id and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get escort data
    const { data: escort, error: escortError } = await supabase
      .from('escorts')
      .select('*')
      .eq('escort_id', escort_id)
      .single()

    if (escortError || !escort) {
      return NextResponse.json({ error: 'Escort not found' }, { status: 404 })
    }

    if (escort.user_id) {
      return NextResponse.json({ error: 'Escort already has a user account' }, { status: 409 })
    }

    // Create auth user with escort's email
    const { data: authData, error: authError2 } = await supabase.auth.admin.createUser({
      email: escort.email,
      password: password,
      email_confirm: true,
      user_metadata: {
        escort_id: escort_id,
        first_name: escort.first_name,
        last_name: escort.last_name,
        role: 'escort'
      }
    })

    if (authError2) {
      console.error('Error creating auth user:', authError2)
      if (authError2.message?.includes('already been registered')) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 })
    }

    // Update escort with user_id
    const { error: updateError } = await supabase
      .from('escorts')
      .update({
        user_id: authData.user.id,
        uses_app: true
      })
      .eq('escort_id', escort_id)

    if (updateError) {
      // Rollback - delete the auth user
      await supabase.auth.admin.deleteUser(authData.user.id)
      console.error('Error updating escort:', updateError)
      return NextResponse.json({ error: 'Failed to link user account' }, { status: 500 })
    }

    // Audit log
    await auditUpdate(request, user, 'escort', escort_id, escort, { ...escort, user_id: authData.user.id, uses_app: true })

    return NextResponse.json({
      success: true,
      user_id: authData.user.id,
      message: 'User account created successfully'
    }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PUT - Reset password for escort
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { escort_id, new_password } = body

    if (!escort_id || !new_password) {
      return NextResponse.json({ error: 'escort_id and new_password are required' }, { status: 400 })
    }

    if (new_password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get escort data
    const { data: escort, error: escortError } = await supabase
      .from('escorts')
      .select('*')
      .eq('escort_id', escort_id)
      .single()

    if (escortError || !escort) {
      return NextResponse.json({ error: 'Escort not found' }, { status: 404 })
    }

    if (!escort.user_id) {
      return NextResponse.json({ error: 'Escort does not have a user account' }, { status: 400 })
    }

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      escort.user_id,
      { password: new_password }
    )

    if (updateError) {
      console.error('Error resetting password:', updateError)
      return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully'
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Remove user account from escort (unlink)
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const escort_id = searchParams.get('escort_id')

    if (!escort_id) {
      return NextResponse.json({ error: 'escort_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get escort data
    const { data: escort, error: escortError } = await supabase
      .from('escorts')
      .select('*')
      .eq('escort_id', escort_id)
      .single()

    if (escortError || !escort) {
      return NextResponse.json({ error: 'Escort not found' }, { status: 404 })
    }

    if (!escort.user_id) {
      return NextResponse.json({ error: 'Escort does not have a user account' }, { status: 400 })
    }

    // Delete auth user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(escort.user_id)

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError)
      return NextResponse.json({ error: 'Failed to delete user account' }, { status: 500 })
    }

    // Update escort to remove user_id
    const { error: updateError } = await supabase
      .from('escorts')
      .update({ user_id: null })
      .eq('escort_id', escort_id)

    if (updateError) {
      console.error('Error updating escort:', updateError)
    }

    // Audit log
    await auditUpdate(request, user, 'escort', escort_id, escort, { ...escort, user_id: null })

    return NextResponse.json({
      success: true,
      message: 'User account removed successfully'
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
