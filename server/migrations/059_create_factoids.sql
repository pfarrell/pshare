-- server/migrations/059_create_factoids.sql
-- Migration: The factoid cache. kind takes three values here while
-- factoid_generations takes two: track factoids are a side effect of an album
-- generation call and never get their own ledger row.
-- source_url is NOT NULL by design: an uncited factoid is never persisted.
-- kind + target_id is polymorphic (like notes and favorites), so no foreign
-- key to artists/albums/tracks is possible. Cleanup is wired explicitly in
-- entityDeleteService, admin/artists.ts, and the three merge services.
-- Date: 2026-09-30

CREATE TABLE factoids (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('artist', 'album', 'track')),
  target_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_title TEXT,
  model TEXT NOT NULL,
  generation_id INTEGER REFERENCES factoid_generations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX factoids_target_idx ON factoids (kind, target_id);
