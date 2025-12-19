import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// Excluded pricing categories for specific activities (deprecated categories)
const EXCLUDED_PRICING_CATEGORIES: Record<string, string[]> = {
  '217949': ['6 a 12 años', '13 a 17 años'],
  '216954': ['6 a 12 años', '13 a 17 años'],
  '220107': ['6 a 12 años', '13 a 17 años']
}

// Activities where ONLY specific pricing category IDs are allowed
const ALLOWED_ONLY_PRICING_CATEGORY_IDS: Record<string, string[]> = {
  '901961': ['780302', '815525', '281494']
}

// Helper function to check if a pricing category should be excluded
const shouldExcludePricingCategory = (activityId: string, categoryTitle: string, pricingCategoryId?: string): boolean => {
  // First check if this activity has an "allowed only" list by pricing_category_id
  const allowedOnlyIds = ALLOWED_ONLY_PRICING_CATEGORY_IDS[activityId]
  if (allowedOnlyIds && pricingCategoryId) {
    return !allowedOnlyIds.includes(pricingCategoryId)
  }

  // Then check the exclusion list by category title
  const excludedCategories = EXCLUDED_PRICING_CATEGORIES[activityId]
  return excludedCategories ? excludedCategories.includes(categoryTitle) : false
}

// GET - Get full booking details by activity_booking_id
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const supabase = getServiceRoleClient()

    // Fetch the activity booking with all related data
    const { data: booking, error: bookingError } = await supabase
      .from('activity_bookings')
      .select(`
        activity_booking_id,
        booking_id,
        activity_id,
        product_title,
        start_date_time,
        start_time,
        status,
        bookings!inner (
          booking_id,
          total_price,
          currency,
          status
        ),
        pricing_category_bookings (
          pricing_category_booking_id,
          pricing_category_id,
          booked_title,
          quantity,
          passenger_first_name,
          passenger_last_name,
          passenger_date_of_birth
        )
      `)
      .eq('activity_booking_id', id)
      .single()

    if (bookingError) {
      console.error('Error fetching booking:', bookingError)
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Fetch customer info
    const { data: bookingCustomers } = await supabase
      .from('booking_customers')
      .select('customer_id')
      .eq('booking_id', booking.booking_id)
      .limit(1)

    let customer = null
    if (bookingCustomers && bookingCustomers.length > 0) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('customer_id, first_name, last_name, email, phone_number')
        .eq('customer_id', bookingCustomers[0].customer_id)
        .single()
      customer = customerData
    }

    // Fetch available time slots for this activity on nearby dates
    const bookingDate = booking.start_date_time?.split('T')[0]
    const { data: availableSlots } = await supabase
      .from('activity_availability')
      .select('id, activity_id, local_date, local_time, vacancy_available, vacancy_opening')
      .eq('activity_id', booking.activity_id)
      .gte('local_date', bookingDate)
      .order('local_date', { ascending: true })
      .order('local_time', { ascending: true })
      .limit(50)

    // Find current slot based on date and time
    const currentTime = booking.start_time?.substring(0, 5)
    const currentSlot = availableSlots?.find(
      s => s.local_date === bookingDate && s.local_time?.substring(0, 5) === currentTime
    )

    // Fetch available pricing categories from historical bookings for this activity
    const { data: historicalBookings } = await supabase
      .from('activity_bookings')
      .select(`
        pricing_category_bookings (
          pricing_category_id,
          booked_title
        )
      `)
      .eq('activity_id', booking.activity_id)
      .not('pricing_category_bookings.booked_title', 'is', null)
      .limit(500)

    // Extract unique pricing categories, filtering out deprecated ones
    const categoriesMap = new Map<string, { pricing_category_id: string; title: string }>()
    historicalBookings?.forEach((b: { pricing_category_bookings: { pricing_category_id: string; booked_title: string }[] | null }) => {
      b.pricing_category_bookings?.forEach((pcb) => {
        if (pcb.booked_title && !categoriesMap.has(pcb.booked_title)) {
          // Filter out excluded/deprecated pricing categories
          if (!shouldExcludePricingCategory(booking.activity_id, pcb.booked_title, pcb.pricing_category_id)) {
            categoriesMap.set(pcb.booked_title, {
              pricing_category_id: pcb.pricing_category_id,
              title: pcb.booked_title
            })
          }
        }
      })
    })

    // Sort categories from older to younger (Adulto first, then by age descending)
    const getAgeOrder = (title: string): number => {
      const lower = title.toLowerCase()
      if (lower.includes('adult') || lower === 'adulto') return 100
      if (lower.includes('18-24') || lower.includes('18 a 24')) return 90
      if (lower.includes('13 a 17')) return 80
      if (lower.includes('6 a 17')) return 70
      if (lower.includes('6 a 12')) return 60
      if (lower.includes('0 a 5') || lower.includes('0-5')) return 10
      // Try to extract age from title
      const match = title.match(/(\d+)/)
      if (match) return parseInt(match[1], 10)
      return 50 // default middle
    }

    const pricingCategories = Array.from(categoriesMap.values()).sort((a, b) => {
      return getAgeOrder(b.title) - getAgeOrder(a.title) // Descending (older first)
    })

    return NextResponse.json({
      data: {
        ...booking,
        current_slot_id: currentSlot?.id || null,
        customer,
        available_slots: availableSlots || [],
        available_pricing_categories: pricingCategories || []
      }
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper to log a booking change
async function logBookingChange(
  supabase: ReturnType<typeof getServiceRoleClient>,
  userId: string,
  userEmail: string,
  activityBookingId: string,
  bookingId: number | null,
  changeType: string,
  fieldChanged: string,
  oldValue: string | null,
  newValue: string | null,
  participantId?: number | null
) {
  try {
    await supabase.from('booking_change_logs').insert({
      activity_booking_id: parseInt(activityBookingId, 10),
      booking_id: bookingId,
      user_id: userId,
      user_email: userEmail,
      change_type: changeType,
      field_changed: fieldChanged,
      old_value: oldValue,
      new_value: newValue,
      participant_id: participantId || null
    })
  } catch (err) {
    console.error('Failed to log booking change:', err)
  }
}

// PUT - Update booking details
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { slot_id, participants } = body

    const supabase = getServiceRoleClient()
    const userEmail = user.email || 'Unknown'

    // Fetch current booking data for comparison
    const { data: currentBooking } = await supabase
      .from('activity_bookings')
      .select('booking_id, start_date_time, start_time')
      .eq('activity_booking_id', id)
      .single()

    const bookingId = currentBooking?.booking_id || null

    // Update date/time if slot changed
    if (slot_id) {
      // Get the new availability details
      const { data: newAvailability } = await supabase
        .from('activity_availability')
        .select('local_date, local_time')
        .eq('id', slot_id)
        .single()

      if (newAvailability) {
        const newDateTime = `${newAvailability.local_date}T${newAvailability.local_time}`
        const oldDateTime = currentBooking?.start_date_time || null

        const { error: updateError } = await supabase
          .from('activity_bookings')
          .update({
            start_date_time: newDateTime,
            start_time: newAvailability.local_time
          })
          .eq('activity_booking_id', id)

        if (updateError) {
          console.error('Error updating booking:', updateError)
          return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 })
        }

        // Log the slot change
        if (oldDateTime !== newDateTime) {
          await logBookingChange(
            supabase, user.id, userEmail, id, bookingId,
            'slot_change', 'date_time',
            oldDateTime, newDateTime
          )
        }
      }
    }

    // Update participants if provided
    if (participants && Array.isArray(participants)) {
      for (const participant of participants) {
        const { pricing_category_booking_id, passenger_first_name, passenger_last_name, passenger_date_of_birth, booked_title, pricing_category_id } = participant

        if (pricing_category_booking_id) {
          // Fetch current participant data for comparison
          const { data: currentParticipant } = await supabase
            .from('pricing_category_bookings')
            .select('passenger_first_name, passenger_last_name, passenger_date_of_birth, booked_title')
            .eq('pricing_category_booking_id', pricing_category_booking_id)
            .single()

          const updateData: Record<string, unknown> = {
            passenger_first_name: passenger_first_name || null,
            passenger_last_name: passenger_last_name || null,
            passenger_date_of_birth: passenger_date_of_birth || null
          }

          // Update booked_title and pricing_category_id if provided
          if (booked_title !== undefined) {
            updateData.booked_title = booked_title
          }
          if (pricing_category_id !== undefined) {
            updateData.pricing_category_id = pricing_category_id
          }

          const { error: participantError } = await supabase
            .from('pricing_category_bookings')
            .update(updateData)
            .eq('pricing_category_booking_id', pricing_category_booking_id)

          if (participantError) {
            console.error('Error updating participant:', participantError)
          } else {
            // Log participant changes
            if (currentParticipant) {
              const oldFirstName = currentParticipant.passenger_first_name || ''
              const oldLastName = currentParticipant.passenger_last_name || ''
              const oldDob = currentParticipant.passenger_date_of_birth || ''
              const oldType = currentParticipant.booked_title || ''

              const newFirstName = passenger_first_name || ''
              const newLastName = passenger_last_name || ''
              const newDob = passenger_date_of_birth || ''
              const newType = booked_title || oldType

              // Log name changes
              if (oldFirstName !== newFirstName || oldLastName !== newLastName) {
                await logBookingChange(
                  supabase, user.id, userEmail, id, bookingId,
                  'participant_update', 'name',
                  `${oldFirstName} ${oldLastName}`.trim(),
                  `${newFirstName} ${newLastName}`.trim(),
                  pricing_category_booking_id
                )
              }

              // Log DOB changes
              if (oldDob !== newDob) {
                await logBookingChange(
                  supabase, user.id, userEmail, id, bookingId,
                  'participant_update', 'date_of_birth',
                  oldDob, newDob,
                  pricing_category_booking_id
                )
              }

              // Log type changes
              if (booked_title !== undefined && oldType !== newType) {
                await logBookingChange(
                  supabase, user.id, userEmail, id, bookingId,
                  'type_change', 'participant_type',
                  oldType, newType,
                  pricing_category_booking_id
                )
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
