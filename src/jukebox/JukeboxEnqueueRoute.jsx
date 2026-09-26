import { useParams, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { setStoredJukeboxToken } from '../utils/jukeboxEnqueueToken';
import JukeboxEnqueuePage from './JukeboxEnqueuePage';

// Route element for /jukebox/:token — see
// docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md Design §4.
// A logged-in visitor keeps the normal app (plus a "send to jukebox" action,
// see Track.jsx); an anonymous visitor gets the dedicated enqueue-only page.
const JukeboxEnqueueRoute = () => {
  const { token } = useParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    setStoredJukeboxToken(token);
    return <Navigate to="/" replace />;
  }

  return <JukeboxEnqueuePage token={token} />;
};

export default JukeboxEnqueueRoute;
