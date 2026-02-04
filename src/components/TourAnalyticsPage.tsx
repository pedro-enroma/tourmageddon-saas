'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'
import { Download, RefreshCw, TrendingUp, Users, Calendar, DollarSign, Loader2, BarChart3 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { sanitizeDataForExcel } from '@/lib/security/sanitize'

type DateRangeType = 'last7days' | 'last30days' | 'lastWeek' | 'lastMonth' | 'last3months' | 'custom'
type DateType = 'travel' | 'booking'

interface SummaryData {
  total_bookings: number
  total_pax: number
  total_revenue: number
  total_net_revenue: number
  avg_booking_value: number
  avg_pax_per_booking: number
}

interface DateData {
  date: string
  booking_count: number
  pax_sum: number
  total_revenue: number
  net_revenue: number
}

interface TourData {
  activity_id: string
  title: string
  booking_count: number
  pax_sum: number
  total_revenue: number
  net_revenue: number
}

interface SellerData {
  seller: string
  seller_group: string
  booking_count: number
  pax_sum: number
  total_revenue: number
  net_revenue: number
}

interface AffiliateData {
  affiliate_id: string
  booking_count: number
  pax_sum: number
  total_revenue: number
  commission: number
}

interface ProductData {
  product_title: string
  booking_count: number
  pax_sum: number
  total_revenue: number
  net_revenue: number
}

interface PromoCodeData {
  offer_id: number
  offer_name: string
  booking_count: number
  pax_sum: number
  total_revenue: number
  net_revenue: number
  total_discount: number
  discount_percentage: number
}

interface AnalyticsData {
  summary: SummaryData
  by_date: DateData[]
  by_tour: TourData[]
  by_seller: SellerData[]
  by_affiliate: AffiliateData[]
  by_product: ProductData[]
  by_promo_code: PromoCodeData[]
}

export default function TourAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsData | null>(null)

  // Filters
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('lastMonth')
  const [dateType, setDateType] = useState<DateType>('travel')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Active tab
  const [activeTab, setActiveTab] = useState('tours')

  // Get date range based on selection
  const getDateRange = (rangeType: DateRangeType): { start: string; end: string } => {
    const now = new Date()
    let start: Date
    let end: Date = now

    switch (rangeType) {
      case 'last7days':
        start = subDays(now, 7)
        break
      case 'last30days':
        start = subDays(now, 30)
        break
      case 'lastWeek':
        start = startOfWeek(subDays(now, 7))
        end = endOfWeek(subDays(now, 7))
        break
      case 'lastMonth':
        start = startOfMonth(subMonths(now, 1))
        end = endOfMonth(subMonths(now, 1))
        break
      case 'last3months':
        start = subMonths(now, 3)
        break
      case 'custom':
        return {
          start: customStartDate || format(subDays(now, 30), 'yyyy-MM-dd'),
          end: customEndDate || format(now, 'yyyy-MM-dd')
        }
      default:
        start = subDays(now, 30)
    }

    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd')
    }
  }

  // Fetch analytics data
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { start, end } = getDateRange(dateRangeType)
      const response = await fetch(
        `/api/reports/tour-analytics?start_date=${start}&end_date=${end}&date_type=${dateType}`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch analytics data')
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      console.error('Error fetching analytics:', err)
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRangeType, dateType, customStartDate, customEndDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value)
  }

  // Format number
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('it-IT').format(Math.round(value * 100) / 100)
  }

  // Export to Excel
  const exportToExcel = () => {
    if (!data) return

    const wb = XLSX.utils.book_new()

    // Summary sheet
    const summaryData = [
      ['Tour Analytics Report'],
      ['Date Range', `${getDateRange(dateRangeType).start} to ${getDateRange(dateRangeType).end}`],
      ['Date Type', dateType === 'travel' ? 'Travel Date' : 'Booking Date'],
      [],
      ['Metric', 'Value'],
      ['Total Bookings', data.summary.total_bookings],
      ['Total Pax', data.summary.total_pax],
      ['Total Revenue', data.summary.total_revenue],
      ['Net Revenue', data.summary.total_net_revenue],
      ['Avg Booking Value', data.summary.avg_booking_value],
      ['Avg Pax per Booking', data.summary.avg_pax_per_booking]
    ]
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

    // By Date sheet
    const dateSheet = XLSX.utils.json_to_sheet(sanitizeDataForExcel(data.by_date as Record<string, unknown>[]))
    XLSX.utils.book_append_sheet(wb, dateSheet, 'By Date')

    // By Tour sheet
    const tourSheet = XLSX.utils.json_to_sheet(sanitizeDataForExcel(data.by_tour as Record<string, unknown>[]))
    XLSX.utils.book_append_sheet(wb, tourSheet, 'By Tour')

    // By Seller sheet
    const sellerSheet = XLSX.utils.json_to_sheet(sanitizeDataForExcel(data.by_seller as Record<string, unknown>[]))
    XLSX.utils.book_append_sheet(wb, sellerSheet, 'By Seller')

    // By Affiliate sheet
    const affiliateSheet = XLSX.utils.json_to_sheet(sanitizeDataForExcel(data.by_affiliate as Record<string, unknown>[]))
    XLSX.utils.book_append_sheet(wb, affiliateSheet, 'By Affiliate')

    // By Product sheet
    const productSheet = XLSX.utils.json_to_sheet(sanitizeDataForExcel(data.by_product as Record<string, unknown>[]))
    XLSX.utils.book_append_sheet(wb, productSheet, 'By Product')

    // By Promo Code sheet
    const promoCodeSheet = XLSX.utils.json_to_sheet(sanitizeDataForExcel(data.by_promo_code as Record<string, unknown>[]))
    XLSX.utils.book_append_sheet(wb, promoCodeSheet, 'By Promo Code')

    const fileName = `tour-analytics-${getDateRange(dateRangeType).start}-to-${getDateRange(dateRangeType).end}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={fetchData} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tour Analytics</h1>
          <p className="text-muted-foreground">Analyze tour performance, sellers, and revenue</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={exportToExcel} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Date Range</label>
              <Select value={dateRangeType} onValueChange={(v) => setDateRangeType(v as DateRangeType)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last7days">Last 7 Days</SelectItem>
                  <SelectItem value="last30days">Last 30 Days</SelectItem>
                  <SelectItem value="lastWeek">Last Week</SelectItem>
                  <SelectItem value="lastMonth">Last Month</SelectItem>
                  <SelectItem value="last3months">Last 3 Months</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRangeType === 'custom' && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-2 border rounded-md text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Date Type</label>
              <Select value={dateType} onValueChange={(v) => setDateType(v as DateType)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="travel">Travel Date</SelectItem>
                  <SelectItem value="booking">Booking Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Bookings</span>
              </div>
              <p className="text-2xl font-bold mt-2">{formatNumber(data.summary.total_bookings)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-green-500" />
                <span className="text-sm text-muted-foreground">Total Pax</span>
              </div>
              <p className="text-2xl font-bold mt-2">{formatNumber(data.summary.total_pax)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-yellow-500" />
                <span className="text-sm text-muted-foreground">Revenue</span>
              </div>
              <p className="text-2xl font-bold mt-2">{formatCurrency(data.summary.total_revenue)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                <span className="text-sm text-muted-foreground">Net Revenue</span>
              </div>
              <p className="text-2xl font-bold mt-2">{formatCurrency(data.summary.total_net_revenue)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-500" />
                <span className="text-sm text-muted-foreground">Avg Booking</span>
              </div>
              <p className="text-2xl font-bold mt-2">{formatCurrency(data.summary.avg_booking_value)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-500" />
                <span className="text-sm text-muted-foreground">Avg Pax</span>
              </div>
              <p className="text-2xl font-bold mt-2">{formatNumber(data.summary.avg_pax_per_booking)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs with detailed analytics */}
      {data && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tours">Tours</TabsTrigger>
            <TabsTrigger value="sellers">Sellers</TabsTrigger>
            <TabsTrigger value="affiliates">Affiliates</TabsTrigger>
            <TabsTrigger value="promo-codes">Promotions</TabsTrigger>
          </TabsList>

          {/* Tours Tab */}
          <TabsContent value="tours" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pax by Tour (Top 10)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_tour.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" fontSize={12} />
                      <YAxis
                        dataKey="title"
                        type="category"
                        width={280}
                        fontSize={11}
                        tickFormatter={(v) => v.length > 40 ? v.substring(0, 40) + '...' : v}
                      />
                      <Tooltip formatter={(value: number) => formatNumber(value)} />
                      <Bar dataKey="pax_sum" fill="#10b981" name="Pax" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>All Tours</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Tour</th>
                        <th className="text-right py-2 px-3">Bookings</th>
                        <th className="text-right py-2 px-3">Pax</th>
                        <th className="text-right py-2 px-3">Revenue</th>
                        <th className="text-right py-2 px-3">Net Revenue</th>
                        <th className="text-right py-2 px-3">Avg/Booking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_tour.map((row) => (
                        <tr key={row.activity_id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3 max-w-[300px] truncate" title={row.title}>{row.title}</td>
                          <td className="text-right py-2 px-3">{row.booking_count}</td>
                          <td className="text-right py-2 px-3">{row.pax_sum}</td>
                          <td className="text-right py-2 px-3">{formatCurrency(row.total_revenue)}</td>
                          <td className="text-right py-2 px-3">{formatCurrency(row.net_revenue)}</td>
                          <td className="text-right py-2 px-3">{formatCurrency(row.booking_count > 0 ? row.total_revenue / row.booking_count : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-bold bg-muted/50">
                        <td className="py-2 px-3">Total</td>
                        <td className="text-right py-2 px-3">{data.by_tour.reduce((sum, r) => sum + r.booking_count, 0)}</td>
                        <td className="text-right py-2 px-3">{data.by_tour.reduce((sum, r) => sum + r.pax_sum, 0)}</td>
                        <td className="text-right py-2 px-3">{formatCurrency(data.by_tour.reduce((sum, r) => sum + r.total_revenue, 0))}</td>
                        <td className="text-right py-2 px-3">{formatCurrency(data.by_tour.reduce((sum, r) => sum + r.net_revenue, 0))}</td>
                        <td className="text-right py-2 px-3">-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sellers Tab */}
          <TabsContent value="sellers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Seller</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_seller.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} fontSize={12} />
                      <YAxis
                        dataKey="seller"
                        type="category"
                        width={150}
                        fontSize={11}
                        tickFormatter={(v) => v.length > 20 ? v.substring(0, 20) + '...' : v}
                      />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="total_revenue" fill="#3b82f6" name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>All Sellers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Seller</th>
                        <th className="text-left py-2 px-3">Group</th>
                        <th className="text-right py-2 px-3">Bookings</th>
                        <th className="text-right py-2 px-3">Pax</th>
                        <th className="text-right py-2 px-3">Revenue</th>
                        <th className="text-right py-2 px-3">Net Revenue</th>
                        <th className="text-right py-2 px-3">Avg/Booking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.by_seller.map((row, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3">{row.seller}</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-xs ${row.seller_group === 'EnRoma.com' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                              {row.seller_group}
                            </span>
                          </td>
                          <td className="text-right py-2 px-3">{row.booking_count}</td>
                          <td className="text-right py-2 px-3">{row.pax_sum}</td>
                          <td className="text-right py-2 px-3">{formatCurrency(row.total_revenue)}</td>
                          <td className="text-right py-2 px-3">{formatCurrency(row.net_revenue)}</td>
                          <td className="text-right py-2 px-3">{formatCurrency(row.booking_count > 0 ? row.total_revenue / row.booking_count : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 font-bold bg-muted/50">
                        <td className="py-2 px-3">Total</td>
                        <td className="py-2 px-3">-</td>
                        <td className="text-right py-2 px-3">{data.by_seller.reduce((sum, r) => sum + r.booking_count, 0)}</td>
                        <td className="text-right py-2 px-3">{data.by_seller.reduce((sum, r) => sum + r.pax_sum, 0)}</td>
                        <td className="text-right py-2 px-3">{formatCurrency(data.by_seller.reduce((sum, r) => sum + r.total_revenue, 0))}</td>
                        <td className="text-right py-2 px-3">{formatCurrency(data.by_seller.reduce((sum, r) => sum + r.net_revenue, 0))}</td>
                        <td className="text-right py-2 px-3">-</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Affiliates Tab */}
          <TabsContent value="affiliates" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Commission by Affiliate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_affiliate.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => `€${v.toFixed(0)}`} fontSize={12} />
                      <YAxis
                        dataKey="affiliate_id"
                        type="category"
                        width={150}
                        fontSize={11}
                      />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="commission" fill="#10b981" name="Commission" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>All Affiliates (EnRoma.com)</CardTitle>
              </CardHeader>
              <CardContent>
                {data.by_affiliate.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No affiliate data for the selected period</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3">Affiliate</th>
                          <th className="text-right py-2 px-3">Bookings</th>
                          <th className="text-right py-2 px-3">Pax</th>
                          <th className="text-right py-2 px-3">Revenue</th>
                          <th className="text-right py-2 px-3">Commission</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_affiliate.map((row) => (
                          <tr key={row.affiliate_id} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-3 font-medium">{row.affiliate_id}</td>
                            <td className="text-right py-2 px-3">{row.booking_count}</td>
                            <td className="text-right py-2 px-3">{row.pax_sum}</td>
                            <td className="text-right py-2 px-3">{formatCurrency(row.total_revenue)}</td>
                            <td className="text-right py-2 px-3 text-green-600">{formatCurrency(row.commission)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-bold bg-muted/50">
                          <td className="py-2 px-3">Total</td>
                          <td className="text-right py-2 px-3">{data.by_affiliate.reduce((sum, r) => sum + r.booking_count, 0)}</td>
                          <td className="text-right py-2 px-3">{data.by_affiliate.reduce((sum, r) => sum + r.pax_sum, 0)}</td>
                          <td className="text-right py-2 px-3">{formatCurrency(data.by_affiliate.reduce((sum, r) => sum + r.total_revenue, 0))}</td>
                          <td className="text-right py-2 px-3 text-green-600">{formatCurrency(data.by_affiliate.reduce((sum, r) => sum + r.commission, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Promotions Tab */}
          <TabsContent value="promo-codes" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue by Promotion</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    {data.by_promo_code.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No promotions used in this period
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.by_promo_code.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} fontSize={12} />
                          <YAxis
                            dataKey="offer_name"
                            type="category"
                            width={150}
                            fontSize={10}
                            tickFormatter={(v) => v.length > 20 ? v.substring(0, 20) + '...' : v}
                          />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Bar dataKey="total_revenue" fill="#8b5cf6" name="Revenue" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Total Discount by Promotion</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    {data.by_promo_code.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        No promotions used in this period
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.by_promo_code.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickFormatter={(v) => `€${v.toFixed(0)}`} fontSize={12} />
                          <YAxis
                            dataKey="offer_name"
                            type="category"
                            width={150}
                            fontSize={10}
                            tickFormatter={(v) => v.length > 20 ? v.substring(0, 20) + '...' : v}
                          />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Bar dataKey="total_discount" fill="#ef4444" name="Discount Given" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>All Promotions</CardTitle>
              </CardHeader>
              <CardContent>
                {data.by_promo_code.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No promotions used in the selected period</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3">Promotion</th>
                          <th className="text-right py-2 px-3">Discount %</th>
                          <th className="text-right py-2 px-3">Bookings</th>
                          <th className="text-right py-2 px-3">Pax</th>
                          <th className="text-right py-2 px-3">Revenue</th>
                          <th className="text-right py-2 px-3">Total Discount</th>
                          <th className="text-right py-2 px-3">Avg/Booking</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.by_promo_code.map((row) => (
                          <tr key={row.offer_id} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-3 font-medium max-w-[250px] truncate" title={row.offer_name}>{row.offer_name}</td>
                            <td className="text-right py-2 px-3">{row.discount_percentage}%</td>
                            <td className="text-right py-2 px-3">{row.booking_count}</td>
                            <td className="text-right py-2 px-3">{row.pax_sum}</td>
                            <td className="text-right py-2 px-3">{formatCurrency(row.total_revenue)}</td>
                            <td className="text-right py-2 px-3 text-red-600">-{formatCurrency(row.total_discount)}</td>
                            <td className="text-right py-2 px-3">{formatCurrency(row.booking_count > 0 ? row.total_revenue / row.booking_count : 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-bold bg-muted/50">
                          <td className="py-2 px-3">Total</td>
                          <td className="text-right py-2 px-3">-</td>
                          <td className="text-right py-2 px-3">{data.by_promo_code.reduce((sum, r) => sum + r.booking_count, 0)}</td>
                          <td className="text-right py-2 px-3">{data.by_promo_code.reduce((sum, r) => sum + r.pax_sum, 0)}</td>
                          <td className="text-right py-2 px-3">{formatCurrency(data.by_promo_code.reduce((sum, r) => sum + r.total_revenue, 0))}</td>
                          <td className="text-right py-2 px-3 text-red-600">-{formatCurrency(data.by_promo_code.reduce((sum, r) => sum + r.total_discount, 0))}</td>
                          <td className="text-right py-2 px-3">-</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
