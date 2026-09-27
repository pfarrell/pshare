import { useState, useEffect, useRef } from 'react';
import SearchTab from './SearchTab';
import JukeboxNextUpTab from './JukeboxNextUpTab';
import JukeboxSettingsTab from './JukeboxSettingsTab';
import JukeboxAiMixTab from './JukeboxAiMixTab';
import JukeboxDrawerMenu from './JukeboxDrawerMenu';
import JukeboxArtistView from './JukeboxArtistView';
import JukeboxCollectionView from './JukeboxCollectionView';
import JukeboxTracksPanel from './JukeboxTracksPanel';
import JukeboxPlaylistPanel from './JukeboxPlaylistPanel';
import { useTouchScroll } from './useTouchScroll';

// The drawer body. Which destination is showing — and whether the drawer is
// open at all (activeDestination === null) — is decided by JukeboxApp; this
// component has no close button of its own, but does own the small
// JukeboxDrawerMenu that switches between destinations (replacing the old
// bottom tab bar's Next Up/Browse tabs and settings gear).
//
// It is mounted even while closed and hidden with the `hidden` attribute,
// because switching destinations (or closing and reopening) is now a
// frequent action and unmounting would throw away the Search query/results/
// filter every time.
//
// Owns two pieces of navigation state: the drill-down stack (Search can push
// an artist or a collection, whose albums show in place of the destination —
// see JukeboxArtistView/JukeboxCollectionView), and which album/playlist is
// selected. Neither replaces anything in this panel: selecting one opens a
// tracks-style panel to this one's left, so the list you tapped from stays
// put. An album and a playlist panel are mutually exclusive — selecting one
// closes the other, since they render in the same slot. Any destination can
// select an album; only Search can select a playlist so far. Both panels
// close with the drawer.
//
// There are four destinations: 'browse' (Search, with Quick Hit as its
// empty-box state — see SearchTab.jsx), 'nextup', 'settings' (profile
// filter + QR code, formerly the standalone JukeboxProfilePicker gear), and
// 'aimix' (prompt-driven playlist generation — see JukeboxAiMixTab.jsx).
// Settings, Next Up, and AI Mix all unmount when switched away from, same as
// before — only Search's query/results are worth preserving hidden-but-mounted.
const JukeboxBrowsePanel = ({ activeDestination, onSelectDestination, onEnqueue, pendingArtist, onJumpToArtist, onPendingArtistConsumed, onGeneratingChange }) => {
  const [viewStack, setViewStack] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const lastShownDestinationRef = useRef(activeDestination);
  const panelRef = useTouchScroll({ axis: 'y' });
  const open = activeDestination !== null;

  useEffect(() => {
    if (activeDestination === null) {
      // drawer closed: don't leave an orphaned tracks/playlist panel
      setSelectedAlbum(null);
      setSelectedPlaylist(null);
      return;
    }
    // A jump-to-artist request (from the tracks panel's artist link) replaces
    // whatever's on the drill-down stack with that artist, rather than being
    // stacked on top of it or cleared by the destination-switch rule below —
    // it fires together with (or after) the parent switching activeDestination
    // to 'browse', so this branch must win over the "different destination"
    // clear on the same pass.
    if (pendingArtist) {
      setViewStack([{ type: 'artist', data: pendingArtist }]);
      onPendingArtistConsumed?.();
      lastShownDestinationRef.current = activeDestination;
      return;
    }
    // A drill-down view only makes sense over the Search destination it was
    // pushed from, so a switch to a *different* destination dismisses it.
    // Reopening the same destination keeps it.
    if (lastShownDestinationRef.current !== null && lastShownDestinationRef.current !== activeDestination) {
      setViewStack([]);
    }
    lastShownDestinationRef.current = activeDestination;
  }, [activeDestination, pendingArtist, onPendingArtistConsumed]);

  const pushView = (view) => setViewStack((stack) => [...stack, view]);
  const popView = () => setViewStack((stack) => stack.slice(0, -1));
  const selectAlbum = (album) => { setSelectedPlaylist(null); setSelectedAlbum(album); };
  const selectPlaylist = (playlist) => { setSelectedAlbum(null); setSelectedPlaylist(playlist); };
  // The tracks panel's artist link: close it and hand the artist up to
  // JukeboxApp, which owns activeTab and switches to Browse if needed (see
  // the pendingArtist effect above for how it lands back here).
  const jumpToArtistFromTracksPanel = (artist) => {
    setSelectedAlbum(null);
    onJumpToArtist?.(artist);
  };

  // Derived (not just from state) so a destination switch never flashes the
  // old drill-down view for a frame before the effect above clears the stack.
  const currentView = activeDestination === 'browse' ? viewStack[viewStack.length - 1] : undefined;

  // The tracks/playlist panel is a sibling, not a child, of the scrolling
  // drawer: as a child, drags inside it would also bubble to this drawer's
  // scroll handler.
  return (
    <>
      <div className="jukebox-browse-panel" ref={panelRef} hidden={!open}>
        <JukeboxDrawerMenu activeDestination={activeDestination} onSelectDestination={onSelectDestination} />
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
        {/* Hidden, never unmounted: SearchTab owns the query, results and type
            filter, and unmounting it whenever a drill-down view or another
            destination is showing threw all of that away. */}
        <div hidden={activeDestination !== 'browse' || !!currentView}>
          <SearchTab
            onSelectArtist={(artist) => pushView({ type: 'artist', data: artist })}
            onSelectAlbum={selectAlbum}
            onSelectPlaylist={selectPlaylist}
            onSelectCollection={(collection) => pushView({ type: 'collection', data: collection })}
            onEnqueue={onEnqueue}
          />
        </div>
        {!currentView && activeDestination === 'nextup' && <JukeboxNextUpTab />}
        {!currentView && activeDestination === 'settings' && <JukeboxSettingsTab />}
        {!currentView && activeDestination === 'aimix' && <JukeboxAiMixTab onEnqueue={onEnqueue} onGeneratingChange={onGeneratingChange} />}
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
