import { useState, useEffect, useRef } from 'react';
import QuickHitTab from './QuickHitTab';
import SearchTab from './SearchTab';
import JukeboxNextUpTab from './JukeboxNextUpTab';
import JukeboxArtistView from './JukeboxArtistView';
import JukeboxCollectionView from './JukeboxCollectionView';
import JukeboxTracksPanel from './JukeboxTracksPanel';
import JukeboxPlaylistPanel from './JukeboxPlaylistPanel';
import { useTouchScroll } from './useTouchScroll';

// The drawer body. Which tab is showing — and whether the drawer is open at all
// (activeTab === null) — is decided by JukeboxApp from the bottom tab bar; this
// component has no tab row or close button of its own.
//
// It is mounted even while closed and hidden with the `hidden` attribute,
// because tapping the active tab to close is now a frequent action and
// unmounting would throw away the Search query/results/filter every time.
//
// Owns two pieces of navigation state: the drill-down stack (Search can push
// an artist or a collection, whose albums show in place of the tab — see
// JukeboxArtistView/JukeboxCollectionView), and which album/playlist is
// selected. Neither replaces anything in this panel: selecting one opens a
// tracks-style panel to this one's left, so the list you tapped from stays
// put. An album and a playlist panel are mutually exclusive — selecting one
// closes the other, since they render in the same slot. Any tab can select
// an album; only Search can select a playlist so far. Both panels close with
// the drawer.
const JukeboxBrowsePanel = ({ activeTab, onEnqueue, pendingArtist, onJumpToArtist, onPendingArtistConsumed }) => {
  const [viewStack, setViewStack] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const lastShownTabRef = useRef(activeTab);
  const panelRef = useTouchScroll({ axis: 'y' });
  const open = activeTab !== null;

  useEffect(() => {
    if (activeTab === null) {
      // drawer closed: don't leave an orphaned tracks/playlist panel
      setSelectedAlbum(null);
      setSelectedPlaylist(null);
      return;
    }
    // A jump-to-artist request (from the tracks panel's artist link) replaces
    // whatever's on the drill-down stack with that artist, rather than being
    // stacked on top of it or cleared by the tab-switch rule below — it fires
    // together with (or after) the parent switching activeTab to 'search',
    // so this branch must win over the "different tab" clear on the same pass.
    if (pendingArtist) {
      setViewStack([{ type: 'artist', data: pendingArtist }]);
      onPendingArtistConsumed?.();
      lastShownTabRef.current = activeTab;
      return;
    }
    // A drill-down view only makes sense over the Search tab it was pushed
    // from, so a switch to a *different* tab dismisses it. Reopening the
    // same tab keeps it.
    if (lastShownTabRef.current !== null && lastShownTabRef.current !== activeTab) {
      setViewStack([]);
    }
    lastShownTabRef.current = activeTab;
  }, [activeTab, pendingArtist, onPendingArtistConsumed]);

  const pushView = (view) => setViewStack((stack) => [...stack, view]);
  const popView = () => setViewStack((stack) => stack.slice(0, -1));
  const selectAlbum = (album) => { setSelectedPlaylist(null); setSelectedAlbum(album); };
  const selectPlaylist = (playlist) => { setSelectedAlbum(null); setSelectedPlaylist(playlist); };
  // The tracks panel's artist link: close it and hand the artist up to
  // JukeboxApp, which owns activeTab and switches to Search if needed (see
  // the pendingArtist effect above for how it lands back here).
  const jumpToArtistFromTracksPanel = (artist) => {
    setSelectedAlbum(null);
    onJumpToArtist?.(artist);
  };

  // Derived (not just from state) so a tab switch never flashes the old
  // drill-down view for a frame before the effect above clears the stack.
  const currentView = activeTab === 'search' ? viewStack[viewStack.length - 1] : undefined;

  // The tracks/playlist panel is a sibling, not a child, of the scrolling
  // drawer: as a child, drags inside it would also bubble to this drawer's
  // scroll handler.
  return (
    <>
      <div className="jukebox-browse-panel" ref={panelRef} hidden={!open}>
        {currentView?.type === 'artist' && (
          <JukeboxArtistView
            artist={currentView.data}
            onSelectAlbum={selectAlbum}
            onBack={popView}
            onEnqueue={onEnqueue}
          />
        )}
        {currentView?.type === 'collection' && (
          <JukeboxCollectionView
            collection={currentView.data}
            onSelectAlbum={selectAlbum}
            onBack={popView}
            onEnqueue={onEnqueue}
          />
        )}
        {!currentView && activeTab === 'quickhit' && <QuickHitTab onSelectAlbum={selectAlbum} />}
        {/* Hidden, never unmounted: SearchTab owns the query, results and type
            filter, and unmounting it whenever a drill-down view or another
            tab is showing threw all of that away. */}
        <div hidden={activeTab !== 'search' || !!currentView}>
          <SearchTab
            onSelectArtist={(artist) => pushView({ type: 'artist', data: artist })}
            onSelectAlbum={selectAlbum}
            onSelectPlaylist={selectPlaylist}
            onSelectCollection={(collection) => pushView({ type: 'collection', data: collection })}
            onEnqueue={onEnqueue}
          />
        </div>
        {!currentView && activeTab === 'nextup' && <JukeboxNextUpTab />}
      </div>
      {open && selectedAlbum && (
        <JukeboxTracksPanel
          album={selectedAlbum}
          onClose={() => setSelectedAlbum(null)}
          onEnqueue={onEnqueue}
          onSelectArtist={jumpToArtistFromTracksPanel}
        />
      )}
      {open && selectedPlaylist && (
        <JukeboxPlaylistPanel playlist={selectedPlaylist} onClose={() => setSelectedPlaylist(null)} onEnqueue={onEnqueue} />
      )}
    </>
  );
};

export default JukeboxBrowsePanel;
