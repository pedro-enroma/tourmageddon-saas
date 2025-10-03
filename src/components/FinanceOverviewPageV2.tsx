'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, Search, TrendingUp, TrendingDown, ArrowRight, AlertCircle, X, Download, RotateCcw } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { format, subDays, subMonths, subYears, startOfYear, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import * as XLSX from 'xlsx'

// Constants
const ENROMA_SELLER = 'EnRoma.com' as const

type MetricType = 'revenue' | 'reservations'
type DateRangeType = 'today' | 'yesterday' | 'last7days' | 'lastWeek' | 'last30days' | 'lastMonth' | 'yearToDate' | 'custom'
type ComparisonType = 'lastWeek' | 'lastMonth' | 'lastYear' | 'custom'

interface ChartData {
  date: string
  EnRoma?: number
  Resellers?: number
  value?: number
}

interface FinanceData {
  activity_date: string
  booking_date: string
  seller_group: string
  original_seller: string
  affiliate_id: string | null
  reservation_count: number
  total_revenue: number
  unique_bookings: number
  total_participants?: number
}

export default function FinanceOverviewPage() {
  const [metricType, setMetricType] = useState<MetricType>('revenue')
  const [showIndividualSellers, setShowIndividualSellers] = useState(false)

  // Transaction Date
  const [transactionDateRange, setTransactionDateRange] = useState<DateRangeType | undefined>('last30days')
  const [customTransactionStart, setCustomTransactionStart] = useState<Date | undefined>()
  const [customTransactionEnd, setCustomTransactionEnd] = useState<Date | undefined>()
  const [transactionComparison, setTransactionComparison] = useState<ComparisonType>('lastMonth')
  const [customTransactionCompStart, setCustomTransactionCompStart] = useState<Date | undefined>()
  const [customTransactionCompEnd, setCustomTransactionCompEnd] = useState<Date | undefined>()
  
  // Tour Date
  const [tourDateRange, setTourDateRange] = useState<DateRangeType | undefined>()
  const [customTourStart, setCustomTourStart] = useState<Date | undefined>()
  const [customTourEnd, setCustomTourEnd] = useState<Date | undefined>()
  const [tourComparison, setTourComparison] = useState<ComparisonType>('lastMonth')
  const [customTourCompStart, setCustomTourCompStart] = useState<Date | undefined>()
  const [customTourCompEnd, setCustomTourCompEnd] = useState<Date | undefined>()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rawData, setRawData] = useState<FinanceData[]>([])
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [previousPeriodData, setPreviousPeriodData] = useState<FinanceData[]>([])

  // Sellers and Affiliates
  const [availableSellers, setAvailableSellers] = useState<string[]>([])
  const [selectedSellers, setSelectedSellers] = useState<string[]>([])
  const [sellerSearchQuery, setSellerSearchQuery] = useState('')
  const [isSellerDropdownOpen, setIsSellerDropdownOpen] = useState(false)
  const [availableAffiliates, setAvailableAffiliates] = useState<string[]>([])
  const [selectedAffiliates, setSelectedAffiliates] = useState<string[]>([])
  const [affiliateSearchQuery, setAffiliateSearchQuery] = useState('')
  const [isAffiliateDropdownOpen, setIsAffiliateDropdownOpen] = useState(false)

  // Calculate date ranges based on selection (fixed to not mutate date)
  const getDateRange = (rangeType: DateRangeType): { start: Date; end: Date } => {
    const now = new Date()

    switch (rangeType) {
      case 'today':
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
        return { start: todayStart, end: now }
      case 'yesterday':
        const yesterday = subDays(now, 1)
        const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0)
        const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999)
        return { start: yesterdayStart, end: yesterdayEnd }
      case 'last7days':
        return { start: subDays(now, 7), end: now }
      case 'lastWeek':
        const lastWeekStart = startOfWeek(subDays(now, 7))
        const lastWeekEnd = endOfWeek(subDays(now, 7))
        return { start: lastWeekStart, end: lastWeekEnd }
      case 'last30days':
        return { start: subDays(now, 30), end: now }
      case 'lastMonth':
        const lastMonthStart = startOfMonth(subMonths(now, 1))
        const lastMonthEnd = endOfMonth(subMonths(now, 1))
        return { start: lastMonthStart, end: lastMonthEnd }
      case 'yearToDate':
        return { start: startOfYear(now), end: now }
      default:
        return { start: subDays(now, 30), end: now }
    }
  }

  // Load saved filters from localStorage on mount
  useEffect(() => {
    const savedFilters = localStorage.getItem('financeFilters')
    if (savedFilters) {
      try {
        const filters = JSON.parse(savedFilters)
        if (filters.transactionDateRange) setTransactionDateRange(filters.transactionDateRange)
        if (filters.tourDateRange) setTourDateRange(filters.tourDateRange)
        if (filters.selectedSellers) setSelectedSellers(filters.selectedSellers)
        if (filters.selectedAffiliates) setSelectedAffiliates(filters.selectedAffiliates)
        if (filters.transactionComparison) setTransactionComparison(filters.transactionComparison)
        if (filters.tourComparison) setTourComparison(filters.tourComparison)
      } catch (e) {
        console.error('Error loading saved filters:', e)
      }
    }
  }, [])

  // Save filters to localStorage whenever they change
  useEffect(() => {
    const filters = {
      transactionDateRange,
      tourDateRange,
      selectedSellers,
      selectedAffiliates,
      transactionComparison,
      tourComparison
    }
    localStorage.setItem('financeFilters', JSON.stringify(filters))
  }, [transactionDateRange, tourDateRange, selectedSellers, selectedAffiliates, transactionComparison, tourComparison])

  // Fetch available sellers and affiliates on mount
  useEffect(() => {
    fetchAvailableSellers()
    fetchAvailableAffiliates()
  }, [])

  // Fetch data whenever filters change
  useEffect(() => {
    fetchFinanceData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricType, transactionDateRange, customTransactionStart, customTransactionEnd,
      tourDateRange, customTourStart, customTourEnd, selectedSellers, selectedAffiliates,
      transactionComparison, tourComparison])

  // Re-process chart data when view type changes
  useEffect(() => {
    if (rawData.length > 0) {
      processChartData(rawData)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showIndividualSellers, metricType])

  const fetchAvailableAffiliates = async () => {
    try {
      const { data, error } = await supabase
        .from('finance_report_data')
        .select('affiliate_id')
        .not('affiliate_id', 'is', null)

      if (error) throw error

      const uniqueAffiliates = [...new Set(data?.map(item => item.affiliate_id) || [])]
        .filter(affiliate => affiliate)
        .sort((a, b) => a.localeCompare(b))
      setAvailableAffiliates(uniqueAffiliates)
    } catch (error) {
      console.error('Error fetching affiliates:', error)
    }
  }

  const fetchAvailableSellers = async () => {
    try {
      const { data, error } = await supabase
        .from('sellers')
        .select('title')
        .not('title', 'is', null)
        .order('title')

      if (error) throw error

      // Sort with EnRoma.com first
      const sellers = (data?.map(item => item.title) || [])
        .filter(seller => seller)
        .sort((a, b) => {
          if (a === ENROMA_SELLER) return -1
          if (b === ENROMA_SELLER) return 1
          return a.localeCompare(b)
        })
      setAvailableSellers(sellers)
    } catch (error) {
      console.error('Error fetching sellers:', error)
      setError('Failed to load sellers')
    }
  }

  const fetchFinanceData = async () => {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('finance_report_data')
        .select('*')

      // Apply transaction date filter
      if (transactionDateRange) {
        let dateRange
        if (transactionDateRange === 'custom' && customTransactionStart && customTransactionEnd) {
          dateRange = { start: customTransactionStart, end: customTransactionEnd }
        } else {
          dateRange = getDateRange(transactionDateRange)
        }
        query = query
          .gte('booking_date', format(dateRange.start, 'yyyy-MM-dd'))
          .lte('booking_date', format(dateRange.end, 'yyyy-MM-dd'))
      }

      // Apply tour date filter
      if (tourDateRange) {
        let dateRange
        if (tourDateRange === 'custom' && customTourStart && customTourEnd) {
          dateRange = { start: customTourStart, end: customTourEnd }
        } else {
          dateRange = getDateRange(tourDateRange)
        }
        query = query
          .gte('activity_date', format(dateRange.start, 'yyyy-MM-dd'))
          .lte('activity_date', format(dateRange.end, 'yyyy-MM-dd'))
      }

      // Apply seller filter
      if (selectedSellers.length > 0) {
        query = query.in('original_seller', selectedSellers)
      }

      // Apply affiliate filter
      if (selectedAffiliates.length > 0) {
        query = query.in('affiliate_id', selectedAffiliates)
      }

      query = query.order('booking_date', { ascending: true })

      const { data, error } = await query

      if (error) {
        console.error('Error fetching finance data:', error)
        setError('Failed to load finance data. Please try again.')
        throw error
      }

      setRawData(data || [])

      // Process data for daily chart
      processChartData(data || [])

      // Fetch comparison data
      await fetchPreviousPeriodData()
    } catch (error) {
      console.error('Error fetching finance data:', error)
      setError('Failed to load finance data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchPreviousPeriodData = async () => {
    try {
      let query = supabase
        .from('finance_report_data')
        .select('*')

      let prevStartDate: Date | undefined
      let prevEndDate: Date | undefined

      // Determine which date range and comparison to use
      const activeComparison = transactionDateRange ? transactionComparison : tourComparison
      const activeDateField = transactionDateRange ? 'booking_date' : 'activity_date'

      // Get current period dates
      let currentStart: Date | undefined
      let currentEnd: Date | undefined

      if (transactionDateRange) {
        if (transactionDateRange === 'custom' && customTransactionStart && customTransactionEnd) {
          currentStart = customTransactionStart
          currentEnd = customTransactionEnd
        } else {
          const range = getDateRange(transactionDateRange)
          currentStart = range.start
          currentEnd = range.end
        }
      } else if (tourDateRange) {
        if (tourDateRange === 'custom' && customTourStart && customTourEnd) {
          currentStart = customTourStart
          currentEnd = customTourEnd
        } else {
          const range = getDateRange(tourDateRange)
          currentStart = range.start
          currentEnd = range.end
        }
      }

      // Calculate previous period dates based on comparison type
      if (currentStart && currentEnd) {
        if (activeComparison === 'custom') {
          // Use custom comparison dates
          if (transactionDateRange && customTransactionCompStart && customTransactionCompEnd) {
            prevStartDate = customTransactionCompStart
            prevEndDate = customTransactionCompEnd
          } else if (tourDateRange && customTourCompStart && customTourCompEnd) {
            prevStartDate = customTourCompStart
            prevEndDate = customTourCompEnd
          }
        } else if (activeComparison === 'lastWeek') {
          prevStartDate = subDays(currentStart, 7)
          prevEndDate = subDays(currentEnd, 7)
        } else if (activeComparison === 'lastMonth') {
          prevStartDate = subMonths(currentStart, 1)
          prevEndDate = subMonths(currentEnd, 1)
        } else if (activeComparison === 'lastYear') {
          prevStartDate = subYears(currentStart, 1)
          prevEndDate = subYears(currentEnd, 1)
        }
      }

      // Apply date filter if we have previous period dates
      if (prevStartDate && prevEndDate) {
        query = query
          .gte(activeDateField, format(prevStartDate, 'yyyy-MM-dd'))
          .lte(activeDateField, format(prevEndDate, 'yyyy-MM-dd'))
      } else {
        // No comparison data if we can't determine dates
        setPreviousPeriodData([])
        return
      }

      // Apply seller filter
      if (selectedSellers.length > 0) {
        query = query.in('original_seller', selectedSellers)
      }

      // Apply affiliate filter
      if (selectedAffiliates.length > 0) {
        query = query.in('affiliate_id', selectedAffiliates)
      }

      const { data, error } = await query

      if (error) throw error

      setPreviousPeriodData(data || [])
    } catch (error) {
      console.error('Error fetching previous period data:', error)
      setPreviousPeriodData([])
    }
  }

  const processChartData = (data: FinanceData[]) => {
    if (showIndividualSellers) {
      // Group data by seller
      const groupedData = data.reduce((acc, row) => {
        const seller = row.original_seller
        const value = metricType === 'revenue' ? (row.total_revenue || 0) : (row.reservation_count || 0)

        if (!acc[seller]) {
          acc[seller] = 0
        }
        acc[seller] += value

        return acc
      }, {} as Record<string, number>)

      // Convert to chart format and take top 10 sellers
      const chartData = Object.entries(groupedData)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([seller, value]) => ({
          date: seller,
          value: Math.round(value * 100) / 100,
        }))

      setChartData(chartData)
    } else {
      // Group data by date
      const groupedData = data.reduce((acc, row) => {
        const date = transactionDateRange ? row.booking_date : row.activity_date
        if (!acc[date]) {
          acc[date] = { EnRoma: 0, Resellers: 0 }
        }

        const value = metricType === 'revenue' ? (row.total_revenue || 0) : (row.reservation_count || 0)

        if (row.seller_group === ENROMA_SELLER) {
          acc[date].EnRoma += value
        } else {
          acc[date].Resellers += value
        }

        return acc
      }, {} as Record<string, { EnRoma: number; Resellers: number }>)

      // Convert to chart format
      const chartData = Object.entries(groupedData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, values]) => ({
          date: format(new Date(date), 'MMM dd'),
          EnRoma: Math.round(values.EnRoma * 100) / 100,
          Resellers: Math.round(values.Resellers * 100) / 100,
        }))

      setChartData(chartData)
    }
  }

  const formatTooltipValue = (value: number) => {
    if (metricType === 'revenue') {
      return `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return value.toLocaleString('en-US')
  }

  const toggleSeller = (seller: string) => {
    if (seller === 'All Resellers') {
      const resellers = availableSellers.filter(s => s !== ENROMA_SELLER)
      if (resellers.every(s => selectedSellers.includes(s))) {
        setSelectedSellers(selectedSellers.filter(s => !resellers.includes(s)))
      } else {
        const newSelection = [...new Set([...selectedSellers, ...resellers])]
        setSelectedSellers(newSelection)
      }
    } else {
      if (selectedSellers.includes(seller)) {
        setSelectedSellers(selectedSellers.filter(s => s !== seller))
      } else {
        setSelectedSellers([...selectedSellers, seller])
      }
    }
  }

  const getFilteredSellers = () => {
    // EnRoma.com first, then All Resellers, then others
    const allOptions = [ENROMA_SELLER, 'All Resellers', ...availableSellers.filter(s => s !== ENROMA_SELLER)]
    if (!sellerSearchQuery) return allOptions

    return allOptions.filter(seller =>
      seller.toLowerCase().includes(sellerSearchQuery.toLowerCase())
    )
  }

  // Memoize metrics calculation to avoid recalculating on every render
  const metrics = useMemo(() => {
    const totalRevenue = rawData.reduce((sum, row) => sum + (row.total_revenue || 0), 0)
    const totalBookings = rawData.reduce((sum, row) => sum + (row.unique_bookings || 0), 0)
    const totalParticipants = rawData.reduce((sum, row) => sum + (row.reservation_count || 0), 0)

    const prevTotalRevenue = previousPeriodData.reduce((sum, row) => sum + (row.total_revenue || 0), 0)

    let growthRate = 0
    let growthTrend: 'up' | 'down' | 'steady' = 'steady'
    if (prevTotalRevenue > 0) {
      growthRate = ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100
      growthTrend = growthRate > 5 ? 'up' : growthRate < -5 ? 'down' : 'steady'
    }

    const revenueChange = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0
    const prevTotalBookings = previousPeriodData.reduce((sum, row) => sum + (row.unique_bookings || 0), 0)
    const bookingsChange = prevTotalBookings > 0 ? ((totalBookings - prevTotalBookings) / prevTotalBookings) * 100 : 0
    const prevTotalParticipants = previousPeriodData.reduce((sum, row) => sum + (row.reservation_count || 0), 0)
    const participantsChange = prevTotalParticipants > 0 ? ((totalParticipants - prevTotalParticipants) / prevTotalParticipants) * 100 : 0

    return {
      totalRevenue,
      totalBookings,
      totalParticipants,
      growthRate,
      growthTrend,
      revenueChange,
      bookingsChange,
      participantsChange
    }
  }, [rawData, previousPeriodData])

  // Export to Excel function
  const exportToExcel = () => {
    const exportData: Record<string, string | number>[] = []

    rawData.forEach(row => {
      exportData.push({
        'Date': transactionDateRange ? row.booking_date : row.activity_date,
        'Seller Group': row.seller_group,
        'Original Seller': row.original_seller,
        'Affiliate ID': row.affiliate_id || 'N/A',
        'Revenue': row.total_revenue || 0,
        'Bookings': row.unique_bookings || 0,
        'Participants': row.reservation_count || 0
      })
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportData)
    XLSX.utils.book_append_sheet(wb, ws, 'Finance Data')

    const fileName = `finance_export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  // Reset all filters
  const resetFilters = () => {
    setTransactionDateRange('last30days')
    setTourDateRange(undefined)
    setCustomTransactionStart(undefined)
    setCustomTransactionEnd(undefined)
    setCustomTourStart(undefined)
    setCustomTourEnd(undefined)
    setSelectedSellers([])
    setSelectedAffiliates([])
    setTransactionComparison('lastMonth')
    setTourComparison('lastMonth')
    setCustomTransactionCompStart(undefined)
    setCustomTransactionCompEnd(undefined)
    setCustomTourCompStart(undefined)
    setCustomTourCompEnd(undefined)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Finance Overview</h1>
        <div className="flex gap-3">
          <Button
            onClick={resetFilters}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Filters
          </Button>
          <Button
            onClick={exportToExcel}
            disabled={rawData.length === 0}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-800">Error Loading Data</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters Section */}
      <div className="bg-white rounded-lg shadow p-4">
        {/* All filters in one row with 4 columns at 25% each */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Transaction Date - 25% */}
          <div>
            <Label className="text-sm font-medium mb-1">Transaction Date</Label>
            <Select value={transactionDateRange} onValueChange={(value) => setTransactionDateRange(value as DateRangeType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last7days">Last 7 days</SelectItem>
                <SelectItem value="lastWeek">Last week</SelectItem>
                <SelectItem value="last30days">Last 30 days</SelectItem>
                <SelectItem value="lastMonth">Last month</SelectItem>
                <SelectItem value="yearToDate">Year to date</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {transactionDateRange === 'custom' && (
              <div className="flex gap-1 mt-2">
                <input
                  type="date"
                  value={customTransactionStart ? format(customTransactionStart, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setCustomTransactionStart(e.target.value ? new Date(e.target.value) : undefined)}
                  className="w-full px-2 py-1 border rounded text-xs"
                />
                <input
                  type="date"
                  value={customTransactionEnd ? format(customTransactionEnd, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setCustomTransactionEnd(e.target.value ? new Date(e.target.value) : undefined)}
                  className="w-full px-2 py-1 border rounded text-xs"
                />
              </div>
            )}
            
            {/* Confronta Transaction Date below */}
            <div className="mt-3">
              <Label className="text-xs font-medium mb-1">Confronta Transaction Date</Label>
              <Select value={transactionComparison} onValueChange={(value) => setTransactionComparison(value as ComparisonType)}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select comparison" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lastWeek">Same period last week</SelectItem>
                  <SelectItem value="lastMonth">Same period last month</SelectItem>
                  <SelectItem value="lastYear">Same period last year</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              {transactionComparison === 'custom' && (
                <div className="flex gap-1 mt-1">
                  <input
                    type="date"
                    value={customTransactionCompStart ? format(customTransactionCompStart, 'yyyy-MM-dd') : ''}
                    onChange={(e) => setCustomTransactionCompStart(e.target.value ? new Date(e.target.value) : undefined)}
                    className="w-full px-1 py-0.5 border rounded text-xs"
                  />
                  <input
                    type="date"
                    value={customTransactionCompEnd ? format(customTransactionCompEnd, 'yyyy-MM-dd') : ''}
                    onChange={(e) => setCustomTransactionCompEnd(e.target.value ? new Date(e.target.value) : undefined)}
                    className="w-full px-1 py-0.5 border rounded text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Tour Date - 25% */}
          <div>
            <Label className="text-sm font-medium mb-1">Tour Date</Label>
            <Select value={tourDateRange} onValueChange={(value) => setTourDateRange(value as DateRangeType)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last7days">Last 7 days</SelectItem>
                <SelectItem value="lastWeek">Last week</SelectItem>
                <SelectItem value="last30days">Last 30 days</SelectItem>
                <SelectItem value="lastMonth">Last month</SelectItem>
                <SelectItem value="yearToDate">Year to date</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {tourDateRange === 'custom' && (
              <div className="flex gap-1 mt-2">
                <input
                  type="date"
                  value={customTourStart ? format(customTourStart, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setCustomTourStart(e.target.value ? new Date(e.target.value) : undefined)}
                  className="w-full px-2 py-1 border rounded text-xs"
                />
                <input
                  type="date"
                  value={customTourEnd ? format(customTourEnd, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setCustomTourEnd(e.target.value ? new Date(e.target.value) : undefined)}
                  className="w-full px-2 py-1 border rounded text-xs"
                />
              </div>
            )}
            
            {/* Confronta Tour Date below */}
            <div className="mt-3">
              <Label className="text-xs font-medium mb-1">Confronta Tour Date</Label>
              <Select value={tourComparison} onValueChange={(value) => setTourComparison(value as ComparisonType)}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select comparison" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lastWeek">Same period last week</SelectItem>
                  <SelectItem value="lastMonth">Same period last month</SelectItem>
                  <SelectItem value="lastYear">Same period last year</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
              {tourComparison === 'custom' && (
                <div className="flex gap-1 mt-1">
                  <input
                    type="date"
                    value={customTourCompStart ? format(customTourCompStart, 'yyyy-MM-dd') : ''}
                    onChange={(e) => setCustomTourCompStart(e.target.value ? new Date(e.target.value) : undefined)}
                    className="w-full px-1 py-0.5 border rounded text-xs"
                  />
                  <input
                    type="date"
                    value={customTourCompEnd ? format(customTourCompEnd, 'yyyy-MM-dd') : ''}
                    onChange={(e) => setCustomTourCompEnd(e.target.value ? new Date(e.target.value) : undefined)}
                    className="w-full px-1 py-0.5 border rounded text-xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Seleziona Seller - 25% */}
          <div>
            <Label className="text-sm font-medium mb-1">Seleziona Seller</Label>
            <Popover open={isSellerDropdownOpen} onOpenChange={setIsSellerDropdownOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={isSellerDropdownOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {selectedSellers.length === 0 ? 'Seleziona seller...' : 
                     selectedSellers.length === 1 ? selectedSellers[0] : 
                     `${selectedSellers.length} sellers selected`}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <div className="p-2 border-b">
                  <div className="flex items-center px-2">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                      type="text"
                      placeholder="Cerca seller..."
                      value={sellerSearchQuery}
                      onChange={(e) => setSellerSearchQuery(e.target.value)}
                      className="flex h-9 w-full bg-transparent py-3 text-sm outline-none placeholder:text-gray-500"
                    />
                  </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {getFilteredSellers().map((seller) => {
                    const isSelected = seller === 'All Resellers'
                      ? availableSellers.filter(s => s !== ENROMA_SELLER).every(s => selectedSellers.includes(s))
                      : selectedSellers.includes(seller)
                    
                    return (
                      <div
                        key={seller}
                        className="flex items-center space-x-2 px-2 py-1.5 hover:bg-gray-100 cursor-pointer"
                        onClick={() => toggleSeller(seller)}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="h-4 w-4"
                        />
                        <label className="text-sm cursor-pointer flex-1">
                          {seller}
                        </label>
                      </div>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Seleziona Affiliate - 25% */}
          <div>
            <Label className="text-sm font-medium mb-1">Seleziona Affiliate</Label>
            <Popover open={isAffiliateDropdownOpen} onOpenChange={setIsAffiliateDropdownOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={isAffiliateDropdownOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {selectedAffiliates.length === 0 ? 'Seleziona affiliate...' : 
                     selectedAffiliates.length === 1 ? selectedAffiliates[0] : 
                     `${selectedAffiliates.length} affiliates selected`}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <div className="p-2 border-b">
                  <div className="flex items-center px-2">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                      type="text"
                      placeholder="Cerca affiliate..."
                      value={affiliateSearchQuery}
                      onChange={(e) => setAffiliateSearchQuery(e.target.value)}
                      className="flex h-9 w-full bg-transparent py-3 text-sm outline-none placeholder:text-gray-500"
                    />
                  </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {availableAffiliates
                    .filter(affiliate => affiliate.toLowerCase().includes(affiliateSearchQuery.toLowerCase()))
                    .map((affiliate) => (
                      <div
                        key={affiliate}
                        className="flex items-center space-x-2 px-2 py-1.5 hover:bg-gray-100 cursor-pointer"
                        onClick={() => {
                          if (selectedAffiliates.includes(affiliate)) {
                            setSelectedAffiliates(selectedAffiliates.filter(a => a !== affiliate))
                          } else {
                            setSelectedAffiliates([...selectedAffiliates, affiliate])
                          }
                        }}
                      >
                        <Checkbox
                          checked={selectedAffiliates.includes(affiliate)}
                          className="h-4 w-4"
                        />
                        <label className="text-sm cursor-pointer flex-1">
                          {affiliate}
                        </label>
                      </div>
                    ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Total Revenue Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <p className="text-sm text-gray-500">Total Revenue</p>
            <span className={`text-sm font-medium flex items-center gap-1 ${
              metrics.revenueChange > 0 ? 'text-green-600' : metrics.revenueChange < 0 ? 'text-red-600' : 'text-gray-600'
            }`}>
              {metrics.revenueChange > 0 ? <TrendingUp className="h-4 w-4" /> : 
               metrics.revenueChange < 0 ? <TrendingDown className="h-4 w-4" /> : 
               <ArrowRight className="h-4 w-4" />}
              {metrics.revenueChange > 0 ? '+' : ''}{metrics.revenueChange.toFixed(1)}%
            </span>
          </div>
          <p className="text-3xl font-bold mb-3">
            €{metrics.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {metrics.revenueChange > 0 ? 'Trending up' : metrics.revenueChange < 0 ? 'Trending down' : 'Stable'} this period
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Compared to previous period</p>
        </div>

        {/* Total Bookings Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <p className="text-sm text-gray-500">Total Bookings</p>
            <span className={`text-sm font-medium flex items-center gap-1 ${
              metrics.bookingsChange > 0 ? 'text-green-600' : metrics.bookingsChange < 0 ? 'text-red-600' : 'text-gray-600'
            }`}>
              {metrics.bookingsChange > 0 ? <TrendingUp className="h-4 w-4" /> : 
               metrics.bookingsChange < 0 ? <TrendingDown className="h-4 w-4" /> : 
               <ArrowRight className="h-4 w-4" />}
              {metrics.bookingsChange > 0 ? '+' : ''}{metrics.bookingsChange.toFixed(1)}%
            </span>
          </div>
          <p className="text-3xl font-bold mb-3">{metrics.totalBookings.toLocaleString()}</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {metrics.bookingsChange > 0 ? 'Trending up' : metrics.bookingsChange < 0 ? 'Trending down' : 'Stable'} this period
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Compared to previous period</p>
        </div>

        {/* Total Participants Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <p className="text-sm text-gray-500">Total Participants</p>
            <span className={`text-sm font-medium flex items-center gap-1 ${
              metrics.participantsChange > 0 ? 'text-green-600' : metrics.participantsChange < 0 ? 'text-red-600' : 'text-gray-600'
            }`}>
              {metrics.participantsChange > 0 ? <TrendingUp className="h-4 w-4" /> : 
               metrics.participantsChange < 0 ? <TrendingDown className="h-4 w-4" /> : 
               <ArrowRight className="h-4 w-4" />}
              {metrics.participantsChange > 0 ? '+' : ''}{metrics.participantsChange.toFixed(1)}%
            </span>
          </div>
          <p className="text-3xl font-bold mb-3">{metrics.totalParticipants.toLocaleString()}</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {metrics.participantsChange > 0 ? 'Trending up' : metrics.participantsChange < 0 ? 'Trending down' : 'Stable'} this period
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Compared to previous period</p>
        </div>

        {/* Growth Rate Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <p className="text-sm text-gray-500">Growth Rate</p>
            <span className={`text-sm font-medium flex items-center gap-1 ${
              metrics.growthTrend === 'up' ? 'text-green-600' : metrics.growthTrend === 'down' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {metrics.growthTrend === 'up' ? <TrendingUp className="h-4 w-4" /> : 
               metrics.growthTrend === 'down' ? <TrendingDown className="h-4 w-4" /> : 
               <ArrowRight className="h-4 w-4" />}
              {metrics.growthTrend}
            </span>
          </div>
          <p className="text-3xl font-bold mb-3">
            {metrics.growthRate > 0 ? '+' : ''}{metrics.growthRate.toFixed(1)}%
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {metrics.growthTrend === 'up' ? 'Growing faster' : metrics.growthTrend === 'down' ? 'Slowing down' : 'Steady growth'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Revenue growth vs previous period</p>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {metricType === 'revenue' ? 'Revenue' : 'Reservations'} Comparison
          </h2>
          <div className="flex items-center gap-4">
            {/* Grouped/Individual Sellers Switch */}
            <div className="flex items-center gap-2">
              <Label htmlFor="seller-view-switch" className="text-sm">Grouped</Label>
              <Switch
                id="seller-view-switch"
                checked={showIndividualSellers}
                onCheckedChange={setShowIndividualSellers}
              />
              <Label htmlFor="seller-view-switch" className="text-sm">By Seller</Label>
            </div>

            {!showIndividualSellers && (
              <>
                {/* Transaction Date/Tour Date Switch */}
                <div className="flex items-center gap-2">
                  <Label htmlFor="date-switch" className="text-sm">Transaction Date</Label>
                  <Switch
                    id="date-switch"
                    checked={!transactionDateRange}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setTransactionDateRange(undefined)
                        setTourDateRange('last30days')
                      } else {
                        setTransactionDateRange('last30days')
                        setTourDateRange(undefined)
                      }
                    }}
                  />
                  <Label htmlFor="date-switch" className="text-sm">Tour Date</Label>
                </div>
              </>
            )}

            {/* Revenue/Reservations Switch */}
            <div className="flex items-center gap-2">
              <Label htmlFor="metric-switch" className="text-sm">Revenue</Label>
              <Switch
                id="metric-switch"
                checked={metricType === 'reservations'}
                onCheckedChange={(checked) => setMetricType(checked ? 'reservations' : 'revenue')}
              />
              <Label htmlFor="metric-switch" className="text-sm">Reservations</Label>
            </div>
          </div>
        </div>
        
        {loading ? (
          <div className="h-[400px] flex items-center justify-center">
            <p>Loading chart data...</p>
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                angle={showIndividualSellers ? -45 : 0}
                textAnchor={showIndividualSellers ? "end" : "middle"}
                height={showIndividualSellers ? 100 : 30}
              />
              <YAxis
                tickFormatter={(value) => metricType === 'revenue' ? `€${value.toLocaleString()}` : value.toLocaleString()}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={formatTooltipValue}
                labelStyle={{ color: '#000' }}
                cursor={false}
              />
              {!showIndividualSellers && <Legend />}
              {showIndividualSellers ? (
                <Bar
                  dataKey="value"
                  name={metricType === 'revenue' ? 'Revenue' : 'Reservations'}
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                />
              ) : (
                <>
                  <Bar
                    dataKey="EnRoma"
                    name="EnRoma.com"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="Resellers"
                    name="Resellers"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[400px] flex items-center justify-center text-gray-500">
            No data available for the selected filters
          </div>
        )}
      </div>
    </div>
  )
}