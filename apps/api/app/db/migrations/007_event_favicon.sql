-- Optional per-event browser-tab icon (falls back to the event logo, then RupRao's).
ALTER TABLE events ADD COLUMN IF NOT EXISTS favicon_key TEXT;
