import { useEffect, useRef, useState } from 'react';

const LABELS = { browse: 'Browse', settings: 'Settings', aimix: 'AI Mix' };
// Settings renders as a gear glyph rather than its text label, matching the
// rest of the app's icon-as-button-content convention (⋯, ✕, ▲, transport
// glyphs) — its accessible name stays "Settings" either way, via the
// explicit aria-label below.
const ICONS = { settings: '⚙' };
const ALL_DESTINATIONS = ['browse', 'settings', 'aimix'];

// Small round icon, fixed in a corner of the drawer (see JukeboxBrowsePanel).
// Next Up no longer lists here — it's reached directly from the footer's own
// queue button (see JukeboxFooterStrip) — so this popover only ever offers
// Browse/Settings/AI Mix. Its popover only ever lists the destinations you're
// not currently on, so there's no separate "back to Browse" control to
// design — the same menu takes you anywhere, including back.
const JukeboxDrawerMenu = ({ activeDestination, onSelectDestination }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const otherDestinations = ALL_DESTINATIONS.filter((d) => d !== activeDestination);

  const handleSelect = (dest) => {
    onSelectDestination(dest);
    setOpen(false);
  };

  return (
    <div className="jukebox-drawer-menu" ref={containerRef}>
      <button type="button" aria-label="Drawer menu" onClick={() => setOpen((current) => !current)}>⋯</button>
      {open && (
        <div className="jukebox-drawer-menu-popover">
          {otherDestinations.map((dest) => (
            <button key={dest} type="button" aria-label={LABELS[dest]} onClick={() => handleSelect(dest)}>
              {ICONS[dest] ?? LABELS[dest]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default JukeboxDrawerMenu;
