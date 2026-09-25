import { usePlayerStore } from '../stores/playerStore';
import Track from '../components/Track';
import JukeboxTransport from './JukeboxTransport';

// The transport controls are pinned at the top (see JukeboxTransport), with
// the queue below. The queue only needs the core "see what's queued, tap one to
// jump to it" behavior, which Track already does on its own (tapping a track
// already in the queue jumps straight to playing it — see Track.jsx's
// handleTrackClick).
const JukeboxNextUpTab = () => {
  const playlist = usePlayerStore((s) => s.playlist);
  const currentTrackIndex = usePlayerStore((s) => s.currentTrackIndex);

  return (
    <>
      <JukeboxTransport />
      {playlist.length === 0 ? (
        <p className="jukebox-panel-empty">Nothing queued yet — try Browse</p>
      ) : (
        <div className="jukebox-search-tracks">
          {playlist.map((track, index) => (
            <Track
              key={`${track.id}-${index}`}
              track={track}
              index={index}
              trackCount={playlist.length}
              isPlaying={index === currentTrackIndex}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default JukeboxNextUpTab;
