// src/components/player/SavePlaylistModal.jsx
import { useState } from 'react';
import Modal from '../Modal';
import toast from 'react-hot-toast';
import { apiService } from '../../services/api';

const SavePlaylistModal = ({ trackIds, onClose }) => {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Please enter a playlist name');
      return;
    }

    setSubmitting(true);
    try {
      await apiService.createPlaylist(trimmed, trackIds);
      toast.success(`Saved as "${trimmed}"`);
      setSubmitting(false);
      onClose();
    } catch (error) {
      console.error('Error saving playlist:', error);
      toast.error('Failed to save playlist');
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} layer="drawer" testId="save-playlist-modal-backdrop">
        <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
          Save Queue as Playlist
        </h2>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: '500' }}>
            Playlist Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter playlist name"
            autoFocus
            disabled={submitting}
            style={{
              width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)',
              borderRadius: '4px', fontSize: '1rem', outline: 'none', boxSizing: 'border-box',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.625rem 1rem', backgroundColor: 'var(--color-border)', color: 'var(--color-text-secondary)',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem',
              fontWeight: '500', minHeight: '44px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={submitting}
            style={{
              flex: 1, padding: '0.625rem 1rem', backgroundColor: submitting ? '#93c5fd' : '#3b82f6',
              color: 'white', border: 'none', borderRadius: '4px',
              cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.875rem',
              fontWeight: '500', minHeight: '44px',
            }}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
    </Modal>
  );
};

export default SavePlaylistModal;
