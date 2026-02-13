// Shared types and constants for notification rules
// This file is safe for client-side use (no server-only imports)

// Condition types
export interface ConditionGroup {
  type: 'group'
  operator: 'AND' | 'OR'
  children: ConditionNode[]
}

export interface Condition {
  type: 'condition'
  field: string
  operator: string
  value: string | number | boolean | null
}

export type ConditionNode = ConditionGroup | Condition

// Rule type
export interface NotificationRule {
  id: string
  name: string
  description: string | null
  trigger_event: string
  conditions: ConditionNode
  channels: string[]
  email_recipients: string[]
  telegram_chat_ids: string[]
  recipient_roles: string[]
  notification_title: string | null
  notification_body: string | null
  notification_url: string | null
  is_active: boolean
  priority: number
}

// Event context passed to the evaluation engine
export interface EventContext {
  trigger: string
  data: Record<string, unknown>
}

// Trigger event types
export const TRIGGER_EVENTS = {
  // Booking events
  BOOKING_CREATED: 'booking_created',
  BOOKING_MODIFIED: 'booking_modified',
  BOOKING_CANCELLED: 'booking_cancelled',
  // Voucher events
  VOUCHER_UPLOADED: 'voucher_uploaded',
  VOUCHER_DEADLINE_APPROACHING: 'voucher_deadline_approaching',
  VOUCHER_DEADLINE_MISSED: 'voucher_deadline_missed',
  // Assignment events
  GUIDE_ASSIGNED: 'guide_assigned',
  ESCORT_ASSIGNED: 'escort_assigned',
  ASSIGNMENT_REMOVED: 'assignment_removed',
  // Slot status events (for daily checks)
  SLOT_MISSING_GUIDE: 'slot_missing_guide',
  SLOT_PLACEHOLDER_GUIDE: 'slot_placeholder_guide',
  // System events
  AGE_MISMATCH: 'age_mismatch',
  SYNC_FAILURE: 'sync_failure',
} as const

// Available fields per trigger event
export const TRIGGER_FIELDS: Record<string, { field: string; label: string; type: 'string' | 'number' | 'boolean' | 'date' }[]> = {
  booking_created: [
    { field: 'booking_id', label: 'Booking ID', type: 'number' },
    { field: 'customer_name', label: 'Customer Name', type: 'string' },
    { field: 'activity_name', label: 'Activity Name', type: 'string' },
    { field: 'product_name', label: 'Product Name', type: 'string' },
    { field: 'category_name', label: 'Category Name', type: 'string' },
    { field: 'ticket_count', label: 'Ticket Count', type: 'number' },
    { field: 'participant_count', label: 'Participant Count', type: 'number' },
    { field: 'travel_date', label: 'Travel Date', type: 'date' },
    { field: 'start_time', label: 'Start Time', type: 'string' },
    { field: 'days_until_travel', label: 'Days Until Travel', type: 'number' },
    { field: 'seller_name', label: 'Seller Name', type: 'string' },
    { field: 'has_children', label: 'Has Children', type: 'boolean' },
    { field: 'has_seniors', label: 'Has Seniors', type: 'boolean' },
  ],
  booking_modified: [
    { field: 'activity_name', label: 'Activity Name', type: 'string' },
    { field: 'product_name', label: 'Product Name', type: 'string' },
    { field: 'ticket_count', label: 'Ticket Count', type: 'number' },
    { field: 'change_type', label: 'Change Type', type: 'string' },
  ],
  booking_cancelled: [
    { field: 'activity_name', label: 'Activity Name', type: 'string' },
    { field: 'product_name', label: 'Product Name', type: 'string' },
    { field: 'booking_id', label: 'Booking ID', type: 'number' },
    { field: 'confirmation_code', label: 'Confirmation Code', type: 'string' },
    { field: 'customer_name', label: 'Customer Name', type: 'string' },
    { field: 'customer_email', label: 'Customer Email', type: 'string' },
    { field: 'seller_name', label: 'Seller Name', type: 'string' },
    { field: 'pax_count', label: 'Pax Count', type: 'number' },
    { field: 'ticket_count', label: 'Ticket Count', type: 'number' },
    { field: 'travel_date', label: 'Travel Date', type: 'string' },
    { field: 'days_until_travel', label: 'Days Until Travel', type: 'number' },
    { field: 'has_uploaded_vouchers', label: 'Has Uploaded Vouchers', type: 'boolean' },
    { field: 'voucher_count', label: 'Voucher Count', type: 'number' },
    { field: 'total_price', label: 'Total Price', type: 'number' },
    { field: 'currency', label: 'Currency', type: 'string' },
  ],
  voucher_uploaded: [
    { field: 'category_name', label: 'Category Name', type: 'string' },
    { field: 'product_name', label: 'Product Name', type: 'string' },
    { field: 'ticket_count', label: 'Ticket Count', type: 'number' },
    { field: 'visit_date', label: 'Visit Date', type: 'date' },
    { field: 'is_placeholder', label: 'Is Placeholder', type: 'boolean' },
  ],
  voucher_deadline_approaching: [
    { field: 'category_name', label: 'Category Name', type: 'string' },
    { field: 'ticket_count', label: 'Ticket Count', type: 'number' },
    { field: 'days_until_deadline', label: 'Days Until Deadline', type: 'number' },
    { field: 'visit_date', label: 'Visit Date', type: 'date' },
  ],
  voucher_deadline_missed: [
    { field: 'category_name', label: 'Category Name', type: 'string' },
    { field: 'ticket_count', label: 'Ticket Count', type: 'number' },
    { field: 'days_overdue', label: 'Days Overdue', type: 'number' },
    { field: 'visit_date', label: 'Visit Date', type: 'date' },
  ],
  guide_assigned: [
    { field: 'guide_name', label: 'Guide Name', type: 'string' },
    { field: 'activity_name', label: 'Activity Name', type: 'string' },
    { field: 'slot_date', label: 'Slot Date', type: 'date' },
    { field: 'slot_time', label: 'Slot Time', type: 'string' },
    { field: 'is_planned_slot', label: 'Is Planned Slot', type: 'boolean' },
  ],
  escort_assigned: [
    { field: 'escort_name', label: 'Escort Name', type: 'string' },
    { field: 'activity_name', label: 'Activity Name', type: 'string' },
    { field: 'slot_date', label: 'Slot Date', type: 'date' },
    { field: 'slot_time', label: 'Slot Time', type: 'string' },
  ],
  assignment_removed: [
    { field: 'assignment_type', label: 'Assignment Type', type: 'string' },
    { field: 'person_name', label: 'Person Name', type: 'string' },
    { field: 'activity_name', label: 'Activity Name', type: 'string' },
  ],
  slot_missing_guide: [
    { field: 'activity_name', label: 'Activity Name', type: 'string' },
    { field: 'slot_date', label: 'Slot Date', type: 'date' },
    { field: 'slot_time', label: 'Slot Time', type: 'string' },
    { field: 'booking_count', label: 'Booking Count', type: 'number' },
    { field: 'participant_count', label: 'Participant Count', type: 'number' },
    { field: 'days_until_slot', label: 'Days Until Slot', type: 'number' },
  ],
  slot_placeholder_guide: [
    { field: 'activity_name', label: 'Activity Name', type: 'string' },
    { field: 'slot_date', label: 'Slot Date', type: 'date' },
    { field: 'slot_time', label: 'Slot Time', type: 'string' },
    { field: 'guide_name', label: 'Guide Name', type: 'string' },
    { field: 'booking_count', label: 'Booking Count', type: 'number' },
    { field: 'participant_count', label: 'Participant Count', type: 'number' },
    { field: 'days_until_slot', label: 'Days Until Slot', type: 'number' },
  ],
  age_mismatch: [
    { field: 'severity', label: 'Severity', type: 'string' },
    { field: 'mismatch_count', label: 'Mismatch Count', type: 'number' },
    { field: 'product_name', label: 'Product Name', type: 'string' },
    { field: 'booking_id', label: 'Booking ID', type: 'number' },
  ],
  sync_failure: [
    { field: 'product_id', label: 'Product ID', type: 'string' },
    { field: 'error_type', label: 'Error Type', type: 'string' },
    { field: 'status_code', label: 'Status Code', type: 'number' },
  ],
}

// Operators available for conditions
export const OPERATORS = {
  // Universal
  equals: { label: '=', types: ['string', 'number', 'boolean'] },
  not_equals: { label: '≠', types: ['string', 'number', 'boolean'] },
  // String
  contains: { label: 'contains', types: ['string'] },
  not_contains: { label: "doesn't contain", types: ['string'] },
  starts_with: { label: 'starts with', types: ['string'] },
  ends_with: { label: 'ends with', types: ['string'] },
  // Number
  greater_than: { label: '>', types: ['number'] },
  less_than: { label: '<', types: ['number'] },
  greater_or_equal: { label: '>=', types: ['number'] },
  less_or_equal: { label: '<=', types: ['number'] },
  // Boolean
  is_true: { label: 'is true', types: ['boolean'], noValue: true },
  is_false: { label: 'is false', types: ['boolean'], noValue: true },
  // Empty checks
  is_empty: { label: 'is empty', types: ['string'], noValue: true },
  is_not_empty: { label: 'is not empty', types: ['string'], noValue: true },
}

/**
 * Get available fields for a trigger event
 */
export function getFieldsForTrigger(trigger: string) {
  return TRIGGER_FIELDS[trigger] || []
}

/**
 * Get operators available for a field type
 */
export function getOperatorsForType(fieldType: string) {
  return Object.entries(OPERATORS)
    .filter(([, config]) => config.types.includes(fieldType))
    .map(([key, config]) => ({ value: key, label: config.label, noValue: 'noValue' in config }))
}
