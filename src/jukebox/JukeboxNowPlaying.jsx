import { usePlayerStore } from '../stores/playerStore';
import { apiService } from '../services/api';

// onDismiss fires on any tap here — the main screen behind the drawer/panels
// — so JukeboxApp can close whatever's open, mirroring the settings gear's
// own outside-click dismiss (see JukeboxProfilePicker.jsx).
const JukeboxNowPlaying = ({ onDismiss }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  if (!currentTrack) {
    return (
      <div className="jukebox-now-playing jukebox-now-playing-empty" onClick={onDismiss}>
        <p>Nothing playing — tap Browse to pick something</p>
      </div>
    );
  }

  // apiService.getImageUrl returns null for a falsy path, which would render a
  // broken-image icon — fall back to the same inline music-note placeholder
  // the desktop footer's NowPlaying uses (src/components/NowPlaying.jsx).
  const albumArtUrl = currentTrack.image_path
    ? apiService.getImageUrl(currentTrack.image_path, 'album_page')
    : null;

  return (
    <div className="jukebox-now-playing" onClick={onDismiss}>
      {albumArtUrl ? (
        <img
          className="jukebox-now-playing-art"
          src={albumArtUrl}
          alt={`${currentTrack.title}, ${currentTrack.artist?.name || ''}`}
        />
      ) : (
        <svg
          className="jukebox-now-playing-art-placeholder"
          fill="none" stroke="currentColor" aria-hidden="true"
          viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      )}
      <h1 className="jukebox-now-playing-title">{currentTrack.title}</h1>
      <p className="jukebox-now-playing-artist">{currentTrack.artist?.name}</p>
    </div>
  );
};

export default JukeboxNowPlaying;
