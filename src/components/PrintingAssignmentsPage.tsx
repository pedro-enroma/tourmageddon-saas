'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { printingApi } from '@/lib/api-client'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Users, Printer, Search, Save } from 'lucide-react'
import { format, addDays } from 'date-fns'
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
  printing_assignments: {
    assignment_id: string
    printing: {
      printing_id: string
      name: string
    }
  }[]
}

interface Printing {
  printing_id: string
  name: string
  email: string | null
  phone_number: string | null
  active: boolean
}

export default function PrintingAssignmentsPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [availabilities, setAvailabilities] = useState<ActivityAvailability[]>([])
  const [printingContacts, setPrintingContacts] = useState<Printing[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Selected printing contact (left panel)
  const [selectedPrinting, setSelectedPrinting] = useState<Printing | null>(null)
  const [printingSearch, setPrintingSearch] = useState('')

  // Selected slots for the printing contact (right panel)
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

      // Fetch printing assignments via API (to bypass RLS)
      let printingAssignmentsData: { assignment_id: string; activity_availability_id: number; printing: { printing_id: string; name: string } }[] = []
      if (availabilityIds.length > 0) {
        const assignmentsResponse = await fetch(`/api/assignments/availability/list?availability_ids=${availabilityIds.join(',')}`, {
          credentials: 'include'
        })
        const assignmentsResult = await assignmentsResponse.json()
        if (assignmentsResult.data?.printing) {
          printingAssignmentsData = assignmentsResult.data.printing
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

      // Group printing assignments by availability id
      // Transform the data to handle Supabase's nested relation format
      const transformedAssignments = (printingAssignmentsData || []).map(assignment => ({
        assignment_id: assignment.assignment_id,
        activity_availability_id: assignment.activity_availability_id,
        printing: Array.isArray(assignment.printing) ? assignment.printing[0] : assignment.printing
      }))

      const printingAssignmentsMap = new Map<number, { assignment_id: string; printing: { printing_id: string; name: string } }[]>()
      transformedAssignments.forEach(assignment => {
        if (!assignment.printing) return
        const existing = printingAssignmentsMap.get(assignment.activity_availability_id) || []
        printingAssignmentsMap.set(assignment.activity_availability_id, [...existing, assignment as { assignment_id: string; printing: { printing_id: string; name: string } }])
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
          printing_assignments: printingAssignmentsMap.get(avail.id) || []
        }
      }) as ActivityAvailability[]

      // Filter to only show slots with bookings
      const filtered = enrichedData.filter(a => a.actual_booking_count > 0)
      setAvailabilities(filtered)

      // Fetch all active printing contacts via API
      const printingResult = await printingApi.list()
      if (printingResult.error) throw new Error(printingResult.error)
      const activePrinting = (printingResult.data || [])
        .filter(p => p.active)
        .sort((a, b) => a.name.localeCompare(b.name))
      setPrintingContacts(activePrinting as Printing[])
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const goToPrevious = () => {
    setCurrentDate(prev => addDays(prev, -1))
    setSelectedPrinting(null)
    setSelectedSlotIds(new Set())
  }

  const goToNext = () => {
    setCurrentDate(prev => addDays(prev, 1))
    setSelectedPrinting(null)
    setSelectedSlotIds(new Set())
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedPrinting(null)
    setSelectedSlotIds(new Set())
  }

  const handleSelectPrinting = (printing: Printing) => {
    setSelectedPrinting(printing)

    // Find all slots where this printing contact is already assigned
    const assignedSlotIds = new Set<number>()
    availabilities.forEach(avail => {
      const isAssigned = avail.printing_assignments.some(pa => pa.printing.printing_id === printing.printing_id)
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
    if (!selectedPrinting) return false
    if (selectedSlotIds.size !== originalAssignments.size) return true
    for (const id of selectedSlotIds) {
      if (!originalAssignments.has(id)) return true
    }
    return false
  }

  const handleSave = async () => {
    if (!selectedPrinting || !hasChanges()) return

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
        params.append('printing_ids', selectedPrinting.printing_id)

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
            printing_ids: [selectedPrinting.printing_id]
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

  const filteredPrinting = printingContacts.filter(p =>
    p.name.toLowerCase().includes(printingSearch.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Printing Assignments</h1>
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
                  {format(currentDate, 'EEEE, MMMM d, yyyy')}
                </span>
              </div>
            </div>
            <button
              onClick={goToToday}
              className="px-4 py-2 bg-cyan-500 text-white rounded-md hover:bg-cyan-600 text-sm"
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
          {/* Left Panel - Printing Contacts List */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2 mb-3">
                <Printer className="w-5 h-5 text-cyan-600" />
                Select Printing Contact
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search printing contacts..."
                  value={printingSearch}
                  onChange={(e) => setPrintingSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {filteredPrinting.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No printing contacts found</div>
              ) : (
                filteredPrinting.map(printing => {
                  // Count how many services this printing contact is assigned to today
                  const assignmentCount = availabilities.filter(a =>
                    a.printing_assignments.some(pa => pa.printing.printing_id === printing.printing_id)
                  ).length

                  return (
                    <div
                      key={printing.printing_id}
                      onClick={() => handleSelectPrinting(printing)}
                      className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                        selectedPrinting?.printing_id === printing.printing_id ? 'bg-cyan-50 border-l-4 border-l-cyan-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            <Printer className="w-4 h-4 text-cyan-500" />
                            {printing.name}
                          </div>
                          {printing.phone_number && (
                            <div className="text-sm text-gray-500">{printing.phone_number}</div>
                          )}
                        </div>
                        {assignmentCount > 0 && (
                          <span className="px-2 py-1 text-xs bg-cyan-100 text-cyan-800 rounded">
                            {assignmentCount} assigned
                          </span>
                        )}
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
                <Clock className="w-5 h-5 text-cyan-600" />
                {selectedPrinting
                  ? `Assign ${selectedPrinting.name} to Services`
                  : 'Select a printing contact first'}
              </h2>
              {selectedPrinting && hasChanges() && (
                <Button onClick={handleSave} disabled={saving} size="sm" className="bg-cyan-600 hover:bg-cyan-700">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </div>
            <div className="max-h-[500px] overflow-y-auto">
              {!selectedPrinting ? (
                <div className="p-8 text-center text-gray-500">
                  Select a printing contact from the left panel to assign it to services
                </div>
              ) : availabilities.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No services with bookings for this date
                </div>
              ) : (
                availabilities.map(avail => {
                  const isSelected = selectedSlotIds.has(avail.id)
                  const otherPrinting = avail.printing_assignments
                    .filter(pa => pa.printing.printing_id !== selectedPrinting.printing_id)
                    .map(pa => pa.printing.name)

                  return (
                    <label
                      key={avail.id}
                      className={`flex items-start gap-3 p-4 border-b cursor-pointer hover:bg-gray-50 ${
                        isSelected ? 'bg-cyan-50' : ''
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSlot(avail.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-cyan-600">{avail.local_time.substring(0, 5)}</span>
                          <span className="font-medium">{avail.activity.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                          <Users className="w-3 h-3" />
                          <span>{avail.actual_booking_count} bookings</span>
                        </div>
                        {otherPrinting.length > 0 && (
                          <div className="text-xs text-gray-400 mt-1">
                            Also assigned: {otherPrinting.join(', ')}
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
