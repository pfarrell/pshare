// src/components/TrackNotesModal.jsx
import { useState, useEffect } from 'react';
import Modal from './Modal';
import { useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';

const TrackNotesModal = ({ track, onClose }) => {
  const location = useLocation();
  const { user, isAuthenticated } = useAuthStore();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);

  const isConnected = Boolean(user?.recall_connected);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const res = await apiService.getTrackNotes(track.id);
      setNotes(res.data.notes || []);
    } catch (err) {
      console.error('Failed to load track notes', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setPosting(true);
    setError(null);
    try {
      await apiService.addTrackNote(track.id, trimmed);
      setContent('');
      await loadNotes();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post note');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (noteId) => {
    try {
      await apiService.deleteTrackNote(track.id, noteId);
      await loadNotes();
    } catch (err) {
      console.error('Failed to delete note', err);
    }
  };

  return (
    <Modal onClose={onClose} size="md" testId="track-notes-modal-backdrop">
        <div style={{ marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>Notes</h2>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{track.title}</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
          {loading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
          ) : notes.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-faint)' }}>No notes yet</div>
          ) : (
            notes.map((note) => (
              <div key={note.id} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
                  {note.author?.username || 'Unknown'} · {new Date(note.created_at).toLocaleDateString()}
                  {!note.error && (
                    <>
                      {' · '}
                      <a href={apiService.getRecallItemUrl(note.recall_item_id)} target="_blank" rel="noopener noreferrer">open in Recall</a>
                    </>
                  )}
                  {isAuthenticated && (user?.id === note.author?.id || user?.admin) && (
                    <>
                      {' · '}
                      <button
                        onClick={() => handleDelete(note.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-faint)', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}
                      >
                        remove
                      </button>
                    </>
                  )}
                </div>
                {note.error ? (
                  <div style={{ color: 'var(--color-text-faint)', fontStyle: 'italic' }}>Note unavailable</div>
                ) : (
                  <div className="note-markdown" style={{ lineHeight: '1.6', color: 'var(--color-text-secondary)' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {isAuthenticated && (
          isConnected ? (
            <div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write a note (Markdown supported)…"
                rows={4}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: '1px solid var(--color-border-strong)', borderRadius: '4px',
                  padding: '0.5rem', fontSize: '0.9rem', fontFamily: 'inherit',
                }}
              />
              {error && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{error}</div>}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  onClick={handlePost}
                  disabled={posting || !content.trim()}
                  style={{
                    flex: 1, padding: '0.5rem 1rem', backgroundColor: '#7c3aed', color: 'white',
                    border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500',
                    minHeight: '44px',
                  }}
                >
                  {posting ? 'Posting…' : 'Post'}
                </button>
              </div>
            </div>
          ) : (
            <a
              href={`${apiService.getRecallConnectUrl()}?return_to=${encodeURIComponent(location.pathname)}`}
              style={{
                display: 'inline-block', padding: '0.5rem 1rem', backgroundColor: 'var(--color-text-muted)',
                color: 'white', borderRadius: '4px', textDecoration: 'none', fontSize: '0.875rem',
                marginBottom: '0.75rem',
              }}
            >
              Connect Recall to write notes
            </a>
          )
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: isAuthenticated ? '0.5rem' : 0 }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem', backgroundColor: 'var(--color-border)', color: 'var(--color-text-secondary)',
              border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500',
              minHeight: '44px',
            }}
          >
            Close
          </button>
        </div>
    </Modal>
  );
};

export default TrackNotesModal;
