// src/components/ProfileFilterChip.jsx
import { useEffect, useRef, useState } from 'react';
import ProfilePickerControl from './ProfilePickerControl';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { getProfilesCached } from '../utils/profilesCache';

// Header element replacing the old tag chip. Unlike that chip (a Link to
// /tags/:name), this opens a small picker popover in place — a profile
// isn't a single browsable page, it just narrows Home/Search. See
// docs/superpowers/specs/2026-09-24-profiles-design.md Design §4.
const ProfileFilterChip = () => {
  const { activeProfileId } = useProfileFilterStore();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState(null);
  const ref = useRef(null);

  // This chip is on every page, and it fetches the list unconditionally on
  // mount, so it's the earliest place that can notice a stale activeProfileId
  // (a deleted profile, or an id left in localStorage by a previous session).
  // Left alone, nothing resolves a name for the dead id — the trigger falls
  // back to its inactive label, indistinguishable from "All" — while Home and
  // Search keep sending it to the backend, which treats an unrecognized
  // profileId as "no match" and returns nothing. Clearing it in the shared
  // store self-heals every consumer at once.
  useEffect(() => {
    getProfilesCached().then((res) => {
      setProfiles(res.data);
      const { activeProfileId: active, clearProfile } = useProfileFilterStore.getState();
      if (active != null && !res.data.some((p) => p.id === active)) clearProfile();
    }).catch(() => setProfiles([]));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const activeName = profiles?.find((p) => p.id === activeProfileId)?.name;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Profile filter"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          background: activeName ? '#3b82f6' : 'transparent',
          color: activeName ? 'white' : 'inherit',
          border: activeName ? 'none' : '1px solid var(--color-border-strong)',
          padding: '2px 10px',
          borderRadius: '10px',
          fontSize: '0.75rem',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        {activeName ?? 'Filter'}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '4px',
          minWidth: '160px',
          background: '#2a3540',
          border: '1px solid var(--color-text-secondary)',
          borderRadius: '6px',
          padding: '6px',
          zIndex: 60,
        }}>
          <ProfilePickerControl onSelect={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
};

export default ProfileFilterChip;
