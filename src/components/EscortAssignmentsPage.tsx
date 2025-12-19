'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { escortsApi } from '@/lib/api-client'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Users, UserCheck, Search, Save } from 'lucide-react'
import { format, addDays, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

interface ActivityAvailability {
  id: number
  activity_id: string
  local_date: string
  local_time: string
  actual_booking_count: number
  activity: {
    activity_id: string
    title: string
  }
  escort_assignments: {
    assignment_id: string
    escort: {
      escort_id: string
      first_name: string
      last_name: string
    }
  }[]
}

interface Escort {
  escort_id: string
  first_name: string
  last_name: string
  email: string
  languages: string[]
  active: boolean
}

export default function EscortAssignmentsPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [availabilities, setAvailabilities] = useState<ActivityAvailability[]>([])
  const [escorts, setEscorts] = useState<Escort[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [datePickerMonth, setDatePickerMonth] = useState(new Date())

  // Selected escort (left panel)
  const [selectedEscort, setSelectedEscort] = useState<Escort | null>(null)
  const [escortSearch, setEscortSearch] = useState('')

  // Selected slots for the escort (right panel)
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<number>>(new Set())

  // Track original assignments to compute changes
  const [originalAssignments, setOriginalAssignments] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const dateStr = format(currentDate, 'yyyy-MM-dd')

      // Fetch availabilities for the date
      const { data: avails, error: availError } = await supabase
        .from('activity_availability')
        .select('id, activity_id, local_date, local_time')
        .eq('local_date', dateStr)
        .order('local_time', { ascending: true })

      if (availError) throw availError

      const availabilityIds = avails?.map(a => a.id) || []

      // Fetch escort assignments via API (to bypass RLS)
      let escortAssignmentsData: { assignment_id: string; activity_availability_id: number; escort: { escort_id: string; first_name: string; last_name: string } }[] = []
      if (availabilityIds.length > 0) {
        const assignmentsResponse = await fetch(`/api/assignments/availability/list?availability_ids=${availabilityIds.join(',')}`, {
          credentials: 'include'
        })
        const assignmentsResult = await assignmentsResponse.json()
        if (assignmentsResult.data?.escorts) {
          escortAssignmentsData = assignmentsResult.data.escorts
        }
      }

      // Fetch actual bookings
      const { data: bookingsData } = await supabase
        .from('activity_bookings')
        .select('activity_id, start_time')
        .gte('start_date_time', `${dateStr}T00:00:00`)
        .lt('start_date_time', `${dateStr}T23:59:59`)

      const bookingCountsMap = new Map<string, number>()
      bookingsData?.forEach(booking => {
        const normalizedTime = booking.start_time.length === 5 ? `${booking.start_time}:00` : booking.start_time
        const key = `${booking.activity_id}_${normalizedTime}`
        bookingCountsMap.set(key, (bookingCountsMap.get(key) || 0) + 1)
      })

      // Group escort assignments by availability id
      // Transform the data to handle Supabase's nested relation format
      const transformedAssignments = (escortAssignmentsData || []).map(assignment => ({
        assignment_id: assignment.assignment_id,
        activity_availability_id: assignment.activity_availability_id,
        escort: Array.isArray(assignment.escort) ? assignment.escort[0] : assignment.escort
      }))

      const escortAssignmentsMap = new Map<number, { assignment_id: string; escort: { escort_id: string; first_name: string; last_name: string } }[]>()
      transformedAssignments.forEach(assignment => {
        if (!assignment.escort) return
        const existing = escortAssignmentsMap.get(assignment.activity_availability_id) || []
        escortAssignmentsMap.set(assignment.activity_availability_id, [...existing, assignment as { assignment_id: string; escort: { escort_id: string; first_name: string; last_name: string } }])
      })

      // Fetch activity details
      const activityIds = [...new Set(avails?.map(a => a.activity_id) || [])]
      const { data: activities } = await supabase
        .from('activities')
        .select('activity_id, title')
        .in('activity_id', activityIds)

      const activitiesMap = (activities || []).reduce((acc: Record<string, { activity_id: string; title: string }>, activity) => {
        acc[activity.activity_id] = activity
        return acc
      }, {})

      const enrichedData = (avails || []).map((avail) => {
        const key = `${avail.activity_id}_${avail.local_time}`
        return {
          ...avail,
          actual_booking_count: bookingCountsMap.get(key) || 0,
          activity: activitiesMap[avail.activity_id] || { activity_id: avail.activity_id, title: 'Unknown Activity' },
          escort_assignments: escortAssignmentsMap.get(avail.id) || []
        }
      }) as ActivityAvailability[]

      // Filter to only show slots with bookings
      const filtered = enrichedData.filter(a => a.actual_booking_count > 0)
      setAvailabilities(filtered)

      // Fetch all active escorts via API
      const escortsResult = await escortsApi.list()
      if (escortsResult.error) throw new Error(escortsResult.error)
      const activeEscorts = (escortsResult.data || [])
        .filter(e => e.active)
        .sort((a, b) => a.first_name.localeCompare(b.first_name))
      setEscorts(activeEscorts as Escort[])
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const goToPrevious = () => {
    setCurrentDate(prev => addDays(prev, -1))
    setSelectedEscort(null)
    setSelectedSlotIds(new Set())
  }

  const goToNext = () => {
    setCurrentDate(prev => addDays(prev, 1))
    setSelectedEscort(null)
    setSelectedSlotIds(new Set())
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedEscort(null)
    setSelectedSlotIds(new Set())
  }

  const handleSelectEscort = (escort: Escort) => {
    setSelectedEscort(escort)

    // Find all slots where this escort is already assigned
    const assignedSlotIds = new Set<number>()
    availabilities.forEach(avail => {
      const isAssigned = avail.escort_assignments.some(ea => ea.escort.escort_id === escort.escort_id)
      if (isAssigned) {
        assignedSlotIds.add(avail.id)
      }
    })

    setSelectedSlotIds(assignedSlotIds)
    setOriginalAssignments(new Set(assignedSlotIds))
  }

  const toggleSlot = (slotId: number) => {
    setSelectedSlotIds(prev => {
      const next = new Set(prev)
      if (next.has(slotId)) {
        next.delete(slotId)
      } else {
        next.add(slotId)
      }
      return next
    })
  }

  const hasChanges = () => {
    if (!selectedEscort) return false
    if (selectedSlotIds.size !== originalAssignments.size) return true
    for (const id of selectedSlotIds) {
      if (!originalAssignments.has(id)) return true
    }
    return false
  }

  const handleSave = async () => {
    if (!selectedEscort || !hasChanges()) return

    setSaving(true)
    setError(null)
    try {
      // Find slots to add and remove
      const slotsToAdd = [...selectedSlotIds].filter(id => !originalAssignments.has(id))
      const slotsToRemove = [...originalAssignments].filter(id => !selectedSlotIds.has(id))

      // Remove assignments
      for (const slotId of slotsToRemove) {
        const params = new URLSearchParams()
        params.append('activity_availability_id', String(slotId))
        params.append('escort_ids', selectedEscort.escort_id)

        const response = await fetch(`/api/assignments/availability?${params.toString()}`, {
          method: 'DELETE',
          credentials: 'include'
        })
        const result = await response.json()
        if (result.error) throw new Error(result.error)
      }

      // Add assignments
      for (const slotId of slotsToAdd) {
        const response = await fetch('/api/assignments/availability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            activity_availability_id: slotId,
            escort_ids: [selectedEscort.escort_id]
          })
        })
        const result = await response.json()
        if (result.error) throw new Error(result.error)
      }

      // Refresh data and update original assignments
      await fetchData()
      setOriginalAssignments(new Set(selectedSlotIds))
    } catch (err) {
      console.error('Error saving assignments:', err)
      setError(err instanceof Error ? err.message : 'Failed to save assignments')
    } finally {
      setSaving(false)
    }
  }

  const filteredEscorts = escorts.filter(e =>
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(escortSearch.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Escort Assignments</h1>
      </div>

      {/* Date Navigation */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          <button onClick={goToPrevious} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="text-center relative">
              <button
                onClick={() => {
                  setDatePickerMonth(currentDate)
                  setShowDatePicker(!showDatePicker)
                }}
                className="flex items-center gap-2 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
              >
                <CalendarIcon className="w-5 h-5 text-gray-500" />
                <span className="text-xl font-semibold">
                  {format(currentDate, 'EEEE, MMMM d, yyyy')}
                </span>
              </button>

              {showDatePicker && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-lg shadow-xl border z-50 p-4 min-w-[300px]">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={() => setDatePickerMonth(addMonths(datePickerMonth, -1))} className="p-1 hover:bg-gray-100 rounded">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="font-semibold">{format(datePickerMonth, 'MMMM yyyy')}</span>
                    <button onClick={() => setDatePickerMonth(addMonths(datePickerMonth, 1))} className="p-1 hover:bg-gray-100 rounded">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => (
                      <div key={day} className="text-xs font-medium text-gray-500 py-1">{day}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {(() => {
                      const monthStart = startOfMonth(datePickerMonth)
                      const monthEnd = endOfMonth(datePickerMonth)
                      const startDay = getDay(monthStart)
                      const adjustedStartDay = startDay === 0 ? 6 : startDay - 1
                      const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
                      const blanks = Array(adjustedStartDay).fill(null)
                      return [...blanks, ...days].map((day, idx) => {
                        if (!day) return <div key={`blank-${idx}`} className="p-2" />
                        const isSelected = isSameDay(day, currentDate)
                        const isToday = isSameDay(day, new Date())
                        return (
                          <button
                            key={day.toISOString()}
                            onClick={() => { setCurrentDate(day); setShowDatePicker(false) }}
                            className={`p-2 text-sm rounded-lg hover:bg-gray-100 ${isSelected ? 'bg-orange-500 text-white hover:bg-orange-500' : ''} ${isToday && !isSelected ? 'ring-2 ring-orange-500' : ''}`}
                          >
                            {format(day, 'd')}
                          </button>
                        )
                      })
                    })()}
                  </div>
                  <div className="mt-3 pt-3 border-t flex justify-between">
                    <button onClick={() => { setCurrentDate(new Date()); setShowDatePicker(false) }} className="text-sm text-orange-500 hover:underline">Go to today</button>
                    <button onClick={() => setShowDatePicker(false)} className="text-sm text-gray-500 hover:underline">Close</button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={goToToday}
              className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 text-sm"
            >
              Today
            </button>
          </div>

          <button onClick={goToNext} className="p-2 hover:bg-gray-100 rounded-full">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-500">Loading...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - Escorts List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2 mb-3">
                <UserCheck className="w-5 h-5 text-orange-600" />
                Select Escort
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search escorts..."
                  value={escortSearch}
                  onChange={(e) => setEscortSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {filteredEscorts.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No escorts found</div>
              ) : (
                filteredEscorts.map(escort => {
                  // Count how many services this escort is assigned to today
                  const assignmentCount = availabilities.filter(a =>
                    a.escort_assignments.some(ea => ea.escort.escort_id === escort.escort_id)
                  ).length

                  return (
                    <div
                      key={escort.escort_id}
                      onClick={() => handleSelectEscort(escort)}
                      className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                        selectedEscort?.escort_id === escort.escort_id ? 'bg-orange-50 border-l-4 border-l-orange-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{escort.first_name} {escort.last_name}</div>
                          <div className="text-sm text-gray-500">{escort.email}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {assignmentCount > 0 && (
                            <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">
                              {assignmentCount} assigned
                            </span>
                          )}
                          <div className="flex gap-1">
                            {escort.languages.map(lang => (
                              <span key={lang} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                                {lang}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Panel - Services List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-600" />
                {selectedEscort
                  ? `Assign ${selectedEscort.first_name} to Services`
                  : 'Select an escort first'}
              </h2>
              {selectedEscort && hasChanges() && (
                <Button onClick={handleSave} disabled={saving} size="sm">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {!selectedEscort ? (
                <div className="p-8 text-center text-gray-500">
                  Select an escort from the left panel to assign them to services
                </div>
              ) : availabilities.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No services with bookings for this date
                </div>
              ) : (
                availabilities.map(avail => {
                  const isSelected = selectedSlotIds.has(avail.id)
                  const otherEscorts = avail.escort_assignments
                    .filter(ea => ea.escort.escort_id !== selectedEscort.escort_id)
                    .map(ea => `${ea.escort.first_name} ${ea.escort.last_name}`)

                  return (
                    <label
                      key={avail.id}
                      className={`flex items-start gap-3 p-4 border-b cursor-pointer hover:bg-gray-50 ${
                        isSelected ? 'bg-orange-50' : ''
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSlot(avail.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-orange-600">{avail.local_time.substring(0, 5)}</span>
                          <span className="font-medium">{avail.activity.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                          <Users className="w-3 h-3" />
                          <span>{avail.actual_booking_count} bookings</span>
                        </div>
                        {otherEscorts.length > 0 && (
                          <div className="text-xs text-gray-400 mt-1">
                            Also assigned: {otherEscorts.join(', ')}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
