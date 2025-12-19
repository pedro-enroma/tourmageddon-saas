-- Migration: Update finance_report_data view to use net_price instead of total_price
-- Purpose: Revenue should always reflect net_price from activity_bookings

CREATE OR REPLACE VIEW finance_report_data AS
SELECT
    -- Date dimensions for grouping
    DATE(ab.start_date_time) as activity_date,
    DATE(ab.created_at) as booking_date,

    -- Seller grouping (EnRoma.com vs Resellers)
    CASE
        WHEN ab.activity_seller = 'EnRoma.com' THEN 'EnRoma.com'
        ELSE 'Resellers'
    END as seller_group,

    -- Individual seller info (for drill-down if needed)
    ab.activity_seller as original_seller,

    -- Affiliate info for EnRoma.com sub-grouping
    -- Only populated for EnRoma.com bookings, NULL for resellers
    CASE
        WHEN ab.activity_seller = 'EnRoma.com' THEN ab.affiliate_id
        ELSE NULL
    END as affiliate_id,

    -- Affiliate label for display (only for EnRoma.com)
    CASE
        WHEN ab.activity_seller = 'EnRoma.com' AND ab.affiliate_id IS NOT NULL THEN
            'EnRoma.com - ' || ab.affiliate_id
        WHEN ab.activity_seller = 'EnRoma.com' AND ab.affiliate_id IS NULL THEN
            'EnRoma.com - Direct'
        ELSE ab.activity_seller
    END as seller_with_affiliate,

    -- Metrics - CHANGED: using net_price instead of total_price for revenue
    COUNT(DISTINCT ab.activity_booking_id) as reservation_count,
    SUM(COALESCE(ab.net_price::numeric, ab.total_price::numeric, 0)) as total_revenue,

    -- Additional useful metrics
    COUNT(DISTINCT ab.booking_id) as unique_bookings,
    AVG(COALESCE(ab.net_price::numeric, ab.total_price::numeric, 0)) as avg_booking_value,

    -- Time-based groupings for chart
    TO_CHAR(ab.start_date_time, 'YYYY-MM') as month_year,
    TO_CHAR(ab.start_date_time, 'YYYY-WW') as week_year,
    EXTRACT(YEAR FROM ab.start_date_time) as year,
    EXTRACT(MONTH FROM ab.start_date_time) as month,
    EXTRACT(WEEK FROM ab.start_date_time) as week

FROM activity_bookings ab
WHERE ab.status IN ('CONFIRMED', 'COMPLETED') -- Only include confirmed bookings
GROUP BY
    DATE(ab.start_date_time),
    DATE(ab.created_at),
    CASE
        WHEN ab.activity_seller = 'EnRoma.com' THEN 'EnRoma.com'
        ELSE 'Resellers'
    END,
    ab.activity_seller,
    CASE
        WHEN ab.activity_seller = 'EnRoma.com' THEN ab.affiliate_id
        ELSE NULL
    END,
    CASE
        WHEN ab.activity_seller = 'EnRoma.com' AND ab.affiliate_id IS NOT NULL THEN
            'EnRoma.com - ' || ab.affiliate_id
        WHEN ab.activity_seller = 'EnRoma.com' AND ab.affiliate_id IS NULL THEN
            'EnRoma.com - Direct'
        ELSE ab.activity_seller
    END,
    TO_CHAR(ab.start_date_time, 'YYYY-MM'),
    TO_CHAR(ab.start_date_time, 'YYYY-WW'),
    EXTRACT(YEAR FROM ab.start_date_time),
    EXTRACT(MONTH FROM ab.start_date_time),
    EXTRACT(WEEK FROM ab.start_date_time);
