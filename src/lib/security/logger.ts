/**
 * Security-focused logging utility
 * Logs security events with consistent formatting and context
 */

export type SecurityEventType =
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'AUTH_LOGOUT'
  | 'AUTH_SESSION_EXPIRED'
  | 'ACCESS_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_INPUT'
  | 'DATA_ACCESS'
  | 'DATA_MODIFICATION'
  | 'API_CALL'
  | 'SECURITY_VIOLATION'
  | 'ERROR'

export interface SecurityLogEntry {
  timestamp: string
  event: SecurityEventType
  userId?: string | null
  userEmail?: string
  ip?: string
  userAgent?: string
  resource?: string
  action?: string
  details?: Record<string, unknown>
  severity: 'info' | 'warning' | 'error' | 'critical'
}

/**
 * Create a structured security log entry
 */
function createLogEntry(
  event: SecurityEventType,
  severity: SecurityLogEntry['severity'],
  context: Partial<Omit<SecurityLogEntry, 'timestamp' | 'event' | 'severity'>>
): SecurityLogEntry {
  return {
    timestamp: new Date().toISOString(),
    event,
    severity,
    ...context,
  }
}

/**
 * Format log entry for output
 */
function formatLog(entry: SecurityLogEntry): string {
  const { timestamp, event, severity, userId, ip, resource, action, details } = entry

  let message = `[${timestamp}] [${severity.toUpperCase()}] [${event}]`

  if (userId) message += ` user=${userId}`
  if (ip) message += ` ip=${ip}`
  if (resource) message += ` resource=${resource}`
  if (action) message += ` action=${action}`
  if (details) message += ` details=${JSON.stringify(details)}`

  return message
}

/**
 * Output log based on severity
 */
function outputLog(entry: SecurityLogEntry): void {
  const formatted = formatLog(entry)

  switch (entry.severity) {
    case 'critical':
    case 'error':
      console.error(formatted)
      break
    case 'warning':
      console.warn(formatted)
      break
    default:
      console.log(formatted)
  }

  // In production, you would send these to a log aggregation service
  // like Datadog, Splunk, or CloudWatch
}

// ============================================
// Security Logger API
// ============================================

export const securityLogger = {
  /**
   * Log successful authentication
   */
  authSuccess(userId: string, ip?: string, userAgent?: string): void {
    outputLog(createLogEntry('AUTH_SUCCESS', 'info', {
      userId,
      ip,
      userAgent,
    }))
  },

  /**
   * Log failed authentication attempt
   */
  authFailure(email: string, ip?: string, reason?: string): void {
    outputLog(createLogEntry('AUTH_FAILURE', 'warning', {
      userEmail: email,
      ip,
      details: { reason },
    }))
  },

  /**
   * Log successful logout
   */
  authLogout(userId: string, ip?: string): void {
    outputLog(createLogEntry('AUTH_LOGOUT', 'info', {
      userId,
      ip,
    }))
  },

  /**
   * Log session expiration
   */
  sessionExpired(userId?: string, ip?: string): void {
    outputLog(createLogEntry('AUTH_SESSION_EXPIRED', 'info', {
      userId,
      ip,
    }))
  },

  /**
   * Log access denied
   */
  accessDenied(userId: string | null, resource: string, ip?: string): void {
    outputLog(createLogEntry('ACCESS_DENIED', 'warning', {
      userId,
      ip,
      resource,
    }))
  },

  /**
   * Log rate limit exceeded
   */
  rateLimitExceeded(ip: string, endpoint: string, email?: string): void {
    outputLog(createLogEntry('RATE_LIMIT_EXCEEDED', 'warning', {
      userEmail: email,
      ip,
      resource: endpoint,
    }))
  },

  /**
   * Log invalid input
   */
  invalidInput(endpoint: string, errors: string, ip?: string, userId?: string): void {
    outputLog(createLogEntry('INVALID_INPUT', 'warning', {
      userId,
      ip,
      resource: endpoint,
      details: { errors },
    }))
  },

  /**
   * Log data access
   */
  dataAccess(
    userId: string,
    resource: string,
    action: 'read' | 'list' | 'search',
    ip?: string,
    count?: number
  ): void {
    outputLog(createLogEntry('DATA_ACCESS', 'info', {
      userId,
      ip,
      resource,
      action,
      details: count !== undefined ? { recordCount: count } : undefined,
    }))
  },

  /**
   * Log data modification
   */
  dataModification(
    userId: string,
    resource: string,
    action: 'create' | 'update' | 'delete',
    recordId?: string | number,
    ip?: string
  ): void {
    outputLog(createLogEntry('DATA_MODIFICATION', 'info', {
      userId,
      ip,
      resource,
      action,
      details: recordId !== undefined ? { recordId } : undefined,
    }))
  },

  /**
   * Log external API call
   */
  apiCall(
    userId: string,
    endpoint: string,
    method: string,
    statusCode?: number,
    ip?: string
  ): void {
    outputLog(createLogEntry('API_CALL', 'info', {
      userId,
      ip,
      resource: endpoint,
      action: method,
      details: statusCode !== undefined ? { statusCode } : undefined,
    }))
  },

  /**
   * Log security violation
   */
  securityViolation(
    type: string,
    details: Record<string, unknown>,
    userId?: string,
    ip?: string
  ): void {
    outputLog(createLogEntry('SECURITY_VIOLATION', 'critical', {
      userId,
      ip,
      details: { type, ...details },
    }))
  },

  /**
   * Log error
   */
  error(
    message: string,
    error: unknown,
    context?: {
      userId?: string
      ip?: string
      resource?: string
    }
  ): void {
    outputLog(createLogEntry('ERROR', 'error', {
      ...context,
      details: {
        message,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    }))
  },
}

export default securityLogger
