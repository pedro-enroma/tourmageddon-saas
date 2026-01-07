'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { RealtimeChannel } from '@supabase/supabase-js'

interface UseRealtimeRefreshOptions {
  tables: string[]
  onRefresh: () => void
  enabled?: boolean
  debounceMs?: number
  fallbackPollingMs?: number // Fallback polling interval if realtime fails
}

interface ConnectionStatus {
  isConnected: boolean
  lastError: string | null
  reconnectAttempts: number
  usingFallback: boolean
}

export function useRealtimeRefresh({
  tables,
  onRefresh,
  enabled = true,
  debounceMs = 1000,
  fallbackPollingMs = 5 * 60 * 1000, // 5 minutes fallback polling
}: UseRealtimeRefreshOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const onRefreshRef = useRef(onRefresh)

  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    lastError: null,
    reconnectAttempts: 0,
    usingFallback: false,
  })

  // Keep onRefresh ref up to date without causing re-renders
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  // Setup fallback polling
  const startFallbackPolling = () => {
    if (fallbackIntervalRef.current) return // Already running

    console.log(`[Realtime] Starting fallback polling every ${fallbackPollingMs / 1000}s`)
    setStatus(prev => ({ ...prev, usingFallback: true }))

    fallbackIntervalRef.current = setInterval(() => {
      console.log('[Realtime] Fallback polling refresh')
      onRefreshRef.current()
    }, fallbackPollingMs)
  }

  const stopFallbackPolling = () => {
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current)
      fallbackIntervalRef.current = null
    }
    setStatus(prev => ({ ...prev, usingFallback: false }))
  }

  // Main subscription effect
  useEffect(() => {
    if (!enabled || tables.length === 0) {
      return
    }

    // Cleanup existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channelName = `supersantos-realtime-${Date.now()}`
    let channel = supabase.channel(channelName)

    // Handle incoming changes with debounce
    const handleChange = (payload: { table?: string; eventType?: string }) => {
      console.log('[Realtime] Change detected:', payload.table, payload.eventType)

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(() => {
        console.log('[Realtime] Triggering data refresh')
        onRefreshRef.current()
      }, debounceMs)
    }

    // Subscribe to each table
    tables.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
        },
        handleChange
      )
    })

    // Subscribe and handle connection status
    channel.subscribe((subscribeStatus, err) => {
      if (subscribeStatus === 'SUBSCRIBED') {
        console.log('[Realtime] Connected successfully to tables:', tables.join(', '))
        stopFallbackPolling()
        setStatus({
          isConnected: true,
          lastError: null,
          reconnectAttempts: 0,
          usingFallback: false,
        })
      } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
        const errorMsg = err?.message || 'Realtime not enabled for these tables'
        console.warn('[Realtime] Connection failed:', errorMsg)
        console.warn('[Realtime] To enable: Go to Supabase Dashboard > Database > Replication and add these tables')

        setStatus({
          isConnected: false,
          lastError: errorMsg,
          reconnectAttempts: 0,
          usingFallback: true,
        })

        // Start fallback polling
        startFallbackPolling()
      } else if (subscribeStatus === 'CLOSED') {
        console.log('[Realtime] Channel closed')
        setStatus((prev) => ({
          ...prev,
          isConnected: false,
        }))
      }
    })

    channelRef.current = channel

    // Cleanup on unmount or when dependencies change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current)
        fallbackIntervalRef.current = null
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tables.join(','), debounceMs, fallbackPollingMs])

  // Handle visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled) {
        // Refresh data when tab becomes visible
        console.log('[Realtime] Tab visible, refreshing data')
        onRefreshRef.current()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled])

  const reconnect = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    setStatus((prev) => ({ ...prev, reconnectAttempts: 0 }))
  }

  return {
    status,
    reconnect,
  }
}
