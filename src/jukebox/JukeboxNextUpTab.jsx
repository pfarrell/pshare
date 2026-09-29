import { useState, useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import JukeboxQueueRow from './JukeboxQueueRow';
import { formatPlaybackTime } from '../utils/formatters';
import { getPlaybackModeDisplay } from './jukeboxPlayerGlyphs';
import JukeboxSavePlaylistModal from './JukeboxSavePlaylistModal';

// A slim action header is pinned at the top (save as playlist, AI Mix,
// playback mode, and Clear with its two-step confirm), with the queue below.
// Play/pause/prev/next live in the footer strip, not here. The queue only needs the core "see what's queued, tap one to
// jump to it" behavior, which Track already does on its own (tapping a track
// already in the queue jumps straight to playing it — see Track.jsx's
// handleTrackClick).
//
// Already-played tracks are hidden by default — this opens showing just the
// current track and what's next, not the whole history. `backOffset` is how
// many played tracks are pulled back into view; each tap of "Show previous"
// increments it by one, so repeated taps scroll further back. It's a count
// behind the live position rather than a fixed index, so it keeps working
// the same way as playback naturally advances while this tab stays open.
// Since this tab unmounts whenever the drawer switches away from it (see
// JukeboxBrowsePanel.jsx), reopening it always starts back at 0.
// Save Queue as Playlist saves from the current track onward, never the
// already-played history above it — matching what this tab already shows by
// default (see the "hidden by default" note above). Someone who wants an
// earlier track included can rewind with the transport before saving.
const CLEAR_CONFIRM_MS = 3000;

const DiscIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.5" />
  </svg>
);

// Placeholder four-point sparkle; swap for the real AI logo when provided.
const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" />
  </svg>
);

const JukeboxNextUpTab = ({ onSaved, onOpenAiMix }) => {
  const playlist = usePlayerStore((s) => s.playlist);
  const currentTrackIndex = usePlayerStore((s) => s.currentTrackIndex);
  const removeTrackFromPlaylist = usePlayerStore((s) => s.removeTrackFromPlaylist);
  const playbackMode = usePlayerStore((s) => s.playbackMode);
  const queueSource = usePlayerStore((s) => s.queueSource);
  const cyclePlaybackMode = usePlayerStore((s) => s.cyclePlaybackMode);
  const clearPlaylist = usePlayerStore((s) => s.clearPlaylist);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const seek = usePlayerStore((s) => s.seek);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [backOffset, setBackOffset] = useState(0);
  // Which row (by its React key below) is currently swiped open, if any —
  // only one at a time, which is why this lives here rather than in each
  // row's own JukeboxQueueRow/useSwipeToReveal instance.
  const [openRowKey, setOpenRowKey] = useState(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  const revealFrom = Math.max(0, currentTrackIndex - backOffset);
  const visible = playlist.slice(revealFrom);
  const hasEarlierTracks = revealFrom > 0;
  const savableTrackIds = currentTrackIndex >= 0 ? playlist.slice(currentTrackIndex).map((t) => t.id) : [];

  const hasQueue = playlist.length > 0;
  const clearArmed = confirmingClear && hasQueue;
  const progressPercent = Number.isFinite(duration) && duration > 0 ? (currentTime / duration) * 100 : 0;
  const handleSeek = (e) => seek((Number(e.target.value) / 100) * duration);
  const { glyph: modeGlyph, title: modeTitle } = getPlaybackModeDisplay(playbackMode, queueSource);

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

  // Closes whatever's swiped open on any interaction outside that row —
  // tapping a different row, the transport, "Show previous", or scrolling
  // the list. A tap that lands on the open row itself is handled by
  // useSwipeToReveal directly, not here.
  useEffect(() => {
    if (openRowKey === null) return undefined;
    const close = () => setOpenRowKey(null);
    const handlePointerDown = (e) => {
      const rowEl = e.target.closest?.('.jukebox-queue-row');
      if (rowEl?.dataset.rowKey !== openRowKey) close();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('scroll', close, true);
    };
  }, [openRowKey]);

  return (
    <>
      <div className="jukebox-next-up-header">
        <div className="jukebox-next-up-seek">
          <span className="jukebox-next-up-time">{formatPlaybackTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max="100"
            value={progressPercent}
            onChange={handleSeek}
            aria-label="Seek"
          />
          <span className="jukebox-next-up-time">{formatPlaybackTime(duration)}</span>
        </div>
        <div className="jukebox-next-up-actions">
        <button
          type="button"
          aria-label="Save as playlist"
          disabled={savableTrackIds.length === 0}
          onClick={() => setSaveModalOpen(true)}
        >
          <DiscIcon />
        </button>
        <button type="button" aria-label="AI Mix" onClick={onOpenAiMix}>
          <SparkleIcon />
        </button>
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
          className={`jukebox-next-up-clear ${clearArmed ? 'armed' : ''}`}
          disabled={!hasQueue}
          onClick={handleClear}
        >
          {clearArmed ? 'Tap again to clear' : 'Clear queue'}
        </button>
        </div>
      </div>
      {saveModalOpen && (
        <JukeboxSavePlaylistModal
          trackIds={savableTrackIds}
          onClose={() => setSaveModalOpen(false)}
          onSaved={(name) => { setSaveModalOpen(false); onSaved?.(name); }}
        />
      )}
      {playlist.length === 0 ? (
        <p className="jukebox-panel-empty">Nothing queued yet — try Browse</p>
      ) : (
        <div className="jukebox-search-tracks">
          {hasEarlierTracks && (
            <button
              type="button"
              className="jukebox-next-up-show-previous"
              onClick={() => setBackOffset((offset) => offset + 1)}
            >
              ▲ Show previous
            </button>
          )}
          {visible.map((track, i) => {
            const absoluteIndex = revealFrom + i;
            const rowKey = `${track.id}-${absoluteIndex}`;
            return (
              <JukeboxQueueRow
                key={rowKey}
                rowKey={rowKey}
                track={track}
                index={i}
                trackCount={visible.length}
                isPlaying={absoluteIndex === currentTrackIndex}
                isOpen={openRowKey === rowKey}
                onOpenChange={(open) => setOpenRowKey(open ? rowKey : null)}
                onRemove={() => removeTrackFromPlaylist(absoluteIndex)}
              />
            );
          })}
        </div>
      )}
    </>
  );
};

export default JukeboxNextUpTab;
