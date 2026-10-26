-- Migration: guest Spotify adds (EXPERIMENTAL, issue #72)
-- Date: 2026-10-25
--
-- A phone submission is now either a library track (track_id) or a Spotify
-- track (spotify_track: the /search/spotify track shape, validated by
-- services/jukeboxSpotifyTrack.ts), never both. The kiosk turns spotify_track
-- straight into a queue entry, with no library lookup.
--
-- Removal path, if the Spotify integration goes: delete the Spotify rows, drop
-- the constraint and the column, and restore NOT NULL on track_id.

ALTER TABLE jukebox_queue_submissions ALTER COLUMN track_id DROP NOT NULL;
ALTER TABLE jukebox_queue_submissions ADD COLUMN spotify_track JSONB NULL;
ALTER TABLE jukebox_queue_submissions
  ADD CONSTRAINT jukebox_queue_submissions_one_track
  CHECK ((track_id IS NULL) <> (spotify_track IS NULL));
