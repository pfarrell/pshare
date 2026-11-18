// Recovering a local track whose stream broke mid-play.
//
// The music share is an NFS mount on a NAS that spins its disks down when idle; waking it
// can take 30s+. Requests that stall that long sometimes die, and browsers (Firefox, Safari,
// Chromium on the jukebox) often report a cut-off stream as a normal 'ended' at the point
// the data ran out, or as an 'error'. Taken at face value, that skips the rest of the
// track. Instead the player reloads the same track and resumes where it stopped, a few
// times, before giving up.

// An 'ended' this close to the track's known length is a real end (DB durations are rounded).
export const END_TOLERANCE_SECONDS = 5;
// Failures in a row (without this much progress in between) before giving up on a track.
export const MAX_STREAM_RETRIES = 3;
const PROGRESS_SECONDS = 10;
const RETRY_DELAYS_MS = [1000, 3000, 8000];

export const isPrematureEnd = (position, expectedDuration) =>
  Number.isFinite(expectedDuration) && expectedDuration > 0
  && Number.isFinite(position) && position < expectedDuration - END_TOLERANCE_SECONDS;

// `prev` is the last recovery record (or null). A failure on another track, or after real
// progress since the last one, starts a fresh budget, so a long track that breaks several
// times far apart keeps getting resumed; failing over and over at one spot gives up.
export const nextRecovery = (prev, { url, position }) => {
  const sameSpot = !!prev && prev.url === url && position <= prev.position + PROGRESS_SECONDS;
  const attempts = sameSpot ? prev.attempts + 1 : 1;
  return { url, position, attempts, giveUp: attempts > MAX_STREAM_RETRIES };
};

export const retryDelayMs = (attempts) =>
  RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length) - 1];
