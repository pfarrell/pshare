import { useAuthStore } from '../stores/authStore';
import JukeboxLogin from './JukeboxLogin';
import JukeboxNowPlaying from './JukeboxNowPlaying';
import MusicPlayerWrapper from '../components/player/MusicPlayerWrapper';

const JukeboxApp = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <JukeboxLogin />;
  }

  return (
    <div className="jukebox-app">
      <JukeboxNowPlaying />
      <div className="jukebox-footer">
        <MusicPlayerWrapper />
      </div>
    </div>
  );
};

export default JukeboxApp;
