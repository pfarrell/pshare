-- Migration: Add profiles (named sets of labels used to filter browsing/search)
-- Date: 2026-09-24
-- See docs/superpowers/specs/2026-09-24-profiles-design.md

CREATE TABLE profiles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profile_tags (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE (profile_id, tag_id)
);

ALTER TABLE users ADD COLUMN default_profile_id INTEGER NULL REFERENCES profiles(id) ON DELETE SET NULL;
-- FORWARD-ONLY: dropping default_tag is deliberate (no data migration, per the
-- spec) and there is no down-migration. Rolling back to a pre-profiles release
-- by flipping the `current` symlink is NOT sufficient on its own — that older
-- code still selects users.default_tag and will 500 on every login and
-- /auth/me once this column is gone. A rollback must also restore the database
-- from an `npm run db:snapshot` taken before this migration was applied.
ALTER TABLE users DROP COLUMN IF EXISTS default_tag;

COMMENT ON TABLE profiles IS 'Named, admin-managed sets of labels used to filter browsing/search (replaces the old single-tag filter)';
COMMENT ON COLUMN users.default_profile_id IS 'Profile seeded into the browser-local filter on login';
