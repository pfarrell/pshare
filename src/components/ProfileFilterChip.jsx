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

  useEffect(() => {
    getProfilesCached().then((res) => setProfiles(res.data)).catch(() => setProfiles([]));
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
        {activeName ?? 'Profile'}
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
