import { NextRequest } from 'next/server'
import { getServiceRoleClient } from './supabase-server'

/**
 * Audit log action types
 */
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'LOGIN_FAILED'
  | 'MFA_SETUP'
  | 'MFA_VERIFIED'
  | 'MFA_FAILED'
  | 'MFA_REMOVED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DISABLED'
  | 'USER_ENABLED'
  | 'PASSWORD_CHANGED'
  | 'ROLE_CHANGED'

/**
 * Entity types that can be audited
 */
export type AuditEntityType =
  | 'guide'
  | 'escort'
  | 'headphone'
  | 'guide_assignment'
  | 'escort_assignment'
  | 'headphone_assignment'
  | 'voucher'
  | 'ticket'
  | 'ticket_category'
  | 'ticket_type_mapping'
  | 'product_activity_mapping'
  | 'notification'
  | 'attachment'
  | 'service_attachment'
  | 'tour_group'
  | 'email_template'
  | 'meeting_point'
  | 'activity_meeting_point'
  | 'activity_template_assignment'
  | 'booking_swap'
  | 'user'
  | 'calendar_settings'
  | 'calendar_setting'
  | 'session'

/**
 * Parameters for logging an audit event
 */
export interface AuditLogParams {
  userId?: string
  userEmail?: string
  action: AuditAction
  entityType?: AuditEntityType
  entityId?: string
  changes?: {
    old?: Record<string, unknown>
    new?: Record<string, unknown>
  }
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

/**
 * Log an audit event to the database.
 * This function never throws - errors are logged but don't interrupt the main flow.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const supabase = getServiceRoleClient()

    const { error } = await supabase.from('audit_logs').insert([{
      user_id: params.userId || null,
      user_email: params.userEmail || null,
      action: params.action,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      changes: params.changes || null,
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
      created_at: new Date().toISOString(),
    }])

    if (error) {
      console.error('[AUDIT] Failed to write audit log:', error.message)
    }
  } catch (err) {
    // Never throw from audit logging - just log the error
    console.error('[AUDIT] Exception writing audit log:', err)
  }
}

/**
 * Extract IP address and user agent from a Next.js request.
 */
export function getRequestContext(request: NextRequest): {
  ip: string
  userAgent: string
} {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown'
  const userAgent = request.headers.get('user-agent') || 'unknown'

  return { ip, userAgent }
}

/**
 * Create an audit log entry for a CREATE operation.
 * Supports two call signatures:
 * 1. auditCreate(request, user, entityType, entityId, newData)
 * 2. auditCreate(userId, userEmail, entityType, entityId, newData, ip, userAgent)
 */
export async function auditCreate(
  requestOrUserId: NextRequest | string,
  userOrEmail: { id: string; email?: string } | string | undefined,
  entityType: AuditEntityType,
  entityId: string,
  newData: Record<string, unknown>,
  ip?: string,
  userAgent?: string
): Promise<void> {
  let userId: string | undefined
  let userEmail: string | undefined
  let ipAddress: string
  let ua: string

  if (typeof requestOrUserId === 'string') {
    // Old-style call: auditCreate(userId, userEmail, entityType, entityId, newData, ip, userAgent)
    userId = requestOrUserId
    userEmail = userOrEmail as string | undefined
    ipAddress = ip || 'unknown'
    ua = userAgent || 'unknown'
  } else {
    // New-style call: auditCreate(request, user, entityType, entityId, newData)
    const context = getRequestContext(requestOrUserId)
    const user = userOrEmail as { id: string; email?: string }
    userId = user.id
    userEmail = user.email
    ipAddress = context.ip
    ua = context.userAgent
  }

  await logAudit({
    userId,
    userEmail,
    action: 'CREATE',
    entityType,
    entityId,
    changes: { new: newData },
    ipAddress,
    userAgent: ua,
  })
}

/**
 * Create an audit log entry for an UPDATE operation.
 * Supports two call signatures:
 * 1. auditUpdate(request, user, entityType, entityId, oldData, newData)
 * 2. auditUpdate(userId, userEmail, entityType, entityId, oldData, newData, ip, userAgent)
 */
export async function auditUpdate(
  requestOrUserId: NextRequest | string,
  userOrEmail: { id: string; email?: string } | string | undefined,
  entityType: AuditEntityType,
  entityId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  ip?: string,
  userAgent?: string
): Promise<void> {
  let userId: string | undefined
  let userEmail: string | undefined
  let ipAddress: string
  let ua: string

  if (typeof requestOrUserId === 'string') {
    // Old-style call: auditUpdate(userId, userEmail, entityType, entityId, oldData, newData, ip, userAgent)
    userId = requestOrUserId
    userEmail = userOrEmail as string | undefined
    ipAddress = ip || 'unknown'
    ua = userAgent || 'unknown'
  } else {
    // New-style call: auditUpdate(request, user, entityType, entityId, oldData, newData)
    const context = getRequestContext(requestOrUserId)
    const user = userOrEmail as { id: string; email?: string }
    userId = user.id
    userEmail = user.email
    ipAddress = context.ip
    ua = context.userAgent
  }

  await logAudit({
    userId,
    userEmail,
    action: 'UPDATE',
    entityType,
    entityId,
    changes: { old: oldData, new: newData },
    ipAddress,
    userAgent: ua,
  })
}

/**
 * Create an audit log entry for a DELETE operation.
 * Supports two call signatures:
 * 1. auditDelete(request, user, entityType, entityId, deletedData?)
 * 2. auditDelete(userId, userEmail, entityType, entityId, deletedData, ip, userAgent)
 */
export async function auditDelete(
  requestOrUserId: NextRequest | string,
  userOrEmail: { id: string; email?: string } | string | undefined,
  entityType: AuditEntityType,
  entityId: string,
  deletedData?: Record<string, unknown>,
  ip?: string,
  userAgent?: string
): Promise<void> {
  let userId: string | undefined
  let userEmail: string | undefined
  let ipAddress: string
  let ua: string

  if (typeof requestOrUserId === 'string') {
    // Old-style call: auditDelete(userId, userEmail, entityType, entityId, deletedData, ip, userAgent)
    userId = requestOrUserId
    userEmail = userOrEmail as string | undefined
    ipAddress = ip || 'unknown'
    ua = userAgent || 'unknown'
  } else {
    // New-style call: auditDelete(request, user, entityType, entityId, deletedData)
    const context = getRequestContext(requestOrUserId)
    const user = userOrEmail as { id: string; email?: string }
    userId = user.id
    userEmail = user.email
    ipAddress = context.ip
    ua = context.userAgent
  }

  await logAudit({
    userId,
    userEmail,
    action: 'DELETE',
    entityType,
    entityId,
    changes: deletedData ? { old: deletedData } : undefined,
    ipAddress,
    userAgent: ua,
  })
}

/**
 * Create an audit log entry for authentication events.
 */
export async function auditAuth(
  request: NextRequest,
  action: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'MFA_VERIFIED' | 'MFA_FAILED',
  user?: { id: string; email?: string },
  metadata?: Record<string, unknown>
): Promise<void> {
  const { ip, userAgent } = getRequestContext(request)

  await logAudit({
    userId: user?.id,
    userEmail: user?.email,
    action,
    entityType: 'session',
    changes: metadata ? { new: metadata } : undefined,
    ipAddress: ip,
    userAgent,
  })
}

/**
 * Compute the diff between old and new values for audit logging.
 * Returns only the fields that changed.
 */
export function computeChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>
): { old: Record<string, unknown>; new: Record<string, unknown> } {
  const changedOld: Record<string, unknown> = {}
  const changedNew: Record<string, unknown> = {}

  // Check all keys in new data
  for (const key of Object.keys(newData)) {
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      changedOld[key] = oldData[key]
      changedNew[key] = newData[key]
    }
  }

  // Check for deleted keys
  for (const key of Object.keys(oldData)) {
    if (!(key in newData)) {
      changedOld[key] = oldData[key]
      changedNew[key] = undefined
    }
  }

  return { old: changedOld, new: changedNew }
}
