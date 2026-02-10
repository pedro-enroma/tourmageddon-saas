'use client'

import { useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface NotificationPayload {
  id: string
  notification_type: string
  title: string
  message: string
  severity: string
  details?: {
    rule_name?: string
    trigger_event?: string
    event_data?: Record<string, unknown>
  }
}

interface RecentToast {
  count: number
  toastId: string | number
  lastTimestamp: number
  lastTitle: string
  lastMessage: string
  severity: string
}

// Store a reference to set the current view (will be set by dashboard)
let setDashboardView: ((view: string) => void) | null = null

export function setNotificationNavigator(setter: (view: string) => void) {
  setDashboardView = setter
}

// --- Color palette for rule badges (8 colors, cycled via hash) ---
const RULE_COLORS = [
  { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6', border: '#3b82f6' },   // blue-500
  { bg: 'rgba(16,185,129,0.15)', text: '#10b981', border: '#10b981' },   // emerald-500
  { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6', border: '#8b5cf6' },   // violet-500
  { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', border: '#f59e0b' },   // amber-500
  { bg: 'rgba(244,63,94,0.15)', text: '#f43f5e', border: '#f43f5e' },    // rose-500
  { bg: 'rgba(6,182,212,0.15)', text: '#06b6d4', border: '#06b6d4' },    // cyan-500
  { bg: 'rgba(249,115,22,0.15)', text: '#f97316', border: '#f97316' },   // orange-500
  { bg: 'rgba(236,72,153,0.15)', text: '#ec4899', border: '#ec4899' },   // pink-500
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash)
}

function getRuleColor(ruleName: string) {
  const index = hashString(ruleName) % RULE_COLORS.length
  return RULE_COLORS[index]
}

// --- Web Audio API notification sounds ---
function playNotificationSound(severity: string) {
  try {
    const ctx = new AudioContext()

    switch (severity) {
      case 'error':
      case 'critical': {
        // Two-tone alert: 2 short high-pitch beeps
        for (let i = 0; i < 2; i++) {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.type = 'square'
          osc.frequency.value = 880
          gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.12)
          osc.start(ctx.currentTime + i * 0.18)
          osc.stop(ctx.currentTime + i * 0.18 + 0.12)
        }
        setTimeout(() => ctx.close(), 600)
        break
      }
      case 'warning': {
        // Single medium-pitch chime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = 587 // D5
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.4)
        setTimeout(() => ctx.close(), 600)
        break
      }
      default: {
        // Soft low-pitch ding for info/success
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = 440 // A4
        gain.gain.setValueAtTime(0.12, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.3)
        setTimeout(() => ctx.close(), 500)
        break
      }
    }
  } catch {
    // Audio may be blocked by autoplay policy — silently ignore
  }
}

// --- Stacking window ---
const STACK_WINDOW_MS = 30_000

function navigateToNotifications() {
  if (setDashboardView) {
    setDashboardView('notifications')
  } else {
    window.location.href = '/dashboard?view=notifications'
  }
}

export function NotificationToastProvider({ children }: { children: React.ReactNode }) {
  const recentToasts = useRef<Map<string, RecentToast>>(new Map())

  // Cleanup stale entries periodically
  const cleanupStale = useCallback(() => {
    const now = Date.now()
    for (const [key, entry] of recentToasts.current) {
      if (now - entry.lastTimestamp > STACK_WINDOW_MS) {
        recentToasts.current.delete(key)
      }
    }
  }, [])

  useEffect(() => {
    console.log('[NotificationToastProvider] Setting up realtime subscription...')

    const channel = supabase
      .channel('notification-toasts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'booking_notifications',
        },
        (payload) => {
          console.log('[NotificationToastProvider] Received notification:', payload)
          const notification = payload.new as NotificationPayload

          const severity = notification.severity || 'info'
          const title = notification.title || notification.details?.rule_name || 'New Notification'
          const message = notification.message || ''
          const ruleName = notification.details?.rule_name || 'Notification'

          // Play sound
          playNotificationSound(severity)

          // Cleanup stale grouped toasts
          cleanupStale()

          // Check for stacking
          const groupKey = ruleName
          const existing = recentToasts.current.get(groupKey)
          const now = Date.now()

          if (existing && (now - existing.lastTimestamp) < STACK_WINDOW_MS) {
            // Dismiss previous toast and show updated grouped toast
            toast.dismiss(existing.toastId)
            const newCount = existing.count + 1

            const newToastId = showCustomToast({
              title,
              message,
              severity,
              ruleName,
              count: newCount,
            })

            recentToasts.current.set(groupKey, {
              count: newCount,
              toastId: newToastId,
              lastTimestamp: now,
              lastTitle: title,
              lastMessage: message,
              severity,
            })
          } else {
            // New group
            const newToastId = showCustomToast({
              title,
              message,
              severity,
              ruleName,
              count: 1,
            })

            recentToasts.current.set(groupKey, {
              count: 1,
              toastId: newToastId,
              lastTimestamp: now,
              lastTitle: title,
              lastMessage: message,
              severity,
            })
          }
        }
      )
      .subscribe((status) => {
        console.log('[NotificationToastProvider] Subscription status:', status)
      })

    return () => {
      console.log('[NotificationToastProvider] Cleaning up subscription')
      supabase.removeChannel(channel)
    }
  }, [cleanupStale])

  return <>{children}</>
}

// --- Custom toast renderer ---
interface CustomToastProps {
  title: string
  message: string
  severity: string
  ruleName: string
  count: number
}

function getSeverityBorderColor(severity: string): string {
  switch (severity) {
    case 'error':
    case 'critical':
      return '#ef4444'
    case 'warning':
      return '#f59e0b'
    case 'success':
      return '#10b981'
    default:
      return '#3b82f6'
  }
}

function showCustomToast({ title, message, severity, ruleName, count }: CustomToastProps): string | number {
  const ruleColor = getRuleColor(ruleName)
  const borderColor = getSeverityBorderColor(severity)

  return toast.custom(
    (id) => (
      <div
        onClick={() => {
          toast.dismiss(id)
          navigateToNotifications()
        }}
        style={{
          borderLeft: `4px solid ${borderColor}`,
        }}
        className="w-full bg-white rounded-lg shadow-lg border border-gray-200 p-4 cursor-pointer hover:shadow-xl transition-shadow"
      >
        {/* Rule name badge + count */}
        <div className="flex items-center justify-between mb-1.5">
          <span
            style={{
              backgroundColor: ruleColor.bg,
              color: ruleColor.text,
            }}
            className="text-xs font-medium px-2 py-0.5 rounded-full"
          >
            {ruleName}
          </span>
          {count > 1 && (
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              x{count}
            </span>
          )}
        </div>

        {/* Title */}
        <div className="text-sm font-semibold text-gray-900 truncate">
          {title}
        </div>

        {/* Message */}
        {message && (
          <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
            {message}
          </div>
        )}

        {/* View All link */}
        <div className="mt-2">
          <span className="text-xs font-medium text-blue-600 hover:text-blue-800">
            View All →
          </span>
        </div>
      </div>
    ),
    {
      duration: Infinity,
    }
  )
}
