import { getServiceRoleClient } from '@/lib/supabase-server'
import { sendPushToAllAdmins, PushPayload } from '@/lib/push-notifications'
import { Resend } from 'resend'

// Initialize Resend
const getResend = () => {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[Rules Engine] RESEND_API_KEY not found')
    return null
  }
  return new Resend(apiKey)
}

// Re-export types and constants from shared file for backward compatibility
export {
  type ConditionGroup,
  type Condition,
  type ConditionNode,
  type NotificationRule,
  type EventContext,
  TRIGGER_EVENTS,
  TRIGGER_FIELDS,
  OPERATORS,
  getFieldsForTrigger,
  getOperatorsForType,
} from '@/lib/notification-rules-types'

import type { ConditionNode, NotificationRule, EventContext } from '@/lib/notification-rules-types'

/**
 * Evaluate all active rules for a given trigger event
 */
export async function evaluateRules(context: EventContext): Promise<void> {
  const supabase = getServiceRoleClient()

  // Fetch active rules for this trigger, ordered by priority
  const { data: rules, error } = await supabase
    .from('notification_rules')
    .select('*')
    .eq('trigger_event', context.trigger)
    .eq('is_active', true)
    .order('priority', { ascending: false })

  if (error) {
    console.error('[Rules Engine] Error fetching rules:', error)
    return
  }

  if (!rules || rules.length === 0) {
    console.log(`[Rules Engine] No active rules for trigger: ${context.trigger}`)
    return
  }

  console.log(`[Rules Engine] Evaluating ${rules.length} rules for trigger: ${context.trigger}`)

  // Evaluate each rule
  for (const rule of rules as NotificationRule[]) {
    try {
      const matches = evaluateConditions(rule.conditions, context.data)

      if (matches) {
        console.log(`[Rules Engine] Rule "${rule.name}" matched, sending notification`)
        await sendRuleNotification(rule, context.data)
      } else {
        console.log(`[Rules Engine] Rule "${rule.name}" did not match`)
      }
    } catch (err) {
      console.error(`[Rules Engine] Error evaluating rule "${rule.name}":`, err)
    }
  }
}

/**
 * Recursively evaluate a condition tree
 */
export function evaluateConditions(node: ConditionNode, data: Record<string, unknown>): boolean {
  if (node.type === 'group') {
    // If no children, consider it a match (empty conditions = always match)
    if (!node.children || node.children.length === 0) {
      return true
    }

    const results = node.children.map(child => evaluateConditions(child, data))

    if (node.operator === 'AND') {
      return results.every(Boolean)
    } else {
      return results.some(Boolean)
    }
  }

  // Leaf condition
  const fieldValue = data[node.field]
  return evaluateOperator(fieldValue, node.operator, node.value)
}

/**
 * Evaluate a single operator condition
 */
function evaluateOperator(fieldValue: unknown, operator: string, conditionValue: unknown): boolean {
  // Handle null/undefined field values
  if (fieldValue === null || fieldValue === undefined) {
    if (operator === 'is_empty') return true
    if (operator === 'is_not_empty') return false
    return false
  }

  switch (operator) {
    // Equality
    case 'equals':
      return fieldValue === conditionValue
    case 'not_equals':
      return fieldValue !== conditionValue

    // String operations
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(conditionValue).toLowerCase())
    case 'not_contains':
      return !String(fieldValue).toLowerCase().includes(String(conditionValue).toLowerCase())
    case 'starts_with':
      return String(fieldValue).toLowerCase().startsWith(String(conditionValue).toLowerCase())
    case 'ends_with':
      return String(fieldValue).toLowerCase().endsWith(String(conditionValue).toLowerCase())

    // Number comparisons
    case 'greater_than':
      return Number(fieldValue) > Number(conditionValue)
    case 'less_than':
      return Number(fieldValue) < Number(conditionValue)
    case 'greater_or_equal':
      return Number(fieldValue) >= Number(conditionValue)
    case 'less_or_equal':
      return Number(fieldValue) <= Number(conditionValue)

    // Boolean
    case 'is_true':
      return fieldValue === true || fieldValue === 'true' || fieldValue === 1
    case 'is_false':
      return fieldValue === false || fieldValue === 'false' || fieldValue === 0

    // Empty checks
    case 'is_empty':
      return fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0)
    case 'is_not_empty':
      return fieldValue !== '' && !(Array.isArray(fieldValue) && fieldValue.length === 0)

    default:
      console.warn(`[Rules Engine] Unknown operator: ${operator}`)
      return false
  }
}

/**
 * Send notification based on rule configuration
 */
async function sendRuleNotification(rule: NotificationRule, data: Record<string, unknown>): Promise<void> {
  const supabase = getServiceRoleClient()

  // Substitute template variables in title and body
  const title = substituteVariables(rule.notification_title || rule.name, data)
  const body = substituteVariables(rule.notification_body || '', data)
  const url = substituteVariables(rule.notification_url || '/dashboard', data)

  // Always save notification to database for display in Alerts
  try {
    const { error: dbError } = await supabase
      .from('booking_notifications')
      .insert({
        activity_booking_id: data.booking_id ? Number(data.booking_id) : null,
        notification_type: 'rule_triggered',
        severity: 'warning',
        title: title,
        message: body,
        details: {
          rule_id: rule.id,
          rule_name: rule.name,
          trigger_event: rule.trigger_event,
          event_data: data,
          notification_url: url,
          channels_used: rule.channels,
        },
        is_read: false,
        is_resolved: false,
      })

    if (dbError) {
      console.error(`[Rules Engine] Failed to save notification to database:`, dbError)
    } else {
      console.log(`[Rules Engine] Notification saved to database for rule "${rule.name}"`)
    }
  } catch (err) {
    console.error(`[Rules Engine] Error saving notification to database:`, err)
  }

  // Send push notification if enabled
  if (rule.channels.includes('push')) {
    const payload: PushPayload = {
      title,
      body,
      icon: '/favicon.svg',
      tag: `rule-${rule.id}`,
      data: {
        url,
        type: rule.trigger_event,
      },
      requireInteraction: true,
    }

    try {
      await sendPushToAllAdmins(payload)
    } catch (err) {
      console.error(`[Rules Engine] Push notification failed for rule "${rule.name}":`, err)
    }
  }

  // Send email if enabled
  if (rule.channels.includes('email') && rule.email_recipients.length > 0) {
    const resend = getResend()
    if (!resend) {
      console.error(`[Rules Engine] Email sending skipped - RESEND_API_KEY not configured`)
    } else {
      try {
        const htmlContent = createNotificationEmailHtml(title, body, url)

        const { data, error } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'EnRoma.com <noreply@enroma.com>',
          to: rule.email_recipients,
          subject: title,
          html: htmlContent,
        })

        if (error) {
          console.error(`[Rules Engine] Email failed for rule "${rule.name}":`, error)
        } else {
          console.log(`[Rules Engine] Email sent successfully to: ${rule.email_recipients.join(', ')} (ID: ${data?.id})`)
        }
      } catch (err) {
        console.error(`[Rules Engine] Email error for rule "${rule.name}":`, err)
      }
    }
  }
}

/**
 * Create a styled HTML email for notifications
 */
function createNotificationEmailHtml(title: string, body: string, url: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <!-- Header with gradient -->
          <tr>
            <td style="padding: 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 32px 40px; background: linear-gradient(135deg, #ee682a 0%, #2dba7d 100%); border-radius: 12px 12px 0 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="padding-right: 16px;">
                          <div style="width: 48px; height: 48px; background-color: rgba(255,255,255,0.2); border-radius: 10px; text-align: center; line-height: 48px;">
                            <span style="color: #ffffff; font-size: 24px; font-weight: bold;">E</span>
                          </div>
                        </td>
                        <td>
                          <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 700;">EnRoma.com</h1>
                          <p style="margin: 4px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Tour Operations Alert</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 20px; font-weight: 600;">${title}</h2>
              <div style="color: #374151; font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
                ${body.replace(/\n/g, '<br>')}
              </div>
              ${url ? `
              <a href="${url.startsWith('http') ? url : 'https://tourmageddon.it' + url}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #ee682a 0%, #f97316 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">View Details</a>
              ` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px 32px; background-color: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px;">
                      This notification was triggered by a rule in <strong style="color: #ee682a;">Tourmageddon</strong>
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                      Manage your notification rules at <a href="https://tourmageddon.it/dashboard" style="color: #ee682a;">tourmageddon.it</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

/**
 * Replace {variable} placeholders with actual values from data
 */
function substituteVariables(template: string, data: Record<string, unknown>): string {
  if (!template) return ''

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = data[key]
    if (value === null || value === undefined) return match
    return String(value)
  })
}

