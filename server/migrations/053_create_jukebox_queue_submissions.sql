-- server/migrations/053_create_jukebox_queue_submissions.sql
-- Migration: Add enqueue_token to jukebox_devices and jukebox_queue_submissions
-- Date: 2026-09-25
--
-- Supports phone-enqueue via QR code (see
-- docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md).
-- enqueue_token is a public, unguessable value distinct from the device's
-- own JWT — it authorizes only search + submitting a track, nothing else.
-- jukebox_queue_submissions holds ONLY phone-submitted tracks; the kiosk's
-- own tap-to-enqueue never writes here (see the spec's "Approach considered
-- and rejected"). delivered_at is set the instant the kiosk adds a
-- submission to its local queue — it has nothing to do with playback
-- progress.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE jukebox_devices
  ADD COLUMN enqueue_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'base64');

UPDATE jukebox_devices SET enqueue_token = encode(gen_random_bytes(24), 'base64') WHERE enqueue_token IS NULL;

ALTER TABLE jukebox_devices ALTER COLUMN enqueue_token SET NOT NULL;

CREATE TABLE jukebox_queue_submissions (
  id SERIAL PRIMARY KEY,
  jukebox_device_id INTEGER NOT NULL REFERENCES jukebox_devices(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  submitted_by_name TEXT,
  submitted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX jukebox_queue_submissions_pending_idx
  ON jukebox_queue_submissions (jukebox_device_id, delivered_at, submitted_at);
