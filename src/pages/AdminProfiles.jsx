// src/pages/AdminProfiles.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../services/api';
import Loading from '../components/Loading';
import Retry from '../components/Retry';
import { invalidateProfilesCache } from '../utils/profilesCache';

export default function AdminProfiles() {
  const [profiles, setProfiles] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null);
    apiService.getProfiles()
      .then((res) => setProfiles(res.data))
      .catch((err) => setError(err.message));
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (profile) => {
    if (!window.confirm(`Delete profile "${profile.name}"?`)) return;
    try {
      await apiService.deleteProfile(profile.id);
      // Drop the shared cached list so the header chip and jukebox picker stop
      // offering a profile that no longer exists (and so the chip's
      // stale-id check can see the deleted id is gone).
      invalidateProfilesCache();
      setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) return <Retry message={error} onRetry={load} />;
  if (profiles === null) return <Loading />;

  return (
    <div style={{ padding: '2rem', backgroundColor: 'var(--color-bg-surface-muted)', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>Profiles</h1>
        <Link to="/admin/profiles/new" style={{ padding: '0.5rem 1rem', backgroundColor: '#3b82f6', color: 'white', borderRadius: '6px', textDecoration: 'none', fontSize: '0.875rem' }}>
          + New Profile
        </Link>
      </div>

      <div style={{ backgroundColor: 'var(--color-bg-surface)', borderRadius: '0.5rem', overflow: 'hidden' }}>
        {profiles.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <Link to={`/admin/profiles/${p.id}`} style={{ color: 'var(--color-text-primary)', fontWeight: 600, textDecoration: 'none' }}>
                {p.name}
              </Link>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {p.tags.map((t) => t.name).join(', ')}
              </div>
            </div>
            <button
              onClick={() => handleDelete(p)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
