// src/components/AddToContainerModal.jsx
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import { useAuthStore } from '../stores/authStore';

const buttonBase = {
  padding: '0.625rem 1rem', border: 'none', borderRadius: '4px',
  fontSize: '0.875rem', fontWeight: '500', minHeight: '44px',
};
const secondaryButton = { ...buttonBase, backgroundColor: 'var(--color-border)', color: 'var(--color-text-secondary)', cursor: 'pointer' };
const inputStyle = {
  width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)',
  borderRadius: '4px', outline: 'none', boxSizing: 'border-box',
};

// Pick one of the user's writable containers (playlist, collection) — or
// create one — and add the subject (a track, an album) to it. Adapters
// (AddToPlaylistModal, AddToCollectionModal) supply the API calls and copy.
const AddToContainerModal = ({
  subjectTitle,
  copy,
  loadItems,
  createAndAdd,
  addItem,
  isAlreadyInItem,
  describeAddError,
  onClose,
}) => {
  const { user, isAdmin } = useAuthStore();
  const [items, setItems] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmation, setConfirmation] = useState(null); // { type: 'duplicate-name' | 'already-in', item, message }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await loadItems();
        // Only list containers the current user can write to — the backend
        // rejects adding to someone else's with a 403, so those are dead ends.
        const writable = (all || []).filter((i) => isAdmin || (user && i.user_id === user.id));
        writable.sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        if (!cancelled) setItems(writable);
      } catch (err) {
        console.error(copy.loadFailed, err);
        toast.error(copy.loadFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Load once on open, with the auth state at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = filterText.trim() === ''
    ? items
    : items.filter((i) => i.name && i.name.toLowerCase().includes(filterText.toLowerCase()));

  const addTo = async (item, { skipAlreadyInCheck = false } = {}) => {
    try {
      if (!skipAlreadyInCheck && isAlreadyInItem && await isAlreadyInItem(item.id)) {
        setConfirmation({ type: 'already-in', item, message: copy.alreadyInMessage(item.name) });
        return;
      }
      await addItem(item.id);
      toast.success(`Added "${subjectTitle}" to "${item.name}"`);
      onClose();
    } catch (err) {
      console.error(copy.addFailed, err);
      toast.error(describeAddError ? describeAddError(err, item.name) : copy.addFailed);
    }
  };

  const handleAdd = async () => {
    if (!isCreatingNew) {
      if (!selected) { toast.error(copy.selectOne); return; }
      await addTo(selected);
      return;
    }

    const trimmed = newName.trim();
    if (!trimmed) { toast.error(copy.enterName); return; }

    const existing = items.find((i) => i.name && i.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setConfirmation({ type: 'duplicate-name', item: existing, message: copy.duplicateNameMessage(existing.name) });
      return;
    }

    try {
      await createAndAdd(trimmed);
      toast.success(`Created "${trimmed}" and added "${subjectTitle}"`);
      onClose();
    } catch (err) {
      console.error(copy.createFailed, err);
      toast.error(copy.createFailed);
    }
  };

  if (confirmation) {
    return (
      <ConfirmDialog
        key={confirmation.type}
        title="Confirm"
        message={confirmation.message}
        confirmLabel={confirmation.type === 'duplicate-name' ? 'Add to Existing' : 'Add Anyway'}
        onCancel={() => setConfirmation(null)}
        onConfirm={async () => {
          const pending = confirmation;
          await addTo(pending.item, { skipAlreadyInCheck: pending.type === 'already-in' });
          // addTo may have replaced this confirmation with an "already in"
          // one — only clear it if it's still the one we just answered.
          setConfirmation((current) => (current === pending ? null : current));
        }}
      />
    );
  }

  return (
    <Modal onClose={onClose} size="md">
      <div style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>
          {isCreatingNew ? copy.createTitle : copy.addTitle}
        </h2>
        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          {subjectTitle}
        </p>
      </div>

      {isCreatingNew ? (
        <>
          <div style={{ flex: 1, marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: '500' }}>
              {copy.nameLabel}
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={copy.namePlaceholder}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              style={{ ...inputStyle, fontSize: '1rem' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => { setIsCreatingNew(false); setNewName(''); setSelected(null); }} style={secondaryButton}>
              Back
            </button>
            <button onClick={handleAdd} style={{ ...buttonBase, flex: 1, backgroundColor: '#3b82f6', color: 'white', cursor: 'pointer' }}>
              {copy.createButton}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={copy.filterPlaceholder}
              style={{ ...inputStyle, fontSize: '0.875rem' }}
            />
          </div>

          <div style={{
            flex: 1, overflowY: 'auto', marginBottom: '1rem',
            border: '1px solid var(--color-border)', borderRadius: '4px',
            minHeight: '200px', maxHeight: '400px',
          }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>{copy.loading}</div>
            ) : (
              <>
                <div
                  onClick={() => { setIsCreatingNew(true); setNewName(''); }}
                  style={{
                    padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-surface)', fontWeight: '500', color: '#3b82f6',
                    minHeight: '44px', display: 'flex', alignItems: 'center',
                  }}
                >
                  + Create New...
                </div>
                {filtered.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>{copy.empty}</div>
                ) : (
                  filtered.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelected(item)}
                      style={{
                        padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--color-border)',
                        backgroundColor: selected?.id === item.id ? '#dbeafe' : 'transparent',
                        transition: 'background-color 0.15s ease', minHeight: '44px', display: 'flex', alignItems: 'center',
                      }}
                      onMouseEnter={(e) => { if (selected?.id !== item.id) e.currentTarget.style.backgroundColor = 'var(--color-bg-surface)'; }}
                      onMouseLeave={(e) => { if (selected?.id !== item.id) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      {item.name || copy.unnamed}
                    </div>
                  ))
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={onClose} style={secondaryButton}>Cancel</button>
            <button
              onClick={handleAdd}
              disabled={!selected}
              style={{
                ...buttonBase, flex: 1, color: 'white',
                backgroundColor: selected ? '#3b82f6' : 'var(--color-border-strong)',
                cursor: selected ? 'pointer' : 'not-allowed', opacity: selected ? 1 : 0.6,
              }}
            >
              {copy.addButton}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
};

export default AddToContainerModal;
