import { useState, useEffect, useRef } from 'react';
import QuickHitTab from './QuickHitTab';
import SearchTab from './SearchTab';
import JukeboxNextUpTab from './JukeboxNextUpTab';
import JukeboxArtistView from './JukeboxArtistView';
import JukeboxTracksPanel from './JukeboxTracksPanel';
import { useTouchScroll } from './useTouchScroll';

// The drawer body. Which tab is showing — and whether the drawer is open at all
// (activeTab === null) — is decided by JukeboxApp from the bottom tab bar; this
// component has no tab row or close button of its own.
//
// It is mounted even while closed and hidden with the `hidden` attribute,
// because tapping the active tab to close is now a frequent action and
// unmounting would throw away the Search query/results/filter every time.
//
// Owns two pieces of navigation state: the artist drill-down stack (Search can
// push an artist, whose albums show in place of the tab — see
// JukeboxArtistView), and the selected album. An album never replaces anything
// here: it opens JukeboxTracksPanel, a separate panel to this one's left, so
// the list you tapped from stays put. Any tab can select an album. The tracks
// panel closes with the drawer.
const JukeboxBrowsePanel = ({ activeTab }) => {
  const [viewStack, setViewStack] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const lastShownTabRef = useRef(activeTab);
  const panelRef = useTouchScroll({ axis: 'y' });
  const open = activeTab !== null;

  useEffect(() => {
    if (activeTab === null) {
      setSelectedAlbum(null); // drawer closed: don't leave an orphaned tracks panel
      return;
    }
    // An artist view only makes sense over the Search tab it was pushed from, so
    // a switch to a *different* tab dismisses it. Reopening the same tab keeps it.
    if (lastShownTabRef.current !== null && lastShownTabRef.current !== activeTab) {
      setViewStack([]);
    }
    lastShownTabRef.current = activeTab;
  }, [activeTab]);

  const pushView = (view) => setViewStack((stack) => [...stack, view]);
  const popView = () => setViewStack((stack) => stack.slice(0, -1));

  // Derived (not just from state) so a tab switch never flashes the old artist
  // view for a frame before the effect above clears the stack.
  const currentView = activeTab === 'search' ? viewStack[viewStack.length - 1] : undefined;

  // The tracks panel is a sibling, not a child, of the scrolling drawer:
  // as a child, drags inside it would also bubble to this drawer's scroll handler.
  return (
    <>
      <div className="jukebox-browse-panel" ref={panelRef} hidden={!open}>
        {currentView?.type === 'artist' && (
          <JukeboxArtistView
            artist={currentView.data}
            onSelectAlbum={setSelectedAlbum}
            onBack={popView}
          />
        )}
        {!currentView && activeTab === 'quickhit' && <QuickHitTab onSelectAlbum={setSelectedAlbum} />}
        {/* Hidden, never unmounted: SearchTab owns the query, results and type
            filter, and unmounting it whenever an artist view or another tab is
            showing threw all of that away. */}
        <div hidden={activeTab !== 'search' || !!currentView}>
          <SearchTab
            onSelectArtist={(artist) => pushView({ type: 'artist', data: artist })}
            onSelectAlbum={setSelectedAlbum}
          />
        </div>
        {!currentView && activeTab === 'nextup' && <JukeboxNextUpTab />}
      </div>
      {open && selectedAlbum && (
        <JukeboxTracksPanel album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
      )}
    </>
  );
};

export default JukeboxBrowsePanel;
