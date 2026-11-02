-- Accounts for event organizers, managed by a super admin. The .env ADMIN_USERNAME stays a
-- built-in super admin (bootstrap / recovery) and is not stored here.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    display_name VARCHAR(255),
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'organizer',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (LOWER(username));

-- NULL owner = created by the built-in admin (or its owner was deleted): only super admins see it.
ALTER TABLE events ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS events_owner_id ON events (owner_id);
