# Changelog

## [4.1.0] - 2026-01-21

### Added
- **Notification Rules System**: Create automated notification rules with visual condition builder
  - Trigger events: booking_cancelled, voucher_uploaded, age_mismatch, sync_failure, and more
  - Flexible AND/OR condition trees for complex rule logic
  - Multi-channel delivery: Push notifications and Email via Resend
  - Template variables for dynamic notification content ({customer_name}, {booking_id}, etc.)
  - Rule-triggered alerts now appear in Operations > Notifications > Alerts tab
- **Webhook Integration**: booking-webhook-system now triggers notification rules on booking cancellations
- New API endpoint `/api/notification-rules/evaluate` for external rule evaluation

### Changed
- Removed "Create Alert" manual tab - notifications are now fully automated via rules
- Notifications page now uses secure API endpoints instead of direct client-side queries

### Security
- Added admin role verification to all notification API endpoints
- Removed arbitrary email recipient parameter from send-alert endpoint
- Webhook authentication now requires `SUPABASE_WEBHOOK_SECRET` (returns 503 if not configured)
- Notifications now capture `resolved_by` and `resolved_at` for audit trail
- Client-side Supabase queries replaced with authenticated API calls

### Database
- Added `rule_triggered` notification type to `booking_notifications` table
- New table: `notification_rules` for storing rule configurations
