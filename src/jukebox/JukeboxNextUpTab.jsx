import { useState } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import Track from '../components/Track';
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
  const [backOffset, setBackOffset] = useState(0);

  const revealFrom = Math.max(0, currentTrackIndex - backOffset);
  const visible = playlist.slice(revealFrom);
  const hasEarlierTracks = revealFrom > 0;

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
          {visible.map((track, i) => (
            <Track
              key={`${track.id}-${revealFrom + i}`}
              track={track}
              index={i}
              trackCount={visible.length}
              isPlaying={revealFrom + i === currentTrackIndex}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default JukeboxNextUpTab;
