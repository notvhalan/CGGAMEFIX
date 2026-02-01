-- Add password authentication support to users table

-- Make google_sub nullable (for users who sign up with email/password)
ALTER TABLE users ALTER COLUMN google_sub DROP NOT NULL;

-- Add password_hash column
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Drop the unique constraint on google_sub (allow NULL for email/password users)
DROP INDEX IF EXISTS idx_users_google_sub;
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
