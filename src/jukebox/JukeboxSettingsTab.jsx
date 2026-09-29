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
const JukeboxSettingsTab = () => {
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
    </div>
  );
};

export default JukeboxSettingsTab;
