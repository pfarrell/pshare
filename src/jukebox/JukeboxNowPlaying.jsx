import { usePlayerStore } from '../stores/playerStore';
import { apiService } from '../services/api';

const JukeboxNowPlaying = () => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  if (!currentTrack) {
    return (
      <div className="jukebox-now-playing jukebox-now-playing-empty">
        <p>Nothing playing — tap browse to pick something</p>
      </div>
    );
  }

  return (
    <div className="jukebox-now-playing">
      <img
        className="jukebox-now-playing-art"
        src={apiService.getImageUrl(currentTrack.image_path, 'album_page')}
        alt={`${currentTrack.title}, ${currentTrack.artist?.name || ''}`}
      />
      <h1 className="jukebox-now-playing-title">{currentTrack.title}</h1>
      <p className="jukebox-now-playing-artist">{currentTrack.artist?.name}</p>
    </div>
  );
};

export default JukeboxNowPlaying;
