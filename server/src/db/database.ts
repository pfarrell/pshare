import { Kysely, PostgresDialect, Generated, ColumnType } from 'kysely'
import pg from 'pg'

// ---- Table interfaces ----

interface ArtistTable {
  id: Generated<number>
  name: string
  image_path: string | null
  wikipedia: string | null
  musicbrainz_id: string | null
  mbid_confidence: number | null
  mbid_status: string | null
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | Date>
}

interface AlbumTable {
  id: Generated<number>
  title: string
  artist_id: number
  release_year: string | null
  disc_number: number | null
  genre_id: number | null
  image_path: string | null
  wikipedia: string | null
  musicbrainz_id: string | null
  release_group_musicbrainz_id: string | null
  mbid_confidence: number | null
  mbid_status: string | null
  is_compilation: boolean
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | Date>
}

interface TrackTable {
  id: Generated<number>
  title: string
  track_number: string | null
  release_year: string | null
  album_id: number
  artist_id: number | null
  media_file_id: number | null
  wikipedia: string | null
  duration_sec: number | null
  approved: ColumnType<boolean, boolean | undefined, boolean>
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | Date>
}

interface MediaFileTable {
  id: Generated<number>
  discriminator: string | null
  imported_date: Date | null
  last_modified: Date | null
  absolute_path: string | null
  name: string | null
  file_type: string | null
  entity_id: number | null
  entity_type: string | null
  file_missing: boolean | null
  file_hash: string | null
  chromaprint_fingerprint: string | null
  chromaprint_duration_sec: number | null
  musicbrainz_recording_id: string | null
  mbid_confidence: number | null
  mbid_status: string | null
  created_at: Date | null
  updated_at: Date | null
}

interface PlaylistTable {
  id: Generated<number>
  name: string
  user_id: number | null
  auto_generated: boolean | null
  image_path: string | null
  created_at: ColumnType<Date, string | Date | undefined, never>
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>
}

interface PlaylistTrackTable {
  id: Generated<number>
  playlist_id: number
  track_id: number
  order: number | null
}

interface LogTable {
  id: Generated<number>
  track_id: number | null
  album_id: number | null
  artist_id: number | null
  action: string | null
  created_at: ColumnType<Date, Date | string | undefined, never>
  updated_at: ColumnType<Date, Date | string | undefined, never> | null
  ip_address: string | null
  cookie: string | null
  query: string | null
}

interface FavoriteTable {
  id: Generated<number>
  user_id: number
  target_id: number
  kind: string
  created_at: ColumnType<Date, never, never>
  updated_at: ColumnType<Date, never, never>
}

interface UploadQueueTable {
  id: Generated<number>
  status: 'pending' | 'processing' | 'completed' | 'failed'
  artist_name: string | null
  artist_id: number | null
  album_name: string | null
  album_id: number | null
  is_compilation: boolean
  is_single: boolean
  genre: string | null
  track_pad: number | null
  file_path: string
  original_filename: string
  file_hash: string
  file_size: number | null
  album_art_path: string | null
  album_art_url: string | null
  track_id: number | null
  error_message: string | null
  discovery_source_id: ColumnType<number | null, number | null | undefined, number | null>
  source_url: ColumnType<string | null, string | null | undefined, string | null>
  created_at: ColumnType<Date, never, never>
  started_at: Date | null
  completed_at: Date | null
}

interface UserTable {
  id: Generated<number>
  username: string
  email: string | null
  password: string | null
  admin: boolean
  default_tag: string | null
  password_changed_at: ColumnType<Date, never, Date | string> | null
  created_at: ColumnType<Date, never, never>
  updated_at: ColumnType<Date, never, string | Date>
}

interface PasswordResetTokenTable {
  id: Generated<number>
  user_id: number
  token_hash: string
  expires_at: ColumnType<Date, Date | string, never>
  used_at: ColumnType<Date, never, Date | string> | null
  created_at: ColumnType<Date, never, never>
}

interface JukeboxDeviceTable {
  id: Generated<number>
  user_id: number
  name: string
  created_at: ColumnType<Date, string | undefined, never>
}

interface UserPlaylistTable {
  id: Generated<number>
  user_id: number
  playlist_id: number
  role: string
  created_at: ColumnType<Date, string | Date | undefined, never>
}

interface ArtistAlbumTable {
  id: Generated<number>
  artist_id: number
  album_id: number
  role: 'primary' | 'compilation' | 'featured' | 'guest' | 'collaborator' | 'composer' | 'performer'
  order: number
  created_at: ColumnType<Date, string | Date | undefined, never>
}

interface TrackArtistTable {
  id: Generated<number>
  track_id: number
  artist_id: number
  role: 'featured' | 'guest' | 'collaborator'
  order: number
  created_at: ColumnType<Date, string | Date | undefined, never>
}

interface ArtistRelationTable {
  id: Generated<number>
  artist_id: number
  related_artist_id: number
  kind: string
  source: string        // 'manual' | 'lastfm' | 'listenbrainz' | 'musicbrainz'
  similarity: number | null
  is_hidden: boolean
  force_show: boolean
  created_at: ColumnType<Date, string | Date | undefined, never>
}

interface ExternalLookupTable {
  id: Generated<number>
  entity_type: string
  entity_id: number
  service: string
  checked_at: ColumnType<Date, string | Date | undefined, string | Date>
  result: string | null
}

interface ImageTable {
  id: Generated<number>
  album_id: number | null
  artist_id: number | null
  is_primary: boolean
  source: string
  status: string
  width: number | null
  height: number | null
  created_at: ColumnType<Date, string | Date | undefined, never>
}

interface CollectionTable {
  id: Generated<number>
  name: string
  user_id: number | null
  image_path: string | null
  wikipedia: string | null
  created_at: ColumnType<Date, string | Date | undefined, never>
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>
}

interface CollectionAlbumTable {
  id: Generated<number>
  collection_id: number
  album_id: number
  order: number | null
}

interface AlbumStubTable {
  id: Generated<number>
  title: string
  artist_name: string | null
  user_id: number | null
  collection_id: number | null
  order: number | null
  created_at: ColumnType<Date, string | Date | undefined, never>
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>
}

interface TagTable {
  id: Generated<number>
  name: string
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | Date>
}

interface DiscoverySourceTable {
  id: Generated<number>
  name: string
  kind: string
  url_pattern: string | null
  enabled: boolean
  created_at: ColumnType<Date, string | Date | undefined, never>
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>
}

interface AlbumTagTable {
  id: Generated<number>
  album_id: number
  tag_id: number
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | Date>
}

interface ArtistTagTable {
  id: Generated<number>
  artist_id: number
  tag_id: number
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | Date>
}

interface TrackTagTable {
  id: Generated<number>
  track_id: number
  tag_id: number
  created_at: ColumnType<Date, string | undefined, never>
  updated_at: ColumnType<Date, string | undefined, string | Date>
}

interface UserRecallTokenTable {
  user_id: number
  recall_token: string
  connected_at: ColumnType<Date, string | Date | undefined, never>
}

interface OAuthIdentityTable {
  id: Generated<number>
  provider: string
  provider_user_id: string
  user_id: number
  email: string
  created_at: ColumnType<Date, string | Date | undefined, never>
}

interface NoteTable {
  id: Generated<number>
  target_id: number
  kind: string
  recall_item_id: string
  author_user_id: number
  created_at: ColumnType<Date, string | Date | undefined, never>
}

interface DismissedDuplicateTable {
  id: Generated<number>
  kind: 'album' | 'track'
  entity_a_id: number
  entity_b_id: number
  dismissed_by: number | null
  dismissed_at: ColumnType<Date, string | Date | undefined, never>
}

interface ErrorLogTable {
  id: Generated<number>
  source: string
  message: string
  context: string | null
  created_at: ColumnType<Date, never, never>
}

interface SignupLogTable {
  id: Generated<number>
  username: string
  email: string | null
  method: string
  created_at: ColumnType<Date, never, never>
  seen_at: ColumnType<Date, string | Date | null, string | Date | null> | null
}

export interface Database {
  artists: ArtistTable
  albums: AlbumTable
  tracks: TrackTable
  media_files: MediaFileTable
  playlists: PlaylistTable
  playlist_tracks: PlaylistTrackTable
  logs: LogTable
  favorites: FavoriteTable
  upload_queue: UploadQueueTable
  users: UserTable
  password_reset_tokens: PasswordResetTokenTable
  jukebox_devices: JukeboxDeviceTable
  user_playlists: UserPlaylistTable
  artist_albums: ArtistAlbumTable
  track_artists: TrackArtistTable
  artist_relations: ArtistRelationTable
  external_lookups: ExternalLookupTable
  images: ImageTable
  collections: CollectionTable
  collection_albums: CollectionAlbumTable
  album_stubs: AlbumStubTable
  tags: TagTable
  albums_tags: AlbumTagTable
  artists_tags: ArtistTagTable
  tags_tracks: TrackTagTable
  discovery_sources: DiscoverySourceTable
  user_recall_tokens: UserRecallTokenTable
  notes: NoteTable
  dismissed_duplicates: DismissedDuplicateTable
  oauth_identities: OAuthIdentityTable
  error_log: ErrorLogTable
  signup_log: SignupLogTable
}

// ---- DB instance ----

export const pool = new pg.Pool({
  connectionString: process.env.BEMUSED_DB,
  max: 10,
})

// Prevent unhandled 'error' events from crashing the process when Postgres
// terminates an idle pooled connection (e.g. server restart, pg_terminate_backend).
// The pool will establish a new connection on the next query.
pool.on('error', (err) => {
  console.warn('⚠️  Idle database connection terminated:', err.message)
})

const dialect = new PostgresDialect({ pool })

export const db = new Kysely<Database>({ dialect })
