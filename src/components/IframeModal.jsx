import { createPortal } from 'react-dom';

// Shared shell for full-height iframe viewers (Wikipedia, MusicBrainz,
// Overtone). Styling lives in index.css's .iframe-modal-* classes, which
// also own the header/footer clearance on mobile.
const IframeModal = ({ url, title, testId, onClose, iframeRef }) => createPortal(
  <div
    data-testid={testId}
    className="iframe-modal-backdrop"
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div className="iframe-modal-box">
      <button onClick={onClose} aria-label="Close" className="iframe-modal-close">×</button>
      <iframe ref={iframeRef} src={url} title={title} style={{ flex: 1, border: 'none', width: '100%' }} />
    </div>
  </div>,
  document.body
);

export default IframeModal;
