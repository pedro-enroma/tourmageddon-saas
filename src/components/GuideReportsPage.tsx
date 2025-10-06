'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Download, Calendar as CalendarIcon, Users, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Guide {
  guide_id: string
  first_name: string
  last_name: string
  email: string
}

interface AssignmentReport {
  assignment_id: string
  local_date: string
  local_time: string
  activity_title: string
  guide_name: string
  participants: number
  capacity: number
  status: string
}

export default function GuideReportsPage() {
  const [guides, setGuides] = useState<Guide[]>([])
  const [selectedGuides, setSelectedGuides] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [assignments, setAssignments] = useState<AssignmentReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchGuides()
  }, [])

  const fetchGuides = async () => {
    try {
      const { data, error } = await supabase
        .from('guides')
        .select('guide_id, first_name, last_name, email')
        .eq('active', true)
        .order('first_name', { ascending: true })

      if (error) throw error
      setGuides(data || [])
    } catch (err) {
      console.error('Error fetching guides:', err)
      setError('Failed to load guides')
    }
  }

  const fetchAssignments = async () => {
    if (selectedGuides.length === 0) {
      setError('Please select at least one guide')
      return
    }

    if (!startDate || !endDate) {
      setError('Please select both start and end dates')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('guide_assignments')
        .select(`
          assignment_id,
          guide_id,
          guide:guides (
            guide_id,
            first_name,
            last_name
          ),
          availability:activity_availability (
            local_date,
            local_time,
            vacancy_sold,
            vacancy_opening,
            status,
            activity:activities (
              title
            )
          )
        `)
        .in('guide_id', selectedGuides)
        .gte('availability.local_date', startDate)
        .lte('availability.local_date', endDate)
        .order('availability.local_date', { ascending: true })

      if (error) throw error

      // Transform data into report format
      const reportData: AssignmentReport[] = (data || []).map((assignment: any) => ({
        assignment_id: assignment.assignment_id,
        local_date: assignment.availability?.local_date || '',
        local_time: assignment.availability?.local_time || '',
        activity_title: assignment.availability?.activity?.title || 'Unknown Activity',
        guide_name: `${assignment.guide?.first_name} ${assignment.guide?.last_name}`,
        participants: assignment.availability?.vacancy_sold || 0,
        capacity: assignment.availability?.vacancy_opening || 0,
        status: assignment.availability?.status || ''
      }))

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

  const selectAllGuides = () => {
    if (selectedGuides.length === guides.length) {
      setSelectedGuides([])
    } else {
      setSelectedGuides(guides.map(g => g.guide_id))
    }
  }

  const exportToExcel = () => {
    if (assignments.length === 0) {
      setError('No data to export')
      return
    }

    // Prepare data for Excel
    const exportData = assignments.map(assignment => ({
      'Date': format(new Date(assignment.local_date), 'yyyy-MM-dd (EEEE)'),
      'Time': assignment.local_time.substring(0, 5),
      'Activity': assignment.activity_title,
      'Guide': assignment.guide_name,
      'Participants': assignment.participants,
      'Capacity': assignment.capacity,
      'Status': assignment.status
    }))

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportData)

    // Set column widths
    const colWidths = [
      { wch: 20 }, // Date
      { wch: 10 }, // Time
      { wch: 40 }, // Activity
      { wch: 20 }, // Guide
      { wch: 12 }, // Participants
      { wch: 10 }, // Capacity
      { wch: 10 }  // Status
    ]
    ws['!cols'] = colWidths

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Guide Assignments')

    // Generate filename
    const filename = `guide-report-${startDate}-to-${endDate}.xlsx`

    // Download file
    XLSX.writeFile(wb, filename)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FileSpreadsheet className="w-8 h-8 text-blue-600" />
            Guide Reports
          </h1>
          <p className="text-gray-600 mt-2">
            Select guides and date range to generate assignment reports
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
                disabled={loading || selectedGuides.length === 0 || !startDate || !endDate}
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

          {/* Guide Selection */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                <Users className="w-4 h-4 inline mr-2" />
                Select Guides ({selectedGuides.length} selected)
              </label>
              <button
                onClick={selectAllGuides}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
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
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
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
                      Guide
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
                        {assignment.guide_name}
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
        {!loading && assignments.length === 0 && startDate && endDate && selectedGuides.length > 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments found</h3>
            <p className="text-gray-500">
              No assignments found for the selected guides and date range.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
