import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import JukeboxLogin from './JukeboxLogin';
import JukeboxNowPlaying from './JukeboxNowPlaying';
import JukeboxBrowsePanel from './JukeboxBrowsePanel';
import JukeboxTabBar from './JukeboxTabBar';
import JukeboxKeyboard from './JukeboxKeyboard';
import { useJukeboxKeyboardFocus } from './useJukeboxKeyboardFocus';
import MusicPlayerWrapper from '../components/player/MusicPlayerWrapper';

const JukeboxApp = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Which drawer tab is showing; null = drawer closed. Tapping the active tab
  // closes the drawer, tapping another switches, tapping any while closed opens.
  const [activeTab, setActiveTab] = useState(null);
  // The platform's own on-screen keyboard (squeekboard + labwc) proved
  // unreliable on the actual kiosk hardware, so this shell provides its own —
  // see JukeboxKeyboard.jsx. Called unconditionally (before the early return
  // below) since it's a hook.
  const focusedInput = useJukeboxKeyboardFocus();

  const handleTabPress = (tab) => setActiveTab((current) => (current === tab ? null : tab));
  // Enqueueing something (a track, an album, an artist/collection shuffle)
  // from Quick Hit or Search closes everything, so the kiosk lands back on
  // Now Playing instead of leaving the drawer open over it.
  const closeAll = () => setActiveTab(null);

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
      <JukeboxBrowsePanel activeTab={activeTab} onEnqueue={closeAll} />
      <JukeboxTabBar activeTab={activeTab} onTabPress={handleTabPress} />
      {/* MusicPlayerWrapper owns both <audio> elements and usePlayerEngine
          (gapless prefetch, Media Session, play logging), so it must stay
          mounted — but its own controls are replaced by the tab bar and the
          Next Up transport, so it's hidden. Its <audio> elements were already
          display:none, so playback is unaffected. */}
      <div className="jukebox-engine" hidden>
        <MusicPlayerWrapper />
      </div>
      <JukeboxKeyboard targetElement={focusedInput} />
    </div>
  );
};

export default JukeboxApp;
