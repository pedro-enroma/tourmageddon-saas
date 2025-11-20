import { z } from 'zod'

// ============================================
// Common validation schemas
// ============================================

// UUID validation
export const uuidSchema = z.string().uuid('Invalid UUID format')

// Date string validation (ISO format)
export const dateStringSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Invalid date format. Use YYYY-MM-DD'
)

// Date range validation
export const dateRangeSchema = z.object({
  start: dateStringSchema,
  end: dateStringSchema,
}).refine(
  (data) => new Date(data.start) <= new Date(data.end),
  'Start date must be before or equal to end date'
)

// Email validation
export const emailSchema = z.string()
  .email('Invalid email format')
  .max(255, 'Email too long')

// Phone number validation
export const phoneSchema = z.string()
  .regex(/^[\d\s\-+()]*$/, 'Invalid phone number format')
  .max(50, 'Phone number too long')
  .optional()

// Safe string validation (no script injection)
export const safeStringSchema = z.string()
  .max(1000, 'String too long')
  .transform((val) => val.trim())
  .refine(
    (val) => !/<script|javascript:|on\w+=/i.test(val),
    'Invalid characters detected'
  )

// Search term validation (prevent ReDoS)
export const searchTermSchema = z.string()
  .max(100, 'Search term too long')
  .transform((val) => val.trim())
  .refine(
    (val) => !/[*+?{}[\]\\^$.|]/.test(val) || val.length < 50,
    'Search term contains invalid characters'
  )

// ============================================
// Activity/Booking validation schemas
// ============================================

export const activityIdSchema = z.string().min(1, 'Activity ID is required')

export const activityIdsArraySchema = z.array(activityIdSchema)
  .min(1, 'At least one activity must be selected')
  .max(100, 'Too many activities selected')

export const bookingQuerySchema = z.object({
  activityIds: activityIdsArraySchema.optional(),
  dateRange: dateRangeSchema,
  searchTerm: searchTermSchema.optional(),
})

// ============================================
// Participant validation schemas
// ============================================

// Helper function to create safe string with custom max length
const createSafeString = (maxLength: number) => z.string()
  .max(maxLength, `String too long (max ${maxLength} chars)`)
  .transform((val) => val.trim())
  .refine(
    (val) => !/<script|javascript:|on\w+=/i.test(val),
    'Invalid characters detected'
  )

export const participantUpdateSchema = z.object({
  pricing_category_booking_id: z.number().int().positive(),
  first_name: createSafeString(100).optional(),
  last_name: createSafeString(100).optional(),
  date_of_birth: dateStringSchema.nullable().optional(),
  original_first_name: createSafeString(100).optional(),
  original_last_name: createSafeString(100).optional(),
  original_date_of_birth: dateStringSchema.nullable().optional(),
})

// ============================================
// Guide validation schemas
// ============================================

export const guideSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(200, 'Name too long')
    .transform((val) => val.trim())
    .refine(
      (val) => !/<script|javascript:|on\w+=/i.test(val),
      'Invalid characters detected'
    ),
  email: emailSchema.optional().nullable(),
  phone: phoneSchema.nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional(),
})

// ============================================
// Export/sync validation schemas
// ============================================

export const availabilitySyncSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  days: z.number().int().min(1).max(365, 'Days must be between 1 and 365'),
})

// ============================================
// Pagination validation
// ============================================

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
})

// ============================================
// Utility functions
// ============================================

/**
 * Validate input against a schema and return the result
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const errorMessage = result.error.issues
    .map((err) => err.message)
    .join(', ')

  return { success: false, error: errorMessage }
}

/**
 * Validate input and throw if invalid
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data)
}

/**
 * Sanitize a string for safe use in queries and display
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .slice(0, 1000) // Limit length
}

/**
 * Sanitize search input to prevent ReDoS
 */
export function sanitizeSearchTerm(input: string): string {
  return input
    .trim()
    .replace(/[*+?{}[\]\\^$.|]/g, '') // Remove regex special chars
    .slice(0, 100) // Limit length
}
