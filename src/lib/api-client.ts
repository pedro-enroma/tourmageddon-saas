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
}

export interface TicketTypeMapping {
  id: string
  ticket_type: string
  category_id: string
  activity_id?: string
  booked_titles?: string[]
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
  created_at: string
}

export const notificationsApi = {
  list: () => apiRequest<BookingNotification[]>('/api/notifications'),
  update: (notification: Partial<BookingNotification>) =>
    apiRequest<BookingNotification>('/api/notifications', 'PUT', notification),
  create: (notification: Partial<BookingNotification>) =>
    apiRequest<BookingNotification>('/api/notifications', 'POST', notification),
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
  template_type: 'guide' | 'escort' | 'headphone'
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
  template_type: 'guide' | 'escort' | 'headphone'
  created_at: string
  // Joined fields
  template?: EmailTemplate
}

export const activityTemplatesApi = {
  list: (activity_id?: string) => {
    const params = activity_id ? `?activity_id=${activity_id}` : ''
    return apiRequest<ActivityTemplateAssignment[]>(`/api/content/activity-templates${params}`)
  },
  create: (assignment: { activity_id: string; template_id: string; template_type: 'guide' | 'escort' | 'headphone' }) =>
    apiRequest<ActivityTemplateAssignment>('/api/content/activity-templates', 'POST', assignment),
  delete: (activity_id: string, template_type: string) =>
    apiRequest(`/api/content/activity-templates?activity_id=${activity_id}&template_type=${template_type}`, 'DELETE'),
}
