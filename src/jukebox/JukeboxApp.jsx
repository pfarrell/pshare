import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import JukeboxLogin from './JukeboxLogin';
import JukeboxNowPlaying from './JukeboxNowPlaying';
import JukeboxBrowsePanel from './JukeboxBrowsePanel';
import JukeboxKeyboard from './JukeboxKeyboard';
import { useJukeboxKeyboardFocus } from './useJukeboxKeyboardFocus';
import MusicPlayerWrapper from '../components/player/MusicPlayerWrapper';

const JukeboxApp = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [activePanel, setActivePanel] = useState(null); // 'browse' | null
  // The platform's own on-screen keyboard (squeekboard + labwc) proved
  // unreliable on the actual kiosk hardware, so this shell provides its own —
  // see JukeboxKeyboard.jsx. Called unconditionally (before the early return
  // below) since it's a hook.
  const focusedInput = useJukeboxKeyboardFocus();

  // Wrapped in .jukebox-app too: the login screen is the first thing a fresh
  // kiosk shows, and it needs the shell's dark ground and kiosk-scale sizing
  // just as much as the authenticated view does.
  if (!isAuthenticated) {
    return (
      <div className="jukebox-app">
        <JukeboxLogin />
        <JukeboxKeyboard targetElement={focusedInput} />
      </div>
    );
  }

  return (
    <div className="jukebox-app">
      <JukeboxNowPlaying />
      <button className="jukebox-browse-button" onClick={() => setActivePanel('browse')} aria-label="Browse">
        Browse
      </button>
      {activePanel === 'browse' && (
        <JukeboxBrowsePanel onClose={() => setActivePanel(null)} />
      )}
      <div className="jukebox-footer">
        <MusicPlayerWrapper />
      </div>
      <JukeboxKeyboard targetElement={focusedInput} />
    </div>
  );
};

export default JukeboxApp;
