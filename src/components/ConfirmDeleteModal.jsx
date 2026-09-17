// src/components/ConfirmDeleteModal.jsx
import ConfirmDialog from './ConfirmDialog';

// A type-to-confirm gate for destructive, cascading admin deletes (artist,
// album). A plain window.confirm() is trivially dismissed without reading —
// this forces the admin to type a fixed phrase, giving them a moment to
// notice the message/title if it's the wrong entity.
const ConfirmDeleteModal = ({ title, message, onConfirm, onCancel }) => (
  <ConfirmDialog
    title={title}
    message={message}
    confirmLabel="Delete"
    busyLabel="Deleting…"
    tone="danger"
    requireTypedPhrase="delete me"
    layout="stacked"
    layer="top"
    testId="confirm-delete-modal-backdrop"
    errorFallback="Failed to delete — try again"
    onConfirm={onConfirm}
    onCancel={onCancel}
  />
);

export default ConfirmDeleteModal;
