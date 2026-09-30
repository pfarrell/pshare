import { useState } from 'react';
import { apiService } from '../services/api';
import { getStoredJukeboxToken } from '../utils/jukeboxEnqueueToken';

const STATUS_MESSAGES = {
  401: 'Log in again to control the jukebox',
  404: 'This jukebox link has expired. Scan its QR code again',
  409: 'The jukebox is not connected',
  429: 'Slow down, try again in a moment',
};

const BUTTON_STYLE = {
  flex: 1,
  minHeight: '2.75rem', // iOS minimum touch target
  border: 'none',
  borderRadius: '0.375rem',
  background: '#3a4853',
  color: 'inherit',
  fontSize: '1.1rem',
  cursor: 'pointer',
};

// Previous / play-pause / next for the jukebox kiosk this device last connected
// to (its QR-code token is stored when a logged-in user visits the link). Lives
// in the account menu, not the header, so it never touches the fixed chrome.
// Deliberately blind: the kiosk sends no state back, so play/pause is a plain
// toggle. No seeking. Labels say "Jukebox ..." so they can't be confused with
// this device's own player.
const JukeboxRemote = () => {
  const token = getStoredJukeboxToken();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  if (!token) return null;

  const send = async (command) => {
    setSending(true);
    setMessage(null);
    try {
      await apiService.sendJukeboxCommand(token, command);
    } catch (err) {
      setMessage(STATUS_MESSAGES[err?.response?.status] ?? 'Could not reach the jukebox');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #3a4853' }}>
      <div style={{ color: '#9ca3af', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
        Jukebox remote
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" aria-label="Jukebox previous" disabled={sending} style={BUTTON_STYLE} onClick={() => send('prev')}>⏮</button>
        <button type="button" aria-label="Jukebox play or pause" disabled={sending} style={BUTTON_STYLE} onClick={() => send('toggle')}>⏯</button>
        <button type="button" aria-label="Jukebox next" disabled={sending} style={BUTTON_STYLE} onClick={() => send('next')}>⏭</button>
      </div>
      {message && <div role="status" style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#fbbf24' }}>{message}</div>}
    </div>
  );
};

export default JukeboxRemote;
