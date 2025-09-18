-- Update finance_report_data view to:
-- 1. Exclude CANCELLED and IMPORTED statuses
-- 2. Count unique booking IDs correctly

DROP VIEW IF EXISTS finance_report_data CASCADE;

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

    -- Metrics
    COUNT(DISTINCT ab.activity_booking_id) as reservation_count,
    SUM(ab.total_price::numeric) as total_revenue,

    -- Count unique booking IDs (not rows)
    COUNT(DISTINCT ab.id) as unique_bookings,
    AVG(ab.total_price::numeric) as avg_booking_value,

    -- Total participants
    SUM(ab.quantity) as total_participants,

    -- Time-based groupings for chart
    TO_CHAR(ab.start_date_time, 'YYYY-MM') as month_year,
    TO_CHAR(ab.start_date_time, 'YYYY-WW') as week_year,
    EXTRACT(YEAR FROM ab.start_date_time) as year,
    EXTRACT(MONTH FROM ab.start_date_time) as month,
    EXTRACT(WEEK FROM ab.start_date_time) as week

FROM activity_bookings ab
-- Include all statuses except CANCELLED and IMPORTED
WHERE (ab.status IS NULL OR ab.status NOT IN ('CANCELLED', 'IMPORTED'))
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

-- Grant permissions
GRANT SELECT ON finance_report_data TO authenticated;
GRANT SELECT ON finance_report_data TO anon;