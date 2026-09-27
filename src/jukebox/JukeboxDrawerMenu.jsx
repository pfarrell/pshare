import { useEffect, useRef, useState } from 'react';

const LABELS = { browse: 'Browse', nextup: 'Next Up', settings: 'Settings' };
const ALL_DESTINATIONS = ['browse', 'nextup', 'settings'];

// Small round icon, fixed in a corner of the drawer (see JukeboxBrowsePanel),
// that replaces the old bottom tab bar's Next Up/Browse tabs and settings
// gear. Its popover only ever lists the two destinations you're not
// currently on, so there's no separate "back to Browse" control to design —
// the same menu takes you anywhere, including back.
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
            <button key={dest} type="button" onClick={() => handleSelect(dest)}>
              {LABELS[dest]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default JukeboxDrawerMenu;
