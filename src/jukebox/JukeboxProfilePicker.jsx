import { useEffect, useState } from 'react';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { useAuthStore } from '../stores/authStore';
import { getProfilesCached, subscribeProfilesInvalidated } from '../utils/profilesCache';
import JukeboxQrCode from './JukeboxQrCode';

// Gear-icon popover living in the tab bar's right edge (rendered by
// JukeboxTabBar), as a slim finger-width slot rather than a third equal-size
// tab — the jukebox equivalent of ProfileFilterChip, but kiosk-styled and
// without an outside-click dismiss (no page behind it to click through to on
// a touch-only kiosk; a dedicated close control is more reliable there).
// Applying a profile does NOT close this — see
// docs/superpowers/specs/2026-09-24-profiles-design.md Design §5: this is
// a filter/settings change, not a playback action, so it stays open with
// the new selection highlighted until explicitly dismissed.
const JukeboxProfilePicker = () => {
  const { activeProfileId, setProfile } = useProfileFilterStore();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState(null);
  const [view, setView] = useState('filter');
  const deviceId = useAuthStore((s) => s.jukeboxDeviceId);
  const initialToken = useAuthStore((s) => s.jukeboxEnqueueToken);
  const [token, setToken] = useState(initialToken);

  useEffect(() => {
    if (!open || profiles !== null) return;
    getProfilesCached().then((res) => setProfiles(res.data)).catch(() => setProfiles([]));
  }, [open, profiles]);

  // This component never unmounts on a kiosk (rendered by the always-present
  // JukeboxTabBar), so a profile created/edited/deleted elsewhere only
  // reaches it if it resets its own local `profiles` state — resetting the
  // module-scope cache promise alone (which invalidateProfilesCache() does)
  // can't reach into React state we already populated. Setting profiles back
  // to null lets the effect above naturally refetch, immediately if the
  // popover is open, or the next time it's opened otherwise.
  useEffect(() => subscribeProfilesInvalidated(() => setProfiles(null)), []);

  // Mirrors App.jsx's own basename computation exactly — the /jukebox/:token
  // route is registered inside that same <Router basename={basename}>, so the
  // served path in production is /pshare/app/jukebox/:token.
  const qrUrl = `${window.location.origin}${import.meta.env.DEV ? '' : '/pshare/app'}/jukebox/${token}`;

  return (
    <div className="jukebox-profile-picker">
      <button type="button" aria-label="Profile settings" onClick={() => setOpen(true)}>⚙</button>
      {open && (
        <div className="jukebox-profile-picker-popover">
          <div className="jukebox-profile-picker-header">
            <span>{view === 'qr' ? 'QR Code' : 'Filter'}</span>
            {view === 'filter' && (
              <button type="button" onClick={() => setView('qr')}>Show QR code</button>
            )}
            <button type="button" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
          </div>
          {view === 'qr' ? (
            <>
              <JukeboxQrCode url={qrUrl} deviceId={deviceId} onRotated={setToken} />
              <button type="button" onClick={() => setView('filter')}>Back</button>
            </>
          ) : (
            <>
              <button type="button" aria-pressed={activeProfileId === null} onClick={() => setProfile(null)}>
                All
              </button>
              {(profiles ?? []).map((p) => (
                <button key={p.id} type="button" aria-pressed={activeProfileId === p.id} onClick={() => setProfile(p.id)}>
                  {p.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default JukeboxProfilePicker;
