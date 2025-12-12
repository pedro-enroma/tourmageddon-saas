import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditDelete, getRequestContext } from '@/lib/audit-logger'

// POST - Create guide/escort/headphone/printing assignments for activity_availability
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { activity_availability_id, guide_ids, escort_ids, headphone_ids, printing_ids } = body

    if (!activity_availability_id) {
      return NextResponse.json({ error: 'activity_availability_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const { ip, userAgent } = getRequestContext(request)
    const results: { guides: unknown[]; escorts: unknown[]; headphones: unknown[]; printing: unknown[] } = { guides: [], escorts: [], headphones: [], printing: [] }

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

    // Insert headphone assignments
    if (headphone_ids && headphone_ids.length > 0) {
      const headphoneAssignments = headphone_ids.map((headphone_id: string) => ({
        headphone_id,
        activity_availability_id
      }))

      const { data: headphoneData, error: headphoneError } = await supabase
        .from('headphone_assignments')
        .insert(headphoneAssignments)
        .select()

      if (headphoneError) {
        console.error('Error creating headphone assignments:', headphoneError)
        // Continue anyway, some might be duplicates
      } else {
        results.headphones = headphoneData || []
        for (const assignment of headphoneData || []) {
          await auditCreate(user.id, user.email, 'headphone_assignment', assignment.assignment_id, assignment, ip, userAgent)
        }
      }
    }

    // Insert printing assignments
    if (printing_ids && printing_ids.length > 0) {
      const printingAssignments = printing_ids.map((printing_id: string) => ({
        printing_id,
        activity_availability_id
      }))

      const { data: printingData, error: printingError } = await supabase
        .from('printing_assignments')
        .insert(printingAssignments)
        .select()

      if (printingError) {
        console.error('Error creating printing assignments:', printingError)
        // Continue anyway, some might be duplicates
      } else {
        results.printing = printingData || []
        for (const assignment of printingData || []) {
          await auditCreate(user.id, user.email, 'printing_assignment', assignment.assignment_id, assignment, ip, userAgent)
        }
      }
    }

    return NextResponse.json({ data: results }, { status: 201 })
  } catch (err) {
    console.error('Assignment creation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE - Remove guide/escort/headphone/printing assignments for activity_availability
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
    const headphone_ids = searchParams.get('headphone_ids')?.split(',').filter(Boolean)
    const printing_ids = searchParams.get('printing_ids')?.split(',').filter(Boolean)

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

    // Delete headphone assignments
    if (headphone_ids && headphone_ids.length > 0) {
      // Get old data for audit
      const { data: oldHeadphoneData } = await supabase
        .from('headphone_assignments')
        .select('*')
        .eq('activity_availability_id', activity_availability_id)
        .in('headphone_id', headphone_ids)

      const { error: headphoneError } = await supabase
        .from('headphone_assignments')
        .delete()
        .eq('activity_availability_id', activity_availability_id)
        .in('headphone_id', headphone_ids)

      if (headphoneError) {
        console.error('Error deleting headphone assignments:', headphoneError)
      } else {
        for (const assignment of oldHeadphoneData || []) {
          await auditDelete(user.id, user.email, 'headphone_assignment', assignment.assignment_id, assignment, ip, userAgent)
        }
      }
    }

    // Delete printing assignments
    if (printing_ids && printing_ids.length > 0) {
      // Get old data for audit
      const { data: oldPrintingData } = await supabase
        .from('printing_assignments')
        .select('*')
        .eq('activity_availability_id', activity_availability_id)
        .in('printing_id', printing_ids)

      const { error: printingError } = await supabase
        .from('printing_assignments')
        .delete()
        .eq('activity_availability_id', activity_availability_id)
        .in('printing_id', printing_ids)

      if (printingError) {
        console.error('Error deleting printing assignments:', printingError)
      } else {
        for (const assignment of oldPrintingData || []) {
          await auditDelete(user.id, user.email, 'printing_assignment', assignment.assignment_id, assignment, ip, userAgent)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Assignment deletion error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
