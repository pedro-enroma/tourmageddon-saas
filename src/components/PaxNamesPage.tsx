import React from 'react'
import { Users } from 'lucide-react'

export default function PaxNamesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Users className="w-16 h-16 text-gray-400 mb-4" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Pax Names</h1>
      <p className="text-gray-500 text-center max-w-md">
        This page will display passenger information and allow you to manage passenger data.
      </p>
      <div className="mt-8 p-8 bg-gray-100 rounded-lg">
        <p className="text-sm text-gray-600">Coming soon...</p>
      </div>
    </div>
  )
}