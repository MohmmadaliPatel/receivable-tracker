-- Migration script to rename recipient to sender
-- Run this manually in your SQLite database before running prisma db push

-- Step 1: Rename recipients table to senders
ALTER TABLE recipients RENAME TO senders;

-- Step 2: Update email_trackings table
-- Add new senderId column
ALTER TABLE email_trackings ADD COLUMN senderId TEXT;
-- Copy data from recipientId to senderId
UPDATE email_trackings SET senderId = recipientId;
-- Drop old recipientId column (SQLite doesn't support DROP COLUMN directly, so we'll recreate the table)
-- Note: This is a simplified approach. For production, you'd want a more careful migration.

-- Step 3: Update forwarding_rules table  
-- Add new senderId column
ALTER TABLE forwarding_rules ADD COLUMN senderId TEXT;
-- Copy data from recipientId to senderId
UPDATE forwarding_rules SET senderId = recipientId;

-- Note: SQLite doesn't support DROP COLUMN, so the old recipientId columns will remain
-- but won't be used. You can manually remove them later if needed.


