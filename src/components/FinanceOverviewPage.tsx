'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ChevronDown, Search, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { format, subDays, subMonths, subYears } from 'date-fns'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type MetricType = 'revenue' | 'reservations'
type DateType = 'transaction' | 'tour'
type ComparisonType = 'lastWeek' | 'lastMonth' | 'lastYear' | 'custom'


interface FinanceData {
  activity_date: string
  booking_date: string
  seller_group: string
  original_seller: string
  affiliate_id: string | null
  reservation_count: number
  total_revenue: number
  unique_bookings: number
}

export default function FinanceOverviewPage() {
  const [metricType, setMetricType] = useState<MetricType>('revenue')
  const [chartDateType, setChartDateType] = useState<DateType>('transaction')
  const [comparisonType, setComparisonType] = useState<ComparisonType>('lastMonth')
  const [customComparisonStart, setCustomComparisonStart] = useState<Date | undefined>()
  const [customComparisonEnd, setCustomComparisonEnd] = useState<Date | undefined>()
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false)
  // Set default to last 30 days for transaction date
  const [bookingStartDate, setBookingStartDate] = useState<Date | undefined>(() => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    return date
  })
  const [bookingEndDate, setBookingEndDate] = useState<Date | undefined>(new Date())
  const [activityStartDate, setActivityStartDate] = useState<Date | undefined>()
  const [activityEndDate, setActivityEndDate] = useState<Date | undefined>()
  const [loading, setLoading] = useState(true)
  const [rawData, setRawData] = useState<FinanceData[]>([])
  const [previousPeriodData, setPreviousPeriodData] = useState<FinanceData[]>([])
  const [availableSellers, setAvailableSellers] = useState<string[]>([])
  const [selectedSellers, setSelectedSellers] = useState<string[]>([])
  const [sellerSearchQuery, setSellerSearchQuery] = useState('')
  const [isSellerDropdownOpen, setIsSellerDropdownOpen] = useState(false)
  const [availableAffiliates, setAvailableAffiliates] = useState<string[]>([])
  const [selectedAffiliates, setSelectedAffiliates] = useState<string[]>([])
  const [affiliateSearchQuery, setAffiliateSearchQuery] = useState('')
  const [isAffiliateDropdownOpen, setIsAffiliateDropdownOpen] = useState(false)

  // Fetch available sellers and affiliates on mount
  useEffect(() => {
    fetchAvailableSellers()
    fetchAvailableAffiliates()
  }, [])

  // Fetch data whenever filters change
  useEffect(() => {
    fetchFinanceData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricType, chartDateType, bookingStartDate, bookingEndDate, activityStartDate, activityEndDate, selectedSellers, selectedAffiliates, comparisonType, customComparisonStart, customComparisonEnd])

  const fetchPreviousPeriodData = async () => {
    try {
      let query = supabase
        .from('finance_report_data')
        .select('*')

      let prevStartDate: Date | undefined
      let prevEndDate: Date | undefined

      // Calculate previous period based on comparison type
      if (comparisonType === 'custom' && customComparisonStart && customComparisonEnd) {
        prevStartDate = customComparisonStart
        prevEndDate = customComparisonEnd
      } else if (bookingStartDate && bookingEndDate) {
        const currentStart = bookingStartDate
        const currentEnd = bookingEndDate
        
        if (comparisonType === 'lastWeek') {
          prevStartDate = subDays(currentStart, 7)
          prevEndDate = subDays(currentEnd, 7)
        } else if (comparisonType === 'lastMonth') {
          prevStartDate = subMonths(currentStart, 1)
          prevEndDate = subMonths(currentEnd, 1)
        } else if (comparisonType === 'lastYear') {
          prevStartDate = subYears(currentStart, 1)
          prevEndDate = subYears(currentEnd, 1)
        }
      } else if (activityStartDate && activityEndDate) {
        const currentStart = activityStartDate
        const currentEnd = activityEndDate
        
        if (comparisonType === 'lastWeek') {
          prevStartDate = subDays(currentStart, 7)
          prevEndDate = subDays(currentEnd, 7)
        } else if (comparisonType === 'lastMonth') {
          prevStartDate = subMonths(currentStart, 1)
          prevEndDate = subMonths(currentEnd, 1)
        } else if (comparisonType === 'lastYear') {
          prevStartDate = subYears(currentStart, 1)
          prevEndDate = subYears(currentEnd, 1)
        }
      }

      if (prevStartDate && prevEndDate) {
        const dateField = chartDateType === 'transaction' ? 'booking_date' : 'activity_date'
        query = query
          .gte(dateField, format(prevStartDate, 'yyyy-MM-dd'))
          .lte(dateField, format(prevEndDate, 'yyyy-MM-dd'))
      }

      if (selectedSellers.length > 0) {
        query = query.in('original_seller', selectedSellers)
      }

      if (selectedAffiliates.length > 0) {
        query = query.in('affiliate_id', selectedAffiliates)
      }

      const { data, error } = await query

      if (!error && data) {
        setPreviousPeriodData(data)
      }
    } catch (error) {
      console.error('Error fetching previous period data:', error)
    }
  }

  const fetchAvailableAffiliates = async () => {
    try {
      // Fetch distinct affiliates from finance_report_data view
      const { data, error } = await supabase
        .from('finance_report_data')
        .select('affiliate_id')
        .not('affiliate_id', 'is', null)

      if (error) throw error

      // Get unique affiliates and sort them
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
      // Fetch ALL sellers from the sellers table
      const { data, error } = await supabase
        .from('sellers')
        .select('title')
        .not('title', 'is', null)
        .order('title')

      if (error) throw error

      // Get sellers and sort them with EnRoma.com first
      const sellers = (data?.map(item => item.title) || [])
        .filter(seller => seller)
        .sort((a, b) => {
          // EnRoma.com always comes first after All Resellers
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
      // Build the query
      let query = supabase
        .from('finance_report_data')
        .select('*')

      // Apply activity date filter only if both dates are set
      if (activityStartDate && activityEndDate) {
        query = query
          .gte('activity_date', format(activityStartDate, 'yyyy-MM-dd'))
          .lte('activity_date', format(activityEndDate, 'yyyy-MM-dd'))
      }

      // Apply booking date filter only if both dates are set
      if (bookingStartDate && bookingEndDate) {
        query = query
          .gte('booking_date', format(bookingStartDate, 'yyyy-MM-dd'))
          .lte('booking_date', format(bookingEndDate, 'yyyy-MM-dd'))
      }

      // Apply seller filter if any sellers are selected  
      if (selectedSellers.length > 0) {
        query = query.in('original_seller', selectedSellers)
      }

      // Apply affiliate filter if any affiliates are selected
      if (selectedAffiliates.length > 0) {
        query = query.in('affiliate_id', selectedAffiliates)
      }

      query = query.order('activity_date', { ascending: true })

      const { data, error } = await query

      if (error) {
        console.error('Error fetching finance data:', error)
        throw error
      }

      setRawData(data || [])

      // Fetch previous period data for growth calculation
      if ((activityStartDate && activityEndDate) || (bookingStartDate && bookingEndDate)) {
        await fetchPreviousPeriodData()
      }
    } catch (error) {
      console.error('Error fetching finance data:', error)
    } finally {
      setLoading(false)
    }
  }

  const processDataForBarChart = () => {
    // Process current period data
    const currentTotal = rawData.reduce((acc, row) => {
      const value = metricType === 'revenue' ? (row.total_revenue || 0) : (row.reservation_count || 0)
      if (row.seller_group === 'EnRoma.com') {
        acc.enromaCurrent += value
      } else {
        acc.resellersCurrent += value
      }
      return acc
    }, { enromaCurrent: 0, resellersCurrent: 0 })

    // Process previous period data
    const previousTotal = previousPeriodData.reduce((acc, row) => {
      const value = metricType === 'revenue' ? (row.total_revenue || 0) : (row.reservation_count || 0)
      if (row.seller_group === 'EnRoma.com') {
        acc.enromaPrevious += value
      } else {
        acc.resellersPrevious += value
      }
      return acc
    }, { enromaPrevious: 0, resellersPrevious: 0 })

    // Create bar chart data
    return [
      {
        name: 'EnRoma.com',
        current: Math.round(currentTotal.enromaCurrent * 100) / 100,
        previous: Math.round(previousTotal.enromaPrevious * 100) / 100,
      },
      {
        name: 'Resellers',
        current: Math.round(currentTotal.resellersCurrent * 100) / 100,
        previous: Math.round(previousTotal.resellersPrevious * 100) / 100,
      }
    ]
  }

  const formatTooltipValue = (value: number) => {
    if (metricType === 'revenue') {
      return `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return value.toLocaleString('en-US')
  }

  const getTotalMetrics = () => {
    // Calculate current period metrics from raw data (already filtered by query)
    const totalRevenue = rawData.reduce((sum, row) => sum + (row.total_revenue || 0), 0)
    const totalBookings = rawData.reduce((sum, row) => sum + (row.unique_bookings || 0), 0)
    const totalParticipants = rawData.reduce((sum, row) => sum + (row.reservation_count || 0), 0)
    
    // Calculate previous period metrics for growth rate
    const prevTotalRevenue = previousPeriodData.reduce((sum, row) => sum + (row.total_revenue || 0), 0)
    
    // Calculate growth rate
    let growthRate = 0
    let growthTrend: 'up' | 'down' | 'steady' = 'steady'
    if (prevTotalRevenue > 0) {
      growthRate = ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100
      growthTrend = growthRate > 5 ? 'up' : growthRate < -5 ? 'down' : 'steady'
    }
    
    // Calculate period comparison percentages
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
  }

  const toggleSeller = (seller: string) => {
    if (seller === 'All Resellers') {
      // Select all sellers except EnRoma.com
      const resellers = availableSellers.filter(s => s !== 'EnRoma.com')
      if (resellers.every(s => selectedSellers.includes(s))) {
        // If all resellers are selected, deselect them
        setSelectedSellers(selectedSellers.filter(s => !resellers.includes(s)))
      } else {
        // Select all resellers
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

  const selectAllSellers = () => {
    if (selectedSellers.length === availableSellers.length) {
      setSelectedSellers([])
    } else {
      setSelectedSellers([...availableSellers])
    }
  }

  const getFilteredSellers = () => {
    const allOptions = ['All Resellers', ...availableSellers]
    if (!sellerSearchQuery) return allOptions
    
    return allOptions.filter(seller => 
      seller.toLowerCase().includes(sellerSearchQuery.toLowerCase())
    )
  }

  const isAllResellersSelected = () => {
    const resellers = availableSellers.filter(s => s !== 'EnRoma.com')
    return resellers.length > 0 && resellers.every(s => selectedSellers.includes(s))
  }

  const getSelectionLabel = () => {
    if (selectedSellers.length === 0) return 'Seleziona seller...'
    if (selectedSellers.length === 1) return selectedSellers[0]
    return `${selectedSellers.length} sellers selected`
  }

  const getAffiliateSelectionLabel = () => {
    if (selectedAffiliates.length === 0) return 'Seleziona affiliate...'
    if (selectedAffiliates.length === 1) return selectedAffiliates[0]
    return `${selectedAffiliates.length} affiliates selected`
  }

  const toggleAffiliate = (affiliate: string) => {
    if (selectedAffiliates.includes(affiliate)) {
      setSelectedAffiliates(selectedAffiliates.filter(a => a !== affiliate))
    } else {
      setSelectedAffiliates([...selectedAffiliates, affiliate])
    }
  }

  const selectAllAffiliates = () => {
    if (selectedAffiliates.length === availableAffiliates.length) {
      setSelectedAffiliates([])
    } else {
      setSelectedAffiliates([...availableAffiliates])
    }
  }

  const getFilteredAffiliates = () => {
    if (!affiliateSearchQuery) return availableAffiliates
    
    return availableAffiliates.filter(affiliate => 
      affiliate.toLowerCase().includes(affiliateSearchQuery.toLowerCase())
    )
  }

  const metrics = getTotalMetrics()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Finance Overview</h1>

      {/* Filters Section */}
      <div className="bg-white rounded-lg shadow p-4">
        {/* First row: Date and Selection Filters */}
        <div className="grid grid-cols-10 gap-4 mb-4">
          {/* Transaction Date - 20% */}
          <div className="col-span-2">
            <Label className="text-sm font-medium mb-1">Transaction Date</Label>
            <div className="flex gap-1">
              <input
                type="date"
                value={bookingStartDate ? format(bookingStartDate, 'yyyy-MM-dd') : ''}
                onChange={(e) => setBookingStartDate(e.target.value ? new Date(e.target.value) : undefined)}
                className="w-full px-2 py-1 border rounded text-sm"
              />
              <input
                type="date"
                value={bookingEndDate ? format(bookingEndDate, 'yyyy-MM-dd') : ''}
                onChange={(e) => setBookingEndDate(e.target.value ? new Date(e.target.value) : undefined)}
                className="w-full px-2 py-1 border rounded text-sm"
              />
            </div>
          </div>

          {/* Tour Date - 20% */}
          <div className="col-span-2">
            <Label className="text-sm font-medium mb-1">Tour Date</Label>
            <div className="flex gap-1">
              <input
                type="date"
                value={activityStartDate ? format(activityStartDate, 'yyyy-MM-dd') : ''}
                onChange={(e) => setActivityStartDate(e.target.value ? new Date(e.target.value) : undefined)}
                className="w-full px-2 py-1 border rounded text-sm"
              />
              <input
                type="date"
                value={activityEndDate ? format(activityEndDate, 'yyyy-MM-dd') : ''}
                onChange={(e) => setActivityEndDate(e.target.value ? new Date(e.target.value) : undefined)}
                className="w-full px-2 py-1 border rounded text-sm"
              />
            </div>
          </div>

          {/* Seleziona Seller - 30% */}
          <div className="col-span-3">
            <Label className="text-sm font-medium mb-1">Seleziona Seller</Label>
            <Popover open={isSellerDropdownOpen} onOpenChange={setIsSellerDropdownOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={isSellerDropdownOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">{getSelectionLabel()}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
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
                  <div className="p-1">
                    <button
                      onClick={selectAllSellers}
                      className="w-full text-left px-2 py-1.5 text-xs text-blue-600 hover:bg-gray-100 rounded"
                    >
                      Seleziona tutti ({availableSellers.length} filtrati)
                    </button>
                  </div>
                  {getFilteredSellers().map((seller) => {
                    const isSelected = seller === 'All Resellers' 
                      ? isAllResellersSelected()
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

          {/* Seleziona Affiliate - 30% */}
          <div className="col-span-3">
            <Label className="text-sm font-medium mb-1">Seleziona Affiliate</Label>
            <Popover open={isAffiliateDropdownOpen} onOpenChange={setIsAffiliateDropdownOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={isAffiliateDropdownOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">{getAffiliateSelectionLabel()}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
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
                  <div className="p-1">
                    <button
                      onClick={selectAllAffiliates}
                      className="w-full text-left px-2 py-1.5 text-xs text-blue-600 hover:bg-gray-100 rounded"
                    >
                      Seleziona tutti ({availableAffiliates.length} filtrati)
                    </button>
                  </div>
                  {getFilteredAffiliates().map((affiliate) => {
                    const isSelected = selectedAffiliates.includes(affiliate)
                    
                    return (
                      <div
                        key={affiliate}
                        className="flex items-center space-x-2 px-2 py-1.5 hover:bg-gray-100 cursor-pointer"
                        onClick={() => toggleAffiliate(affiliate)}
                      >
                        <Checkbox
                          checked={isSelected}
                          className="h-4 w-4"
                        />
                        <label className="text-sm cursor-pointer flex-1">
                          {affiliate}
                        </label>
                      </div>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Second row: Confronta comparison filter */}
        <div className="pt-3 border-t">
          <Label className="text-sm font-medium mb-2">Confronta</Label>
          <RadioGroup
            value={comparisonType}
            onValueChange={(value) => {
              setComparisonType(value as ComparisonType)
              setShowCustomDatePicker(value === 'custom')
            }}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="lastWeek" id="lastWeek" />
              <Label htmlFor="lastWeek" className="text-sm font-normal cursor-pointer">
                Same period last week
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="lastMonth" id="lastMonth" />
              <Label htmlFor="lastMonth" className="text-sm font-normal cursor-pointer">
                Same period last month
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="lastYear" id="lastYear" />
              <Label htmlFor="lastYear" className="text-sm font-normal cursor-pointer">
                Same period last year
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="custom" id="custom" />
              <Label htmlFor="custom" className="text-sm font-normal cursor-pointer">
                Custom range
              </Label>
            </div>
          </RadioGroup>
          
          {/* Custom date range picker */}
          {showCustomDatePicker && (
            <div className="mt-3 flex items-center gap-2">
              <Label className="text-sm">Compare with:</Label>
              <input
                type="date"
                value={customComparisonStart ? format(customComparisonStart, 'yyyy-MM-dd') : ''}
                onChange={(e) => setCustomComparisonStart(e.target.value ? new Date(e.target.value) : undefined)}
                className="px-2 py-1 border rounded text-sm"
              />
              <span className="text-sm text-gray-500">to</span>
              <input
                type="date"
                value={customComparisonEnd ? format(customComparisonEnd, 'yyyy-MM-dd') : ''}
                onChange={(e) => setCustomComparisonEnd(e.target.value ? new Date(e.target.value) : undefined)}
                className="px-2 py-1 border rounded text-sm"
              />
            </div>
          )}
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
            {metrics.revenueChange > 0 ? <TrendingUp className="h-3 w-3 text-green-600" /> : 
             metrics.revenueChange < 0 ? <TrendingDown className="h-3 w-3 text-red-600" /> : 
             <ArrowRight className="h-3 w-3 text-gray-600" />}
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
          <p className="text-3xl font-bold mb-3">
            {metrics.totalBookings.toLocaleString('en-US')}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {metrics.bookingsChange > 0 ? 'Up' : metrics.bookingsChange < 0 ? 'Down' : 'Stable'} {Math.abs(metrics.bookingsChange).toFixed(0)}% this period
            </span>
            {metrics.bookingsChange < 0 ? <TrendingDown className="h-3 w-3 text-orange-600" /> : 
             metrics.bookingsChange > 0 ? <TrendingUp className="h-3 w-3 text-green-600" /> : 
             <ArrowRight className="h-3 w-3 text-gray-600" />}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {metrics.bookingsChange < -10 ? 'Acquisition needs attention' : metrics.bookingsChange > 10 ? 'Strong booking growth' : 'Steady booking flow'}
          </p>
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
          <p className="text-3xl font-bold mb-3">
            {metrics.totalParticipants.toLocaleString('en-US')}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {metrics.participantsChange > 0 ? 'Strong user retention' : metrics.participantsChange < 0 ? 'Retention declining' : 'Stable participation'}
            </span>
            {metrics.participantsChange > 0 ? <TrendingUp className="h-3 w-3 text-green-600" /> : 
             metrics.participantsChange < 0 ? <TrendingDown className="h-3 w-3 text-red-600" /> : 
             <ArrowRight className="h-3 w-3 text-gray-600" />}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {metrics.participantsChange > 10 ? 'Engagement exceed targets' : 'Normal engagement levels'}
          </p>
        </div>

        {/* Growth Rate Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-lg hover:shadow-xl transition-shadow">
          <div className="flex justify-between items-start mb-2">
            <p className="text-sm text-gray-500">Growth Rate</p>
            <span className={`text-sm font-medium flex items-center gap-1 ${
              metrics.growthRate > 0 ? 'text-green-600' : metrics.growthRate < 0 ? 'text-red-600' : 'text-gray-600'
            }`}>
              {metrics.growthRate > 0 ? <TrendingUp className="h-4 w-4" /> : 
               metrics.growthRate < 0 ? <TrendingDown className="h-4 w-4" /> : 
               <ArrowRight className="h-4 w-4" />}
              {metrics.growthRate > 0 ? '+' : ''}{metrics.growthRate.toFixed(1)}%
            </span>
          </div>
          <p className="text-3xl font-bold mb-3">
            {Math.abs(metrics.growthRate).toFixed(1)}%
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {metrics.growthTrend === 'up' ? 'Steady performance increase' : 
               metrics.growthTrend === 'down' ? 'Performance declining' : 
               'Stable performance'}
            </span>
            {metrics.growthTrend === 'up' ? <TrendingUp className="h-3 w-3 text-green-600" /> : 
             metrics.growthTrend === 'down' ? <TrendingDown className="h-3 w-3 text-red-600" /> : 
             <ArrowRight className="h-3 w-3 text-gray-600" />}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {metrics.growthRate > 5 ? 'Meets growth projections' : 
             metrics.growthRate < -5 ? 'Below growth targets' : 
             'On track with projections'}
          </p>
        </div>
      </div>

      {/* Bar Chart Comparison */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            {metricType === 'revenue' ? 'Revenue' : 'Reservations'} Comparison
          </h2>
          <div className="flex items-center gap-4">
            {/* Metric type switch */}
            <div className="flex items-center gap-2">
              <Label htmlFor="metric-switch" className="text-sm">Revenue</Label>
              <Switch
                id="metric-switch"
                checked={metricType === 'reservations'}
                onCheckedChange={(checked) => setMetricType(checked ? 'reservations' : 'revenue')}
              />
              <Label htmlFor="metric-switch" className="text-sm">Reservations</Label>
            </div>
            
            {/* Date type switch */}
            <div className="flex items-center gap-2 border-l pl-4">
              <Label htmlFor="chart-date-switch" className="text-sm">Transaction Date</Label>
              <Switch
                id="chart-date-switch"
                checked={chartDateType === 'tour'}
                onCheckedChange={(checked) => setChartDateType(checked ? 'tour' : 'transaction')}
              />
              <Label htmlFor="chart-date-switch" className="text-sm">Tour Date</Label>
            </div>
          </div>
        </div>
        
        {loading ? (
          <div className="h-[400px] flex items-center justify-center">
            <p>Loading chart data...</p>
          </div>
        ) : rawData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={processDataForBarChart()}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis 
                  dataKey="name" 
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
                  dataKey="current" 
                  name="Current Period"
                  fill="#3b82f6" 
                  radius={[4, 4, 0, 0]}
                />
                <Bar 
                  dataKey="previous" 
                  name={`Previous (${comparisonType === 'custom' ? 'Custom' : comparisonType === 'lastWeek' ? 'Last Week' : comparisonType === 'lastMonth' ? 'Last Month' : 'Last Year'})`}
                  fill="#94a3b8" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 flex justify-between text-sm text-gray-600">
              <div>
                Total Current: {metricType === 'revenue' ? '€' : ''}
                {processDataForBarChart().reduce((sum, item) => sum + item.current, 0).toLocaleString('en-US', { 
                  minimumFractionDigits: metricType === 'revenue' ? 2 : 0, 
                  maximumFractionDigits: metricType === 'revenue' ? 2 : 0 
                })}
              </div>
              <div>
                Total Previous: {metricType === 'revenue' ? '€' : ''}
                {processDataForBarChart().reduce((sum, item) => sum + item.previous, 0).toLocaleString('en-US', { 
                  minimumFractionDigits: metricType === 'revenue' ? 2 : 0, 
                  maximumFractionDigits: metricType === 'revenue' ? 2 : 0 
                })}
              </div>
              <div className="font-medium">
                Change: {(() => {
                  const current = processDataForBarChart().reduce((sum, item) => sum + item.current, 0)
                  const previous = processDataForBarChart().reduce((sum, item) => sum + item.previous, 0)
                  const change = previous > 0 ? ((current - previous) / previous * 100) : 0
                  return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
                })()}
              </div>
            </div>
          </>
        ) : (
          <div className="h-[400px] flex items-center justify-center text-gray-500">
            No data available for the selected filters
          </div>
        )}
      </div>
    </div>
  )
}