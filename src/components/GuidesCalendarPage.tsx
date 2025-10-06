'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Users, MapPin, X } from 'lucide-react'
import { format, addWeeks, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

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

  // Filter states
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([])
  const [showOnlyWithBookings, setShowOnlyWithBookings] = useState(false)
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false)
  const [activitySearchOpen, setActivitySearchOpen] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, viewMode])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // Calculate date range based on view mode
      const { start, end } = getDateRange()
      const startStr = format(start, 'yyyy-MM-dd')
      const endStr = format(end, 'yyyy-MM-dd')

      // Fetch ALL activity availabilities with assignments (no filters except date range)
      const { data: avails, error: availError } = await supabase
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
          guide_assignments (
            assignment_id,
            guide:guides (
              guide_id,
              first_name,
              last_name
            )
          )
        `)
        .gte('local_date', startStr)
        .lte('local_date', endStr)
        .order('local_date', { ascending: true })
        .order('local_time', { ascending: true })
        .order('activity_id', { ascending: true })

      if (availError) {
        console.error('Error fetching availabilities:', availError)
        throw availError
      }

      console.log('📊 Calendar Data Debug:')
      console.log('Date range:', startStr, 'to', endStr)
      console.log('Raw availabilities fetched:', avails?.length || 0)
      console.log('Sample availability:', avails?.[0])

      // Group by activity_id, local_date, local_time to combine duplicate slots
      const groupedMap = new Map<string, typeof avails[0]>()

      avails?.forEach(avail => {
        const key = `${avail.activity_id}_${avail.local_date}_${avail.local_time}`
        if (!groupedMap.has(key)) {
          groupedMap.set(key, avail)
        } else {
          // Merge guide assignments if there are duplicates
          const existing = groupedMap.get(key)!
          if (avail.guide_assignments && avail.guide_assignments.length > 0) {
            existing.guide_assignments = [
              ...(existing.guide_assignments || []),
              ...avail.guide_assignments
            ]
          }
        }
      })

      const filteredAvails = Array.from(groupedMap.values())

      console.log('Total raw availabilities:', avails?.length || 0)
      console.log('After grouping by activity/date/time:', filteredAvails.length)

      // Exclude specific activity IDs (Traslados)
      const EXCLUDED_ACTIVITY_IDS = ['243718', '243709', '219735', '217930']
      const withoutExcluded = filteredAvails.filter(avail => !EXCLUDED_ACTIVITY_IDS.includes(avail.activity_id))

      console.log('After excluding specific activity IDs:', withoutExcluded.length)

      // Fetch activity details
      const activityIds = [...new Set(withoutExcluded?.map(a => a.activity_id) || [])]
      const { data: activities, error: actError } = await supabase
        .from('activities')
        .select('activity_id, title')
        .in('activity_id', activityIds)

      if (actError) throw actError

      // Store all activities for filter dropdown
      setAllActivities(activities || [])

      // Map activities to availabilities
      const activitiesMap = (activities || []).reduce((acc: Record<string, { activity_id: string; title: string }>, activity: { activity_id: string; title: string }) => {
        acc[activity.activity_id] = activity
        return acc
      }, {})

      // Don't filter anything - show all availabilities
      const enrichedData = (withoutExcluded || [])
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
      const start = startOfWeek(currentDate)
      const end = endOfWeek(currentDate)
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
    return eachDayOfInterval({ start, end })
  }

  const getAvailabilitiesForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd')
    let filtered = availabilities.filter(avail => avail.local_date === dayStr)

    // Apply activity filter
    if (selectedActivityIds.length > 0) {
      filtered = filtered.filter(avail => selectedActivityIds.includes(avail.activity_id))
    }

    // Apply bookings filter
    if (showOnlyWithBookings) {
      filtered = filtered.filter(avail => (avail.vacancy_sold || 0) > 0)
    }

    // Apply unassigned filter
    if (showOnlyUnassigned) {
      filtered = filtered.filter(avail => !avail.guide_assignments || avail.guide_assignments.length === 0)
    }

    return filtered
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available':
        return 'bg-green-100 border-green-300 text-green-800'
      case 'booked':
        return 'bg-blue-100 border-blue-300 text-blue-800'
      case 'cancelled':
        return 'bg-red-100 border-red-300 text-red-800'
      case 'full':
        return 'bg-orange-100 border-orange-300 text-orange-800'
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800'
    }
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
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {allActivities.map(activity => (
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
                  ))}
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
                    ? `Week of ${format(startOfWeek(currentDate), 'MMM d, yyyy')}`
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
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
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
                        className={`w-full text-left p-2 rounded border text-xs hover:shadow-md transition-shadow ${getStatusColor(avail.status)}`}
                      >
                        <div className="font-medium truncate">{avail.local_time.substring(0, 5)}</div>
                        <div className="truncate">{avail.activity.title}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <Users className="w-3 h-3" />
                          <span>{avail.vacancy_sold || 0}/{avail.vacancy_available || 0}</span>
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
                    <span>{selectedSlot.vacancy_sold || 0} / {selectedSlot.vacancy_available || 0} participants</span>
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
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                  {guides.length === 0 ? (
                    <p className="text-sm text-gray-500">No active guides available</p>
                  ) : (
                    guides.map(guide => (
                      <label key={guide.guide_id} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <Checkbox
                          checked={selectedGuides.includes(guide.guide_id)}
                          onCheckedChange={() => toggleGuide(guide.guide_id)}
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            {guide.first_name} {guide.last_name}
                          </div>
                          <div className="text-xs text-gray-600">{guide.email}</div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {guide.languages.map(lang => (
                              <span key={lang} className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full">
                                {lang}
                              </span>
                            ))}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
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
