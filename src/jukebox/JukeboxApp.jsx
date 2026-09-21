import { useAuthStore } from '../stores/authStore';
import JukeboxLogin from './JukeboxLogin';

const JukeboxApp = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <JukeboxLogin />;
  }

  return <div className="jukebox-app" data-testid="jukebox-main" />;
};

export default JukeboxApp;
