-- server/migrations/054_fix_enqueue_token_base64url.sql
-- Migration: Fix jukebox_devices.enqueue_token to use base64url encoding
-- Date: 2026-09-25
--
-- Standard base64 (migration 053's original DEFAULT) includes '+' and '/',
-- which break URL path matching when used unencoded in /jukebox/:token/...
-- routes (a '/' splits the path into extra segments; Hono's router then
-- 404s before ever reaching the handler, discovered via Task 4's own
-- testing — ~1 in 3 flaky failures, root-caused and reproduced against the
-- real DB). ~40% of randomly generated 24-byte base64 tokens contain at
-- least one '/'. Switches the column default to base64url (RFC 4648 §5:
-- '+'->'-', '/'->'_', no '=' padding) and re-generates every existing row's
-- token to match, since any token already issued under the old default may
-- itself be unsafe.

ALTER TABLE jukebox_devices
  ALTER COLUMN enqueue_token SET DEFAULT translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');

UPDATE jukebox_devices
  SET enqueue_token = translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
