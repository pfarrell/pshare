// src/components/Modal.jsx
import { createPortal } from 'react-dom';

// Portal + dimmed backdrop + centered panel (styles: .modal-* in index.css).
// `layer` picks the stacking level from the --z-* tokens: 'modal' for
// ordinary dialogs, 'drawer' for dialogs opened over the playlist drawer,
// 'top' for dialogs that must cover everything.
const Modal = ({ onClose, size = 'sm', layer = 'modal', testId, labelledBy, dismissible = true, children }) => createPortal(
  <div
    data-testid={testId}
    className={`modal-backdrop${layer === 'modal' ? '' : ` modal-backdrop--${layer}`}`}
    onClick={(e) => { if (dismissible && e.target === e.currentTarget) onClose?.(); }}
  >
    <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={`modal-panel modal-panel--${size}`}>
      {children}
    </div>
  </div>,
  document.body
);

export default Modal;
