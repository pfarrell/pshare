import { useParams, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { setStoredJukeboxToken } from '../utils/jukeboxEnqueueToken';
import GuestApp from './guest/GuestApp';

// Route element for /jukebox/:token — see
// docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md Design §4.
// A logged-in visitor keeps the normal app (plus a "send to jukebox" action,
// see Track.jsx); an anonymous visitor gets the guest browse app (src/jukebox/guest/).
const JukeboxEnqueueRoute = () => {
  const { token } = useParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    setStoredJukeboxToken(token);
    return <Navigate to="/" replace />;
  }

  return <GuestApp token={token} />;
};

export default JukeboxEnqueueRoute;
