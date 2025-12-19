import { NextRequest, NextResponse } from 'next/server'
import { getServiceRoleClient, verifySession } from '@/lib/supabase-server'

// GET - Search activity_bookings
export async function GET(request: NextRequest) {
  const { user, error: authError } = await verifySession()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim()

    if (!query || query.length < 2) {
      return NextResponse.json({ error: 'Search query must be at least 2 characters' }, { status: 400 })
    }

    const supabase = getServiceRoleClient()

    // Search by booking_id or activity_booking_id (numeric fields)
    // For numeric search, try to parse as number first
    const numericQuery = parseInt(query, 10)
    const isNumeric = !isNaN(numericQuery) && query === String(numericQuery)

    let bookingsData = null
    let bookingsError = null

    if (isNumeric) {
      // Search by exact numeric match or partial match using text cast
      const result = await supabase
        .from('activity_bookings')
        .select(`
          activity_booking_id,
          booking_id,
          product_title,
          start_date_time,
          status,
          activity_id,
          bookings!inner (
            booking_id,
            total_price,
            currency
          )
        `)
        .or(`booking_id.eq.${numericQuery},activity_booking_id.eq.${numericQuery}`)
        .order('start_date_time', { ascending: false })
        .limit(20)

      bookingsData = result.data
      bookingsError = result.error
    }

    if (bookingsError) {
      console.error('Error searching bookings:', bookingsError)
      return NextResponse.json({ error: 'Failed to search bookings' }, { status: 500 })
    }

    // If we have results, fetch customer info
    let results = bookingsData || []

    if (results.length > 0) {
      const bookingIds = [...new Set(results.map(r => r.booking_id))]

      // Get customer info via booking_customers -> customers
      const { data: bookingCustomers } = await supabase
        .from('booking_customers')
        .select('booking_id, customer_id')
        .in('booking_id', bookingIds)

      if (bookingCustomers && bookingCustomers.length > 0) {
        const customerIds = [...new Set(bookingCustomers.map(bc => bc.customer_id))]

        const { data: customers } = await supabase
          .from('customers')
          .select('customer_id, first_name, last_name, email, phone_number')
          .in('customer_id', customerIds)

        // Build lookup maps
        const bookingToCustomer = new Map()
        bookingCustomers.forEach(bc => {
          bookingToCustomer.set(bc.booking_id, bc.customer_id)
        })

        const customerMap = new Map()
        customers?.forEach(c => {
          customerMap.set(c.customer_id, c)
        })

        // Attach customer info to results
        results = results.map(r => {
          const customerId = bookingToCustomer.get(r.booking_id)
          const customer = customerId ? customerMap.get(customerId) : null
          return {
            ...r,
            customer_first_name: customer?.first_name || null,
            customer_last_name: customer?.last_name || null,
            customer_email: customer?.email || null,
            customer_phone: customer?.phone_number || null
          }
        })
      }
    }

    // Also search by customer email
    if (query.includes('@')) {
      const { data: customersByEmail } = await supabase
        .from('customers')
        .select('customer_id, first_name, last_name, email, phone_number')
        .ilike('email', `%${query}%`)
        .limit(10)

      if (customersByEmail && customersByEmail.length > 0) {
        const customerIds = customersByEmail.map(c => c.customer_id)

        const { data: bookingCustomers } = await supabase
          .from('booking_customers')
          .select('booking_id, customer_id')
          .in('customer_id', customerIds)

        if (bookingCustomers && bookingCustomers.length > 0) {
          const bookingIds = [...new Set(bookingCustomers.map(bc => bc.booking_id))]

          const { data: additionalBookings } = await supabase
            .from('activity_bookings')
            .select(`
              activity_booking_id,
              booking_id,
              product_title,
              start_date_time,
              status,
              activity_id,
              bookings!inner (
                booking_id,
                total_price,
                currency
              )
            `)
            .in('booking_id', bookingIds)
            .order('start_date_time', { ascending: false })
            .limit(20)

          if (additionalBookings) {
            // Build lookup maps
            const bookingToCustomer = new Map()
            bookingCustomers.forEach(bc => {
              bookingToCustomer.set(bc.booking_id, bc.customer_id)
            })

            const customerMap = new Map()
            customersByEmail.forEach(c => {
              customerMap.set(c.customer_id, c)
            })

            // Attach customer info
            const additionalWithCustomer = additionalBookings.map(r => {
              const customerId = bookingToCustomer.get(r.booking_id)
              const customer = customerId ? customerMap.get(customerId) : null
              return {
                ...r,
                customer_first_name: customer?.first_name || null,
                customer_last_name: customer?.last_name || null,
                customer_email: customer?.email || null,
                customer_phone: customer?.phone_number || null
              }
            })

            // Merge results, avoiding duplicates
            const existingIds = new Set(results.map(r => r.activity_booking_id))
            additionalWithCustomer.forEach(r => {
              if (!existingIds.has(r.activity_booking_id)) {
                results.push(r)
              }
            })
          }
        }
      }
    }

    return NextResponse.json({ data: results })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
