-- Migration: Spotify OAuth connections (EXPERIMENTAL, issue #72)
-- Date: 2026-10-24
--
-- Stores one encrypted Spotify OAuth token set per P·Share user OR per
-- jukebox device (exactly one owner). Tokens are encrypted at the application
-- layer (AES-256-GCM via the recall token helpers).
--
-- The Spotify playback integration is an experiment: if it is removed,
-- dropping this table is the removal path.

CREATE TABLE spotify_connections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE,
  jukebox_device_id INTEGER NULL REFERENCES jukebox_devices(id) ON DELETE CASCADE,
  spotify_user_id TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT spotify_connections_one_owner CHECK ((user_id IS NULL) <> (jukebox_device_id IS NULL))
);

CREATE UNIQUE INDEX uniq_spotify_connections_user ON spotify_connections (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_spotify_connections_device ON spotify_connections (jukebox_device_id) WHERE jukebox_device_id IS NOT NULL;
