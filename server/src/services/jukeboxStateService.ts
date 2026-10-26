// In-memory snapshot of what each kiosk has queued, published by the kiosk and
// read by phones. Latest write wins; nothing is persisted (a server restart
// drops it and the kiosk republishes when its event stream reconnects).
// A Spotify row (#72) has no library id: id is null and uri names the track.
export type QueueEntry = { index: number; id: number | null; uri?: string; title: string; artist: string | null }
export const SPOTIFY_TRACK_URI = /^spotify:track:[A-Za-z0-9]{1,64}$/
// Mirrors playerStore.playbackMode. The phone needs it because 'shuffle' does not
// play in queue order (and repeat-one replays the current track).
export const PLAYBACK_MODES = ['off', 'shuffle', 'shuffle-scope', 'repeat-all', 'repeat-one'] as const
export type PlaybackMode = (typeof PLAYBACK_MODES)[number]
// spotify: whether the kiosk can play Spotify right now, so phones offer Spotify adds only then.
export type KioskState = { queue: QueueEntry[]; currentIndex: number; isPlaying: boolean; playbackMode: PlaybackMode; spotify: boolean }

export const MAX_QUEUE_ENTRIES = 300
export const MAX_TEXT_LENGTH = 200

const isNonNegInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0

function parseEntry(raw: any): QueueEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const { index, id, uri, title, artist } = raw
  const spotifyRow = id === null && typeof uri === 'string' && SPOTIFY_TRACK_URI.test(uri)
  if (!isNonNegInt(index) || !(Number.isInteger(id) || spotifyRow) || typeof title !== 'string') return null
  if (artist !== null && typeof artist !== 'string') return null
  return {
    index,
    id,
    ...(spotifyRow ? { uri } : {}),
    title: title.slice(0, MAX_TEXT_LENGTH),
    artist: artist === null ? null : artist.slice(0, MAX_TEXT_LENGTH),
  }
}

// Validates and trims a kiosk-published snapshot; null means "reject, keep the
// previous one". Only the whitelisted fields per track survive.
export function parseKioskState(body: unknown): KioskState | null {
  if (!body || typeof body !== 'object') return null
  const { queue, currentIndex, isPlaying } = body as any
  // Optional so a kiosk page that has not reloaded yet still works: 'off'.
  const rawMode = (body as any).playbackMode
  const playbackMode = rawMode === undefined ? 'off' : rawMode
  if (!PLAYBACK_MODES.includes(playbackMode)) return null
  if (!Array.isArray(queue) || queue.length > MAX_QUEUE_ENTRIES) return null
  if (!Number.isInteger(currentIndex) || currentIndex < -1) return null
  if (typeof isPlaying !== 'boolean') return null
  // Optional like playbackMode, for a kiosk page from before #72's guest adds.
  const rawSpotify = (body as any).spotify
  if (rawSpotify !== undefined && typeof rawSpotify !== 'boolean') return null

  const entries: QueueEntry[] = []
  for (const raw of queue) {
    const entry = parseEntry(raw)
    if (!entry) return null
    entries.push(entry)
  }
  return { queue: entries, currentIndex, isPlaying, playbackMode, spotify: rawSpotify === true }
}

const snapshots = new Map<number, KioskState>()

export const jukeboxStateService = {
  set(deviceId: number, state: KioskState): void {
    snapshots.set(deviceId, state)
  },
  get(deviceId: number): KioskState | undefined {
    return snapshots.get(deviceId)
  },
}
