'use client'

import React, { useState, useEffect } from 'react'
import { Search, Download, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BookingChangeLog {
  id: string
  activity_booking_id: number
  booking_id: number | null
  user_id: string
  user_email: string
  change_type: string
  field_changed: string
  old_value: string | null
  new_value: string | null
  participant_id: number | null
  created_at: string
}

const CHANGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  slot_change: { label: 'Date/Time Changed', color: 'bg-blue-100 text-blue-800' },
  participant_update: { label: 'Participant Updated', color: 'bg-yellow-100 text-yellow-800' },
  type_change: { label: 'Type Changed', color: 'bg-purple-100 text-purple-800' },
}

const FIELD_LABELS: Record<string, string> = {
  date_time: 'Date & Time',
  name: 'Name',
  date_of_birth: 'Date of Birth',
  participant_type: 'Participant Type',
}

export default function BookingChangesLogPage() {
  const [logs, setLogs] = useState<BookingChangeLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [changeTypeFilter, setChangeTypeFilter] = useState('')

  const LIMIT = 50

  useEffect(() => {
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, changeTypeFilter])

  const fetchLogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String((page - 1) * LIMIT)
      })

      const response = await fetch(`/api/booking-logs?${params}`)
      const result = await response.json()

      if (!response.ok) throw new Error(result.error || 'Failed to fetch logs')

      setLogs(result.data || [])
      setTotal(result.count || 0)
    } catch (err) {
      console.error('Error fetching booking change logs:', err)
      setError('Failed to load booking change logs')
    } finally {
      setLoading(false)
    }
  }

  const handleExportCsv = () => {
    const headers = ['Date', 'User', 'Booking ID', 'Activity Booking ID', 'Change Type', 'Field', 'Old Value', 'New Value']
    const rows = logs.map(log => [
      new Date(log.created_at).toLocaleString(),
      log.user_email || 'Unknown',
      log.booking_id || '',
      log.activity_booking_id,
      CHANGE_TYPE_LABELS[log.change_type]?.label || log.change_type,
      FIELD_LABELS[log.field_changed] || log.field_changed,
      log.old_value || '',
      log.new_value || ''
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `booking_changes_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
  }

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatValue = (value: string | null, field: string) => {
    if (!value) return '-'

    if (field === 'date_time') {
      try {
        const date = new Date(value)
        return date.toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return value
      }
    }

    return value
  }

  // Filter logs by search query
  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      String(log.booking_id).includes(query) ||
      String(log.activity_booking_id).includes(query) ||
      log.user_email.toLowerCase().includes(query) ||
      (log.old_value?.toLowerCase().includes(query)) ||
      (log.new_value?.toLowerCase().includes(query))
    )
  }).filter(log => {
    if (!changeTypeFilter) return true
    return log.change_type === changeTypeFilter
  })

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Booking Changes Log</h1>
        <div className="flex gap-2">
          <Button onClick={fetchLogs} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleExportCsv} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by booking ID, user, or value..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>

          <div className="w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">Change Type</label>
            <select
              value={changeTypeFilter}
              onChange={(e) => { setChangeTypeFilter(e.target.value); setPage(1) }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">All Types</option>
              <option value="slot_change">Date/Time Changed</option>
              <option value="participant_update">Participant Updated</option>
              <option value="type_change">Type Changed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date & Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Booking
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Change Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Field
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Old Value
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  New Value
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No booking changes found
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const changeTypeInfo = CHANGE_TYPE_LABELS[log.change_type] || { label: log.change_type, color: 'bg-gray-100 text-gray-800' }

                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {log.user_email}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">#{log.booking_id}</span>
                          <span className="text-xs text-gray-500">Act: {log.activity_booking_id}</span>
                          {log.participant_id && (
                            <span className="text-xs text-gray-400">Pax: {log.participant_id}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${changeTypeInfo.color}`}>
                          {changeTypeInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {FIELD_LABELS[log.field_changed] || log.field_changed}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600 max-w-[200px] truncate" title={log.old_value || ''}>
                        {formatValue(log.old_value, log.field_changed)}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 max-w-[200px] truncate" title={log.new_value || ''}>
                        {formatValue(log.new_value, log.field_changed)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((page - 1) * LIMIT) + 1} to {Math.min(page * LIMIT, total)} of {total} entries
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
