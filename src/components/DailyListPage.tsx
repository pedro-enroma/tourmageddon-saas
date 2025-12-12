/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { attachmentsApi } from '@/lib/api-client'
import { Download, ChevronDown, Search, X, GripVertical, ChevronRight, User, UserCheck, Paperclip, Upload, Mail, Send, Loader2, MapPin, Ticket, FileText, Headphones, Printer, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx-js-style'

// Excluded pricing categories for specific activities
const EXCLUDED_PRICING_CATEGORIES: Record<string, string[]> = {
  '217949': ['6 a 12 años', '13 a 17 años'],
  '216954': ['6 a 12 años', '13 a 17 años'],
  '220107': ['6 a 12 años', '13 a 17 años']
}

// Activities where ONLY specific pricing category IDs are allowed (by pricing_category_id)
const ALLOWED_ONLY_PRICING_CATEGORY_IDS: Record<string, string[]> = {
  '901961': ['780302', '815525', '281494']
}

// Helper function to check if a pricing category should be excluded
const shouldExcludePricingCategory = (activityId: string, categoryTitle: string, pricingCategoryId?: string): boolean => {
  // First check if this activity has an "allowed only" list by pricing_category_id
  const allowedOnlyIds = ALLOWED_ONLY_PRICING_CATEGORY_IDS[activityId]
  if (allowedOnlyIds && pricingCategoryId) {
    return !allowedOnlyIds.includes(pricingCategoryId)
  }

  // Then check the exclusion list by category title
  const excludedCategories = EXCLUDED_PRICING_CATEGORIES[activityId]
  return excludedCategories ? excludedCategories.includes(categoryTitle) : false
}
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"

interface PaxData {
  activity_id: string
  activity_title: string
  booking_date: string
  start_time: string
  booking_id: number
  activity_booking_id: number
  total_participants: number
  participants_detail: string
  passengers: {
    pricing_category_id?: string
    booked_title: string
    first_name: string | null
    last_name: string | null
    date_of_birth: string | null
    quantity: number
  }[]
  customer?: {
    first_name: string | null
    last_name: string | null
    phone_number: string | null
  }
}

interface TimeSlotGroup {
  time: string
  bookings: PaxData[]
  totalParticipants: number
}

interface TourGroup {
  tourTitle: string
  timeSlots: TimeSlotGroup[]
  totalParticipants: number
  isExpanded: boolean
}

interface Person {
  id: string
  first_name: string
  last_name: string
  email?: string
  phone_number?: string
}

interface StaffAssignment {
  activityAvailabilityId: number
  activityId: string
  localTime: string
  guides: Person[]
  escorts: Person[]
  headphones: Person[]
  printing: Person[]
}

interface Attachment {
  id: string
  file_name: string
  file_path: string
  activity_availability_id: number
}

interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  is_default: boolean
}

interface ConsolidatedEmailTemplate {
  id: string
  name: string
  subject: string
  body: string
  service_item_template: string | null
  template_type: 'guide_consolidated' | 'escort_consolidated' | 'headphone_consolidated' | 'printing_consolidated'
  is_default: boolean
}

interface EmailLog {
  id: string
  recipient_email: string
  recipient_name: string | null
  recipient_type: 'guide' | 'escort' | 'headphone' | 'printing' | null
  subject: string
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed'
  error_message: string | null
  sent_at: string
}

interface MeetingPoint {
  id: string
  name: string
  description: string | null
  address: string | null
  google_maps_url: string | null
  instructions: string | null
}

interface VoucherInfo {
  id: string
  booking_number: string
  total_tickets: number
  product_name: string
  category_name: string | null
  pdf_path: string | null
  entry_time: string | null
}

export default function DailyListPage() {
  const [data, setData] = useState<PaxData[]>([])
  const [groupedTours, setGroupedTours] = useState<TourGroup[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [selectedActivities, setSelectedActivities] = useState<string[]>([])
  const [tempSelectedActivities, setTempSelectedActivities] = useState<string[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })

  // Staff assignments and attachments
  const [staffAssignments, setStaffAssignments] = useState<Map<number, StaffAssignment>>(new Map())
  const [attachments, setAttachments] = useState<Attachment[]>([])

  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailTimeSlot, setEmailTimeSlot] = useState<{ tourTitle: string; time: string; activityId: string; availabilityId: number } | null>(null)
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([])
  const [includeAttachments, setIncludeAttachments] = useState(true)
  const [includeDailyList, setIncludeDailyList] = useState(true)
  const [includeVouchers, setIncludeVouchers] = useState(true)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  // Bulk email state
  const [sendingBulkGuides, setSendingBulkGuides] = useState(false)
  const [sendingBulkEscorts, setSendingBulkEscorts] = useState(false)
  const [sendingBulkHeadphones, setSendingBulkHeadphones] = useState(false)
  const [sendingBulkPrinting, setSendingBulkPrinting] = useState(false)
  const [bulkEmailProgress, setBulkEmailProgress] = useState<{ sent: number; total: number } | null>(null)

  // Bulk email drawer state
  const [showBulkEmailDrawer, setShowBulkEmailDrawer] = useState(false)
  const [bulkEmailType, setBulkEmailType] = useState<'guides' | 'escorts' | 'headphones' | 'printing'>('guides')
  const [bulkSelectedRecipients, setBulkSelectedRecipients] = useState<Set<string>>(new Set())
  const [includeMeetingPoint, setIncludeMeetingPoint] = useState(true)

  // Meeting points data (activity_id -> meeting point)
  const [activityMeetingPoints, setActivityMeetingPoints] = useState<Map<string, MeetingPoint>>(new Map())

  // Email logs state
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  // Vouchers state (activity_availability_id -> vouchers)
  const [slotVouchers, setSlotVouchers] = useState<Map<number, VoucherInfo[]>>(new Map())

  // Consolidated email templates
  const [consolidatedTemplates, setConsolidatedTemplates] = useState<ConsolidatedEmailTemplate[]>([])

  // Activity guide templates (activity_id -> template)
  const [activityGuideTemplates, setActivityGuideTemplates] = useState<Map<string, EmailTemplate>>(new Map())

  // Activities missing guide templates (for validation warning)
  const [activitiesWithoutGuideTemplates, setActivitiesWithoutGuideTemplates] = useState<string[]>([])

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingFor, setUploadingFor] = useState<number | null>(null)

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Memoize filtered activities to avoid recomputation on every render
  const filteredActivities = useMemo(() =>
    activities.filter(a => a.title.toLowerCase().includes(searchTerm.toLowerCase())),
    [activities, searchTerm]
  )

  const filteredActivityIds = useMemo(() =>
    filteredActivities.map(a => a.activity_id),
    [filteredActivities]
  )

  useEffect(() => {
    loadActivitiesAndFetchData()
    fetchEmailTemplates()
    fetchConsolidatedTemplates()
    fetchActivityGuideTemplates()
  }, [])

  // Fetch email templates
  const fetchEmailTemplates = async () => {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    if (!error && data) {
      setEmailTemplates(data)
    }
  }

  // Fetch consolidated email templates
  const fetchConsolidatedTemplates = async () => {
    try {
      const response = await fetch('/api/content/consolidated-templates')
      const result = await response.json()
      if (response.ok && result.data) {
        setConsolidatedTemplates(result.data)
      }
    } catch (err) {
      console.error('Error fetching consolidated templates:', err)
    }
  }

  // Fetch activity guide templates (for bulk guide emails)
  const fetchActivityGuideTemplates = async () => {
    try {
      const response = await fetch('/api/content/activity-templates')
      const result = await response.json()
      if (response.ok && result.data) {
        const templateMap = new Map<string, EmailTemplate>()
        for (const assignment of result.data) {
          // Only include guide templates
          if (assignment.template_type === 'guide' && assignment.template) {
            templateMap.set(assignment.activity_id, assignment.template)
          }
        }
        setActivityGuideTemplates(templateMap)
      }
    } catch (err) {
      console.error('Error fetching activity guide templates:', err)
    }
  }

  // Fetch meeting points for all activities
  const fetchMeetingPoints = async (activityIds: string[]) => {
    if (activityIds.length === 0) return

    const { data, error } = await supabase
      .from('activity_meeting_points')
      .select(`
        activity_id,
        meeting_point_id,
        is_default,
        meeting_points (
          id,
          name,
          description,
          address,
          google_maps_url,
          instructions
        )
      `)
      .in('activity_id', activityIds)

    if (!error && data) {
      const meetingPointsMap = new Map<string, MeetingPoint>()
      for (const item of data) {
        const activityId = item.activity_id as string
        const isDefault = item.is_default as boolean
        // Supabase returns the joined record - handle as unknown first
        const mp = item.meeting_points as unknown as MeetingPoint | null
        // Use the default meeting point for each activity, or the first one
        if (mp && (!meetingPointsMap.has(activityId) || isDefault)) {
          meetingPointsMap.set(activityId, mp)
        }
      }
      setActivityMeetingPoints(meetingPointsMap)
    }
  }

  // Fetch email logs for the selected date via API (to bypass RLS)
  const fetchEmailLogs = async (dateStr: string) => {
    setLoadingLogs(true)
    try {
      const response = await fetch(`/api/email/logs?date=${dateStr}`)
      const result = await response.json()

      if (response.ok && result.data) {
        setEmailLogs(result.data)
      }
    } catch (err) {
      console.error('Error fetching email logs:', err)
    } finally {
      setLoadingLogs(false)
    }
  }

  // Fetch staff assignments for all activity availabilities on the selected date
  const fetchStaffAndAttachments = async (dateStr: string, activityIds: string[]) => {
    if (activityIds.length === 0) return

    // Fetch activity availabilities for the date
    const { data: availabilities } = await supabase
      .from('activity_availability')
      .select('id, activity_id, local_time')
      .eq('local_date', dateStr)
      .in('activity_id', activityIds)
      .gt('vacancy_sold', 0)

    if (!availabilities || availabilities.length === 0) {
      setStaffAssignments(new Map())
      setAttachments([])
      return
    }

    const availabilityIds = availabilities.map(a => a.id)

    // Fetch guide assignments
    // Fetch all assignments via API (to bypass RLS)
    let guideAssignments: { activity_availability_id: number; guide: { guide_id: string; first_name: string; last_name: string; email?: string } }[] = []
    let escortAssignments: { activity_availability_id: number; escort: { escort_id: string; first_name: string; last_name: string; email?: string } }[] = []
    let headphoneAssignments: { activity_availability_id: number; headphone: { headphone_id: string; name: string; email?: string; phone_number?: string } }[] = []
    let printingAssignments: { activity_availability_id: number; printing: { printing_id: string; name: string; email?: string; phone_number?: string } }[] = []

    if (availabilityIds.length > 0) {
      const assignmentsResponse = await fetch(`/api/assignments/availability/list?availability_ids=${availabilityIds.join(',')}`, {
        credentials: 'include'
      })
      const assignmentsResult = await assignmentsResponse.json()
      if (assignmentsResult.data) {
        guideAssignments = assignmentsResult.data.guides || []
        escortAssignments = assignmentsResult.data.escorts || []
        headphoneAssignments = assignmentsResult.data.headphones || []
        printingAssignments = assignmentsResult.data.printing || []
      }
    }

    // Fetch attachments
    const { data: attachmentsData } = await supabase
      .from('service_attachments')
      .select('id, activity_availability_id, file_name, file_path')
      .in('activity_availability_id', availabilityIds)

    setAttachments(attachmentsData || [])

    // Build staff assignments map
    const staffMap = new Map<number, StaffAssignment>()

    availabilities.forEach(avail => {
      staffMap.set(avail.id, {
        activityAvailabilityId: avail.id,
        activityId: avail.activity_id,
        localTime: avail.local_time,
        guides: [],
        escorts: [],
        headphones: [],
        printing: []
      })
    })

    guideAssignments?.forEach(ga => {
      const guide = Array.isArray(ga.guide) ? ga.guide[0] : ga.guide
      if (guide && staffMap.has(ga.activity_availability_id)) {
        staffMap.get(ga.activity_availability_id)!.guides.push({
          id: guide.guide_id,
          first_name: guide.first_name,
          last_name: guide.last_name,
          email: guide.email,
          phone_number: guide.phone_number
        })
      }
    })

    escortAssignments?.forEach(ea => {
      const escort = Array.isArray(ea.escort) ? ea.escort[0] : ea.escort
      if (escort && staffMap.has(ea.activity_availability_id)) {
        staffMap.get(ea.activity_availability_id)!.escorts.push({
          id: escort.escort_id,
          first_name: escort.first_name,
          last_name: escort.last_name,
          email: escort.email,
          phone_number: escort.phone_number
        })
      }
    })

    headphoneAssignments?.forEach(ha => {
      const headphone = Array.isArray(ha.headphone) ? ha.headphone[0] : ha.headphone
      if (headphone && staffMap.has(ha.activity_availability_id)) {
        staffMap.get(ha.activity_availability_id)!.headphones.push({
          id: headphone.headphone_id,
          first_name: headphone.name,
          last_name: '',
          email: headphone.email,
          phone_number: headphone.phone_number
        })
      }
    })

    printingAssignments?.forEach(pa => {
      const printing = Array.isArray(pa.printing) ? pa.printing[0] : pa.printing
      if (printing && staffMap.has(pa.activity_availability_id)) {
        staffMap.get(pa.activity_availability_id)!.printing.push({
          id: printing.printing_id,
          first_name: printing.name,
          last_name: '',
          email: printing.email,
          phone_number: printing.phone_number
        })
      }
    })

    setStaffAssignments(staffMap)
  }

  // Fetch vouchers assigned to time slots on the selected date
  const fetchVouchers = async (dateStr: string) => {
    try {
      const { data: vouchers, error } = await supabase
        .from('vouchers')
        .select(`
          id,
          booking_number,
          total_tickets,
          product_name,
          pdf_path,
          entry_time,
          activity_availability_id,
          ticket_categories (id, name)
        `)
        .eq('visit_date', dateStr)
        .not('activity_availability_id', 'is', null)

      if (error) {
        console.error('Error fetching vouchers:', error)
        return
      }

      // Group vouchers by activity_availability_id
      const vouchersMap = new Map<number, VoucherInfo[]>()
      vouchers?.forEach(v => {
        if (v.activity_availability_id) {
          const existingVouchers = vouchersMap.get(v.activity_availability_id) || []
          existingVouchers.push({
            id: v.id,
            booking_number: v.booking_number,
            total_tickets: v.total_tickets,
            product_name: v.product_name,
            category_name: Array.isArray(v.ticket_categories)
              ? (v.ticket_categories[0] as { id: string; name: string } | undefined)?.name || null
              : (v.ticket_categories as { id: string; name: string } | null)?.name || null,
            pdf_path: v.pdf_path,
            entry_time: v.entry_time || null
          })
          vouchersMap.set(v.activity_availability_id, existingVouchers)
        }
      })
      setSlotVouchers(vouchersMap)
    } catch (err) {
      console.error('Error fetching vouchers:', err)
    }
  }

  // Get availability ID for a time slot
  const getAvailabilityId = async (activityId: string, dateStr: string, time: string): Promise<number | null> => {
    // Normalize time to HH:MM:SS format (local_time in DB is stored as HH:MM:SS)
    const normalizedTime = time.length === 5 ? `${time}:00` : time

    const { data } = await supabase
      .from('activity_availability')
      .select('id')
      .eq('activity_id', activityId)
      .eq('local_date', dateStr)
      .eq('local_time', normalizedTime)
      .single()

    return data?.id || null
  }

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, availabilityId: number) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setUploadingFor(availabilityId)

    try {
      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf') continue

        // Use API to upload file
        const formData = new FormData()
        formData.append('file', file)
        formData.append('activity_availability_id', String(availabilityId))

        const result = await attachmentsApi.upload(formData)
        if (result.error) {
          console.error('Upload error:', result.error)
          continue
        }
      }

      // Refresh attachments
      await fetchStaffAndAttachments(selectedDate, selectedActivities)
    } catch (err) {
      console.error('Error uploading:', err)
    } finally {
      setUploadingFor(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Delete attachment
  const handleDeleteAttachment = async (attachment: Attachment) => {
    if (!confirm(`Delete ${attachment.file_name}?`)) return

    const result = await attachmentsApi.delete(attachment.id, attachment.file_path)
    if (result.error) {
      console.error('Delete error:', result.error)
    }
    await fetchStaffAndAttachments(selectedDate, selectedActivities)
  }

  // Generate daily list Excel for email (identical styling to export button)
  const generateDailyListExcel = async (tour: TourGroup, timeSlot: TimeSlotGroup, guideName?: string): Promise<{ data: string; fileName: string } | null> => {
    try {
      const firstBooking = timeSlot.bookings[0]
      if (!firstBooking) return null

      const participantCategories = await getAllParticipantCategoriesForActivity(firstBooking.activity_id)
      const bookingDate = new Date(firstBooking.booking_date).toLocaleDateString('it-IT')

      const excelData: any[][] = []
      const titleHeader = `${tour.tourTitle} - ${bookingDate} - ${timeSlot.time}`
      excelData.push([titleHeader])

      const headers = ['Data', 'Ora', ...participantCategories, 'Nome e Cognome', 'Telefono']
      excelData.push(headers)

      const totals: { [key: string]: number } = {}
      participantCategories.forEach(cat => totals[cat] = 0)

      timeSlot.bookings.forEach(booking => {
        const fullName = `${booking.customer?.first_name || ''} ${booking.customer?.last_name || ''}`.trim()
        const participantCounts = getParticipantCounts(booking)

        const row: any[] = [
          new Date(booking.booking_date).toLocaleDateString('it-IT'),
          booking.start_time
        ]

        participantCategories.forEach(category => {
          const count = participantCounts[category] || 0
          row.push(count)
          totals[category] += count
        })

        row.push(fullName)
        row.push(booking.customer?.phone_number || '')
        excelData.push(row)
      })

      const participantsRow: any[] = ['', 'Participants']
      participantCategories.forEach(category => participantsRow.push(totals[category]))
      participantsRow.push('', '')
      excelData.push(participantsRow)

      const totalParticipants = participantCategories.reduce((sum, cat) => sum + totals[cat], 0)
      const totalPaxRow: any[] = ['', 'TOTAL PAX', totalParticipants]
      for (let i = 0; i < participantCategories.length - 1; i++) totalPaxRow.push('')
      // Add guide label and name at the end
      totalPaxRow.push('guide')
      totalPaxRow.push(guideName || '')
      excelData.push(totalPaxRow)

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(excelData)

      // Merge title cells
      if (!ws['!merges']) ws['!merges'] = []
      ws['!merges'].push({
        s: { r: 0, c: 0 },
        e: { r: 0, c: participantCategories.length + 3 }
      })

      // Style the cells (same as export button)
      const totalCols = participantCategories.length + 4 // Data, Ora, categories, Nome, Telefono

      // Apply style to title row (merged cell) - blue background, white text, 18pt
      for (let col = 0; col < totalCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
        ws[cellAddress].s = {
          font: { bold: true, sz: 18, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4472C4" } },
          alignment: { horizontal: "center", vertical: "center" }
        }
      }

      // Style header row (Row 2) - bold and light gray background
      for (let col = 0; col < totalCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col })
        const cell = ws[cellAddress]
        if (cell) {
          cell.s = {
            font: { bold: true, sz: 13 },
            fill: { fgColor: { rgb: "D9D9D9" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }
      }

      // Style the Participants and TOTAL PAX rows
      const participantsRowIndex = 2 + timeSlot.bookings.length
      const totalPaxRowIndex = participantsRowIndex + 1

      // Style Participants row - light gray background, bold
      for (let col = 0; col < totalCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: participantsRowIndex, c: col })
        const cell = ws[cellAddress]
        if (cell) {
          cell.s = {
            font: { bold: true, sz: 13 },
            fill: { fgColor: { rgb: "D9D9D9" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }
      }

      // Style TOTAL PAX row - blue background, white text
      for (let col = 0; col < totalCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: totalPaxRowIndex, c: col })
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
        ws[cellAddress].s = {
          font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4472C4" } },
          alignment: { horizontal: "center", vertical: "center" }
        }
      }

      // Style data rows (booking rows) with font size 13
      for (let row = 2; row < 2 + timeSlot.bookings.length; row++) {
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
          const cell = ws[cellAddress]
          if (cell) {
            cell.s = {
              font: { sz: 13 },
              alignment: { horizontal: "center", vertical: "center" }
            }
          }
        }
      }

      // Set row heights
      if (!ws['!rows']) ws['!rows'] = []
      ws['!rows'][0] = { hpt: 30 } // Title row height
      ws['!rows'][1] = { hpt: 20 } // Header row height

      // Set column widths
      const colWidths = [
        { wch: 12 }, // Data
        { wch: 8 },  // Ora
        ...participantCategories.map(() => ({ wch: 15 })), // Participant columns
        { wch: 25 }, // Nome e Cognome
        { wch: 20 }, // Telefono
      ]
      ws['!cols'] = colWidths

      XLSX.utils.book_append_sheet(wb, ws, 'Lista')

      const buffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
      const cleanTourTitle = tour.tourTitle.replace(/[/\\?%*:|"<>]/g, '-')
      const cleanTime = timeSlot.time.replace(/:/g, '.')

      return {
        data: buffer,
        fileName: `${cleanTourTitle} + ${bookingDate} + ${cleanTime}.xlsx`
      }
    } catch (err) {
      console.error('Error generating daily list:', err)
      return null
    }
  }

  // Apply template variables
  const applyTemplateVariables = (
    text: string,
    tourTitle: string,
    dateStr: string,
    time: string,
    paxCount: number,
    staff?: StaffAssignment | null,
    activityId?: string,
    availabilityId?: number,
    bookings?: PaxData[]
  ) => {
    // Get staff info
    const hasGuide = staff?.guides && staff.guides.length > 0
    const hasEscort = staff?.escorts && staff.escorts.length > 0
    const hasHeadphone = staff?.headphones && staff.headphones.length > 0

    // Format guide info
    const guideNames = staff?.guides.map(g => `${g.first_name} ${g.last_name}`).join(', ') || ''
    const guidePhones = staff?.guides.map(g => g.phone_number).filter(Boolean).join(', ') || ''
    // Format as "Name1 Phone1, Name2 Phone2" for multiple guides
    const guideList = staff?.guides.map(g => `${g.first_name} ${g.last_name}${g.phone_number ? ' ' + g.phone_number : ''}`).join(', ') || ''

    // Format escort info - as "Name1 Phone1, Name2 Phone2" for multiple escorts
    const escortNames = staff?.escorts.map(e => `${e.first_name} ${e.last_name}`).join(', ') || ''
    const escortPhones = staff?.escorts.map(e => e.phone_number).filter(Boolean).join(', ') || ''
    const escortList = staff?.escorts.map(e => `${e.first_name} ${e.last_name}${e.phone_number ? ' ' + e.phone_number : ''}`).join(', ') || ''

    // Format headphone info
    const headphoneNames = staff?.headphones.map(h => `${h.first_name} ${h.last_name}`).join(', ') || ''
    const headphonePhones = staff?.headphones.map(h => h.phone_number).filter(Boolean).join(', ') || ''
    const headphoneList = staff?.headphones.map(h => `${h.first_name} ${h.last_name}${h.phone_number ? ' ' + h.phone_number : ''}`).join(', ') || ''

    // Get meeting point
    const meetingPoint = activityId ? activityMeetingPoints.get(activityId) : null
    const meetingPointText = meetingPoint?.address || meetingPoint?.name || ''

    // Get entry time from vouchers for this time slot
    const vouchersForSlot = availabilityId ? slotVouchers.get(availabilityId) || [] : []
    const entryTimeValue = vouchersForSlot.find(v => v.entry_time)?.entry_time?.substring(0, 5) || ''

    // Calculate pax types breakdown from bookings (e.g., "5 Adulto, 3 Niño, 2 Gratuito")
    let paxTypesText = ''
    if (bookings && bookings.length > 0) {
      const paxTypeCounts: { [type: string]: number } = {}
      bookings.forEach(booking => {
        booking.passengers?.forEach(p => {
          const typeName = p.booked_title || 'Unknown'
          paxTypeCounts[typeName] = (paxTypeCounts[typeName] || 0) + 1
        })
      })
      paxTypesText = Object.entries(paxTypeCounts)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ')
    }

    // Calculate ticket types breakdown from vouchers (e.g., "10 Intero, 3 Ridotto, 2 Gratuito")
    let ticketTypesText = ''
    if (vouchersForSlot.length > 0) {
      const ticketTypeCounts: { [type: string]: number } = {}
      vouchersForSlot.forEach(voucher => {
        const typeName = voucher.category_name || 'Standard'
        ticketTypeCounts[typeName] = (ticketTypeCounts[typeName] || 0) + voucher.total_tickets
      })
      ticketTypesText = Object.entries(ticketTypeCounts)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ')
    }

    let result = text
      .replace(/\{\{tour_title\}\}/g, tourTitle)
      .replace(/\{\{date\}\}/g, format(new Date(dateStr), 'dd/MM/yyyy'))
      .replace(/\{\{time\}\}/g, time.substring(0, 5))
      .replace(/\{\{entry_time\}\}/g, entryTimeValue)
      .replace(/\{\{pax_count\}\}/g, String(paxCount))
      .replace(/\{\{pax_types\}\}/g, paxTypesText)
      .replace(/\{\{ticket_types\}\}/g, ticketTypesText)
      .replace(/\{\{meeting_point\}\}/g, meetingPointText)
      .replace(/\{\{guide_name\}\}/g, guideNames)
      .replace(/\{\{guide_phone\}\}/g, guidePhones)
      .replace(/\{\{guide_list\}\}/g, guideList)
      .replace(/\{\{escort_name\}\}/g, escortNames)
      .replace(/\{\{escort_phone\}\}/g, escortPhones)
      .replace(/\{\{escort_list\}\}/g, escortList)
      .replace(/\{\{headphone_name\}\}/g, headphoneNames)
      .replace(/\{\{headphone_phone\}\}/g, headphonePhones)
      .replace(/\{\{headphone_list\}\}/g, headphoneList)

    // Handle conditional guide block - show content only if guide is assigned
    if (hasGuide) {
      result = result.replace(/\{\{#if_guide\}\}/g, '').replace(/\{\{\/if_guide\}\}/g, '')
    } else {
      result = result.replace(/\{\{#if_guide\}\}[\s\S]*?\{\{\/if_guide\}\}/g, '')
    }

    // Handle conditional escort block - show content only if escort is assigned
    if (hasEscort) {
      result = result.replace(/\{\{#if_escort\}\}/g, '').replace(/\{\{\/if_escort\}\}/g, '')
    } else {
      result = result.replace(/\{\{#if_escort\}\}[\s\S]*?\{\{\/if_escort\}\}/g, '')
    }

    // Handle conditional headphone block - show content only if headphone is assigned
    if (hasHeadphone) {
      result = result.replace(/\{\{#if_headphone\}\}/g, '').replace(/\{\{\/if_headphone\}\}/g, '')
    } else {
      result = result.replace(/\{\{#if_headphone\}\}[\s\S]*?\{\{\/if_headphone\}\}/g, '')
    }

    return result
  }

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)
    if (!templateId || !emailTimeSlot) return

    const template = emailTemplates.find(t => t.id === templateId)
    const tour = groupedTours.find(t => t.tourTitle === emailTimeSlot.tourTitle)
    const timeSlot = tour?.timeSlots.find(ts => ts.time === emailTimeSlot.time)
    const staff = staffAssignments.get(emailTimeSlot.availabilityId)

    if (template && timeSlot) {
      setEmailSubject(applyTemplateVariables(template.subject, emailTimeSlot.tourTitle, selectedDate, emailTimeSlot.time, timeSlot.totalParticipants, staff, emailTimeSlot.activityId, emailTimeSlot.availabilityId, timeSlot.bookings))
      setEmailBody(applyTemplateVariables(template.body, emailTimeSlot.tourTitle, selectedDate, emailTimeSlot.time, timeSlot.totalParticipants, staff, emailTimeSlot.activityId, emailTimeSlot.availabilityId, timeSlot.bookings))
    }
  }

  // Open email modal
  const openEmailModal = async (tour: TourGroup, timeSlot: TimeSlotGroup) => {
    const firstBooking = timeSlot.bookings[0]
    if (!firstBooking) return

    const availabilityId = await getAvailabilityId(firstBooking.activity_id, firstBooking.booking_date, timeSlot.time)
    if (!availabilityId) {
      alert('Could not find availability for this time slot')
      return
    }

    const staff = staffAssignments.get(availabilityId)

    setEmailTimeSlot({
      tourTitle: tour.tourTitle,
      time: timeSlot.time,
      activityId: firstBooking.activity_id,
      availabilityId
    })

    // Find default template
    const defaultTemplate = emailTemplates.find(t => t.is_default) || emailTemplates[0]
    if (defaultTemplate) {
      setSelectedTemplateId(defaultTemplate.id)
      setEmailSubject(applyTemplateVariables(defaultTemplate.subject, tour.tourTitle, selectedDate, timeSlot.time, timeSlot.totalParticipants, staff, firstBooking.activity_id, availabilityId, timeSlot.bookings))
      setEmailBody(applyTemplateVariables(defaultTemplate.body, tour.tourTitle, selectedDate, timeSlot.time, timeSlot.totalParticipants, staff, firstBooking.activity_id, availabilityId, timeSlot.bookings))
    } else {
      setSelectedTemplateId('')
      setEmailSubject(`Service Assignment: ${tour.tourTitle} - ${format(new Date(selectedDate), 'MMM d, yyyy')} at ${timeSlot.time.substring(0, 5)}`)
      setEmailBody(`Hello {{name}},\n\nYou have been assigned to:\n\n**Activity:** ${tour.tourTitle}\n**Date:** ${format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')}\n**Time:** ${timeSlot.time.substring(0, 5)}\n**Participants:** ${timeSlot.totalParticipants} pax\n\nBest regards,\nEnRoma.com Team`)
    }

    // Pre-select only guides with emails (this modal is for guides only)
    const recipients: string[] = []
    staff?.guides.forEach(g => { if (g.email) recipients.push(`guide:${g.id}`) })
    setSelectedRecipients(recipients)

    setIncludeAttachments(true)
    setIncludeDailyList(true)
    setEmailSuccess(null)
    setEmailError(null)
    setShowEmailModal(true)
  }

  // Toggle recipient
  const toggleRecipient = (key: string) => {
    setSelectedRecipients(prev => prev.includes(key) ? prev.filter(r => r !== key) : [...prev, key])
  }

  // Send email
  const handleSendEmail = async () => {
    if (!emailTimeSlot || selectedRecipients.length === 0) return

    setSendingEmail(true)
    setEmailError(null)

    try {
      const staff = staffAssignments.get(emailTimeSlot.availabilityId)
      const recipients: { email: string; name: string; type: 'guide' | 'escort' | 'headphone'; id: string }[] = []

      selectedRecipients.forEach(key => {
        const [type, id] = key.split(':')
        if (type === 'guide') {
          const guide = staff?.guides.find(g => g.id === id)
          if (guide?.email) {
            recipients.push({ email: guide.email, name: `${guide.first_name} ${guide.last_name}`, type: 'guide', id: guide.id })
          }
        } else if (type === 'escort') {
          const escort = staff?.escorts.find(e => e.id === id)
          if (escort?.email) {
            recipients.push({ email: escort.email, name: `${escort.first_name} ${escort.last_name}`, type: 'escort', id: escort.id })
          }
        } else if (type === 'headphone') {
          const headphone = staff?.headphones.find(h => h.id === id)
          if (headphone?.email) {
            recipients.push({ email: headphone.email, name: `${headphone.first_name} ${headphone.last_name}`, type: 'headphone', id: headphone.id })
          }
        }
      })

      if (recipients.length === 0) {
        setEmailError('No valid recipients with email addresses')
        return
      }

      // Get attachment URLs
      const slotAttachments = attachments.filter(a => a.activity_availability_id === emailTimeSlot.availabilityId)
      const attachmentUrls: string[] = includeAttachments ? slotAttachments.map(a => a.file_path) : []

      // Add voucher PDF URLs if enabled
      if (includeVouchers) {
        const vouchersForSlot = slotVouchers.get(emailTimeSlot.availabilityId) || []
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        console.log('[DEBUG] includeVouchers:', includeVouchers)
        console.log('[DEBUG] emailTimeSlot.availabilityId:', emailTimeSlot.availabilityId)
        console.log('[DEBUG] slotVouchers keys:', Array.from(slotVouchers.keys()))
        console.log('[DEBUG] vouchersForSlot:', vouchersForSlot)
        for (const voucher of vouchersForSlot) {
          if (voucher.pdf_path) {
            // Build public URL for the voucher PDF
            const pdfUrl = `${supabaseUrl}/storage/v1/object/public/ticket-vouchers/${voucher.pdf_path}`
            attachmentUrls.push(pdfUrl)
            console.log('[DEBUG] Added voucher URL:', pdfUrl)
          }
        }
      }
      console.log('[DEBUG] Final attachmentUrls:', attachmentUrls)

      // Generate daily list
      let dailyListData: string | undefined
      let dailyListFileName: string | undefined

      if (includeDailyList) {
        const tour = groupedTours.find(t => t.tourTitle === emailTimeSlot.tourTitle)
        const timeSlot = tour?.timeSlots.find(ts => ts.time === emailTimeSlot.time)
        if (tour && timeSlot) {
          // Get guide name for the Excel
          const guideNames = staff?.guides.map(g => `${g.first_name} ${g.last_name}`).join(', ') || ''
          const dailyList = await generateDailyListExcel(tour, timeSlot, guideNames)
          if (dailyList) {
            dailyListData = dailyList.data
            dailyListFileName = dailyList.fileName
          }
        }
      }

      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients,
          subject: emailSubject,
          body: emailBody,
          activityAvailabilityId: emailTimeSlot.availabilityId,
          attachmentUrls,
          dailyListData,
          dailyListFileName,
          serviceDate: selectedDate
        })
      })

      const result = await response.json()

      if (!response.ok) {
        const errorMsg = result.debug ? `${result.error} ${result.debug}` : result.error
        throw new Error(errorMsg || 'Failed to send emails')
      }

      setEmailSuccess(`Successfully sent ${result.sent} email(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`)

      setTimeout(() => {
        setShowEmailModal(false)
        setEmailTimeSlot(null)
      }, 2000)
    } catch (err) {
      console.error('Error sending email:', err)
      setEmailError(err instanceof Error ? err.message : 'Failed to send emails')
    } finally {
      setSendingEmail(false)
    }
  }

  // Generate consolidated Excel for escort with all their services
  // Each service is formatted as a separate styled table (same as guide Excel)
  const generateConsolidatedEscortExcel = async (
    escortName: string,
    services: { tour: TourGroup; timeSlot: TimeSlotGroup; guideName: string }[]
  ): Promise<{ data: string; fileName: string } | null> => {
    try {
      if (services.length === 0) return null

      const excelData: any[][] = []
      const dateStr = format(new Date(selectedDate), 'dd/MM/yyyy')

      // Track row positions for styling
      interface ServiceRowInfo {
        titleRow: number
        headerRow: number
        dataStartRow: number
        dataEndRow: number
        participantsRow: number
        totalPaxRow: number
        totalCols: number
      }
      const serviceRowInfos: ServiceRowInfo[] = []

      let maxCols = 6 // Minimum columns

      // Main title for the consolidated file
      excelData.push([`Services for ${escortName} - ${dateStr}`])
      excelData.push([]) // Empty row after main title

      let currentRow = 2 // Start after main title and empty row

      for (let i = 0; i < services.length; i++) {
        const { tour, timeSlot, guideName } = services[i]
        const firstBooking = timeSlot.bookings[0]
        if (!firstBooking) continue

        const participantCategories = await getAllParticipantCategoriesForActivity(firstBooking.activity_id)
        const totalCols = participantCategories.length + 4
        if (totalCols > maxCols) maxCols = totalCols

        const titleRowIdx = currentRow

        // Service title row (blue background like guide Excel)
        const bookingDate = new Date(firstBooking.booking_date).toLocaleDateString('it-IT')
        const serviceTitle = `${tour.tourTitle} - ${bookingDate} - ${timeSlot.time}`
        excelData.push([serviceTitle])
        currentRow++

        // Header row (gray background)
        const headerRowIdx = currentRow
        const headers = ['Data', 'Ora', ...participantCategories, 'Nome e Cognome', 'Telefono']
        excelData.push(headers)
        currentRow++

        // Data rows
        const dataStartRowIdx = currentRow
        const totals: { [key: string]: number } = {}
        participantCategories.forEach(cat => totals[cat] = 0)

        timeSlot.bookings.forEach(booking => {
          const fullName = `${booking.customer?.first_name || ''} ${booking.customer?.last_name || ''}`.trim()
          const participantCounts = getParticipantCounts(booking)

          const row: any[] = [
            new Date(booking.booking_date).toLocaleDateString('it-IT'),
            booking.start_time
          ]

          participantCategories.forEach(category => {
            const count = participantCounts[category] || 0
            row.push(count)
            totals[category] += count
          })

          row.push(fullName)
          row.push(booking.customer?.phone_number || '')
          excelData.push(row)
          currentRow++
        })
        const dataEndRowIdx = currentRow - 1

        // Participants row (gray background)
        const participantsRowIdx = currentRow
        const participantsRow: any[] = ['', 'Participants']
        participantCategories.forEach(category => participantsRow.push(totals[category]))
        participantsRow.push('', '')
        excelData.push(participantsRow)
        currentRow++

        // Total PAX row (blue background) with guide info
        const totalPaxRowIdx = currentRow
        const totalParticipants = participantCategories.reduce((sum, cat) => sum + totals[cat], 0)
        const totalPaxRow: any[] = ['', 'TOTAL PAX', totalParticipants]
        for (let j = 0; j < participantCategories.length - 1; j++) totalPaxRow.push('')
        totalPaxRow.push('guide')
        totalPaxRow.push(guideName)
        excelData.push(totalPaxRow)
        currentRow++

        // Store row info for styling
        serviceRowInfos.push({
          titleRow: titleRowIdx,
          headerRow: headerRowIdx,
          dataStartRow: dataStartRowIdx,
          dataEndRow: dataEndRowIdx,
          participantsRow: participantsRowIdx,
          totalPaxRow: totalPaxRowIdx,
          totalCols
        })

        // Add spacing between services
        if (i < services.length - 1) {
          excelData.push([])
          excelData.push([])
          currentRow += 2
        }
      }

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(excelData)
      if (!ws['!merges']) ws['!merges'] = []

      // Style the main consolidated title (row 0)
      for (let col = 0; col < maxCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
        ws[cellAddress].s = {
          font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "2563EB" } }, // Darker blue for main title
          alignment: { horizontal: "center", vertical: "center" }
        }
      }
      ws['!merges'].push({
        s: { r: 0, c: 0 },
        e: { r: 0, c: maxCols - 1 }
      })

      // Style each service section
      for (const info of serviceRowInfos) {
        const { titleRow, headerRow, dataStartRow, dataEndRow, participantsRow, totalPaxRow, totalCols } = info

        // Service title row - blue background, white text, 18pt (merged)
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: titleRow, c: col })
          if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
          ws[cellAddress].s = {
            font: { bold: true, sz: 18, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4472C4" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }
        ws['!merges'].push({
          s: { r: titleRow, c: 0 },
          e: { r: titleRow, c: totalCols - 1 }
        })

        // Header row - bold, gray background
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: col })
          const cell = ws[cellAddress]
          if (cell) {
            cell.s = {
              font: { bold: true, sz: 13 },
              fill: { fgColor: { rgb: "D9D9D9" } },
              alignment: { horizontal: "center", vertical: "center" }
            }
          }
        }

        // Data rows - font size 13, centered
        for (let row = dataStartRow; row <= dataEndRow; row++) {
          for (let col = 0; col < totalCols; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
            const cell = ws[cellAddress]
            if (cell) {
              cell.s = {
                font: { sz: 13 },
                alignment: { horizontal: "center", vertical: "center" }
              }
            }
          }
        }

        // Participants row - bold, gray background
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: participantsRow, c: col })
          const cell = ws[cellAddress]
          if (cell) {
            cell.s = {
              font: { bold: true, sz: 13 },
              fill: { fgColor: { rgb: "D9D9D9" } },
              alignment: { horizontal: "center", vertical: "center" }
            }
          }
        }

        // Total PAX row - blue background, white text
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: totalPaxRow, c: col })
          if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
          ws[cellAddress].s = {
            font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4472C4" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }
      }

      // Set column widths
      const colWidths = [
        { wch: 12 }, // Data
        { wch: 10 }, // Ora
        ...Array(maxCols - 4).fill({ wch: 15 }), // Participant columns
        { wch: 25 }, // Nome e Cognome
        { wch: 20 }, // Telefono
      ]
      ws['!cols'] = colWidths

      // Set row heights
      if (!ws['!rows']) ws['!rows'] = []
      ws['!rows'][0] = { hpt: 25 } // Main title
      for (const info of serviceRowInfos) {
        ws['!rows'][info.titleRow] = { hpt: 30 } // Service title row height
        ws['!rows'][info.headerRow] = { hpt: 20 } // Header row height
      }

      XLSX.utils.book_append_sheet(wb, ws, 'Services')

      const buffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })
      const cleanName = escortName.replace(/[/\\?%*:|"<>]/g, '-')
      const fileName = `Services_${cleanName}_${format(new Date(selectedDate), 'yyyy-MM-dd')}.xlsx`

      return { data: buffer, fileName }
    } catch (error) {
      console.error('Error generating consolidated Excel:', error)
      return null
    }
  }

  // Get all guides with email addresses for the drawer
  const getGuidesWithServices = () => {
    const guideServices = new Map<string, {
      guide: Person;
      services: { tour: TourGroup; timeSlot: TimeSlotGroup; availabilityId: number; escortNames: string[] }[]
    }>()

    // Track which availability IDs have been processed (matched to bookings)
    const processedAvailabilityIds = new Set<number>()

    // First pass: match staffAssignments to bookings in groupedTours
    for (const tour of groupedTours) {
      for (const timeSlot of tour.timeSlots) {
        const firstBooking = timeSlot.bookings[0]
        if (!firstBooking) continue

        const normalizeTime = (t: string) => t.substring(0, 5)
        const slotTimeNorm = normalizeTime(timeSlot.time)

        let availabilityId: number | null = null
        let assignedGuides: Person[] = []
        let assignedEscorts: Person[] = []

        for (const [id, staff] of staffAssignments.entries()) {
          const staffTimeNorm = normalizeTime(staff.localTime)
          if (staff.activityId === firstBooking.activity_id && staffTimeNorm === slotTimeNorm) {
            availabilityId = id
            assignedGuides = staff.guides
            assignedEscorts = staff.escorts
            processedAvailabilityIds.add(id)
            break
          }
        }

        if (!availabilityId) continue

        const escortNames = assignedEscorts.map(e => `${e.first_name} ${e.last_name}`)

        for (const guide of assignedGuides) {
          if (!guide.email) continue

          const key = guide.id
          if (!guideServices.has(key)) {
            guideServices.set(key, { guide, services: [] })
          }
          guideServices.get(key)!.services.push({
            tour,
            timeSlot,
            availabilityId,
            escortNames
          })
        }
      }
    }

    // Second pass: include guides from staffAssignments that don't have matching bookings
    // These are availabilities with vacancy_sold > 0 but no entries in activity_bookings
    for (const [id, staff] of staffAssignments.entries()) {
      if (processedAvailabilityIds.has(id)) continue
      if (staff.guides.length === 0) continue

      // Look up activity title from activities state
      const activity = activities.find(a => a.activity_id === staff.activityId)
      const activityTitle = activity?.title || `Activity ${staff.activityId}`

      // Create synthetic tour and timeSlot objects for this availability
      const syntheticTimeSlot: TimeSlotGroup = {
        time: staff.localTime.substring(0, 5),
        bookings: [{
          activity_booking_id: 0,
          booking_id: 0,
          activity_id: staff.activityId,
          activity_title: activityTitle,
          booking_date: selectedDate,
          start_time: staff.localTime.substring(0, 5),
          total_participants: 0,
          participants_detail: '',
          passengers: []
        }],
        totalParticipants: 0
      }

      const syntheticTour: TourGroup = {
        tourTitle: activityTitle,
        timeSlots: [syntheticTimeSlot],
        totalParticipants: 0,
        isExpanded: false
      }

      const escortNames = staff.escorts.map(e => `${e.first_name} ${e.last_name}`)

      for (const guide of staff.guides) {
        if (!guide.email) continue

        const key = guide.id
        if (!guideServices.has(key)) {
          guideServices.set(key, { guide, services: [] })
        }
        guideServices.get(key)!.services.push({
          tour: syntheticTour,
          timeSlot: syntheticTimeSlot,
          availabilityId: id,
          escortNames
        })
      }
    }

    return guideServices
  }

  // Get all escorts with email addresses for the drawer
  const getEscortsWithServices = () => {
    const escortServices = new Map<string, {
      escort: Person;
      services: { tour: TourGroup; timeSlot: TimeSlotGroup; availabilityId: number; guideName: string; guidePhone: string }[]
    }>()

    // Track which availability IDs have been processed
    const processedAvailabilityIds = new Set<number>()

    // First pass: match to bookings
    for (const tour of groupedTours) {
      for (const timeSlot of tour.timeSlots) {
        const firstBooking = timeSlot.bookings[0]
        if (!firstBooking) continue

        const normalizeTime = (t: string) => t.substring(0, 5)
        const slotTimeNorm = normalizeTime(timeSlot.time)

        let availabilityId: number | null = null
        let assignedGuides: Person[] = []
        let assignedEscorts: Person[] = []

        for (const [id, staff] of staffAssignments.entries()) {
          const staffTimeNorm = normalizeTime(staff.localTime)
          if (staff.activityId === firstBooking.activity_id && staffTimeNorm === slotTimeNorm) {
            availabilityId = id
            assignedGuides = staff.guides
            assignedEscorts = staff.escorts
            processedAvailabilityIds.add(id)
            break
          }
        }

        if (!availabilityId) continue

        const guideName = assignedGuides.map(g => `${g.first_name} ${g.last_name}`).join(', ')
        const guidePhone = assignedGuides.map(g => g.phone_number).filter(Boolean).join(', ')

        for (const escort of assignedEscorts) {
          if (!escort.email) continue

          const key = escort.id
          if (!escortServices.has(key)) {
            escortServices.set(key, { escort, services: [] })
          }
          escortServices.get(key)!.services.push({
            tour,
            timeSlot,
            availabilityId,
            guideName,
            guidePhone
          })
        }
      }
    }

    // Second pass: include escorts from unmatched staffAssignments
    for (const [id, staff] of staffAssignments.entries()) {
      if (processedAvailabilityIds.has(id)) continue
      if (staff.escorts.length === 0) continue

      const activity = activities.find(a => a.activity_id === staff.activityId)
      const activityTitle = activity?.title || `Activity ${staff.activityId}`

      const syntheticTimeSlot: TimeSlotGroup = {
        time: staff.localTime.substring(0, 5),
        bookings: [{
          activity_booking_id: 0,
          booking_id: 0,
          activity_id: staff.activityId,
          activity_title: activityTitle,
          booking_date: selectedDate,
          start_time: staff.localTime.substring(0, 5),
          total_participants: 0,
          participants_detail: '',
          passengers: []
        }],
        totalParticipants: 0
      }

      const syntheticTour: TourGroup = {
        tourTitle: activityTitle,
        timeSlots: [syntheticTimeSlot],
        totalParticipants: 0,
        isExpanded: false
      }

      const guideName = staff.guides.map(g => `${g.first_name} ${g.last_name}`).join(', ')
      const guidePhone = staff.guides.map(g => g.phone_number).filter(Boolean).join(', ')

      for (const escort of staff.escorts) {
        if (!escort.email) continue

        const key = escort.id
        if (!escortServices.has(key)) {
          escortServices.set(key, { escort, services: [] })
        }
        escortServices.get(key)!.services.push({
          tour: syntheticTour,
          timeSlot: syntheticTimeSlot,
          availabilityId: id,
          guideName,
          guidePhone
        })
      }
    }

    return escortServices
  }

  // Get all headphones with email addresses for the drawer
  const getHeadphonesWithServices = () => {
    const headphoneServices = new Map<string, {
      headphone: Person;
      services: { tour: TourGroup; timeSlot: TimeSlotGroup; availabilityId: number; guideName: string; guidePhone: string; escortNames: string[]; escortPhone: string }[]
    }>()

    // Track which availability IDs have been processed
    const processedAvailabilityIds = new Set<number>()

    // First pass: match to bookings
    for (const tour of groupedTours) {
      for (const timeSlot of tour.timeSlots) {
        const firstBooking = timeSlot.bookings[0]
        if (!firstBooking) continue

        const normalizeTime = (t: string) => t.substring(0, 5)
        const slotTimeNorm = normalizeTime(timeSlot.time)

        let availabilityId: number | null = null
        let assignedGuides: Person[] = []
        let assignedEscorts: Person[] = []
        let assignedHeadphones: Person[] = []

        for (const [id, staff] of staffAssignments.entries()) {
          const staffTimeNorm = normalizeTime(staff.localTime)
          if (staff.activityId === firstBooking.activity_id && staffTimeNorm === slotTimeNorm) {
            availabilityId = id
            assignedGuides = staff.guides
            assignedEscorts = staff.escorts
            assignedHeadphones = staff.headphones
            processedAvailabilityIds.add(id)
            break
          }
        }

        if (!availabilityId) continue

        const guideName = assignedGuides.map(g => `${g.first_name} ${g.last_name}`).join(', ')
        const guidePhone = assignedGuides.map(g => g.phone_number).filter(Boolean).join(', ')
        const escortNames = assignedEscorts.map(e => `${e.first_name} ${e.last_name}`)
        const escortPhone = assignedEscorts.map(e => e.phone_number).filter(Boolean).join(', ')

        for (const headphone of assignedHeadphones) {
          if (!headphone.email) continue

          const key = headphone.id
          if (!headphoneServices.has(key)) {
            headphoneServices.set(key, { headphone, services: [] })
          }
          headphoneServices.get(key)!.services.push({
            tour,
            timeSlot,
            availabilityId,
            guideName,
            guidePhone,
            escortNames,
            escortPhone
          })
        }
      }
    }

    // Second pass: include headphones from unmatched staffAssignments
    for (const [id, staff] of staffAssignments.entries()) {
      if (processedAvailabilityIds.has(id)) continue
      if (staff.headphones.length === 0) continue

      const activity = activities.find(a => a.activity_id === staff.activityId)
      const activityTitle = activity?.title || `Activity ${staff.activityId}`

      const syntheticTimeSlot: TimeSlotGroup = {
        time: staff.localTime.substring(0, 5),
        bookings: [{
          activity_booking_id: 0,
          booking_id: 0,
          activity_id: staff.activityId,
          activity_title: activityTitle,
          booking_date: selectedDate,
          start_time: staff.localTime.substring(0, 5),
          total_participants: 0,
          participants_detail: '',
          passengers: []
        }],
        totalParticipants: 0
      }

      const syntheticTour: TourGroup = {
        tourTitle: activityTitle,
        timeSlots: [syntheticTimeSlot],
        totalParticipants: 0,
        isExpanded: false
      }

      const guideName = staff.guides.map(g => `${g.first_name} ${g.last_name}`).join(', ')
      const guidePhone = staff.guides.map(g => g.phone_number).filter(Boolean).join(', ')
      const escortNames = staff.escorts.map(e => `${e.first_name} ${e.last_name}`)
      const escortPhone = staff.escorts.map(e => e.phone_number).filter(Boolean).join(', ')

      for (const headphone of staff.headphones) {
        if (!headphone.email) continue

        const key = headphone.id
        if (!headphoneServices.has(key)) {
          headphoneServices.set(key, { headphone, services: [] })
        }
        headphoneServices.get(key)!.services.push({
          tour: syntheticTour,
          timeSlot: syntheticTimeSlot,
          availabilityId: id,
          guideName,
          guidePhone,
          escortNames,
          escortPhone
        })
      }
    }

    return headphoneServices
  }

  // Open the bulk email drawer for guides
  const openBulkEmailDrawerForGuides = () => {
    const guideServices = getGuidesWithServices()
    if (guideServices.size === 0) {
      alert('No guides with email addresses assigned to any services')
      return
    }

    // Check for activities missing guide templates
    const activityIds = new Set<string>()
    for (const [, { services }] of guideServices.entries()) {
      for (const service of services) {
        const activityId = service.timeSlot.bookings[0]?.activity_id
        if (activityId) activityIds.add(activityId)
      }
    }

    const missingTemplates: string[] = []
    for (const activityId of activityIds) {
      if (!activityGuideTemplates.has(activityId)) {
        // Find activity title for user-friendly message
        const activityTitle = groupedTours.find(t =>
          t.timeSlots.some(ts => ts.bookings.some(b => b.activity_id === activityId))
        )?.tourTitle || activityId
        missingTemplates.push(activityTitle)
      }
    }
    setActivitiesWithoutGuideTemplates(missingTemplates)

    // Select all guides by default
    setBulkSelectedRecipients(new Set(guideServices.keys()))
    setBulkEmailType('guides')
    setShowBulkEmailDrawer(true)
  }

  // Open the bulk email drawer for escorts
  const openBulkEmailDrawerForEscorts = () => {
    const escortServices = getEscortsWithServices()
    if (escortServices.size === 0) {
      alert('No escorts with email addresses assigned to any services')
      return
    }
    // Select all escorts by default
    setBulkSelectedRecipients(new Set(escortServices.keys()))
    setBulkEmailType('escorts')
    setShowBulkEmailDrawer(true)
  }

  // Open the bulk email drawer for headphones
  const openBulkEmailDrawerForHeadphones = () => {
    const headphoneServices = getHeadphonesWithServices()
    if (headphoneServices.size === 0) {
      alert('No headphones with email addresses assigned to any services')
      return
    }
    // Select all headphones by default
    setBulkSelectedRecipients(new Set(headphoneServices.keys()))
    setBulkEmailType('headphones')
    setShowBulkEmailDrawer(true)
  }

  // Get all printing contacts with email addresses for the drawer
  const getPrintingWithServices = () => {
    const printingServices = new Map<string, {
      printing: Person;
      services: { tour: TourGroup; timeSlot: TimeSlotGroup; availabilityId: number; guideName: string; guidePhone: string; escortNames: string[]; escortPhone: string }[]
    }>()

    // Track which availability IDs have been processed
    const processedAvailabilityIds = new Set<number>()

    // First pass: match to bookings
    for (const tour of groupedTours) {
      for (const timeSlot of tour.timeSlots) {
        const firstBooking = timeSlot.bookings[0]
        if (!firstBooking) continue

        const normalizeTime = (t: string) => t.substring(0, 5)
        const slotTimeNorm = normalizeTime(timeSlot.time)

        let availabilityId: number | null = null
        let assignedGuides: Person[] = []
        let assignedEscorts: Person[] = []
        let assignedPrinting: Person[] = []

        for (const [id, staff] of staffAssignments.entries()) {
          const staffTimeNorm = normalizeTime(staff.localTime)
          if (staff.activityId === firstBooking.activity_id && staffTimeNorm === slotTimeNorm) {
            availabilityId = id
            assignedGuides = staff.guides
            assignedEscorts = staff.escorts
            assignedPrinting = staff.printing
            processedAvailabilityIds.add(id)
            break
          }
        }

        if (!availabilityId) continue

        const guideName = assignedGuides.map(g => `${g.first_name} ${g.last_name}`).join(', ')
        const guidePhone = assignedGuides.map(g => g.phone_number).filter(Boolean).join(', ')
        const escortNames = assignedEscorts.map(e => `${e.first_name} ${e.last_name}`)
        const escortPhone = assignedEscorts.map(e => e.phone_number).filter(Boolean).join(', ')

        for (const printing of assignedPrinting) {
          if (!printing.email) continue

          const key = printing.id
          if (!printingServices.has(key)) {
            printingServices.set(key, { printing, services: [] })
          }
          printingServices.get(key)!.services.push({
            tour,
            timeSlot,
            availabilityId,
            guideName,
            guidePhone,
            escortNames,
            escortPhone
          })
        }
      }
    }

    // Second pass: include printing from unmatched staffAssignments
    for (const [id, staff] of staffAssignments.entries()) {
      if (processedAvailabilityIds.has(id)) continue
      if (staff.printing.length === 0) continue

      const activity = activities.find(a => a.activity_id === staff.activityId)
      const activityTitle = activity?.title || `Activity ${staff.activityId}`

      const syntheticTimeSlot: TimeSlotGroup = {
        time: staff.localTime.substring(0, 5),
        bookings: [{
          activity_booking_id: 0,
          booking_id: 0,
          activity_id: staff.activityId,
          activity_title: activityTitle,
          booking_date: selectedDate,
          start_time: staff.localTime.substring(0, 5),
          total_participants: 0,
          participants_detail: '',
          passengers: []
        }],
        totalParticipants: 0
      }

      const syntheticTour: TourGroup = {
        tourTitle: activityTitle,
        timeSlots: [syntheticTimeSlot],
        totalParticipants: 0,
        isExpanded: false
      }

      const guideName = staff.guides.map(g => `${g.first_name} ${g.last_name}`).join(', ')
      const guidePhone = staff.guides.map(g => g.phone_number).filter(Boolean).join(', ')
      const escortNames = staff.escorts.map(e => `${e.first_name} ${e.last_name}`)
      const escortPhone = staff.escorts.map(e => e.phone_number).filter(Boolean).join(', ')

      for (const printing of staff.printing) {
        if (!printing.email) continue

        const key = printing.id
        if (!printingServices.has(key)) {
          printingServices.set(key, { printing, services: [] })
        }
        printingServices.get(key)!.services.push({
          tour: syntheticTour,
          timeSlot: syntheticTimeSlot,
          availabilityId: id,
          guideName,
          guidePhone,
          escortNames,
          escortPhone
        })
      }
    }

    return printingServices
  }

  // Open the bulk email drawer for printing
  const openBulkEmailDrawerForPrinting = () => {
    const printingServices = getPrintingWithServices()
    if (printingServices.size === 0) {
      alert('No printing contacts with email addresses assigned to any services')
      return
    }
    // Select all printing by default
    setBulkSelectedRecipients(new Set(printingServices.keys()))
    setBulkEmailType('printing')
    setShowBulkEmailDrawer(true)
  }

  // Toggle selection of a recipient
  const toggleRecipientSelection = (id: string) => {
    setBulkSelectedRecipients(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // Send bulk emails to selected guides using activity-specific templates
  const handleSendToSelectedGuides = async () => {
    if (bulkSelectedRecipients.size === 0) {
      alert('Please select at least one guide')
      return
    }

    // Double-check all activities have templates (should be blocked by UI but safety check)
    if (activitiesWithoutGuideTemplates.length > 0) {
      alert(`Cannot send emails. Missing templates for:\n${activitiesWithoutGuideTemplates.join('\n')}`)
      return
    }

    setShowBulkEmailDrawer(false)
    setSendingBulkGuides(true)
    setBulkEmailProgress({ sent: 0, total: bulkSelectedRecipients.size })

    const guideServices = getGuidesWithServices()
    let sentCount = 0
    const errors: string[] = []

    for (const [guideId, { guide, services }] of guideServices.entries()) {
      if (!bulkSelectedRecipients.has(guideId)) continue

      try {
        for (const service of services) {
          const { tour, timeSlot, availabilityId } = service
          const guideName = `${guide.first_name} ${guide.last_name}`
          const activityId = timeSlot.bookings[0]?.activity_id

          // Get template for this activity
          const template = activityId ? activityGuideTemplates.get(activityId) : null
          if (!template) {
            throw new Error(`No template found for activity: ${tour.tourTitle}`)
          }

          // Get staff assignment for this slot
          const staffAssignment = staffAssignments.get(availabilityId)

          // Apply template variables to subject
          let emailSubject = applyTemplateVariables(
            template.subject,
            tour.tourTitle,
            selectedDate,
            timeSlot.time,
            timeSlot.totalParticipants,
            staffAssignment,
            activityId,
            availabilityId,
            timeSlot.bookings
          )
          // Replace {{name}} with guide name
          emailSubject = emailSubject.replace(/\{\{name\}\}/g, guideName)

          // Apply template variables to body
          let emailBody = applyTemplateVariables(
            template.body,
            tour.tourTitle,
            selectedDate,
            timeSlot.time,
            timeSlot.totalParticipants,
            staffAssignment,
            activityId,
            availabilityId,
            timeSlot.bookings
          )
          // Replace {{name}} with guide name
          emailBody = emailBody.replace(/\{\{name\}\}/g, guideName)

          // Generate daily list Excel
          const dailyList = await generateDailyListExcel(tour, timeSlot, guideName)

          // Prepare attachments
          const slotAttachments = attachments.filter(a => a.activity_availability_id === availabilityId)
          const attachmentUrls: string[] = slotAttachments.map(a => a.file_path)

          // Add voucher PDF URLs
          const vouchersForSlot = slotVouchers.get(availabilityId) || []
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
          for (const voucher of vouchersForSlot) {
            if (voucher.pdf_path) {
              const pdfUrl = `${supabaseUrl}/storage/v1/object/public/ticket-vouchers/${voucher.pdf_path}`
              attachmentUrls.push(pdfUrl)
            }
          }

          const response = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipients: [{
                email: guide.email,
                name: guideName,
                type: 'guide',
                id: guide.id
              }],
              subject: emailSubject,
              body: emailBody,
              activityAvailabilityId: availabilityId,
              attachmentUrls,
              dailyListData: dailyList?.data,
              dailyListFileName: dailyList?.fileName,
              serviceDate: selectedDate
            })
          })

          if (!response.ok) {
            const result = await response.json()
            throw new Error(result.error || 'Failed to send email')
          }
        }

        sentCount++
        setBulkEmailProgress({ sent: sentCount, total: bulkSelectedRecipients.size })
      } catch (err) {
        console.error('Error sending to guide:', guide.email, err)
        errors.push(`${guide.first_name} ${guide.last_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    setSendingBulkGuides(false)
    setBulkEmailProgress(null)
    await fetchEmailLogs(selectedDate)

    if (errors.length > 0) {
      alert(`Sent ${sentCount} emails. ${errors.length} failed:\n${errors.join('\n')}`)
    } else {
      alert(`Successfully sent emails to ${sentCount} guide(s)`)
    }
  }

  // Send bulk emails to selected escorts
  const handleSendToSelectedEscorts = async () => {
    if (bulkSelectedRecipients.size === 0) {
      alert('Please select at least one escort')
      return
    }

    // Get default escort consolidated template
    const escortTemplate = consolidatedTemplates.find(
      t => t.template_type === 'escort_consolidated' && t.is_default
    ) || consolidatedTemplates.find(t => t.template_type === 'escort_consolidated')

    if (!escortTemplate) {
      alert('No consolidated template found for escorts. Please create one in Content Management.')
      return
    }

    setShowBulkEmailDrawer(false)
    setSendingBulkEscorts(true)
    setBulkEmailProgress({ sent: 0, total: bulkSelectedRecipients.size })

    const escortServices = getEscortsWithServices()
    let sentCount = 0
    const errors: string[] = []

    for (const [escortId, { escort, services }] of escortServices.entries()) {
      if (!bulkSelectedRecipients.has(escortId)) continue

      try {
        const escortName = `${escort.first_name} ${escort.last_name}`
        const sortedServices = [...services].sort((a, b) =>
          a.timeSlot.time.localeCompare(b.timeSlot.time)
        )

        const consolidatedExcel = await generateConsolidatedEscortExcel(
          escortName,
          sortedServices.map(s => ({ tour: s.tour, timeSlot: s.timeSlot, guideName: s.guideName }))
        )

        // Generate services list using the service item template
        const serviceItemTemplate = escortTemplate.service_item_template ||
          'Ore: {{service.time}} - {{service.title}}\nTotale Pax: {{service.pax_count}}\nGuida: {{service.guide_name}}'

        const servicesList = sortedServices.map((service) => {
          // Get meeting point for this service
          const activityId = service.timeSlot.bookings[0]?.activity_id
          const meetingPoint = activityId ? activityMeetingPoints.get(activityId) : null

          // Get guide phone if available
          const guidePhone = service.guidePhone || ''

          // Get headphone info for this slot
          const staffAssignment = staffAssignments.get(service.availabilityId)
          const headphoneNames = staffAssignment?.headphones.map(h => `${h.first_name} ${h.last_name}`).join(', ') || 'TBD'
          const headphonePhone = staffAssignment?.headphones.map(h => h.phone_number).filter(Boolean).join(', ') || ''

          // Calculate pax types breakdown
          const paxTypeCounts: { [type: string]: number } = {}
          service.timeSlot.bookings.forEach(booking => {
            booking.passengers?.forEach(p => {
              const typeName = p.booked_title || 'Unknown'
              paxTypeCounts[typeName] = (paxTypeCounts[typeName] || 0) + 1
            })
          })
          const paxTypesText = Object.entries(paxTypeCounts)
            .map(([type, count]) => `${count} ${type}`)
            .join(', ')

          // Calculate ticket types breakdown from vouchers
          const vouchersForService = slotVouchers.get(service.availabilityId) || []
          const ticketTypeCounts: { [type: string]: number } = {}
          vouchersForService.forEach(voucher => {
            const typeName = voucher.category_name || 'Standard'
            ticketTypeCounts[typeName] = (ticketTypeCounts[typeName] || 0) + voucher.total_tickets
          })
          const ticketTypesText = Object.entries(ticketTypeCounts)
            .map(([type, count]) => `${count} ${type}`)
            .join(', ')

          // Replace service item template variables
          const serviceText = serviceItemTemplate
            .replace(/\{\{service\.title\}\}/g, service.tour.tourTitle)
            .replace(/\{\{service\.time\}\}/g, service.timeSlot.time.substring(0, 5))
            .replace(/\{\{service\.meeting_point\}\}/g, meetingPoint?.address || meetingPoint?.name || '')
            .replace(/\{\{service\.pax_count\}\}/g, String(service.timeSlot.totalParticipants))
            .replace(/\{\{service\.pax_types\}\}/g, paxTypesText)
            .replace(/\{\{service\.ticket_types\}\}/g, ticketTypesText)
            .replace(/\{\{service\.guide_name\}\}/g, service.guideName || 'TBD')
            .replace(/\{\{service\.guide_phone\}\}/g, guidePhone)
            .replace(/\{\{service\.escort_name\}\}/g, escortName)
            .replace(/\{\{service\.escort_phone\}\}/g, escort.phone_number || '')
            .replace(/\{\{service\.headphone_name\}\}/g, headphoneNames)
            .replace(/\{\{service\.headphone_phone\}\}/g, headphonePhone)

          return serviceText
        }).join('\n\n')

        // Replace main template variables
        const formattedDate = format(new Date(selectedDate), 'dd/MM/yyyy')

        // Build escort list for this specific escort's services
        const escortListForServices = `${escortName}${escort.phone_number ? ' ' + escort.phone_number : ''}`

        const emailSubject = escortTemplate.subject
          .replace(/\{\{name\}\}/g, escortName)
          .replace(/\{\{date\}\}/g, formattedDate)
          .replace(/\{\{services_count\}\}/g, String(services.length))
          .replace(/\{\{escort_list\}\}/g, escortListForServices)

        const emailBody = escortTemplate.body
          .replace(/\{\{name\}\}/g, escortName)
          .replace(/\{\{date\}\}/g, formattedDate)
          .replace(/\{\{services_list\}\}/g, servicesList)
          .replace(/\{\{services_count\}\}/g, String(services.length))
          .replace(/\{\{escort_list\}\}/g, escortListForServices)

        // Don't include attachments - only the Excel
        const response = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: [{
              email: escort.email,
              name: escortName,
              type: 'escort',
              id: escort.id
            }],
            subject: emailSubject,
            body: emailBody,
            attachmentUrls: [],
            dailyListData: consolidatedExcel?.data,
            dailyListFileName: consolidatedExcel?.fileName,
            serviceDate: selectedDate
          })
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || 'Failed to send email')
        }

        sentCount++
        setBulkEmailProgress({ sent: sentCount, total: bulkSelectedRecipients.size })
      } catch (err) {
        console.error('Error sending to escort:', escort.email, err)
        errors.push(`${escort.first_name} ${escort.last_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    setSendingBulkEscorts(false)
    setBulkEmailProgress(null)
    await fetchEmailLogs(selectedDate)

    if (errors.length > 0) {
      alert(`Sent ${sentCount} emails. ${errors.length} failed:\n${errors.join('\n')}`)
    } else {
      alert(`Successfully sent consolidated emails to ${sentCount} escort(s)`)
    }
  }

  // Send bulk emails to selected headphones
  const handleSendToSelectedHeadphones = async () => {
    if (bulkSelectedRecipients.size === 0) {
      alert('Please select at least one headphone')
      return
    }

    // Get default headphone consolidated template
    const headphoneTemplate = consolidatedTemplates.find(
      t => t.template_type === 'headphone_consolidated' && t.is_default
    ) || consolidatedTemplates.find(t => t.template_type === 'headphone_consolidated')

    if (!headphoneTemplate) {
      alert('No consolidated template found for headphones. Please create one in Content Management.')
      return
    }

    setShowBulkEmailDrawer(false)
    setSendingBulkHeadphones(true)
    setBulkEmailProgress({ sent: 0, total: bulkSelectedRecipients.size })

    const headphoneServices = getHeadphonesWithServices()
    let sentCount = 0
    const errors: string[] = []

    for (const [headphoneId, { headphone, services }] of headphoneServices.entries()) {
      if (!bulkSelectedRecipients.has(headphoneId)) continue

      try {
        const headphoneName = `${headphone.first_name} ${headphone.last_name}`
        const sortedServices = [...services].sort((a, b) =>
          a.timeSlot.time.localeCompare(b.timeSlot.time)
        )

        // Generate services list using the service item template
        const serviceItemTemplate = headphoneTemplate.service_item_template ||
          'Ore: {{service.time}} - {{service.title}}\nTotale Pax: {{service.pax_count}}\nGuida: {{service.guide_name}}'

        const servicesList = sortedServices.map((service) => {
          // Get meeting point for this service
          const activityId = service.timeSlot.bookings[0]?.activity_id
          const meetingPoint = activityId ? activityMeetingPoints.get(activityId) : null

          // Get guide phone if available
          const guidePhone = service.guidePhone || ''

          // Get escort info
          const escortNames = service.escortNames.join(', ') || 'TBD'
          const escortPhone = service.escortPhone || ''

          // Calculate pax types breakdown
          const paxTypeCounts: { [type: string]: number } = {}
          service.timeSlot.bookings.forEach(booking => {
            booking.passengers?.forEach(p => {
              const typeName = p.booked_title || 'Unknown'
              paxTypeCounts[typeName] = (paxTypeCounts[typeName] || 0) + 1
            })
          })
          const paxTypesText = Object.entries(paxTypeCounts)
            .map(([type, count]) => `${count} ${type}`)
            .join(', ')

          // Calculate ticket types breakdown from vouchers
          const vouchersForService = slotVouchers.get(service.availabilityId) || []
          const ticketTypeCounts: { [type: string]: number } = {}
          vouchersForService.forEach(voucher => {
            const typeName = voucher.category_name || 'Standard'
            ticketTypeCounts[typeName] = (ticketTypeCounts[typeName] || 0) + voucher.total_tickets
          })
          const ticketTypesText = Object.entries(ticketTypeCounts)
            .map(([type, count]) => `${count} ${type}`)
            .join(', ')

          // Replace service item template variables
          const serviceText = serviceItemTemplate
            .replace(/\{\{service\.title\}\}/g, service.tour.tourTitle)
            .replace(/\{\{service\.time\}\}/g, service.timeSlot.time.substring(0, 5))
            .replace(/\{\{service\.meeting_point\}\}/g, meetingPoint?.address || meetingPoint?.name || '')
            .replace(/\{\{service\.pax_count\}\}/g, String(service.timeSlot.totalParticipants))
            .replace(/\{\{service\.pax_types\}\}/g, paxTypesText)
            .replace(/\{\{service\.ticket_types\}\}/g, ticketTypesText)
            .replace(/\{\{service\.guide_name\}\}/g, service.guideName || 'TBD')
            .replace(/\{\{service\.guide_phone\}\}/g, guidePhone)
            .replace(/\{\{service\.escort_name\}\}/g, escortNames)
            .replace(/\{\{service\.escort_phone\}\}/g, escortPhone)
            .replace(/\{\{service\.headphone_name\}\}/g, headphoneName)
            .replace(/\{\{service\.headphone_phone\}\}/g, headphone.phone_number || '')

          return serviceText
        }).join('\n\n')

        // Replace main template variables
        const formattedDate = format(new Date(selectedDate), 'dd/MM/yyyy')

        const emailSubject = headphoneTemplate.subject
          .replace(/\{\{name\}\}/g, headphoneName)
          .replace(/\{\{date\}\}/g, formattedDate)
          .replace(/\{\{services_count\}\}/g, String(services.length))

        const emailBody = headphoneTemplate.body
          .replace(/\{\{name\}\}/g, headphoneName)
          .replace(/\{\{date\}\}/g, formattedDate)
          .replace(/\{\{services_list\}\}/g, servicesList)
          .replace(/\{\{services_count\}\}/g, String(services.length))

        // Don't include any attachments for headphone emails
        const response = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: [{
              email: headphone.email,
              name: headphoneName,
              type: 'headphone',
              id: headphone.id
            }],
            subject: emailSubject,
            body: emailBody,
            attachmentUrls: [],
            serviceDate: selectedDate
          })
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || 'Failed to send email')
        }

        sentCount++
        setBulkEmailProgress({ sent: sentCount, total: bulkSelectedRecipients.size })
      } catch (err) {
        console.error('Error sending to headphone:', headphone.email, err)
        errors.push(`${headphone.first_name} ${headphone.last_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    setSendingBulkHeadphones(false)
    setBulkEmailProgress(null)
    await fetchEmailLogs(selectedDate)

    if (errors.length > 0) {
      alert(`Sent ${sentCount} emails. ${errors.length} failed:\n${errors.join('\n')}`)
    } else {
      alert(`Successfully sent consolidated emails to ${sentCount} headphone(s)`)
    }
  }

  // Send bulk emails to selected printing contacts
  const handleSendToSelectedPrinting = async () => {
    if (bulkSelectedRecipients.size === 0) {
      alert('Please select at least one printing contact')
      return
    }

    // Get default printing consolidated template
    const printingTemplate = consolidatedTemplates.find(
      t => t.template_type === 'printing_consolidated' && t.is_default
    ) || consolidatedTemplates.find(t => t.template_type === 'printing_consolidated')

    if (!printingTemplate) {
      alert('No consolidated template found for printing. Please create one in Content Management.')
      return
    }

    setShowBulkEmailDrawer(false)
    setSendingBulkPrinting(true)
    setBulkEmailProgress({ sent: 0, total: bulkSelectedRecipients.size })

    const printingServices = getPrintingWithServices()
    let sentCount = 0
    const errors: string[] = []

    for (const [printingId, { printing, services }] of printingServices.entries()) {
      if (!bulkSelectedRecipients.has(printingId)) continue

      try {
        const printingName = `${printing.first_name} ${printing.last_name}`
        const sortedServices = [...services].sort((a, b) =>
          a.timeSlot.time.localeCompare(b.timeSlot.time)
        )

        // Generate services list using the service item template
        const serviceItemTemplate = printingTemplate.service_item_template ||
          'Ore: {{service.time}} - {{service.title}}\nTotale Pax: {{service.pax_count}}\nGuida: {{service.guide_name}}'

        const servicesList = sortedServices.map((service) => {
          // Get meeting point for this service
          const activityId = service.timeSlot.bookings[0]?.activity_id
          const meetingPoint = activityId ? activityMeetingPoints.get(activityId) : null

          // Get guide phone if available
          const guidePhone = service.guidePhone || ''

          // Get escort info
          const escortNames = service.escortNames.join(', ') || 'TBD'
          const escortPhone = service.escortPhone || ''

          // Get headphone info for this slot
          const staffAssignment = staffAssignments.get(service.availabilityId)
          const headphoneNames = staffAssignment?.headphones.map(h => `${h.first_name} ${h.last_name}`).join(', ') || 'TBD'
          const headphonePhone = staffAssignment?.headphones.map(h => h.phone_number).filter(Boolean).join(', ') || ''

          // Calculate pax types breakdown
          const paxTypeCounts: { [type: string]: number } = {}
          service.timeSlot.bookings.forEach(booking => {
            booking.passengers?.forEach(p => {
              const typeName = p.booked_title || 'Unknown'
              paxTypeCounts[typeName] = (paxTypeCounts[typeName] || 0) + 1
            })
          })
          const paxTypesText = Object.entries(paxTypeCounts)
            .map(([type, count]) => `${count} ${type}`)
            .join(', ')

          // Calculate ticket types breakdown from vouchers
          const vouchersForService = slotVouchers.get(service.availabilityId) || []
          const ticketTypeCounts: { [type: string]: number } = {}
          vouchersForService.forEach(voucher => {
            const typeName = voucher.category_name || 'Standard'
            ticketTypeCounts[typeName] = (ticketTypeCounts[typeName] || 0) + voucher.total_tickets
          })
          const ticketTypesText = Object.entries(ticketTypeCounts)
            .map(([type, count]) => `${count} ${type}`)
            .join(', ')

          // Replace service item template variables
          const serviceText = serviceItemTemplate
            .replace(/\{\{service\.title\}\}/g, service.tour.tourTitle)
            .replace(/\{\{service\.time\}\}/g, service.timeSlot.time.substring(0, 5))
            .replace(/\{\{service\.meeting_point\}\}/g, meetingPoint?.address || meetingPoint?.name || '')
            .replace(/\{\{service\.pax_count\}\}/g, String(service.timeSlot.totalParticipants))
            .replace(/\{\{service\.pax_types\}\}/g, paxTypesText)
            .replace(/\{\{service\.ticket_types\}\}/g, ticketTypesText)
            .replace(/\{\{service\.guide_name\}\}/g, service.guideName || 'TBD')
            .replace(/\{\{service\.guide_phone\}\}/g, guidePhone)
            .replace(/\{\{service\.escort_name\}\}/g, escortNames)
            .replace(/\{\{service\.escort_phone\}\}/g, escortPhone)
            .replace(/\{\{service\.headphone_name\}\}/g, headphoneNames)
            .replace(/\{\{service\.headphone_phone\}\}/g, headphonePhone)
            .replace(/\{\{service\.printing_name\}\}/g, printingName)
            .replace(/\{\{service\.printing_phone\}\}/g, printing.phone_number || '')

          return serviceText
        }).join('\n\n')

        // Replace main template variables
        const formattedDate = format(new Date(selectedDate), 'dd/MM/yyyy')

        const emailSubject = printingTemplate.subject
          .replace(/\{\{name\}\}/g, printingName)
          .replace(/\{\{date\}\}/g, formattedDate)
          .replace(/\{\{services_count\}\}/g, String(services.length))

        const emailBody = printingTemplate.body
          .replace(/\{\{name\}\}/g, printingName)
          .replace(/\{\{date\}\}/g, formattedDate)
          .replace(/\{\{services_list\}\}/g, servicesList)
          .replace(/\{\{services_count\}\}/g, String(services.length))

        // Collect vouchers for each service slot with custom naming: {guide_name} - {time} - voucher.pdf
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const namedAttachments: { url: string; filename: string }[] = []

        for (const service of sortedServices) {
          const vouchersForSlot = slotVouchers.get(service.availabilityId) || []
          const guideName = service.guideName || 'TBD'
          // Use dot instead of colon for filename compatibility (10:15 -> 10.15)
          const timeStr = service.timeSlot.time.substring(0, 5).replace(':', '.')

          // Collect all voucher URLs for this slot
          const slotVoucherUrls: string[] = []
          for (const voucher of vouchersForSlot) {
            if (voucher.pdf_path) {
              const pdfUrl = `${supabaseUrl}/storage/v1/object/public/ticket-vouchers/${voucher.pdf_path}`
              slotVoucherUrls.push(pdfUrl)
            }
          }

          // If there are vouchers for this slot, add them as a named attachment
          // Multiple vouchers per slot will be merged by the API into one PDF
          if (slotVoucherUrls.length > 0) {
            // Use the first URL and let the API handle merging if multiple
            // Format: {guide_name} - {time} - voucher.pdf
            const filename = `${guideName} - ${timeStr} - voucher.pdf`
            namedAttachments.push({
              url: slotVoucherUrls[0],
              filename: filename
            })
            // Add remaining vouchers with indexed names if multiple per slot
            for (let i = 1; i < slotVoucherUrls.length; i++) {
              namedAttachments.push({
                url: slotVoucherUrls[i],
                filename: `${guideName} - ${timeStr} - voucher (${i + 1}).pdf`
              })
            }
          }
        }

        const response = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: [{
              email: printing.email,
              name: printingName,
              type: 'printing',
              id: printing.id
            }],
            subject: emailSubject,
            body: emailBody,
            namedAttachments,
            serviceDate: selectedDate
          })
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || 'Failed to send email')
        }

        sentCount++
        setBulkEmailProgress({ sent: sentCount, total: bulkSelectedRecipients.size })
      } catch (err) {
        console.error('Error sending to printing:', printing.email, err)
        errors.push(`${printing.first_name} ${printing.last_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    setSendingBulkPrinting(false)
    setBulkEmailProgress(null)
    await fetchEmailLogs(selectedDate)

    if (errors.length > 0) {
      alert(`Sent ${sentCount} emails. ${errors.length} failed:\n${errors.join('\n')}`)
    } else {
      alert(`Successfully sent consolidated emails to ${sentCount} printing contact(s)`)
    }
  }

  const loadActivitiesAndFetchData = async () => {
    const { data: allActivities, error } = await supabase
      .from('activities')
      .select('activity_id, title')
      .order('title')

    if (!error && allActivities) {
      setActivities(allActivities)
      // Pre-select all activities
      const allActivityIds = allActivities.map(a => a.activity_id)
      setSelectedActivities(allActivityIds)
      setTempSelectedActivities(allActivityIds)

      // Fetch data with all activities pre-selected
      await fetchDataWithActivities(allActivityIds)
      // Also fetch staff assignments
      await fetchStaffAndAttachments(selectedDate, allActivityIds)
      // Fetch email logs for the day
      await fetchEmailLogs(selectedDate)
      // Fetch meeting points for activities
      await fetchMeetingPoints(allActivityIds)
      // Fetch vouchers for the day
      await fetchVouchers(selectedDate)
    }
  }

  // Tour group management functions (ready for UI implementation)
  // Uncomment when adding UI
  /*
  const saveTourGroup = async () => {
    if (!newGroupName.trim()) {
      alert('Please enter a group name')
      return
    }

    if (selectedToursForGroup.length === 0) {
      alert('Please select at least one tour')
      return
    }

    setSaving(true)

    try {
      if (editingGroup) {
        const { error } = await supabase
          .from('tour_groups')
          .update({
            name: newGroupName,
            tour_ids: selectedToursForGroup,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingGroup.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('tour_groups')
          .insert({
            name: newGroupName,
            tour_ids: selectedToursForGroup
          })

        if (error) throw error
      }

      await loadTourGroups()
      setEditingGroup(null)
      setNewGroupName('')
      setSelectedToursForGroup([])
    } catch (error) {
      console.error('Error saving tour group:', error)
      alert('Error saving tour group. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const deleteTourGroup = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('tour_groups')
        .delete()
        .eq('id', groupId)

      if (error) throw error

      await loadTourGroups()

      if (selectedActivities.length > 0) {
        const group = tourGroups.find(g => g.id === groupId)
        if (group) {
          const groupTourIds = group.tour_ids
          const isGroupSelected = groupTourIds.every(id => selectedActivities.includes(id)) &&
                                  selectedActivities.every(id => groupTourIds.includes(id))

          if (isGroupSelected) {
            const allActivityIds = activities.map(a => a.activity_id)
            setSelectedActivities(allActivityIds)
            setTempSelectedActivities(allActivityIds)
            await fetchDataWithActivities(allActivityIds)
          }
        }
      }
    } catch (error) {
      console.error('Error deleting tour group:', error)
      alert('Error deleting tour group. Please try again.')
    }
  }
  */

  const fetchData = async () => {
    await fetchDataWithActivities(selectedActivities, dateRange)
  }

  const fetchDataWithActivities = async (activityIds: string[], customDateRange?: { start: string; end: string }) => {

    // Use custom date range if provided, otherwise use state
    const queryDateRange = customDateRange || dateRange

    try {
      // Prima ottieni tutte le attività per creare una mappa
      const { data: activitiesData } = await supabase
        .from('activities')
        .select('activity_id, title')

      const activitiesMap = new Map()
      activitiesData?.forEach(activity => {
        activitiesMap.set(activity.activity_id, activity.title)
      })

      // Query principale per ottenere i dati con i nomi dei passeggeri
      let query = supabase
        .from('activity_bookings')
        .select(`
          activity_booking_id,
          booking_id,
          start_date_time,
          start_time,
          status,
          activity_id,
          bookings!inner (
            booking_id,
            status
          ),
          pricing_category_bookings (
            pricing_category_id,
            booked_title,
            passenger_first_name,
            passenger_last_name,
            passenger_date_of_birth,
            quantity
          )
        `)
        .not('status', 'in', '(CANCELLED)')  // Filter only activity_bookings.status
        .gte('start_date_time', `${queryDateRange.start}T00:00:00`)
        .lte('start_date_time', `${queryDateRange.end}T23:59:59`)
        .limit(10000) // Increase limit to handle more bookings

      // Applica filtro attività se selezionate
      if (activityIds.length > 0) {
        query = query.in('activity_id', activityIds)
      }

      const { data: bookings, error } = await query

      if (error) {
        console.error('Errore nel caricamento dati:', error)
        console.error('Error details:', error.message, error.details, error.hint)
        return
      }

      // Continue with the rest of the data processing...
      // (copying the rest from the original fetchData function)
      const customerDataMap = new Map()
      if (bookings && bookings.length > 0) {
        const bookingIds = bookings.map(b => Number(b.booking_id))

        const { data: bookingCustomers, error: bcError } = await supabase
          .from('booking_customers')
          .select('booking_id, customer_id')
          .in('booking_id', bookingIds)

        if (bcError) {
          console.error('Error fetching booking_customers:', bcError)
        } else if (bookingCustomers && bookingCustomers.length > 0) {
          const customerIds = bookingCustomers.map(bc => String(bc.customer_id))

          const { data: customers, error: custError } = await supabase
            .from('customers')
            .select('customer_id, first_name, last_name, phone_number, email')
            .in('customer_id', customerIds)

          if (custError) {
            console.error('Error fetching customers:', custError)
          } else if (customers) {
            const customerMap = new Map()
            customers.forEach(c => {
              customerMap.set(String(c.customer_id), c)
            })

            bookingCustomers.forEach(bc => {
              const customer = customerMap.get(String(bc.customer_id))
              if (customer) {
                customerDataMap.set(String(bc.booking_id), customer)
              }
            })
          }
        }
      }

      const transformedData: PaxData[] = []

      bookings?.forEach((booking: any) => {
        const bookingDate = new Date(booking.start_date_time)
        const dateStr = bookingDate.toISOString().split('T')[0]

        let totalParticipants = 0
        const passengers: any[] = []
        const participantTypes: { [key: string]: number } = {}

        booking.pricing_category_bookings?.forEach((pax: any) => {
          const quantity = pax.quantity || 1
          const pricingCategoryId = pax.pricing_category_id?.toString()

          // Skip excluded pricing categories for specific activities
          if (shouldExcludePricingCategory(booking.activity_id, pax.booked_title, pricingCategoryId)) {
            return
          }

          totalParticipants += quantity

          if (participantTypes[pax.booked_title]) {
            participantTypes[pax.booked_title] += quantity
          } else {
            participantTypes[pax.booked_title] = quantity
          }

          passengers.push({
            pricing_category_id: pricingCategoryId,
            booked_title: pax.booked_title,
            first_name: pax.passenger_first_name,
            last_name: pax.passenger_last_name,
            date_of_birth: pax.passenger_date_of_birth,
            quantity: quantity
          })
        })

        let participantsDetail = `${totalParticipants}`
        if (Object.keys(participantTypes).length > 0) {
          const details = Object.entries(participantTypes)
            .map(([type, count]) => {
              return `(${count} ${type})`
            })
            .join(', ')
          participantsDetail += ` - ${details}`
        }

        const activityTitle = activitiesMap.get(booking.activity_id) || 'N/A'
        const customerData = customerDataMap.get(String(booking.booking_id))

        transformedData.push({
          activity_id: booking.activity_id,
          activity_title: activityTitle,
          booking_date: dateStr,
          start_time: booking.start_time || '',
          booking_id: booking.booking_id,
          activity_booking_id: booking.activity_booking_id,
          total_participants: totalParticipants,
          participants_detail: participantsDetail,
          passengers: passengers,
          customer: customerData ? {
            first_name: customerData.first_name,
            last_name: customerData.last_name,
            phone_number: customerData.phone_number
          } : undefined
        })
      })

      transformedData.sort((a, b) => {
        if (a.booking_date !== b.booking_date) {
          return a.booking_date.localeCompare(b.booking_date)
        }
        if (a.start_time !== b.start_time) {
          return a.start_time.localeCompare(b.start_time)
        }
        return a.activity_title.localeCompare(b.activity_title)
      })

      setData(transformedData)
      groupDataByTour(transformedData)
    } catch (error) {
      console.error('Errore:', error)
    }
  }

  // Auto-refresh data every hour
  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log('Auto-refreshing Pax Names data...')
      fetchData()
    }, 60 * 60 * 1000) // 60 minutes

    return () => clearInterval(intervalId)
  }, [dateRange, selectedActivities])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isDropdownOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isDropdownOpen])

  // Chiudi il dropdown quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.dropdown-container')) {
        setIsDropdownOpen(false)
        setSearchTerm('') // Reset search when closing
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  // Handle date change - auto refresh
  const handleDateChange = async (date: string) => {
    setSelectedDate(date)
    const newDateRange = {
      start: date,
      end: date
    }
    setDateRange(newDateRange)
    // Auto-refresh data with new date range
    await fetchDataWithActivities(selectedActivities, newDateRange)
    // Also fetch staff assignments for the new date
    await fetchStaffAndAttachments(date, selectedActivities)
    // Fetch email logs for the new date
    await fetchEmailLogs(date)
    // Fetch vouchers for the new date
    await fetchVouchers(date)
  }

  // Group data by tour and time slot - memoized for performance
  const groupDataByTour = useCallback((bookings: PaxData[]) => {
    // Group by tour
    const tourMap = new Map<string, PaxData[]>()

    bookings.forEach(booking => {
      const tourTitle = booking.activity_title
      if (!tourMap.has(tourTitle)) {
        tourMap.set(tourTitle, [])
      }
      tourMap.get(tourTitle)!.push(booking)
    })

    // Create tour groups with time slots
    const tours: TourGroup[] = []

    tourMap.forEach((tourBookings, tourTitle) => {
      // Group by time slot within tour
      const timeSlotMap = new Map<string, PaxData[]>()

      tourBookings.forEach(booking => {
        const time = booking.start_time
        if (!timeSlotMap.has(time)) {
          timeSlotMap.set(time, [])
        }
        timeSlotMap.get(time)!.push(booking)
      })

      // Create time slot groups
      const timeSlots: TimeSlotGroup[] = []
      let tourTotalParticipants = 0

      timeSlotMap.forEach((slotBookings, time) => {
        const slotTotal = slotBookings.reduce((sum, b) => sum + b.total_participants, 0)
        tourTotalParticipants += slotTotal

        timeSlots.push({
          time,
          bookings: slotBookings,
          totalParticipants: slotTotal
        })
      })

      // Sort time slots by time
      timeSlots.sort((a, b) => a.time.localeCompare(b.time))

      tours.push({
        tourTitle,
        timeSlots,
        totalParticipants: tourTotalParticipants,
        isExpanded: false // Collapsed by default
      })
    })

    // Sort tours by total participants (descending)
    tours.sort((a, b) => b.totalParticipants - a.totalParticipants)

    setGroupedTours(tours)
  }, [])

  // Toggle tour expansion
  const toggleTourExpansion = (tourTitle: string) => {
    setGroupedTours(prev =>
      prev.map(tour =>
        tour.tourTitle === tourTitle
          ? { ...tour, isExpanded: !tour.isExpanded }
          : tour
      )
    )
  }

  // Handle drag end for reordering bookings within a time slot
  const handleDragEnd = (event: DragEndEvent, tourTitle: string, timeSlot: string) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    setGroupedTours(prev => {
      const newTours = [...prev]
      const tourIndex = newTours.findIndex(t => t.tourTitle === tourTitle)
      if (tourIndex === -1) return prev

      const tour = newTours[tourIndex]
      const slotIndex = tour.timeSlots.findIndex(s => s.time === timeSlot)
      if (slotIndex === -1) return prev

      const bookings = [...tour.timeSlots[slotIndex].bookings]
      const oldIndex = bookings.findIndex(b => b.activity_booking_id === active.id)
      const newIndex = bookings.findIndex(b => b.activity_booking_id === over.id)

      if (oldIndex === -1 || newIndex === -1) return prev

      const reorderedBookings = arrayMove(bookings, oldIndex, newIndex)

      newTours[tourIndex] = {
        ...tour,
        timeSlots: tour.timeSlots.map((slot, idx) =>
          idx === slotIndex
            ? { ...slot, bookings: reorderedBookings }
            : slot
        )
      }

      return newTours
    })
  }

  const handleActivityChange = (activityId: string, checked: boolean) => {
    if (checked) {
      setTempSelectedActivities([...tempSelectedActivities, activityId])
    } else {
      setTempSelectedActivities(tempSelectedActivities.filter(id => id !== activityId))
    }
  }

  const applyTourFilter = async () => {
    setSelectedActivities(tempSelectedActivities)
    setIsDropdownOpen(false)
    // Fetch data with new selections
    await fetchDataWithActivities(tempSelectedActivities, dateRange)
    // Also fetch staff assignments
    await fetchStaffAndAttachments(selectedDate, tempSelectedActivities)
  }

  // Get ALL participant categories for an activity (including historical data)
  // This matches the logic from PivotTable to ensure we get all 6 participant types
  const getAllParticipantCategoriesForActivity = async (activityId: string): Promise<string[]> => {
    const allCategories = new Set<string>()

    // Query ALL historical bookings for this activity to get all possible participant types
    const { data: historicalBookings } = await supabase
      .from('activity_bookings')
      .select(`
        pricing_category_bookings (
          pricing_category_id,
          booked_title
        )
      `)
      .eq('activity_id', activityId)
      .not('pricing_category_bookings.booked_title', 'is', null)

    // Extract all unique categories from historical bookings
    historicalBookings?.forEach(booking => {
      booking.pricing_category_bookings?.forEach((pcb: any) => {
        const pricingCategoryId = pcb.pricing_category_id?.toString()
        if (pcb.booked_title && !shouldExcludePricingCategory(activityId, pcb.booked_title, pricingCategoryId)) {
          allCategories.add(pcb.booked_title)
        }
      })
    })

    // Sort categories (Adult first, then by age descending)
    const sortedCategories = Array.from(allCategories).sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()

      // First, adults
      if (aLower.includes('adult')) return -1
      if (bLower.includes('adult')) return 1

      // Then sort by age (extract numbers from category names)
      const extractAge = (category: string) => {
        const match = category.match(/\d+/)
        return match ? parseInt(match[0]) : 0
      }

      const ageA = extractAge(a)
      const ageB = extractAge(b)

      // Sort from oldest to youngest
      if (ageA !== ageB) {
        return ageB - ageA
      }

      // If no ages, sort alphabetically
      return a.localeCompare(b)
    })

    return sortedCategories
  }

  // Get participant counts by category for a booking - memoized for performance
  const getParticipantCounts = useCallback((booking: PaxData): { [category: string]: number } => {
    const counts: { [category: string]: number } = {}

    booking.passengers.forEach(passenger => {
      const category = passenger.booked_title || 'Unknown'
      const pricingCategoryId = passenger.pricing_category_id

      // Skip excluded pricing categories for specific activities
      if (shouldExcludePricingCategory(booking.activity_id, category, pricingCategoryId)) {
        return
      }

      counts[category] = (counts[category] || 0) + passenger.quantity
    })

    return counts
  }, [])

  const exportSingleTour = async (tour: TourGroup) => {
    let fileCount = 0

    // Get the activity_id from the first booking in the tour
    const firstBooking = tour.timeSlots[0]?.bookings[0]
    if (!firstBooking) {
      alert('No bookings found for this tour')
      return
    }

    // Get ALL historical participant categories for this activity
    const participantCategories = await getAllParticipantCategoriesForActivity(firstBooking.activity_id)

    for (const timeSlot of tour.timeSlots) {
      const firstBooking = timeSlot.bookings[0]
      if (!firstBooking) continue

      const bookingDate = new Date(firstBooking.booking_date).toLocaleDateString('it-IT')
      const excelData: any[][] = []

      // Row 1: Tour Title (merged)
      const titleHeader = `${tour.tourTitle} - ${bookingDate} - ${timeSlot.time}`
      excelData.push([titleHeader])

      // Row 2: Column Headers
      const headers = ['Data', 'Ora', ...participantCategories, 'Nome e Cognome', 'Telefono']
      excelData.push(headers)

      // Initialize totals
      const totals: { [key: string]: number } = {}
      participantCategories.forEach(cat => totals[cat] = 0)

      // Rows 3-N: Data rows
      timeSlot.bookings.forEach(booking => {
        const fullName = `${booking.customer?.first_name || ''} ${booking.customer?.last_name || ''}`.trim()
        const participantCounts = getParticipantCounts(booking)

        const row: any[] = [
          new Date(booking.booking_date).toLocaleDateString('it-IT'),
          booking.start_time
        ]

        participantCategories.forEach(category => {
          const count = participantCounts[category] || 0
          row.push(count)
          totals[category] += count
        })

        row.push(fullName)
        row.push(booking.customer?.phone_number || '')
        excelData.push(row)
      })

      // First Total Row: Participants
      const participantsRow: any[] = ['', 'Participants']
      participantCategories.forEach(category => {
        participantsRow.push(totals[category])
      })
      participantsRow.push('', '')
      excelData.push(participantsRow)

      // Second Total Row: TOTAL PAX
      const totalParticipants = participantCategories.reduce((sum, cat) => sum + totals[cat], 0)
      const totalPaxRow: any[] = ['', 'TOTAL PAX', totalParticipants]
      for (let i = 0; i < participantCategories.length - 1 + 2; i++) {
        totalPaxRow.push('')
      }
      excelData.push(totalPaxRow)

      // Create workbook
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(excelData)

      // Merge title cells
      if (!ws['!merges']) ws['!merges'] = []
      ws['!merges'].push({
        s: { r: 0, c: 0 },
        e: { r: 0, c: participantCategories.length + 3 }
      })

      const totalCols = participantCategories.length + 4

      // Apply styles (same as main export)
      for (let col = 0; col < totalCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
        ws[cellAddress].s = {
          font: { bold: true, sz: 18, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4472C4" } },
          alignment: { horizontal: "center", vertical: "center" }
        }
      }

      for (let col = 0; col < totalCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col })
        const cell = ws[cellAddress]
        if (cell) {
          cell.s = {
            font: { bold: true, sz: 13 },
            fill: { fgColor: { rgb: "D9D9D9" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }
      }

      const participantsRowIndex = 2 + timeSlot.bookings.length
      const totalPaxRowIndex = participantsRowIndex + 1

      for (let col = 0; col < totalCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: participantsRowIndex, c: col })
        const cell = ws[cellAddress]
        if (cell) {
          cell.s = {
            font: { bold: true, sz: 13 },
            fill: { fgColor: { rgb: "D9D9D9" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }
      }

      for (let col = 0; col < totalCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: totalPaxRowIndex, c: col })
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
        ws[cellAddress].s = {
          font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4472C4" } },
          alignment: { horizontal: "center", vertical: "center" }
        }
      }

      for (let row = 2; row < 2 + timeSlot.bookings.length; row++) {
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
          const cell = ws[cellAddress]
          if (cell) {
            cell.s = {
              font: { sz: 13 },
              alignment: { horizontal: "center", vertical: "center" }
            }
          }
        }
      }

      if (!ws['!rows']) ws['!rows'] = []
      ws['!rows'][0] = { hpt: 30 }
      ws['!rows'][1] = { hpt: 20 }

      const colWidths = [
        { wch: 12 },
        { wch: 8 },
        ...participantCategories.map(() => ({ wch: 15 })),
        { wch: 25 },
        { wch: 20 },
      ]
      ws['!cols'] = colWidths

      XLSX.utils.book_append_sheet(wb, ws, 'Lista')

      const cleanTourTitle = tour.tourTitle.replace(/[/\\?%*:|"<>]/g, '-')
      const cleanTime = timeSlot.time.replace(/:/g, '.')
      const fileName = `${cleanTourTitle} + ${bookingDate} + ${cleanTime}.xlsx`

      XLSX.writeFile(wb, fileName)
      fileCount++

      if (fileCount < tour.timeSlots.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    console.log(`Exported ${fileCount} file(s) for tour: ${tour.tourTitle}`)
  }

  const exportToExcel = async () => {
    let fileCount = 0

    // Export one file per time slot
    for (const tour of groupedTours) {
      // Get the activity_id from the first booking in the tour
      const firstBooking = tour.timeSlots[0]?.bookings[0]
      if (!firstBooking) continue

      // Get ALL historical participant categories for this activity
      // This ensures we show all 6 participant types even if current bookings don't have all of them
      const participantCategories = await getAllParticipantCategoriesForActivity(firstBooking.activity_id)

      for (const timeSlot of tour.timeSlots) {
        // Get the date from first booking
        const firstBooking = timeSlot.bookings[0]
        if (!firstBooking) continue

        const bookingDate = new Date(firstBooking.booking_date).toLocaleDateString('it-IT')

        // Find guide name for this time slot
        const slotActivityId = firstBooking.activity_id
        // Normalize time to HH:MM format for comparison
        const normalizeTime = (t: string) => t.substring(0, 5)
        const slotTimeNorm = normalizeTime(timeSlot.time)
        let guideName = ''
        for (const [, staff] of staffAssignments.entries()) {
          const staffTimeNorm = normalizeTime(staff.localTime)
          if (staff.activityId === slotActivityId && staffTimeNorm === slotTimeNorm) {
            guideName = staff.guides.map(g => `${g.first_name} ${g.last_name}`).join(', ')
            break
          }
        }

        // Build Excel data manually with proper structure
        const excelData: any[][] = []

        // Row 1: Tour Title (merged)
        const titleHeader = `${tour.tourTitle} - ${bookingDate} - ${timeSlot.time}`
        excelData.push([titleHeader])

        // Row 2: Column Headers
        const headers = ['Data', 'Ora', ...participantCategories, 'Nome e Cognome', 'Telefono']
        excelData.push(headers)

        // Initialize totals
        const totals: { [key: string]: number } = {}
        participantCategories.forEach(cat => totals[cat] = 0)

        // Rows 3-N: Data rows
        timeSlot.bookings.forEach(booking => {
          const fullName = `${booking.customer?.first_name || ''} ${booking.customer?.last_name || ''}`.trim()
          const participantCounts = getParticipantCounts(booking)

          const row: any[] = [
            new Date(booking.booking_date).toLocaleDateString('it-IT'),
            booking.start_time
          ]

          // Add participant counts and accumulate totals
          participantCategories.forEach(category => {
            const count = participantCounts[category] || 0
            row.push(count)
            totals[category] += count
          })

          row.push(fullName)
          row.push(booking.customer?.phone_number || '')

          excelData.push(row)
        })

        // First Total Row: Participants - Show breakdown by category
        const participantsRow: any[] = ['', 'Participants']
        participantCategories.forEach(category => {
          participantsRow.push(totals[category])
        })
        participantsRow.push('', '') // Empty cells for Name and Phone
        excelData.push(participantsRow)

        // Second Total Row: TOTAL PAX - Show single sum with guide info
        const totalParticipants = participantCategories.reduce((sum, cat) => sum + totals[cat], 0)
        const totalPaxRow: any[] = ['', 'TOTAL PAX', totalParticipants]
        // Fill remaining cells with empty values, then add guide label and name
        for (let i = 0; i < participantCategories.length - 1; i++) {
          totalPaxRow.push('')
        }
        totalPaxRow.push('guide')
        totalPaxRow.push(guideName)
        excelData.push(totalPaxRow)

        // Create workbook from array
        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.aoa_to_sheet(excelData)

        // Merge title cells
        if (!ws['!merges']) ws['!merges'] = []
        ws['!merges'].push({
          s: { r: 0, c: 0 },
          e: { r: 0, c: participantCategories.length + 3 }
        })

        // Style the title cell (Row 1) - bigger font and different background
        const totalCols = participantCategories.length + 4 // Data, Ora, categories, Nome, Telefono

        // Apply style to title row (merged cell)
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col })
          if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
          ws[cellAddress].s = {
            font: { bold: true, sz: 18, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4472C4" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }

        // Style header row (Row 2) - bold and light gray background
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col })
          const cell = ws[cellAddress]
          if (cell) {
            cell.s = {
              font: { bold: true, sz: 13 },
              fill: { fgColor: { rgb: "D9D9D9" } },
              alignment: { horizontal: "center", vertical: "center" }
            }
          }
        }

        // Style the Participants and TOTAL PAX rows
        const participantsRowIndex = 2 + timeSlot.bookings.length // After headers and booking rows
        const totalPaxRowIndex = participantsRowIndex + 1

        // Style Participants row - same as Header Row (light gray background, bold)
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: participantsRowIndex, c: col })
          const cell = ws[cellAddress]
          if (cell) {
            cell.s = {
              font: { bold: true, sz: 13 },
              fill: { fgColor: { rgb: "D9D9D9" } },
              alignment: { horizontal: "center", vertical: "center" }
            }
          }
        }

        // Style TOTAL PAX row - same as Title Row (blue background, white text)
        for (let col = 0; col < totalCols; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: totalPaxRowIndex, c: col })
          if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' }
          ws[cellAddress].s = {
            font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4472C4" } },
            alignment: { horizontal: "center", vertical: "center" }
          }
        }

        // Style data rows (booking rows) with font size 13
        for (let row = 2; row < 2 + timeSlot.bookings.length; row++) {
          for (let col = 0; col < totalCols; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
            const cell = ws[cellAddress]
            if (cell) {
              cell.s = {
                font: { sz: 13 },
                alignment: { horizontal: "center", vertical: "center" }
              }
            }
          }
        }

        // Set row heights
        if (!ws['!rows']) ws['!rows'] = []
        ws['!rows'][0] = { hpt: 30 } // Title row height (bigger)
        ws['!rows'][1] = { hpt: 20 } // Header row height

        // Set column widths
        const colWidths = [
          { wch: 12 }, // Data
          { wch: 8 },  // Ora
          ...participantCategories.map(() => ({ wch: 15 })), // Participant columns
          { wch: 25 }, // Nome e Cognome
          { wch: 20 }, // Telefono
        ]
        ws['!cols'] = colWidths

        // Add sheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Lista')

        // Generate filename: "Tour Title + Date + Time Slot.xlsx"
        const cleanTourTitle = tour.tourTitle.replace(/[/\\?%*:|"<>]/g, '-')
        const cleanTime = timeSlot.time.replace(/:/g, '.')
        const fileName = `${cleanTourTitle} + ${bookingDate} + ${cleanTime}.xlsx`

        // Write file
        XLSX.writeFile(wb, fileName)
        fileCount++

        // Small delay between downloads
        if (fileCount < groupedTours.reduce((sum, t) => sum + t.timeSlots.length, 0)) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    }

    console.log(`Exported ${fileCount} file(s)`)
  }

  // Sortable row component for drag & drop
  const SortableBookingRow = ({ booking }: { booking: PaxData }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: booking.activity_booking_id })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    return (
      <TableRow ref={setNodeRef} style={style} className={isDragging ? 'bg-gray-100' : ''}>
        <TableCell>
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-gray-400" />
          </div>
        </TableCell>
        <TableCell className="font-medium">{booking.activity_title}</TableCell>
        <TableCell>{new Date(booking.booking_date).toLocaleDateString('it-IT')}</TableCell>
        <TableCell>{booking.start_time}</TableCell>
        <TableCell>{booking.participants_detail}</TableCell>
        <TableCell>{booking.customer?.first_name || '-'}</TableCell>
        <TableCell>{booking.customer?.last_name || '-'}</TableCell>
        <TableCell>{booking.customer?.phone_number || '-'}</TableCell>
        <TableCell>{booking.booking_id}</TableCell>
        <TableCell>{booking.activity_booking_id}</TableCell>
      </TableRow>
    )
  }

  return (
    <div className="p-4">
      {/* Sezione Filtri */}
      <div className="mb-6 p-4 border rounded-lg bg-gray-50">
        <h3 className="text-lg font-semibold mb-4">Filtri</h3>

        {/* Row 1: Tour + Periodo (50%-50%) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Selezione Tour - Dropdown */}
          <div className="dropdown-container">
            <Label>Seleziona Tour</Label>
            <div className="mt-2 relative">
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(!isDropdownOpen)
                  if (!isDropdownOpen) {
                    setSearchTerm('') // Reset search when opening
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className="truncate flex-1 text-left">
                  {selectedActivities.length === 0
                    ? 'Seleziona tour...'
                    : selectedActivities.length === 1
                    ? activities.find(a => a.activity_id === selectedActivities[0])?.title || '1 tour selezionato'
                    : selectedActivities.length <= 2
                    ? selectedActivities.map(id =>
                        activities.find(a => a.activity_id === id)?.title
                      ).filter(Boolean).join(', ')
                    : `${selectedActivities.length} tour selezionati`
                  }
                </span>
                {selectedActivities.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                    {selectedActivities.length}
                  </span>
                )}
                <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-96 overflow-hidden flex flex-col">
                  <div className="p-2 border-b">
                    {/* Search input */}
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Cerca tour..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-8 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                      {searchTerm && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSearchTerm('')
                            searchInputRef.current?.focus()
                          }}
                          className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-80 flex-1">
                    {searchTerm && (
                      <div className="px-3 py-1 text-xs text-gray-500 bg-gray-50">
                        {filteredActivities.length} risultati
                      </div>
                    )}
                    <div className="p-2">
                      <button
                        onClick={() => {
                          const allFilteredSelected = filteredActivityIds.every(id => tempSelectedActivities.includes(id))

                          if (allFilteredSelected) {
                            setTempSelectedActivities(tempSelectedActivities.filter(id => !filteredActivityIds.includes(id)))
                          } else {
                            setTempSelectedActivities([...new Set([...tempSelectedActivities, ...filteredActivityIds])])
                          }
                        }}
                        className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded"
                      >
                        {filteredActivityIds.every(id => tempSelectedActivities.includes(id))
                          ? 'Deseleziona tutti (filtrati)'
                          : 'Seleziona tutti (filtrati)'}
                      </button>
                    </div>
                    <div className="border-t">
                      {filteredActivities.map(activity => (
                          <div
                            key={activity.activity_id}
                            className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                            onClick={() => handleActivityChange(activity.activity_id, !tempSelectedActivities.includes(activity.activity_id))}
                          >
                            <input
                              type="checkbox"
                              id={activity.activity_id}
                              checked={tempSelectedActivities.includes(activity.activity_id)}
                              onChange={(e) => {
                                e.stopPropagation()
                                handleActivityChange(activity.activity_id, e.target.checked)
                              }}
                              className="w-4 h-4 mr-2"
                            />
                            <label
                              htmlFor={activity.activity_id}
                              className="text-sm cursor-pointer flex-1"
                            >
                              {searchTerm ? (
                                (() => {
                                  const parts = activity.title.split(new RegExp(`(${searchTerm})`, 'gi'))
                                  return parts.map((part: string, index: number) =>
                                    part.toLowerCase() === searchTerm.toLowerCase() ? (
                                      <span key={index} className="bg-yellow-200">{part}</span>
                                    ) : (
                                      <span key={index}>{part}</span>
                                    )
                                  )
                                })()
                              ) : (
                                activity.title
                              )}
                            </label>
                          </div>
                        ))}
                      {activities.filter(activity =>
                        activity.title.toLowerCase().includes(searchTerm.toLowerCase())
                      ).length === 0 && (
                        <div className="px-3 py-4 text-sm text-gray-500 text-center">
                          Nessun tour trovato
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Apply Button */}
                  <div className="p-3 border-t bg-gray-50">
                    <Button
                      onClick={applyTourFilter}
                      className="w-full"
                    >
                      Applica
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Date Picker */}
          <div>
            <Label>Data</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="mt-2"
            />
          </div>
        </div>

        {/* Pulsanti Azione */}
        <div className="mt-4 flex gap-2">
          <Button
            onClick={exportToExcel}
            variant="outline"
            disabled={data.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Grouped Tours */}
      <div className="space-y-4">
        {groupedTours.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nessun dato trovato per i filtri selezionati
          </div>
        ) : (
          groupedTours.map((tour) => (
            <div key={tour.tourTitle} className="border rounded-lg bg-white shadow-sm">
              {/* Tour Header */}
              <div
                className="p-4 bg-brand-orange-light border-b hover:bg-orange-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center space-x-2 flex-1 cursor-pointer"
                    onClick={() => toggleTourExpansion(tour.tourTitle)}
                  >
                    <ChevronRight
                      className={`h-5 w-5 transition-transform ${
                        tour.isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                    <h3 className="text-lg font-bold">{tour.tourTitle}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-blue-700">
                      Orari: {tour.timeSlots.length} | Total: {tour.totalParticipants} participants
                    </div>
                    <Button
                      onClick={(e) => {
                        e.stopPropagation()
                        exportSingleTour(tour)
                      }}
                      variant="outline"
                      size="sm"
                      className="h-8"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </div>
                </div>
              </div>

              {/* Time Slots */}
              {tour.isExpanded && (
                <div className="p-4 space-y-4">
                  {tour.timeSlots.map((timeSlot) => {
                    const firstBooking = timeSlot.bookings[0]
                    const slotActivityId = firstBooking?.activity_id
                    // Normalize time format: "10:00" -> "10:00:00" for comparison
                    const slotTime = timeSlot.time.length === 5 ? `${timeSlot.time}:00` : timeSlot.time

                    // Find staff by matching activity_id and time
                    const slotStaff = (() => {
                      if (!slotActivityId) return null
                      for (const [availId, staff] of staffAssignments.entries()) {
                        // Match by activity_id and local_time (both normalized to HH:mm:ss)
                        const staffTime = staff.localTime.length === 5 ? `${staff.localTime}:00` : staff.localTime
                        if (staff.activityId === slotActivityId && staffTime === slotTime) {
                          return { availId, staff }
                        }
                      }
                      return null
                    })()

                    // Get attachments for this time slot (we'll need to properly map this)
                    const slotAttachments = slotStaff ? attachments.filter(a => a.activity_availability_id === slotStaff.availId) : []
                    const slotGuides = slotStaff?.staff.guides || []
                    const slotEscorts = slotStaff?.staff.escorts || []
                    const slotHeadphones = slotStaff?.staff.headphones || []
                    const slotPrinting = slotStaff?.staff.printing || []
                    const slotAvailabilityId = slotStaff?.availId

                    // Get vouchers for this time slot
                    const vouchersForSlot = slotAvailabilityId ? slotVouchers.get(slotAvailabilityId) || [] : []
                    const totalTicketsInSlot = vouchersForSlot.reduce((sum, v) => sum + v.total_tickets, 0)

                    return (
                      <div key={timeSlot.time} className="border rounded-lg p-3 bg-gray-50">
                      {/* Time Slot Header */}
                      <div className="mb-3 pb-3 border-b space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-lg">
                            Time: {timeSlot.time.substring(0, 5)}
                          </h4>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-700 bg-gray-200 px-2 py-1 rounded">
                              {timeSlot.totalParticipants} participants
                            </span>
                            {/* Voucher Tickets Badge */}
                            {vouchersForSlot.length > 0 && (
                              <span className={`text-sm font-medium px-2 py-1 rounded flex items-center gap-1 ${
                                totalTicketsInSlot === timeSlot.totalParticipants
                                  ? 'bg-green-100 text-green-700'
                                  : totalTicketsInSlot < timeSlot.totalParticipants
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-red-100 text-red-700'
                              }`}>
                                <Ticket className="w-4 h-4" />
                                {totalTicketsInSlot} tickets ({vouchersForSlot.length} voucher{vouchersForSlot.length !== 1 ? 's' : ''})
                              </span>
                            )}
                            {/* Upload PDF Button */}
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept=".pdf"
                                multiple
                                className="hidden"
                                onChange={async (e) => {
                                  if (!firstBooking) return
                                  const availId = await getAvailabilityId(firstBooking.activity_id, firstBooking.booking_date, timeSlot.time)
                                  if (availId) handleFileUpload(e, availId)
                                }}
                              />
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white border rounded-md hover:bg-gray-50">
                                {uploadingFor === slotAvailabilityId ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                                Add PDF
                              </span>
                            </label>
                            {/* Send Email Button - Only for guides */}
                            <Button
                              size="sm"
                              onClick={() => openEmailModal(tour, timeSlot)}
                              disabled={slotGuides.length === 0}
                            >
                              <Mail className="w-4 h-4 mr-1" />
                              Send Email
                            </Button>
                          </div>
                        </div>

                        {/* Staff & Attachments Row */}
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          {/* Guides */}
                          {slotGuides.length > 0 && (
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-purple-600" />
                              <span className="text-purple-700 font-medium">Guides:</span>
                              {slotGuides.map((g) => (
                                <span key={g.id} className="bg-brand-green-light text-green-800 px-2 py-0.5 rounded">
                                  {g.first_name} {g.last_name}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Escorts */}
                          {slotEscorts.length > 0 && (
                            <div className="flex items-center gap-2">
                              <UserCheck className="w-4 h-4 text-green-600" />
                              <span className="text-green-700 font-medium">Escorts:</span>
                              {slotEscorts.map((e) => (
                                <span key={e.id} className="bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                  {e.first_name} {e.last_name}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Headphones */}
                          {slotHeadphones.length > 0 && (
                            <div className="flex items-center gap-2">
                              <Headphones className="w-4 h-4 text-purple-600" />
                              <span className="text-purple-700 font-medium">Headphones:</span>
                              {slotHeadphones.map((h) => (
                                <span key={h.id} className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                                  {h.first_name} {h.last_name}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Printing */}
                          {slotPrinting.length > 0 && (
                            <div className="flex items-center gap-2">
                              <Printer className="w-4 h-4 text-cyan-600" />
                              <span className="text-cyan-700 font-medium">Printing:</span>
                              {slotPrinting.map((p) => (
                                <span key={p.id} className="bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded">
                                  {p.first_name} {p.last_name}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* No staff assigned */}
                          {slotGuides.length === 0 && slotEscorts.length === 0 && slotHeadphones.length === 0 && slotPrinting.length === 0 && (
                            <span className="text-gray-500 italic">No staff assigned</span>
                          )}
                          {/* Attachments */}
                          {slotAttachments.length > 0 && (
                            <div className="flex items-center gap-2">
                              <Paperclip className="w-4 h-4 text-blue-600" />
                              {slotAttachments.map(att => (
                                <span key={att.id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                  <a href={att.file_path} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                    {att.file_name}
                                  </a>
                                  <button
                                    onClick={() => handleDeleteAttachment(att)}
                                    className="ml-1 text-red-500 hover:text-red-700"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Vouchers */}
                          {vouchersForSlot.length > 0 && (
                            <div className="flex items-center gap-2">
                              <Ticket className="w-4 h-4 text-orange-600" />
                              <span className="text-orange-700 font-medium">Vouchers:</span>
                              {vouchersForSlot.map(v => (
                                <span key={v.id} className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
                                  {v.pdf_path ? (
                                    <a
                                      href={supabase.storage.from('ticket-vouchers').getPublicUrl(v.pdf_path).data.publicUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline"
                                    >
                                      {v.booking_number} ({v.total_tickets})
                                    </a>
                                  ) : (
                                    <span>{v.booking_number} ({v.total_tickets})</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Draggable Bookings Table */}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleDragEnd(event, tour.tourTitle, timeSlot.time)}
                      >
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12"></TableHead>
                              <TableHead>Tour</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead>Ora</TableHead>
                              <TableHead>Totale Partecipanti</TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead>Cognome</TableHead>
                              <TableHead>Telefono</TableHead>
                              <TableHead>Booking ID</TableHead>
                              <TableHead>Activity Booking ID</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <SortableContext
                              items={timeSlot.bookings.map((b) => b.activity_booking_id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {timeSlot.bookings.map((booking) => (
                                <SortableBookingRow
                                  key={booking.activity_booking_id}
                                  booking={booking}
                                />
                              ))}
                            </SortableContext>
                          </TableBody>
                        </Table>
                      </DndContext>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Bulk Email Actions */}
      {groupedTours.length > 0 && (
        <div className="mt-8 p-6 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">Bulk Email Actions</h3>
          <div className="flex flex-wrap gap-4">
            <Button
              onClick={openBulkEmailDrawerForGuides}
              disabled={sendingBulkGuides || sendingBulkEscorts || sendingBulkHeadphones || sendingBulkPrinting}
              className="bg-brand-green hover:bg-brand-green-dark"
            >
              {sendingBulkGuides ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending to Guides... {bulkEmailProgress && `(${bulkEmailProgress.sent}/${bulkEmailProgress.total})`}
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send to Guides
                </>
              )}
            </Button>
            <Button
              onClick={openBulkEmailDrawerForEscorts}
              disabled={sendingBulkGuides || sendingBulkEscorts || sendingBulkHeadphones || sendingBulkPrinting}
              className="bg-brand-orange hover:bg-brand-orange-dark"
            >
              {sendingBulkEscorts ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending to Escorts... {bulkEmailProgress && `(${bulkEmailProgress.sent}/${bulkEmailProgress.total})`}
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send to Escorts
                </>
              )}
            </Button>
            <Button
              onClick={openBulkEmailDrawerForHeadphones}
              disabled={sendingBulkGuides || sendingBulkEscorts || sendingBulkHeadphones || sendingBulkPrinting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {sendingBulkHeadphones ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending to Headphones... {bulkEmailProgress && `(${bulkEmailProgress.sent}/${bulkEmailProgress.total})`}
                </>
              ) : (
                <>
                  <Headphones className="w-4 h-4 mr-2" />
                  Send to Headphones
                </>
              )}
            </Button>
            <Button
              onClick={openBulkEmailDrawerForPrinting}
              disabled={sendingBulkGuides || sendingBulkEscorts || sendingBulkHeadphones || sendingBulkPrinting}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {sendingBulkPrinting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending to Printing... {bulkEmailProgress && `(${bulkEmailProgress.sent}/${bulkEmailProgress.total})`}
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 mr-2" />
                  Send to Printing
                </>
              )}
            </Button>
          </div>
          <p className="text-sm text-gray-500 mt-3">
            <strong>Guides:</strong> Each guide receives one email per service with escort info included.<br/>
            <strong>Escorts:</strong> Each escort receives one consolidated email with all their services for the day.<br/>
            <strong>Headphones:</strong> Each headphone operator receives one consolidated email with all their services for the day.<br/>
            <strong>Printing:</strong> Each printing contact receives one consolidated email with all their services for the day.
          </p>
        </div>
      )}

      {/* Email Logs Section */}
      <div className="mt-8 p-6 border rounded-lg bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Email Log</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchEmailLogs(selectedDate)}
            disabled={loadingLogs}
          >
            {loadingLogs ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Refresh'
            )}
          </Button>
        </div>

        {loadingLogs ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : emailLogs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No emails sent on this date</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-3 font-medium">Time</th>
                  <th className="text-left py-2 px-3 font-medium">Recipient</th>
                  <th className="text-left py-2 px-3 font-medium">Type</th>
                  <th className="text-left py-2 px-3 font-medium">Subject</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {emailLogs.map((log) => {
                  // Status color mapping
                  const statusColors: Record<string, string> = {
                    pending: 'bg-yellow-100 text-yellow-800',
                    sent: 'bg-blue-100 text-blue-800',
                    delivered: 'bg-green-100 text-green-800',
                    read: 'bg-brand-green-light text-green-800',
                    replied: 'bg-indigo-100 text-indigo-800',
                    failed: 'bg-red-100 text-red-800'
                  }
                  const statusColor = statusColors[log.status] || 'bg-gray-100 text-gray-800'

                  return (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 whitespace-nowrap">
                        {new Date(log.sent_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-medium">{log.recipient_name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">{log.recipient_email}</div>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          log.recipient_type === 'guide' ? 'bg-brand-green-light text-green-700' :
                          log.recipient_type === 'escort' ? 'bg-brand-orange-light text-orange-700' :
                          log.recipient_type === 'headphone' ? 'bg-purple-100 text-purple-700' :
                          log.recipient_type === 'printing' ? 'bg-cyan-100 text-cyan-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {log.recipient_type || 'N/A'}
                        </span>
                      </td>
                      <td className="py-2 px-3 max-w-xs truncate" title={log.subject}>
                        {log.subject}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                          {log.status}
                        </span>
                        {log.error_message && (
                          <div className="text-xs text-red-500 mt-1" title={log.error_message}>
                            {log.error_message.substring(0, 30)}...
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Status Legend */}
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-gray-500 mb-2">Status Legend:</p>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">pending</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">sent</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">delivered</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-green-light text-green-800">read</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">replied</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">failed</span>
          </div>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && emailTimeSlot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold">Send Email</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {emailTimeSlot.tourTitle} - {emailTimeSlot.time.substring(0, 5)}
                </p>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Success Message */}
              {emailSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-700">{emailSuccess}</p>
                </div>
              )}

              {/* Error Message */}
              {emailError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-700">{emailError}</p>
                </div>
              )}

              {/* Template Selector */}
              {emailTemplates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">Email Template</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                  >
                    <option value="">-- Custom (no template) --</option>
                    {emailTemplates.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.is_default ? '(default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Recipients */}
              <div>
                <label className="block text-sm font-medium mb-2">Recipients</label>
                <div className="border rounded-lg p-3 space-y-2">
                  {(() => {
                    const staff = staffAssignments.get(emailTimeSlot.availabilityId)
                    const guides = staff?.guides || []
                    const escorts = staff?.escorts || []

                    return (
                      <>
                        {guides.length > 0 && (
                          <div>
                            <span className="text-xs text-purple-600 font-medium">Guides</span>
                            <div className="mt-1 space-y-1">
                              {guides.map(guide => (
                                <label key={guide.id} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedRecipients.includes(`guide:${guide.id}`)}
                                    onChange={() => toggleRecipient(`guide:${guide.id}`)}
                                    disabled={!guide.email}
                                    className="rounded"
                                  />
                                  <span className={!guide.email ? 'text-gray-400' : ''}>
                                    {guide.first_name} {guide.last_name}
                                    {guide.email ? ` (${guide.email})` : ' (no email)'}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        {escorts.length > 0 && (
                          <div className={guides.length > 0 ? 'pt-2 border-t' : ''}>
                            <span className="text-xs text-green-600 font-medium">Escorts</span>
                            <div className="mt-1 space-y-1">
                              {escorts.map(escort => (
                                <label key={escort.id} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={selectedRecipients.includes(`escort:${escort.id}`)}
                                    onChange={() => toggleRecipient(`escort:${escort.id}`)}
                                    disabled={!escort.email}
                                    className="rounded"
                                  />
                                  <span className={!escort.email ? 'text-gray-400' : ''}>
                                    {escort.first_name} {escort.last_name}
                                    {escort.email ? ` (${escort.email})` : ' (no email)'}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                        {guides.length === 0 && escorts.length === 0 && (
                          <p className="text-sm text-gray-500 italic">No staff assigned to this time slot</p>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium mb-2">Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium mb-2">Message</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border rounded-md text-sm font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {"{{name}}"} to insert recipient&apos;s name
                </p>
              </div>

              {/* Attachments options */}
              <div className="space-y-2">
                {attachments.filter(a => a.activity_availability_id === emailTimeSlot.availabilityId).length > 0 && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={includeAttachments}
                      onChange={(e) => setIncludeAttachments(e.target.checked)}
                      className="rounded"
                    />
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    Include {attachments.filter(a => a.activity_availability_id === emailTimeSlot.availabilityId).length} PDF attachment(s)
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeDailyList}
                    onChange={(e) => setIncludeDailyList(e.target.checked)}
                    className="rounded"
                  />
                  <Download className="w-4 h-4 text-gray-400" />
                  Include Daily List (Excel with bookings)
                </label>
                {(() => {
                  const voucherCount = slotVouchers.get(emailTimeSlot.availabilityId)?.length || 0
                  return voucherCount > 0 ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={includeVouchers}
                        onChange={(e) => setIncludeVouchers(e.target.checked)}
                        className="rounded"
                      />
                      <FileText className="w-4 h-4 text-gray-400" />
                      Include {voucherCount} Ticket Voucher(s)
                    </label>
                  ) : null
                })()}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowEmailModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSendEmail}
                  disabled={sendingEmail || selectedRecipients.length === 0}
                >
                  {sendingEmail ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send Email
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Email Selection Drawer */}
      <Sheet open={showBulkEmailDrawer} onOpenChange={setShowBulkEmailDrawer}>
        <SheetContent className="w-[450px] sm:w-[500px] flex flex-col p-0">
          {/* Header */}
          <div className={`px-6 py-5 border-b ${
            bulkEmailType === 'guides' ? 'bg-brand-green-light' :
            bulkEmailType === 'escorts' ? 'bg-brand-orange-light' :
            'bg-purple-100'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${
                bulkEmailType === 'guides' ? 'bg-green-100' :
                bulkEmailType === 'escorts' ? 'bg-orange-100' :
                'bg-purple-200'
              }`}>
                <Mail className={`w-5 h-5 ${
                  bulkEmailType === 'guides' ? 'text-green-600' :
                  bulkEmailType === 'escorts' ? 'text-orange-600' :
                  'text-purple-600'
                }`} />
              </div>
              <div>
                <SheetTitle className="text-lg font-semibold">
                  Send to {bulkEmailType === 'guides' ? 'Guides' : bulkEmailType === 'escorts' ? 'Escorts' : 'Headphones'}
                </SheetTitle>
                <p className="text-sm text-gray-500 mt-0.5">
                  {format(new Date(selectedDate), 'EEEE, MMM d, yyyy')}
                </p>
              </div>
            </div>
          </div>

          {/* Missing Templates Warning - Only for guides */}
          {bulkEmailType === 'guides' && activitiesWithoutGuideTemplates.length > 0 && (
            <div className="px-4 py-3 bg-red-50 border-b border-red-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">
                    Missing Email Templates
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    The following activities need guide templates assigned:
                  </p>
                  <ul className="text-xs text-red-600 mt-1 list-disc list-inside max-h-24 overflow-y-auto">
                    {activitiesWithoutGuideTemplates.map((title, idx) => (
                      <li key={idx}>{title}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-red-600 mt-2">
                    Go to Content Management &rarr; Activity Template Defaults to assign templates.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Recipients Section */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-6 py-3 bg-gray-50 border-b flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Recipients</span>
              <button
                onClick={() => {
                  const allIds = bulkEmailType === 'guides'
                    ? Array.from(getGuidesWithServices().keys())
                    : bulkEmailType === 'escorts'
                    ? Array.from(getEscortsWithServices().keys())
                    : bulkEmailType === 'headphones'
                    ? Array.from(getHeadphonesWithServices().keys())
                    : Array.from(getPrintingWithServices().keys())
                  if (bulkSelectedRecipients.size === allIds.length) {
                    setBulkSelectedRecipients(new Set())
                  } else {
                    setBulkSelectedRecipients(new Set(allIds))
                  }
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {bulkSelectedRecipients.size === (
                  bulkEmailType === 'guides' ? getGuidesWithServices().size :
                  bulkEmailType === 'escorts' ? getEscortsWithServices().size :
                  bulkEmailType === 'headphones' ? getHeadphonesWithServices().size :
                  getPrintingWithServices().size
                )
                  ? 'Deselect all'
                  : 'Select all'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-2">
                {bulkEmailType === 'guides' ? (
                  Array.from(getGuidesWithServices().entries()).map(([guideId, { guide, services }]) => (
                    <label
                      key={guideId}
                      htmlFor={`guide-${guideId}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        bulkSelectedRecipients.has(guideId)
                          ? 'border-green-300 bg-brand-green-light'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Checkbox
                        id={`guide-${guideId}`}
                        checked={bulkSelectedRecipients.has(guideId)}
                        onCheckedChange={() => toggleRecipientSelection(guideId)}
                        className="checkbox-green"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-900">
                            {guide.first_name} {guide.last_name}
                          </span>
                          <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                            bulkSelectedRecipients.has(guideId)
                              ? 'bg-brand-green-light text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {services.length} {services.length === 1 ? 'tour' : 'tours'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{guide.email}</p>
                      </div>
                    </label>
                  ))
                ) : bulkEmailType === 'escorts' ? (
                  Array.from(getEscortsWithServices().entries()).map(([escortId, { escort, services }]) => (
                    <label
                      key={escortId}
                      htmlFor={`escort-${escortId}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        bulkSelectedRecipients.has(escortId)
                          ? 'border-orange-300 bg-brand-orange-light'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Checkbox
                        id={`escort-${escortId}`}
                        checked={bulkSelectedRecipients.has(escortId)}
                        onCheckedChange={() => toggleRecipientSelection(escortId)}
                        className="checkbox-orange"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-900">
                            {escort.first_name} {escort.last_name}
                          </span>
                          <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                            bulkSelectedRecipients.has(escortId)
                              ? 'bg-brand-orange-light text-orange-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {services.length} {services.length === 1 ? 'service' : 'services'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{escort.email}</p>
                      </div>
                    </label>
                  ))
                ) : bulkEmailType === 'headphones' ? (
                  Array.from(getHeadphonesWithServices().entries()).map(([headphoneId, { headphone, services }]) => (
                    <label
                      key={headphoneId}
                      htmlFor={`headphone-${headphoneId}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        bulkSelectedRecipients.has(headphoneId)
                          ? 'border-purple-300 bg-purple-100'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Checkbox
                        id={`headphone-${headphoneId}`}
                        checked={bulkSelectedRecipients.has(headphoneId)}
                        onCheckedChange={() => toggleRecipientSelection(headphoneId)}
                        className="checkbox-purple"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-900">
                            {headphone.first_name} {headphone.last_name}
                          </span>
                          <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                            bulkSelectedRecipients.has(headphoneId)
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {services.length} {services.length === 1 ? 'service' : 'services'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{headphone.email}</p>
                      </div>
                    </label>
                  ))
                ) : (
                  Array.from(getPrintingWithServices().entries()).map(([printingId, { printing, services }]) => (
                    <label
                      key={printingId}
                      htmlFor={`printing-${printingId}`}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        bulkSelectedRecipients.has(printingId)
                          ? 'border-cyan-300 bg-cyan-100'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <Checkbox
                        id={`printing-${printingId}`}
                        checked={bulkSelectedRecipients.has(printingId)}
                        onCheckedChange={() => toggleRecipientSelection(printingId)}
                        className="checkbox-cyan"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-900">
                            {printing.first_name} {printing.last_name}
                          </span>
                          <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                            bulkSelectedRecipients.has(printingId)
                              ? 'bg-cyan-100 text-cyan-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {services.length} {services.length === 1 ? 'service' : 'services'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{printing.email}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Options Section - Only show for guides */}
          {bulkEmailType === 'guides' && (
            <div className="px-6 py-4 border-t bg-gray-50">
              <label
                htmlFor="include-meeting-point"
                className="flex items-start gap-3 cursor-pointer"
              >
                <Checkbox
                  id="include-meeting-point"
                  checked={includeMeetingPoint}
                  onCheckedChange={(checked) => setIncludeMeetingPoint(checked === true)}
                  className="mt-0.5 checkbox-green"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Include meeting points</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Add meeting point details for each assigned tour
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-white">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => setShowBulkEmailDrawer(false)}
                className="text-gray-600"
              >
                Cancel
              </Button>
              <Button
                onClick={
                  bulkEmailType === 'guides' ? handleSendToSelectedGuides :
                  bulkEmailType === 'escorts' ? handleSendToSelectedEscorts :
                  bulkEmailType === 'headphones' ? handleSendToSelectedHeadphones :
                  handleSendToSelectedPrinting
                }
                disabled={bulkSelectedRecipients.size === 0 || (bulkEmailType === 'guides' && activitiesWithoutGuideTemplates.length > 0)}
                className={`${
                  bulkEmailType === 'guides'
                    ? 'bg-brand-green hover:bg-brand-green-dark'
                    : bulkEmailType === 'escorts'
                    ? 'bg-brand-orange hover:bg-brand-orange-dark'
                    : bulkEmailType === 'headphones'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-cyan-600 hover:bg-cyan-700'
                } text-white px-6`}
              >
                <Send className="w-4 h-4 mr-2" />
                Send {bulkSelectedRecipients.size > 0 ? `(${bulkSelectedRecipients.size})` : ''}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}