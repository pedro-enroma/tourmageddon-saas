'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Link2, ChevronDown, ChevronRight, Info, Calendar, Users, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Guide {
  guide_id: string
  first_name: string
  last_name: string
}

interface ActivityAvailability {
  id: number
  activity_id: string
  local_date: string
  local_time: string
  vacancy_sold: number
  activity_title?: string
}

interface TimeSlotSplit {
  id: string
  split_name: string
  guide_id: string | null
  guide_name?: string
  pax: number
  activity_availability_id: number
  activity_title?: string
}

interface ServiceGroup {
  id: string
  service_date: string
  service_time: string
  group_name: string | null
  guide_id: string | null
  guide_name?: string
  total_pax: number
  calculated_cost: number | null
  members: {
    id: string
    activity_availability_id: number
    time_slot_split_id?: string
    activity_title?: string
    split_name?: string
    pax?: number
  }[]
}

interface TimeSlot {
  time: string
  availabilities: ActivityAvailability[]
  splits: TimeSlotSplit[]
}

// Selection can be either a whole availability or a specific split
interface SelectionItem {
  availability_id: number
  split_id?: string
  label: string
  pax: number
}

export default function ServiceGroupsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Data
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>([])
  const [activityCosts, setActivityCosts] = useState<Map<string, number>>(new Map())
  const [guides, setGuides] = useState<Guide[]>([])

  // Filters
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })

  // UI State
  const [expandedTimes, setExpandedTimes] = useState<Set<string>>(new Set())
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectionItem>>(new Map()) // key: "avail:123" or "split:uuid"
  const [newGroupName, setNewGroupName] = useState('')
  const [creatingForTime, setCreatingForTime] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // 1. First fetch existing service groups for this date (use API to bypass RLS)
      const groupsResponse = await fetch(`/api/costs/service-groups?service_date=${selectedDate}`)
      const groupsResult = await groupsResponse.json()

      if (!groupsResponse.ok) {
        throw new Error(groupsResult.error || 'Failed to fetch groups')
      }

      const groups = groupsResult.data || []

      // Get all grouped availability IDs
      const groupedAvailabilityIds = new Set<number>()
      groups?.forEach((g: { guide_service_group_members?: { activity_availability_id: number }[] }) => {
        g.guide_service_group_members?.forEach(m => {
          groupedAvailabilityIds.add(m.activity_availability_id)
        })
      })

      // 2. Fetch details for grouped availabilities
      const groupedAvailabilityDetails = new Map<number, { activity_id: string; activity_title: string; pax: number }>()
      if (groupedAvailabilityIds.size > 0) {
        // Fetch availability details including vacancy_sold directly
        const { data: groupedAvails } = await supabase
          .from('activity_availability')
          .select('id, activity_id, local_time, vacancy_sold')
          .in('id', Array.from(groupedAvailabilityIds))

        if (groupedAvails) {
          const activityIds = [...new Set(groupedAvails.map(a => a.activity_id))]
          const { data: activities } = await supabase
            .from('activities')
            .select('activity_id, title')
            .in('activity_id', activityIds)

          const activityMap = new Map(activities?.map(a => [a.activity_id, a.title]) || [])

          groupedAvails.forEach((a: { id: number; activity_id: string; local_time: string; vacancy_sold: number }) => {
            groupedAvailabilityDetails.set(a.id, {
              activity_id: a.activity_id,
              activity_title: activityMap.get(a.activity_id) || 'Unknown Activity',
              pax: a.vacancy_sold || 0
            })
          })
        }
      }

      // 3. Fetch guide names for groups that have guides assigned
      const guideIds = [...new Set(groups?.filter((g: { guide_id: string | null }) => g.guide_id).map((g: { guide_id: string | null }) => g.guide_id) || [])]
      let guideMap = new Map<string, string>()
      if (guideIds.length > 0) {
        const { data: guides } = await supabase
          .from('guides')
          .select('guide_id, first_name, last_name')
          .in('guide_id', guideIds)
        guideMap = new Map(guides?.map(g => [g.guide_id, `${g.first_name} ${g.last_name}`]) || [])
      }

      // 4. Fetch ALL time slot splits for the date using the API (same source used for "Available Services to Group")
      const splitsResponse = await fetch(`/api/time-slot-splits?date=${selectedDate}`)
      const splitsResult = await splitsResponse.json()
      const allDateSplits = splitsResult.data || []

      // Build maps for split names and pax
      const splitPaxMap = new Map<string, number>()
      const splitNameMap = new Map<string, string>()

      // Calculate pax for each split from its bookings
      for (const split of allDateSplits) {
        splitNameMap.set(split.id, split.split_name)

        // Get booking IDs assigned to this split
        const splitBookingIds = split.time_slot_split_bookings?.map((b: { activity_booking_id: number }) => b.activity_booking_id) || []

        if (splitBookingIds.length > 0) {
          // Fetch pax for these bookings
          const { data: splitBookingsData } = await supabase
            .from('activity_bookings')
            .select('pricing_category_bookings(quantity)')
            .in('activity_booking_id', splitBookingIds)

          const splitPax = splitBookingsData?.reduce((sum, b) => {
            return sum + (b.pricing_category_bookings?.reduce((s: number, p: { quantity: number }) => s + (p.quantity || 0), 0) || 0)
          }, 0) || 0

          splitPaxMap.set(split.id, splitPax)
        } else {
          splitPaxMap.set(split.id, 0)
        }
      }

      // Enrich groups with member details
      const enrichedGroups: ServiceGroup[] = groups?.map((g: {
        id: string
        service_date: string
        service_time: string
        group_name: string | null
        guide_id: string | null
        total_pax: number
        calculated_cost: number | null
        guide_service_group_members?: { id: string; activity_availability_id: number; time_slot_split_id?: string }[]
      }) => ({
        id: g.id,
        service_date: g.service_date,
        service_time: g.service_time.substring(0, 5), // Normalize to HH:MM
        group_name: g.group_name,
        guide_id: g.guide_id,
        guide_name: g.guide_id ? guideMap.get(g.guide_id) : undefined,
        total_pax: g.total_pax,
        calculated_cost: g.calculated_cost,
        members: g.guide_service_group_members?.map(m => {
          const details = groupedAvailabilityDetails.get(m.activity_availability_id)
          // For splits: use split pax (from splitPaxMap)
          // For whole availabilities: use vacancy_sold from availability
          let pax: number
          if (m.time_slot_split_id) {
            // This is a split - use the split's specific pax
            pax = splitPaxMap.get(m.time_slot_split_id) ?? 0
          } else {
            // This is a whole availability - use vacancy_sold
            pax = details?.pax || 0
          }
          const splitName = m.time_slot_split_id
            ? splitNameMap.get(m.time_slot_split_id)
            : undefined
          return {
            id: m.id,
            activity_availability_id: m.activity_availability_id,
            time_slot_split_id: m.time_slot_split_id,
            activity_title: details?.activity_title || 'Unknown',
            split_name: splitName,
            pax
          }
        }) || []
      })) || []

      setServiceGroups(enrichedGroups)

      // 4. Fetch actual bookings from activity_bookings
      const { data: bookings, error: bookingsError } = await supabase
        .from('activity_bookings')
        .select(`
          activity_booking_id,
          activity_id,
          start_time,
          pricing_category_bookings (
            quantity
          )
        `)
        .not('status', 'in', '(CANCELLED)')
        .gte('start_date_time', `${selectedDate}T00:00:00`)
        .lte('start_date_time', `${selectedDate}T23:59:59`)

      if (bookingsError) throw new Error(bookingsError.message)

      // Fetch activity titles
      const activityIds = [...new Set(bookings?.map(b => b.activity_id) || [])]

      if (activityIds.length === 0 && enrichedGroups.length === 0) {
        setTimeSlots([])
        setExpandedTimes(new Set(enrichedGroups.map(g => g.service_time)))
        setLoading(false)
        return
      }

      const { data: activities } = await supabase
        .from('activities')
        .select('activity_id, title')
        .in('activity_id', activityIds)

      const activityMap = new Map(activities?.map(a => [a.activity_id, a.title]) || [])

      // Get activity_availability IDs for these bookings
      const { data: availabilities } = await supabase
        .from('activity_availability')
        .select('id, activity_id, local_time')
        .eq('local_date', selectedDate)
        .in('activity_id', activityIds)

      // Create a map of activity_id + time -> availability_id
      const availabilityMap = new Map<string, number>()
      availabilities?.forEach(a => {
        const timeShort = a.local_time.substring(0, 5)
        availabilityMap.set(`${a.activity_id}:${a.local_time}`, a.id)
        availabilityMap.set(`${a.activity_id}:${timeShort}`, a.id)
      })

      // Group bookings by activity_id and time, summing pax
      const bookingsByActivityTime = new Map<string, {
        activity_id: string
        time: string
        total_pax: number
        activity_title: string
        availability_id: number | undefined
      }>()

      bookings?.forEach(b => {
        const time = b.start_time
        const key = `${b.activity_id}:${time}`
        const pax = b.pricing_category_bookings?.reduce((sum: number, p: { quantity: number }) => sum + (p.quantity || 0), 0) || 0

        if (bookingsByActivityTime.has(key)) {
          bookingsByActivityTime.get(key)!.total_pax += pax
        } else {
          bookingsByActivityTime.set(key, {
            activity_id: b.activity_id,
            time,
            total_pax: pax,
            activity_title: activityMap.get(b.activity_id) || 'Unknown Activity',
            availability_id: availabilityMap.get(key)
          })
        }
      })

      // Convert to availabilities array (excluding already grouped ones)
      const enriched: ActivityAvailability[] = []
      bookingsByActivityTime.forEach(b => {
        if (b.availability_id && b.total_pax > 0 && !groupedAvailabilityIds.has(b.availability_id)) {
          const normalizedTime = b.time.length === 5 ? b.time : b.time.substring(0, 5)
          enriched.push({
            id: b.availability_id,
            activity_id: b.activity_id,
            local_date: selectedDate,
            local_time: normalizedTime,
            vacancy_sold: b.total_pax,
            activity_title: b.activity_title
          })
        }
      })

      // Group by time
      const slotMap = new Map<string, ActivityAvailability[]>()
      enriched.forEach(a => {
        if (!slotMap.has(a.local_time)) {
          slotMap.set(a.local_time, [])
        }
        slotMap.get(a.local_time)!.push(a)
      })

      // Group splits by availability_id and enrich with activity titles (reusing allDateSplits from earlier)
      const splitsByAvailability = new Map<number, TimeSlotSplit[]>()
      for (const split of allDateSplits) {
        const availId = split.activity_availability_id
        if (!splitsByAvailability.has(availId)) {
          splitsByAvailability.set(availId, [])
        }

        // Use the pax we already calculated in splitPaxMap
        const splitPax = splitPaxMap.get(split.id) || 0

        // Get activity title from availability
        const { data: availData } = await supabase
          .from('activity_availability')
          .select('activity_id')
          .eq('id', availId)
          .single()

        const activityTitle = availData?.activity_id ? activityMap.get(availData.activity_id) : undefined

        // Get guide name if assigned
        let guideName: string | undefined
        if (split.guide_id) {
          const { data: guideData } = await supabase
            .from('guides')
            .select('first_name, last_name')
            .eq('guide_id', split.guide_id)
            .single()
          guideName = guideData ? `${guideData.first_name} ${guideData.last_name}` : undefined
        }

        splitsByAvailability.get(availId)!.push({
          id: split.id,
          split_name: split.split_name,
          guide_id: split.guide_id,
          guide_name: guideName,
          pax: splitPax,
          activity_availability_id: availId,
          activity_title: activityTitle
        })
      }

      // Convert to array - include slots with 2+ services/splits OR that have groups
      const groupTimes = new Set(enrichedGroups.map(g => g.service_time))
      const slots: TimeSlot[] = []
      slotMap.forEach((avails, time) => {
        // Get splits for availabilities in this time slot
        const splitsForSlot: TimeSlotSplit[] = []
        avails.forEach(a => {
          const splits = splitsByAvailability.get(a.id) || []
          splitsForSlot.push(...splits)
        })

        // Count total items (services without splits + individual splits)
        const availsWithoutSplits = avails.filter(a => !splitsByAvailability.has(a.id) || splitsByAvailability.get(a.id)!.length === 0)
        const totalItems = availsWithoutSplits.length + splitsForSlot.length

        if (totalItems >= 2 || groupTimes.has(time)) {
          slots.push({ time, availabilities: avails, splits: splitsForSlot })
        }
      })

      // Also add time slots that only have groups (no ungrouped services)
      groupTimes.forEach(time => {
        if (!slotMap.has(time)) {
          slots.push({ time, availabilities: [], splits: [] })
        }
      })

      // Sort by time
      slots.sort((a, b) => a.time.localeCompare(b.time))
      setTimeSlots(slots)

      // Expand all times by default
      setExpandedTimes(new Set(slots.map(s => s.time)))

      // Fetch activity costs (global costs only)
      const { data: costs } = await supabase
        .from('guide_activity_costs')
        .select('activity_id, cost_amount')
        .is('guide_id', null)

      const costMap = new Map<string, number>()
      costs?.forEach(c => costMap.set(c.activity_id, c.cost_amount))
      setActivityCosts(costMap)

      // Fetch guides assigned to this date (from guide_assignments for all availabilities - both grouped and ungrouped)
      const enrichedIds = enriched.map(a => a.id)
      const groupedIds = Array.from(groupedAvailabilityIds)
      const allAvailabilityIds = [...enrichedIds, ...groupedIds]

      if (allAvailabilityIds.length > 0) {
        const { data: assignments } = await supabase
          .from('guide_assignments')
          .select('guide_id')
          .in('activity_availability_id', allAvailabilityIds)

        const uniqueGuideIds = [...new Set(assignments?.map(a => a.guide_id).filter(Boolean) || [])]

        if (uniqueGuideIds.length > 0) {
          const { data: guidesData } = await supabase
            .from('guides')
            .select('guide_id, first_name, last_name')
            .in('guide_id', uniqueGuideIds)
            .order('first_name')

          setGuides(guidesData || [])
        } else {
          setGuides([])
        }
      } else {
        setGuides([])
      }

    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle selection of availability or split
  const handleToggleSelection = (key: string, item: SelectionItem, time: string) => {
    if (creatingForTime && creatingForTime !== time) return

    setSelectedItems(prev => {
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, item)
      }

      if (next.size > 0 && !creatingForTime) {
        setCreatingForTime(time)
      } else if (next.size === 0) {
        setCreatingForTime(null)
      }

      return next
    })
  }

  const handleCreateGroup = async () => {
    if (selectedItems.size < 2) {
      setError('Select at least 2 services/splits to create a group')
      return
    }

    if (!newGroupName.trim()) {
      setError('Please enter a name for the group')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Convert selected items to the new members format
      const members = Array.from(selectedItems.values()).map(item => ({
        availability_id: item.availability_id,
        split_id: item.split_id
      }))

      const response = await fetch('/api/costs/service-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_date: selectedDate,
          service_time: creatingForTime,
          group_name: newGroupName.trim(),
          members
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create group')
      }

      setSuccess(`Group "${newGroupName}" created successfully`)
      setSelectedItems(new Map())
      setNewGroupName('')
      setCreatingForTime(null)
      fetchData()
    } catch (err) {
      console.error('Error creating group:', err)
      setError(err instanceof Error ? err.message : 'Failed to create group')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group?')) return

    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/costs/service-groups?id=${groupId}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete group')
      }

      setSuccess('Group deleted successfully')
      fetchData()
    } catch (err) {
      console.error('Error deleting group:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete group')
    } finally {
      setSaving(false)
    }
  }

  const handleAssignGuide = async (groupId: string, guideId: string | null) => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/costs/service-groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: groupId,
          guide_id: guideId === 'unassign' ? null : guideId
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to assign guide')
      }

      const guideName = guideId && guideId !== 'unassign'
        ? guides.find(g => g.guide_id === guideId)?.first_name
        : null
      setSuccess(guideName ? `Guide ${guideName} assigned to group` : 'Guide unassigned from group')
      fetchData()
    } catch (err) {
      console.error('Error assigning guide:', err)
      setError(err instanceof Error ? err.message : 'Failed to assign guide')
    } finally {
      setSaving(false)
    }
  }

  const cancelSelection = () => {
    setSelectedItems(new Map())
    setNewGroupName('')
    setCreatingForTime(null)
  }

  const toggleTime = (time: string) => {
    setExpandedTimes(prev => {
      const next = new Set(prev)
      if (next.has(time)) {
        next.delete(time)
      } else {
        next.add(time)
      }
      return next
    })
  }

  const formatTime = (time: string): string => {
    return time.substring(0, 5)
  }

  const getCostForActivity = (activityId: string): number => {
    return activityCosts.get(activityId) || 0
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Groups</h1>
          <p className="text-gray-600 mt-1">
            Group services happening at the same time. When a guide is assigned to one, they&apos;re assigned to all.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Date Picker */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            <Label htmlFor="date-select" className="font-medium">Select Date</Label>
          </div>
          <Input
            id="date-select"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-48"
          />
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <strong>How it works:</strong>
          <ol className="list-decimal ml-4 mt-1 space-y-1">
            <li>Select multiple services from the same time slot</li>
            <li>Give the group a name and create it</li>
            <li>When assigning a guide to any service in the group, they&apos;ll be auto-assigned to all</li>
            <li>For cost reports, only the highest-cost activity in the group is charged</li>
          </ol>
        </div>
      </div>

      {/* Creating Mode Banner */}
      {creatingForTime && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">
                  Creating group for {formatTime(creatingForTime)} slot
                </p>
                <p className="text-sm text-amber-600">
                  {selectedItems.size} item(s) selected
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input
                placeholder="Group name..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-48"
              />
              <Button
                onClick={handleCreateGroup}
                disabled={saving || selectedItems.size < 2 || !newGroupName.trim()}
                className="bg-brand-orange hover:bg-orange-600 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
                Create Group
              </Button>
              <Button variant="outline" onClick={cancelSelection}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-brand-orange" />
        </div>
      ) : timeSlots.length === 0 && serviceGroups.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No services or groups found for this date.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Always show existing groups at the top */}
          {serviceGroups.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Link2 className="h-5 w-5 text-green-600" />
                Existing Groups ({serviceGroups.length})
              </h2>
              {serviceGroups.map(group => (
                <div key={group.id} className="bg-white rounded-lg border border-green-200 overflow-hidden">
                  <div className="px-4 py-3 bg-green-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-brand-orange">
                        {formatTime(group.service_time)}
                      </span>
                      <Link2 className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-800">{group.group_name || 'Unnamed Group'}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteGroup(group.id)}
                      disabled={saving}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                  <div className="p-4 space-y-3">
                    {/* Guide Assignment */}
                    <div className="flex items-center gap-3 pb-3 border-b border-gray-200">
                      <UserPlus className="h-4 w-4 text-gray-500" />
                      <Label className="text-sm font-medium text-gray-700">Assign Guide:</Label>
                      <Select
                        value={group.guide_id || 'unassign'}
                        onValueChange={(value) => handleAssignGuide(group.id, value)}
                        disabled={saving}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Select a guide..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassign">
                            <span className="text-gray-500">No guide assigned</span>
                          </SelectItem>
                          {guides.map(guide => (
                            <SelectItem key={guide.guide_id} value={guide.guide_id}>
                              {guide.first_name} {guide.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {group.guide_name && (
                        <span className="text-sm text-green-600 font-medium">
                          Currently: {group.guide_name}
                        </span>
                      )}
                    </div>
                    {/* Members */}
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-700 mb-2">Services in this group:</p>
                      {group.members.length > 0 ? (
                        group.members.map(member => (
                          <div key={member.id} className={`flex items-center justify-between text-sm py-1 px-2 rounded ${member.time_slot_split_id ? 'bg-purple-50 border-l-2 border-purple-300' : 'bg-gray-50'}`}>
                            <span>
                              {member.activity_title}
                              {member.time_slot_split_id && (
                                <span className="ml-2 text-xs font-medium text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">
                                  Split-group
                                </span>
                              )}
                            </span>
                            <span className="text-gray-500">{member.pax} pax</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500 italic">No members found</div>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
                    Group cost: <span className="font-bold text-green-700">€{(group.calculated_cost || 0).toFixed(2)}</span>
                    {' • '}Total pax: <span className="font-medium">{group.total_pax}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Time slots with ungrouped services available for grouping */}
          {timeSlots.filter(s => {
            // Count items: availabilities without splits + individual splits
            const availsWithSplits = new Set(s.splits.map(sp => sp.activity_availability_id))
            const availsWithoutSplits = s.availabilities.filter(a => !availsWithSplits.has(a.id))
            return availsWithoutSplits.length + s.splits.length >= 2
          }).length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Available Services to Group</h2>
              {timeSlots.filter(s => {
                const availsWithSplits = new Set(s.splits.map(sp => sp.activity_availability_id))
                const availsWithoutSplits = s.availabilities.filter(a => !availsWithSplits.has(a.id))
                return availsWithoutSplits.length + s.splits.length >= 2
              }).map(slot => {
                // Separate availabilities that have splits from those that don't
                const availsWithSplits = new Set(slot.splits.map(sp => sp.activity_availability_id))
                const availsWithoutSplits = slot.availabilities.filter(a => !availsWithSplits.has(a.id))

                const totalItems = availsWithoutSplits.length + slot.splits.length
                const totalPax = availsWithoutSplits.reduce((sum, a) => sum + (a.vacancy_sold || 0), 0) +
                  slot.splits.reduce((sum, sp) => sum + sp.pax, 0)

                return (
                  <div key={slot.time} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => toggleTime(slot.time)}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold text-brand-orange">
                          {formatTime(slot.time)}
                        </span>
                        <span className="text-sm text-gray-500">
                          {totalItems} items • {totalPax} pax
                          {slot.splits.length > 0 && (
                            <span className="ml-2 text-purple-600">({slot.splits.length} split groups)</span>
                          )}
                        </span>
                      </div>
                      {expandedTimes.has(slot.time) ? (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      )}
                    </button>

                    {expandedTimes.has(slot.time) && (
                      <div className="p-4 space-y-2">
                        {/* Show availabilities without splits */}
                        {availsWithoutSplits.map(avail => {
                          const key = `avail:${avail.id}`
                          const isSelected = selectedItems.has(key)
                          const canSelect = !creatingForTime || creatingForTime === slot.time

                          return (
                            <div
                              key={key}
                              className={`flex items-center justify-between py-2 px-3 rounded border ${
                                isSelected
                                  ? 'bg-amber-50 border-amber-300'
                                  : canSelect
                                  ? 'bg-gray-50 border-gray-200 hover:border-gray-300 cursor-pointer'
                                  : 'bg-gray-100 border-gray-200 opacity-50'
                              }`}
                              onClick={() => canSelect && handleToggleSelection(key, {
                                availability_id: avail.id,
                                label: avail.activity_title || 'Unknown',
                                pax: avail.vacancy_sold
                              }, slot.time)}
                            >
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={isSelected}
                                  disabled={!canSelect}
                                  onCheckedChange={() => canSelect && handleToggleSelection(key, {
                                    availability_id: avail.id,
                                    label: avail.activity_title || 'Unknown',
                                    pax: avail.vacancy_sold
                                  }, slot.time)}
                                />
                                <span className="text-sm text-gray-900">{avail.activity_title}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span className="flex items-center gap-1">
                                  <Users className="h-4 w-4" />
                                  {avail.vacancy_sold} pax
                                </span>
                                <span>€{getCostForActivity(avail.activity_id).toFixed(2)}</span>
                              </div>
                            </div>
                          )
                        })}

                        {/* Show splits as separate selectable items */}
                        {slot.splits.length > 0 && (
                          <>
                            {availsWithoutSplits.length > 0 && (
                              <div className="border-t border-gray-200 my-3 pt-3">
                                <p className="text-xs text-purple-600 font-medium mb-2">Split Groups:</p>
                              </div>
                            )}
                            {slot.splits.map(split => {
                              const key = `split:${split.id}`
                              const isSelected = selectedItems.has(key)
                              const canSelect = !creatingForTime || creatingForTime === slot.time

                              return (
                                <div
                                  key={key}
                                  className={`flex items-center justify-between py-2 px-3 rounded border-l-4 ${
                                    isSelected
                                      ? 'bg-purple-50 border-purple-400 border'
                                      : canSelect
                                      ? 'bg-purple-50/50 border-purple-300 border hover:border-purple-400 cursor-pointer'
                                      : 'bg-gray-100 border-gray-200 opacity-50'
                                  }`}
                                  onClick={() => canSelect && handleToggleSelection(key, {
                                    availability_id: split.activity_availability_id,
                                    split_id: split.id,
                                    label: `${split.activity_title} - ${split.split_name}`,
                                    pax: split.pax
                                  }, slot.time)}
                                >
                                  <div className="flex items-center gap-3">
                                    <Checkbox
                                      checked={isSelected}
                                      disabled={!canSelect}
                                      onCheckedChange={() => canSelect && handleToggleSelection(key, {
                                        availability_id: split.activity_availability_id,
                                        split_id: split.id,
                                        label: `${split.activity_title} - ${split.split_name}`,
                                        pax: split.pax
                                      }, slot.time)}
                                    />
                                    <div>
                                      <span className="text-sm text-gray-900">{split.activity_title}</span>
                                      <span className="ml-2 text-xs font-medium text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">
                                        {split.split_name}
                                      </span>
                                      {split.guide_name && (
                                        <span className="ml-2 text-xs text-gray-500">
                                          ({split.guide_name})
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Users className="h-4 w-4" />
                                      {split.pax} pax
                                    </span>
                                  </div>
                                </div>
                              )
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Message when no services available to group but also no groups */}
          {timeSlots.filter(s => {
            const availsWithSplits = new Set(s.splits.map(sp => sp.activity_availability_id))
            const availsWithoutSplits = s.availabilities.filter(a => !availsWithSplits.has(a.id))
            return availsWithoutSplits.length + s.splits.length >= 2
          }).length === 0 && serviceGroups.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No services available to group for this date.</p>
              <p className="text-sm mt-1">Select a date with multiple services at the same time.</p>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {serviceGroups.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-medium text-gray-900 mb-3">Groups Summary for {selectedDate}</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Total Groups:</span>{' '}
              <span className="font-medium">{serviceGroups.length}</span>
            </div>
            <div>
              <span className="text-gray-500">With Guide:</span>{' '}
              <span className="font-medium">{serviceGroups.filter(g => g.guide_id).length}</span>
            </div>
            <div>
              <span className="text-gray-500">Pending Assignment:</span>{' '}
              <span className="font-medium text-amber-600">{serviceGroups.filter(g => !g.guide_id).length}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
