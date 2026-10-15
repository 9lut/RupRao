-- Private share links, optional access code, per-event threshold, retention.
ALTER TABLE events ADD COLUMN IF NOT EXISTS share_token VARCHAR(32);
ALTER TABLE events ADD COLUMN IF NOT EXISTS access_code VARCHAR(16);
ALTER TABLE events ADD COLUMN IF NOT EXISTS match_threshold REAL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE events
SET share_token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
WHERE share_token IS NULL;

ALTER TABLE events ALTER COLUMN share_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS events_share_token_idx ON events (share_token);
CREATE INDEX IF NOT EXISTS events_expires_at_idx ON events (expires_at) WHERE expires_at IS NOT NULL;

-- "Please remove my photos" requests (PDPA). Stores no selfie and no embedding.
CREATE TABLE IF NOT EXISTS removal_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    photo_ids   UUID[] NOT NULL,
    contact     VARCHAR(255),
    note        TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS removal_requests_event_idx ON removal_requests (event_id, status);
