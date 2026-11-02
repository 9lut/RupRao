-- Duplicate detection: exact (SHA-256 of the uploaded file) and near (256-bit dHash from the browser).
ALTER TABLE photos ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS phash VARCHAR(64);
CREATE INDEX IF NOT EXISTS photos_event_content_hash ON photos (event_id, content_hash);
