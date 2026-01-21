'use client'

import { useEffect } from 'react'
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

// Store a reference to set the current view (will be set by dashboard)
let setDashboardView: ((view: string) => void) | null = null

export function setNotificationNavigator(setter: (view: string) => void) {
  setDashboardView = setter
}

export function NotificationToastProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    console.log('[NotificationToastProvider] Setting up realtime subscription...')

    // Subscribe to new notifications
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

          // Determine toast type based on severity
          const severity = notification.severity || 'info'
          const title = notification.title || notification.details?.rule_name || 'New Notification'
          const message = notification.message || ''

          // Common toast options - persist until dismissed
          const toastOptions = {
            description: message,
            duration: Infinity,
            action: {
              label: 'View All',
              onClick: () => {
                if (setDashboardView) {
                  setDashboardView('notifications')
                } else {
                  window.location.href = '/dashboard?view=notifications'
                }
              },
            },
            className: 'cursor-pointer',
            onClick: () => {
              if (setDashboardView) {
                setDashboardView('notifications')
              } else {
                window.location.href = '/dashboard?view=notifications'
              }
            },
          }

          // Show toast based on severity
          switch (severity) {
            case 'error':
            case 'critical':
              toast.error(title, toastOptions)
              break
            case 'warning':
              toast.warning(title, toastOptions)
              break
            case 'success':
              toast.success(title, toastOptions)
              break
            default:
              toast.info(title, toastOptions)
          }
        }
      )
      .subscribe((status) => {
        console.log('[NotificationToastProvider] Subscription status:', status)
      })

    // Cleanup subscription on unmount
    return () => {
      console.log('[NotificationToastProvider] Cleaning up subscription')
      supabase.removeChannel(channel)
    }
  }, [])

  return <>{children}</>
}
