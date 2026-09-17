// src/components/NotesSection.jsx
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';

const NotesSection = ({ entityType, entityId, notes, isLoggedIn, onChange }) => {
  const location = useLocation();
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);
  // Initial value only (not useIsMobile): collapsed-by-default on phones, but
  // a later resize/rotation must not collapse or expand notes the user is reading.
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 768);

  const isConnected = Boolean(user?.recall_connected);
  const addNoteFn = entityType === 'collection' ? apiService.addCollectionNote : apiService.addAlbumNote;
  const deleteNoteFn = entityType === 'collection' ? apiService.deleteCollectionNote : apiService.deleteAlbumNote;

  const handlePost = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setPosting(true);
    setError(null);
    try {
      await addNoteFn(entityId, trimmed);
      setContent('');
      onChange();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post note');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (noteId) => {
    try {
      await deleteNoteFn(entityId, noteId);
      onChange();
    } catch (err) {
      console.error('Failed to delete note', err);
    }
  };

  if (!isLoggedIn && notes.length === 0) return null;

  return (
    <div style={{
      marginTop: '1.5rem',
      padding: '1rem',
      backgroundColor: 'var(--color-bg-surface)',
      borderRadius: '8px',
      border: '1px solid var(--color-border)'
    }}>
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          fontWeight: '600',
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: collapsed ? 0 : '0.75rem',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span>Notes{notes.length > 0 ? ` (${notes.length})` : ''}</span>
        <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
      </div>

      {collapsed ? null : <>
      {notes.map((note) => (
        <div key={note.id} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
            {note.author?.username || 'Unknown'} · {new Date(note.created_at).toLocaleDateString()}
            {!note.error && (
              <>
                {' · '}
                <a href={apiService.getRecallItemUrl(note.recall_item_id)} target="_blank" rel="noopener noreferrer">
                  open in Recall
                </a>
              </>
            )}
            {isLoggedIn && (user?.id === note.author?.id || user?.admin) && (
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
      ))}

      {isLoggedIn && (
        isConnected ? (
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a note (Markdown supported)…"
              rows={4}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid var(--color-border-strong)',
                borderRadius: '4px',
                padding: '0.5rem',
                fontSize: '0.9rem',
                fontFamily: 'inherit',
              }}
            />
            {error && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>{error}</div>}
            <button
              onClick={handlePost}
              disabled={posting || !content.trim()}
              style={{
                marginTop: '0.5rem',
                padding: '0.4rem 0.9rem',
                backgroundColor: '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        ) : (
          <a
            href={`${apiService.getRecallConnectUrl()}?return_to=${encodeURIComponent(location.pathname)}`}
            style={{
              display: 'inline-block',
              padding: '0.4rem 0.9rem',
              backgroundColor: 'var(--color-text-muted)',
              color: 'white',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '0.85rem',
            }}
          >
            Connect Recall to write notes
          </a>
        )
      )}
      </>}
    </div>
  );
};

export default NotesSection;
