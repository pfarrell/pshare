import { useState, useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { formatPlaybackTime } from '../utils/formatters';
import { GLYPHS, getPlaybackModeDisplay } from './jukeboxPlayerGlyphs';

const CLEAR_CONFIRM_MS = 3000;

// The transport controls, moved out of the footer into the top of the Next Up
// tab. Everything goes through playerStore actions — the same ones
// MusicPlayerWrapper's own (now hidden) controls call — so playback behaves
// identically. Clear queue uses an inline two-step confirm instead of
// window.confirm, which is an unstyled native dialog on the kiosk.
const JukeboxTransport = () => {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const playbackMode = usePlayerStore((s) => s.playbackMode);
  const queueSource = usePlayerStore((s) => s.queueSource);
  const playlist = usePlayerStore((s) => s.playlist);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const cyclePlaybackMode = usePlayerStore((s) => s.cyclePlaybackMode);
  const seek = usePlayerStore((s) => s.seek);
  const clearPlaylist = usePlayerStore((s) => s.clearPlaylist);

  const [confirmingClear, setConfirmingClear] = useState(false);
  const hasQueue = playlist.length > 0;
  const clearArmed = confirmingClear && hasQueue;

  useEffect(() => {
    if (!confirmingClear) return undefined;
    const timer = setTimeout(() => setConfirmingClear(false), CLEAR_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmingClear]);

  const handleClear = () => {
    if (!clearArmed) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    clearPlaylist();
  };

  const progressPercent = Number.isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0;
  const handleSeek = (e) => seek((Number(e.target.value) / 100) * duration);
  const { glyph: modeGlyph, title: modeTitle } = getPlaybackModeDisplay(playbackMode, queueSource);

  return (
    <div className="jukebox-transport">
      <div className="jukebox-transport-seek">
        <span className="jukebox-transport-time">{formatPlaybackTime(currentTime)}</span>
        <input
          type="range"
          min="0"
          max="100"
          value={progressPercent}
          onChange={handleSeek}
          aria-label="Seek"
        />
        <span className="jukebox-transport-time">{formatPlaybackTime(duration)}</span>
      </div>
      <div className="jukebox-transport-buttons">
        <button type="button" aria-label="Previous" onClick={playPrev}>{GLYPHS.PREV}</button>
        <button type="button" className="jukebox-transport-play" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={togglePlayPause}>
          {isPlaying ? GLYPHS.PAUSE : GLYPHS.PLAY}
        </button>
        <button type="button" aria-label="Next" onClick={() => playNext({ manual: true })}>{GLYPHS.NEXT}</button>
        <button
          type="button"
          className={playbackMode !== 'off' ? 'active' : ''}
          aria-label={modeTitle}
          onClick={cyclePlaybackMode}
        >
          {modeGlyph}
        </button>
        <button
          type="button"
          className={`jukebox-transport-clear ${clearArmed ? 'armed' : ''}`}
          disabled={!hasQueue}
          onClick={handleClear}
        >
          {clearArmed ? 'Tap again to clear' : 'Clear queue'}
        </button>
      </div>
    </div>
  );
};

export default JukeboxTransport;
