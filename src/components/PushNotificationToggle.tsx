'use client'

import React from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '@/hooks/use-push-notifications'

export function PushNotificationToggle() {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe
  } = usePushNotifications()

  // Don't show anything if push notifications are not supported
  if (!isSupported) {
    return null
  }

  if (isLoading) {
    return (
      <Button variant="ghost" size="sm" disabled className="h-8 w-8 p-0">
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    )
  }

  // Show disabled state if permission was denied
  if (permission === 'denied') {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        title="Notifications blocked. Enable in browser settings."
        className="h-8 w-8 p-0"
      >
        <BellOff className="h-4 w-4 text-gray-400" />
      </Button>
    )
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe()
    } else {
      await subscribe()
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={isSubscribed ? 'default' : 'ghost'}
        size="sm"
        onClick={handleToggle}
        title={isSubscribed ? 'Push notifications enabled - click to disable' : 'Enable push notifications'}
        className={`h-8 w-8 p-0 ${isSubscribed ? 'bg-brand-orange hover:bg-orange-600' : ''}`}
      >
        {isSubscribed ? (
          <Bell className="h-4 w-4" />
        ) : (
          <BellOff className="h-4 w-4" />
        )}
      </Button>
      {error && (
        <span className="text-xs text-red-500 max-w-[150px] truncate" title={error}>
          {error}
        </span>
      )}
    </div>
  )
}
