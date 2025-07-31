'use client'

import React, { useState } from 'react'
import { Menu, ChevronRight, TableProperties, Users, FileBarChart, X, Search, User, LogOut, HelpCircle } from 'lucide-react'
import ConsumedPage from '@/components/ConsumedPage'
import PaxNamesPage from '@/components/PaxNamesPage'
import ReportsPage from '@/components/ReportsPage'

// Componente Sidebar inline per evitare problemi di import
function AppSidebar({ isOpen, onClose, currentPage, setCurrentPage }: {
  isOpen: boolean
  onClose: () => void
  currentPage: 'consumed' | 'pax-names' | 'reports'
  setCurrentPage: (page: 'consumed' | 'pax-names' | 'reports') => void
}) {
  const menuItems = [
    { 
      id: 'consumed' as const, 
      label: 'Consumed', 
      icon: TableProperties
    },
    { 
      id: 'pax-names' as const, 
      label: 'Pax Names', 
      icon: Users
    },
    { 
      id: 'reports' as const, 
      label: 'Reports', 
      icon: FileBarChart
    }
  ]

  return (
    <aside className={`
      fixed lg:static inset-y-0 left-0 z-50
      w-72 bg-white border-r border-gray-200
      transform transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
    `}>
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Tourmageddon</h1>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Search */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setCurrentPage(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                  ${currentPage === item.id 
                    ? 'bg-blue-50 text-blue-600' 
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                <span className="flex-1 text-left font-medium">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sidebar Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-gray-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Admin User</p>
            <p className="text-xs text-gray-500">admin@example.com</p>
          </div>
        </div>
        
        <div className="space-y-1">
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <HelpCircle className="w-4 h-4" />
            <span>Help</span>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  )
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentPage, setCurrentPage] = useState<'consumed' | 'pax-names' | 'reports'>('consumed')

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Overlay per mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <AppSidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Dashboard</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-900">
                {currentPage === 'consumed' && 'Consumed'}
                {currentPage === 'pax-names' && 'Pax Names'}
                {currentPage === 'reports' && 'Reports'}
              </span>
            </nav>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {currentPage === 'consumed' && <ConsumedPage />}
          {currentPage === 'pax-names' && <PaxNamesPage />}
          {currentPage === 'reports' && <ReportsPage />}
        </main>
      </div>
    </div>
  )
}