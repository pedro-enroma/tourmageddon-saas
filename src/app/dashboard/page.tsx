// src/app/dashboard/page.tsx
'use client'

import React, { useState } from 'react'
import { Menu, ChevronRight, Users, FileBarChart, LayoutDashboard, FileText, FileSpreadsheet, BarChart3, DollarSign, TrendingUp, RefreshCw, Percent } from 'lucide-react'
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from "@/components/ui/sidebar"
import RecapPage from '@/components/RecapPage'
import ConsumedPage from '@/components/ConsumedPage'
import PaxNamesPage from '@/components/PaxNamesPage'
import MarketingExportPage from '@/components/MarketingExportPage'
import FinanceOverviewPageV2 from '@/components/FinanceOverviewPageV2'
import AvailabilitySyncPage from '@/components/AvailabilitySyncPage'
import CancellationRatePage from '@/components/CancellationRatePage'
import AffiliatesPage from './affiliates/page'

// Custom Sidebar Component
function AppSidebar({ currentView, onNavigate }: {
  currentView: string
  onNavigate: (view: string) => void
}) {
  const [operationsOpen, setOperationsOpen] = useState(true)
  const [reportsOpen, setReportsOpen] = useState(true)
  const [financeOpen, setFinanceOpen] = useState(true)

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
          title: "Sync Now",
          icon: RefreshCw,
          view: "availability-sync",
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
  ]

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <h2 className="text-xl font-bold">Tourmageddon</h2>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {menuItems.map((section) => (
              <SidebarMenuItem key={section.title}>
                <SidebarMenuButton
                  onClick={() => section.setOpen(!section.isOpen)}
                  className="w-full"
                >
                  <section.icon className="h-4 w-4" />
                  <span>{section.title}</span>
                  <ChevronRight 
                    className={`ml-auto h-4 w-4 transition-transform ${
                      section.isOpen ? "rotate-90" : ""
                    }`}
                  />
                </SidebarMenuButton>
                {section.isOpen && (
                  <SidebarMenuSub>
                    {section.items.map((item) => (
                      <SidebarMenuSubItem key={item.view}>
                        <SidebarMenuSubButton
                          onClick={() => onNavigate(item.view)}
                          isActive={currentView === item.view}
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
      default:
        return 'Dashboard'
    }
  }

  const getBreadcrumbSection = () => {
    if (['recap', 'consumed', 'pax-names', 'availability-sync'].includes(currentView)) {
      return 'Operations'
    }
    if (currentView === 'marketing-export') {
      return 'Reports'
    }
    if (currentView === 'finance-overview' || currentView === 'cancellation-rate' || currentView === 'affiliates') {
      return 'Finance'
    }
    return 'Dashboard'
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar currentView={currentView} onNavigate={setCurrentView} />
        <main className="flex-1 overflow-auto">
          <div className="border-b bg-white px-6 py-3 flex items-center gap-3">
            <SidebarTrigger>
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Dashboard</span>
              <ChevronRight className="w-4 h-4" />
              <span>{getBreadcrumbSection()}</span>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-900 font-medium">{getPageTitle()}</span>
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