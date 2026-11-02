-- Fine-grained theme overrides (colors, banner options) and an optional uploaded banner image.
ALTER TABLE events ADD COLUMN IF NOT EXISTS theme_custom JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_key TEXT;
