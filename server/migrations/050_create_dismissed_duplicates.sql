-- Migration: Add dismissed_duplicates table for the duplicate-album/track review queue
-- Date: 2026-09-20
--
-- Records an admin's "not actually a duplicate" decision so the live
-- detection queries (GET /admin/duplicates/albums, /tracks) can exclude a
-- reviewed pair going forward. entity_a_id < entity_b_id is enforced so a
-- dismissal is symmetric regardless of which order detection found the
-- pair in — callers must sort the two ids before inserting or querying.

CREATE TABLE dismissed_duplicates (
  id SERIAL PRIMARY KEY,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('album', 'track')),
  entity_a_id INTEGER NOT NULL,
  entity_b_id INTEGER NOT NULL,
  dismissed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dismissed_duplicates_ordered_pair CHECK (entity_a_id < entity_b_id),
  UNIQUE (kind, entity_a_id, entity_b_id)
);
