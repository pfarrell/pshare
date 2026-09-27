// src/jukebox/JukeboxSavePlaylistModal.jsx
import { useEffect, useRef, useState } from 'react';
import Modal from '../components/Modal';
import { apiService } from '../services/api';

const fallbackName = () => {
  const d = new Date();
  return `Jukebox Mix ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
};

// Jukebox's own variant of SavePlaylistModal (src/components/player/): the
// desktop/mobile player's modal reports success/failure via react-hot-toast,
// but Jukebox Mode never mounts a <Toaster/> (see JukeboxApp.jsx, which uses
// its own JukeboxToast instead) — so success goes through onSaved and
// failure renders inline here. It also pre-fills the name by requesting an
// AI suggestion (a lightweight sibling of AI Mix's generation call — see
// server/src/services/playlistNameSuggesterService.ts) rather than starting
// blank, since typing on the kiosk's on-screen keyboard is more friction
// than on a real keyboard. A failed/slow suggestion falls back silently to a
// plain default: naming the queue is a nice-to-have, saving it is the point.
const JukeboxSavePlaylistModal = ({ trackIds, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const userEditedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiService.suggestPlaylistName(trackIds)
      .then((response) => {
        if (!cancelled && !userEditedRef.current) setName(response.data.name);
      })
      .catch(() => {
        if (!cancelled && !userEditedRef.current) setName(fallbackName());
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    userEditedRef.current = true;
    setName(e.target.value);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a playlist name');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiService.createPlaylist(trimmed, trackIds);
      onSaved?.(trimmed);
      onClose();
    } catch {
      setError('Failed to save playlist');
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} layer="drawer" testId="jukebox-save-playlist-modal-backdrop">
      <h2 className="jukebox-save-playlist-title">Save Queue as Playlist</h2>
      <input
        type="text"
        className="jukebox-save-playlist-input"
        value={name}
        onChange={handleChange}
        placeholder="Enter playlist name"
        disabled={submitting}
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
      />
      {error && <p className="jukebox-save-playlist-error">{error}</p>}
      <div className="jukebox-save-playlist-actions">
        <button type="button" onClick={onClose} disabled={submitting}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
};

export default JukeboxSavePlaylistModal;
