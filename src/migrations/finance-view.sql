CREATE OR REPLACE VIEW finance_report_data AS
SELECT 
    DATE(ab.start_date_time) as activity_date,
    DATE(ab.created_at) as booking_date,
    
    CASE 
        WHEN ab.activity_seller = 'EnRoma.com' THEN 'EnRoma.com'
        ELSE 'Resellers'
    END as seller_group,
    
    ab.activity_seller as original_seller,
    
    CASE 
        WHEN ab.activity_seller = 'EnRoma.com' THEN ab.affiliate_id
        ELSE NULL
    END as affiliate_id,
    
    CASE 
        WHEN ab.activity_seller = 'EnRoma.com' AND ab.affiliate_id IS NOT NULL THEN 
            'EnRoma.com - ' || ab.affiliate_id
        WHEN ab.activity_seller = 'EnRoma.com' AND ab.affiliate_id IS NULL THEN 
            'EnRoma.com - Direct'
        ELSE ab.activity_seller
    END as seller_with_affiliate,
    
    COUNT(DISTINCT ab.activity_booking_id) as reservation_count,
    SUM(ab.total_price::numeric) as total_revenue,
    COUNT(DISTINCT ab.booking_id) as unique_bookings,
    AVG(ab.total_price::numeric) as avg_booking_value,
    
    TO_CHAR(ab.start_date_time, 'YYYY-MM') as month_year,
    TO_CHAR(ab.start_date_time, 'YYYY-WW') as week_year,
    EXTRACT(YEAR FROM ab.start_date_time) as year,
    EXTRACT(MONTH FROM ab.start_date_time) as month,
    EXTRACT(WEEK FROM ab.start_date_time) as week
    
FROM activity_bookings ab
WHERE ab.status IN ('CONFIRMED', 'COMPLETED')
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

CREATE INDEX IF NOT EXISTS idx_finance_report_activity_date ON activity_bookings(start_date_time);
CREATE INDEX IF NOT EXISTS idx_finance_report_booking_date ON activity_bookings(created_at);
CREATE INDEX IF NOT EXISTS idx_finance_report_seller ON activity_bookings(activity_seller);
CREATE INDEX IF NOT EXISTS idx_finance_report_status ON activity_bookings(status);
CREATE INDEX IF NOT EXISTS idx_finance_report_affiliate ON activity_bookings(affiliate_id);

GRANT SELECT ON finance_report_data TO authenticated;
GRANT SELECT ON finance_report_data TO anon;