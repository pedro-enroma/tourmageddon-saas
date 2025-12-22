import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'
import { auditCreate, auditDelete } from '@/lib/audit-logger'

// GET - List service groups
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const service_date = searchParams.get('service_date')

    const supabase = getServiceRoleClient()
    let query = supabase
      .from('guide_service_groups')
      .select(`
        id,
        service_date,
        service_time,
        group_name,
        guide_id,
        total_pax,
        calculated_cost,
        guide_service_group_members (
          id,
          activity_availability_id,
          time_slot_split_id
        )
      `)
      .order('service_date', { ascending: false })
      .order('service_time', { ascending: true })

    if (service_date) {
      query = query.eq('service_date', service_date)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching service groups:', error)
      return NextResponse.json({ error: 'Failed to fetch service groups' }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new service group
// Supports both old format (availability_ids array) and new format (members array with split support)
export async function POST(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { service_date, service_time, group_name, availability_ids, members } = body

    // Validation
    if (!service_date || !service_time || !group_name) {
      return NextResponse.json({ error: 'service_date, service_time, and group_name are required' }, { status: 400 })
    }

    // Support both old format (availability_ids) and new format (members with split support)
    let memberData: { availability_id: number; split_id?: string }[] = []

    if (members && Array.isArray(members)) {
      // New format: members array with { availability_id, split_id? }
      memberData = members
    } else if (availability_ids && Array.isArray(availability_ids)) {
      // Old format: simple array of availability_ids
      memberData = availability_ids.map((id: number) => ({ availability_id: id }))
    }

    if (memberData.length < 2) {
      return NextResponse.json({ error: 'At least 2 members are required to create a group' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get unique availability IDs
    const uniqueAvailabilityIds = [...new Set(memberData.map(m => m.availability_id))]

    // Get availability details to calculate total pax and cost
    const { data: availabilities, error: availError } = await supabase
      .from('activity_availability')
      .select('id, activity_id, vacancy_sold')
      .in('id', uniqueAvailabilityIds)

    if (availError || !availabilities || availabilities.length === 0) {
      console.error('Error fetching availabilities:', availError)
      return NextResponse.json({ error: 'Failed to fetch availability details' }, { status: 400 })
    }

    // Get split details if any members have split_id
    const splitIds = memberData.filter(m => m.split_id).map(m => m.split_id)
    const splitPaxMap = new Map<string, number>()

    if (splitIds.length > 0) {
      const { data: splits } = await supabase
        .from('time_slot_splits')
        .select(`
          id,
          time_slot_split_bookings (
            activity_booking_id
          )
        `)
        .in('id', splitIds)

      // For splits, we need to calculate pax from the bookings assigned to the split
      if (splits) {
        for (const split of splits) {
          const bookingIds = split.time_slot_split_bookings?.map((b: { activity_booking_id: number }) => b.activity_booking_id) || []
          if (bookingIds.length > 0) {
            const { data: bookings } = await supabase
              .from('activity_bookings')
              .select('pricing_category_bookings(quantity)')
              .in('activity_booking_id', bookingIds)

            const pax = bookings?.reduce((sum, b) => {
              return sum + (b.pricing_category_bookings?.reduce((s: number, p: { quantity: number }) => s + (p.quantity || 0), 0) || 0)
            }, 0) || 0
            splitPaxMap.set(split.id, pax)
          }
        }
      }
    }

    // Get global activity costs
    const activityIds = [...new Set(availabilities.map(a => a.activity_id))]
    const { data: costs } = await supabase
      .from('guide_activity_costs')
      .select('activity_id, cost_amount')
      .is('guide_id', null)
      .in('activity_id', activityIds)

    const costMap = new Map(costs?.map(c => [c.activity_id, c.cost_amount]) || [])
    const availabilityMap = new Map(availabilities.map(a => [a.id, a]))

    // Calculate totals - for splits, use split pax; for whole slots, use vacancy_sold
    let totalPax = 0
    for (const member of memberData) {
      if (member.split_id && splitPaxMap.has(member.split_id)) {
        totalPax += splitPaxMap.get(member.split_id) || 0
      } else {
        const avail = availabilityMap.get(member.availability_id)
        totalPax += avail?.vacancy_sold || 0
      }
    }

    const highestCost = Math.max(...availabilities.map(a => costMap.get(a.activity_id) || 0))

    // Create the service group (no guide_id - will be assigned later)
    const { data: group, error: groupError } = await supabase
      .from('guide_service_groups')
      .insert({
        service_date,
        service_time,
        group_name,
        guide_id: null,
        total_pax: totalPax,
        calculated_cost: highestCost
      })
      .select()
      .single()

    if (groupError) {
      console.error('Error creating service group:', groupError)
      if (groupError.code === '23505') {
        return NextResponse.json({ error: 'A group with this name already exists for this time slot' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create service group' }, { status: 500 })
    }

    // Add members to the group
    const memberInserts = memberData.map(m => ({
      group_id: group.id,
      activity_availability_id: m.availability_id,
      time_slot_split_id: m.split_id || null
    }))

    const { error: membersError } = await supabase
      .from('guide_service_group_members')
      .insert(memberInserts)

    if (membersError) {
      console.error('Error adding group members:', membersError)
      // Rollback group creation
      await supabase.from('guide_service_groups').delete().eq('id', group.id)

      // Provide more specific error message
      if (membersError.code === '23505') {
        return NextResponse.json({ error: 'One or more services/splits are already in another group' }, { status: 409 })
      }
      if (membersError.code === '23503') {
        return NextResponse.json({ error: 'One or more services/splits do not exist' }, { status: 400 })
      }
      return NextResponse.json({ error: `Failed to add group members: ${membersError.message}` }, { status: 500 })
    }

    // Fetch complete group with members
    const { data: completeGroup } = await supabase
      .from('guide_service_groups')
      .select(`
        id,
        service_date,
        service_time,
        group_name,
        guide_id,
        total_pax,
        calculated_cost,
        guide_service_group_members (
          id,
          activity_availability_id,
          time_slot_split_id
        )
      `)
      .eq('id', group.id)
      .single()

    // Audit log
    if (completeGroup) {
      await auditCreate(request, user, 'guide_service_group', group.id, completeGroup)
    }

    return NextResponse.json({ data: completeGroup }, { status: 201 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// PATCH - Assign/unassign guide to service group
export async function PATCH(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { group_id, guide_id } = body

    if (!group_id) {
      return NextResponse.json({ error: 'group_id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get the group and its members
    const { data: group, error: groupError } = await supabase
      .from('guide_service_groups')
      .select(`
        *,
        guide_service_group_members (
          activity_availability_id
        )
      `)
      .eq('id', group_id)
      .single()

    if (groupError || !group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const availabilityIds = group.guide_service_group_members?.map((m: { activity_availability_id: number }) => m.activity_availability_id) || []

    // Note: We intentionally do NOT remove the previous guide's assignments when changing guides.
    // The user may want to keep them assigned to individual services even when changing the group guide.

    // Update the group with new guide_id
    const { error: updateError } = await supabase
      .from('guide_service_groups')
      .update({ guide_id: guide_id || null })
      .eq('id', group_id)

    if (updateError) {
      console.error('Error updating group:', updateError)
      return NextResponse.json({ error: 'Failed to update group' }, { status: 500 })
    }

    // If assigning a new guide, create assignments for all members
    if (guide_id && availabilityIds.length > 0) {
      const assignments = availabilityIds.map((avail_id: number) => ({
        guide_id,
        activity_availability_id: avail_id
      }))

      const { error: assignError } = await supabase
        .from('guide_assignments')
        .upsert(assignments, {
          onConflict: 'guide_id,activity_availability_id',
          ignoreDuplicates: true
        })

      if (assignError) {
        console.error('Error creating assignments:', assignError)
        // Don't fail - the group was updated, assignments are secondary
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// DELETE - Delete service group
export async function DELETE(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Get current data for audit
    const { data: oldData } = await supabase
      .from('guide_service_groups')
      .select(`
        *,
        guide_service_group_members (*)
      `)
      .eq('id', id)
      .single()

    // Members will be deleted automatically due to CASCADE
    const { error } = await supabase
      .from('guide_service_groups')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting service group:', error)
      return NextResponse.json({ error: 'Failed to delete service group' }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await auditDelete(request, user, 'guide_service_group', id, oldData)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
