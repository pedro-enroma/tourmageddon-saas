import React from 'react'
import { FileBarChart } from 'lucide-react'

export default function ReportsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <FileBarChart className="w-16 h-16 text-gray-400 mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Reports</h1>
      <p className="text-gray-500 text-center max-w-md">
        Generate and view various reports about consumed data and passenger information.
      </p>
      <div className="mt-8 p-8 bg-gray-100 rounded-lg">
        <p className="text-sm text-gray-600">Coming soon...</p>
      </div>
    </div>
  )
}