-- server/migrations/057_add_playlist_id_to_logs.sql
-- Which playlist (if any) a logged play came from, so the jukebox can show
-- recently played playlists (see docs/superpowers/specs/2026-09-29-jukebox-recent-playlists-design.md).
-- No FK, same as the other logs columns. Existing rows stay NULL: history is
-- not backfilled.
ALTER TABLE logs ADD COLUMN playlist_id integer;

CREATE INDEX logs_playlist_id_created_at_idx
  ON logs (playlist_id, created_at DESC)
  WHERE playlist_id IS NOT NULL;
