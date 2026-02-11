-- Add Telegram channel support to notification rules
ALTER TABLE notification_rules ADD COLUMN telegram_chat_ids TEXT[] DEFAULT ARRAY[]::TEXT[];
