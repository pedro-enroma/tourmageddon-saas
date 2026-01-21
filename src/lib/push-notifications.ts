import webpush from 'web-push'
import { getServiceRoleClient } from '@/lib/supabase-server'

// Configure web-push with VAPID details
if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:operations@enroma.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export interface PushPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: {
    url?: string
    notificationId?: string
    type?: string
  }
  requireInteraction?: boolean
}

interface PushSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  user_id: string
}

/**
 * Send a push notification to all admin users
 */
export async function sendPushToAllAdmins(payload: PushPayload): Promise<{
  sent: number
  failed: number
  removed: number
}> {
  const supabase = getServiceRoleClient()

  // Get all active subscriptions for admin users
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select(`
      id,
      endpoint,
      p256dh,
      auth,
      user_id
    `)
    .eq('is_active', true)

  if (error) {
    console.error('[Push] Error fetching subscriptions:', error)
    return { sent: 0, failed: 0, removed: 0 }
  }

  if (!subscriptions?.length) {
    console.log('[Push] No active subscriptions found')
    return { sent: 0, failed: 0, removed: 0 }
  }

  // Filter to only admin users
  const userIds = [...new Set(subscriptions.map(s => s.user_id))]
  const { data: adminUsers } = await supabase
    .from('app_users')
    .select('id')
    .in('id', userIds)
    .eq('role', 'admin')

  const adminUserIds = new Set(adminUsers?.map(u => u.id) || [])
  const adminSubscriptions = subscriptions.filter(s => adminUserIds.has(s.user_id)) as PushSubscription[]

  if (!adminSubscriptions.length) {
    console.log('[Push] No admin subscriptions found')
    return { sent: 0, failed: 0, removed: 0 }
  }

  let sent = 0
  let failed = 0
  let removed = 0

  for (const sub of adminSubscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    }

    try {
      await webpush.sendNotification(
        pushSubscription,
        JSON.stringify(payload),
        {
          TTL: 3600, // 1 hour
          urgency: 'high'
        }
      )

      // Update last_used_at
      await supabase
        .from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', sub.id)

      sent++
      console.log(`[Push] Sent to subscription ${sub.id}`)
    } catch (err: unknown) {
      const webPushError = err as { statusCode?: number; message?: string }
      console.error(`[Push] Failed for subscription ${sub.id}:`, webPushError.statusCode || webPushError.message)

      // Remove invalid/expired subscriptions (410 Gone or 404 Not Found)
      if (webPushError.statusCode === 410 || webPushError.statusCode === 404) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('id', sub.id)
        removed++
        console.log(`[Push] Removed expired subscription ${sub.id}`)
      } else {
        failed++
      }
    }
  }

  console.log(`[Push] Summary: sent=${sent}, failed=${failed}, removed=${removed}`)
  return { sent, failed, removed }
}

/**
 * Send push notification for deadline escalation
 */
export async function sendDeadlineEscalationPush(
  voucherBookingNumber: string,
  categoryName: string,
  visitDate: string,
  ticketCount: number
) {
  return sendPushToAllAdmins({
    title: 'Deadline Missed',
    body: `Voucher ${voucherBookingNumber} (${categoryName}) for ${visitDate} has passed deadline. ${ticketCount} tickets need names.`,
    icon: '/favicon.svg',
    tag: `deadline-${voucherBookingNumber}`,
    data: {
      url: '/dashboard?view=vouchers-list',
      type: 'voucher_deadline_missed'
    },
    requireInteraction: true
  })
}

/**
 * Send push notification for age mismatch
 */
export async function sendAgeMismatchPush(
  activityBookingId: number,
  productTitle: string,
  mismatchCount: number
) {
  return sendPushToAllAdmins({
    title: 'Age Mismatch Alert',
    body: `Booking #${activityBookingId} (${productTitle}) has ${mismatchCount} age mismatch(es) that cannot be auto-fixed.`,
    icon: '/favicon.svg',
    tag: `age-mismatch-${activityBookingId}`,
    data: {
      url: '/dashboard?view=notifications',
      notificationId: String(activityBookingId),
      type: 'age_mismatch'
    },
    requireInteraction: true
  })
}

/**
 * Send push notification for sync failure
 */
export async function sendSyncFailurePush(
  productId: string,
  errorMessage: string
) {
  return sendPushToAllAdmins({
    title: 'Sync Failure',
    body: `Availability sync failed for product ${productId}: ${errorMessage}`,
    icon: '/favicon.svg',
    tag: `sync-failure-${productId}`,
    data: {
      url: '/dashboard?view=availability-sync',
      type: 'sync_failure'
    },
    requireInteraction: false
  })
}
