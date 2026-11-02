-- Storage used by each photo (original + thumbnail). NULL = not counted yet; photos uploaded before
-- this migration are filled in from object storage when the API starts (services/usage.py).
ALTER TABLE photos ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

-- Optional limits, set by a super admin. NULL = unlimited.
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT;

-- One row per anonymous browser per event, to count people rather than requests. `visitor` is a keyed
-- hash that differs per event, so it can't be traced back or followed across events.
CREATE TABLE IF NOT EXISTS event_visitors (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    visitor VARCHAR(64) NOT NULL,
    scan_count INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (event_id, visitor)
);
