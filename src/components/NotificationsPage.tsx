// src/components/NotificationsPage.tsx
'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Bell, AlertTriangle, CheckCircle, Info, RefreshCw, Check, X, ChevronDown, ChevronUp, Calendar, User, Clock, Mail, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { notificationsApi } from '@/lib/api-client'
import { Button } from "@/components/ui/button"
import { format } from 'date-fns'

interface NotificationDetails {
  mismatches?: Array<{
    participant_id: number
    name: string
    dob: string
    age: number
    booked_title: string
    expected_range: string
  }>
  swaps?: Array<{
    participant_id: number
    from_title: string
    to_title: string
    name: string
    age: number
  }>
  expected_counts?: Record<string, number>
  actual_counts?: Record<string, number>
}

interface Notification {
  id: string
  activity_booking_id: number
  notification_type: 'age_mismatch' | 'swap_fixed' | 'missing_dob' | 'other'
  severity: 'info' | 'warning' | 'error'
  title: string
  message: string
  details: NotificationDetails
  is_read: boolean
  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  created_at: string
}

interface SwapLogEntry {
  id: string
  activity_booking_id: number
  participant_id: number
  original_booked_title: string
  corrected_booked_title: string
  passenger_name: string
  passenger_dob: string | null
  calculated_age: number | null
  reason: string | null
  created_at: string
}

type TabType = 'notifications' | 'swap_log' | 'create'

interface CreateNotificationForm {
  activity_booking_id: string
  notification_type: 'age_mismatch' | 'missing_dob' | 'missing_ticket' | 'manual' | 'other'
  severity: 'info' | 'warning' | 'error'
  title: string
  message: string
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [swapLog, setSwapLog] = useState<SwapLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('notifications')
  const [filter, setFilter] = useState<'all' | 'unread' | 'unresolved'>('unresolved')
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set())
  const [createForm, setCreateForm] = useState<CreateNotificationForm>({
    activity_booking_id: '',
    notification_type: 'manual',
    severity: 'warning',
    title: '',
    message: ''
  })
  const [creating, setCreating] = useState(false)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('booking_notifications')
        .select('*')
        .order('created_at', { ascending: false })

      if (filter === 'unread') {
        query = query.eq('is_read', false)
      } else if (filter === 'unresolved') {
        query = query.eq('is_resolved', false)
      }

      const { data, error } = await query.limit(100)

      if (error) throw error
      setNotifications(data || [])
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  const fetchSwapLog = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('booking_swap_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setSwapLog(data || [])
    } catch (error) {
      console.error('Error fetching swap log:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'notifications') {
      fetchNotifications()
    } else {
      fetchSwapLog()
    }
  }, [activeTab, filter, fetchNotifications, fetchSwapLog])

  const markAsRead = async (id: string) => {
    try {
      // Update via API
      const result = await notificationsApi.update({ id, is_read: true })
      if (result.error) throw new Error(result.error)
      fetchNotifications()
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  const markAsResolved = async (id: string) => {
    try {
      // Update via API
      const result = await notificationsApi.update({
        id,
        is_resolved: true
      })
      if (result.error) throw new Error(result.error)
      fetchNotifications()
    } catch (error) {
      console.error('Error marking as resolved:', error)
    }
  }

  const sendEmailAlert = async (id: string) => {
    try {
      const response = await fetch('/api/notifications/send-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id })
      })
      const data = await response.json()
      if (response.ok) {
        alert('Email alert sent successfully!')
      } else {
        alert(`Failed to send email: ${data.error}`)
      }
    } catch (error) {
      console.error('Error sending email:', error)
      alert('Failed to send email alert')
    }
  }

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedNotifications)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedNotifications(newExpanded)
  }

  const createNotification = async () => {
    if (!createForm.title || !createForm.message) {
      alert('Please fill in title and message')
      return
    }

    setCreating(true)
    try {
      // Create via API
      const result = await notificationsApi.create({
        activity_booking_id: createForm.activity_booking_id ? createForm.activity_booking_id : undefined,
        notification_type: createForm.notification_type,
        message: `${createForm.title}: ${createForm.message}`,
        is_read: false,
        is_resolved: false
      })

      if (result.error) throw new Error(result.error)

      alert('Notification created successfully!')
      setCreateForm({
        activity_booking_id: '',
        notification_type: 'manual',
        severity: 'warning',
        title: '',
        message: ''
      })
      setActiveTab('notifications')
      fetchNotifications()
    } catch (error) {
      console.error('Error creating notification:', error)
      alert('Failed to create notification')
    } finally {
      setCreating(false)
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-red-500" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />
      default:
        return <Bell className="w-5 h-5 text-gray-500" />
    }
  }

  const getSeverityBg = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      case 'info':
        return 'bg-blue-50 border-blue-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read && !n.is_resolved).length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <Button
          onClick={() => activeTab === 'notifications' ? fetchNotifications() : fetchSwapLog()}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b">
        <button
          className={`pb-2 px-1 border-b-2 transition-colors ${
            activeTab === 'notifications'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('notifications')}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Alerts
            {notifications.filter(n => !n.is_resolved && n.notification_type === 'age_mismatch').length > 0 && (
              <span className="bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded">
                {notifications.filter(n => !n.is_resolved && n.notification_type === 'age_mismatch').length}
              </span>
            )}
          </div>
        </button>
        <button
          className={`pb-2 px-1 border-b-2 transition-colors ${
            activeTab === 'swap_log'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('swap_log')}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Auto-Fix Log
          </div>
        </button>
        <button
          className={`pb-2 px-1 border-b-2 transition-colors ${
            activeTab === 'create'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('create')}
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Alert
          </div>
        </button>
      </div>

      {activeTab === 'notifications' && (
        <>
          {/* Filter */}
          <div className="flex gap-2 mb-4">
            {(['all', 'unread', 'unresolved'] as const).map((f) => (
              <button
                key={f}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Unresolved'}
              </button>
            ))}
          </div>

          {/* Notifications List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
              <p>No notifications found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`border rounded-lg overflow-hidden ${getSeverityBg(notification.severity)} ${
                    notification.is_read ? 'opacity-75' : ''
                  }`}
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => toggleExpanded(notification.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {getSeverityIcon(notification.severity)}
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{notification.title}</h3>
                            {notification.is_resolved && (
                              <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">
                                Resolved
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">{notification.message}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(notification.created_at), 'MMM d, yyyy HH:mm')}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Booking #{notification.activity_booking_id}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!notification.is_resolved && (
                          <>
                            {notification.notification_type === 'age_mismatch' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  sendEmailAlert(notification.id)
                                }}
                                title="Send email alert"
                                className="text-orange-600 border-orange-300 hover:bg-orange-50"
                              >
                                <Mail className="w-4 h-4 mr-1" />
                                Email
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation()
                                markAsRead(notification.id)
                              }}
                              title="Mark as read"
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                markAsResolved(notification.id)
                              }}
                              title="Mark as resolved"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Resolve
                            </Button>
                          </>
                        )}
                        {expandedNotifications.has(notification.id) ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedNotifications.has(notification.id) && (
                    <div className="px-4 pb-4 pt-2 border-t border-gray-200/50">
                      {notification.details?.mismatches && notification.details.mismatches.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold mb-2">Mismatched Participants:</h4>
                          <div className="bg-white rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="px-3 py-2 text-left">Name</th>
                                  <th className="px-3 py-2 text-left">DOB</th>
                                  <th className="px-3 py-2 text-left">Age</th>
                                  <th className="px-3 py-2 text-left">Booked As</th>
                                  <th className="px-3 py-2 text-left">Expected Age</th>
                                </tr>
                              </thead>
                              <tbody>
                                {notification.details.mismatches.map((m, i) => (
                                  <tr key={i} className="border-t">
                                    <td className="px-3 py-2">{m.name}</td>
                                    <td className="px-3 py-2">{m.dob}</td>
                                    <td className="px-3 py-2 font-semibold">{m.age} yo</td>
                                    <td className="px-3 py-2">{m.booked_title}</td>
                                    <td className="px-3 py-2 text-red-600">{m.expected_range} yo</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {notification.details?.swaps && notification.details.swaps.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold mb-2">Auto-Corrected:</h4>
                          <div className="bg-white rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="px-3 py-2 text-left">Name</th>
                                  <th className="px-3 py-2 text-left">Age</th>
                                  <th className="px-3 py-2 text-left">From</th>
                                  <th className="px-3 py-2 text-left">To</th>
                                </tr>
                              </thead>
                              <tbody>
                                {notification.details.swaps.map((s, i) => (
                                  <tr key={i} className="border-t">
                                    <td className="px-3 py-2">{s.name}</td>
                                    <td className="px-3 py-2">{s.age} yo</td>
                                    <td className="px-3 py-2 text-red-600 line-through">{s.from_title}</td>
                                    <td className="px-3 py-2 text-green-600">{s.to_title}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {notification.details?.expected_counts && notification.details?.actual_counts && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Category Count Comparison:</h4>
                          <div className="bg-white rounded-lg p-3 text-sm">
                            <div className="grid grid-cols-3 gap-4 font-semibold border-b pb-2 mb-2">
                              <span>Category</span>
                              <span>Booked</span>
                              <span>Actual (by DOB)</span>
                            </div>
                            {Object.keys(notification.details.expected_counts).map((key) => {
                              const expected = notification.details.expected_counts?.[key] || 0
                              const actual = notification.details.actual_counts?.[key] || 0
                              const mismatch = expected !== actual
                              return (
                                <div key={key} className={`grid grid-cols-3 gap-4 py-1 ${mismatch ? 'text-red-600' : ''}`}>
                                  <span>{key}</span>
                                  <span>{expected}</span>
                                  <span>{actual}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'swap_log' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : swapLog.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Info className="w-12 h-12 mx-auto mb-3 text-blue-400" />
              <p>No auto-corrections logged yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Booking</th>
                    <th className="px-4 py-3 text-left">Passenger</th>
                    <th className="px-4 py-3 text-left">Age</th>
                    <th className="px-4 py-3 text-left">Original</th>
                    <th className="px-4 py-3 text-left">Corrected</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {swapLog.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-gray-500">
                          <Clock className="w-3 h-3" />
                          {format(new Date(entry.created_at), 'MMM d, HH:mm')}
                        </div>
                      </td>
                      <td className="px-4 py-3">#{entry.activity_booking_id}</td>
                      <td className="px-4 py-3">
                        <div>
                          <span className="font-medium">{entry.passenger_name}</span>
                          {entry.passenger_dob && (
                            <span className="text-gray-400 text-xs ml-2">
                              ({entry.passenger_dob})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">{entry.calculated_age} yo</td>
                      <td className="px-4 py-3 text-red-600 line-through">
                        {entry.original_booked_title}
                      </td>
                      <td className="px-4 py-3 text-green-600 font-medium">
                        {entry.corrected_booked_title}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{entry.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === 'create' && (
        <div className="max-w-2xl">
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Create New Alert</h2>

            <div className="space-y-4">
              {/* Activity Booking ID (optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Activity Booking ID (optional)
                </label>
                <input
                  type="text"
                  value={createForm.activity_booking_id}
                  onChange={(e) => setCreateForm({ ...createForm, activity_booking_id: e.target.value })}
                  placeholder="e.g., 114927446"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Notification Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notification Type
                </label>
                <select
                  value={createForm.notification_type}
                  onChange={(e) => setCreateForm({ ...createForm, notification_type: e.target.value as CreateNotificationForm['notification_type'] })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="manual">Manual Alert</option>
                  <option value="age_mismatch">Age Mismatch</option>
                  <option value="missing_dob">Missing DOB</option>
                  <option value="missing_ticket">Missing Ticket</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Severity
                </label>
                <div className="flex gap-3">
                  {(['info', 'warning', 'error'] as const).map((sev) => (
                    <label
                      key={sev}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                        createForm.severity === sev
                          ? sev === 'info'
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : sev === 'warning'
                            ? 'bg-yellow-50 border-yellow-300 text-yellow-700'
                            : 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="severity"
                        value={sev}
                        checked={createForm.severity === sev}
                        onChange={(e) => setCreateForm({ ...createForm, severity: e.target.value as 'info' | 'warning' | 'error' })}
                        className="sr-only"
                      />
                      {getSeverityIcon(sev)}
                      <span className="capitalize">{sev}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="Short description of the alert"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={createForm.message}
                  onChange={(e) => setCreateForm({ ...createForm, message: e.target.value })}
                  placeholder="Detailed description of the issue..."
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Submit Button */}
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateForm({
                      activity_booking_id: '',
                      notification_type: 'manual',
                      severity: 'warning',
                      title: '',
                      message: ''
                    })
                  }}
                >
                  Clear
                </Button>
                <Button
                  onClick={createNotification}
                  disabled={creating || !createForm.title || !createForm.message}
                >
                  {creating ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Alert
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
