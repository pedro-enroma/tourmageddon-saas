-- Create a view for finance report data
-- Groups EnRoma.com separately (with affiliate_id for sub-grouping) and all others as 'Resellers'
-- This view aggregates data from activity_bookings table with seller information

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
    
    -- Additional useful metrics
    COUNT(DISTINCT ab.booking_id) as unique_bookings,
    AVG(ab.total_price::numeric) as avg_booking_value,
    
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_finance_report_activity_date ON activity_bookings(start_date_time);
CREATE INDEX IF NOT EXISTS idx_finance_report_booking_date ON activity_bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_finance_report_seller ON activity_bookings(activity_seller);
CREATE INDEX IF NOT EXISTS idx_finance_report_status ON activity_bookings(status);
CREATE INDEX IF NOT EXISTS idx_finance_report_affiliate ON activity_bookings(affiliate_id);

-- Grant permissions
GRANT SELECT ON finance_report_data TO authenticated;
GRANT SELECT ON finance_report_data TO anon;

-- Verify the view was created successfully
SELECT 
    seller_group,
    affiliate_id,
    COUNT(*) as record_count,
    SUM(reservation_count) as total_reservations,
    SUM(total_revenue) as total_revenue
FROM finance_report_data
WHERE activity_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY seller_group, affiliate_id
ORDER BY seller_group, affiliate_id;