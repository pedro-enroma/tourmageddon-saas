import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

interface AssignmentReport {
  assignment_id: string
  local_date: string
  local_time: string
  activity_title: string
  staff_name: string
  staff_type: 'Guide' | 'Escort' | 'Headphone'
  participants: number
  capacity: number
  status: string
}

interface AvailabilityRecord {
  id: number
  local_date: string
  local_time: string
  vacancy_sold: number | null
  vacancy_opening: number | null
  status: string | null
  activity_id: string
}

// GET - Generate staff assignment report
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const guideIds = searchParams.get('guide_ids')?.split(',').filter(Boolean) || []
    const escortIds = searchParams.get('escort_ids')?.split(',').filter(Boolean) || []
    const headphoneIds = searchParams.get('headphone_ids')?.split(',').filter(Boolean) || []
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
    }

    if (guideIds.length === 0 && escortIds.length === 0 && headphoneIds.length === 0) {
      return NextResponse.json({ error: 'At least one staff member must be selected' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const reportData: AssignmentReport[] = []

    // Fetch guide assignments
    if (guideIds.length > 0) {
      const { data: guideAssignments } = await supabase
        .from('guide_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          guide:guides (guide_id, first_name, last_name)
        `)
        .in('guide_id', guideIds)

      if (guideAssignments && guideAssignments.length > 0) {
        const availabilityIds = guideAssignments.map(a => a.activity_availability_id)

        const { data: availabilities } = await supabase
          .from('activity_availability')
          .select('id, local_date, local_time, vacancy_sold, vacancy_opening, status, activity_id')
          .in('id', availabilityIds)
          .gte('local_date', startDate)
          .lte('local_date', endDate)

        const activityIds = [...new Set(availabilities?.map(a => a.activity_id) || [])]
        const { data: activities } = await supabase
          .from('activities')
          .select('activity_id, title')
          .in('activity_id', activityIds)

        const activitiesMap = (activities || []).reduce((acc: Record<string, string>, a) => {
          acc[a.activity_id] = a.title
          return acc
        }, {})

        const availabilitiesMap = (availabilities || []).reduce((acc: Record<number, AvailabilityRecord>, a) => {
          acc[a.id] = a
          return acc
        }, {})

        guideAssignments.forEach(assignment => {
          const availability = availabilitiesMap[assignment.activity_availability_id]
          const guideData = assignment.guide as unknown as { guide_id: string; first_name: string; last_name: string } | { guide_id: string; first_name: string; last_name: string }[] | null
          const guide = Array.isArray(guideData) ? guideData[0] : guideData

          if (availability && guide) {
            reportData.push({
              assignment_id: assignment.assignment_id,
              local_date: availability.local_date,
              local_time: availability.local_time,
              activity_title: activitiesMap[availability.activity_id] || 'Unknown Activity',
              staff_name: `${guide.first_name} ${guide.last_name}`,
              staff_type: 'Guide',
              participants: availability.vacancy_sold || 0,
              capacity: availability.vacancy_opening || 0,
              status: availability.status || ''
            })
          }
        })
      }
    }

    // Fetch escort assignments
    if (escortIds.length > 0) {
      const { data: escortAssignments } = await supabase
        .from('escort_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          escort:escorts (escort_id, first_name, last_name)
        `)
        .in('escort_id', escortIds)

      if (escortAssignments && escortAssignments.length > 0) {
        const availabilityIds = escortAssignments.map(a => a.activity_availability_id)

        const { data: availabilities } = await supabase
          .from('activity_availability')
          .select('id, local_date, local_time, vacancy_sold, vacancy_opening, status, activity_id')
          .in('id', availabilityIds)
          .gte('local_date', startDate)
          .lte('local_date', endDate)

        const activityIds = [...new Set(availabilities?.map(a => a.activity_id) || [])]
        const { data: activities } = await supabase
          .from('activities')
          .select('activity_id, title')
          .in('activity_id', activityIds)

        const activitiesMap = (activities || []).reduce((acc: Record<string, string>, a) => {
          acc[a.activity_id] = a.title
          return acc
        }, {})

        const availabilitiesMap = (availabilities || []).reduce((acc: Record<number, AvailabilityRecord>, a) => {
          acc[a.id] = a
          return acc
        }, {})

        escortAssignments.forEach(assignment => {
          const availability = availabilitiesMap[assignment.activity_availability_id]
          const escortData = assignment.escort as unknown as { escort_id: string; first_name: string; last_name: string } | { escort_id: string; first_name: string; last_name: string }[] | null
          const escort = Array.isArray(escortData) ? escortData[0] : escortData

          if (availability && escort) {
            reportData.push({
              assignment_id: assignment.assignment_id,
              local_date: availability.local_date,
              local_time: availability.local_time,
              activity_title: activitiesMap[availability.activity_id] || 'Unknown Activity',
              staff_name: `${escort.first_name} ${escort.last_name}`,
              staff_type: 'Escort',
              participants: availability.vacancy_sold || 0,
              capacity: availability.vacancy_opening || 0,
              status: availability.status || ''
            })
          }
        })
      }
    }

    // Fetch headphone assignments
    if (headphoneIds.length > 0) {
      const { data: headphoneAssignments } = await supabase
        .from('headphone_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          headphone:headphones (headphone_id, name)
        `)
        .in('headphone_id', headphoneIds)

      if (headphoneAssignments && headphoneAssignments.length > 0) {
        const availabilityIds = headphoneAssignments.map(a => a.activity_availability_id)

        const { data: availabilities } = await supabase
          .from('activity_availability')
          .select('id, local_date, local_time, vacancy_sold, vacancy_opening, status, activity_id')
          .in('id', availabilityIds)
          .gte('local_date', startDate)
          .lte('local_date', endDate)

        const activityIds = [...new Set(availabilities?.map(a => a.activity_id) || [])]
        const { data: activities } = await supabase
          .from('activities')
          .select('activity_id, title')
          .in('activity_id', activityIds)

        const activitiesMap = (activities || []).reduce((acc: Record<string, string>, a) => {
          acc[a.activity_id] = a.title
          return acc
        }, {})

        const availabilitiesMap = (availabilities || []).reduce((acc: Record<number, AvailabilityRecord>, a) => {
          acc[a.id] = a
          return acc
        }, {})

        headphoneAssignments.forEach(assignment => {
          const availability = availabilitiesMap[assignment.activity_availability_id]
          const headphoneData = assignment.headphone as unknown as { headphone_id: string; name: string } | { headphone_id: string; name: string }[] | null
          const headphone = Array.isArray(headphoneData) ? headphoneData[0] : headphoneData

          if (availability && headphone) {
            reportData.push({
              assignment_id: assignment.assignment_id,
              local_date: availability.local_date,
              local_time: availability.local_time,
              activity_title: activitiesMap[availability.activity_id] || 'Unknown Activity',
              staff_name: headphone.name,
              staff_type: 'Headphone',
              participants: availability.vacancy_sold || 0,
              capacity: availability.vacancy_opening || 0,
              status: availability.status || ''
            })
          }
        })
      }
    }

    // Sort by date and time
    reportData.sort((a, b) => {
      const dateCompare = a.local_date.localeCompare(b.local_date)
      if (dateCompare !== 0) return dateCompare
      return a.local_time.localeCompare(b.local_time)
    })

    return NextResponse.json({ data: reportData })
  } catch (err) {
    console.error('Report generation error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
