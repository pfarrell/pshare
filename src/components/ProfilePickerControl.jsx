// src/components/ProfilePickerControl.jsx
import { useEffect, useState } from 'react';
import { useProfileFilterStore } from '../stores/profileFilterStore';
import { apiService } from '../services/api';
import { getProfilesCached } from '../utils/profilesCache';
import toast from 'react-hot-toast';

// Select-from-list profile picker, shared by the header dropdown popover
// and the Account page — unlike the free-text tag-filter control it replaces,
// profiles are a fixed, admin-managed list, so this is just a list of
// buttons plus "All". `allowSetDefault` gates the "set default" action —
// only meaningful for a signed-in user. `variant` picks surface colors:
// 'dark' (default) matches the hamburger dropdown; 'light' matches
// Account.jsx's white cards.
const ProfilePickerControl = ({ allowSetDefault = false, onSelect, variant = 'dark' }) => {
  const { activeProfileId, setProfile } = useProfileFilterStore();
  const [profiles, setProfiles] = useState(null);
  const isLight = variant === 'light';

  useEffect(() => {
    getProfilesCached().then((res) => setProfiles(res.data)).catch(() => setProfiles([]));
  }, []);

  const activeProfile = profiles?.find((p) => p.id === activeProfileId);

  const selectProfile = (profileId) => {
    setProfile(profileId);
    onSelect?.();
  };

  const handleSetDefault = async () => {
    try {
      await apiService.setDefaultProfile(activeProfileId);
      toast.success(`Default profile set to ${activeProfile?.name ?? 'All'}`);
    } catch {
      toast.error('Failed to save default profile');
    }
  };

  const rowStyle = (selected) => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '6px 10px',
    background: selected ? (isLight ? 'var(--color-bg-surface-muted)' : '#2a3540') : 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: isLight ? 'var(--color-text-primary)' : '#e2e8f0',
    fontSize: '0.8rem',
    cursor: 'pointer',
  });

  return (
    <div>
      {allowSetDefault && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
          <button
            onClick={handleSetDefault}
            style={{ background: 'none', border: 'none', color: isLight ? '#6b7280' : '#9ca3af', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}
          >
            set default
          </button>
        </div>
      )}
      <button type="button" aria-pressed={activeProfileId === null} onClick={() => selectProfile(null)} style={rowStyle(activeProfileId === null)}>
        All
      </button>
      {(profiles ?? []).map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={activeProfileId === p.id}
          onClick={() => selectProfile(p.id)}
          style={rowStyle(activeProfileId === p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
};

export default ProfilePickerControl;
