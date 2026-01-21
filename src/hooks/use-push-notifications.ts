'use client'

import { useState, useEffect, useCallback } from 'react'

interface PushNotificationState {
  isSupported: boolean
  permission: NotificationPermission | 'unsupported'
  isSubscribed: boolean
  isLoading: boolean
  error: string | null
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: 'unsupported',
    isSubscribed: false,
    isLoading: true,
    error: null
  })

  // Check support and current state on mount
  useEffect(() => {
    const checkSupport = async () => {
      const isSupported = 'serviceWorker' in navigator && 'PushManager' in window

      if (!isSupported) {
        setState(prev => ({ ...prev, isSupported: false, isLoading: false }))
        return
      }

      const permission = Notification.permission
      let isSubscribed = false

      if (permission === 'granted') {
        try {
          const registration = await navigator.serviceWorker.ready
          const subscription = await registration.pushManager.getSubscription()
          isSubscribed = !!subscription
        } catch (err) {
          console.error('[Push] Error checking subscription:', err)
        }
      }

      setState({
        isSupported: true,
        permission,
        isSubscribed,
        isLoading: false,
        error: null
      })
    }

    checkSupport()
  }, [])

  // Register service worker
  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers not supported')
    }

    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    return registration
  }, [])

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      // Request permission
      const permission = await Notification.requestPermission()

      if (permission !== 'granted') {
        setState(prev => ({
          ...prev,
          permission,
          isLoading: false,
          error: permission === 'denied' ? 'Notifications blocked by browser' : 'Permission not granted'
        }))
        return false
      }

      // Register service worker
      const registration = await registerServiceWorker()

      // Get VAPID public key
      const vapidResponse = await fetch('/api/push/vapid-public-key')
      const { publicKey, error: vapidError } = await vapidResponse.json()

      if (!publicKey || vapidError) {
        throw new Error(vapidError || 'VAPID key not available')
      }

      // Convert VAPID key
      const applicationServerKey = urlBase64ToUint8Array(publicKey)

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer
      })

      // Send subscription to server
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
        credentials: 'include'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save subscription')
      }

      setState(prev => ({
        ...prev,
        permission: 'granted',
        isSubscribed: true,
        isLoading: false,
        error: null
      }))

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Subscription failed'
      console.error('[Push] Subscribe error:', err)
      setState(prev => ({ ...prev, isLoading: false, error: message }))
      return false
    }
  }, [registerServiceWorker])

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        // Unsubscribe from server
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
          credentials: 'include'
        })

        // Unsubscribe locally
        await subscription.unsubscribe()
      }

      setState(prev => ({ ...prev, isSubscribed: false, isLoading: false, error: null }))
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unsubscribe failed'
      console.error('[Push] Unsubscribe error:', err)
      setState(prev => ({ ...prev, isLoading: false, error: message }))
      return false
    }
  }, [])

  return {
    ...state,
    subscribe,
    unsubscribe
  }
}

// Helper function to convert VAPID key from base64 URL to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
