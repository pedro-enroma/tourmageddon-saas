'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Users, MapPin, X, Settings, GripVertical } from 'lucide-react'
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
}

interface Guide {
  guide_id: string
  first_name: string
  last_name: string
  email: string
  languages: string[]
  active: boolean
}

export default function GuidesCalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('daily')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [availabilities, setAvailabilities] = useState<ActivityAvailability[]>([])
  const [allActivities, setAllActivities] = useState<{ activity_id: string; title: string }[]>([])
  const [guides, setGuides] = useState<Guide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<ActivityAvailability | null>(null)
  const [selectedGuides, setSelectedGuides] = useState<string[]>([])
  const [assignmentNotes, setAssignmentNotes] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [draggedGuideIndex, setDraggedGuideIndex] = useState<number | null>(null)

  // Filter states
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([])
  const [showOnlyWithBookings, setShowOnlyWithBookings] = useState(false)
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false)
  const [activitySearchOpen, setActivitySearchOpen] = useState(false)
  const [activitySearchText, setActivitySearchText] = useState('')

  // Settings states
  const [includedActivityIds, setIncludedActivityIds] = useState<string[]>([])
  const [activityGroups, setActivityGroups] = useState<{ name: string; activity_ids: string[] }[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tempIncludedIds, setTempIncludedIds] = useState<string[]>([])
  const [settingsSearchText, setSettingsSearchText] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [showGroupForm, setShowGroupForm] = useState(false)

  useEffect(() => {
    fetchIncludedActivities()
    fetchActivityGroups()
    fetchAllActivitiesList()
  }, [])

  useEffect(() => {
    if (includedActivityIds.length >= 0) {
      fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, viewMode, includedActivityIds])

  const fetchIncludedActivities = async () => {
    try {
      console.log('Fetching included activities from DB...')
      const { data, error } = await supabase
        .from('guide_calendar_settings')
        .select('setting_value')
        .eq('setting_key', 'included_activity_ids')
        .single()

      if (error) {
        console.error('Error fetching included activities:', error)
        // If not found, show all activities (empty array means show all)
        setIncludedActivityIds([])
        return
      }

      console.log('Loaded included activities from DB:', data?.setting_value)
      if (data?.setting_value) {
        setIncludedActivityIds(data.setting_value as string[])
      }
    } catch (err) {
      console.error('Error fetching settings:', err)
      setIncludedActivityIds([])
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
        console.error('Error fetching activity groups:', error)
        setActivityGroups([])
        return
      }

      if (data?.setting_value) {
        setActivityGroups(data.setting_value as { name: string; activity_ids: string[] }[])
      }
    } catch (err) {
      console.error('Error fetching activity groups:', err)
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
      // Calculate date range based on view mode
      const { start, end } = getDateRange()
      const startStr = format(start, 'yyyy-MM-dd')
      const endStr = format(end, 'yyyy-MM-dd')

      // Build the query - fetch availabilities WITHOUT guide_assignments to avoid duplication
      let query = supabase
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

      // Apply activity filter at the database level if specific activities are selected
      if (includedActivityIds.length > 0) {
        query = query.in('activity_id', includedActivityIds)
      }

      // Order and get ALL results - use range to bypass default 1000 limit
      const { data: avails, error: availError } = await query
        .order('local_date', { ascending: true })
        .order('local_time', { ascending: true })
        .order('activity_id', { ascending: true })
        .range(0, 50000) // Fetch up to 50k rows

      if (availError) {
        console.error('Error fetching availabilities:', availError)
        throw availError
      }

      console.log('📊 Calendar Data Debug:')
      console.log('Date range:', startStr, 'to', endStr)
      console.log('Raw availabilities fetched:', avails?.length || 0)

      const uniqueDatesInQuery = [...new Set(avails?.map(a => a.local_date))].sort()
      console.log('❗❗❗ UNIQUE DATES IN QUERY RESULT:', uniqueDatesInQuery)
      console.log('❗❗❗ NUMBER OF UNIQUE DATES:', uniqueDatesInQuery.length)
      console.log('❗❗❗ EXPECTED 7 DAYS FROM', startStr, 'TO', endStr)

      if (uniqueDatesInQuery.length < 7) {
        console.error('🚨 NOT ENOUGH DAYS! Only got', uniqueDatesInQuery.length, 'days instead of 7')
        console.error('🚨 Missing dates. This means the query is incomplete.')
      }

      // Fetch guide assignments separately to avoid duplication
      const availabilityIds = avails?.map(a => a.id) || []
      const { data: guideAssignmentsData } = await supabase
        .from('guide_assignments')
        .select(`
          assignment_id,
          availability_id,
          guide:guides (
            guide_id,
            first_name,
            last_name
          )
        `)
        .in('availability_id', availabilityIds)

      // Group guide assignments by availability_id
      const guideAssignmentsMap = new Map<number, typeof guideAssignmentsData>()
      guideAssignmentsData?.forEach(assignment => {
        const existing = guideAssignmentsMap.get(assignment.availability_id) || []
        guideAssignmentsMap.set(assignment.availability_id, [...existing, assignment])
      })

      // Merge guide assignments into availabilities
      const availsWithGuides = avails?.map(avail => ({
        ...avail,
        guide_assignments: guideAssignmentsMap.get(avail.id) || []
      }))

      console.log('Total availabilities with guides:', availsWithGuides?.length || 0)
      console.log('🔍 Current includedActivityIds:', includedActivityIds)

      // Activity filtering is now done at the database level
      const filtered = availsWithGuides || []

      // Fetch activity details
      const activityIds = [...new Set(filtered?.map(a => a.activity_id) || [])]
      const { data: activities, error: actError } = await supabase
        .from('activities')
        .select('activity_id, title')
        .in('activity_id', activityIds)

      if (actError) throw actError

      // Map activities to availabilities
      const activitiesMap = (activities || []).reduce((acc: Record<string, { activity_id: string; title: string }>, activity: { activity_id: string; title: string }) => {
        acc[activity.activity_id] = activity
        return acc
      }, {})

      // Don't filter anything - show all availabilities
      const enrichedData = (filtered || [])
        .map((avail) => {
          const activity = activitiesMap[avail.activity_id]
          if (!activity) {
            return {
              ...avail,
              activity: {
                activity_id: avail.activity_id,
                title: 'Unknown Activity'
              }
            }
          }

          return {
            ...avail,
            activity
          }
        }) as unknown as ActivityAvailability[]

      console.log('Final enriched slots:', enrichedData.length)
      console.log('Final slots to display:', enrichedData)
      console.log('📅 Today\'s date for debugging:', format(new Date(), 'yyyy-MM-dd'))

      // Show unique dates in the fetched data
      const uniqueDates = [...new Set(enrichedData.map(slot => slot.local_date))].sort()
      console.log('📅 Unique dates in fetched data:', uniqueDates)

      // Show which activity IDs are in the data
      const activityIdsInData = [...new Set(enrichedData.map(slot => slot.activity_id))]
      console.log('📅 Activity IDs in fetched data:', activityIdsInData)

      // Show detailed info for each slot
      enrichedData.forEach((slot, index) => {
        console.log(`Slot ${index + 1}:`, {
          date: slot.local_date,
          time: slot.local_time,
          activity: slot.activity.title,
          capacity: `${slot.vacancy_sold}/${slot.vacancy_available}`,
          status: slot.status,
          availability_id: slot.availability_id,
          guides_assigned: slot.guide_assignments?.length || 0
        })
      })

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
      const start = startOfWeek(currentDate, { weekStartsOn: 1 }) // 1 = Monday
      const end = endOfWeek(currentDate, { weekStartsOn: 1 })
      console.log('📅 Week range:', format(start, 'yyyy-MM-dd (EEEE)'), 'to', format(end, 'yyyy-MM-dd (EEEE)'))
      return { start, end }
    } else {
      // Daily view - just the current day
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
    const days = eachDayOfInterval({ start, end })
    console.log('📅 Calendar days:', days.map(d => format(d, 'yyyy-MM-dd (EEEE)')))
    console.log('📅 Total days:', days.length)
    return days
  }

  const getAvailabilitiesForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd')
    console.log(`🔍 Getting availabilities for ${dayStr}`)
    console.log(`   Total availabilities in state: ${availabilities.length}`)

    let filtered = availabilities.filter(avail => avail.local_date === dayStr)
    console.log(`   Matching date ${dayStr}: ${filtered.length}`)

    // Apply activity filter
    if (selectedActivityIds.length > 0) {
      filtered = filtered.filter(avail => selectedActivityIds.includes(avail.activity_id))
      console.log(`   After activity filter: ${filtered.length}`)
    }

    // Apply bookings filter
    if (showOnlyWithBookings) {
      filtered = filtered.filter(avail => (avail.vacancy_sold || 0) > 0)
      console.log(`   After bookings filter: ${filtered.length}`)
    }

    // Apply unassigned filter
    if (showOnlyUnassigned) {
      filtered = filtered.filter(avail => !avail.guide_assignments || avail.guide_assignments.length === 0)
      console.log(`   After unassigned filter: ${filtered.length}`)
    }

    console.log(`   Final count for ${dayStr}: ${filtered.length}`)
    return filtered
  }

  const getStatusColor = (availability: ActivityAvailability) => {
    const hasBookings = (availability.vacancy_sold || 0) > 0
    const hasGuides = availability.guide_assignments && availability.guide_assignments.length > 0

    if (hasBookings && hasGuides) {
      // Green: has bookings and guide assigned
      return 'bg-green-100 border-green-300 text-green-800'
    } else if (hasBookings && !hasGuides) {
      // Yellow/Orange: has bookings but no guide assigned (TO DO)
      return 'bg-yellow-100 border-yellow-300 text-yellow-800'
    }
    // Gray: no bookings
    return 'bg-gray-100 border-gray-300 text-gray-800'
  }

  const handleSlotClick = (availability: ActivityAvailability) => {
    setSelectedSlot(availability)
    setSelectedGuides(availability.guide_assignments?.map(ga => ga.guide.guide_id) || [])
    setAssignmentNotes('')
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedSlot(null)
    setSelectedGuides([])
    setAssignmentNotes('')
    setError(null)
  }

  const toggleGuide = (guideId: string) => {
    setSelectedGuides(prev =>
      prev.includes(guideId)
        ? prev.filter(id => id !== guideId)
        : [...prev, guideId]
    )
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedGuideIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedGuideIndex === null || draggedGuideIndex === dropIndex) {
      setDraggedGuideIndex(null)
      return
    }

    const newGuides = [...guides]
    const draggedGuide = newGuides[draggedGuideIndex]
    newGuides.splice(draggedGuideIndex, 1)
    newGuides.splice(dropIndex, 0, draggedGuide)

    setGuides(newGuides)
    setDraggedGuideIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedGuideIndex(null)
  }

  const handleSaveAssignments = async () => {
    if (!selectedSlot) return

    setError(null)
    try {
      // Get existing assignments
      const existingGuideIds = selectedSlot.guide_assignments?.map(ga => ga.guide.guide_id) || []

      // Determine which guides to add and which to remove
      const guidesToAdd = selectedGuides.filter(id => !existingGuideIds.includes(id))
      const guidesToRemove = existingGuideIds.filter(id => !selectedGuides.includes(id))

      // Remove unselected guides
      if (guidesToRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('guide_assignments')
          .delete()
          .eq('activity_availability_id', selectedSlot.id)
          .in('guide_id', guidesToRemove)

        if (deleteError) throw deleteError
      }

      // Add new guides
      if (guidesToAdd.length > 0) {
        const newAssignments = guidesToAdd.map(guideId => ({
          guide_id: guideId,
          activity_availability_id: selectedSlot.id,
          notes: assignmentNotes || null
        }))

        const { error: insertError } = await supabase
          .from('guide_assignments')
          .insert(newAssignments)

        if (insertError) throw insertError
      }

      handleCloseModal()
      fetchData() // Refresh data
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
    // Start with current selection, not saved selection
    setTempIncludedIds([...includedActivityIds])
    setSettingsOpen(true)
  }

  const handleSaveSettings = async () => {
    try {
      console.log('🔵 Step 1: Attempting to save settings:', tempIncludedIds)

      const { data, error } = await supabase
        .from('guide_calendar_settings')
        .upsert({
          setting_key: 'included_activity_ids',
          setting_value: tempIncludedIds,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        })
        .select()

      if (error) {
        console.error('❌ Error saving settings:', error)
        throw error
      }

      console.log('✅ Step 2: Settings saved successfully to DB:', data)

      // Reload from database to ensure consistency
      console.log('🔵 Step 3: Reloading settings from database...')
      await fetchIncludedActivities()

      console.log('🔵 Step 4: Closing drawer')
      setSettingsOpen(false)
      setSettingsSearchText('')

      console.log('✅ Save complete!')
    } catch (err) {
      console.error('❌ Error saving settings:', err)
      setError('Failed to save settings')
    }
  }

  const toggleIncludedActivity = (activityId: string) => {
    setTempIncludedIds(prev =>
      prev.includes(activityId)
        ? prev.filter(id => id !== activityId)
        : [...prev, activityId]
    )
  }

  const selectAllActivities = () => {
    setTempIncludedIds(allActivities.map(a => a.activity_id))
  }

  const clearAllActivities = () => {
    setTempIncludedIds([])
  }

  const saveCurrentAsGroup = async () => {
    if (!newGroupName.trim() || tempIncludedIds.length === 0) {
      setError('Please enter a group name and select at least one activity')
      return
    }

    const newGroup = {
      name: newGroupName.trim(),
      activity_ids: tempIncludedIds
    }

    const updatedGroups = [...activityGroups, newGroup]

    try {
      const { error } = await supabase
        .from('guide_calendar_settings')
        .upsert({
          setting_key: 'activity_groups',
          setting_value: updatedGroups,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        })

      if (error) throw error

      setActivityGroups(updatedGroups)
      setNewGroupName('')
      setShowGroupForm(false)
    } catch (err) {
      console.error('Error saving group:', err)
      setError('Failed to save group')
    }
  }

  const loadGroup = (group: { name: string; activity_ids: string[] }) => {
    setTempIncludedIds(group.activity_ids)
  }

  const deleteGroup = async (groupName: string) => {
    const updatedGroups = activityGroups.filter(g => g.name !== groupName)

    try {
      const { error } = await supabase
        .from('guide_calendar_settings')
        .upsert({
          setting_key: 'activity_groups',
          setting_value: updatedGroups,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        })

      if (error) throw error

      setActivityGroups(updatedGroups)
    } catch (err) {
      console.error('Error deleting group:', err)
      setError('Failed to delete group')
    }
  }

  const applyGroupToFilter = (activityIds: string[]) => {
    setSelectedActivityIds(activityIds)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Guides Calendar</h1>
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
                  Select which activities to show in the calendar view (leave empty to show all)
                </DrawerDescription>
              </DrawerHeader>
              <div className="p-4 h-[70vh] overflow-y-auto">
                {/* Saved Groups */}
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

                {/* Selection Controls */}
                <div className="mb-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllActivities}>
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearAllActivities}>
                    Clear All
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowGroupForm(!showGroupForm)}>
                    Save as Group
                  </Button>
                </div>

                {/* Save Group Form */}
                {showGroupForm && (
                  <div className="mb-4 p-3 border rounded-md bg-gray-50">
                    <input
                      type="text"
                      placeholder="Group name..."
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveCurrentAsGroup}>Save Group</Button>
                      <Button variant="outline" size="sm" onClick={() => { setShowGroupForm(false); setNewGroupName('') }}>Cancel</Button>
                    </div>
                  </div>
                )}

                {/* Selected Count */}
                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                  <div className="font-medium text-blue-900">
                    {tempIncludedIds.length === 0 ? '✓ All activities will be shown' : `✓ ${tempIncludedIds.length} activities selected`}
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    {tempIncludedIds.length === 0
                      ? 'Select specific activities to filter, or leave empty to show all'
                      : 'Check/uncheck activities to add or remove from your selection'}
                  </div>
                </div>

                {/* Search */}
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search activities..."
                    value={settingsSearchText}
                    onChange={(e) => setSettingsSearchText(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Activity List */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    All Activities ({allActivities.length} total)
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
                            checked={tempIncludedIds.includes(activity.activity_id)}
                            onCheckedChange={() => toggleIncludedActivity(activity.activity_id)}
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
          {/* Activity Filter */}
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
                  {/* Activity Groups at the top */}
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

          {/* Bookings Filter */}
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showOnlyWithBookings}
                onCheckedChange={(checked) => setShowOnlyWithBookings(checked as boolean)}
              />
              <span className="text-sm">Only with bookings</span>
            </label>
          </div>

          {/* Unassigned Filter */}
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
          <button
            onClick={goToPrevious}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
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
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Today
            </button>
          </div>

          <button
            onClick={goToNext}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error Display */}
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
          {/* Day Headers */}
          {viewMode === 'weekly' && (
            <div className="grid grid-cols-7 gap-px bg-gray-200">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="bg-gray-50 p-3 text-center font-semibold text-sm text-gray-700">
                  {day}
                </div>
              ))}
            </div>
          )}

          {/* Calendar Days */}
          <div className={viewMode === 'daily' ? 'grid grid-cols-1' : 'grid grid-cols-7 gap-px bg-gray-200'}>
            {calendarDays.map(day => {
              const dayAvailabilities = getAvailabilitiesForDay(day)
              const isToday = isSameDay(day, new Date())

              return (
                <div
                  key={day.toISOString()}
                  className="bg-white min-h-[120px] p-2"
                >
                  <div className={`text-sm font-medium mb-2 ${
                    isToday ? 'bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center' : 'text-gray-700'
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
                          <span>{avail.vacancy_sold || 0}/{avail.vacancy_opening || 0}</span>
                        </div>
                        {avail.guide_assignments && avail.guide_assignments.length > 0 && (
                          <div className="text-xs text-purple-700 font-medium mt-1">
                            {avail.guide_assignments.length} guide{avail.guide_assignments.length > 1 ? 's' : ''} assigned
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
            {/* Header */}
            <div className="p-6 border-b flex justify-between items-start">
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-2">Assign Guides</h2>
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
                    <span>{selectedSlot.vacancy_sold || 0} / {selectedSlot.vacancy_opening || 0} participants</span>
                  </div>
                </div>
              </div>
              <button onClick={handleCloseModal} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Form */}
            <div className="p-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div className="mb-4">
                <h3 className="font-medium mb-3">Select Guides</h3>
                {guides.length === 0 ? (
                  <p className="text-sm text-gray-500 p-4 border rounded">No active guides available</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    {/* Table Header */}
                    <div className="bg-gray-50 border-b grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-2 text-sm font-medium text-gray-700">
                      <div className="w-6"></div>
                      <div>Name</div>
                      <div>Language</div>
                    </div>
                    {/* Table Body */}
                    <div className="max-h-64 overflow-y-auto">
                      {guides.map((guide, index) => (
                        <div
                          key={guide.guide_id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          className={`grid grid-cols-[auto_1fr_auto] gap-4 px-4 py-3 hover:bg-gray-50 cursor-move border-b last:border-b-0 ${
                            selectedGuides.includes(guide.guide_id) ? 'bg-blue-50' : ''
                          } ${draggedGuideIndex === index ? 'opacity-50' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <GripVertical className="w-4 h-4 text-gray-400 cursor-grab active:cursor-grabbing" />
                            <Checkbox
                              checked={selectedGuides.includes(guide.guide_id)}
                              onCheckedChange={() => toggleGuide(guide.guide_id)}
                            />
                          </div>
                          <div className="flex items-center">
                            <span className="text-sm font-medium">
                              {guide.first_name} {guide.last_name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {guide.languages.map(lang => (
                              <span
                                key={lang}
                                className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded"
                              >
                                {lang}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Notes (optional)</label>
                <textarea
                  value={assignmentNotes}
                  onChange={(e) => setAssignmentNotes(e.target.value)}
                  placeholder="Add any notes about this assignment..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseModal}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveAssignments}
                >
                  Save Assignments
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
