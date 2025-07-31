import React, { useState } from 'react'
import { Menu, ChevronRight } from 'lucide-react'
import AppSidebar from './components/Sidebar'
import ConsumedPage from './components/ConsumedPage'
import PaxNamesPage from './components/PaxNamesPage'
import ReportsPage from './components/ReportsPage'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentPage, setCurrentPage] = useState('consumed')

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
        <main className="flex-1 p-6 overflow-auto">
          {currentPage === 'consumed' && <ConsumedPage />}
          {currentPage === 'pax-names' && <PaxNamesPage />}
          {currentPage === 'reports' && <ReportsPage />}
        </main>
      </div>
    </div>
  )
}