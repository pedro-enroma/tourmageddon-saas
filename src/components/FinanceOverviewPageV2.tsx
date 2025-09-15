'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, Search, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, subDays, subMonths, startOfYear, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type MetricType = 'revenue' | 'reservations'
type DateRangeType = 'today' | 'yesterday' | 'last7days' | 'lastWeek' | 'last30days' | 'lastMonth' | 'yearToDate' | 'custom'
type ComparisonType = 'lastWeek' | 'lastMonth' | 'lastYear' | 'custom'

interface ChartData {
  date: string
  EnRoma: number
  Resellers: number
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
  
  // Transaction Date
  const [transactionDateRange, setTransactionDateRange] = useState<DateRangeType>('last30days')
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

  // Calculate date ranges based on selection
  const getDateRange = (rangeType: DateRangeType): { start: Date; end: Date } => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    
    switch (rangeType) {
      case 'today':
        return { start: new Date(today.setHours(0, 0, 0, 0)), end: new Date() }
      case 'yesterday':
        const yesterday = subDays(today, 1)
        return { start: new Date(yesterday.setHours(0, 0, 0, 0)), end: new Date(yesterday.setHours(23, 59, 59, 999)) }
      case 'last7days':
        return { start: subDays(today, 7), end: today }
      case 'lastWeek':
        const lastWeekStart = startOfWeek(subDays(today, 7))
        const lastWeekEnd = endOfWeek(subDays(today, 7))
        return { start: lastWeekStart, end: lastWeekEnd }
      case 'last30days':
        return { start: subDays(today, 30), end: today }
      case 'lastMonth':
        const lastMonthStart = startOfMonth(subMonths(today, 1))
        const lastMonthEnd = endOfMonth(subMonths(today, 1))
        return { start: lastMonthStart, end: lastMonthEnd }
      case 'yearToDate':
        return { start: startOfYear(today), end: today }
      default:
        return { start: subDays(today, 30), end: today }
    }
  }

  // Fetch available sellers and affiliates on mount
  useEffect(() => {
    fetchAvailableSellers()
    fetchAvailableAffiliates()
  }, [])

  // Fetch data whenever filters change
  useEffect(() => {
    fetchFinanceData()
  }, [metricType, transactionDateRange, customTransactionStart, customTransactionEnd, 
      tourDateRange, customTourStart, customTourEnd, selectedSellers, selectedAffiliates,
      transactionComparison, tourComparison])

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
          if (a === 'EnRoma.com') return -1
          if (b === 'EnRoma.com') return 1
          return a.localeCompare(b)
        })
      setAvailableSellers(sellers)
    } catch (error) {
      console.error('Error fetching sellers:', error)
    }
  }

  const fetchFinanceData = async () => {
    setLoading(true)
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
        throw error
      }

      setRawData(data || [])
      
      // Process data for daily chart
      processChartData(data || [])
      
      // Fetch comparison data
      await fetchPreviousPeriodData()
    } catch (error) {
      console.error('Error fetching finance data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPreviousPeriodData = async () => {
    try {
      const query = supabase
        .from('finance_report_data')
        .select('*')

      // Similar logic for previous period based on comparison type
      // Implementation details...
      
      const { data, error } = await query

      if (!error && data) {
        setPreviousPeriodData(data)
      }
    } catch (error) {
      console.error('Error fetching previous period data:', error)
    }
  }

  const processChartData = (data: FinanceData[]) => {
    // Group data by date
    const groupedData = data.reduce((acc, row) => {
      const date = transactionDateRange ? row.booking_date : row.activity_date
      if (!acc[date]) {
        acc[date] = { EnRoma: 0, Resellers: 0 }
      }
      
      const value = metricType === 'revenue' ? parseFloat(row.total_revenue || '0') : (row.reservation_count || 0)
      
      if (row.seller_group === 'EnRoma.com') {
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

  const getTotalMetrics = () => {
    const totalRevenue = rawData.reduce((sum, row) => sum + parseFloat(row.total_revenue?.toString() || '0'), 0)
    const totalBookings = rawData.reduce((sum, row) => sum + (row.unique_bookings || 0), 0)
    const totalParticipants = rawData.reduce((sum, row) => sum + (row.total_participants || 0), 0)
    
    const prevTotalRevenue = previousPeriodData.reduce((sum, row) => sum + parseFloat(row.total_revenue.toString() || '0'), 0)
    
    let growthRate = 0
    let growthTrend: 'up' | 'down' | 'steady' = 'steady'
    if (prevTotalRevenue > 0) {
      growthRate = ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100
      growthTrend = growthRate > 5 ? 'up' : growthRate < -5 ? 'down' : 'steady'
    }
    
    const revenueChange = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0
    const prevTotalBookings = previousPeriodData.reduce((sum, row) => sum + (row.unique_bookings || 0), 0)
    const bookingsChange = prevTotalBookings > 0 ? ((totalBookings - prevTotalBookings) / prevTotalBookings) * 100 : 0
    const prevTotalParticipants = previousPeriodData.reduce((sum, row) => sum + (row.total_participants || 0), 0)
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
  }

  const formatTooltipValue = (value: number) => {
    if (metricType === 'revenue') {
      return `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return value.toLocaleString('en-US')
  }

  const toggleSeller = (seller: string) => {
    if (seller === 'All Resellers') {
      const resellers = availableSellers.filter(s => s !== 'EnRoma.com')
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
    const allOptions = ['EnRoma.com', 'All Resellers', ...availableSellers.filter(s => s !== 'EnRoma.com')]
    if (!sellerSearchQuery) return allOptions
    
    return allOptions.filter(seller => 
      seller.toLowerCase().includes(sellerSearchQuery.toLowerCase())
    )
  }

  const metrics = getTotalMetrics()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Finance Overview</h1>

      {/* Filters Section */}
      <div className="bg-white rounded-lg shadow p-4">
        {/* All filters in one row with 4 columns at 25% each */}
        <div className="grid grid-cols-4 gap-4">
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
                      ? availableSellers.filter(s => s !== 'EnRoma.com').every(s => selectedSellers.includes(s))
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
      <div className="grid grid-cols-4 gap-4">
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
              <Legend />
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