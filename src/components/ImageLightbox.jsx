import { createPortal } from 'react-dom';

// Shared full-screen image viewer: click anywhere on the overlay (including
// the image itself) to close, matching every page's existing lightbox.
const ImageLightbox = ({ imageUrl, alt, title, subtitle, onClose }) => {
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
        backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out', padding: '1rem',
      }}
    >
      <img
        src={imageUrl}
        alt={alt}
        style={{
          maxWidth: '90vw', maxHeight: '80vh',
          objectFit: 'contain', borderRadius: '4px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      />
      {(title || subtitle) && (
        <div style={{ marginTop: '0.75rem', textAlign: 'center', color: 'white' }}>
          {title && <div style={{ fontWeight: '600', fontSize: '1rem' }}>{title}</div>}
          {subtitle && (
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-faint)', marginTop: '0.25rem' }}>{subtitle}</div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
};

export default ImageLightbox;
