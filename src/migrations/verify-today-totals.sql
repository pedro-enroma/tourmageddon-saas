-- Verify today's totals directly from activity_bookings
-- Check bookings created today (Transaction Date)
SELECT 
    'Bookings Created Today' as metric_type,
    COUNT(DISTINCT activity_booking_id) as booking_count,
    COUNT(DISTINCT booking_id) as unique_booking_count,
    COUNT(*) as total_records,
    SUM(CAST(total_price AS DECIMAL(10,2))) as total_revenue,
    MIN(created_at) as earliest_booking,
    MAX(created_at) as latest_booking
FROM activity_bookings
WHERE DATE(created_at) = CURRENT_DATE
    AND status != 'CANCELLED';

-- Check activities happening today (Tour Date)
SELECT 
    'Activities Today' as metric_type,
    COUNT(DISTINCT activity_booking_id) as booking_count,
    COUNT(DISTINCT booking_id) as unique_booking_count,
    COUNT(*) as total_records,
    SUM(CAST(total_price AS DECIMAL(10,2))) as total_revenue,
    MIN(start_date_time) as earliest_activity,
    MAX(start_date_time) as latest_activity
FROM activity_bookings
WHERE DATE(start_date_time) = CURRENT_DATE
    AND status != 'CANCELLED';

-- Group by seller for today's bookings
SELECT 
    activity_seller,
    COUNT(DISTINCT activity_booking_id) as booking_count,
    SUM(CAST(total_price AS DECIMAL(10,2))) as total_revenue
FROM activity_bookings
WHERE DATE(created_at) = CURRENT_DATE
    AND status != 'CANCELLED'
GROUP BY activity_seller
ORDER BY total_revenue DESC;

-- Check what the finance view is showing for today
SELECT 
    booking_date,
    seller_group,
    SUM(reservation_count) as total_reservations,
    SUM(total_revenue) as total_revenue,
    SUM(unique_bookings) as unique_bookings
FROM finance_report_data
WHERE booking_date = CURRENT_DATE
GROUP BY booking_date, seller_group;

-- Show some sample records from today to verify
SELECT 
    activity_booking_id,
    booking_id,
    activity_seller,
    total_price,
    status,
    created_at,
    start_date_time
FROM activity_bookings
WHERE DATE(created_at) = CURRENT_DATE
    AND status != 'CANCELLED'
ORDER BY created_at DESC
LIMIT 10;