// src/components/UnsavedChangesModal.jsx
import { useState } from 'react';
import Modal from './Modal';

// Shown by Layout when a pull-to-refresh is triggered while the current
// admin page has unsaved edits (see stores/unsavedChangesStore). Offers a
// real Save action (unlike the browser's own beforeunload prompt, which
// can only warn — it can't await an async save).
const UnsavedChangesModal = ({ onSave, onDiscard, onCancel }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave();
      setSaving(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save — try again');
      setSaving(false);
    }
  };

  return (
    <Modal onClose={saving ? undefined : onCancel} layer="top" testId="unsaved-changes-modal-backdrop">
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>Unsaved changes</h2>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
          You have unsaved changes on this page. Refreshing will lose them unless you save first.
        </p>

        {error && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '0.6rem', backgroundColor: '#3b82f6', color: 'white',
              border: 'none', borderRadius: '4px', fontWeight: 'bold',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save & Refresh'}
          </button>
          <button
            onClick={onDiscard}
            disabled={saving}
            style={{
              padding: '0.6rem', backgroundColor: 'var(--color-bg-surface)', color: '#ef4444',
              border: '1px solid #ef4444', borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Discard Changes
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '0.6rem', backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-strong)', borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
    </Modal>
  );
};

export default UnsavedChangesModal;
