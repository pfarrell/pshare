import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { usePlayerStore } from '../../stores/playerStore';
import { isVisualizerSupported } from '../../utils/visualizerSupport';
import MilkdropCanvas from './MilkdropCanvas';

// Desktop entry point for the Milkdrop visualizer: a button next to the
// now-playing info that opens it full screen over the app while music plays.
//
// Mounting MilkdropCanvas is what taps the player's <audio> elements, and that
// tap is irreversible for the page's life (see src/utils/analyserGraph.js), so
// it is mounted only once the person asks, never just because the button
// exists. The button itself is not rendered on iOS (see visualizerSupport.js).
const VisualizerToggle = () => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [supported] = useState(isVisualizerSupported);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  if (!supported || !currentTrack) return null;

  const handleFail = () => {
    setOpen(false);
    toast.error('The visualizer is not supported in this browser');
  };

  return (
    <>
      <button
        type="button"
        className="visualizer-toggle"
        title="Visualizer"
        aria-label="Visualizer"
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="3" y="11" width="4" height="10" rx="1" />
          <rect x="10" y="3" width="4" height="18" rx="1" />
          <rect x="17" y="8" width="4" height="13" rx="1" />
        </svg>
      </button>
      {open && createPortal(
        // Portaled to <body>: the footer is position:fixed, and this has to sit
        // above the header, footer and playlist drawer rather than inside them.
        <div className="visualizer-overlay">
          <MilkdropCanvas onDismiss={() => setOpen(false)} onFail={handleFail} />
        </div>,
        document.body,
      )}
    </>
  );
};

export default VisualizerToggle;
