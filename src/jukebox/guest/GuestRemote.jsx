import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiService } from '../../services/api';
import { remoteErrorMessage } from '../../utils/jukeboxRemote';
import { useGuest } from './useGuest';
import GuestLoginPrompt from './GuestLoginPrompt';

// Previous / play-pause / next for this kiosk. Always rendered, even for a
// logged-out visitor: the server requires a login for commands, so a 401 sends
// them to the login page and back here afterwards. (The guest app never reads
// the auth store; the 401 is how it finds out.) Play/pause is a blind toggle,
// since the kiosk reports no state back. No seeking.
const GuestRemote = () => {
  const { token } = useGuest();
  const { pathname, search } = useLocation();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  const send = async (command) => {
    setSending(true);
    setMessage(null);
    try {
      await apiService.sendJukeboxCommand(token, command);
    } catch (err) {
      if (err?.response?.status === 401) {
        setNeedsLogin(true);
        return;
      }
      setMessage(remoteErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="jukebox-guest-remote" role="group" aria-label="Jukebox remote">
      {message && <div className="jukebox-guest-remote-message" role="status">{message}</div>}
      <div className="jukebox-guest-remote-buttons">
        <button type="button" aria-label="Jukebox previous" disabled={sending} onClick={() => send('prev')}>⏮</button>
        <button type="button" aria-label="Jukebox play or pause" disabled={sending} onClick={() => send('toggle')}>⏯</button>
        <button type="button" aria-label="Jukebox next" disabled={sending} onClick={() => send('next')}>⏭</button>
      </div>
      {needsLogin && <GuestLoginPrompt returnTo={pathname + search} onCancel={() => setNeedsLogin(false)} />}
    </div>
  );
};

export default GuestRemote;
