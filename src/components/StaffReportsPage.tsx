'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Download, Calendar as CalendarIcon, FileSpreadsheet, User, UserCheck } from 'lucide-react'
import * as XLSX from 'xlsx'
import { sanitizeDataForExcel } from '@/lib/security/sanitize'

interface Guide {
  guide_id: string
  first_name: string
  last_name: string
  email: string
}

interface Escort {
  escort_id: string
  first_name: string
  last_name: string
  email: string
}

interface AssignmentReport {
  assignment_id: string
  local_date: string
  local_time: string
  activity_title: string
  staff_name: string
  staff_type: 'Guide' | 'Escort'
  participants: number
  capacity: number
  status: string
}

export default function StaffReportsPage() {
  const [guides, setGuides] = useState<Guide[]>([])
  const [escorts, setEscorts] = useState<Escort[]>([])
  const [selectedGuides, setSelectedGuides] = useState<string[]>([])
  const [selectedEscorts, setSelectedEscorts] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [assignments, setAssignments] = useState<AssignmentReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'guides' | 'escorts'>('guides')

  useEffect(() => {
    fetchStaff()
  }, [])

  const fetchStaff = async () => {
    try {
      const [guidesRes, escortsRes] = await Promise.all([
        supabase
          .from('guides')
          .select('guide_id, first_name, last_name, email')
          .eq('active', true)
          .order('first_name', { ascending: true }),
        supabase
          .from('escorts')
          .select('escort_id, first_name, last_name, email')
          .eq('active', true)
          .order('first_name', { ascending: true })
      ])

      if (guidesRes.error) throw guidesRes.error
      if (escortsRes.error) throw escortsRes.error

      setGuides(guidesRes.data || [])
      setEscorts(escortsRes.data || [])
    } catch (err) {
      console.error('Error fetching staff:', err)
      setError('Failed to load staff')
    }
  }

  const fetchAssignments = async () => {
    if (selectedGuides.length === 0 && selectedEscorts.length === 0) {
      setError('Please select at least one guide or escort')
      return
    }

    if (!startDate || !endDate) {
      setError('Please select both start and end dates')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const reportData: AssignmentReport[] = []

      // Fetch guide assignments
      if (selectedGuides.length > 0) {
        const { data: guideAssignments, error: guideError } = await supabase
          .from('guide_assignments')
          .select('assignment_id, guide_id, activity_availability_id')
          .in('guide_id', selectedGuides)

        if (guideError) throw guideError

        if (guideAssignments && guideAssignments.length > 0) {
          const availabilityIds = guideAssignments.map(a => a.activity_availability_id)

          const { data: availabilities, error: availError } = await supabase
            .from('activity_availability')
            .select('id, local_date, local_time, vacancy_sold, vacancy_opening, status, activity_id')
            .in('id', availabilityIds)
            .gte('local_date', startDate)
            .lte('local_date', endDate)
            .order('local_date', { ascending: true })
            .order('local_time', { ascending: true })

          if (availError) throw availError

          const activityIds = [...new Set(availabilities?.map(a => a.activity_id) || [])]
          const { data: activities } = await supabase
            .from('activities')
            .select('activity_id, title')
            .in('activity_id', activityIds)

          const activitiesMap = (activities || []).reduce((acc: Record<string, string>, a) => {
            acc[a.activity_id] = a.title
            return acc
          }, {})

          const guidesMap = guides.reduce((acc: Record<string, Guide>, g) => {
            acc[g.guide_id] = g
            return acc
          }, {})

          const availabilitiesMap = (availabilities || []).reduce((acc: Record<number, typeof availabilities[0]>, a) => {
            acc[a.id] = a
            return acc
          }, {})

          guideAssignments.forEach(assignment => {
            const availability = availabilitiesMap[assignment.activity_availability_id]
            const guide = guidesMap[assignment.guide_id]

            if (availability && guide) {
              reportData.push({
                assignment_id: assignment.assignment_id,
                local_date: availability.local_date,
                local_time: availability.local_time,
                activity_title: activitiesMap[availability.activity_id] || 'Unknown Activity',
                staff_name: `${guide.first_name} ${guide.last_name}`,
                staff_type: 'Guide',
                participants: availability.vacancy_sold || 0,
                capacity: availability.vacancy_opening || 0,
                status: availability.status || ''
              })
            }
          })
        }
      }

      // Fetch escort assignments
      if (selectedEscorts.length > 0) {
        const { data: escortAssignments, error: escortError } = await supabase
          .from('escort_assignments')
          .select('assignment_id, escort_id, activity_availability_id')
          .in('escort_id', selectedEscorts)

        if (escortError) throw escortError

        if (escortAssignments && escortAssignments.length > 0) {
          const availabilityIds = escortAssignments.map(a => a.activity_availability_id)

          const { data: availabilities, error: availError } = await supabase
            .from('activity_availability')
            .select('id, local_date, local_time, vacancy_sold, vacancy_opening, status, activity_id')
            .in('id', availabilityIds)
            .gte('local_date', startDate)
            .lte('local_date', endDate)
            .order('local_date', { ascending: true })
            .order('local_time', { ascending: true })

          if (availError) throw availError

          const activityIds = [...new Set(availabilities?.map(a => a.activity_id) || [])]
          const { data: activities } = await supabase
            .from('activities')
            .select('activity_id, title')
            .in('activity_id', activityIds)

          const activitiesMap = (activities || []).reduce((acc: Record<string, string>, a) => {
            acc[a.activity_id] = a.title
            return acc
          }, {})

          const escortsMap = escorts.reduce((acc: Record<string, Escort>, e) => {
            acc[e.escort_id] = e
            return acc
          }, {})

          const availabilitiesMap = (availabilities || []).reduce((acc: Record<number, typeof availabilities[0]>, a) => {
            acc[a.id] = a
            return acc
          }, {})

          escortAssignments.forEach(assignment => {
            const availability = availabilitiesMap[assignment.activity_availability_id]
            const escort = escortsMap[assignment.escort_id]

            if (availability && escort) {
              reportData.push({
                assignment_id: assignment.assignment_id,
                local_date: availability.local_date,
                local_time: availability.local_time,
                activity_title: activitiesMap[availability.activity_id] || 'Unknown Activity',
                staff_name: `${escort.first_name} ${escort.last_name}`,
                staff_type: 'Escort',
                participants: availability.vacancy_sold || 0,
                capacity: availability.vacancy_opening || 0,
                status: availability.status || ''
              })
            }
          })
        }
      }

      // Sort by date and time
      reportData.sort((a, b) => {
        const dateCompare = a.local_date.localeCompare(b.local_date)
        if (dateCompare !== 0) return dateCompare
        return a.local_time.localeCompare(b.local_time)
      })

      setAssignments(reportData)
    } catch (err) {
      console.error('Error fetching assignments:', err)
      setError('Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }

  const toggleGuideSelection = (guideId: string) => {
    setSelectedGuides(prev =>
      prev.includes(guideId)
        ? prev.filter(id => id !== guideId)
        : [...prev, guideId]
    )
  }

  const toggleEscortSelection = (escortId: string) => {
    setSelectedEscorts(prev =>
      prev.includes(escortId)
        ? prev.filter(id => id !== escortId)
        : [...prev, escortId]
    )
  }

  const selectAllGuides = () => {
    if (selectedGuides.length === guides.length) {
      setSelectedGuides([])
    } else {
      setSelectedGuides(guides.map(g => g.guide_id))
    }
  }

  const selectAllEscorts = () => {
    if (selectedEscorts.length === escorts.length) {
      setSelectedEscorts([])
    } else {
      setSelectedEscorts(escorts.map(e => e.escort_id))
    }
  }

  const exportToExcel = () => {
    if (assignments.length === 0) {
      setError('No data to export')
      return
    }

    const exportData = assignments.map(assignment => ({
      'Date': format(new Date(assignment.local_date), 'yyyy-MM-dd (EEEE)'),
      'Time': assignment.local_time.substring(0, 5),
      'Activity': assignment.activity_title,
      'Staff Name': assignment.staff_name,
      'Type': assignment.staff_type,
      'Participants': assignment.participants,
      'Capacity': assignment.capacity,
      'Status': assignment.status
    }))

    const sanitizedData = sanitizeDataForExcel(exportData)

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(sanitizedData)

    const colWidths = [
      { wch: 20 }, // Date
      { wch: 10 }, // Time
      { wch: 40 }, // Activity
      { wch: 20 }, // Staff Name
      { wch: 10 }, // Type
      { wch: 12 }, // Participants
      { wch: 10 }, // Capacity
      { wch: 10 }  // Status
    ]
    ws['!cols'] = colWidths

    XLSX.utils.book_append_sheet(wb, ws, 'Staff Assignments')

    const filename = `staff-report-${startDate}-to-${endDate}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-blue-600" />
            Staff Reports
          </h1>
          <p className="text-gray-600 mt-2">
            Select guides and/or escorts and date range to generate assignment reports
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Date Range */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <CalendarIcon className="w-4 h-4 inline mr-2" />
                Date Range
              </label>
              <div className="flex gap-3">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="flex items-center text-gray-500">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-end gap-3">
              <button
                onClick={fetchAssignments}
                disabled={loading || (selectedGuides.length === 0 && selectedEscorts.length === 0) || !startDate || !endDate}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Loading...' : 'Generate Report'}
              </button>
              <button
                onClick={exportToExcel}
                disabled={assignments.length === 0}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Excel
              </button>
            </div>
          </div>

          {/* Staff Selection Tabs */}
          <div className="mt-6">
            <div className="flex border-b mb-4">
              <button
                onClick={() => setActiveTab('guides')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'guides'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Guides ({selectedGuides.length} selected)
                </div>
              </button>
              <button
                onClick={() => setActiveTab('escorts')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'escorts'
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4" />
                  Escorts ({selectedEscorts.length} selected)
                </div>
              </button>
            </div>

            {/* Guides Tab */}
            {activeTab === 'guides' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Select Guides
                  </label>
                  <button
                    onClick={selectAllGuides}
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                  >
                    {selectedGuides.length === guides.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto">
                  {guides.map((guide) => (
                    <label
                      key={guide.guide_id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedGuides.includes(guide.guide_id)}
                        onChange={() => toggleGuideSelection(guide.guide_id)}
                        className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {guide.first_name} {guide.last_name}
                        </div>
                        <div className="text-sm text-gray-500">{guide.email}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Escorts Tab */}
            {activeTab === 'escorts' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Select Escorts
                  </label>
                  <button
                    onClick={selectAllEscorts}
                    className="text-sm text-green-600 hover:text-green-700 font-medium"
                  >
                    {selectedEscorts.length === escorts.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto">
                  {escorts.map((escort) => (
                    <label
                      key={escort.escort_id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEscorts.includes(escort.escort_id)}
                        onChange={() => toggleEscortSelection(escort.escort_id)}
                        className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {escort.first_name} {escort.last_name}
                        </div>
                        <div className="text-sm text-gray-500">{escort.email}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Results */}
        {assignments.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-900">
                Assignment Report ({assignments.length} assignments)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Activity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Staff
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Participants
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {assignments.map((assignment) => (
                    <tr key={assignment.assignment_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(new Date(assignment.local_date), 'MMM d, yyyy (EEE)')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {assignment.local_time.substring(0, 5)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {assignment.activity_title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {assignment.staff_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          assignment.staff_type === 'Guide'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {assignment.staff_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {assignment.participants} / {assignment.capacity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          assignment.status === 'CONFIRMED'
                            ? 'bg-green-100 text-green-800'
                            : assignment.status === 'CLOSED'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {assignment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && assignments.length === 0 && startDate && endDate && (selectedGuides.length > 0 || selectedEscorts.length > 0) && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments found</h3>
            <p className="text-gray-500">
              No assignments found for the selected staff and date range.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
