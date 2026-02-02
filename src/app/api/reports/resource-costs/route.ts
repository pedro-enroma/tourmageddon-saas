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

    // Phase 1: Fetch assignments and reference data in parallel
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
      seasonsResult,
      seasonalCostsResult,
      specialDatesResult,
      specialDateCostsResult,
      guideSpecificSeasonalCostsResult,
      guideSpecificSpecialDateCostsResult,
      specialGuideRulesResult
    ] = await Promise.all([
      supabase.from('guides').select('guide_id, first_name, last_name, paid_in_cash'),
      supabase.from('escorts').select('escort_id, first_name, last_name'),
      supabase.from('headphones').select('headphone_id, name'),
      supabase.from('printing').select('printing_id, name'),
      // Use join to filter assignments by date range via activity_availability
      resource_types.includes('guide') ? supabase
        .from('guide_assignments')
        .select('assignment_id, guide_id, activity_availability_id, activity_availability!inner(local_date)')
        .gte('activity_availability.local_date', start_date)
        .lte('activity_availability.local_date', end_date)
        .limit(10000)
        : { data: [] },
      resource_types.includes('escort') ? supabase
        .from('escort_assignments')
        .select('assignment_id, escort_id, activity_availability_id, activity_availability!inner(local_date)')
        .gte('activity_availability.local_date', start_date)
        .lte('activity_availability.local_date', end_date)
        .limit(10000)
        : { data: [] },
      resource_types.includes('headphone') ? supabase
        .from('headphone_assignments')
        .select('assignment_id, headphone_id, activity_availability_id, activity_availability!inner(local_date)')
        .gte('activity_availability.local_date', start_date)
        .lte('activity_availability.local_date', end_date)
        .limit(10000)
        : { data: [] },
      resource_types.includes('printing') ? supabase
        .from('printing_assignments')
        .select('assignment_id, printing_id, activity_availability_id, activity_availability!inner(local_date)')
        .gte('activity_availability.local_date', start_date)
        .lte('activity_availability.local_date', end_date)
        .limit(10000)
        : { data: [] },
      supabase.from('guide_activity_costs').select('*'),
      supabase.from('resource_rates').select('*'),
      supabase.from('assignment_cost_overrides').select('*'),
      supabase.from('guide_service_groups').select('*, guide_service_group_members(*)'),
      supabase.from('activities').select('activity_id, title'),
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

    // Phase 2: Collect all unique activity_availability_ids from assignments and service groups
    const allAvailabilityIds = new Set<number>()

    guideAssignmentsResult.data?.forEach(a => allAvailabilityIds.add(a.activity_availability_id))
    escortAssignmentsResult.data?.forEach(a => allAvailabilityIds.add(a.activity_availability_id))
    headphoneAssignmentsResult.data?.forEach(a => allAvailabilityIds.add(a.activity_availability_id))
    printingAssignmentsResult.data?.forEach(a => allAvailabilityIds.add(a.activity_availability_id))

    // Also include availability IDs from service groups
    serviceGroupsResult.data?.forEach(g => {
      g.guide_service_group_members?.forEach((m: { activity_availability_id: number }) => {
        allAvailabilityIds.add(m.activity_availability_id)
      })
    })

    // Phase 3: Fetch only the availability records we need (by ID, not date range)
    // Split into batches of 500 to avoid URL length limits
    const availabilityIdsArray = Array.from(allAvailabilityIds)
    const availabilityBatches: number[][] = []
    for (let i = 0; i < availabilityIdsArray.length; i += 500) {
      availabilityBatches.push(availabilityIdsArray.slice(i, i + 500))
    }

    const availabilityResults = await Promise.all(
      availabilityBatches.map(batch =>
        supabase
          .from('activity_availability')
          .select('id, activity_id, local_date, local_time, vacancy_sold')
          .in('id', batch)
      )
    )

    // Combine all availability results
    const allAvailabilityData = availabilityResults.flatMap(r => r.data || [])

    // Debug logging
    console.log('=== RESOURCE COSTS DEBUG ===')
    console.log('Guide assignments returned:', guideAssignmentsResult.data?.length || 0)
    console.log('Unique availability IDs needed:', allAvailabilityIds.size)
    console.log('Availability records fetched:', allAvailabilityData.length)
    console.log('Service groups returned:', serviceGroupsResult.data?.length || 0)
    console.log('Seasons loaded:', seasonsResult.data?.length || 0)
    console.log('Seasonal costs loaded:', seasonalCostsResult.data?.length || 0)
    console.log('Legacy activity costs loaded:', guideActivityCostsResult.data?.length || 0)
    if (seasonsResult.data?.length) {
      console.log('Seasons:', seasonsResult.data.map(s => `${s.name}: ${s.start_date} to ${s.end_date}`))
    }
    if (seasonalCostsResult.data?.length) {
      console.log('Sample seasonal costs:', seasonalCostsResult.data.slice(0, 5).map(sc => `activity ${sc.activity_id} season ${sc.season_id}: €${sc.cost_amount}`))
    }

    // Build lookup maps
    const guidesMap = new Map(guidesResult.data?.map(g => [g.guide_id, `${g.first_name} ${g.last_name}`]) || [])
    const escortsMap = new Map(escortsResult.data?.map(e => [e.escort_id, `${e.first_name} ${e.last_name}`]) || [])
    const headphonesMap = new Map(headphonesResult.data?.map(h => [h.headphone_id, h.name]) || [])
    const printingMap = new Map(printingResult.data?.map(p => [p.printing_id, p.name]) || [])
    const activitiesMap = new Map(activitiesResult.data?.map(a => [String(a.activity_id), a.title]) || [])

    // Build set of cash-paid guide IDs to exclude from cost reports
    const cashPaidGuideIds = new Set(
      guidesResult.data?.filter(g => g.paid_in_cash).map(g => g.guide_id) || []
    )

    const availabilityMap = new Map(allAvailabilityData.map(a => [a.id, a]))

    // Build activity costs map - prefer global costs (null guide_id), fall back to guide-specific
    const activityCostsMap = new Map<string, number>()
    const guideSpecificCostsMap = new Map<string, number>()

    guideActivityCostsResult.data?.forEach(c => {
      if (!c.guide_id) {
        // Global cost (applies to all guides)
        activityCostsMap.set(String(c.activity_id), c.cost_amount)
      } else {
        // Guide-specific cost (for backward compatibility)
        guideSpecificCostsMap.set(`${c.guide_id}:${String(c.activity_id)}`, c.cost_amount)
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
    // IMPORTANT: Convert activity_id to string to ensure consistent lookups
    const specialDateCostMap = new Map(
      specialDateCosts.map(sdc => [`${String(sdc.activity_id)}:${String(sdc.special_date_id)}`, sdc.cost_amount])
    )

    // Map: activity_id:season_id -> cost
    // IMPORTANT: Convert activity_id to string to ensure consistent lookups
    const seasonalCostMap = new Map(
      seasonalCosts.map(sc => [`${String(sc.activity_id)}:${String(sc.season_id)}`, sc.cost_amount])
    )

    // Build guide-specific cost maps (for special guide rules)
    const guideSpecificSeasonalCosts = (guideSpecificSeasonalCostsResult.data || []) as GuideSpecificSeasonalCost[]
    const guideSpecificSpecialDateCosts = (guideSpecificSpecialDateCostsResult.data || []) as GuideSpecificSpecialDateCost[]

    // Map: guide_id:activity_id:special_date_id -> cost (guide-specific special date cost)
    const guideSpecificSpecialDateCostMap = new Map(
      guideSpecificSpecialDateCosts.map(c => [`${c.guide_id}:${String(c.activity_id)}:${String(c.special_date_id)}`, c.cost_amount])
    )

    // Map: guide_id:activity_id:season_id -> cost (guide-specific seasonal cost)
    const guideSpecificSeasonalCostMap = new Map(
      guideSpecificSeasonalCosts.map(c => [`${c.guide_id}:${String(c.activity_id)}:${String(c.season_id)}`, c.cost_amount])
    )

    // Set of guide+activity combinations with special rules
    const specialGuideActivityPairs = new Set(
      specialGuideRulesResult.data?.map(r => `${r.guide_id}:${String(r.activity_id)}`) || []
    )

    // Debug: log the seasonal cost map keys
    console.log('Seasonal cost map keys:', Array.from(seasonalCostMap.keys()).slice(0, 10))
    console.log('Seasonal cost map sample values:', Array.from(seasonalCostMap.entries()).slice(0, 5))

    // Helper to get guide cost for a specific activity and date
    // Returns the HIGHEST cost among all applicable costs (special date, seasonal, legacy)
    // Track statistics for debugging
    const costLookupStats = { found: 0, notFound: 0, noCostActivities: new Set<string>() }

    const getGuideCostForDate = (activityId: string | number, date: string, guideId?: string): number => {
      // Normalize activity_id to string for consistent lookups
      const activityIdStr = String(activityId)

      // Check if this guide has a special rule for this activity
      // If so, use guide-specific costs with highest priority
      if (guideId && specialGuideActivityPairs.has(`${guideId}:${activityIdStr}`)) {
        // 1. Check guide-specific special date cost (highest priority)
        const specialDateId = specialDateMap.get(date)
        if (specialDateId) {
          const guideSpecificSpecialCost = guideSpecificSpecialDateCostMap.get(`${guideId}:${activityIdStr}:${specialDateId}`)
          if (guideSpecificSpecialCost !== undefined) {
            costLookupStats.found++
            return guideSpecificSpecialCost
          }
        }

        // 2. Check guide-specific seasonal cost
        const dateObj = new Date(date)
        for (const season of seasons) {
          const seasonStart = new Date(season.start_date)
          const seasonEnd = new Date(season.end_date)
          if (dateObj >= seasonStart && dateObj <= seasonEnd) {
            const guideSpecificSeasonalCost = guideSpecificSeasonalCostMap.get(`${guideId}:${activityIdStr}:${String(season.id)}`)
            if (guideSpecificSeasonalCost !== undefined) {
              costLookupStats.found++
              return guideSpecificSeasonalCost
            }
          }
        }
        // If guide has special rule but no specific cost set, fall through to default costs
      }

      // Default cost lookup (for guides without special rules, or fallback)
      const applicableCosts: number[] = []

      // 3. Check default special date cost
      const specialDateId = specialDateMap.get(date)
      if (specialDateId) {
        const specialCost = specialDateCostMap.get(`${activityIdStr}:${specialDateId}`)
        if (specialCost !== undefined) {
          applicableCosts.push(specialCost)
        }
      }

      // 4. Check default seasonal cost
      const dateObj = new Date(date)
      for (const season of seasons) {
        const seasonStart = new Date(season.start_date)
        const seasonEnd = new Date(season.end_date)
        if (dateObj >= seasonStart && dateObj <= seasonEnd) {
          const lookupKey = `${activityIdStr}:${String(season.id)}`
          const seasonalCost = seasonalCostMap.get(lookupKey)
          if (seasonalCost !== undefined) {
            applicableCosts.push(seasonalCost)
          }
        }
      }

      // 5. Check legacy global cost
      const globalCost = activityCostsMap.get(activityIdStr)
      if (globalCost !== undefined) {
        applicableCosts.push(globalCost)
      }

      // 6. Guide-specific cost from old guide_activity_costs table (backward compatibility)
      if (guideId) {
        const legacyGuideSpecificCost = guideSpecificCostsMap.get(`${guideId}:${activityIdStr}`)
        if (legacyGuideSpecificCost !== undefined) {
          applicableCosts.push(legacyGuideSpecificCost)
        }
      }

      // Track statistics
      if (applicableCosts.length > 0) {
        costLookupStats.found++
      } else {
        costLookupStats.notFound++
        costLookupStats.noCostActivities.add(activityIdStr)
      }

      // Return the highest cost, or 0 if no costs found
      return applicableCosts.length > 0 ? Math.max(...applicableCosts) : 0
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

    // Build service groups map (activity_availability_id -> group info)
    // Service groups share one guide across multiple availabilities - we should only count ONCE per group
    // with the HIGHEST cost activity in that group
    const availabilityToGroupMap = new Map<number, {
      group_id: string
      guide_id: string | null
      service_date: string
      calculated_cost: number | null
      all_availability_ids: number[]
    }>()

    // Track which groups we've already processed (to avoid counting multiple times)
    const processedGroups = new Set<string>()

    serviceGroupsResult.data?.forEach(g => {
      const availabilityIds = g.guide_service_group_members?.map((m: { activity_availability_id: number }) => m.activity_availability_id) || []

      availabilityIds.forEach((availId: number) => {
        availabilityToGroupMap.set(availId, {
          group_id: g.id,
          guide_id: g.guide_id,
          service_date: g.service_date,
          calculated_cost: g.calculated_cost,
          all_availability_ids: availabilityIds
        })
      })
    })

    // Process guide assignments
    if (resource_types.includes('guide')) {
      guideAssignmentsResult.data?.forEach(assignment => {
        // Skip guides that are paid in cash (excluded from cost reports)
        if (cashPaidGuideIds.has(assignment.guide_id)) return

        const availability = availabilityMap.get(assignment.activity_availability_id)
        if (!availability) return

        const groupInfo = availabilityToGroupMap.get(assignment.activity_availability_id)

        // If this assignment is part of a service group
        if (groupInfo) {
          // Skip if we've already processed this group
          if (processedGroups.has(groupInfo.group_id)) return
          processedGroups.add(groupInfo.group_id)

          // For service groups, find the HIGHEST cost among all activities in the group
          let highestCost = 0
          let highestCostActivityId = String(availability.activity_id)
          let highestCostActivityTitle = activitiesMap.get(String(availability.activity_id)) || 'Unknown Activity'

          for (const availId of groupInfo.all_availability_ids) {
            const avail = availabilityMap.get(availId)
            if (!avail) continue

            const activityCost = getGuideCostForDate(String(avail.activity_id), avail.local_date, assignment.guide_id)
            if (activityCost > highestCost) {
              highestCost = activityCost
              highestCostActivityId = String(avail.activity_id)
              highestCostActivityTitle = activitiesMap.get(String(avail.activity_id)) || 'Unknown Activity'
            }
          }

          // Use group's calculated_cost if explicitly set (> 0), otherwise use highest computed cost
          const finalCost = (groupInfo.calculated_cost && groupInfo.calculated_cost > 0) ? groupInfo.calculated_cost : highestCost

          costItems.push({
            resource_type: 'guide',
            resource_id: assignment.guide_id,
            resource_name: guidesMap.get(assignment.guide_id) || 'Unknown Guide',
            date: availability.local_date,
            activity_id: highestCostActivityId,
            activity_title: highestCostActivityTitle,
            assignment_id: assignment.assignment_id,
            cost_amount: finalCost,
            currency: 'EUR',
            is_grouped: true,
            group_id: groupInfo.group_id
          })
        } else {
          // Regular assignment (not in a group)
          // Check for override first (highest priority)
          let cost = overridesMap.get(`guide:${assignment.assignment_id}`)

          if (cost === undefined) {
            // Use cost lookup - returns highest among all applicable costs
            cost = getGuideCostForDate(String(availability.activity_id), availability.local_date, assignment.guide_id)
          }

          costItems.push({
            resource_type: 'guide',
            resource_id: assignment.guide_id,
            resource_name: guidesMap.get(assignment.guide_id) || 'Unknown Guide',
            date: availability.local_date,
            activity_id: String(availability.activity_id),
            activity_title: activitiesMap.get(String(availability.activity_id)) || 'Unknown Activity',
            assignment_id: assignment.assignment_id,
            cost_amount: cost,
            currency: 'EUR',
            is_grouped: false,
            group_id: undefined
          })
        }
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
          activity_id: String(availability.activity_id),
          activity_title: activitiesMap.get(String(availability.activity_id)) || 'Unknown Activity',
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
          activity_id: String(availability.activity_id),
          activity_title: activitiesMap.get(String(availability.activity_id)) || 'Unknown Activity',
          assignment_id: assignment.assignment_id,
          pax_count: paxCount,
          cost_amount: cost,
          currency: 'EUR'
        })
      })
    }

    // Calculate summaries based on group_by
    const summaries: Record<string, { key: string; label: string; total_cost: number; count: number; total_pax: number }> = {}

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
        summaries[key] = { key, label, total_cost: 0, count: 0, total_pax: 0 }
      }
      summaries[key].total_cost += item.cost_amount
      summaries[key].count += 1
      // Add pax_count for headphones and printing resources
      if (item.pax_count) {
        summaries[key].total_pax += item.pax_count
      }
    })

    const totalCost = costItems.reduce((sum, item) => sum + item.cost_amount, 0)

    // Log cost lookup statistics
    console.log('=== COST LOOKUP STATS ===')
    console.log(`Found costs: ${costLookupStats.found} lookups`)
    console.log(`No costs found: ${costLookupStats.notFound} lookups`)
    if (costLookupStats.noCostActivities.size > 0) {
      console.log('Activities with NO cost configured:', Array.from(costLookupStats.noCostActivities))
    }
    console.log(`Total cost items: ${costItems.length}`)
    console.log(`Total cost: €${totalCost}`)

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
