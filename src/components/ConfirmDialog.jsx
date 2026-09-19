// src/components/ConfirmDialog.jsx
import { useId, useState } from 'react';
import Modal from './Modal';
import { getErrorMessage } from '../utils/errors';

// Yes/no confirmation, optionally gated on typing a phrase (for cascading
// destructive deletes, where a plain confirm is too easy to click through).
const ConfirmDialog = ({
  title,
  message,
  confirmLabel = 'Confirm',
  busyLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  requireTypedPhrase,
  layout = 'inline',
  layer = 'modal',
  testId,
  errorFallback = 'Something went wrong — try again',
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canConfirm = !requireTypedPhrase || typed === requireTypedPhrase;
  const confirmDisabled = !canConfirm || busy;

  const handleConfirm = async () => {
    if (confirmDisabled) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
    } catch (err) {
      setError(getErrorMessage(err, errorFallback));
      setBusy(false);
    }
  };

  const confirmButton = (
    <button
      onClick={handleConfirm}
      disabled={confirmDisabled}
      style={{
        padding: '0.6rem 1rem',
        backgroundColor: tone === 'danger' ? '#ef4444' : '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        fontWeight: 'bold',
        cursor: confirmDisabled ? 'not-allowed' : 'pointer',
        opacity: confirmDisabled ? 0.5 : 1,
      }}
    >
      {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
    </button>
  );

  const cancelButton = (
    <button
      onClick={() => onCancel()}
      disabled={busy}
      style={{
        padding: '0.6rem 1rem',
        backgroundColor: 'var(--color-bg-surface)',
        color: 'var(--color-text-secondary)',
        border: '1px solid var(--color-border-strong)',
        borderRadius: '4px',
        cursor: busy ? 'not-allowed' : 'pointer',
      }}
    >
      {cancelLabel}
    </button>
  );

  return (
    <Modal onClose={busy ? undefined : onCancel} layer={layer} testId={testId} labelledBy={titleId}>
      <h2 id={titleId} style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: 'var(--color-text-primary)' }}>{title}</h2>
      <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>{message}</p>

      {requireTypedPhrase && (
        <>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            Type <strong>{requireTypedPhrase}</strong> to confirm:
          </p>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
            disabled={busy}
            autoFocus
            style={{
              width: '100%', boxSizing: 'border-box', padding: '0.5rem',
              border: '1px solid var(--color-border-strong)', borderRadius: '4px',
              fontSize: '0.9rem', marginBottom: '1rem',
            }}
          />
        </>
      )}

      {error && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</div>}

      {layout === 'stacked' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{confirmButton}{cancelButton}</div>
      ) : (
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>{cancelButton}{confirmButton}</div>
      )}
    </Modal>
  );
};

export default ConfirmDialog;
