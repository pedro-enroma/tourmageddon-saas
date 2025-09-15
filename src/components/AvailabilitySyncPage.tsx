'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, ChevronDown, Search, X, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"

interface Product {
  activity_id: string
  title: string
}

export default function AvailabilitySyncPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [days, setDays] = useState(90)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' })

  useEffect(() => {
    loadAllProducts()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.dropdown-container')) {
        setIsDropdownOpen(false)
        setSearchTerm('')
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  const loadAllProducts = async () => {
    const { data: allActivities, error } = await supabase
      .from('activities')
      .select('activity_id, title')
      .order('title')

    if (!error && allActivities) {
      setProducts(allActivities)
    }
  }

  const handleSync = async () => {
    if (!selectedProduct) {
      setSyncStatus({ type: 'error', message: 'Seleziona prima un tour' })
      return
    }

    setSyncing(true)
    setSyncProgress(0)
    setSyncStatus({ type: null, message: '' })

    try {
      // Simulate progress for now (will be replaced with SSE in production)
      const progressInterval = setInterval(() => {
        setSyncProgress(prev => {
          const next = prev + (100 / days)
          return next > 95 ? 95 : next
        })
      }, 100)

      const response = await fetch('http://localhost:3000/api/sync/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: selectedProduct,
          days: days
        })
      })

      clearInterval(progressInterval)
      const data = await response.json()

      if (response.ok) {
        setSyncProgress(100)
        setSyncStatus({
          type: 'success',
          message: `Sincronizzazione completata per ${products.find(p => p.activity_id === selectedProduct)?.title || 'il tour selezionato'} per ${days} giorni`
        })
      } else {
        setSyncStatus({
          type: 'error',
          message: data.details || data.error || 'Sincronizzazione fallita'
        })
      }
    } catch (error) {
      setSyncStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Impossibile connettersi al servizio di sincronizzazione'
      })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncProgress(0), 2000)
    }
  }

  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Sincronizzazione Disponibilità</h1>
        <p className="text-gray-600">Sincronizza la disponibilità di un tour</p>
      </div>

      <div className="p-6 border rounded-lg bg-white shadow-sm">
        <div className="space-y-6">
          {/* Tour Selection */}
          <div className="dropdown-container">
            <Label>Seleziona Tour *</Label>
            <div className="mt-2 relative">
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(!isDropdownOpen)
                  if (!isDropdownOpen) {
                    setSearchTerm('')
                  }
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <span className="truncate flex-1 text-left">
                  {!selectedProduct
                    ? 'Seleziona un tour...'
                    : products.find(p => p.activity_id === selectedProduct)?.title || 'Tour selezionato'
                  }
                </span>
                <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-lg max-h-60 overflow-hidden">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                      <input
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
                          }}
                          className="absolute right-2 top-2.5 h-4 w-4 text-gray-400 hover:text-gray-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-48">
                    {searchTerm && (
                      <div className="px-3 py-1 text-xs text-gray-500 bg-gray-50">
                        {filteredProducts.length} risultati
                      </div>
                    )}
                    <div>
                      {filteredProducts.map(product => (
                        <button
                          key={product.activity_id}
                          onClick={() => {
                            setSelectedProduct(product.activity_id)
                            setIsDropdownOpen(false)
                            setSearchTerm('')
                            setSyncStatus({ type: null, message: '' })
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${
                            selectedProduct === product.activity_id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <span className="truncate">{product.title}</span>
                          {selectedProduct === product.activity_id && (
                            <div className="ml-2 w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Days Input */}
          <div>
            <Label>Numero di Giorni da Sincronizzare</Label>
            <Input
              type="number"
              min="1"
              max="365"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value) || 1)}
              className="mt-2 max-w-xs"
            />
            <p className="text-sm text-gray-500 mt-1">
              Sincronizza la disponibilità per i prossimi {days} giorni da oggi
            </p>
          </div>

          {/* Status Message */}
          {syncStatus.type && (
            <div className={`p-4 rounded-md flex items-start gap-3 ${
              syncStatus.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {syncStatus.type === 'success' ? (
                <CheckCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              )}
              <div className="text-sm">{syncStatus.message}</div>
            </div>
          )}

          {/* Sync Button and Progress */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                onClick={handleSync}
                disabled={syncing || !selectedProduct}
                className="min-w-[150px]"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sincronizzazione...' : 'Sincronizza Disponibilità'}
              </Button>

              {selectedProduct && (
                <div className="text-sm text-gray-600">
                  ID Attività: <span className="font-mono">{selectedProduct}</span>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            {(syncing || syncProgress > 0) && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Progresso sincronizzazione</span>
                  <span>{Math.round(syncProgress)}%</span>
                </div>
                <Progress value={syncProgress} className="h-2" />
                {syncing && (
                  <p className="text-xs text-gray-500">
                    Sincronizzazione in corso per {days} giorni...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Come funziona</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Seleziona un tour</li>
          <li>• Scegli quanti giorni sincronizzare a partire da oggi</li>
          <li>• Clicca &quot;Sincronizza Disponibilità&quot; per recuperare i dati più recenti da Bokun</li>
          <li>• Il processo di sincronizzazione aggiornerà il consumed</li>
        </ul>
      </div>
    </div>
  )
}