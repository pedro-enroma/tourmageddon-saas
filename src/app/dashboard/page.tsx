// src/app/dashboard/page.tsx
'use client'

import React, { useState } from 'react'
import { Menu, ChevronRight, Users, FileBarChart, LayoutDashboard, FileText, FileSpreadsheet, BarChart3, DollarSign, TrendingUp, RefreshCw, Percent, UserCog, Calendar, UserCheck, FolderOpen, MapPin, Ticket, Upload, List, Tags, Link2, Bell } from 'lucide-react'
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

// Custom Sidebar Component
function AppSidebar({ currentView, onNavigate }: {
  currentView: string
  onNavigate: (view: string) => void
}) {
  const [operationsOpen, setOperationsOpen] = useState(true)
  const [ticketsOpen, setTicketsOpen] = useState(true)
  const [staffOpen, setStaffOpen] = useState(true)
  const [reportsOpen, setReportsOpen] = useState(true)
  const [financeOpen, setFinanceOpen] = useState(true)
  const [contentOpen, setContentOpen] = useState(true)

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
          title: "Sync Now",
          icon: RefreshCw,
          view: "availability-sync",
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
      ],
    },
    {
      title: "Guides & Escorts",
      icon: UserCog,
      isOpen: staffOpen,
      setOpen: setStaffOpen,
      items: [
        {
          title: "Guides List",
          icon: Users,
          view: "guides-list",
        },
        {
          title: "Escorts List",
          icon: UserCheck,
          view: "escorts-list",
        },
        {
          title: "Assignments",
          icon: Calendar,
          view: "staff-calendar",
        },
        {
          title: "Reports",
          icon: FileSpreadsheet,
          view: "staff-reports",
        },
      ],
    },
    {
      title: "Reports",
      icon: FileSpreadsheet,
      isOpen: reportsOpen,
      setOpen: setReportsOpen,
      items: [
        {
          title: "Marketing Export",
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
          title: "Cancellation Rate",
          icon: FileBarChart,
          view: "cancellation-rate",
        },
        {
          title: "Affiliates",
          icon: Percent,
          view: "affiliates",
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
                    {section.items.map((item) => (
                      <SidebarMenuSubItem key={item.view}>
                        <SidebarMenuSubButton
                          onClick={() => onNavigate(item.view)}
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

export default function DashboardLayout() {
  const [currentView, setCurrentView] = useState('recap')

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
      case 'staff-calendar':
        return <StaffCalendarPage />
      case 'staff-reports':
        return <StaffReportsPage />
      case 'marketing-export':
        return <MarketingExportPage />
      case 'finance-overview':
        return <FinanceOverviewPageV2 />
      case 'availability-sync':
        return <AvailabilitySyncPage />
      case 'cancellation-rate':
        return <CancellationRatePage />
      case 'affiliates':
        return <AffiliatesPage />
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
      case 'notifications':
        return <NotificationsPage />
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
      case 'staff-calendar':
        return 'Assignments'
      case 'staff-reports':
        return 'Staff Reports'
      case 'marketing-export':
        return 'Marketing Export'
      case 'finance-overview':
        return 'Finance Overview'
      case 'availability-sync':
        return 'Sync Now'
      case 'cancellation-rate':
        return 'Cancellation Rate'
      case 'affiliates':
        return 'Affiliate Commissions'
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
      case 'notifications':
        return 'Notifications'
      default:
        return 'Dashboard'
    }
  }

  const getBreadcrumbSection = () => {
    if (['recap', 'consumed', 'pax-names', 'daily-list', 'availability-sync', 'notifications'].includes(currentView)) {
      return 'Operations'
    }
    if (['voucher-upload', 'vouchers-list', 'ticket-categories', 'product-mappings', 'type-mappings'].includes(currentView)) {
      return 'Tickets'
    }
    if (['guides-list', 'escorts-list', 'staff-calendar', 'staff-reports'].includes(currentView)) {
      return 'Guides & Escorts'
    }
    if (currentView === 'marketing-export') {
      return 'Reports'
    }
    if (currentView === 'finance-overview' || currentView === 'cancellation-rate' || currentView === 'affiliates') {
      return 'Finance'
    }
    if (currentView === 'content') {
      return 'Content'
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
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-brand-green animate-pulse" />
              <span className="text-xs text-gray-500">Live</span>
            </div>
          </div>
          <div className="p-6">
            {renderContent()}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}