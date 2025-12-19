import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

interface CostSeason {
  id: string
  year: number
  name: string
  start_date: string
  end_date: string
}

interface SeasonalCost {
  activity_id: string
  season_id: string
  cost_amount: number
}

interface SpecialDateCost {
  activity_id: string
  special_date_id: string
  cost_amount: number
}

interface SpecialDate {
  id: string
  date: string
}

interface CostItem {
  resource_type: 'guide' | 'escort' | 'headphone' | 'printing'
  resource_id: string
  resource_name: string
  date: string
  activity_id?: string
  activity_title?: string
  assignment_id: string
  pax_count?: number
  cost_amount: number
  currency: string
  is_grouped?: boolean
  group_id?: string
}

// GET - Generate resource cost report
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const start_date = searchParams.get('start_date')
    const end_date = searchParams.get('end_date')
    const resource_types = searchParams.get('resource_types')?.split(',') || ['guide', 'escort', 'headphone', 'printing']
    const group_by = searchParams.get('group_by') || 'staff' // staff, date, activity

    if (!start_date || !end_date) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()
    const costItems: CostItem[] = []

    // Fetch all data in parallel - use joins for assignments to filter by date
    const [
      guidesResult,
      escortsResult,
      headphonesResult,
      printingResult,
      guideAssignmentsResult,
      escortAssignmentsResult,
      headphoneAssignmentsResult,
      printingAssignmentsResult,
      guideActivityCostsResult,
      resourceRatesResult,
      overridesResult,
      serviceGroupsResult,
      activitiesResult,
      availabilityResult,
      seasonsResult,
      seasonalCostsResult,
      specialDatesResult,
      specialDateCostsResult
    ] = await Promise.all([
      supabase.from('guides').select('guide_id, first_name, last_name'),
      supabase.from('escorts').select('escort_id, first_name, last_name'),
      supabase.from('headphones').select('headphone_id, name'),
      supabase.from('printing').select('printing_id, name'),
      // Use join to filter assignments by date range via activity_availability
      resource_types.includes('guide') ? supabase
        .from('guide_assignments')
        .select('assignment_id, guide_id, activity_availability_id, activity_availability!inner(local_date)')
        .gte('activity_availability.local_date', start_date)
        .lte('activity_availability.local_date', end_date)
        : { data: [] },
      resource_types.includes('escort') ? supabase
        .from('escort_assignments')
        .select('assignment_id, escort_id, activity_availability_id, activity_availability!inner(local_date)')
        .gte('activity_availability.local_date', start_date)
        .lte('activity_availability.local_date', end_date)
        : { data: [] },
      resource_types.includes('headphone') ? supabase
        .from('headphone_assignments')
        .select('assignment_id, headphone_id, activity_availability_id, activity_availability!inner(local_date)')
        .gte('activity_availability.local_date', start_date)
        .lte('activity_availability.local_date', end_date)
        : { data: [] },
      resource_types.includes('printing') ? supabase
        .from('printing_assignments')
        .select('assignment_id, printing_id, activity_availability_id, activity_availability!inner(local_date)')
        .gte('activity_availability.local_date', start_date)
        .lte('activity_availability.local_date', end_date)
        : { data: [] },
      supabase.from('guide_activity_costs').select('*'),
      supabase.from('resource_rates').select('*'),
      supabase.from('assignment_cost_overrides').select('*'),
      supabase.from('guide_service_groups').select('*, guide_service_group_members(*)'),
      supabase.from('activities').select('activity_id, title'),
      supabase
        .from('activity_availability')
        .select('id, activity_id, local_date, local_time, vacancy_sold')
        .gte('local_date', start_date)
        .lte('local_date', end_date),
      // Seasonal pricing tables
      supabase.from('cost_seasons').select('id, year, name, start_date, end_date'),
      supabase.from('guide_seasonal_costs').select('activity_id, season_id, cost_amount'),
      supabase.from('special_cost_dates').select('id, date'),
      supabase.from('guide_special_date_costs').select('activity_id, special_date_id, cost_amount')
    ])

    // Build lookup maps
    const guidesMap = new Map(guidesResult.data?.map(g => [g.guide_id, `${g.first_name} ${g.last_name}`]) || [])
    const escortsMap = new Map(escortsResult.data?.map(e => [e.escort_id, `${e.first_name} ${e.last_name}`]) || [])
    const headphonesMap = new Map(headphonesResult.data?.map(h => [h.headphone_id, h.name]) || [])
    const printingMap = new Map(printingResult.data?.map(p => [p.printing_id, p.name]) || [])
    const activitiesMap = new Map(activitiesResult.data?.map(a => [a.activity_id, a.title]) || [])

    const availabilityMap = new Map(availabilityResult.data?.map(a => [a.id, a]) || [])

    // Build activity costs map - prefer global costs (null guide_id), fall back to guide-specific
    const activityCostsMap = new Map<string, number>()
    const guideSpecificCostsMap = new Map<string, number>()

    guideActivityCostsResult.data?.forEach(c => {
      if (!c.guide_id) {
        // Global cost (applies to all guides)
        activityCostsMap.set(c.activity_id, c.cost_amount)
      } else {
        // Guide-specific cost (for backward compatibility)
        guideSpecificCostsMap.set(`${c.guide_id}:${c.activity_id}`, c.cost_amount)
      }
    })

    // Build seasonal pricing maps
    const seasons = (seasonsResult.data || []) as CostSeason[]
    const seasonalCosts = (seasonalCostsResult.data || []) as SeasonalCost[]
    const specialDates = (specialDatesResult.data || []) as SpecialDate[]
    const specialDateCosts = (specialDateCostsResult.data || []) as SpecialDateCost[]

    // Map: special date string -> special_date_id
    const specialDateMap = new Map(specialDates.map(sd => [sd.date, sd.id]))

    // Map: activity_id:special_date_id -> cost
    const specialDateCostMap = new Map(
      specialDateCosts.map(sdc => [`${sdc.activity_id}:${sdc.special_date_id}`, sdc.cost_amount])
    )

    // Map: activity_id:season_id -> cost
    const seasonalCostMap = new Map(
      seasonalCosts.map(sc => [`${sc.activity_id}:${sc.season_id}`, sc.cost_amount])
    )

    // Helper to get guide cost for a specific activity and date
    const getGuideCostForDate = (activityId: string, date: string, guideId?: string): number => {
      // 1. Check special date cost first
      const specialDateId = specialDateMap.get(date)
      if (specialDateId) {
        const specialCost = specialDateCostMap.get(`${activityId}:${specialDateId}`)
        if (specialCost !== undefined) {
          return specialCost
        }
      }

      // 2. Check seasonal cost
      const dateObj = new Date(date)
      for (const season of seasons) {
        const seasonStart = new Date(season.start_date)
        const seasonEnd = new Date(season.end_date)
        if (dateObj >= seasonStart && dateObj <= seasonEnd) {
          const seasonalCost = seasonalCostMap.get(`${activityId}:${season.id}`)
          if (seasonalCost !== undefined) {
            return seasonalCost
          }
        }
      }

      // 3. Fall back to legacy costs
      const globalCost = activityCostsMap.get(activityId)
      if (globalCost !== undefined) {
        return globalCost
      }

      // 4. Guide-specific cost (backward compatibility)
      if (guideId) {
        const guideSpecificCost = guideSpecificCostsMap.get(`${guideId}:${activityId}`)
        if (guideSpecificCost !== undefined) {
          return guideSpecificCost
        }
      }

      return 0
    }

    const resourceRatesMap = new Map<string, { rate_amount: number; rate_type: string }>()
    resourceRatesResult.data?.forEach(r => {
      resourceRatesMap.set(`${r.resource_type}:${r.resource_id}`, {
        rate_amount: r.rate_amount,
        rate_type: r.rate_type
      })
    })

    const overridesMap = new Map<string, number>()
    overridesResult.data?.forEach(o => {
      overridesMap.set(`${o.assignment_type}:${o.assignment_id}`, o.override_amount)
    })

    // Build service groups map (assignment_id -> group info)
    const assignmentToGroupMap = new Map<string, { group_id: string; is_primary: boolean }>()
    serviceGroupsResult.data?.forEach(g => {
      g.guide_service_group_members?.forEach((m: { guide_assignment_id: string }) => {
        assignmentToGroupMap.set(m.guide_assignment_id, {
          group_id: g.id,
          is_primary: g.primary_assignment_id === m.guide_assignment_id
        })
      })
    })

    // Process guide assignments
    if (resource_types.includes('guide')) {
      guideAssignmentsResult.data?.forEach(assignment => {
        const availability = availabilityMap.get(assignment.activity_availability_id)
        if (!availability) return

        const groupInfo = assignmentToGroupMap.get(assignment.assignment_id)

        // Skip non-primary grouped assignments (cost is 0)
        if (groupInfo && !groupInfo.is_primary) return

        // Check for override first (highest priority)
        let cost = overridesMap.get(`guide:${assignment.assignment_id}`)

        if (cost === undefined) {
          // Use seasonal cost lookup: special date > seasonal > legacy
          cost = getGuideCostForDate(availability.activity_id, availability.local_date, assignment.guide_id)
        }

        costItems.push({
          resource_type: 'guide',
          resource_id: assignment.guide_id,
          resource_name: guidesMap.get(assignment.guide_id) || 'Unknown Guide',
          date: availability.local_date,
          activity_id: availability.activity_id,
          activity_title: activitiesMap.get(availability.activity_id) || 'Unknown Activity',
          assignment_id: assignment.assignment_id,
          cost_amount: cost,
          currency: 'EUR',
          is_grouped: !!groupInfo,
          group_id: groupInfo?.group_id
        })
      })
    }

    // Process escort assignments (daily rate - only count once per day)
    if (resource_types.includes('escort')) {
      const escortDailyCounted = new Map<string, boolean>() // escort_id:date -> counted

      escortAssignmentsResult.data?.forEach(assignment => {
        const availability = availabilityMap.get(assignment.activity_availability_id)
        if (!availability) return

        const dailyKey = `${assignment.escort_id}:${availability.local_date}`
        if (escortDailyCounted.get(dailyKey)) return // Already counted for this day
        escortDailyCounted.set(dailyKey, true)

        // Check for override first
        let cost = overridesMap.get(`escort:${assignment.assignment_id}`)

        if (cost === undefined) {
          const rate = resourceRatesMap.get(`escort:${assignment.escort_id}`)
          cost = rate?.rate_amount || 0
        }

        costItems.push({
          resource_type: 'escort',
          resource_id: assignment.escort_id,
          resource_name: escortsMap.get(assignment.escort_id) || 'Unknown Escort',
          date: availability.local_date,
          assignment_id: assignment.assignment_id,
          cost_amount: cost,
          currency: 'EUR'
        })
      })
    }

    // Process headphone assignments (per pax)
    if (resource_types.includes('headphone')) {
      headphoneAssignmentsResult.data?.forEach(assignment => {
        const availability = availabilityMap.get(assignment.activity_availability_id)
        if (!availability) return

        const paxCount = availability.vacancy_sold || 0

        // Check for override first
        let cost = overridesMap.get(`headphone:${assignment.assignment_id}`)

        if (cost === undefined) {
          const rate = resourceRatesMap.get(`headphone:${assignment.headphone_id}`)
          cost = (rate?.rate_amount || 0) * paxCount
        }

        costItems.push({
          resource_type: 'headphone',
          resource_id: assignment.headphone_id,
          resource_name: headphonesMap.get(assignment.headphone_id) || 'Unknown Headphone',
          date: availability.local_date,
          activity_id: availability.activity_id,
          activity_title: activitiesMap.get(availability.activity_id) || 'Unknown Activity',
          assignment_id: assignment.assignment_id,
          pax_count: paxCount,
          cost_amount: cost,
          currency: 'EUR'
        })
      })
    }

    // Process printing assignments (per pax)
    if (resource_types.includes('printing')) {
      printingAssignmentsResult.data?.forEach(assignment => {
        const availability = availabilityMap.get(assignment.activity_availability_id)
        if (!availability) return

        const paxCount = availability.vacancy_sold || 0

        // Check for override first
        let cost = overridesMap.get(`printing:${assignment.assignment_id}`)

        if (cost === undefined) {
          const rate = resourceRatesMap.get(`printing:${assignment.printing_id}`)
          cost = (rate?.rate_amount || 0) * paxCount
        }

        costItems.push({
          resource_type: 'printing',
          resource_id: assignment.printing_id,
          resource_name: printingMap.get(assignment.printing_id) || 'Unknown Printing',
          date: availability.local_date,
          activity_id: availability.activity_id,
          activity_title: activitiesMap.get(availability.activity_id) || 'Unknown Activity',
          assignment_id: assignment.assignment_id,
          pax_count: paxCount,
          cost_amount: cost,
          currency: 'EUR'
        })
      })
    }

    // Calculate summaries based on group_by
    const summaries: Record<string, { key: string; label: string; total_cost: number; count: number }> = {}

    costItems.forEach(item => {
      let key: string
      let label: string

      switch (group_by) {
        case 'date':
          key = item.date
          label = item.date
          break
        case 'activity':
          key = item.activity_id || 'no-activity'
          label = item.activity_title || 'No Activity'
          break
        case 'staff':
        default:
          key = `${item.resource_type}:${item.resource_id}`
          label = `${item.resource_name} (${item.resource_type})`
      }

      if (!summaries[key]) {
        summaries[key] = { key, label, total_cost: 0, count: 0 }
      }
      summaries[key].total_cost += item.cost_amount
      summaries[key].count += 1
    })

    const totalCost = costItems.reduce((sum, item) => sum + item.cost_amount, 0)

    return NextResponse.json({
      data: {
        items: costItems,
        summaries: Object.values(summaries).sort((a, b) => b.total_cost - a.total_cost),
        total_cost: totalCost,
        currency: 'EUR',
        date_range: { start_date, end_date },
        group_by
      }
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
