/**
 * API Client for making authenticated requests to server-side API routes.
 * Use this instead of direct Supabase calls for write operations.
 */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  success?: boolean
}

async function apiRequest<T = unknown>(
  endpoint: string,
  method: HttpMethod = 'GET',
  body?: unknown
): Promise<ApiResponse<T>> {
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for auth
    }

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(endpoint, options)
    const result = await response.json()

    if (!response.ok) {
      return { error: result.error || `Request failed with status ${response.status}` }
    }

    return result
  } catch (err) {
    console.error('API request error:', err)
    return { error: err instanceof Error ? err.message : 'Unknown error occurred' }
  }
}

// ============================================
// GUIDES API
// ============================================
export interface Guide {
  guide_id: string
  first_name: string
  last_name: string
  email: string
  phone_number?: string
  license_number?: string
  languages: string[]
  active: boolean
  paid_in_cash?: boolean
  uses_app?: boolean
  user_id?: string | null
  created_at?: string
}

export const guidesApi = {
  list: () => apiRequest<Guide[]>('/api/guides'),
  create: (guide: Partial<Guide>) => apiRequest<Guide>('/api/guides', 'POST', guide),
  update: (guide: Partial<Guide>) => apiRequest<Guide>('/api/guides', 'PUT', guide),
  delete: (guide_id: string) => apiRequest(`/api/guides?guide_id=${guide_id}`, 'DELETE'),
}

// ============================================
// ESCORTS API
// ============================================
export interface Escort {
  escort_id: string
  first_name: string
  last_name: string
  email: string
  phone_number?: string
  license_number?: string
  languages: string[]
  active: boolean
  uses_app?: boolean
  user_id?: string | null
  created_at?: string
}

export const escortsApi = {
  list: () => apiRequest<Escort[]>('/api/escorts'),
  create: (escort: Partial<Escort>) => apiRequest<Escort>('/api/escorts', 'POST', escort),
  update: (escort: Partial<Escort>) => apiRequest<Escort>('/api/escorts', 'PUT', escort),
  delete: (escort_id: string) => apiRequest(`/api/escorts?escort_id=${escort_id}`, 'DELETE'),
}

// ============================================
// HEADPHONES API
// ============================================
export interface Headphone {
  headphone_id: string
  name: string
  email?: string
  phone_number?: string
  active: boolean
  created_at?: string
  updated_at?: string
}

export const headphonesApi = {
  list: () => apiRequest<Headphone[]>('/api/headphones'),
  create: (headphone: Partial<Headphone>) => apiRequest<Headphone>('/api/headphones', 'POST', headphone),
  update: (headphone: Partial<Headphone>) => apiRequest<Headphone>('/api/headphones', 'PUT', headphone),
  delete: (headphone_id: string) => apiRequest(`/api/headphones?headphone_id=${headphone_id}`, 'DELETE'),
}

// ============================================
// PRINTING API
// ============================================
export interface Printing {
  printing_id: string
  name: string
  email?: string
  phone_number?: string
  active: boolean
  created_at?: string
  updated_at?: string
}

export const printingApi = {
  list: () => apiRequest<Printing[]>('/api/printing'),
  create: (printing: Partial<Printing>) => apiRequest<Printing>('/api/printing', 'POST', printing),
  update: (printing: Partial<Printing>) => apiRequest<Printing>('/api/printing', 'PUT', printing),
  delete: (printing_id: string) => apiRequest(`/api/printing?printing_id=${printing_id}`, 'DELETE'),
}

// ============================================
// ASSIGNMENTS API
// ============================================
export interface GuideAssignment {
  id?: string
  guide_id: string
  activity_booking_id: string
  assigned_at?: string
}

export interface EscortAssignment {
  id?: string
  escort_id: string
  activity_booking_id: string
  assigned_at?: string
}

export const assignmentsApi = {
  guides: {
    create: (assignment: Partial<GuideAssignment>) =>
      apiRequest<GuideAssignment>('/api/assignments/guides', 'POST', assignment),
    delete: (id: string) =>
      apiRequest(`/api/assignments/guides?id=${id}`, 'DELETE'),
  },
  escorts: {
    create: (assignment: Partial<EscortAssignment>) =>
      apiRequest<EscortAssignment>('/api/assignments/escorts', 'POST', assignment),
    delete: (id: string) =>
      apiRequest(`/api/assignments/escorts?id=${id}`, 'DELETE'),
  },
}

// ============================================
// CALENDAR SETTINGS API
// ============================================
export interface CalendarSetting {
  setting_key: string
  setting_value: unknown
}

export const calendarSettingsApi = {
  update: (setting_key: string, setting_value: unknown) =>
    apiRequest<CalendarSetting>('/api/calendar-settings', 'PUT', { setting_key, setting_value }),
}

// ============================================
// AVAILABILITY ASSIGNMENTS API
// ============================================
export const availabilityAssignmentsApi = {
  create: (activity_availability_id: number, guide_ids?: string[], escort_ids?: string[]) =>
    apiRequest('/api/assignments/availability', 'POST', { activity_availability_id, guide_ids, escort_ids }),
  delete: (activity_availability_id: number, guide_ids?: string[], escort_ids?: string[]) => {
    const params = new URLSearchParams()
    params.append('activity_availability_id', String(activity_availability_id))
    if (guide_ids && guide_ids.length > 0) params.append('guide_ids', guide_ids.join(','))
    if (escort_ids && escort_ids.length > 0) params.append('escort_ids', escort_ids.join(','))
    return apiRequest(`/api/assignments/availability?${params.toString()}`, 'DELETE')
  },
}

// ============================================
// VOUCHERS API
// ============================================
export interface Voucher {
  id: string
  filename: string
  file_path: string
  uploaded_at: string
  status: string
}

export const vouchersApi = {
  create: (voucher: FormData) => {
    // Special handling for file uploads
    return fetch('/api/vouchers', {
      method: 'POST',
      body: voucher,
      credentials: 'include',
    }).then(res => res.json())
  },
  delete: (id: string) => apiRequest(`/api/vouchers?id=${id}`, 'DELETE'),
}

// ============================================
// TICKET CATEGORIES API
// ============================================
export interface TicketCategory {
  id: string
  name: string
  description?: string
  product_names?: string[]
  guide_requires_ticket: boolean
  skip_name_check?: boolean
  extraction_mode?: 'per_ticket' | 'booking_level' | 'per_person_type'
  ticket_class?: 'entrance' | 'transport' | 'other'
  default_source?: 'b2c' | 'b2b' | 'auto'
  b2b_indicator_text?: string
  b2b_price_adjustment?: number
  partner_id?: string
  short_code?: string
  display_order?: number
  name_deadline_days_b2c?: number | null  // Days before visit_date when final names must be submitted (B2C)
  name_deadline_days_b2b?: number | null  // Days before visit_date when final names must be submitted (B2B)
  created_at?: string
}

export const ticketCategoriesApi = {
  list: () => apiRequest<TicketCategory[]>('/api/tickets/categories'),
  create: (category: Partial<TicketCategory>) =>
    apiRequest<TicketCategory>('/api/tickets/categories', 'POST', category),
  update: (category: Partial<TicketCategory>) =>
    apiRequest<TicketCategory>('/api/tickets/categories', 'PUT', category),
  delete: (id: string) =>
    apiRequest(`/api/tickets/categories?id=${id}`, 'DELETE'),
}

// ============================================
// MAPPINGS API
// ============================================
export interface ProductActivityMapping {
  id?: string
  product_name: string
  activity_id: string
  category_id: string
  ticket_source?: 'b2c' | 'b2b'
}

export interface TicketTypeMapping {
  id: string
  ticket_type: string
  category_id: string
  activity_id?: string
  booked_titles?: string[]
  price?: number
}

export const mappingsApi = {
  productActivity: {
    list: () => apiRequest<ProductActivityMapping[]>('/api/mappings/product-activity'),
    create: (mapping: Partial<ProductActivityMapping>) =>
      apiRequest<ProductActivityMapping>('/api/mappings/product-activity', 'POST', mapping),
    delete: (id: string) =>
      apiRequest(`/api/mappings/product-activity?id=${id}`, 'DELETE'),
  },
  ticketType: {
    list: () => apiRequest<TicketTypeMapping[]>('/api/mappings/ticket-type'),
    create: (mapping: Partial<TicketTypeMapping>) =>
      apiRequest<TicketTypeMapping>('/api/mappings/ticket-type', 'POST', mapping),
    update: (mapping: Partial<TicketTypeMapping>) =>
      apiRequest<TicketTypeMapping>('/api/mappings/ticket-type', 'PUT', mapping),
    delete: (id: string) =>
      apiRequest(`/api/mappings/ticket-type?id=${id}`, 'DELETE'),
  },
}

// ============================================
// NOTIFICATIONS API
// ============================================
export interface BookingNotification {
  id: string
  activity_booking_id: string
  notification_type: string
  message: string
  is_read: boolean
  is_resolved: boolean
  resolved_at?: string
  resolved_by?: string
  remind_at?: string
  created_at: string
}

export interface SwapLogEntry {
  id: string
  activity_booking_id: number
  participant_id: number
  original_booked_title: string
  corrected_booked_title: string
  passenger_name: string
  passenger_dob: string | null
  calculated_age: number | null
  reason: string | null
  created_at: string
}

export const notificationsApi = {
  list: (filter?: 'all' | 'unread' | 'unresolved') => {
    const params = new URLSearchParams()
    if (filter === 'unread') params.set('unread_only', 'true')
    if (filter === 'unresolved') params.set('unresolved_only', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return apiRequest<BookingNotification[]>(`/api/notifications${query}`)
  },
  update: (notification: Partial<BookingNotification>) =>
    apiRequest<BookingNotification>('/api/notifications', 'PUT', notification),
  create: (notification: Partial<BookingNotification>) =>
    apiRequest<BookingNotification>('/api/notifications', 'POST', notification),
  listSwapLog: () => apiRequest<SwapLogEntry[]>('/api/notifications/swap-log'),
}

// ============================================
// ATTACHMENTS API
// ============================================
export const attachmentsApi = {
  upload: (formData: FormData) => {
    return fetch('/api/attachments', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }).then(res => res.json())
  },
  delete: (id: string, filePath: string) =>
    apiRequest(`/api/attachments?id=${id}&file_path=${encodeURIComponent(filePath)}`, 'DELETE'),
}

// ============================================
// TOUR GROUPS API
// ============================================
export interface TourGroup {
  id: string
  name: string
  tour_ids: string[]
  created_at?: string
  updated_at?: string
}

export const tourGroupsApi = {
  list: () => apiRequest<TourGroup[]>('/api/tour-groups'),
  create: (group: Partial<TourGroup>) =>
    apiRequest<TourGroup>('/api/tour-groups', 'POST', group),
  update: (group: Partial<TourGroup>) =>
    apiRequest<TourGroup>('/api/tour-groups', 'PUT', group),
  delete: (id: string) =>
    apiRequest(`/api/tour-groups?id=${id}`, 'DELETE'),
}

// ============================================
// CONTENT API (Templates & Meeting Points)
// ============================================
export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  template_type: 'guide' | 'escort' | 'headphone' | 'printing'
  is_default: boolean
  created_at: string
}

export interface MeetingPoint {
  id: string
  name: string
  description?: string | null
  address?: string | null
  google_maps_url?: string | null
  instructions?: string | null
  created_at?: string
}

export interface ActivityMeetingPoint {
  id: string
  activity_id: string
  meeting_point_id: string
  is_default: boolean
}

export const contentApi = {
  templates: {
    list: () => apiRequest<EmailTemplate[]>('/api/content/templates'),
    create: (template: Partial<EmailTemplate> & { is_default?: boolean }) =>
      apiRequest<EmailTemplate>('/api/content/templates', 'POST', template),
    update: (template: Partial<EmailTemplate> & { is_default?: boolean }) =>
      apiRequest<EmailTemplate>('/api/content/templates', 'PUT', template),
    delete: (id: string) =>
      apiRequest(`/api/content/templates?id=${id}`, 'DELETE'),
  },
  meetingPoints: {
    create: (point: Partial<MeetingPoint>) =>
      apiRequest<MeetingPoint>('/api/content/meeting-points', 'POST', point),
    update: (point: Partial<MeetingPoint>) =>
      apiRequest<MeetingPoint>('/api/content/meeting-points', 'PUT', point),
    delete: (id: string) =>
      apiRequest(`/api/content/meeting-points?id=${id}`, 'DELETE'),
  },
  activityMeetingPoints: {
    create: (assignment: { activity_id: string; meeting_point_id: string; is_default?: boolean }) =>
      apiRequest<ActivityMeetingPoint>('/api/content/activity-meeting-points', 'POST', assignment),
    update: (assignment: { activity_id: string; meeting_point_id: string; is_default: boolean; unset_others?: boolean }) =>
      apiRequest<ActivityMeetingPoint>('/api/content/activity-meeting-points', 'PUT', assignment),
    delete: (id: string) =>
      apiRequest(`/api/content/activity-meeting-points?id=${id}`, 'DELETE'),
  },
}

// ============================================
// BOOKING SWAP LOG API
// ============================================
export interface BookingSwapLog {
  id: string
  activity_booking_id: string
  from_participant: string
  to_participant: string
  reason?: string
  created_at: string
}

export const swapLogApi = {
  create: (log: Partial<BookingSwapLog>) =>
    apiRequest<BookingSwapLog>('/api/bookings/swap-log', 'POST', log),
  delete: (id: string) =>
    apiRequest(`/api/bookings/swap-log?id=${id}`, 'DELETE'),
}

// ============================================
// USERS API
// ============================================
export interface AppUser {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'editor' | 'viewer'
  is_active: boolean
  mfa_enabled: boolean
  created_at: string
  last_login_at?: string
}

export const usersApi = {
  list: () => apiRequest<AppUser[]>('/api/users'),
  // Invite a new user - sends email with password setup link
  create: (user: { email: string; full_name: string; role: string }) =>
    apiRequest<{ data: AppUser; message: string }>('/api/users', 'POST', user),
  update: (id: string, user: Partial<AppUser>) =>
    apiRequest<AppUser>('/api/users', 'PUT', { id, ...user }),
  delete: (id: string) =>
    apiRequest(`/api/users?id=${id}`, 'DELETE'),
}

// ============================================
// AUDIT LOGS API
// ============================================
export interface AuditLog {
  id: string
  user_id: string
  user_email: string
  action: string
  entity_type: string
  entity_id: string
  changes: { old?: unknown; new?: unknown }
  ip_address: string
  created_at: string
}

export const auditLogsApi = {
  list: (params?: {
    user_id?: string
    action?: string
    entity_type?: string
    from_date?: string
    to_date?: string
    limit?: number
    offset?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value))
        }
      })
    }
    const query = searchParams.toString()
    return apiRequest<{ data: AuditLog[]; total: number }>(`/api/audit-logs${query ? `?${query}` : ''}`)
  },
}

// ============================================
// MFA API
// ============================================
export const mfaApi = {
  enroll: () => apiRequest<{ qr_code: string; secret: string; factorId: string }>('/api/auth/mfa/enroll', 'POST'),
  verify: (factorId: string, challengeId: string, code: string) =>
    apiRequest('/api/auth/mfa/verify', 'POST', { factorId, challengeId, code }),
  unenroll: (factorId: string) =>
    apiRequest('/api/auth/mfa/unenroll', 'POST', { factorId }),
}

// ============================================
// ACTIVITY TEMPLATE ASSIGNMENTS API
// ============================================
export interface ActivityTemplateAssignment {
  id: string
  activity_id: string
  template_id: string
  template_type: 'guide' | 'escort' | 'headphone' | 'printing'
  created_at: string
  // Joined fields
  template?: EmailTemplate
}

export const activityTemplatesApi = {
  list: (activity_id?: string) => {
    const params = activity_id ? `?activity_id=${activity_id}` : ''
    return apiRequest<ActivityTemplateAssignment[]>(`/api/content/activity-templates${params}`)
  },
  create: (assignment: { activity_id: string; template_id: string; template_type: 'guide' | 'escort' | 'headphone' | 'printing' }) =>
    apiRequest<ActivityTemplateAssignment>('/api/content/activity-templates', 'POST', assignment),
  delete: (activity_id: string, template_type: string) =>
    apiRequest(`/api/content/activity-templates?activity_id=${activity_id}&template_type=${template_type}`, 'DELETE'),
}

// ============================================
// RESOURCE COSTS API
// ============================================
export interface GuideActivityCost {
  id: string
  guide_id: string
  activity_id: string
  cost_amount: number
  currency: string
  effective_from?: string
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface ResourceRate {
  id: string
  resource_type: 'escort' | 'headphone' | 'printing'
  resource_id: string
  rate_type: 'daily' | 'per_pax'
  rate_amount: number
  currency: string
  notes?: string
  created_at?: string
  updated_at?: string
}

export interface AssignmentCostOverride {
  id: string
  assignment_type: 'guide' | 'escort' | 'headphone' | 'printing'
  assignment_id: string
  override_amount: number
  currency: string
  reason?: string
  created_by?: string
  created_at?: string
}

export interface GuideServiceGroupMember {
  id: string
  group_id: string
  guide_assignment_id: string
  pax_count: number
  individual_cost: number
  created_at?: string
}

export interface GuideServiceGroup {
  id: string
  guide_id: string
  service_date: string
  service_time: string
  primary_assignment_id?: string
  total_pax: number
  calculated_cost: number
  currency: string
  notes?: string
  created_at?: string
  updated_at?: string
  guide_service_group_members?: GuideServiceGroupMember[]
}

export const guideActivityCostsApi = {
  list: (guide_id?: string, activity_id?: string) => {
    const params = new URLSearchParams()
    if (guide_id) params.append('guide_id', guide_id)
    if (activity_id) params.append('activity_id', activity_id)
    const query = params.toString()
    return apiRequest<GuideActivityCost[]>(`/api/costs/guide-activity-costs${query ? `?${query}` : ''}`)
  },
  create: (cost: Partial<GuideActivityCost>) =>
    apiRequest<GuideActivityCost>('/api/costs/guide-activity-costs', 'POST', cost),
  update: (cost: Partial<GuideActivityCost>) =>
    apiRequest<GuideActivityCost>('/api/costs/guide-activity-costs', 'PUT', cost),
  delete: (id: string) =>
    apiRequest(`/api/costs/guide-activity-costs?id=${id}`, 'DELETE'),
}

export const resourceRatesApi = {
  list: (resource_type?: string, resource_id?: string) => {
    const params = new URLSearchParams()
    if (resource_type) params.append('resource_type', resource_type)
    if (resource_id) params.append('resource_id', resource_id)
    const query = params.toString()
    return apiRequest<ResourceRate[]>(`/api/costs/resource-rates${query ? `?${query}` : ''}`)
  },
  create: (rate: Partial<ResourceRate>) =>
    apiRequest<ResourceRate>('/api/costs/resource-rates', 'POST', rate),
  update: (rate: Partial<ResourceRate>) =>
    apiRequest<ResourceRate>('/api/costs/resource-rates', 'PUT', rate),
  delete: (id: string) =>
    apiRequest(`/api/costs/resource-rates?id=${id}`, 'DELETE'),
}

export const assignmentOverridesApi = {
  list: (assignment_type?: string, assignment_id?: string) => {
    const params = new URLSearchParams()
    if (assignment_type) params.append('assignment_type', assignment_type)
    if (assignment_id) params.append('assignment_id', assignment_id)
    const query = params.toString()
    return apiRequest<AssignmentCostOverride[]>(`/api/costs/assignment-overrides${query ? `?${query}` : ''}`)
  },
  create: (override: Partial<AssignmentCostOverride>) =>
    apiRequest<AssignmentCostOverride>('/api/costs/assignment-overrides', 'POST', override),
  delete: (id?: string, assignment_type?: string, assignment_id?: string) => {
    const params = new URLSearchParams()
    if (id) params.append('id', id)
    if (assignment_type) params.append('assignment_type', assignment_type)
    if (assignment_id) params.append('assignment_id', assignment_id)
    return apiRequest(`/api/costs/assignment-overrides?${params.toString()}`, 'DELETE')
  },
}

export const serviceGroupsApi = {
  list: (guide_id?: string, start_date?: string, end_date?: string) => {
    const params = new URLSearchParams()
    if (guide_id) params.append('guide_id', guide_id)
    if (start_date) params.append('start_date', start_date)
    if (end_date) params.append('end_date', end_date)
    const query = params.toString()
    return apiRequest<GuideServiceGroup[]>(`/api/costs/service-groups${query ? `?${query}` : ''}`)
  },
  create: (group: { guide_id: string; service_date: string; service_time: string; assignment_ids: string[]; notes?: string }) =>
    apiRequest<GuideServiceGroup>('/api/costs/service-groups', 'POST', group),
  update: (group: { id: string; assignment_ids?: string[]; notes?: string }) =>
    apiRequest<GuideServiceGroup>('/api/costs/service-groups', 'PUT', group),
  delete: (id: string) =>
    apiRequest(`/api/costs/service-groups?id=${id}`, 'DELETE'),
}

// ============================================
// COST REPORTS API
// ============================================
export interface CostReportItem {
  resource_type: 'guide' | 'escort' | 'headphone' | 'printing'
  resource_id: string
  resource_name: string
  date: string
  activity_id?: string
  activity_title?: string
  assignment_id: string
  pax_count?: number
  cost_amount: number
  currency: string
  is_grouped?: boolean
  group_id?: string
}

export interface CostReportSummary {
  key: string
  label: string
  total_cost: number
  count: number
  total_pax: number
}

export interface CostReportResponse {
  items: CostReportItem[]
  summaries: CostReportSummary[]
  total_cost: number
  currency: string
  date_range: { start_date: string; end_date: string }
  group_by: string
}

export interface ProfitabilityItem {
  key: string
  label: string
  revenue: number
  guide_costs: number
  escort_costs: number
  headphone_costs: number
  printing_costs: number
  total_costs: number
  profit: number
  margin: number
  booking_count: number
  pax_count: number
}

export interface ProfitabilityTotals {
  revenue: number
  guide_costs: number
  escort_costs: number
  headphone_costs: number
  printing_costs: number
  total_costs: number
  profit: number
  margin: number
  booking_count: number
  pax_count: number
}

export interface ProfitabilityReportResponse {
  items: ProfitabilityItem[]
  totals: ProfitabilityTotals
  currency: string
  date_range: { start_date: string; end_date: string }
  group_by: string
}

export const costReportsApi = {
  resourceCosts: (params: {
    start_date: string
    end_date: string
    resource_types?: string[]
    group_by?: 'staff' | 'date' | 'activity'
  }) => {
    const searchParams = new URLSearchParams()
    searchParams.append('start_date', params.start_date)
    searchParams.append('end_date', params.end_date)
    if (params.resource_types) searchParams.append('resource_types', params.resource_types.join(','))
    if (params.group_by) searchParams.append('group_by', params.group_by)
    return apiRequest<CostReportResponse>(`/api/reports/resource-costs?${searchParams.toString()}`)
  },
  profitability: (params: {
    start_date: string
    end_date: string
    group_by?: 'activity' | 'date' | 'booking'
  }) => {
    const searchParams = new URLSearchParams()
    searchParams.append('start_date', params.start_date)
    searchParams.append('end_date', params.end_date)
    if (params.group_by) searchParams.append('group_by', params.group_by)
    return apiRequest<ProfitabilityReportResponse>(`/api/reports/profitability?${searchParams.toString()}`)
  },
}

// ============================================
// PARTNERS API
// ============================================
export interface Partner {
  partner_id: string
  name: string
  email: string
  phone_number?: string
  active: boolean
  notes?: string
  available_times?: string[] // e.g., ['09:00', '10:00', '11:00', '12:00']
  created_at?: string
  updated_at?: string
}

export const partnersApi = {
  list: () => apiRequest<Partner[]>('/api/partners'),
  create: (partner: Partial<Partner>) => apiRequest<Partner>('/api/partners', 'POST', partner),
  update: (partner: Partial<Partner>) => apiRequest<Partner>('/api/partners', 'PUT', partner),
  delete: (partner_id: string) => apiRequest(`/api/partners?partner_id=${partner_id}`, 'DELETE'),
}

// ============================================
// VOUCHER REQUESTS API
// ============================================
export type VoucherRequestStatus = 'draft' | 'sent' | 'fulfilled' | 'cancelled'

export interface VoucherRequestCustomer {
  first_name: string
  last_name: string
  pax_count: number
}

export interface VoucherRequest {
  id: string
  activity_availability_id: number
  ticket_category_id: string
  partner_id: string
  requested_quantity: number
  visit_date: string
  entry_time?: string
  activity_name: string
  customer_names: VoucherRequestCustomer[]
  total_pax: number
  status: VoucherRequestStatus
  sent_at?: string
  sent_by?: string
  fulfilled_at?: string
  fulfilled_voucher_ids?: string[]
  cancelled_at?: string
  cancellation_reason?: string
  request_pdf_path?: string
  notes?: string
  created_at?: string
  created_by?: string
  // Joined relations
  partners?: Partner
  ticket_categories?: TicketCategory
}

export const voucherRequestsApi = {
  list: (params?: {
    status?: VoucherRequestStatus
    activity_availability_id?: number
    partner_id?: string
    date_from?: string
    date_to?: string
  }) => {
    const searchParams = new URLSearchParams()
    if (params) {
      if (params.status) searchParams.append('status', params.status)
      if (params.activity_availability_id) searchParams.append('activity_availability_id', String(params.activity_availability_id))
      if (params.partner_id) searchParams.append('partner_id', params.partner_id)
      if (params.date_from) searchParams.append('date_from', params.date_from)
      if (params.date_to) searchParams.append('date_to', params.date_to)
    }
    const query = searchParams.toString()
    return apiRequest<VoucherRequest[]>(`/api/voucher-requests${query ? `?${query}` : ''}`)
  },
  create: (request: Partial<VoucherRequest>) =>
    apiRequest<VoucherRequest>('/api/voucher-requests', 'POST', request),
  update: (request: Partial<VoucherRequest>) =>
    apiRequest<VoucherRequest>('/api/voucher-requests', 'PUT', request),
  delete: (id: string) =>
    apiRequest(`/api/voucher-requests?id=${id}`, 'DELETE'),
  send: (id: string) =>
    apiRequest<{ success: boolean; message: string; data: VoucherRequest }>(`/api/voucher-requests/${id}/send`, 'POST'),
  fulfill: (id: string, voucher_ids?: string[]) =>
    apiRequest<{ success: boolean; message: string; data: VoucherRequest }>(`/api/voucher-requests/${id}/fulfill`, 'POST', { voucher_ids }),
  cancel: (id: string, reason?: string) =>
    apiRequest<{ success: boolean; message: string; data: VoucherRequest }>(`/api/voucher-requests/${id}/cancel`, 'POST', { reason }),
}
