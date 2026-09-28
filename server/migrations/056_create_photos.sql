-- server/migrations/056_create_photos.sql
-- Personal photos for the jukebox kiosk's "photo frame" screensaver mode
-- (see docs/superpowers/specs/2026-09-28-jukebox-photo-frame-design.md).
-- Reuses media_files for the actual file record (entity_type = 'photo'),
-- the same pattern the images table already uses for album/artist uploads
-- — see entityImagesService.ts. No FK from media_files.entity_id (it's
-- polymorphic across tracks/images/photos, same as everywhere else this
-- table is used). No filename/is_primary/source/status columns here —
-- unlike images, there's no primary/source/status concept for a flat pool
-- of personal photos, and the filename lives on the media_files row like
-- every other entity type.

CREATE TABLE photos (
  id SERIAL PRIMARY KEY,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
