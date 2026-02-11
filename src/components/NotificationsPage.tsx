// src/components/NotificationsPage.tsx
'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Bell, CheckCircle, Info, RefreshCw, Check, ChevronDown, ChevronUp, Calendar, User, Clock, Send } from 'lucide-react'
import { notificationsApi } from '@/lib/api-client'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { format, addHours, addDays, addMinutes } from 'date-fns'

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
  // Rule-triggered notification details
  rule_id?: string
  rule_name?: string
  trigger_event?: string
  event_data?: Record<string, unknown>
  notification_url?: string
  channels_used?: string[]
}

interface Notification {
  id: string
  activity_booking_id: number | null
  notification_type: 'age_mismatch' | 'swap_fixed' | 'missing_dob' | 'rule_triggered' | 'other'
  severity: 'info' | 'warning' | 'error'
  title: string
  message: string
  details: NotificationDetails
  is_read: boolean
  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  remind_at: string | null
  created_at: string
}

// Predefined email recipients
const EMAIL_RECIPIENTS = [
  { id: 'info', name: 'Info', email: 'info@enroma.com' },
  { id: 'operations', name: 'Operations', email: 'operations@enroma.com' },
  { id: 'visitasguiadas', name: 'Visitas Guiadas', email: 'visitasguiadas@enroma.com' },
]

// Predefined Telegram recipients
const TELEGRAM_RECIPIENTS = [
  { id: 'channel', name: 'Tourmageddon Channel', chatId: '-1003389079815' },
  { id: 'pedro', name: 'Pedro (DM)', chatId: '7282971209' },
]

// Reminder time options
const REMINDER_OPTIONS = [
  { label: '30 minutes', value: () => addMinutes(new Date(), 30) },
  { label: '1 hour', value: () => addHours(new Date(), 1) },
  { label: '3 hours', value: () => addHours(new Date(), 3) },
  { label: 'Tomorrow morning (9 AM)', value: () => {
    const tomorrow = addDays(new Date(), 1)
    tomorrow.setHours(9, 0, 0, 0)
    return tomorrow
  }},
  { label: 'Tomorrow afternoon (2 PM)', value: () => {
    const tomorrow = addDays(new Date(), 1)
    tomorrow.setHours(14, 0, 0, 0)
    return tomorrow
  }},
  { label: 'Next week', value: () => addDays(new Date(), 7) },
]

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

type TabType = 'notifications' | 'swap_log'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [swapLog, setSwapLog] = useState<SwapLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('notifications')
  const [filter, setFilter] = useState<'all' | 'unread' | 'unresolved'>('unresolved')
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set())

  // Dialog states
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false)
  const [remindDialogOpen, setRemindDialogOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null)
  const [selectedEmails, setSelectedEmails] = useState<string[]>([])
  const [selectedTelegramChats, setSelectedTelegramChats] = useState<string[]>([])
  const [sendingEmail, setSendingEmail] = useState(false)
  const [settingReminder, setSettingReminder] = useState(false)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const result = await notificationsApi.list(filter)
      if (result.error) throw new Error(result.error)
      setNotifications((result.data as unknown as Notification[]) || [])
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  const fetchSwapLog = useCallback(async () => {
    setLoading(true)
    try {
      const result = await notificationsApi.listSwapLog()
      if (result.error) throw new Error(result.error)
      setSwapLog((result.data as unknown as SwapLogEntry[]) || [])
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

  const markAsResolved = async (id: string) => {
    try {
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

  // Open escalate dialog
  const openEscalateDialog = (notification: Notification) => {
    setSelectedNotification(notification)
    setSelectedEmails([])
    setSelectedTelegramChats([])
    setEscalateDialogOpen(true)
  }

  // Send escalation to selected recipients (email + telegram)
  const sendEscalation = async () => {
    if (!selectedNotification || (selectedEmails.length === 0 && selectedTelegramChats.length === 0)) return

    setSendingEmail(true)
    try {
      const response = await fetch('/api/notifications/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: selectedNotification.id,
          recipients: selectedEmails.length > 0 ? selectedEmails : undefined,
          telegramChatIds: selectedTelegramChats.length > 0 ? selectedTelegramChats : undefined,
        })
      })
      const data = await response.json()
      if (response.ok) {
        setEscalateDialogOpen(false)
        const parts: string[] = []
        if (selectedEmails.length > 0) parts.push(`${selectedEmails.length} email(s)`)
        if (selectedTelegramChats.length > 0) parts.push(`${selectedTelegramChats.length} Telegram chat(s)`)
        alert(`Escalation sent to ${parts.join(' and ')}!`)
      } else {
        alert(`Failed to escalate: ${data.error}`)
      }
    } catch (error) {
      console.error('Error sending escalation:', error)
      alert('Failed to send escalation')
    } finally {
      setSendingEmail(false)
    }
  }

  // Toggle telegram chat selection
  const toggleTelegramSelection = (chatId: string) => {
    setSelectedTelegramChats(prev =>
      prev.includes(chatId)
        ? prev.filter(id => id !== chatId)
        : [...prev, chatId]
    )
  }

  // Open remind dialog
  const openRemindDialog = (notification: Notification) => {
    setSelectedNotification(notification)
    setRemindDialogOpen(true)
  }

  // Set reminder for notification
  const setReminder = async (remindAt: Date) => {
    if (!selectedNotification) return

    setSettingReminder(true)
    try {
      const result = await notificationsApi.update({
        id: selectedNotification.id,
        remind_at: remindAt.toISOString()
      })
      if (result.error) throw new Error(result.error)
      setRemindDialogOpen(false)
      fetchNotifications()
      alert(`Reminder set for ${format(remindAt, 'MMM d, yyyy h:mm a')}`)
    } catch (error) {
      console.error('Error setting reminder:', error)
      alert('Failed to set reminder')
    } finally {
      setSettingReminder(false)
    }
  }

  // Toggle email selection
  const toggleEmailSelection = (email: string) => {
    setSelectedEmails(prev =>
      prev.includes(email)
        ? prev.filter(e => e !== email)
        : [...prev, email]
    )
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

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <span className="inline-block w-3 h-3 rounded-full bg-red-500 ring-2 ring-red-200 mt-1" />
      case 'warning':
        return <span className="inline-block w-3 h-3 rounded-full bg-amber-500 ring-2 ring-amber-200 mt-1" />
      case 'info':
        return <span className="inline-block w-3 h-3 rounded-full bg-blue-500 ring-2 ring-blue-200 mt-1" />
      default:
        return <span className="inline-block w-3 h-3 rounded-full bg-gray-400 ring-2 ring-gray-200 mt-1" />
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
            <Bell className="w-4 h-4" />
            Alerts
            {notifications.filter(n => !n.is_resolved && (n.notification_type === 'age_mismatch' || n.notification_type === 'rule_triggered')).length > 0 && (
              <span className="bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded">
                {notifications.filter(n => !n.is_resolved && (n.notification_type === 'age_mismatch' || n.notification_type === 'rule_triggered')).length}
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
                            {notification.activity_booking_id && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                Booking #{notification.activity_booking_id}
                              </span>
                            )}
                            {notification.notification_type === 'rule_triggered' && notification.details?.trigger_event && (
                              <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs">
                                {notification.details.trigger_event.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!notification.is_resolved && (
                          <>
                            {/* Escalate Button */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                openEscalateDialog(notification)
                              }}
                              title="Escalate via email"
                              className="text-orange-600 border-orange-300 hover:bg-orange-50"
                            >
                              <Send className="w-4 h-4 mr-1" />
                              Escalate
                            </Button>
                            {/* Remind Me Button */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                openRemindDialog(notification)
                              }}
                              title="Remind me later"
                              className="text-blue-600 border-blue-300 hover:bg-blue-50"
                            >
                              <Clock className="w-4 h-4 mr-1" />
                              Remind
                            </Button>
                            {/* Resolve Button */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                markAsResolved(notification.id)
                              }}
                              title="Mark as resolved"
                              className="text-green-600 border-green-300 hover:bg-green-50"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Resolve
                            </Button>
                          </>
                        )}
                        {notification.remind_at && !notification.is_resolved && (
                          <span className="text-xs text-blue-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(notification.remind_at), 'MMM d, h:mm a')}
                          </span>
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

                      {/* Rule-triggered notification details */}
                      {notification.notification_type === 'rule_triggered' && notification.details?.event_data && (
                        <div className="space-y-3">
                          {/* Key info cards */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {!!notification.details.event_data.customer_name && (
                              <div className="bg-white rounded-lg p-3 border">
                                <div className="text-xs text-gray-500 mb-1">Customer</div>
                                <div className="font-semibold text-sm">{String(notification.details.event_data.customer_name)}</div>
                              </div>
                            )}
                            {!!notification.details.event_data.confirmation_code && (
                              <div className="bg-white rounded-lg p-3 border">
                                <div className="text-xs text-gray-500 mb-1">Booking</div>
                                <div className="font-semibold text-sm font-mono">{String(notification.details.event_data.confirmation_code)}</div>
                              </div>
                            )}
                            {!!notification.details.event_data.travel_date && (
                              <div className="bg-white rounded-lg p-3 border">
                                <div className="text-xs text-gray-500 mb-1">Travel Date</div>
                                <div className="font-semibold text-sm">{String(notification.details.event_data.travel_date)}</div>
                              </div>
                            )}
                            {notification.details.event_data.pax_count !== undefined && (
                              <div className="bg-white rounded-lg p-3 border">
                                <div className="text-xs text-gray-500 mb-1">Passengers</div>
                                <div className="font-semibold text-sm">{String(notification.details.event_data.pax_count)} pax</div>
                              </div>
                            )}
                          </div>

                          {/* Additional details in a compact table */}
                          <details className="group">
                            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                              Show all event data
                            </summary>
                            <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs">
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                {Object.entries(notification.details.event_data)
                                  .filter(([key]) => !['customer_name', 'confirmation_code', 'travel_date', 'pax_count'].includes(key))
                                  .map(([key, value]) => (
                                    <div key={key} className="flex justify-between py-0.5">
                                      <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                                      <span className="font-medium text-gray-700">
                                        {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value || '-')}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </details>

                          {/* Rule info */}
                          {notification.details.rule_name && (
                            <div className="text-xs text-gray-400">
                              Triggered by rule: <span className="font-medium">{notification.details.rule_name}</span>
                            </div>
                          )}
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

      {/* Escalate Dialog */}
      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-orange-500" />
              Escalate Notification
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-500 mb-4">
              Select recipients to escalate this notification:
            </p>
            {selectedNotification && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                <div className="font-semibold">{selectedNotification.title}</div>
                <div className="text-gray-600 text-xs mt-1">{selectedNotification.message}</div>
              </div>
            )}

            {/* Email recipients */}
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Email</div>
            <div className="space-y-2 mb-4">
              {EMAIL_RECIPIENTS.map((recipient) => (
                <div
                  key={recipient.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleEmailSelection(recipient.email)}
                >
                  <Checkbox
                    checked={selectedEmails.includes(recipient.email)}
                    onCheckedChange={() => toggleEmailSelection(recipient.email)}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{recipient.name}</div>
                    <div className="text-xs text-gray-500">{recipient.email}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Telegram recipients */}
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Telegram</div>
            <div className="space-y-2">
              {TELEGRAM_RECIPIENTS.map((recipient) => (
                <div
                  key={recipient.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleTelegramSelection(recipient.chatId)}
                >
                  <Checkbox
                    checked={selectedTelegramChats.includes(recipient.chatId)}
                    onCheckedChange={() => toggleTelegramSelection(recipient.chatId)}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{recipient.name}</div>
                    <div className="text-xs text-gray-500">Chat ID: {recipient.chatId}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={sendEscalation}
              disabled={(selectedEmails.length === 0 && selectedTelegramChats.length === 0) || sendingEmail}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {sendingEmail ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send to {selectedEmails.length + selectedTelegramChats.length} recipient{(selectedEmails.length + selectedTelegramChats.length) !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remind Dialog */}
      <Dialog open={remindDialogOpen} onOpenChange={setRemindDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              Set Reminder
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-500 mb-4">
              When would you like to be reminded about this notification?
            </p>
            {selectedNotification && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                <div className="font-semibold">{selectedNotification.title}</div>
                <div className="text-gray-600 text-xs mt-1">{selectedNotification.message}</div>
              </div>
            )}
            <div className="space-y-2">
              {REMINDER_OPTIONS.map((option, index) => (
                <button
                  key={index}
                  className="w-full text-left p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  onClick={() => setReminder(option.value())}
                  disabled={settingReminder}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{option.label}</span>
                    <span className="text-xs text-gray-500">
                      {format(option.value(), 'MMM d, h:mm a')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemindDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
