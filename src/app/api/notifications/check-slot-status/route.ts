import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { evaluateRules } from '@/lib/notification-rules-engine'
import { TRIGGER_EVENTS } from '@/lib/notification-rules-types'

interface SlotWithBookings {
  id: number
  activity_id: string
  local_date: string
  local_time: string
  activity_name?: string
  booking_count: number
  participant_count: number
}

interface GuideData {
  guide_id: string
  first_name: string
  last_name: string
  is_placeholder: boolean
}

interface GuideAssignmentRaw {
  assignment_id: number
  activity_availability_id: number
  guide: GuideData | GuideData[] | null
}

interface GuideAssignment {
  assignment_id: number
  activity_availability_id: number
  guide: GuideData | null
}

// POST - Check slot status and trigger notification rules for slots missing guides or with placeholder guides
export async function POST(request: NextRequest) {
  const { error: authError } = await verifySession()
  if (authError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const daysAhead = body.daysAhead || 7 // Default to 7 days ahead

    const supabase = getServiceRoleClient()

    // Calculate date range
    const today = new Date()
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + daysAhead)

    const startDateStr = today.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    console.log(`[Slot Status Check] Checking slots from ${startDateStr} to ${endDateStr}`)

    // 1. Get all activity_availability slots in the date range with bookings
    // We need to join with activity_bookings to find slots that have bookings
    const { data: bookings, error: bookingsError } = await supabase
      .from('activity_bookings')
      .select(`
        activity_booking_id,
        activity_id,
        start_date_time,
        start_time,
        status,
        product_title,
        pricing_category_bookings (
          quantity
        )
      `)
      .gte('start_date_time', startDateStr)
      .lte('start_date_time', endDateStr + 'T23:59:59')
      .neq('status', 'CANCELLED')

    if (bookingsError) {
      console.error('[Slot Status Check] Error fetching bookings:', bookingsError)
      return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
    }

    if (!bookings || bookings.length === 0) {
      console.log('[Slot Status Check] No bookings found in date range')
      return NextResponse.json({
        message: 'No bookings found in date range',
        slotsChecked: 0,
        missingGuide: 0,
        placeholderGuide: 0
      })
    }

    // 2. Group bookings by slot (activity_id + date + time)
    const slotMap = new Map<string, SlotWithBookings>()

    for (const booking of bookings) {
      const dateTime = booking.start_date_time || ''
      const date = dateTime.split('T')[0]
      const time = booking.start_time?.substring(0, 5) || dateTime.split('T')[1]?.substring(0, 5) || '00:00'
      const slotKey = `${booking.activity_id}-${date}-${time}`

      const participantCount = (booking.pricing_category_bookings || [])
        .reduce((sum: number, pcb: { quantity: number }) => sum + (pcb.quantity || 0), 0)

      if (slotMap.has(slotKey)) {
        const existing = slotMap.get(slotKey)!
        existing.booking_count += 1
        existing.participant_count += participantCount
      } else {
        slotMap.set(slotKey, {
          id: 0, // Will be filled from activity_availability
          activity_id: booking.activity_id,
          local_date: date,
          local_time: time,
          activity_name: booking.product_title,
          booking_count: 1,
          participant_count: participantCount
        })
      }
    }

    // 3. Get activity_availability IDs for these slots
    const slotsWithBookings = Array.from(slotMap.values())
    const availabilityIds: number[] = []

    for (const slot of slotsWithBookings) {
      const { data: availability } = await supabase
        .from('activity_availability')
        .select('id')
        .eq('activity_id', slot.activity_id)
        .eq('local_date', slot.local_date)
        .ilike('local_time', `${slot.local_time}%`)
        .single()

      if (availability) {
        slot.id = availability.id
        availabilityIds.push(availability.id)
      }
    }

    // 4. Get guide assignments for these availability slots
    const { data: guideAssignments, error: assignmentsError } = await supabase
      .from('guide_assignments')
      .select(`
        assignment_id,
        activity_availability_id,
        guide:guides (
          guide_id,
          first_name,
          last_name,
          is_placeholder
        )
      `)
      .in('activity_availability_id', availabilityIds.length > 0 ? availabilityIds : [0])

    if (assignmentsError) {
      console.error('[Slot Status Check] Error fetching guide assignments:', assignmentsError)
    }

    // Create lookup map for guide assignments
    const assignmentMap = new Map<number, GuideAssignment[]>()
    for (const rawAssignment of (guideAssignments || []) as GuideAssignmentRaw[]) {
      const availId = rawAssignment.activity_availability_id
      // Handle case where guide could be an array (from Supabase join) or a single object
      const guideData = Array.isArray(rawAssignment.guide)
        ? rawAssignment.guide[0] || null
        : rawAssignment.guide

      const assignment: GuideAssignment = {
        assignment_id: rawAssignment.assignment_id,
        activity_availability_id: rawAssignment.activity_availability_id,
        guide: guideData
      }

      if (!assignmentMap.has(availId)) {
        assignmentMap.set(availId, [])
      }
      assignmentMap.get(availId)!.push(assignment)
    }

    // 5. Check each slot and trigger appropriate notifications
    let missingGuideCount = 0
    let placeholderGuideCount = 0
    const results: { slot: string; status: string; guide?: string }[] = []

    for (const slot of slotsWithBookings) {
      if (slot.id === 0) {
        // No availability record found, skip
        continue
      }

      const assignments = assignmentMap.get(slot.id) || []
      const daysUntilSlot = Math.ceil(
        (new Date(slot.local_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (assignments.length === 0) {
        // No guide assigned - trigger slot_missing_guide event
        missingGuideCount++
        results.push({
          slot: `${slot.activity_name} - ${slot.local_date} ${slot.local_time}`,
          status: 'missing_guide'
        })

        await evaluateRules({
          trigger: TRIGGER_EVENTS.SLOT_MISSING_GUIDE,
          data: {
            activity_name: slot.activity_name || 'Unknown Activity',
            slot_date: slot.local_date,
            slot_time: slot.local_time,
            booking_count: slot.booking_count,
            participant_count: slot.participant_count,
            days_until_slot: daysUntilSlot,
            activity_id: slot.activity_id,
            availability_id: slot.id
          }
        })
      } else {
        // Check if any assigned guide is a placeholder
        const placeholderGuide = assignments.find(a => a.guide?.is_placeholder === true)

        if (placeholderGuide && placeholderGuide.guide) {
          // Placeholder guide assigned - trigger slot_placeholder_guide event
          placeholderGuideCount++
          const guideName = `${placeholderGuide.guide.first_name} ${placeholderGuide.guide.last_name}`
          results.push({
            slot: `${slot.activity_name} - ${slot.local_date} ${slot.local_time}`,
            status: 'placeholder_guide',
            guide: guideName
          })

          await evaluateRules({
            trigger: TRIGGER_EVENTS.SLOT_PLACEHOLDER_GUIDE,
            data: {
              activity_name: slot.activity_name || 'Unknown Activity',
              slot_date: slot.local_date,
              slot_time: slot.local_time,
              guide_name: guideName,
              booking_count: slot.booking_count,
              participant_count: slot.participant_count,
              days_until_slot: daysUntilSlot,
              activity_id: slot.activity_id,
              availability_id: slot.id
            }
          })
        }
      }
    }

    console.log(`[Slot Status Check] Checked ${slotsWithBookings.length} slots: ${missingGuideCount} missing guide, ${placeholderGuideCount} with placeholder`)

    return NextResponse.json({
      message: 'Slot status check completed',
      slotsChecked: slotsWithBookings.length,
      missingGuide: missingGuideCount,
      placeholderGuide: placeholderGuideCount,
      details: results
    })
  } catch (err) {
    console.error('[Slot Status Check] Error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// GET - Simple status endpoint
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/notifications/check-slot-status',
    description: 'Check slots with bookings for missing or placeholder guides and trigger notification rules',
    usage: 'POST with optional { daysAhead: number } to specify how many days ahead to check (default: 7)'
  })
}
