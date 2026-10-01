import { useEffect, useState } from 'react';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { useJukeboxScreensaverStore } from '../stores/jukeboxScreensaverStore';
import { useAuthStore } from '../stores/authStore';
import { getProfilesCached, subscribeProfilesInvalidated } from '../utils/profilesCache';
import JukeboxQrCode from './JukeboxQrCode';

// The Settings destination inside the drawer (reached via JukeboxDrawerMenu),
// replacing the old standalone gear-icon popover (JukeboxProfilePicker). It
// has no open/close step of its own any more — JukeboxBrowsePanel mounts it
// only while `activeDestination === 'settings'`, the same way SearchTab and
// JukeboxNextUpTab are shown. Applying a profile does NOT switch away from
// Settings — see docs/superpowers/specs/2026-09-24-profiles-design.md
// Design §5: this is a filter/settings change, not a playback action.
// The kiosk's Chromium was launched by the Pi's labwc autostart, and a page
// can't quit its own browser — so this posts to a tiny localhost-only helper
// on the Pi (scripts/pi-kiosk-helper/) that kills Chromium and brings up the
// regular Pi desktop. Two taps, since the Settings tab is reachable by anyone
// standing at the panel.
const KIOSK_HELPER_URL = 'http://127.0.0.1:8737/exit-kiosk';
const EXIT_CONFIRM_MS = 3000;

const JukeboxSettingsTab = ({ onStartScreensaver }) => {
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [exitError, setExitError] = useState(false);
  const { activeProfileId, setProfile } = useProfileFilterStore();
  const { mode: screensaverMode, setMode: setScreensaverMode } = useJukeboxScreensaverStore();
  const [profiles, setProfiles] = useState(null);
  const token = useAuthStore((s) => s.jukeboxEnqueueToken);

  // Fetches on mount, and again whenever an external invalidate resets
  // `profiles` back to null below — this component unmounts whenever the
  // drawer switches to another destination (unlike SearchTab, it has no
  // query state worth keeping hidden-but-mounted for), so a fresh fetch on
  // every mount is already the common case.
  useEffect(() => {
    if (profiles === null) {
      getProfilesCached().then((res) => setProfiles(res.data)).catch(() => setProfiles([]));
    }
  }, [profiles]);

  useEffect(() => {
    if (!confirmingExit) return undefined;
    const timer = setTimeout(() => setConfirmingExit(false), EXIT_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmingExit]);

  const handleExitKiosk = async () => {
    if (!confirmingExit) {
      setExitError(false);
      setConfirmingExit(true);
      return;
    }
    setConfirmingExit(false);
    try {
      const res = await fetch(KIOSK_HELPER_URL, { method: 'POST' });
      if (!res.ok) setExitError(true);
    } catch {
      setExitError(true);
    }
  };

  useEffect(() => subscribeProfilesInvalidated(() => setProfiles(null)), []);

  // Mirrors App.jsx's own basename computation exactly — the /jukebox/:token
  // route is registered inside that same <Router basename={basename}>, so the
  // served path in production is /pshare/app/jukebox/:token.
  const qrUrl = `${window.location.origin}${import.meta.env.DEV ? '' : '/pshare/app'}/jukebox/${token}`;

  return (
    <div className="jukebox-settings-tab">
      <JukeboxQrCode url={qrUrl} />
      <div className="jukebox-settings-tab-divider" />
      <div className="jukebox-settings-tab-screensaver">
        <span className="jukebox-settings-tab-screensaver-label">Screensaver</span>
        <button
          type="button"
          className="jukebox-settings-tab-screensaver-toggle"
          aria-pressed={screensaverMode === 'off'}
          onClick={() => setScreensaverMode('off')}
        >
          Off
        </button>
        <button
          type="button"
          className="jukebox-settings-tab-screensaver-toggle"
          aria-pressed={screensaverMode === 'music'}
          onClick={() => setScreensaverMode('music')}
        >
          Music
        </button>
        <button
          type="button"
          className="jukebox-settings-tab-screensaver-toggle"
          aria-pressed={screensaverMode === 'photos'}
          onClick={() => setScreensaverMode('photos')}
        >
          Photos
        </button>
        <button
          type="button"
          className="jukebox-settings-tab-screensaver-toggle"
          aria-pressed={screensaverMode === 'visualizer'}
          onClick={() => setScreensaverMode('visualizer')}
        >
          Visualizer
        </button>
        <button
          type="button"
          className="jukebox-settings-tab-screensaver-toggle"
          aria-pressed={screensaverMode === 'factoids'}
          onClick={() => setScreensaverMode('factoids')}
        >
          Factoids
        </button>
        <button
          type="button"
          disabled={screensaverMode === 'off'}
          onClick={onStartScreensaver}
        >
          Start now
        </button>
      </div>
      <div className="jukebox-settings-tab-divider" />
      <button type="button" aria-pressed={activeProfileId === null} onClick={() => setProfile(null)}>
        All
      </button>
      {(profiles ?? []).map((p) => (
        <button key={p.id} type="button" aria-pressed={activeProfileId === p.id} onClick={() => setProfile(p.id)}>
          {p.name}
        </button>
      ))}
      <div className="jukebox-settings-tab-divider" />
      <button type="button" onClick={handleExitKiosk}>
        {confirmingExit ? 'Tap again to confirm' : 'Exit kiosk'}
      </button>
      {exitError && <p className="jukebox-settings-tab-error">Kiosk helper not running</p>}
    </div>
  );
};

export default JukeboxSettingsTab;
