import { useState, useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import JukeboxQueueRow from './JukeboxQueueRow';
import JukeboxTransport from './JukeboxTransport';

// The transport controls are pinned at the top (see JukeboxTransport), with
// the queue below. The queue only needs the core "see what's queued, tap one to
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
const JukeboxNextUpTab = () => {
  const playlist = usePlayerStore((s) => s.playlist);
  const currentTrackIndex = usePlayerStore((s) => s.currentTrackIndex);
  const removeTrackFromPlaylist = usePlayerStore((s) => s.removeTrackFromPlaylist);
  const [backOffset, setBackOffset] = useState(0);
  // Which row (by its React key below) is currently swiped open, if any —
  // only one at a time, which is why this lives here rather than in each
  // row's own JukeboxQueueRow/useSwipeToReveal instance.
  const [openRowKey, setOpenRowKey] = useState(null);

  const revealFrom = Math.max(0, currentTrackIndex - backOffset);
  const visible = playlist.slice(revealFrom);
  const hasEarlierTracks = revealFrom > 0;

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
      <JukeboxTransport />
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
