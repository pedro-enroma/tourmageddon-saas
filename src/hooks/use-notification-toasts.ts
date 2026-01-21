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

export function useNotificationToasts() {
  useEffect(() => {
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
          const notification = payload.new as NotificationPayload

          // Determine toast type based on severity
          const severity = notification.severity || 'info'
          const title = notification.title || notification.details?.rule_name || 'New Notification'
          const message = notification.message || ''

          // Show toast based on severity
          switch (severity) {
            case 'error':
            case 'critical':
              toast.error(title, {
                description: message,
                duration: 8000,
              })
              break
            case 'warning':
              toast.warning(title, {
                description: message,
                duration: 6000,
              })
              break
            case 'success':
              toast.success(title, {
                description: message,
                duration: 5000,
              })
              break
            default:
              toast.info(title, {
                description: message,
                duration: 5000,
              })
          }
        }
      )
      .subscribe()

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
}
