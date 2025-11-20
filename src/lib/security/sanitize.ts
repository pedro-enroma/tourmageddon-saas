/**
 * Security sanitization utilities
 * Prevent injection attacks and data leakage
 */

// ============================================
// Excel/CSV Formula Injection Prevention
// ============================================

/**
 * Characters that can trigger formula execution in Excel
 */
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r', '\n']

/**
 * Sanitize a value for safe Excel export
 * Prevents formula injection attacks
 */
export function sanitizeForExcel(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  const stringValue = String(value)

  // Check if the string starts with a formula trigger
  if (FORMULA_TRIGGERS.some(trigger => stringValue.startsWith(trigger))) {
    // Prepend single quote to prevent formula execution
    return "'" + stringValue
  }

  // Also check for tab and newline characters that could be used for injection
  if (stringValue.includes('\t') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return stringValue
      .replace(/\t/g, ' ')
      .replace(/\r?\n/g, ' ')
  }

  return stringValue
}

/**
 * Sanitize an entire row object for Excel export
 */
export function sanitizeRowForExcel<T extends Record<string, unknown>>(row: T): T {
  const sanitized = {} as T

  for (const [key, value] of Object.entries(row)) {
    (sanitized as Record<string, unknown>)[key] = sanitizeForExcel(value)
  }

  return sanitized
}

/**
 * Sanitize an array of rows for Excel export
 */
export function sanitizeDataForExcel<T extends Record<string, unknown>>(data: T[]): T[] {
  return data.map(row => sanitizeRowForExcel(row))
}

// ============================================
// HTML/XSS Prevention
// ============================================

/**
 * Escape HTML special characters
 */
export function escapeHtml(input: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }

  return input.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char)
}

/**
 * Strip all HTML tags from a string
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '')
}

// ============================================
// SQL/Query Prevention
// ============================================

/**
 * Escape special characters for safe use in LIKE queries
 * Note: Use parameterized queries instead when possible
 */
export function escapeLikePattern(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

// ============================================
// Path Traversal Prevention
// ============================================

/**
 * Sanitize file path to prevent directory traversal
 */
export function sanitizeFilePath(input: string): string {
  return input
    .replace(/\.\./g, '')
    .replace(/\/\//g, '/')
    .replace(/^\/+/, '')
}

/**
 * Validate that a filename is safe
 */
export function isValidFilename(filename: string): boolean {
  // Only allow alphanumeric, dash, underscore, and dot
  const validPattern = /^[\w\-. ]+$/

  // Prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false
  }

  return validPattern.test(filename) && filename.length <= 255
}

// ============================================
// Data Masking for Logs
// ============================================

/**
 * Mask sensitive data for logging
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'

  const maskedLocal = local.length > 2
    ? local[0] + '***' + local[local.length - 1]
    : '***'

  return `${maskedLocal}@${domain}`
}

/**
 * Mask phone number for logging
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return '***'

  return '***' + digits.slice(-4)
}

/**
 * Mask a generic string (show first and last 2 chars)
 */
export function maskString(input: string, visibleChars: number = 2): string {
  if (input.length <= visibleChars * 2) {
    return '***'
  }

  return input.slice(0, visibleChars) + '***' + input.slice(-visibleChars)
}

// ============================================
// JSON Sanitization
// ============================================

/**
 * Safely parse JSON without throwing
 */
export function safeJsonParse<T>(input: string, defaultValue: T): T {
  try {
    return JSON.parse(input) as T
  } catch {
    return defaultValue
  }
}

/**
 * Remove sensitive fields from an object for logging
 */
export function removeSensitiveFields<T extends Record<string, unknown>>(
  obj: T,
  sensitiveFields: string[] = ['password', 'token', 'secret', 'key', 'authorization']
): Partial<T> {
  const cleaned = { ...obj }

  for (const field of sensitiveFields) {
    if (field in cleaned) {
      delete cleaned[field]
    }
  }

  return cleaned
}
