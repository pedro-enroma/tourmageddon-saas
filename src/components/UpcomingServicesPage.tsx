'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Calendar, ChevronLeft, ChevronRight, User, MapPin, Clock, Users } from 'lucide-react'
import { format, addDays, startOfDay } from 'date-fns'

interface Guide {
  guide_id: string
  first_name: string
  last_name: string
  email: string
  phone_number: string | null
  languages: string[]
}

interface Activity {
  activity_id: string
  title: string
}

interface Assignment {
  assignment_id: string
  activity_availability_id: number
  guide: Guide
  activity_availability: {
    id: number
    local_date: string
    local_time: string
    local_date_time: string
    status: string
    vacancy_available: number
    vacancy_sold: number
    activity: Activity
  }
}

export default function UpcomingServicesPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())

  useEffect(() => {
    fetchAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  const fetchAssignments = async () => {
    setLoading(true)
    setError(null)
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')

      const { data, error } = await supabase
        .from('guide_assignments')
        .select(`
          assignment_id,
          activity_availability_id,
          guide:guides!inner(
            guide_id,
            first_name,
            last_name,
            email,
            phone_number,
            languages
          ),
          activity_availability:activity_availability!inner(
            id,
            local_date,
            local_time,
            local_date_time,
            status,
            vacancy_available,
            vacancy_sold,
            activity_id
          )
        `)
        .eq('activity_availability.local_date', dateStr)
        .order('activity_availability(local_time)', { ascending: true })

      if (error) throw error

      // Fetch activity details separately
      const activityIds = [...new Set(data?.map((a) => a.activity_availability.activity_id) || [])]

      const { data: activities, error: actError } = await supabase
        .from('activities')
        .select('activity_id, title')
        .in('activity_id', activityIds)

      if (actError) throw actError

      // Map activities to assignments
      const activitiesMap = (activities || []).reduce((acc: Record<string, { activity_id: string; title: string }>, activity: { activity_id: string; title: string }) => {
        acc[activity.activity_id] = activity
        return acc
      }, {})

      const enrichedData = (data || []).map((assignment) => ({
        ...assignment,
        activity_availability: {
          ...assignment.activity_availability,
          activity: activitiesMap[assignment.activity_availability.activity_id] || {
            activity_id: assignment.activity_availability.activity_id,
            title: 'Unknown Activity'
          }
        }
      })) as Assignment[]

      setAssignments(enrichedData)
    } catch (err) {
      console.error('Error fetching assignments:', err)
      setError('Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }

  const goToPreviousDay = () => {
    setSelectedDate(prev => addDays(prev, -1))
  }

  const goToNextDay = () => {
    setSelectedDate(prev => addDays(prev, 1))
  }

  const goToToday = () => {
    setSelectedDate(startOfDay(new Date()))
  }

  // Group assignments by time
  const groupedByTime = assignments.reduce((acc, assignment) => {
    const time = assignment.activity_availability.local_time
    if (!acc[time]) {
      acc[time] = []
    }
    acc[time].push(assignment)
    return acc
  }, {} as Record<string, Assignment[]>)

  const timeSlots = Object.keys(groupedByTime).sort()

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Upcoming Services</h1>
      </div>

      {/* Date Navigation */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={goToPreviousDay}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gray-500" />
                <span className="text-xl font-semibold">
                  {format(selectedDate, 'EEEE, MMMM d, yyyy')}
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
            onClick={goToNextDay}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Assignments List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-500">Loading assignments...</div>
        </div>
      ) : timeSlots.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Services Scheduled</h3>
          <p className="text-gray-500">
            There are no guide assignments for {format(selectedDate, 'MMMM d, yyyy')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {timeSlots.map(time => (
            <div key={time} className="bg-white rounded-lg shadow overflow-hidden">
              {/* Time Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3">
                <div className="flex items-center gap-2 text-white">
                  <Clock className="w-5 h-5" />
                  <span className="text-lg font-semibold">
                    {time.substring(0, 5)}
                  </span>
                </div>
              </div>

              {/* Assignments for this time */}
              <div className="divide-y divide-gray-200">
                {groupedByTime[time].map(assignment => (
                  <div key={assignment.assignment_id} className="p-6 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between">
                      {/* Activity Info */}
                      <div className="flex-1">
                        <div className="flex items-start gap-4">
                          <div className="bg-blue-100 p-3 rounded-lg">
                            <MapPin className="w-6 h-6 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                              {assignment.activity_availability.activity.title}
                            </h3>
                            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                <span>
                                  {assignment.activity_availability.vacancy_sold || 0} / {assignment.activity_availability.vacancy_available || 0} pax
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  assignment.activity_availability.status === 'available'
                                    ? 'bg-green-100 text-green-800'
                                    : assignment.activity_availability.status === 'booked'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {assignment.activity_availability.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Guide Info */}
                      <div className="ml-6 bg-gray-50 rounded-lg p-4 min-w-[280px]">
                        <div className="flex items-start gap-3">
                          <div className="bg-purple-100 p-2 rounded-full">
                            <User className="w-5 h-5 text-purple-600" />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900">
                              {assignment.guide.first_name} {assignment.guide.last_name}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              {assignment.guide.email}
                            </div>
                            {assignment.guide.phone_number && (
                              <div className="text-sm text-gray-600">
                                {assignment.guide.phone_number}
                              </div>
                            )}
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {assignment.guide.languages.map(lang => (
                                <span
                                  key={lang}
                                  className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full"
                                >
                                  {lang}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
