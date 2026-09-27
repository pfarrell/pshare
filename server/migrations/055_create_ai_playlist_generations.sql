-- server/migrations/055_create_ai_playlist_generations.sql
-- Migration: Create ai_playlist_generations table — a per-request log used
-- only to rate-limit the AI playlist generator (POST /playlists/generate),
-- since each generation makes a real, billed Anthropic API call. See
-- docs/superpowers/specs/2026-09-27-ai-playlist-generator-design.md
-- Date: 2026-09-27

CREATE TABLE ai_playlist_generations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  jukebox_device_id INTEGER REFERENCES jukebox_devices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_playlist_generations_device_created_idx
  ON ai_playlist_generations (jukebox_device_id, created_at);

CREATE INDEX ai_playlist_generations_user_created_idx
  ON ai_playlist_generations (user_id, created_at);
