import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const dateType = searchParams.get('date_type') || 'travel' // 'travel' or 'booking'

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Determine which date field to use
    const dateField = dateType === 'booking' ? 'created_at' : 'start_date_time'
    const startDateTime = `${startDate}T00:00:00`
    const endDateTime = `${endDate}T23:59:59`

    // Fetch all bookings in the date range with pagination (Supabase limits to 1000 per request)
    type BookingRecord = {
      activity_booking_id: number
      booking_id: number
      activity_id: string | null
      start_date_time: string
      created_at: string
      status: string
      total_price: number | null
      net_price: number | null
      activity_seller: string | null
      affiliate_id: string | null
      product_title: string | null
      activities: { activity_id: string; title: string } | null
      pricing_category_bookings: { pricing_category_booking_id: number }[] | null
    }

    const PAGE_SIZE = 1000
    let allBookings: BookingRecord[] = []
    let page = 0
    let hasMore = true

    while (hasMore) {
      const { data: bookingsPage, error } = await supabase
        .from('activity_bookings')
        .select(`
          activity_booking_id,
          booking_id,
          activity_id,
          start_date_time,
          created_at,
          status,
          total_price,
          net_price,
          activity_seller,
          affiliate_id,
          product_title,
          activities (
            activity_id,
            title
          ),
          pricing_category_bookings (
            pricing_category_booking_id
          )
        `)
        .gte(dateField, startDateTime)
        .lte(dateField, endDateTime)
        .in('status', ['CONFIRMED', 'COMPLETED'])
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .order('activity_booking_id', { ascending: true })

      if (error) {
        console.error('Error fetching bookings:', error)
        return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
      }

      if (bookingsPage && bookingsPage.length > 0) {
        allBookings = [...allBookings, ...bookingsPage]
        hasMore = bookingsPage.length === PAGE_SIZE
        page++
      } else {
        hasMore = false
      }
    }

    const bookings = allBookings

    // Fetch promotions used in the date range (using view with offer titles)
    const activityBookingIds = bookings?.map(b => b.activity_booking_id) || []

    let promotionsData: { offer_id: number; activity_booking_id: number; discount_amount: number; discount_percentage: number; offer_title: string }[] = []
    if (activityBookingIds.length > 0) {
      const { data: promotions } = await supabase
        .from('v_booking_promotions_with_names')
        .select('offer_id, activity_booking_id, discount_amount, discount_percentage, offer_title')
        .in('activity_booking_id', activityBookingIds)
      promotionsData = promotions || []
    }

    // Create a map of activity_booking_id to promotion
    const promoByBooking = new Map<number, { offer_id: number; discount_amount: number; discount_percentage: number; offer_title: string }>()
    promotionsData.forEach(p => {
      promoByBooking.set(p.activity_booking_id, {
        offer_id: p.offer_id,
        discount_amount: Number(p.discount_amount) || 0,
        discount_percentage: Number(p.discount_percentage) || 0,
        offer_title: p.offer_title || 'Unknown Offer'
      })
    })

    // Process and aggregate data
    const byDate = new Map<string, { booking_count: number; pax_sum: number; total_revenue: number; net_revenue: number }>()
    const byTour = new Map<string, { activity_id: string; title: string; booking_count: number; pax_sum: number; total_revenue: number; net_revenue: number }>()
    const bySeller = new Map<string, { seller: string; seller_group: string; booking_count: number; pax_sum: number; total_revenue: number; net_revenue: number }>()
    const byAffiliate = new Map<string, { affiliate_id: string; booking_count: number; pax_sum: number; total_revenue: number; net_revenue: number }>()
    const byProduct = new Map<string, { product_title: string; booking_count: number; pax_sum: number; total_revenue: number; net_revenue: number }>()
    const byPromoCode = new Map<number, { offer_id: number; offer_name: string; booking_count: number; pax_sum: number; total_revenue: number; net_revenue: number; total_discount: number; discount_percentage: number }>()

    // Totals
    let totalBookings = 0
    let totalPax = 0
    let totalRevenue = 0
    let totalNetRevenue = 0

    // Track unique bookings for accurate count
    const uniqueBookingIds = new Set<number>()

    bookings?.forEach(booking => {
      const date = dateType === 'booking'
        ? new Date(booking.created_at).toISOString().split('T')[0]
        : new Date(booking.start_date_time).toISOString().split('T')[0]

      const activityId = booking.activity_id || 'unknown'
      const activityData = booking.activities as { activity_id: string; title: string } | null
      const activityTitle = activityData?.title || booking.product_title || 'Unknown Tour'
      const seller = booking.activity_seller || 'Unknown'
      const sellerGroup = seller === 'EnRoma.com' ? 'EnRoma.com' : 'Resellers'
      const affiliateId = booking.affiliate_id || 'Direct'
      const productTitle = booking.product_title || 'Unknown Product'

      // Count pax from pricing_category_bookings
      const pricingBookings = booking.pricing_category_bookings as { pricing_category_booking_id: number }[] | null
      const pax = pricingBookings?.length || 0

      const totalPrice = Number(booking.total_price) || 0
      const netRevenue = Number(booking.net_price) || 0
      // For resellers, if total_price is 0 but net_price exists, use net_price as revenue
      const revenue = totalPrice > 0 ? totalPrice : netRevenue

      // Only count unique bookings for booking_count
      const isNewBooking = !uniqueBookingIds.has(booking.booking_id)
      if (isNewBooking) {
        uniqueBookingIds.add(booking.booking_id)
      }

      // Update totals
      if (isNewBooking) totalBookings++
      totalPax += pax
      totalRevenue += revenue
      totalNetRevenue += netRevenue

      // By Date
      const dateStats = byDate.get(date) || { booking_count: 0, pax_sum: 0, total_revenue: 0, net_revenue: 0 }
      if (isNewBooking) dateStats.booking_count++
      dateStats.pax_sum += pax
      dateStats.total_revenue += revenue
      dateStats.net_revenue += netRevenue
      byDate.set(date, dateStats)

      // By Tour - count each activity_booking as a booking (not unique booking_id)
      const tourStats = byTour.get(activityId) || { activity_id: activityId, title: activityTitle, booking_count: 0, pax_sum: 0, total_revenue: 0, net_revenue: 0 }
      tourStats.booking_count++ // Each activity_booking is a tour booking
      tourStats.pax_sum += pax
      tourStats.total_revenue += revenue
      tourStats.net_revenue += netRevenue
      byTour.set(activityId, tourStats)

      // By Seller
      const sellerKey = `${seller}|${sellerGroup}`
      const sellerStats = bySeller.get(sellerKey) || { seller, seller_group: sellerGroup, booking_count: 0, pax_sum: 0, total_revenue: 0, net_revenue: 0 }
      if (isNewBooking) sellerStats.booking_count++
      sellerStats.pax_sum += pax
      sellerStats.total_revenue += revenue
      sellerStats.net_revenue += netRevenue
      bySeller.set(sellerKey, sellerStats)

      // By Affiliate (only for EnRoma.com)
      if (sellerGroup === 'EnRoma.com') {
        const affStats = byAffiliate.get(affiliateId) || { affiliate_id: affiliateId, booking_count: 0, pax_sum: 0, total_revenue: 0, net_revenue: 0 }
        if (isNewBooking) affStats.booking_count++
        affStats.pax_sum += pax
        affStats.total_revenue += revenue
        affStats.net_revenue += netRevenue
        byAffiliate.set(affiliateId, affStats)
      }

      // By Product/Offer - count each activity_booking as a booking
      const productStats = byProduct.get(productTitle) || { product_title: productTitle, booking_count: 0, pax_sum: 0, total_revenue: 0, net_revenue: 0 }
      productStats.booking_count++ // Each activity_booking is a product booking
      productStats.pax_sum += pax
      productStats.total_revenue += revenue
      productStats.net_revenue += netRevenue
      byProduct.set(productTitle, productStats)

      // By Promotion/Offer - count each activity_booking
      const promoInfo = promoByBooking.get(booking.activity_booking_id)
      if (promoInfo) {
        const offerId = promoInfo.offer_id
        const promoStats = byPromoCode.get(offerId) || {
          offer_id: offerId,
          offer_name: promoInfo.offer_title,
          booking_count: 0,
          pax_sum: 0,
          total_revenue: 0,
          net_revenue: 0,
          total_discount: 0,
          discount_percentage: promoInfo.discount_percentage
        }
        promoStats.booking_count++ // Each activity_booking with this promo
        promoStats.pax_sum += pax
        promoStats.total_revenue += revenue
        promoStats.net_revenue += netRevenue
        promoStats.total_discount += promoInfo.discount_amount
        byPromoCode.set(offerId, promoStats)
      }
    })

    // Convert maps to sorted arrays
    const dateData = Array.from(byDate.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const tourData = Array.from(byTour.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)

    const sellerData = Array.from(bySeller.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)

    // Fetch affiliate data from materialized view for accurate commission
    const { data: affiliateMvData } = await supabase
      .from('activity_bookings_participants_mv')
      .select('affiliate_id, total_price, affiliate_commission, start_date_time')
      .not('affiliate_id', 'is', null)
      .gte('start_date_time', startDateTime)
      .lte('start_date_time', endDateTime)
      .limit(50000)

    // Aggregate affiliate stats from materialized view
    const affiliateStats = new Map<string, { affiliate_id: string; booking_count: number; pax_sum: number; total_revenue: number; commission: number }>()
    affiliateMvData?.forEach(row => {
      const affId = row.affiliate_id || 'Direct'
      // Exclude test affiliate
      if (affId === 'est123') return
      const stats = affiliateStats.get(affId) || { affiliate_id: affId, booking_count: 0, pax_sum: 0, total_revenue: 0, commission: 0 }
      stats.booking_count++
      stats.pax_sum++ // Each row is a participant
      stats.total_revenue += Number(row.total_price) || 0
      stats.commission += Number(row.affiliate_commission) || 0
      affiliateStats.set(affId, stats)
    })

    const affiliateData = Array.from(affiliateStats.values())
      .filter(a => a.affiliate_id !== 'est123') // Double-check exclusion
      .sort((a, b) => b.total_revenue - a.total_revenue)

    const productData = Array.from(byProduct.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)

    const promoCodeData = Array.from(byPromoCode.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)

    return NextResponse.json({
      summary: {
        total_bookings: totalBookings,
        total_pax: totalPax,
        total_revenue: totalRevenue,
        total_net_revenue: totalNetRevenue,
        avg_booking_value: totalBookings > 0 ? totalRevenue / totalBookings : 0,
        avg_pax_per_booking: totalBookings > 0 ? totalPax / totalBookings : 0
      },
      by_date: dateData,
      by_tour: tourData,
      by_seller: sellerData,
      by_affiliate: affiliateData,
      by_product: productData,
      by_promo_code: promoCodeData
    })
  } catch (err) {
    console.error('Tour analytics error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
