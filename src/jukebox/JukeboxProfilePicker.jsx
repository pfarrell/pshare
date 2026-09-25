import { useEffect, useState } from 'react';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { getProfilesCached } from '../utils/profilesCache';

// Gear-icon popover living in the Browse tab's search bar — the jukebox
// equivalent of ProfileFilterChip, but kiosk-styled and without an
// outside-click dismiss (no page behind it to click through to on a
// touch-only kiosk; a dedicated close control is more reliable there).
// Applying a profile does NOT close this — see
// docs/superpowers/specs/2026-09-24-profiles-design.md Design §5: this is
// a filter/settings change, not a playback action, so it stays open with
// the new selection highlighted until explicitly dismissed.
const JukeboxProfilePicker = () => {
  const { activeProfileId, setProfile } = useProfileFilterStore();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState(null);

  useEffect(() => {
    if (!open || profiles !== null) return;
    getProfilesCached().then((res) => setProfiles(res.data)).catch(() => setProfiles([]));
  }, [open, profiles]);

  return (
    <div className="jukebox-profile-picker">
      <button type="button" aria-label="Profile settings" onClick={() => setOpen(true)}>⚙</button>
      {open && (
        <div className="jukebox-profile-picker-popover">
          <div className="jukebox-profile-picker-header">
            <span>Profile</span>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)}>✕</button>
          </div>
          <button type="button" aria-pressed={activeProfileId === null} onClick={() => setProfile(null)}>
            All
          </button>
          {(profiles ?? []).map((p) => (
            <button key={p.id} type="button" aria-pressed={activeProfileId === p.id} onClick={() => setProfile(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default JukeboxProfilePicker;
