import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditDelete, getRequestContext } from '@/lib/audit-logger'

// POST - Create guide/escort assignments for activity_availability
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { activity_availability_id, guide_ids, escort_ids } = body

    if (!activity_availability_id) {
      return NextResponse.json({ error: 'activity_availability_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)
    const results: { guides: unknown[]; escorts: unknown[] } = { guides: [], escorts: [] }

    // Insert guide assignments
    if (guide_ids && guide_ids.length > 0) {
      const guideAssignments = guide_ids.map((guide_id: string) => ({
        guide_id,
        activity_availability_id
      }))

      const { data: guideData, error: guideError } = await supabase
        .from('guide_assignments')
        .insert(guideAssignments)
        .select()

      if (guideError) {
        console.error('Error creating guide assignments:', guideError)
        // Continue anyway, some might be duplicates
      } else {
        results.guides = guideData || []
        for (const assignment of guideData || []) {
          await auditCreate(user.id, user.email, 'guide_assignment', assignment.assignment_id, assignment, ip, userAgent)
        }
      }
    }

    // Insert escort assignments
    if (escort_ids && escort_ids.length > 0) {
      const escortAssignments = escort_ids.map((escort_id: string) => ({
        escort_id,
        activity_availability_id
      }))

      const { data: escortData, error: escortError } = await supabase
        .from('escort_assignments')
        .insert(escortAssignments)
        .select()

      if (escortError) {
        console.error('Error creating escort assignments:', escortError)
        // Continue anyway, some might be duplicates
      } else {
        results.escorts = escortData || []
        for (const assignment of escortData || []) {
          await auditCreate(user.id, user.email, 'escort_assignment', assignment.assignment_id, assignment, ip, userAgent)
        }
      }
    }

    return NextResponse.json({ data: results }, { status: 201 })
  } catch (err) {
    console.error('Assignment creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Remove guide/escort assignments for activity_availability
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const activity_availability_id = searchParams.get('activity_availability_id')
    const guide_ids = searchParams.get('guide_ids')?.split(',').filter(Boolean)
    const escort_ids = searchParams.get('escort_ids')?.split(',').filter(Boolean)

    if (!activity_availability_id) {
      return NextResponse.json({ error: 'activity_availability_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)

    // Delete guide assignments
    if (guide_ids && guide_ids.length > 0) {
      // Get old data for audit
      const { data: oldGuideData } = await supabase
        .from('guide_assignments')
        .select('*')
        .eq('activity_availability_id', activity_availability_id)
        .in('guide_id', guide_ids)

      const { error: guideError } = await supabase
        .from('guide_assignments')
        .delete()
        .eq('activity_availability_id', activity_availability_id)
        .in('guide_id', guide_ids)

      if (guideError) {
        console.error('Error deleting guide assignments:', guideError)
      } else {
        for (const assignment of oldGuideData || []) {
          await auditDelete(user.id, user.email, 'guide_assignment', assignment.assignment_id, assignment, ip, userAgent)
        }
      }
    }

    // Delete escort assignments
    if (escort_ids && escort_ids.length > 0) {
      // Get old data for audit
      const { data: oldEscortData } = await supabase
        .from('escort_assignments')
        .select('*')
        .eq('activity_availability_id', activity_availability_id)
        .in('escort_id', escort_ids)

      const { error: escortError } = await supabase
        .from('escort_assignments')
        .delete()
        .eq('activity_availability_id', activity_availability_id)
        .in('escort_id', escort_ids)

      if (escortError) {
        console.error('Error deleting escort assignments:', escortError)
      } else {
        for (const assignment of oldEscortData || []) {
          await auditDelete(user.id, user.email, 'escort_assignment', assignment.assignment_id, assignment, ip, userAgent)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Assignment deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
