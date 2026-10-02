-- server/migrations/060_add_tracks_artist_id_index.sql
-- tracks.artist_id had no index, so every lookup by track artist (the artist
-- page's "appears on" track-credit query, search's artist track counts, the
-- search tag filter) seq-scanned all of tracks (~143k rows, 15-35ms each).
-- Partial on approved: every one of those queries filters approved = true.
-- Plain CREATE INDEX (a migration may run inside a transaction, where
-- CONCURRENTLY isn't allowed); on ~143k rows it takes well under a second.
CREATE INDEX IF NOT EXISTS idx_tracks_artist_id_approved
  ON tracks (artist_id)
  WHERE approved = true;
