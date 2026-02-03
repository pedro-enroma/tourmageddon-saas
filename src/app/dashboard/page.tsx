// src/app/dashboard/page.tsx
'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Menu, ChevronRight, Users, FileBarChart, LayoutDashboard, FileText, FileSpreadsheet, BarChart3, DollarSign, TrendingUp, RefreshCw, Percent, UserCog, Calendar, UserCheck, FolderOpen, MapPin, Ticket, Upload, List, Tags, Link2, Bell, Settings, Shield, ClipboardList, Headphones, Printer, Activity, Landmark, Search, X, Loader2, Building2, Send, Handshake, Receipt } from 'lucide-react'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from "@/components/ui/sidebar"
import RecapPage from '@/components/RecapPage'
import ConsumedPage from '@/components/ConsumedPage'
import PaxNamesPage from '@/components/PaxNamesPage'
import DailyListPage from '@/components/DailyListPage'
import MarketingExportPage from '@/components/MarketingExportPage'
import FinanceOverviewPageV2 from '@/components/FinanceOverviewPageV2'
import AvailabilitySyncPage from '@/components/AvailabilitySyncPage'
import CancellationRatePage from '@/components/CancellationRatePage'
import AffiliatesPage from './affiliates/page'
import GuidesListPage from '@/components/GuidesListPage'
import EscortsListPage from '@/components/EscortsListPage'
import StaffCalendarPage from '@/components/StaffCalendarPage'
import StaffReportsPage from '@/components/StaffReportsPage'
import ContentPage from '@/components/ContentPage'
import VoucherUploadPage from '@/components/VoucherUploadPage'
import VouchersListPage from '@/components/VouchersListPage'
import TicketCategoriesPage from '@/components/TicketCategoriesPage'
import ProductActivityMappingsPage from '@/components/ProductActivityMappingsPage'
import TicketTypeMappingsPage from '@/components/TicketTypeMappingsPage'
import NotificationsPage from '@/components/NotificationsPage'
import UserManagementPage from '@/components/UserManagementPage'
import AuditLogsPage from '@/components/AuditLogsPage'
import BookingChangesLogPage from '@/components/BookingChangesLogPage'
import HeadphonesListPage from '@/components/HeadphonesListPage'
import PrintingListPage from '@/components/PrintingListPage'
import EscortAssignmentsPage from '@/components/EscortAssignmentsPage'
import HeadphoneAssignmentsPage from '@/components/HeadphoneAssignmentsPage'
import PrintingAssignmentsPage from '@/components/PrintingAssignmentsPage'
import ColosseumMonitoringPage from '@/components/ColosseumMonitoringPage'
import TrainMonitoringPage from '@/components/TrainMonitoringPage'
import VaticanMonitoringPage from '@/components/VaticanMonitoringPage'
import CivitatisMonitoringPage from '@/components/CivitatisMonitoringPage'
import ResourceCostsConfigPage from '@/components/ResourceCostsConfigPage'
import ServiceGroupsPage from '@/components/ServiceGroupsPage'
import FinanceCostReportsPage from '@/components/FinanceCostReportsPage'
import NewRecapPage from '@/components/NewRecapPage'
import PartnersListPage from '@/components/PartnersListPage'
import VoucherRequestsListPage from '@/components/VoucherRequestsListPage'
import ActivityPartnerMappingsPage from '@/components/ActivityPartnerMappingsPage'
import NotificationRulesPage from '@/components/NotificationRulesPage'
import InvoiceRulesPage from '@/components/InvoiceRulesPage'
import InvoicePendingPage from '@/components/InvoicePendingPage'
import InvoicesCreatedPage from '@/components/InvoicesCreatedPage'
import TourAnalyticsPage from '@/components/TourAnalyticsPage'
import { PushNotificationToggle } from '@/components/PushNotificationToggle'
import { setNotificationNavigator } from '@/components/NotificationToastProvider'
import { LucideIcon } from 'lucide-react'

// Custom SuperSantos Ball Icon
const BallIcon = ({ className, ...props }: { className?: string; [key: string]: unknown }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    width="24"
    height="24"
    {...props}
  >
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2c0 3 2 5 2 10s-2 7-2 10"/>
    <path d="M12 2c0 3-2 5-2 10s2 7 2 10"/>
    <path d="M2 12h20"/>
    <path d="M4 6h16"/>
    <path d="M4 18h16"/>
  </svg>
)

// Menu item types
interface MenuSubItem {
  title: string
  icon: LucideIcon
  view: string
}

interface MenuItem {
  title: string
  icon: LucideIcon
  view?: string
  isSubsection?: boolean
  isOpen?: boolean
  setOpen?: (open: boolean) => void
  subItems?: MenuSubItem[]
}

// Custom Sidebar Component
function AppSidebar({ currentView, onNavigate }: {
  currentView: string
  onNavigate: (view: string) => void
}) {
  const [operationsOpen, setOperationsOpen] = useState(false)
  const [ticketsOpen, setTicketsOpen] = useState(false)
  const [staffOpen, setStaffOpen] = useState(false)
  const [assignmentsOpen, setAssignmentsOpen] = useState(false)
  const [reportsOpen, setReportsOpen] = useState(false)
  const [financeOpen, setFinanceOpen] = useState(false)
  const [contentOpen, setContentOpen] = useState(false)
  const [monitoringOpen, setMonitoringOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const menuItems = [
    {
      title: "Operations",
      icon: LayoutDashboard,
      isOpen: operationsOpen,
      setOpen: setOperationsOpen,
      items: [
        {
          title: "Recap",
          icon: BarChart3,
          view: "recap",
        },
        {
          title: "SuperSantos",
          icon: BallIcon as unknown as LucideIcon,
          view: "new-recap",
        },
        {
          title: "Consumed",
          icon: FileText,
          view: "consumed",
        },
        {
          title: "Pax Names",
          icon: Users,
          view: "pax-names",
        },
        {
          title: "Daily List",
          icon: FileSpreadsheet,
          view: "daily-list",
        },
        {
          title: "Service Groups",
          icon: Link2,
          view: "service-groups",
        },
        {
          title: "Notifications",
          icon: Bell,
          view: "notifications",
        },
      ],
    },
    {
      title: "Tickets",
      icon: Ticket,
      isOpen: ticketsOpen,
      setOpen: setTicketsOpen,
      items: [
        {
          title: "Upload Voucher",
          icon: Upload,
          view: "voucher-upload",
        },
        {
          title: "All Vouchers",
          icon: List,
          view: "vouchers-list",
        },
        {
          title: "Categories",
          icon: Tags,
          view: "ticket-categories",
        },
        {
          title: "Product Mappings",
          icon: Link2,
          view: "product-mappings",
        },
        {
          title: "Type Mappings",
          icon: Link2,
          view: "type-mappings",
        },
        {
          title: "Voucher Requests",
          icon: Send,
          view: "voucher-requests",
        },
        {
          title: "Activity-Partner",
          icon: Handshake,
          view: "activity-partner-mappings",
        },
      ],
    },
    {
      title: "Staff",
      icon: UserCog,
      isOpen: staffOpen,
      setOpen: setStaffOpen,
      items: [
        {
          title: "Guides",
          icon: Users,
          view: "guides-list",
        },
        {
          title: "Escorts",
          icon: UserCheck,
          view: "escorts-list",
        },
        {
          title: "Headphones",
          icon: Headphones,
          view: "headphones-list",
        },
        {
          title: "Printing",
          icon: Printer,
          view: "printing-list",
        },
        {
          title: "Partners",
          icon: Building2,
          view: "partners-list",
        },
        {
          title: "Assignments",
          icon: Calendar,
          isSubsection: true,
          isOpen: assignmentsOpen,
          setOpen: setAssignmentsOpen,
          subItems: [
            {
              title: "Guides",
              icon: Users,
              view: "guide-assignments",
            },
            {
              title: "Escorts",
              icon: UserCheck,
              view: "escort-assignments",
            },
            {
              title: "Headphones",
              icon: Headphones,
              view: "headphone-assignments",
            },
            {
              title: "Printing",
              icon: Printer,
              view: "printing-assignments",
            },
          ],
        },
        {
          title: "Staff Cost",
          icon: DollarSign,
          view: "resource-costs",
        },
        {
          title: "Staff Reports",
          icon: FileSpreadsheet,
          view: "staff-reports",
        },
      ],
    },
    {
      title: "Marketing",
      icon: FileSpreadsheet,
      isOpen: reportsOpen,
      setOpen: setReportsOpen,
      items: [
        {
          title: "Export",
          icon: FileBarChart,
          view: "marketing-export",
        },
      ],
    },
    {
      title: "Finance",
      icon: DollarSign,
      isOpen: financeOpen,
      setOpen: setFinanceOpen,
      items: [
        {
          title: "Overview",
          icon: TrendingUp,
          view: "finance-overview",
        },
        {
          title: "Tour Analytics",
          icon: BarChart3,
          view: "tour-analytics",
        },
        // {
        //   title: "Cancellation Rate",
        //   icon: FileBarChart,
        //   view: "cancellation-rate",
        // },
        {
          title: "Affiliates",
          icon: Percent,
          view: "affiliates",
        },
        {
          title: "Invoice Rules",
          icon: Receipt,
          view: "invoice-rules",
        },
        {
          title: "Pending Invoices",
          icon: Receipt,
          view: "invoice-pending",
        },
        {
          title: "Invoices Created",
          icon: Receipt,
          view: "invoices-created",
        },
        {
          title: "Cost Reports",
          icon: FileBarChart,
          view: "cost-reports",
        },
      ],
    },
    {
      title: "Content",
      icon: FolderOpen,
      isOpen: contentOpen,
      setOpen: setContentOpen,
      items: [
        {
          title: "Templates & Points",
          icon: MapPin,
          view: "content",
        },
      ],
    },
    {
      title: "Monitoring",
      icon: Activity,
      isOpen: monitoringOpen,
      setOpen: setMonitoringOpen,
      items: [
        {
          title: "Colosseum",
          icon: Landmark,
          view: "monitoring-colosseum",
        },
        {
          title: "Vatican",
          icon: Building2,
          view: "monitoring-vatican",
        },
        {
          title: "Trains",
          icon: TrendingUp,
          view: "monitoring-trains",
        },
        {
          title: "Civitatis",
          icon: Search,
          view: "monitoring-civitatis",
        },
      ],
    },
    {
      title: "Settings",
      icon: Settings,
      isOpen: settingsOpen,
      setOpen: setSettingsOpen,
      items: [
        {
          title: "Users",
          icon: Shield,
          view: "user-management",
        },
        {
          title: "Notification Rules",
          icon: Bell,
          view: "notification-rules",
        },
        {
          title: "Audit Logs",
          icon: ClipboardList,
          view: "audit-logs",
        },
        {
          title: "Booking Changes",
          icon: List,
          view: "booking-changes",
        },
        {
          title: "Sync Now",
          icon: RefreshCw,
          view: "availability-sync",
        },
      ],
    },
  ]

  return (
    <Sidebar className="bg-[#1a1a1a] border-r border-gray-800">
      <SidebarHeader className="border-b border-gray-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-gradient flex items-center justify-center">
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Tourmageddon</h2>
            <p className="text-xs text-gray-500">Operations Dashboard</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarMenu className="space-y-1">
            {menuItems.map((section) => (
              <SidebarMenuItem key={section.title}>
                <SidebarMenuButton
                  onClick={() => section.setOpen(!section.isOpen)}
                  className="w-full text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
                >
                  <section.icon className="h-4 w-4" />
                  <span className="font-medium">{section.title}</span>
                  <ChevronRight
                    className={`ml-auto h-4 w-4 transition-transform ${
                      section.isOpen ? "rotate-90" : ""
                    }`}
                  />
                </SidebarMenuButton>
                {section.isOpen && (
                  <SidebarMenuSub className="ml-4 mt-1 space-y-0.5 border-l border-gray-800 pl-3">
                    {section.items.map((item: MenuItem) => (
                      item.isSubsection ? (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton
                            onClick={() => item.setOpen?.(!item.isOpen)}
                            className="w-full text-gray-500 hover:text-white hover:bg-gray-800/50 rounded-lg transition-colors"
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                            <ChevronRight
                              className={`ml-auto h-4 w-4 transition-transform ${
                                item.isOpen ? "rotate-90" : ""
                              }`}
                            />
                          </SidebarMenuSubButton>
                          {item.isOpen && (
                            <SidebarMenuSub className="ml-4 mt-1 space-y-0.5 border-l border-gray-800 pl-3">
                              {item.subItems?.map((subItem: MenuSubItem) => (
                                <SidebarMenuSubItem key={subItem.view}>
                                  <SidebarMenuSubButton
                                    onClick={() => onNavigate(subItem.view)}
                                    isActive={currentView === subItem.view}
                                    className={`rounded-lg transition-all ${
                                      currentView === subItem.view
                                        ? 'bg-brand-orange text-white font-medium'
                                        : 'text-gray-500 hover:text-white hover:bg-gray-800/50'
                                    }`}
                                  >
                                    <subItem.icon className="h-4 w-4" />
                                    <span>{subItem.title}</span>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          )}
                        </SidebarMenuSubItem>
                      ) : item.view ? (
                        <SidebarMenuSubItem key={item.view}>
                          <SidebarMenuSubButton
                            onClick={() => onNavigate(item.view!)}
                            isActive={currentView === item.view}
                            className={`rounded-lg transition-all ${
                              currentView === item.view
                                ? 'bg-brand-orange text-white font-medium'
                                : 'text-gray-500 hover:text-white hover:bg-gray-800/50'
                            }`}
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : null
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

// Search Dialog Component
interface SearchResult {
  activity_booking_id: string
  booking_id: string
  product_title: string
  start_date_time: string
  status: string
  activity_id: string
  bookings: {
    booking_id: string
    total_price: number
    currency: string
  }
  customer_first_name: string | null
  customer_last_name: string | null
  customer_email: string | null
  customer_phone: string | null
}

interface BookingDetail {
  activity_booking_id: string
  booking_id: string
  activity_id: string
  product_title: string
  start_date_time: string
  start_time: string
  status: string
  current_slot_id: number | null
  bookings: {
    booking_id: string
    total_price: number
    currency: string
    status: string
  }
  pricing_category_bookings: {
    pricing_category_booking_id: number
    pricing_category_id: string
    booked_title: string
    quantity: number
    passenger_first_name: string | null
    passenger_last_name: string | null
    passenger_date_of_birth: string | null
  }[]
  customer: {
    customer_id: string
    first_name: string
    last_name: string
    email: string
    phone_number: string
  } | null
  available_slots: {
    id: number
    activity_id: string
    local_date: string
    local_time: string
    vacancy_available: number
    vacancy_opening: number
  }[]
  available_pricing_categories: {
    pricing_category_id: string
    title: string
  }[]
}

function SearchDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [editedParticipants, setEditedParticipants] = useState<BookingDetail['pricing_category_bookings']>([])
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current && !selectedBooking) {
      inputRef.current.focus()
    }
  }, [isOpen, selectedBooking])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedBooking) {
          setSelectedBooking(null)
        } else {
          onClose()
        }
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose, selectedBooking])

  useEffect(() => {
    const searchBookings = async () => {
      if (query.trim().length < 2) {
        setResults([])
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Search failed')
        }

        setResults(data.data || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed')
        setResults([])
      } finally {
        setLoading(false)
      }
    }

    const debounce = setTimeout(searchBookings, 300)
    return () => clearTimeout(debounce)
  }, [query])

  const fetchBookingDetail = async (activityBookingId: string) => {
    setLoadingDetail(true)
    try {
      const response = await fetch(`/api/search/${activityBookingId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load booking')
      }

      setSelectedBooking(data.data)
      setEditedParticipants(data.data.pricing_category_bookings || [])
      setSelectedSlot(data.data.current_slot_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load booking')
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleSave = async () => {
    if (!selectedBooking) return

    setSaving(true)
    setSaveSuccess(false)

    try {
      const response = await fetch(`/api/search/${selectedBooking.activity_booking_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: selectedSlot !== selectedBooking.current_slot_id ? selectedSlot : undefined,
          participants: editedParticipants
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save changes')
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const updateParticipant = (index: number, field: string, value: string) => {
    setEditedParticipants(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value || null }
      return updated
    })
  }

  if (!isOpen) return null

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'CONFIRMED': return 'bg-green-100 text-green-800'
      case 'CANCELLED': return 'bg-red-100 text-red-800'
      case 'PENDING': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // Booking Detail View
  if (selectedBooking) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-10" onClick={() => setSelectedBooking(null)}>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <div
          className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedBooking(null)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <ChevronRight className="h-5 w-5 text-gray-500 rotate-180" />
              </button>
              <div>
                <h3 className="font-semibold text-gray-900">{selectedBooking.product_title}</h3>
                <div className="text-sm text-gray-500">
                  <span className="font-mono">{selectedBooking.booking_id}</span>
                  <span className="mx-2">•</span>
                  <span className="font-mono">{selectedBooking.activity_booking_id}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedBooking(null)} className="p-1 hover:bg-gray-200 rounded">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Customer Info */}
            {selectedBooking.customer && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-700 mb-2">Customer</h4>
                <div className="text-sm text-gray-600">
                  <p>{selectedBooking.customer.first_name} {selectedBooking.customer.last_name}</p>
                  <p>{selectedBooking.customer.email}</p>
                  {selectedBooking.customer.phone_number && <p>{selectedBooking.customer.phone_number}</p>}
                </div>
              </div>
            )}

            {/* Date/Time Slot Selection */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Date & Time</h4>
              <p className="text-sm text-gray-500 mb-2">
                Current: {formatDate(selectedBooking.start_date_time)} at {selectedBooking.start_time?.substring(0, 5)}
              </p>
              {selectedBooking.available_slots.length > 0 && (
                <select
                  value={selectedSlot || ''}
                  onChange={(e) => setSelectedSlot(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
                >
                  {selectedBooking.available_slots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.local_date} at {slot.local_time?.substring(0, 5)}
                      {slot.vacancy_available !== undefined && ` (${slot.vacancy_available} available)`}
                      {slot.id === selectedBooking.current_slot_id && ' (current)'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Participants */}
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Participants ({editedParticipants.length})</h4>
              <div className="space-y-4">
                {editedParticipants.map((participant, index) => (
                  <div key={participant.pricing_category_booking_id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1">
                        <label className="text-xs text-gray-500">Type:</label>
                        <select
                          value={participant.booked_title}
                          onChange={(e) => {
                            const selectedCategory = selectedBooking?.available_pricing_categories.find(
                              c => c.title === e.target.value
                            )
                            updateParticipant(index, 'booked_title', e.target.value)
                            if (selectedCategory) {
                              updateParticipant(index, 'pricing_category_id', selectedCategory.pricing_category_id)
                            }
                          }}
                          className="border border-gray-300 rounded px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-orange"
                        >
                          <option value={participant.booked_title}>{participant.booked_title}</option>
                          {selectedBooking?.available_pricing_categories
                            .filter(c => c.title !== participant.booked_title)
                            .map((category, idx) => (
                              <option key={`${category.title}-${idx}`} value={category.title}>
                                {category.title}
                              </option>
                            ))}
                        </select>
                        {participant.quantity > 1 && (
                          <span className="text-sm text-gray-500">(x{participant.quantity})</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">#{participant.pricing_category_booking_id}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">First Name</label>
                        <input
                          type="text"
                          value={participant.passenger_first_name || ''}
                          onChange={(e) => updateParticipant(index, 'passenger_first_name', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
                          placeholder="First name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Last Name</label>
                        <input
                          type="text"
                          value={participant.passenger_last_name || ''}
                          onChange={(e) => updateParticipant(index, 'passenger_last_name', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
                          placeholder="Last name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Date of Birth</label>
                        <input
                          type="date"
                          value={participant.passenger_date_of_birth || ''}
                          onChange={(e) => updateParticipant(index, 'passenger_date_of_birth', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-orange"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {editedParticipants.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No participant details available</p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <div className="text-xs text-gray-400">
              Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded">ESC</kbd> to go back
            </div>
            <div className="flex items-center gap-3">
              {saveSuccess && (
                <span className="text-sm text-green-600">Saved successfully!</span>
              )}
              <button
                onClick={() => setSelectedBooking(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-brand-orange text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Search Results View
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by booking ID, activity booking ID, or email..."
            className="flex-1 text-lg outline-none placeholder:text-gray-400"
          />
          {(loading || loadingDetail) && <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />}
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="px-4 py-3 text-red-600 text-sm">{error}</div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && !error && (
            <div className="px-4 py-8 text-center text-gray-500">
              No bookings found for &quot;{query}&quot;
            </div>
          )}

          {query.length < 2 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              Type at least 2 characters to search
            </div>
          )}

          {results.map((result) => (
            <div
              key={result.activity_booking_id}
              onClick={() => fetchBookingDetail(result.activity_booking_id)}
              className="px-4 py-3 hover:bg-blue-50 border-b last:border-b-0 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {result.product_title}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-2">
                      {result.booking_id}
                    </span>
                    <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                      {result.activity_booking_id}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {result.customer_first_name || result.customer_last_name ? (
                      <>
                        {result.customer_first_name} {result.customer_last_name}
                        {result.customer_email && (
                          <span className="text-gray-400 ml-2">{result.customer_email}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400">No customer info</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(result.status)}`}>
                    {result.status}
                  </span>
                  <div className="text-sm text-gray-600 mt-1">
                    {formatDate(result.start_date_time)}
                  </div>
                  {result.bookings?.total_price && (
                    <div className="text-sm text-gray-500 mt-0.5">
                      {result.bookings.currency || '€'}{result.bookings.total_price.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-400">
          Press <kbd className="px-1.5 py-0.5 bg-gray-200 rounded">ESC</kbd> to close • Click a booking to edit
        </div>
      </div>
    </div>
  )
}

// App version and changelog
const APP_VERSION = '4.2'
const CHANGELOG = [
  {
    version: '4.2',
    date: '2026-01-22',
    changes: [
      { type: 'feature', text: 'Vatican Monitoring - Track Vatican ticket prices and availability' },
      { type: 'feature', text: 'Train Monitoring - Track train prices between Rome and other cities' },
      { type: 'feature', text: 'Civitatis Monitoring - Track Civitatis tour prices and availability' },
    ]
  },
  {
    version: '4.1',
    date: '2026-01-21',
    changes: [
      { type: 'feature', text: 'Notification Rules - Create automated notification rules with visual condition builder' },
      { type: 'feature', text: 'Rule Triggers - booking_cancelled, voucher_uploaded, age_mismatch, sync_failure events' },
      { type: 'feature', text: 'Multi-channel Delivery - Push notifications and Email via Resend' },
      { type: 'feature', text: 'Real-time Toast Notifications - In-app alerts with persistent toasts until dismissed' },
      { type: 'feature', text: 'Template Variables - Dynamic content with {customer_name}, {booking_id}, etc.' },
      { type: 'improvement', text: 'Rule-triggered alerts appear in Operations > Notifications > Alerts' },
      { type: 'improvement', text: 'Security hardening - Admin role verification on all notification endpoints' },
    ]
  },
  {
    version: '4.0',
    date: '2026-01-20',
    changes: [
      { type: 'feature', text: 'Planned Availabilities - Create blue "fake" slots before Bokun sync, auto-match when real availability arrives' },
      { type: 'feature', text: 'Operation Notes - Thread-based notes linked to dates, slots, guides, escorts, or vouchers' },
      { type: 'feature', text: 'Manual Voucher Entry - Create placeholder vouchers with ticket counts before names are known' },
      { type: 'feature', text: 'Deadline Tracking - Configure name deadline days per category with escalation system' },
      { type: 'feature', text: 'Notes in Daily List - Access operation notes from Daily List page' },
      { type: 'improvement', text: 'Guide names show first name only with full name on hover' },
      { type: 'improvement', text: 'Guide assignments work on planned slots and transfer when matched' },
    ]
  },
  {
    version: '3.5',
    date: '2026-01-07',
    changes: [
      { type: 'feature', text: 'SuperSantos Page - New comprehensive daily operations view with guide/escort/headphone costs, email status, and multi-slot assignments' },
      { type: 'feature', text: 'Special Guide Costs - Configure guide-specific pricing per activity for seasonal and special dates' },
      { type: 'feature', text: 'Multi-slot Escort Assignment - Assign escorts to multiple time slots at once' },
      { type: 'improvement', text: 'SuperSantos moved to Operations menu with custom ball icon' },
    ]
  },
  {
    version: '3.0',
    date: '2025-12-19',
    changes: [
      { type: 'feature', text: 'Search & Edit Bookings - Search by booking ID or email, edit participant names, DOB, types, and reschedule' },
      { type: 'feature', text: 'Booking Changes Log - Track all modifications to bookings with user and timestamp' },
      { type: 'feature', text: 'Seasonal Pricing - Configure guide costs by season and special dates' },
      { type: 'feature', text: 'Invoicing Module - Generate and manage invoices' },
      { type: 'feature', text: 'Staff Cost Configuration - Set costs for guides, escorts, headphones, and printing per activity' },
      { type: 'feature', text: 'Profitability Reports - View revenue, costs, and margins by activity or date' },
      { type: 'feature', text: 'Service Groups - Group guides working together on the same service' },
      { type: 'improvement', text: 'Sidebar reorganization - Assignments section, collapsed menus by default' },
      { type: 'improvement', text: 'Deprecated pricing categories filtered from dropdowns' },
    ]
  },
  {
    version: '2.5',
    date: '2025-11-15',
    changes: [
      { type: 'feature', text: 'Colosseum Monitoring - Track availability and booking patterns' },
      { type: 'feature', text: 'Printing Assignments - Manage printing resource assignments' },
      { type: 'feature', text: 'Headphone Assignments - Manage headphone resource assignments' },
      { type: 'improvement', text: 'Email templates with consolidated guide information' },
    ]
  },
  {
    version: '2.0',
    date: '2025-10-01',
    changes: [
      { type: 'feature', text: 'Guide and Escort Assignments' },
      { type: 'feature', text: 'Daily List and Recap pages' },
      { type: 'feature', text: 'Voucher Upload and Processing' },
      { type: 'feature', text: 'Notification System' },
      { type: 'feature', text: 'User Management with MFA' },
    ]
  }
]

export default function DashboardLayout() {
  const [currentView, setCurrentView] = useState('recap')
  const [searchOpen, setSearchOpen] = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)

  // Register navigation function for toast notifications
  useEffect(() => {
    setNotificationNavigator(setCurrentView)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') {
        setChangelogOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const renderContent = () => {
    switch (currentView) {
      case 'recap':
        return <RecapPage />
      case 'consumed':
        return <ConsumedPage />
      case 'pax-names':
        return <PaxNamesPage />
      case 'daily-list':
        return <DailyListPage />
      case 'guides-list':
        return <GuidesListPage />
      case 'escorts-list':
        return <EscortsListPage />
      case 'headphones-list':
        return <HeadphonesListPage />
      case 'printing-list':
        return <PrintingListPage />
      case 'guide-assignments':
        return <StaffCalendarPage />
      case 'escort-assignments':
        return <EscortAssignmentsPage />
      case 'headphone-assignments':
        return <HeadphoneAssignmentsPage />
      case 'printing-assignments':
        return <PrintingAssignmentsPage />
      case 'staff-reports':
        return <StaffReportsPage />
      case 'marketing-export':
        return <MarketingExportPage />
      case 'new-recap':
        return <NewRecapPage />
      case 'finance-overview':
        return <FinanceOverviewPageV2 />
      case 'tour-analytics':
        return <TourAnalyticsPage />
      case 'availability-sync':
        return <AvailabilitySyncPage />
      case 'cancellation-rate':
        return <CancellationRatePage />
      case 'affiliates':
        return <AffiliatesPage />
      case 'invoice-rules':
        return <InvoiceRulesPage />
      case 'invoice-pending':
        return <InvoicePendingPage />
      case 'invoices-created':
        return <InvoicesCreatedPage />
      case 'content':
        return <ContentPage />
      case 'voucher-upload':
        return <VoucherUploadPage />
      case 'vouchers-list':
        return <VouchersListPage />
      case 'ticket-categories':
        return <TicketCategoriesPage />
      case 'product-mappings':
        return <ProductActivityMappingsPage />
      case 'type-mappings':
        return <TicketTypeMappingsPage />
      case 'voucher-requests':
        return <VoucherRequestsListPage />
      case 'activity-partner-mappings':
        return <ActivityPartnerMappingsPage />
      case 'partners-list':
        return <PartnersListPage />
      case 'notifications':
        return <NotificationsPage />
      case 'notification-rules':
        return <NotificationRulesPage />
      case 'user-management':
        return <UserManagementPage />
      case 'audit-logs':
        return <AuditLogsPage />
      case 'booking-changes':
        return <BookingChangesLogPage />
      case 'monitoring-colosseum':
        return <ColosseumMonitoringPage />
      case 'monitoring-trains':
        return <TrainMonitoringPage />
      case 'monitoring-vatican':
        return <VaticanMonitoringPage />
      case 'monitoring-civitatis':
        return <CivitatisMonitoringPage />
      case 'resource-costs':
        return <ResourceCostsConfigPage />
      case 'service-groups':
        return <ServiceGroupsPage />
      case 'cost-reports':
        return <FinanceCostReportsPage />
      default:
        return <RecapPage />
    }
  }

  const getPageTitle = () => {
    switch (currentView) {
      case 'recap':
        return 'Recap'
      case 'consumed':
        return 'Service Consumed'
      case 'pax-names':
        return 'Pax Names'
      case 'daily-list':
        return 'Daily List'
      case 'guides-list':
        return 'Guides List'
      case 'escorts-list':
        return 'Escorts List'
      case 'headphones-list':
        return 'Headphones'
      case 'printing-list':
        return 'Printing'
      case 'guide-assignments':
        return 'Guide Assignments'
      case 'escort-assignments':
        return 'Escort Assignments'
      case 'headphone-assignments':
        return 'Headphone Assignments'
      case 'printing-assignments':
        return 'Printing Assignments'
      case 'staff-reports':
        return 'Staff Reports'
      case 'marketing-export':
        return 'Marketing Export'
      case 'finance-overview':
        return 'Finance Overview'
      case 'tour-analytics':
        return 'Tour Analytics'
      case 'availability-sync':
        return 'Sync Now'
      case 'cancellation-rate':
        return 'Cancellation Rate'
      case 'affiliates':
        return 'Affiliate Commissions'
      case 'invoice-rules':
        return 'Invoice Rules'
      case 'invoice-pending':
        return 'Pending Invoices'
      case 'invoices-created':
        return 'Invoices Created'
      case 'content':
        return 'Templates & Meeting Points'
      case 'voucher-upload':
        return 'Upload Voucher'
      case 'vouchers-list':
        return 'All Vouchers'
      case 'ticket-categories':
        return 'Ticket Categories'
      case 'product-mappings':
        return 'Product-Activity Mappings'
      case 'type-mappings':
        return 'Ticket Type Mappings'
      case 'voucher-requests':
        return 'Voucher Requests'
      case 'activity-partner-mappings':
        return 'Activity-Partner Mappings'
      case 'partners-list':
        return 'Partners'
      case 'notifications':
        return 'Notifications'
      case 'notification-rules':
        return 'Notification Rules'
      case 'user-management':
        return 'User Management'
      case 'audit-logs':
        return 'Audit Logs'
      case 'booking-changes':
        return 'Booking Changes'
      case 'monitoring-colosseum':
        return 'Colosseum Monitoring'
      case 'monitoring-trains':
        return 'Train Price Tracker'
      case 'monitoring-vatican':
        return 'Vatican Price Monitor'
      case 'monitoring-civitatis':
        return 'Civitatis Monitor'
      case 'resource-costs':
        return 'Staff Cost'
      case 'service-groups':
        return 'Service Groups'
      case 'cost-reports':
        return 'Cost Reports'
      default:
        return 'Dashboard'
    }
  }

  const getBreadcrumbSection = () => {
    if (['recap', 'consumed', 'pax-names', 'daily-list', 'service-groups', 'notifications'].includes(currentView)) {
      return 'Operations'
    }
    if (['voucher-upload', 'vouchers-list', 'ticket-categories', 'product-mappings', 'type-mappings', 'activity-partner-mappings', 'voucher-requests'].includes(currentView)) {
      return 'Tickets'
    }
    if (['guides-list', 'escorts-list', 'headphones-list', 'printing-list', 'guide-assignments', 'escort-assignments', 'headphone-assignments', 'printing-assignments', 'resource-costs'].includes(currentView)) {
      return 'Staff'
    }
    if (['marketing-export', 'staff-reports'].includes(currentView)) {
      return 'Reports'
    }
    if (['finance-overview', 'cancellation-rate', 'affiliates', 'invoice-rules', 'invoice-pending', 'invoices-created', 'cost-reports'].includes(currentView)) {
      return 'Finance'
    }
    if (currentView === 'content') {
      return 'Content'
    }
    if (['user-management', 'notification-rules', 'audit-logs', 'booking-changes', 'availability-sync'].includes(currentView)) {
      return 'Settings'
    }
    if (['monitoring-colosseum', 'monitoring-trains', 'monitoring-vatican', 'monitoring-civitatis'].includes(currentView)) {
      return 'Monitoring'
    }
    return 'Dashboard'
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-gray-50">
        <AppSidebar currentView={currentView} onNavigate={setCurrentView} />
        <main className="flex-1 overflow-auto">
          <div className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Menu className="h-5 w-5 text-gray-600" />
              </SidebarTrigger>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">Dashboard</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
                <span className="text-gray-400">{getBreadcrumbSection()}</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
                <span className="text-brand-orange font-semibold">{getPageTitle()}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Search bookings (Ctrl+K)"
              >
                <Search className="h-5 w-5 text-gray-500" />
              </button>
              <PushNotificationToggle />
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-brand-green animate-pulse" />
                <span className="text-xs text-gray-500">Live</span>
              </div>
              <button
                onClick={() => setChangelogOpen(true)}
                className="px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                title="View changelog"
              >
                v{APP_VERSION}
              </button>
            </div>
          </div>
          <div className="p-6">
            {renderContent()}
          </div>
        </main>
      </div>
      <SearchDialog isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Changelog Modal */}
      {changelogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setChangelogOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-brand-orange to-brand-red">
              <div>
                <h2 className="text-xl font-bold text-white">Changelog</h2>
                <p className="text-sm text-white/80">What&apos;s new in Tourmageddon</p>
              </div>
              <button
                onClick={() => setChangelogOpen(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              {CHANGELOG.map((release, idx) => (
                <div key={release.version} className={idx > 0 ? 'mt-8 pt-8 border-t border-gray-200' : ''}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="px-3 py-1 bg-brand-orange text-white text-sm font-bold rounded-full">
                      v{release.version}
                    </span>
                    <span className="text-sm text-gray-500">{release.date}</span>
                    {idx === 0 && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                        Latest
                      </span>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {release.changes.map((change, changeIdx) => (
                      <li key={changeIdx} className="flex items-start gap-2">
                        <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                          change.type === 'feature'
                            ? 'bg-blue-100 text-blue-700'
                            : change.type === 'improvement'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {change.type === 'feature' ? 'NEW' : change.type === 'improvement' ? 'IMP' : 'FIX'}
                        </span>
                        <span className="text-sm text-gray-700">{change.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-center">
              <p className="text-xs text-gray-500">Press ESC to close</p>
            </div>
          </div>
        </div>
      )}
    </SidebarProvider>
  )
}
