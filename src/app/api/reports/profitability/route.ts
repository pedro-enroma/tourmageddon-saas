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

interface GuideSpecificSeasonalCost {
  guide_id: string
  activity_id: string
  season_id: string
  cost_amount: number
}

interface GuideSpecificSpecialDateCost {
  guide_id: string
  activity_id: string
  special_date_id: string
  cost_amount: number
}

interface ProfitabilityItem {
  key: string
  label: string
  revenue: number
  guide_costs: number
  escort_costs: number
  headphone_costs: number
  printing_costs: number
  total_costs: number
  profit: number
  margin: number // percentage
  booking_count: number
  pax_count: number
}

// GET - Generate profitability report
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const start_date = searchParams.get('start_date')
    const end_date = searchParams.get('end_date')
    const group_by = searchParams.get('group_by') || 'activity' // activity, date, booking

    if (!start_date || !end_date) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Fetch all relevant data in parallel
    const [
      bookingsResult,
      guideAssignmentsResult,
      guidesResult,
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
      specialDateCostsResult,
      guideSpecificSeasonalCostsResult,
      guideSpecificSpecialDateCostsResult,
      specialGuideRulesResult
    ] = await Promise.all([
      // Get bookings with revenue data
      supabase
        .from('activity_bookings')
        .select('id, activity_availability_id, total_price, num_pax, status')
        .in('status', ['CONFIRMED', 'COMPLETED']),
      supabase.from('guide_assignments').select('assignment_id, guide_id, activity_availability_id'),
      supabase.from('guides').select('guide_id, paid_in_cash'),
      supabase.from('escort_assignments').select('assignment_id, escort_id, activity_availability_id'),
      supabase.from('headphone_assignments').select('assignment_id, headphone_id, activity_availability_id'),
      supabase.from('printing_assignments').select('assignment_id, printing_id, activity_availability_id'),
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
      supabase.from('guide_special_date_costs').select('activity_id, special_date_id, cost_amount'),
      // Guide-specific cost tables (special guide rules)
      supabase.from('guide_specific_seasonal_costs').select('guide_id, activity_id, season_id, cost_amount'),
      supabase.from('guide_specific_special_date_costs').select('guide_id, activity_id, special_date_id, cost_amount'),
      supabase.from('special_guide_rules').select('guide_id, activity_id')
    ])

    // Build lookup maps
    const activitiesMap = new Map(activitiesResult.data?.map(a => [a.activity_id, a.title]) || [])
    const availabilityMap = new Map(availabilityResult.data?.map(a => [a.id, a]) || [])
    const availabilityIds = new Set(availabilityResult.data?.map(a => a.id) || [])

    // Build set of cash-paid guide IDs (excluded from cost reports)
    const cashPaidGuideIds = new Set(
      guidesResult.data?.filter(g => g.paid_in_cash).map(g => g.guide_id) || []
    )

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

    // Build guide-specific cost maps (for special guide rules)
    const guideSpecificSeasonalCosts = (guideSpecificSeasonalCostsResult.data || []) as GuideSpecificSeasonalCost[]
    const guideSpecificSpecialDateCosts = (guideSpecificSpecialDateCostsResult.data || []) as GuideSpecificSpecialDateCost[]

    // Map: guide_id:activity_id:special_date_id -> cost
    const guideSpecificSpecialDateCostMap = new Map(
      guideSpecificSpecialDateCosts.map(c => [`${c.guide_id}:${c.activity_id}:${c.special_date_id}`, c.cost_amount])
    )

    // Map: guide_id:activity_id:season_id -> cost
    const guideSpecificSeasonalCostMap = new Map(
      guideSpecificSeasonalCosts.map(c => [`${c.guide_id}:${c.activity_id}:${c.season_id}`, c.cost_amount])
    )

    // Set of guide:activity pairs that have special rules
    const specialGuideActivityPairs = new Set(
      specialGuideRulesResult.data?.map(r => `${r.guide_id}:${r.activity_id}`) || []
    )

    // Helper to get guide cost for a specific activity and date
    const getGuideCostForDate = (activityId: string, date: string, guideId?: string): number => {
      // Check if this guide has a special rule for this activity
      if (guideId && specialGuideActivityPairs.has(`${guideId}:${activityId}`)) {
        // 1. Check guide-specific special date cost (highest priority)
        const specialDateId = specialDateMap.get(date)
        if (specialDateId) {
          const guideSpecificSpecialCost = guideSpecificSpecialDateCostMap.get(`${guideId}:${activityId}:${specialDateId}`)
          if (guideSpecificSpecialCost !== undefined) {
            return guideSpecificSpecialCost
          }
        }

        // 2. Check guide-specific seasonal cost
        const dateObj = new Date(date)
        for (const season of seasons) {
          const seasonStart = new Date(season.start_date)
          const seasonEnd = new Date(season.end_date)
          if (dateObj >= seasonStart && dateObj <= seasonEnd) {
            const guideSpecificSeasonalCost = guideSpecificSeasonalCostMap.get(`${guideId}:${activityId}:${season.id}`)
            if (guideSpecificSeasonalCost !== undefined) {
              return guideSpecificSeasonalCost
            }
          }
        }
      }

      // 3. Check default special date cost
      const specialDateId = specialDateMap.get(date)
      if (specialDateId) {
        const specialCost = specialDateCostMap.get(`${activityId}:${specialDateId}`)
        if (specialCost !== undefined) {
          return specialCost
        }
      }

      // 4. Check default seasonal cost
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

      // 5. Fall back to legacy costs
      const globalCost = activityCostsMap.get(activityId)
      if (globalCost !== undefined) {
        return globalCost
      }

      // 6. Guide-specific cost (backward compatibility)
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

    // Service groups map
    const assignmentToGroupMap = new Map<string, { group_id: string; is_primary: boolean }>()
    serviceGroupsResult.data?.forEach(g => {
      g.guide_service_group_members?.forEach((m: { guide_assignment_id: string }) => {
        assignmentToGroupMap.set(m.guide_assignment_id, {
          group_id: g.id,
          is_primary: g.primary_assignment_id === m.guide_assignment_id
        })
      })
    })

    // Initialize profitability data structure
    const profitabilityData = new Map<string, ProfitabilityItem>()

    const getKey = (availabilityId: number) => {
      const availability = availabilityMap.get(availabilityId)
      if (!availability) return null

      switch (group_by) {
        case 'date':
          return { key: availability.local_date, label: availability.local_date }
        case 'activity':
          return {
            key: availability.activity_id,
            label: activitiesMap.get(availability.activity_id) || 'Unknown Activity'
          }
        default:
          return { key: String(availabilityId), label: `Slot ${availabilityId}` }
      }
    }

    const ensureItem = (key: string, label: string): ProfitabilityItem => {
      if (!profitabilityData.has(key)) {
        profitabilityData.set(key, {
          key,
          label,
          revenue: 0,
          guide_costs: 0,
          escort_costs: 0,
          headphone_costs: 0,
          printing_costs: 0,
          total_costs: 0,
          profit: 0,
          margin: 0,
          booking_count: 0,
          pax_count: 0
        })
      }
      return profitabilityData.get(key)!
    }

    // Process bookings for revenue
    bookingsResult.data?.forEach(booking => {
      if (!availabilityIds.has(booking.activity_availability_id)) return

      const keyInfo = getKey(booking.activity_availability_id)
      if (!keyInfo) return

      const item = ensureItem(keyInfo.key, keyInfo.label)
      item.revenue += parseFloat(String(booking.total_price)) || 0
      item.booking_count += 1
      item.pax_count += booking.num_pax || 0
    })

    // Process guide costs
    guideAssignmentsResult.data?.forEach(assignment => {
      if (!availabilityIds.has(assignment.activity_availability_id)) return

      // Skip guides that are paid in cash (excluded from cost reports)
      if (cashPaidGuideIds.has(assignment.guide_id)) return

      const availability = availabilityMap.get(assignment.activity_availability_id)
      if (!availability) return

      const keyInfo = getKey(assignment.activity_availability_id)
      if (!keyInfo) return

      const groupInfo = assignmentToGroupMap.get(assignment.assignment_id)

      // Skip non-primary grouped assignments
      if (groupInfo && !groupInfo.is_primary) return

      // Check for override first (highest priority)
      let cost = overridesMap.get(`guide:${assignment.assignment_id}`)
      if (cost === undefined) {
        // Use seasonal cost lookup: special date > seasonal > legacy
        cost = getGuideCostForDate(availability.activity_id, availability.local_date, assignment.guide_id)
      }

      const item = ensureItem(keyInfo.key, keyInfo.label)
      item.guide_costs += cost
    })

    // Process escort costs (daily - track unique escort+date combinations)
    const escortDailyCounted = new Map<string, Set<string>>() // key -> Set of escort_id:date

    escortAssignmentsResult.data?.forEach(assignment => {
      if (!availabilityIds.has(assignment.activity_availability_id)) return

      const availability = availabilityMap.get(assignment.activity_availability_id)
      if (!availability) return

      const keyInfo = getKey(assignment.activity_availability_id)
      if (!keyInfo) return

      const dailyKey = `${assignment.escort_id}:${availability.local_date}`

      if (!escortDailyCounted.has(keyInfo.key)) {
        escortDailyCounted.set(keyInfo.key, new Set())
      }

      if (escortDailyCounted.get(keyInfo.key)!.has(dailyKey)) return
      escortDailyCounted.get(keyInfo.key)!.add(dailyKey)

      let cost = overridesMap.get(`escort:${assignment.assignment_id}`)
      if (cost === undefined) {
        const rate = resourceRatesMap.get(`escort:${assignment.escort_id}`)
        cost = rate?.rate_amount || 0
      }

      const item = ensureItem(keyInfo.key, keyInfo.label)
      item.escort_costs += cost
    })

    // Process headphone costs
    headphoneAssignmentsResult.data?.forEach(assignment => {
      if (!availabilityIds.has(assignment.activity_availability_id)) return

      const availability = availabilityMap.get(assignment.activity_availability_id)
      if (!availability) return

      const keyInfo = getKey(assignment.activity_availability_id)
      if (!keyInfo) return

      const paxCount = availability.vacancy_sold || 0

      let cost = overridesMap.get(`headphone:${assignment.assignment_id}`)
      if (cost === undefined) {
        const rate = resourceRatesMap.get(`headphone:${assignment.headphone_id}`)
        cost = (rate?.rate_amount || 0) * paxCount
      }

      const item = ensureItem(keyInfo.key, keyInfo.label)
      item.headphone_costs += cost
    })

    // Process printing costs
    printingAssignmentsResult.data?.forEach(assignment => {
      if (!availabilityIds.has(assignment.activity_availability_id)) return

      const availability = availabilityMap.get(assignment.activity_availability_id)
      if (!availability) return

      const keyInfo = getKey(assignment.activity_availability_id)
      if (!keyInfo) return

      const paxCount = availability.vacancy_sold || 0

      let cost = overridesMap.get(`printing:${assignment.assignment_id}`)
      if (cost === undefined) {
        const rate = resourceRatesMap.get(`printing:${assignment.printing_id}`)
        cost = (rate?.rate_amount || 0) * paxCount
      }

      const item = ensureItem(keyInfo.key, keyInfo.label)
      item.printing_costs += cost
    })

    // Calculate totals, profits, and margins
    const items = Array.from(profitabilityData.values()).map(item => {
      item.total_costs = item.guide_costs + item.escort_costs + item.headphone_costs + item.printing_costs
      item.profit = item.revenue - item.total_costs
      item.margin = item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0
      return item
    })

    // Sort by revenue descending
    items.sort((a, b) => b.revenue - a.revenue)

    // Calculate overall totals
    const totals = items.reduce((acc, item) => ({
      revenue: acc.revenue + item.revenue,
      guide_costs: acc.guide_costs + item.guide_costs,
      escort_costs: acc.escort_costs + item.escort_costs,
      headphone_costs: acc.headphone_costs + item.headphone_costs,
      printing_costs: acc.printing_costs + item.printing_costs,
      total_costs: acc.total_costs + item.total_costs,
      profit: acc.profit + item.profit,
      booking_count: acc.booking_count + item.booking_count,
      pax_count: acc.pax_count + item.pax_count
    }), {
      revenue: 0,
      guide_costs: 0,
      escort_costs: 0,
      headphone_costs: 0,
      printing_costs: 0,
      total_costs: 0,
      profit: 0,
      booking_count: 0,
      pax_count: 0
    })

    const overallMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0

    return NextResponse.json({
      data: {
        items,
        totals: {
          ...totals,
          margin: overallMargin
        },
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
