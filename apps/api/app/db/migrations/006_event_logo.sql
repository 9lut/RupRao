-- Optional per-event logo shown on the attendee page instead of the RupRao mark.
ALTER TABLE events ADD COLUMN IF NOT EXISTS logo_key TEXT;
