'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { calendarSettingsApi } from '@/lib/api-client'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Users, MapPin, X, Settings, Pencil, User, UserCheck, Headphones } from 'lucide-react'
import { format, addWeeks, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'

type ViewMode = 'weekly' | 'daily'

interface ActivityAvailability {
  id: number
  activity_id: string
  availability_id: number
  local_date: string
  local_time: string
  local_date_time: string
  status: string
  vacancy_available: number
  vacancy_sold: number
  vacancy_opening: number
  actual_booking_count: number // Actual number of bookings from activity_bookings
  activity: {
    activity_id: string
    title: string
  }
  guide_assignments: {
    assignment_id: string
    guide: {
      guide_id: string
      first_name: string
      last_name: string
    }
  }[]
  escort_assignments: {
    assignment_id: string
    escort: {
      escort_id: string
      first_name: string
      last_name: string
    }
  }[]
  headphone_assignments: {
    assignment_id: string
    headphone: {
      headphone_id: string
      name: string
    }
  }[]
}

interface Guide {
  guide_id: string
  first_name: string
  last_name: string
  email: string
  languages: string[]
  active: boolean
}


interface BusyGuideInfo {
  guide_id: string
  conflicting_service: string
  conflicting_time: string
}

export default function StaffCalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [availabilities, setAvailabilities] = useState<ActivityAvailability[]>([])
  const [allActivities, setAllActivities] = useState<{ activity_id: string; title: string }[]>([])
  const [guides, setGuides] = useState<Guide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<ActivityAvailability | null>(null)
  const [selectedGuides, setSelectedGuides] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)

  // Filter states
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([])
  const [showOnlyWithBookings, setShowOnlyWithBookings] = useState(true) // Pre-selected
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false)
  const [activitySearchOpen, setActivitySearchOpen] = useState(false)
  const [activitySearchText, setActivitySearchText] = useState('')

  // Settings states
  const [excludedActivityIds, setExcludedActivityIds] = useState<string[]>([])
  const [activityGroups, setActivityGroups] = useState<{ name: string; activity_ids: string[] }[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tempExcludedIds, setTempExcludedIds] = useState<string[]>([])
  const [settingsSearchText, setSettingsSearchText] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)


  // Busy guides (within 3-hour window)
  const [busyGuides, setBusyGuides] = useState<BusyGuideInfo[]>([])

  useEffect(() => {
    fetchExcludedActivities()
    fetchActivityGroups()
    fetchAllActivitiesList()
  }, [])

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, viewMode, excludedActivityIds])

  const fetchExcludedActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('guide_calendar_settings')
        .select('setting_value')
        .eq('setting_key', 'excluded_activity_ids')
        .single()

      if (error) {
        setExcludedActivityIds([])
        return
      }

      if (data?.setting_value) {
        setExcludedActivityIds(data.setting_value as string[])
      }
    } catch {
      setExcludedActivityIds([])
    }
  }

  const fetchActivityGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('guide_calendar_settings')
        .select('setting_value')
        .eq('setting_key', 'activity_groups')
        .single()

      if (error) {
        setActivityGroups([])
        return
      }

      if (data?.setting_value) {
        setActivityGroups(data.setting_value as { name: string; activity_ids: string[] }[])
      }
    } catch {
      setActivityGroups([])
    }
  }

  const fetchAllActivitiesList = async () => {
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('activity_id, title')
        .order('title', { ascending: true })

      if (error) throw error
      setAllActivities(data || [])
    } catch (err) {
      console.error('Error fetching all activities:', err)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const { start, end } = getDateRange()
      const startStr = format(start, 'yyyy-MM-dd')
      const endStr = format(end, 'yyyy-MM-dd')

      const { data: rawAvails, error: availError } = await supabase
        .from('activity_availability')
        .select(`
          id,
          activity_id,
          availability_id,
          local_date,
          local_time,
          local_date_time,
          status,
          vacancy_available,
          vacancy_sold,
          vacancy_opening
        `)
        .gte('local_date', startStr)
        .lte('local_date', endStr)
        .order('local_date', { ascending: true })
        .order('local_time', { ascending: true })
        .limit(100000)

      const avails = excludedActivityIds.length > 0
        ? rawAvails?.filter(a => !excludedActivityIds.includes(a.activity_id))
        : rawAvails

      if (availError) throw availError

      const availabilityIds = avails?.map(a => a.id) || []

      // Fetch guide assignments
      const { data: guideAssignmentsData } = await supabase
        .from('guide_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          guide:guides (
            guide_id,
            first_name,
            last_name
          )
        `)
        .in('activity_availability_id', availabilityIds)

      // Fetch escort assignments
      const { data: escortAssignmentsData } = await supabase
        .from('escort_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          escort:escorts (
            escort_id,
            first_name,
            last_name
          )
        `)
        .in('activity_availability_id', availabilityIds)

      // Fetch headphone assignments
      const { data: headphoneAssignmentsData } = await supabase
        .from('headphone_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          headphone:headphones (
            headphone_id,
            name
          )
        `)
        .in('activity_availability_id', availabilityIds)

      // Group assignments by availability id
      const guideAssignmentsMap = new Map<number, typeof guideAssignmentsData>()
      guideAssignmentsData?.forEach(assignment => {
        const existing = guideAssignmentsMap.get(assignment.activity_availability_id) || []
        guideAssignmentsMap.set(assignment.activity_availability_id, [...existing, assignment])
      })

      const escortAssignmentsMap = new Map<number, typeof escortAssignmentsData>()
      escortAssignmentsData?.forEach(assignment => {
        const existing = escortAssignmentsMap.get(assignment.activity_availability_id) || []
        escortAssignmentsMap.set(assignment.activity_availability_id, [...existing, assignment])
      })

      const headphoneAssignmentsMap = new Map<number, typeof headphoneAssignmentsData>()
      headphoneAssignmentsData?.forEach(assignment => {
        const existing = headphoneAssignmentsMap.get(assignment.activity_availability_id) || []
        headphoneAssignmentsMap.set(assignment.activity_availability_id, [...existing, assignment])
      })

      // Fetch actual bookings from activity_bookings for accurate counts (exclude CANCELLED)
      const { data: bookingsData } = await supabase
        .from('activity_bookings')
        .select('activity_id, start_time')
        .gte('start_date_time', `${startStr}T00:00:00`)
        .lt('start_date_time', `${endStr}T23:59:59`)
        .not('status', 'eq', 'CANCELLED')

      // Count bookings by activity_id + start_time
      const bookingCountsMap = new Map<string, number>()
      bookingsData?.forEach(booking => {
        // Normalize time: "10:00" -> "10:00:00"
        const normalizedTime = booking.start_time.length === 5 ? `${booking.start_time}:00` : booking.start_time
        const key = `${booking.activity_id}_${normalizedTime}`
        bookingCountsMap.set(key, (bookingCountsMap.get(key) || 0) + 1)
      })

      const availsWithStaff = avails?.map(avail => {
        // Match bookings by activity_id and local_time
        const key = `${avail.activity_id}_${avail.local_time}`
        const actualBookingCount = bookingCountsMap.get(key) || 0
        return {
          ...avail,
          actual_booking_count: actualBookingCount,
          guide_assignments: guideAssignmentsMap.get(avail.id) || [],
          escort_assignments: escortAssignmentsMap.get(avail.id) || [],
          headphone_assignments: headphoneAssignmentsMap.get(avail.id) || []
        }
      })

      const filtered = availsWithStaff || []

      // Fetch activity details
      const activityIds = [...new Set(filtered?.map(a => a.activity_id) || [])]
      const { data: activities, error: actError } = await supabase
        .from('activities')
        .select('activity_id, title')
        .in('activity_id', activityIds)

      if (actError) throw actError

      const activitiesMap = (activities || []).reduce((acc: Record<string, { activity_id: string; title: string }>, activity) => {
        acc[activity.activity_id] = activity
        return acc
      }, {})

      const enrichedData = (filtered || []).map((avail) => {
        const activity = activitiesMap[avail.activity_id]
        return {
          ...avail,
          activity: activity || { activity_id: avail.activity_id, title: 'Unknown Activity' }
        }
      }) as unknown as ActivityAvailability[]

      setAvailabilities(enrichedData)

      // Fetch all active guides
      const { data: guidesData, error: guidesError } = await supabase
        .from('guides')
        .select('guide_id, first_name, last_name, email, languages, active')
        .eq('active', true)
        .order('first_name', { ascending: true })

      if (guidesError) throw guidesError
      setGuides(guidesData || [])
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load calendar data')
    } finally {
      setLoading(false)
    }
  }

  const getDateRange = () => {
    if (viewMode === 'weekly') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 })
      const end = endOfWeek(currentDate, { weekStartsOn: 1 })
      return { start, end }
    } else {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 0, 0, 0, 0)
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59, 999)
      return { start, end }
    }
  }

  const goToPrevious = () => {
    if (viewMode === 'weekly') {
      setCurrentDate(prev => addWeeks(prev, -1))
    } else {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1))
    }
  }

  const goToNext = () => {
    if (viewMode === 'weekly') {
      setCurrentDate(prev => addWeeks(prev, 1))
    } else {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1))
    }
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const getCalendarDays = () => {
    if (viewMode === 'daily') {
      return [currentDate]
    }
    const { start, end } = getDateRange()
    return eachDayOfInterval({ start, end })
  }

  const getAvailabilitiesForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd')
    let filtered = availabilities.filter(avail => avail.local_date === dayStr)

    if (selectedActivityIds.length > 0) {
      filtered = filtered.filter(avail => selectedActivityIds.includes(avail.activity_id))
    }

    if (showOnlyWithBookings) {
      filtered = filtered.filter(avail => (avail.actual_booking_count || 0) > 0)
    }

    if (showOnlyUnassigned) {
      // Only consider guide assignments - escort-only services are still "unassigned"
      filtered = filtered.filter(avail =>
        !avail.guide_assignments || avail.guide_assignments.length === 0
      )
    }

    return filtered
  }

  const getStatusColor = (availability: ActivityAvailability) => {
    const hasBookings = (availability.actual_booking_count || 0) > 0
    const hasGuides = availability.guide_assignments && availability.guide_assignments.length > 0
    // Escort-only services are considered "unassigned" - only guide assignment counts as fully assigned

    if (hasBookings && hasGuides) {
      return 'bg-green-100 border-green-300 text-green-800'
    } else if (hasBookings && !hasGuides) {
      return 'bg-yellow-100 border-yellow-300 text-yellow-800'
    }
    return 'bg-gray-100 border-gray-300 text-gray-800'
  }

  const handleSlotClick = async (availability: ActivityAvailability) => {
    setSelectedSlot(availability)
    setSelectedGuides(availability.guide_assignments?.map(ga => ga.guide.guide_id) || [])
    setShowModal(true)

    // Fetch busy guides for this time slot (within 3-hour window)
    await fetchBusyGuides(availability)
  }

  const fetchBusyGuides = async (availability: ActivityAvailability) => {
    try {
      // Parse the selected slot time
      const slotDate = availability.local_date
      const slotTimeParts = availability.local_time.split(':')
      const slotHour = parseInt(slotTimeParts[0], 10)
      const slotMinute = parseInt(slotTimeParts[1], 10)
      const slotTotalMinutes = slotHour * 60 + slotMinute

      // Calculate 3-hour window (±3 hours = 180 minutes)
      const windowMinutes = 180

      // Get all availabilities for the same date
      const { data: dayAvails, error: availError } = await supabase
        .from('activity_availability')
        .select('id, activity_id, local_time')
        .eq('local_date', slotDate)
        .neq('id', availability.id) // Exclude current slot

      if (availError) throw availError

      if (!dayAvails || dayAvails.length === 0) {
        setBusyGuides([])
        return
      }

      // Filter availabilities within 3-hour window
      const availsInWindow = dayAvails.filter(avail => {
        const timeParts = avail.local_time.split(':')
        const hour = parseInt(timeParts[0], 10)
        const minute = parseInt(timeParts[1], 10)
        const totalMinutes = hour * 60 + minute
        const diff = Math.abs(totalMinutes - slotTotalMinutes)
        return diff < windowMinutes
      })

      if (availsInWindow.length === 0) {
        setBusyGuides([])
        return
      }

      const availIds = availsInWindow.map(a => a.id)

      // Get guide assignments for these availabilities
      const { data: assignments, error: assignError } = await supabase
        .from('guide_assignments')
        .select(`
          guide_id,
          activity_availability_id
        `)
        .in('activity_availability_id', availIds)

      if (assignError) throw assignError

      if (!assignments || assignments.length === 0) {
        setBusyGuides([])
        return
      }

      // Get activity titles for the conflicting services
      const activityIds = [...new Set(availsInWindow.map(a => a.activity_id))]
      const { data: activities } = await supabase
        .from('activities')
        .select('activity_id, title')
        .in('activity_id', activityIds)

      const activitiesMap = (activities || []).reduce((acc: Record<string, string>, a) => {
        acc[a.activity_id] = a.title
        return acc
      }, {})

      // Build busy guides info
      const busyInfo: BusyGuideInfo[] = assignments.map(assignment => {
        const conflictAvail = availsInWindow.find(a => a.id === assignment.activity_availability_id)
        return {
          guide_id: assignment.guide_id,
          conflicting_service: conflictAvail ? (activitiesMap[conflictAvail.activity_id] || 'Unknown') : 'Unknown',
          conflicting_time: conflictAvail ? conflictAvail.local_time.substring(0, 5) : ''
        }
      })

      setBusyGuides(busyInfo)
    } catch (err) {
      console.error('Error fetching busy guides:', err)
      setBusyGuides([])
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedSlot(null)
    setSelectedGuides([])
    setBusyGuides([])
    setError(null)
  }

  const isGuideBusy = (guideId: string): BusyGuideInfo | undefined => {
    return busyGuides.find(bg => bg.guide_id === guideId)
  }

  const toggleGuide = (guideId: string) => {
    // Check if guide is busy (has another assignment within 3-hour window)
    const busyInfo = isGuideBusy(guideId)
    if (busyInfo && !selectedGuides.includes(guideId)) {
      // Don't allow selecting a busy guide (but allow deselecting)
      return
    }

    setSelectedGuides(prev =>
      prev.includes(guideId)
        ? prev.filter(id => id !== guideId)
        : [...prev, guideId]
    )
  }


  const handleSaveAssignments = async () => {
    if (!selectedSlot) return

    setError(null)
    try {
      // Handle guide assignments only
      const existingGuideIds = selectedSlot.guide_assignments?.map(ga => ga.guide.guide_id) || []
      const guidesToAdd = selectedGuides.filter(id => !existingGuideIds.includes(id))
      const guidesToRemove = existingGuideIds.filter(id => !selectedGuides.includes(id))

      // Delete removed guide assignments
      if (guidesToRemove.length > 0) {
        const params = new URLSearchParams()
        params.append('activity_availability_id', String(selectedSlot.id))
        params.append('guide_ids', guidesToRemove.join(','))

        const deleteResponse = await fetch(`/api/assignments/availability?${params.toString()}`, {
          method: 'DELETE',
          credentials: 'include'
        })
        const deleteResult = await deleteResponse.json()
        if (deleteResult.error) throw new Error(deleteResult.error)
      }

      // Add new guide assignments
      if (guidesToAdd.length > 0) {
        const createResponse = await fetch('/api/assignments/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            activity_availability_id: selectedSlot.id,
            guide_ids: guidesToAdd
          })
        })
        const createResult = await createResponse.json()
        if (createResult.error) throw new Error(createResult.error)
      }

      handleCloseModal()
      fetchData()
    } catch (err) {
      console.error('Error saving assignments:', err)
      setError(err instanceof Error ? err.message : 'Failed to save assignments')
    }
  }

  const calendarDays = getCalendarDays()

  const toggleActivity = (activityId: string) => {
    setSelectedActivityIds(prev =>
      prev.includes(activityId)
        ? prev.filter(id => id !== activityId)
        : [...prev, activityId]
    )
  }

  const filteredActivities = allActivities.filter(activity =>
    activity.title.toLowerCase().includes(activitySearchText.toLowerCase())
  )

  const filteredSettingsActivities = allActivities.filter(activity =>
    activity.title.toLowerCase().includes(settingsSearchText.toLowerCase())
  )

  const handleOpenSettings = () => {
    setTempExcludedIds([...excludedActivityIds])
    setSettingsOpen(true)
  }

  const handleSaveSettings = async () => {
    try {
      const result = await calendarSettingsApi.update('excluded_activity_ids', tempExcludedIds)
      if (result.error) throw new Error(result.error)

      await fetchExcludedActivities()
      setSettingsOpen(false)
      setSettingsSearchText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    }
  }

  const toggleExcludedActivity = (activityId: string) => {
    setTempExcludedIds(prev =>
      prev.includes(activityId)
        ? prev.filter(id => id !== activityId)
        : [...prev, activityId]
    )
  }

  const selectAllActivities = () => {
    setTempExcludedIds(allActivities.map(a => a.activity_id))
  }

  const clearAllActivities = () => {
    setTempExcludedIds([])
  }

  const saveCurrentAsGroup = async () => {
    if (!newGroupName.trim() || tempExcludedIds.length === 0) {
      setError('Please enter a group name and select at least one activity')
      return
    }

    let updatedGroups: { name: string; activity_ids: string[] }[]

    if (editingGroup) {
      updatedGroups = activityGroups.map(g =>
        g.name === editingGroup
          ? { name: newGroupName.trim(), activity_ids: tempExcludedIds }
          : g
      )
    } else {
      const newGroup = { name: newGroupName.trim(), activity_ids: tempExcludedIds }
      updatedGroups = [...activityGroups, newGroup]
    }

    try {
      const result = await calendarSettingsApi.update('activity_groups', updatedGroups)
      if (result.error) throw new Error(result.error)

      setActivityGroups(updatedGroups)
      setNewGroupName('')
      setShowGroupForm(false)
      setEditingGroup(null)
    } catch (err) {
      console.error('Error saving group:', err)
      setError(err instanceof Error ? err.message : 'Failed to save group')
    }
  }

  const loadGroup = (group: { name: string; activity_ids: string[] }) => {
    setTempExcludedIds(group.activity_ids)
  }

  const editGroup = (group: { name: string; activity_ids: string[] }) => {
    setEditingGroup(group.name)
    setNewGroupName(group.name)
    setTempExcludedIds(group.activity_ids)
    setShowGroupForm(true)
  }

  const deleteGroup = async (groupName: string) => {
    const updatedGroups = activityGroups.filter(g => g.name !== groupName)

    try {
      const result = await calendarSettingsApi.update('activity_groups', updatedGroups)
      if (result.error) throw new Error(result.error)
      setActivityGroups(updatedGroups)
    } catch (err) {
      console.error('Error deleting group:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete group')
    }
  }

  const applyGroupToFilter = (activityIds: string[]) => {
    setSelectedActivityIds(activityIds)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Guide Assignments</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => setViewMode('weekly')}
            variant={viewMode === 'weekly' ? 'default' : 'outline'}
          >
            Weekly
          </Button>
          <Button
            onClick={() => setViewMode('daily')}
            variant={viewMode === 'daily' ? 'default' : 'outline'}
          >
            Daily
          </Button>
          <Drawer open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DrawerTrigger asChild>
              <Button variant="outline" size="icon" onClick={handleOpenSettings}>
                <Settings className="h-5 w-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Calendar Settings</DrawerTitle>
                <DrawerDescription>
                  Select which activities to exclude from the calendar view
                </DrawerDescription>
              </DrawerHeader>
              <div className="p-4 h-[70vh] overflow-y-auto">
                {activityGroups.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Saved Groups</label>
                    <div className="space-y-2">
                      {activityGroups.map(group => (
                        <div key={group.name} className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadGroup(group)}
                            className="flex-1 justify-start"
                          >
                            {group.name} ({group.activity_ids.length} activities)
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => editGroup(group)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteGroup(group.name)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllActivities}>
                    Exclude All
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearAllActivities}>
                    Show All
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowGroupForm(!showGroupForm)}>
                    Save as Group
                  </Button>
                </div>

                {showGroupForm && (
                  <div className="mb-4 p-3 border rounded-md bg-gray-50">
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {editingGroup ? 'Edit Group' : 'Create New Group'}
                    </label>
                    <input
                      type="text"
                      placeholder="Group name..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveCurrentAsGroup}>
                        {editingGroup ? 'Update Group' : 'Save Group'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        setShowGroupForm(false)
                        setNewGroupName('')
                        setEditingGroup(null)
                      }}>Cancel</Button>
                    </div>
                  </div>
                )}

                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                  <div className="font-medium text-blue-900">
                    {tempExcludedIds.length === 0 ? 'All activities will be shown' : `${tempExcludedIds.length} activities excluded`}
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    {tempExcludedIds.length === 0
                      ? 'Check activities below to exclude them from the calendar'
                      : 'Checked activities will be hidden from the calendar'}
                  </div>
                </div>

                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search activities..."
                    value={settingsSearchText}
                    onChange={(e) => setSettingsSearchText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Activities to Exclude ({tempExcludedIds.length} of {allActivities.length} selected)
                  </label>
                  <div className="space-y-2">
                    {filteredSettingsActivities.length === 0 ? (
                      <div className="text-sm text-gray-500 p-4 border rounded">
                        {allActivities.length === 0
                          ? 'No activities loaded. Try refreshing the page.'
                          : 'No activities match your search.'}
                      </div>
                    ) : (
                      filteredSettingsActivities.map(activity => (
                        <label
                          key={activity.activity_id}
                          className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded cursor-pointer border"
                        >
                          <Checkbox
                            checked={tempExcludedIds.includes(activity.activity_id)}
                            onCheckedChange={() => toggleExcludedActivity(activity.activity_id)}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium">{activity.title}</div>
                            <div className="text-xs text-gray-500">ID: {activity.activity_id}</div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <DrawerFooter>
                <Button onClick={handleSaveSettings}>Save Changes</Button>
                <DrawerClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Activity</label>
            <div className="relative">
              <button
                onClick={() => setActivitySearchOpen(!activitySearchOpen)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-left flex justify-between items-center"
              >
                <span className="text-sm">
                  {selectedActivityIds.length === 0
                    ? 'All Activities'
                    : `${selectedActivityIds.length} selected`}
                </span>
                <ChevronRight className={`w-4 h-4 transition-transform ${activitySearchOpen ? 'rotate-90' : ''}`} />
              </button>
              {activitySearchOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg overflow-hidden">
                  {activityGroups.length > 0 && (
                    <div className="p-2 border-b bg-gray-50">
                      <div className="text-xs font-medium text-gray-700 mb-2">Quick Groups</div>
                      <div className="flex flex-wrap gap-1">
                        {activityGroups.map(group => (
                          <Button
                            key={group.name}
                            variant="outline"
                            size="sm"
                            onClick={() => { applyGroupToFilter(group.activity_ids); setActivitySearchOpen(false) }}
                            className="text-xs"
                          >
                            {group.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="p-2 border-b sticky top-0 bg-white">
                    <input
                      type="text"
                      placeholder="Search activities..."
                      value={activitySearchText}
                      onChange={(e) => setActivitySearchText(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {filteredActivities.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">No activities found</div>
                    ) : (
                      filteredActivities.map(activity => (
                        <label
                          key={activity.activity_id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedActivityIds.includes(activity.activity_id)}
                            onCheckedChange={() => toggleActivity(activity.activity_id)}
                          />
                          <span className="text-sm">{activity.title}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showOnlyWithBookings}
                onCheckedChange={(checked) => setShowOnlyWithBookings(checked as boolean)}
              />
              <span className="text-sm">Only with bookings</span>
            </label>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showOnlyUnassigned}
                onCheckedChange={(checked) => setShowOnlyUnassigned(checked as boolean)}
              />
              <span className="text-sm">Only unassigned</span>
            </label>
          </div>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          <button onClick={goToPrevious} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-gray-500" />
                <span className="text-xl font-semibold">
                  {viewMode === 'weekly'
                    ? `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}`
                    : format(currentDate, 'EEEE, MMMM d, yyyy')
                  }
                </span>
              </div>
            </div>
            <button
              onClick={goToToday}
              className="px-4 py-2 bg-brand-orange text-white rounded-md hover:bg-brand-orange-dark text-sm"
            >
              Today
            </button>
          </div>

          <button onClick={goToNext} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {error && !showModal && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Calendar Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-500">Loading calendar...</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {viewMode === 'weekly' && (
            <div className="grid grid-cols-7 gap-px bg-gray-200">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="bg-gray-50 p-3 text-center font-semibold text-sm text-gray-700">
                  {day}
                </div>
              ))}
            </div>
          )}

          <div className={viewMode === 'daily' ? 'grid grid-cols-1' : 'grid grid-cols-7 gap-px bg-gray-200'}>
            {calendarDays.map(day => {
              const dayAvailabilities = getAvailabilitiesForDay(day)
              const isToday = isSameDay(day, new Date())

              return (
                <div key={day.toISOString()} className="bg-white min-h-[120px] p-2">
                  <div className={`text-sm font-medium mb-2 ${
                    isToday ? 'bg-brand-orange text-white rounded-full w-7 h-7 flex items-center justify-center' : 'text-gray-700'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayAvailabilities.map(avail => (
                      <button
                        key={avail.id}
                        onClick={() => handleSlotClick(avail)}
                        className={`w-full text-left p-2 rounded border text-xs hover:shadow-md transition-shadow ${getStatusColor(avail)}`}
                      >
                        <div className="font-medium truncate">{avail.local_time.substring(0, 5)}</div>
                        <div className="truncate">{avail.activity.title}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <Users className="w-3 h-3" />
                          <span>{avail.actual_booking_count || 0} bookings</span>
                        </div>
                        {(avail.guide_assignments?.length > 0 || avail.escort_assignments?.length > 0 || avail.headphone_assignments?.length > 0) && (
                          <div className="flex gap-2 text-xs mt-1">
                            {avail.guide_assignments?.length > 0 && (
                              <span className="text-purple-700 flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {avail.guide_assignments.length}
                              </span>
                            )}
                            {avail.escort_assignments?.length > 0 && (
                              <span className="text-green-700 flex items-center gap-1">
                                <UserCheck className="w-3 h-3" />
                                {avail.escort_assignments.length}
                              </span>
                            )}
                            {avail.headphone_assignments?.length > 0 && (
                              <span className="text-purple-500 flex items-center gap-1">
                                <Headphones className="w-3 h-3" />
                                {avail.headphone_assignments.length}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showModal && selectedSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-2">Assign Staff</h2>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span className="font-medium">{selectedSlot.activity.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    <span>{format(new Date(selectedSlot.local_date), 'EEEE, MMMM d, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{selectedSlot.local_time.substring(0, 5)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>{selectedSlot.actual_booking_count || 0} bookings</span>
                  </div>
                </div>
              </div>
              <button onClick={handleCloseModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-blue-600" />
                <span className="font-medium">Select Guides</span>
                <span className="text-sm text-gray-500">({selectedGuides.length} selected)</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">Guides can only be assigned to one service within a 3-hour window</p>

              {guides.length === 0 ? (
                <p className="text-sm text-gray-500 p-4 border rounded">No active guides available</p>
              ) : (
                <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  {guides.map((guide) => {
                    const busyInfo = isGuideBusy(guide.guide_id)
                    const isBusy = !!busyInfo && !selectedGuides.includes(guide.guide_id)

                    return (
                      <label
                        key={guide.guide_id}
                        className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 ${
                          isBusy
                            ? 'bg-gray-100 cursor-not-allowed opacity-60'
                            : selectedGuides.includes(guide.guide_id)
                              ? 'bg-blue-50 cursor-pointer hover:bg-gray-50'
                              : 'cursor-pointer hover:bg-gray-50'
                        }`}
                      >
                        <Checkbox
                          checked={selectedGuides.includes(guide.guide_id)}
                          onCheckedChange={() => toggleGuide(guide.guide_id)}
                          disabled={isBusy}
                        />
                        <div className="flex-1">
                          <span className={`text-sm font-medium ${isBusy ? 'text-gray-500' : ''}`}>
                            {guide.first_name} {guide.last_name}
                          </span>
                          {isBusy && busyInfo && (
                            <div className="text-xs text-red-600 mt-1">
                              Busy at {busyInfo.conflicting_time} - {busyInfo.conflicting_service}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {guide.languages.map(lang => (
                            <span key={lang} className={`px-2 py-1 text-xs rounded ${
                              isBusy ? 'bg-gray-200 text-gray-500' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {lang}
                            </span>
                          ))}
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 mt-4 border-t">
                <Button type="button" variant="outline" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleSaveAssignments}>
                  Save Guides
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
