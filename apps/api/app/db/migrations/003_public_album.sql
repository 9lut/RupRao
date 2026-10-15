-- Organizer can choose to let attendees browse the whole album (off by default for privacy).
ALTER TABLE events ADD COLUMN IF NOT EXISTS public_album BOOLEAN NOT NULL DEFAULT FALSE;
