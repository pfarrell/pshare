// src/components/OvertoneModal.jsx
import { useEffect, useRef } from 'react';
import IframeModal from './IframeModal';

// Overtone's "Listen on Bemused" link posts { source: 'overtone-bemused-link', url }
// to its parent window when it's running framed (see bemused-link.tsx in the
// overtone repo). We convert that absolute bemused URL into an in-app path and
// hand it to onNavigate so the caller can react-router to it instead of doing a
// full page load.
const MESSAGE_SOURCE = 'overtone-bemused-link';

// Stripped unconditionally rather than gated on import.meta.env.DEV: whether
// this prefix is present depends on the backend's BEMUSED_PUBLIC_URL (which
// includes it only in production), not on how this frontend build was made.
const PROD_BASENAME = '/pshare/app';

function pathFromBemusedUrl(url) {
  const parsed = new URL(url);
  let path = parsed.pathname + parsed.search;
  if (path.startsWith(PROD_BASENAME)) {
    path = path.slice(PROD_BASENAME.length) || '/';
  }
  return path;
}

const OvertoneModal = ({ url, onClose, onNavigate }) => {
  const iframeRef = useRef(null);

  useEffect(() => {
    const expectedOrigin = new URL(url).origin;

    const handleMessage = (event) => {
      if (event.origin !== expectedOrigin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.source !== MESSAGE_SOURCE || typeof event.data?.url !== 'string') return;

      onClose();
      onNavigate?.(pathFromBemusedUrl(event.data.url));
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [url, onClose, onNavigate]);

  return (
    <IframeModal url={url} title="Overtone" testId="overtone-modal-backdrop" onClose={onClose} iframeRef={iframeRef} />
  );
};

export default OvertoneModal;
