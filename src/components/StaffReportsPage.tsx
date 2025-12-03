'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Download, Calendar as CalendarIcon, FileSpreadsheet, User, UserCheck, Headphones as HeadphonesIcon, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { sanitizeDataForExcel } from '@/lib/security/sanitize'
import { guidesApi, escortsApi, headphonesApi } from '@/lib/api-client'

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

interface Headphone {
  headphone_id: string
  name: string
  email?: string
  phone_number?: string
}

interface AssignmentReport {
  assignment_id: string
  local_date: string
  local_time: string
  activity_title: string
  staff_name: string
  staff_type: 'Guide' | 'Escort' | 'Headphone'
  participants: number
  capacity: number
  status: string
}

export default function StaffReportsPage() {
  const [guides, setGuides] = useState<Guide[]>([])
  const [escorts, setEscorts] = useState<Escort[]>([])
  const [headphones, setHeadphones] = useState<Headphone[]>([])
  const [selectedGuides, setSelectedGuides] = useState<string[]>([])
  const [selectedEscorts, setSelectedEscorts] = useState<string[]>([])
  const [selectedHeadphones, setSelectedHeadphones] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [assignments, setAssignments] = useState<AssignmentReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'guides' | 'escorts' | 'headphones'>('guides')
  const [guideSearch, setGuideSearch] = useState('')
  const [escortSearch, setEscortSearch] = useState('')
  const [headphoneSearch, setHeadphoneSearch] = useState('')

  useEffect(() => {
    fetchStaff()
  }, [])

  // Filter functions
  const filteredGuides = guides.filter(g =>
    `${g.first_name} ${g.last_name}`.toLowerCase().includes(guideSearch.toLowerCase()) ||
    g.email.toLowerCase().includes(guideSearch.toLowerCase())
  )

  const filteredEscorts = escorts.filter(e =>
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(escortSearch.toLowerCase()) ||
    e.email.toLowerCase().includes(escortSearch.toLowerCase())
  )

  const filteredHeadphones = headphones.filter(h =>
    h.name.toLowerCase().includes(headphoneSearch.toLowerCase()) ||
    (h.email && h.email.toLowerCase().includes(headphoneSearch.toLowerCase()))
  )

  const fetchStaff = async () => {
    try {
      const [guidesRes, escortsRes, headphonesRes] = await Promise.all([
        guidesApi.list(),
        escortsApi.list(),
        headphonesApi.list()
      ])

      // Filter to only active staff and sort
      const activeGuides = (guidesRes.data || [])
        .filter((g) => g.active !== false)
        .sort((a, b) => a.first_name.localeCompare(b.first_name))

      const activeEscorts = (escortsRes.data || [])
        .filter((e) => e.active !== false)
        .sort((a, b) => a.first_name.localeCompare(b.first_name))

      const activeHeadphones = (headphonesRes.data || [])
        .filter((h) => h.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name))

      setGuides(activeGuides)
      setEscorts(activeEscorts)
      setHeadphones(activeHeadphones)
    } catch (err) {
      console.error('Error fetching staff:', err)
      setError('Failed to load staff')
    }
  }

  const fetchAssignments = async () => {
    if (selectedGuides.length === 0 && selectedEscorts.length === 0 && selectedHeadphones.length === 0) {
      setError('Please select at least one guide, escort, or headphone contact')
      return
    }

    if (!startDate || !endDate) {
      setError('Please select both start and end dates')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Build query params
      const params = new URLSearchParams()
      params.set('start_date', startDate)
      params.set('end_date', endDate)
      if (selectedGuides.length > 0) {
        params.set('guide_ids', selectedGuides.join(','))
      }
      if (selectedEscorts.length > 0) {
        params.set('escort_ids', selectedEscorts.join(','))
      }
      if (selectedHeadphones.length > 0) {
        params.set('headphone_ids', selectedHeadphones.join(','))
      }

      // Fetch all assignments via API (bypasses RLS)
      const response = await fetch(`/api/reports/staff-assignments?${params.toString()}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch assignments')
      }

      setAssignments(result.data || [])
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

  const toggleHeadphoneSelection = (headphoneId: string) => {
    setSelectedHeadphones(prev =>
      prev.includes(headphoneId)
        ? prev.filter(id => id !== headphoneId)
        : [...prev, headphoneId]
    )
  }

  const selectAllHeadphones = () => {
    if (selectedHeadphones.length === headphones.length) {
      setSelectedHeadphones([])
    } else {
      setSelectedHeadphones(headphones.map(h => h.headphone_id))
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
            Select guides, escorts, and/or headphones and date range to generate assignment reports
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
                disabled={loading || (selectedGuides.length === 0 && selectedEscorts.length === 0 && selectedHeadphones.length === 0) || !startDate || !endDate}
                className="flex-1 bg-brand-orange text-white px-4 py-2 rounded-lg hover:bg-brand-orange-dark disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
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
                    ? 'border-brand-green text-brand-green'
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
              <button
                onClick={() => setActiveTab('headphones')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'headphones'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <HeadphonesIcon className="w-4 h-4" />
                  Headphones ({selectedHeadphones.length} selected)
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
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search guides..."
                    value={guideSearch}
                    onChange={(e) => setGuideSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="border border-gray-300 rounded-lg max-h-72 overflow-y-auto">
                  {filteredGuides.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-500 text-sm">
                      {guideSearch ? 'No guides found' : 'No guides available'}
                    </div>
                  ) : (
                    filteredGuides.map((guide) => (
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
                    ))
                  )}
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
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search escorts..."
                    value={escortSearch}
                    onChange={(e) => setEscortSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="border border-gray-300 rounded-lg max-h-72 overflow-y-auto">
                  {filteredEscorts.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-500 text-sm">
                      {escortSearch ? 'No escorts found' : 'No escorts available'}
                    </div>
                  ) : (
                    filteredEscorts.map((escort) => (
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
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Headphones Tab */}
            {activeTab === 'headphones' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Select Headphones
                  </label>
                  <button
                    onClick={selectAllHeadphones}
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                  >
                    {selectedHeadphones.length === headphones.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search headphones..."
                    value={headphoneSearch}
                    onChange={(e) => setHeadphoneSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="border border-gray-300 rounded-lg max-h-72 overflow-y-auto">
                  {filteredHeadphones.length === 0 ? (
                    <div className="px-4 py-6 text-center text-gray-500 text-sm">
                      {headphoneSearch ? 'No headphones found' : 'No headphones available'}
                    </div>
                  ) : (
                    filteredHeadphones.map((headphone) => (
                      <label
                        key={headphone.headphone_id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedHeadphones.includes(headphone.headphone_id)}
                          onChange={() => toggleHeadphoneSelection(headphone.headphone_id)}
                          className="w-4 h-4 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">
                            {headphone.name}
                          </div>
                          <div className="text-sm text-gray-500">{headphone.email || 'No email'}</div>
                        </div>
                      </label>
                    ))
                  )}
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
                            ? 'bg-brand-green-light text-green-800'
                            : assignment.staff_type === 'Escort'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-purple-100 text-purple-800'
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
        {!loading && assignments.length === 0 && startDate && endDate && (selectedGuides.length > 0 || selectedEscorts.length > 0 || selectedHeadphones.length > 0) && (
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
