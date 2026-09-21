-- Migration: Add jukebox_devices for Jukebox Mode's long-lived device logins
-- Date: 2026-09-20
--
-- Each physical jukebox kiosk gets its own row, created at login time (see
-- POST /auth/jukebox-login). The issued JWT carries this row's id as a
-- `deviceId` claim; authMiddleware checks the row still exists on every
-- request, so deleting it here is how a device gets revoked (no admin UI
-- for that yet — this table existing is what makes that a clean follow-up).

CREATE TABLE jukebox_devices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
