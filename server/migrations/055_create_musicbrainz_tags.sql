-- server/migrations/055_create_musicbrainz_tags.sql
-- MusicBrainz-sourced tags for artists and albums, kept fully separate from
-- the existing curated tags/albums_tags/artists_tags system (which drives
-- the home-feed tag filter and TagPage browsing). MusicBrainz folksonomy
-- tags are crowd-sourced and often noisy; merging them into the curated
-- system would flood real navigation UI. See
-- docs/superpowers/specs/2026-09-27-musicbrainz-tag-backfill-design.md.
--
-- source_mbid records which MusicBrainz ID a row was captured from (a
-- release id for albums, an artist id for artists) — when an entity's
-- musicbrainz_id changes, rows whose source_mbid no longer matches are
-- stale and get deleted by the capture logic, not left to accumulate.

CREATE TABLE mb_tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE artist_mb_tags (
  id SERIAL PRIMARY KEY,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  source_mbid VARCHAR(36) NOT NULL,
  tag_id INTEGER NOT NULL REFERENCES mb_tags(id),
  tag_count INTEGER NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (artist_id, tag_id)
);

CREATE TABLE album_mb_tags (
  id SERIAL PRIMARY KEY,
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  source_mbid VARCHAR(36) NOT NULL,
  tag_id INTEGER NOT NULL REFERENCES mb_tags(id),
  tag_count INTEGER NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (album_id, tag_id)
);

CREATE INDEX idx_artist_mb_tags_source_mbid ON artist_mb_tags(source_mbid);
CREATE INDEX idx_album_mb_tags_source_mbid ON album_mb_tags(source_mbid);
