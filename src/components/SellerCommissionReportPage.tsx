'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Download, RefreshCw, DollarSign, TrendingUp, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { sanitizeDataForExcel } from '@/lib/security/sanitize'

interface CommissionSummary {
  seller_name: string
  booking_count: number
  total_revenue: number
  total_commission: number
}

export default function SellerCommissionReportPage() {
  const [reportData, setReportData] = useState<CommissionSummary[]>([])
  const [sellers, setSellers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  })
  const [selectedSeller, setSelectedSeller] = useState<string>('__all__')

  useEffect(() => {
    loadSellers()
  }, [])

  useEffect(() => {
    loadReport()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, selectedSeller])

  const loadSellers = async () => {
    try {
      const res = await fetch('/api/seller-commissions/sellers')
      const data = await res.json()
      if (res.ok) {
        setSellers(data.sellers || [])
      }
    } catch (error) {
      console.error('Failed to load sellers:', error)
    }
  }

  const loadReport = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        start_date: dateRange.start,
        end_date: dateRange.end
      })
      if (selectedSeller && selectedSeller !== '__all__') {
        params.append('seller', selectedSeller)
      }

      const res = await fetch(`/api/seller-commissions/report?${params.toString()}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load report')
      }

      setReportData(data.data || [])
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to load report',
      })
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(value)
  }

  const totals = reportData.reduce(
    (acc, row) => ({
      booking_count: acc.booking_count + row.booking_count,
      total_revenue: acc.total_revenue + row.total_revenue,
      total_commission: acc.total_commission + row.total_commission
    }),
    { booking_count: 0, total_revenue: 0, total_commission: 0 }
  )

  const exportToExcel = () => {
    if (reportData.length === 0) {
      toast.error('No data', {
        description: 'No data to export',
      })
      return
    }

    const exportData = reportData.map(row => ({
      'Seller': row.seller_name,
      'Bookings': row.booking_count,
      'Total Revenue': row.total_revenue,
      'Total Commission': row.total_commission,
      'Commission Rate': row.total_revenue > 0
        ? ((row.total_commission / row.total_revenue) * 100).toFixed(2) + '%'
        : '0%'
    }))

    // Add totals row
    exportData.push({
      'Seller': 'TOTAL',
      'Bookings': totals.booking_count,
      'Total Revenue': totals.total_revenue,
      'Total Commission': totals.total_commission,
      'Commission Rate': totals.total_revenue > 0
        ? ((totals.total_commission / totals.total_revenue) * 100).toFixed(2) + '%'
        : '0%'
    })

    const ws = XLSX.utils.json_to_sheet(sanitizeDataForExcel(exportData as unknown as Record<string, unknown>[]))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Commission Report')
    XLSX.writeFile(wb, `commission-report-${dateRange.start}-${dateRange.end}.xlsx`)

    toast.success('Report exported successfully')
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Commission Report</h1>
          <p className="text-muted-foreground">View seller commission summary by date range</p>
        </div>
        <Button onClick={exportToExcel} disabled={reportData.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export Excel
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seller">Seller</Label>
              <Select
                value={selectedSeller}
                onValueChange={setSelectedSeller}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All sellers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Sellers</SelectItem>
                  {sellers.map((seller) => (
                    <SelectItem key={seller} value={seller}>
                      {seller}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button onClick={loadReport} disabled={loading} className="w-full">
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sellers</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reportData.length}</div>
            <p className="text-xs text-muted-foreground">in selected period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.booking_count.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">from all sellers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.total_revenue)}</div>
            <p className="text-xs text-muted-foreground">gross revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totals.total_commission)}
            </div>
            <p className="text-xs text-muted-foreground">
              {totals.total_revenue > 0
                ? `${((totals.total_commission / totals.total_revenue) * 100).toFixed(1)}% avg rate`
                : '0% avg rate'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report Table */}
      <Card>
        <CardHeader>
          <CardTitle>Commission by Seller</CardTitle>
          <CardDescription>
            Breakdown of bookings, revenue, and commission by seller for the selected period
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seller</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No data for the selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {reportData.map((row) => (
                      <TableRow key={row.seller_name}>
                        <TableCell className="font-medium">{row.seller_name}</TableCell>
                        <TableCell className="text-right">{row.booking_count.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.total_revenue)}</TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {formatCurrency(row.total_commission)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.total_revenue > 0
                            ? `${((row.total_commission / row.total_revenue) * 100).toFixed(1)}%`
                            : '0%'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals Row */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right">{totals.booking_count.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatCurrency(totals.total_revenue)}</TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrency(totals.total_commission)}
                      </TableCell>
                      <TableCell className="text-right">
                        {totals.total_revenue > 0
                          ? `${((totals.total_commission / totals.total_revenue) * 100).toFixed(1)}%`
                          : '0%'}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
