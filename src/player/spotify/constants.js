// Spotify playback timing (experimental, #72).

// How often SDK state is polled while a Spotify track is the active source.
export const SPOTIFY_POLL_MS = 250;
// Advance to the next track this early before a Spotify track ends, rather than waiting for
// the SDK to report the end, so the next source's start overlaps the tail.
export const SPOTIFY_END_LEAD_MS = 200;
// Start a Spotify track this long before the outgoing local track ends, overlapping its start
// latency with the local tail (the local element keeps playing until start() resolves).
export const LOCAL_TO_SPOTIFY_LEAD_SECONDS = 0.3;
// Same window usePlayerEngine uses to prefetch the next local track into the standby element.
export const PREFETCH_THRESHOLD_SECONDS = 15;
