// src/pages/AdminProfile.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import Loading from '../components/Loading';

export default function AdminProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === undefined;

  const [name, setName] = useState('');
  const [tags, setTags] = useState([]); // [{ id, name }]
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [allTags, setAllTags] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (isNew) return;
    apiService.getProfiles().then((res) => {
      const found = res.data.find((p) => p.id === Number(id));
      if (found) {
        setName(found.name);
        setTags(found.tags);
      }
      setLoading(false);
    });
  }, [id, isNew]);

  const handleTagInputChange = async (e) => {
    const value = e.target.value;
    setTagInput(value);
    let list = allTags;
    if (list === null) {
      const res = await apiService.getTags();
      list = res.data;
      setAllTags(list);
    }
    setSuggestions(list.filter((t) => (t.name ?? '').includes(value.toLowerCase()) && !tags.some((existing) => existing.id === t.id)).slice(0, 8));
  };

  const handleTagInputFocus = async () => {
    if (allTags === null) {
      const res = await apiService.getTags();
      setAllTags(res.data);
    }
  };

  const addTag = (tag) => {
    setTags((prev) => [...prev, tag]);
    setTagInput('');
    setSuggestions([]);
  };

  const removeTag = (tagId) => {
    setTags((prev) => prev.filter((t) => t.id !== tagId));
  };

  const canSave = name.trim().length > 0 && tags.length > 0 && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const tagIds = tags.map((t) => t.id);
      if (isNew) {
        await apiService.createProfile(name.trim(), tagIds);
      } else {
        await apiService.updateProfile(Number(id), name.trim(), tagIds);
      }
      navigate('/admin/profiles');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>
        {isNew ? 'New Profile' : 'Edit Profile'}
      </h1>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Profile name"
        style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.75rem', marginBottom: '1rem', fontSize: '0.9rem', border: '1px solid var(--color-border-strong)', borderRadius: '4px', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '1rem' }}>
        {tags.map((t) => (
          <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--color-border)', borderRadius: '12px', padding: '3px 10px', fontSize: '0.8rem' }}>
            #{t.name}
            <button
              aria-label={`remove ${t.name}`}
              onClick={() => removeTag(t.id)}
              style={{ background: 'none', border: 'none', color: 'var(--color-text-faint)', cursor: 'pointer', padding: 0, fontSize: '0.75rem' }}
            >
              ×
            </button>
          </span>
        ))}
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={tagInput}
            onChange={handleTagInputChange}
            onFocus={handleTagInputFocus}
            placeholder="add tag…"
            style={{ border: 'none', borderBottom: '1px solid var(--color-border-strong)', background: 'transparent', fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '3px 4px', outline: 'none', width: '100px' }}
          />
          {suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: '4px', zIndex: 10, minWidth: '130px' }}>
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  onMouseDown={(e) => { e.preventDefault(); addTag(s); }}
                  style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}
                >
                  #{s.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {tags.length === 0 && (
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Add at least one tag before saving.
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={!canSave}
        style={{ padding: '0.625rem 1.25rem', backgroundColor: canSave ? '#3b82f6' : 'var(--color-border)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 500, cursor: canSave ? 'pointer' : 'not-allowed' }}
      >
        Save
      </button>
    </div>
  );
}
