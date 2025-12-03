'use client'

import React, { useState, useEffect } from 'react'
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { auditLogsApi, AuditLog } from '@/lib/api-client'

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  CREATE: { label: 'Created', color: 'bg-green-100 text-green-800' },
  UPDATE: { label: 'Updated', color: 'bg-blue-100 text-blue-800' },
  DELETE: { label: 'Deleted', color: 'bg-red-100 text-red-800' },
  LOGIN: { label: 'Login', color: 'bg-purple-100 text-purple-800' },
  LOGOUT: { label: 'Logout', color: 'bg-gray-100 text-gray-800' },
  LOGIN_FAILED: { label: 'Login Failed', color: 'bg-red-100 text-red-800' },
  MFA_SETUP: { label: 'MFA Setup', color: 'bg-yellow-100 text-yellow-800' },
  MFA_VERIFIED: { label: 'MFA Verified', color: 'bg-green-100 text-green-800' },
  MFA_FAILED: { label: 'MFA Failed', color: 'bg-red-100 text-red-800' },
  MFA_REMOVED: { label: 'MFA Removed', color: 'bg-orange-100 text-orange-800' },
  USER_CREATED: { label: 'User Created', color: 'bg-green-100 text-green-800' },
  USER_UPDATED: { label: 'User Updated', color: 'bg-blue-100 text-blue-800' },
  USER_DISABLED: { label: 'User Disabled', color: 'bg-red-100 text-red-800' },
  USER_ENABLED: { label: 'User Enabled', color: 'bg-green-100 text-green-800' },
}

const ENTITY_LABELS: Record<string, string> = {
  guide: 'Guide',
  escort: 'Escort',
  guide_assignment: 'Guide Assignment',
  escort_assignment: 'Escort Assignment',
  voucher: 'Voucher',
  ticket: 'Ticket',
  ticket_category: 'Ticket Category',
  ticket_type_mapping: 'Ticket Type Mapping',
  product_activity_mapping: 'Product Mapping',
  notification: 'Notification',
  attachment: 'Attachment',
  tour_group: 'Tour Group',
  email_template: 'Email Template',
  meeting_point: 'Meeting Point',
  booking_swap: 'Booking Swap',
  user: 'User',
  calendar_settings: 'Calendar Settings',
  session: 'Session',
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [expandedLog, setExpandedLog] = useState<string | null>(null)

  // Filters
  const [filters, setFilters] = useState({
    action: '',
    entity_type: '',
    from_date: '',
    to_date: '',
    search: ''
  })

  const LIMIT = 50

  useEffect(() => {
    fetchLogs()
  }, [page, filters.action, filters.entity_type, filters.from_date, filters.to_date])

  const fetchLogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string | number> = {
        limit: LIMIT,
        offset: (page - 1) * LIMIT
      }

      if (filters.action) params.action = filters.action
      if (filters.entity_type) params.entity_type = filters.entity_type
      if (filters.from_date) params.from_date = filters.from_date
      if (filters.to_date) params.to_date = filters.to_date

      const result = await auditLogsApi.list(params)
      if (result.error) throw new Error(result.error)

      setLogs(result.data?.data || [])
      setTotal(result.data?.total || 0)
    } catch (err) {
      console.error('Error fetching audit logs:', err)
      setError('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  const handleExportCsv = () => {
    const headers = ['Date', 'User', 'Action', 'Entity Type', 'Entity ID', 'IP Address']
    const rows = logs.map(log => [
      new Date(log.created_at).toISOString(),
      log.user_email || 'Unknown',
      log.action,
      log.entity_type || '',
      log.entity_id || '',
      log.ip_address || ''
    ])

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredLogs = logs.filter(log => {
    if (!filters.search) return true
    const searchLower = filters.search.toLowerCase()
    return (
      log.user_email?.toLowerCase().includes(searchLower) ||
      log.action.toLowerCase().includes(searchLower) ||
      log.entity_type?.toLowerCase().includes(searchLower) ||
      log.entity_id?.toLowerCase().includes(searchLower)
    )
  })

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-gray-600 text-sm mt-1">Track all user actions and system changes</p>
        </div>
        <Button onClick={handleExportCsv} variant="outline" className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Actions</option>
            {Object.entries(ACTION_LABELS).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <select
            value={filters.entity_type}
            onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Entity Types</option>
            {Object.entries(ENTITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <input
            type="date"
            value={filters.from_date}
            onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="From Date"
          />

          <input
            type="date"
            value={filters.to_date}
            onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="To Date"
          />
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Logs Table */}
      {loading ? (
        <div className="text-center py-8">Loading audit logs...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP Address</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const changes = log.changes as { old?: Record<string, unknown>; new?: Record<string, unknown> } | null
                  return (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(log.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{log.user_email || 'Unknown'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          ACTION_LABELS[log.action]?.color || 'bg-gray-100 text-gray-800'
                        }`}>
                          {ACTION_LABELS[log.action]?.label || log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {log.entity_type && (
                          <div>
                            <span className="text-sm text-gray-900">
                              {ENTITY_LABELS[log.entity_type] || log.entity_type}
                            </span>
                            {log.entity_id && (
                              <span className="text-xs text-gray-500 ml-1">
                                #{log.entity_id.substring(0, 8)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.ip_address || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {log.changes && (
                          <button
                            onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {expandedLog === log.id ? 'Hide' : 'View'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedLog === log.id && changes && (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 bg-gray-50">
                          <div className="text-sm">
                            <div className="font-medium mb-2">Changes:</div>
                            <div className="grid grid-cols-2 gap-4">
                              {changes.old && (
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">Before:</div>
                                  <pre className="bg-red-50 p-2 rounded text-xs overflow-auto max-h-40">
                                    {JSON.stringify(changes.old, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {changes.new && (
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">After:</div>
                                  <pre className="bg-green-50 p-2 rounded text-xs overflow-auto max-h-40">
                                    {JSON.stringify(changes.new, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )})
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t">
            <div className="text-sm text-gray-500">
              Showing {((page - 1) * LIMIT) + 1} to {Math.min(page * LIMIT, total)} of {total} results
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-3 py-1 text-sm">
                Page {page} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
