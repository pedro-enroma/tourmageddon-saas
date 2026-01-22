import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditUpdate } from '@/lib/audit-logger'

// POST - Create user account for guide
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { guide_id, password } = body

    if (!guide_id || !password) {
      return NextResponse.json({ error: 'guide_id and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get guide data
    const { data: guide, error: guideError } = await supabase
      .from('guides')
      .select('*')
      .eq('guide_id', guide_id)
      .single()

    if (guideError || !guide) {
      return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
    }

    if (guide.user_id) {
      return NextResponse.json({ error: 'Guide already has a user account' }, { status: 409 })
    }

    // Create auth user with guide's email
    const { data: authData, error: authError2 } = await supabase.auth.admin.createUser({
      email: guide.email,
      password: password,
      email_confirm: true,
      user_metadata: {
        guide_id: guide_id,
        first_name: guide.first_name,
        last_name: guide.last_name,
        role: 'guide'
      }
    })

    if (authError2) {
      console.error('Error creating auth user:', authError2)
      if (authError2.message?.includes('already been registered')) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 })
    }

    // Update guide with user_id
    const { error: updateError } = await supabase
      .from('guides')
      .update({
        user_id: authData.user.id,
        uses_app: true
      })
      .eq('guide_id', guide_id)

    if (updateError) {
      // Rollback - delete the auth user
      await supabase.auth.admin.deleteUser(authData.user.id)
      console.error('Error updating guide:', updateError)
      return NextResponse.json({ error: 'Failed to link user account' }, { status: 500 })
    }

    // Audit log
    await auditUpdate(request, user, 'guide', guide_id, guide, { ...guide, user_id: authData.user.id, uses_app: true })

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

// PUT - Reset password for guide
export async function PUT(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { guide_id, new_password } = body

    if (!guide_id || !new_password) {
      return NextResponse.json({ error: 'guide_id and new_password are required' }, { status: 400 })
    }

    if (new_password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get guide data
    const { data: guide, error: guideError } = await supabase
      .from('guides')
      .select('*')
      .eq('guide_id', guide_id)
      .single()

    if (guideError || !guide) {
      return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
    }

    if (!guide.user_id) {
      return NextResponse.json({ error: 'Guide does not have a user account' }, { status: 400 })
    }

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      guide.user_id,
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

// DELETE - Remove user account from guide (unlink)
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const guide_id = searchParams.get('guide_id')

    if (!guide_id) {
      return NextResponse.json({ error: 'guide_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get guide data
    const { data: guide, error: guideError } = await supabase
      .from('guides')
      .select('*')
      .eq('guide_id', guide_id)
      .single()

    if (guideError || !guide) {
      return NextResponse.json({ error: 'Guide not found' }, { status: 404 })
    }

    if (!guide.user_id) {
      return NextResponse.json({ error: 'Guide does not have a user account' }, { status: 400 })
    }

    // Delete auth user
    const { error: deleteError } = await supabase.auth.admin.deleteUser(guide.user_id)

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError)
      return NextResponse.json({ error: 'Failed to delete user account' }, { status: 500 })
    }

    // Update guide to remove user_id
    const { error: updateError } = await supabase
      .from('guides')
      .update({ user_id: null })
      .eq('guide_id', guide_id)

    if (updateError) {
      console.error('Error updating guide:', updateError)
    }

    // Audit log
    await auditUpdate(request, user, 'guide', guide_id, guide, { ...guide, user_id: null })

    return NextResponse.json({
      success: true,
      message: 'User account removed successfully'
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
