-- server/migrations/049_add_tracks_media_file_id_index.sql
-- Migration: Add index on tracks.media_file_id
-- Date: 2026-09-19
--
-- tracks.media_file_id has had a real FK to media_files since migration 040,
-- but was never indexed. This branch adds new query patterns against this
-- column: the recording-MBID consolidation pass in
-- consolidate-duplicate-media-files.ts (UPDATE/DELETE keyed on it, more
-- frequently than the old hash-only pass ever produced) and GET /track/:id's
-- other_albums lookup (a sibling-tracks-by-media_file_id query that now runs
-- on every fetchTracksForIds call across the app — track detail, playlists,
-- favorites, recent/random/top/surprise). Without an index both become
-- sequential scans over tracks as the library grows.

CREATE INDEX IF NOT EXISTS idx_tracks_media_file_id ON tracks(media_file_id) WHERE media_file_id IS NOT NULL;
