-- Per-event look for the attendee page (a preset key; the web app owns the actual colors).
ALTER TABLE events ADD COLUMN IF NOT EXISTS theme VARCHAR(32) NOT NULL DEFAULT 'default';
