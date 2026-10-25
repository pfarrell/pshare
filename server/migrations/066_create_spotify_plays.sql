-- Migration: Spotify plays (EXPERIMENTAL, issue #72)
-- Date: 2026-10-25
--
-- One row per Spotify track play, logged at the same 5-second mark as local
-- plays (GET /log/:id). Kept out of `logs` on purpose: logs rows point at
-- library tracks, and these have none. Powers Jukebox Mode's Recent drawer
-- (recently played Spotify albums). Top/newborns/admin stats stay local-only.
--
-- The Spotify playback integration is an experiment: if it is removed,
-- dropping this table is the removal path.

CREATE TABLE spotify_plays (
  id SERIAL PRIMARY KEY,
  track_uri TEXT NOT NULL,
  track_name TEXT NOT NULL DEFAULT '',
  artist_name TEXT NOT NULL DEFAULT '',
  album_spotify_id TEXT NULL,
  album_name TEXT NOT NULL DEFAULT '',
  album_image_url TEXT NULL,
  user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(510) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX spotify_plays_album_created_at_idx
  ON spotify_plays (album_spotify_id, created_at DESC)
  WHERE album_spotify_id IS NOT NULL;
