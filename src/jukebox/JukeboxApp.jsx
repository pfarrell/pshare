import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { usePlayerStore } from '../stores/playerStore';
import JukeboxLogin from './JukeboxLogin';
import JukeboxNowPlaying from './JukeboxNowPlaying';
import JukeboxBrowsePanel from './JukeboxBrowsePanel';
import MusicPlayerWrapper from '../components/player/MusicPlayerWrapper';

const JukeboxApp = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const drawerOpen = usePlayerStore((s) => s.drawerOpen);
  const closeDrawer = usePlayerStore((s) => s.closeDrawer);
  const [activePanel, setActivePanel] = useState(null); // 'browse' | null

  // Only one right-edge panel at a time: if the queue drawer (owned by
  // MusicPlayerWrapper's own hamburger button) opens, close ours.
  useEffect(() => {
    if (drawerOpen) setActivePanel(null);
  }, [drawerOpen]);

  if (!isAuthenticated) {
    return <JukeboxLogin />;
  }

  const openBrowsePanel = () => {
    if (drawerOpen) closeDrawer();
    setActivePanel('browse');
  };

  return (
    <div className="jukebox-app">
      <JukeboxNowPlaying />
      <button className="jukebox-browse-button" onClick={openBrowsePanel} aria-label="Browse">
        Browse
      </button>
      {activePanel === 'browse' && (
        <JukeboxBrowsePanel onClose={() => setActivePanel(null)} />
      )}
      <div className="jukebox-footer">
        <MusicPlayerWrapper />
      </div>
    </div>
  );
};

export default JukeboxApp;
