'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Calendar, ChevronLeft, ChevronRight, User, Clock, Users, UserCheck } from 'lucide-react'
import { format, addDays, startOfDay } from 'date-fns'

interface Person {
  id: string
  first_name: string
  last_name: string
}

interface ServiceSlot {
  id: number
  activity_id: string
  activity_title: string
  local_date: string
  local_time: string
  vacancy_sold: number
  vacancy_opening: number
  guides: Person[]
  escorts: Person[]
}

export default function UpcomingServicesPage() {
  const [services, setServices] = useState<ServiceSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [excludedActivityIds, setExcludedActivityIds] = useState<string[]>([])

  useEffect(() => {
    fetchExcludedActivities()
  }, [])

  useEffect(() => {
    if (excludedActivityIds !== null) {
      fetchServices()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, excludedActivityIds])

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

  const fetchServices = async () => {
    setLoading(true)
    setError(null)
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')

      // Fetch activity availabilities for the selected date
      const { data: availabilities, error: availError } = await supabase
        .from('activity_availability')
        .select('id, activity_id, local_date, local_time, vacancy_sold, vacancy_opening')
        .eq('local_date', dateStr)
        .gt('vacancy_sold', 0)
        .neq('local_time', '00:00:00')
        .order('local_time', { ascending: true })

      if (availError) throw availError

      if (!availabilities || availabilities.length === 0) {
        setServices([])
        return
      }

      // Filter out excluded activities
      const filteredAvailabilities = excludedActivityIds.length > 0
        ? availabilities.filter(a => !excludedActivityIds.includes(a.activity_id))
        : availabilities

      if (filteredAvailabilities.length === 0) {
        setServices([])
        return
      }

      const availabilityIds = filteredAvailabilities.map(a => a.id)
      const activityIds = [...new Set(filteredAvailabilities.map(a => a.activity_id))]

      // Fetch activity titles
      const { data: activities, error: actError } = await supabase
        .from('activities')
        .select('activity_id, title')
        .in('activity_id', activityIds)

      if (actError) throw actError

      const activitiesMap = (activities || []).reduce((acc: Record<string, string>, a) => {
        acc[a.activity_id] = a.title
        return acc
      }, {})

      // Fetch guide assignments
      const { data: guideAssignments, error: guideError } = await supabase
        .from('guide_assignments')
        .select(`
          activity_availability_id,
          guide:guides (
            guide_id,
            first_name,
            last_name
          )
        `)
        .in('activity_availability_id', availabilityIds)

      if (guideError) throw guideError

      // Fetch escort assignments
      const { data: escortAssignments, error: escortError } = await supabase
        .from('escort_assignments')
        .select(`
          activity_availability_id,
          escort:escorts (
            escort_id,
            first_name,
            last_name
          )
        `)
        .in('activity_availability_id', availabilityIds)

      if (escortError) throw escortError

      // Group assignments by availability id
      const guidesByAvailability = new Map<number, Person[]>()
      guideAssignments?.forEach(ga => {
        const guide = Array.isArray(ga.guide) ? ga.guide[0] : ga.guide
        if (!guide) return
        const existing = guidesByAvailability.get(ga.activity_availability_id) || []
        existing.push({
          id: guide.guide_id,
          first_name: guide.first_name,
          last_name: guide.last_name
        })
        guidesByAvailability.set(ga.activity_availability_id, existing)
      })

      const escortsByAvailability = new Map<number, Person[]>()
      escortAssignments?.forEach(ea => {
        const escort = Array.isArray(ea.escort) ? ea.escort[0] : ea.escort
        if (!escort) return
        const existing = escortsByAvailability.get(ea.activity_availability_id) || []
        existing.push({
          id: escort.escort_id,
          first_name: escort.first_name,
          last_name: escort.last_name
        })
        escortsByAvailability.set(ea.activity_availability_id, existing)
      })

      // Build service slots - only include slots with at least one guide or escort
      const serviceSlots: ServiceSlot[] = filteredAvailabilities
        .map(avail => {
          const guides = guidesByAvailability.get(avail.id) || []
          const escorts = escortsByAvailability.get(avail.id) || []

          // Only include if there's at least one assignment
          if (guides.length === 0 && escorts.length === 0) return null

          return {
            id: avail.id,
            activity_id: avail.activity_id,
            activity_title: activitiesMap[avail.activity_id] || 'Unknown Activity',
            local_date: avail.local_date,
            local_time: avail.local_time,
            vacancy_sold: avail.vacancy_sold || 0,
            vacancy_opening: avail.vacancy_opening || 0,
            guides,
            escorts
          }
        })
        .filter((s): s is ServiceSlot => s !== null)

      setServices(serviceSlots)
    } catch (err) {
      console.error('Error fetching services:', err)
      setError('Failed to load services')
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

  // Group services by time
  const groupedByTime = services.reduce((acc, service) => {
    const time = service.local_time
    if (!acc[time]) {
      acc[time] = []
    }
    acc[time].push(service)
    return acc
  }, {} as Record<string, ServiceSlot[]>)

  const timeSlots = Object.keys(groupedByTime).sort()

  return (
    <div className="p-6 max-w-5xl mx-auto">
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

      {/* Services List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-500">Loading services...</div>
        </div>
      ) : timeSlots.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Services Scheduled</h3>
          <p className="text-gray-500">
            There are no assigned services for {format(selectedDate, 'MMMM d, yyyy')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {timeSlots.map(time => (
            <div key={time}>
              {/* Time Header */}
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-600">
                  {time.substring(0, 5)}
                </span>
              </div>

              {/* Services for this time */}
              <div className="space-y-2 ml-6">
                {groupedByTime[time].map(service => (
                  <div key={service.id} className="bg-white rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-4">
                      {/* Activity Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate">
                          {service.activity_title}
                        </h3>
                        <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                          <Users className="w-4 h-4" />
                          <span>{service.vacancy_sold} pax</span>
                        </div>
                      </div>

                      {/* Staff */}
                      <div className="flex gap-4 text-sm">
                        {service.guides.length > 0 && (
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-purple-600" />
                            <span className="text-gray-700">
                              {service.guides.map(g => g.first_name).join(', ')}
                            </span>
                          </div>
                        )}
                        {service.escorts.length > 0 && (
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-green-600" />
                            <span className="text-gray-700">
                              {service.escorts.map(e => e.first_name).join(', ')}
                            </span>
                          </div>
                        )}
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
