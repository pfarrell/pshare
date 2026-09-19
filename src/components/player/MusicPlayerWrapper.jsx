import { useRef, useEffect, useState } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { useAuthStore } from '../../stores/authStore';
import { usePlayerEngine } from '../../hooks/usePlayerEngine';
import PlaylistDrawer from './PlaylistDrawer';
import { useContextMenu } from '../../hooks/useContextMenu';
import { formatPlaybackTime } from '../../utils/formatters';
import ContextMenu from '../ContextMenu';
import SavePlaylistModal from './SavePlaylistModal';

const HAMBURGER = '☰';
const PREV = '⏪';
const NEXT = '⏩';
const SHUFFLE = '\u{1F500}';
// Distinct from SHUFFLE on purpose — the title tooltip that's the only other differentiator
// never shows on iOS Safari touch (no hover), so shuffle-scope needs its own glyph or it's
// visually indistinguishable from plain shuffle on mobile. Shared across every scope type
// (collection, artist, ...) — only the title text below names which one.
const SHUFFLE_SCOPE = '\u{1F3B2}';
const REPEAT_ALL = '\u{1F501}';
const REPEAT_ONE = '\u{1F502}';
const PLAY = '⏵';
const PAUSE = '⏸';

const PLAYBACK_MODE_DISPLAY = {
  off: { glyph: SHUFFLE, title: 'Shuffle: Off' },
  shuffle: { glyph: SHUFFLE, title: 'Shuffle' },
  'repeat-all': { glyph: REPEAT_ALL, title: 'Repeat All' },
  'repeat-one': { glyph: REPEAT_ONE, title: 'Repeat One' },
};

const SCOPE_TYPE_LABEL = {
  collection: 'Collection',
  artist: 'Artist',
};

const MusicPlayerWrapper = ({ className = '' }) => {
  const audioRefA = useRef(null);
  const audioRefB = useRef(null);
  usePlayerEngine(audioRefA, audioRefB);

  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const playbackMode = usePlayerStore((s) => s.playbackMode);
  const queueSource = usePlayerStore((s) => s.queueSource);
  const drawerOpen = usePlayerStore((s) => s.drawerOpen);
  const playlist = usePlayerStore((s) => s.playlist);
  const activityPulseToken = usePlayerStore((s) => s.activityPulseToken);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const cyclePlaybackMode = usePlayerStore((s) => s.cyclePlaybackMode);
  const toggleDrawer = usePlayerStore((s) => s.toggleDrawer);
  const closeDrawer = usePlayerStore((s) => s.closeDrawer);
  const seek = usePlayerStore((s) => s.seek);
  const clearPlaylist = usePlayerStore((s) => s.clearPlaylist);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [pulsing, setPulsing] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  // Clear Playlist doesn't touch the server, so unlike Save it's offered
  // regardless of auth state — only an empty queue hides the whole menu.
  const saveQueueCtx = useContextMenu({ shouldIgnore: () => playlist.length === 0 });

  const handleSaveQueue = (e) => {
    if (e) e.stopPropagation();
    saveQueueCtx.close();
    setSaveModalOpen(true);
  };

  const handleClearPlaylist = (e) => {
    if (e) e.stopPropagation();
    saveQueueCtx.close();
    if (playlist.length === 0 || window.confirm('Clear the playlist? This will stop playback.')) {
      clearPlaylist();
    }
    closeDrawer();
  };

  useEffect(() => {
    if (activityPulseToken === 0) return undefined;
    setPulsing(false);
    const frame = requestAnimationFrame(() => setPulsing(true));
    const stop = setTimeout(() => setPulsing(false), 1200);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(stop);
    };
  }, [activityPulseToken]);

  const handleSeek = (e) => {
    const percent = Number(e.target.value) / 100;
    seek(percent * duration);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const { glyph: shuffleGlyph, title: shuffleTitle } = playbackMode === 'shuffle-scope'
    ? { glyph: SHUFFLE_SCOPE, title: `Shuffle ${SCOPE_TYPE_LABEL[queueSource?.type] || 'Scope'}` }
    : PLAYBACK_MODE_DISPLAY[playbackMode];

  return (
    <div className={`music-player-wrapper ${className}`}>
      <audio ref={audioRefA} style={{ display: 'none' }} preload="metadata" />
      <audio ref={audioRefB} style={{ display: 'none' }} preload="metadata" />

      <div className="player-controls-container">
        <div className="player-controls-wrapper">
          <button
            className={`player-btn hamburger-btn ${drawerOpen ? 'active' : ''} ${pulsing ? 'activity-pulse' : ''}`}
            title="Toggle Playlist"
            onClick={toggleDrawer}
            onContextMenu={saveQueueCtx.triggerProps.onContextMenu}
            onTouchStart={saveQueueCtx.triggerProps.onTouchStart}
            onTouchMove={saveQueueCtx.triggerProps.onTouchMove}
            onTouchEnd={saveQueueCtx.triggerProps.onTouchEnd}
          >
            {HAMBURGER}
          </button>

          <span className="time-display elapsed">{formatPlaybackTime(currentTime)}</span>

          <div className={`progress-bar-wrapper ${isBuffering ? 'loading' : ''}`}>
            <input
              type="range"
              min="0"
              max="100"
              value={progressPercent}
              className="progress-bar"
              onChange={handleSeek}
            />
            <div className="progress-bar-loading-overlay" />
          </div>

          <span className="time-display total">{formatPlaybackTime(duration)}</span>

          <button className="player-btn prev-btn" title="Previous" onClick={playPrev}>{PREV}</button>
          <button className="player-btn play-btn" title="Play/Pause" onClick={togglePlayPause}>
            {isPlaying ? PAUSE : PLAY}
          </button>
          <button className="player-btn next-btn" title="Next" onClick={() => playNext({ manual: true })}>{NEXT}</button>
          <button
            className={`player-btn shuffle-btn ${playbackMode !== 'off' ? 'active' : ''}`}
            title={shuffleTitle}
            onClick={cyclePlaybackMode}
          >
            {shuffleGlyph}
          </button>
        </div>
      </div>

      <PlaylistDrawer onSaveQueue={handleSaveQueue} />

      <ContextMenu
        open={saveQueueCtx.open}
        position={saveQueueCtx.position}
        openedViaTouch={saveQueueCtx.openedViaTouch}
        onDismiss={saveQueueCtx.dismiss}
        onSwallowTouch={saveQueueCtx.swallowTouch}
        actions={[
          isAuthenticated && { key: 'save', icon: '💾', label: 'Save as Playlist', onClick: handleSaveQueue },
          { key: 'clear', icon: '🗑', label: 'Clear Playlist', onClick: handleClearPlaylist },
        ]}
        testId="save-queue-menu-backdrop"
      />

      {saveModalOpen && (
        <SavePlaylistModal
          trackIds={playlist.map((t) => t.id)}
          onClose={() => setSaveModalOpen(false)}
        />
      )}
    </div>
  );
};

export default MusicPlayerWrapper;
