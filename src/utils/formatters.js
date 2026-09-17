/**
 * Format duration from seconds to MM:SS format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "1:01", "0:59")
 */
export const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '';

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * Format a count with a pluralized unit label.
 * @param {number|null|undefined} count
 * @param {string} singular - e.g. "track"
 * @param {string} [plural] - defaults to `${singular}s`
 * @returns {string|null} e.g. "1 track", "5 tracks", or null if count is null/undefined
 */
export const formatCount = (count, singular, plural = `${singular}s`) => {
  if (count === null || count === undefined) return null;
  return `${count} ${count === 1 ? singular : plural}`;
};

/**
 * Normalize an album's release_year for display.
 * @param {string|null|undefined} release_year
 * @returns {string|null} the year, or null if unset/blank/the "0" sentinel
 */
export const getAlbumYear = (release_year) => {
  if (!release_year || release_year === '0') return null;
  return release_year;
};

/**
 * Format a live playback position/length (audio element currentTime/duration).
 * Unlike formatDuration, never returns '' — the player always shows a time.
 * @param {number|undefined} seconds - may be fractional, NaN, or Infinity
 * @returns {string} e.g. "0:00", "1:05"
 */
export const formatPlaybackTime = (seconds) => {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

