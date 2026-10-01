-- server/migrations/058_create_factoid_generations.sql
-- Migration: One row per researched entity. Simultaneously the atomic claim
-- (so two worker ticks cannot double-bill an entity), the retry policy, and
-- the spend audit trail. See
-- docs/superpowers/specs/2026-09-30-factoid-screensaver-design.md
-- Date: 2026-09-30

CREATE TABLE factoid_generations (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('artist', 'album')),
  target_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ok', 'empty', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  factoid_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The claim. INSERT ... ON CONFLICT DO NOTHING against this index is what
-- makes concurrent double-billing structurally impossible.
CREATE UNIQUE INDEX factoid_generations_target_idx
  ON factoid_generations (kind, target_id);
CREATE INDEX factoid_generations_created_idx
  ON factoid_generations (created_at);
