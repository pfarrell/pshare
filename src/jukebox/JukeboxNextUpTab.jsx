import { usePlayerStore } from '../stores/playerStore';
import Track from '../components/Track';

// Replaces the reused queue drawer (PlaylistDrawer) as a tab in the same
// browse panel, rather than its own separate floating overlay triggered
// from the footer — that drawer's drag-reorder/delete/save-as-playlist
// machinery doesn't fit as embedded tab content, and this only needs the
// core "see what's queued, tap one to jump to it" behavior, which Track
// already does on its own (tapping a track already in the queue jumps
// straight to playing it — see Track.jsx's handleTrackClick).
const JukeboxNextUpTab = () => {
  const playlist = usePlayerStore((s) => s.playlist);
  const currentTrackIndex = usePlayerStore((s) => s.currentTrackIndex);

  if (playlist.length === 0) {
    return <p className="jukebox-panel-empty">Nothing queued yet — try Quick Hit or Search</p>;
  }

  return (
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
  );
};

export default JukeboxNextUpTab;
