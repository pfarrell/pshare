import Track from '../components/Track';
import { useSwipeToReveal } from './useSwipeToReveal';

// Wraps a plain Track row with swipe-left-to-reveal-delete for the jukebox
// Next Up queue (see JukeboxNextUpTab.jsx, which owns which row — if any —
// is currently open, since only one may be at a time). Track.jsx itself is
// untouched; the delete affordance and gesture live entirely in this wrapper.
//
// The currently-playing row never reveals a delete button at all — removing
// it is a no-op in playerStore.removeTrackFromPlaylist anyway, and the
// desktop PlaylistDrawer hides its own (always-visible) delete button for
// the same row for the same reason.
const JukeboxQueueRow = ({ rowKey, track, index, trackCount, isPlaying, isOpen, onOpenChange, onRemove }) => {
  const { attachRef, offset, isDragging } = useSwipeToReveal({ isOpen, onOpenChange, disabled: isPlaying });

  return (
    <div className="jukebox-queue-row" data-row-key={rowKey}>
      {!isPlaying && (
        <button
          type="button"
          className="jukebox-queue-row-delete"
          aria-label={`Remove ${track.title} from queue`}
          onClick={onRemove}
        >
          ✕
        </button>
      )}
      <div
        className="jukebox-queue-row-content"
        ref={attachRef}
        style={{ transform: `translateX(${offset}px)`, transition: isDragging ? 'none' : 'transform 0.2s ease' }}
      >
        <Track track={track} index={index} trackCount={trackCount} isPlaying={isPlaying} />
      </div>
    </div>
  );
};

export default JukeboxQueueRow;
