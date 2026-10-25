import { useState, useEffect, useRef } from 'react';
import SearchTab from './SearchTab';
import JukeboxNextUpTab from './JukeboxNextUpTab';
import JukeboxSettingsTab from './JukeboxSettingsTab';
import JukeboxAiMixTab from './JukeboxAiMixTab';
import JukeboxArtistView from './JukeboxArtistView';
import JukeboxSpotifyArtistView from './JukeboxSpotifyArtistView';
import JukeboxCollectionView from './JukeboxCollectionView';
import JukeboxTracksPanel from './JukeboxTracksPanel';
import JukeboxSpotifyTracksPanel from './JukeboxSpotifyTracksPanel';
import JukeboxPlaylistPanel from './JukeboxPlaylistPanel';
import JukeboxRecentsPanel from './JukeboxRecentsPanel';
import { useTouchScroll } from './useTouchScroll';

// The drawer body. Which destination is showing — and whether the drawer is
// open at all (activeDestination === null) — is decided by JukeboxApp; this
// component has no close button of its own. Destinations are reached from
// the footer strip (Next Up, Settings), by tapping Now Playing (Browse), and
// from Next Up's AI button (AI Mix, which has a back arrow to Next Up).
//
// It is mounted even while closed and hidden with the `hidden` attribute,
// because switching destinations (or closing and reopening) is now a
// frequent action and unmounting would throw away the Search query/results/
// filter every time.
//
// Owns three pieces of navigation state: the drill-down stack (Search can push
// an artist or a collection, whose albums show in place of the destination —
// see JukeboxArtistView/JukeboxCollectionView), which album/playlist is
// selected, and whether the Recent drawer is open. None replaces anything in
// this panel: selecting an album/playlist opens a tracks-style panel to this
// one's left, so the list you tapped from stays put. The album panel, the
// playlist panel and the Recent drawer are mutually exclusive — each closes
// the others, since they render in the same left-hand slot. Any destination can
// select an album; only Search can select a playlist so far. Both panels
// close with the drawer.
//
// There are four destinations: 'browse' (Search / Playlists / Collections
// selector plus the Recent drawer — see SearchTab.jsx), 'nextup', 'settings' (QR code,
// screensaver mode and profile filter), and
// 'aimix' (prompt-driven playlist generation — see JukeboxAiMixTab.jsx).
// Settings, Next Up, and AI Mix all unmount when switched away from, same as
// before — only Search's query/results are worth preserving hidden-but-mounted.
const JukeboxBrowsePanel = ({ activeDestination, onSelectDestination, onEnqueue, pendingItem, onJumpToArtist, onPendingItemConsumed, onGeneratingChange, onPlaylistSaved, onStartScreensaver }) => {
  const [viewStack, setViewStack] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const lastShownDestinationRef = useRef(activeDestination);
  const panelRef = useTouchScroll({ axis: 'y' });
  const open = activeDestination !== null;

  const [recentsOpen, setRecentsOpen] = useState(false);

  const selectAlbum = (album) => { setSelectedPlaylist(null); setRecentsOpen(false); setSelectedAlbum(album); };
  const selectPlaylist = (playlist) => { setSelectedAlbum(null); setRecentsOpen(false); setSelectedPlaylist(playlist); };
  const openRecents = () => { setSelectedAlbum(null); setSelectedPlaylist(null); setRecentsOpen((open) => !open); };

  useEffect(() => {
    if (activeDestination === null) {
      // drawer closed: don't leave an orphaned tracks/playlist panel
      setSelectedAlbum(null);
      setSelectedPlaylist(null);
      setRecentsOpen(false);
      return;
    }
    // A pending item — from the tracks panel's artist link, or the idle
    // screensaver's View button (see JukeboxApp.jsx's jumpToItem) — replaces
    // whatever's on the drill-down stack for an artist, or opens the tracks
    // panel directly for an album, rather than being stacked on top of
    // anything or cleared by the destination-switch rule below. It fires
    // together with (or after) the parent switching activeDestination to
    // 'browse', so this branch must win over the "different destination"
    // clear on the same pass.
    if (pendingItem?.type === 'artist') {
      setViewStack([{ type: 'artist', data: pendingItem.data }]);
      onPendingItemConsumed?.();
      lastShownDestinationRef.current = activeDestination;
      return;
    }
    if (pendingItem?.type === 'album') {
      setViewStack([]);
      selectAlbum(pendingItem.data);
      onPendingItemConsumed?.();
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
  }, [activeDestination, pendingItem, onPendingItemConsumed]);

  const pushView = (view) => { setRecentsOpen(false); setViewStack((stack) => [...stack, view]); };
  const popView = () => setViewStack((stack) => stack.slice(0, -1));
  // The tracks panel's artist link: close it and hand the artist up to
  // JukeboxApp, which owns activeDestination and switches to Browse if
  // needed (see the pendingItem effect above for how it lands back here).
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
        {/* #72: a Spotify artist (from the search tab's Spotify section) has no library id. */}
        {currentView?.type === 'artist' && currentView.data?.source === 'spotify' && (
          <JukeboxSpotifyArtistView
            artist={currentView.data}
            onSelectAlbum={selectAlbum}
            onBack={popView}
          />
        )}
        {currentView?.type === 'artist' && currentView.data?.source !== 'spotify' && (
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
            onOpenRecents={openRecents}
          />
        </div>
        {!currentView && activeDestination === 'nextup' && <JukeboxNextUpTab onSaved={onPlaylistSaved} onOpenAiMix={() => onSelectDestination?.('aimix')} />}
        {!currentView && activeDestination === 'settings' && <JukeboxSettingsTab onStartScreensaver={onStartScreensaver} />}
        {!currentView && activeDestination === 'aimix' && <JukeboxAiMixTab onPlaylistSaved={onPlaylistSaved} onBack={() => onSelectDestination?.('nextup')} onEnqueue={onEnqueue} onGeneratingChange={onGeneratingChange} />}
      </div>
      {open && recentsOpen && (
        <JukeboxRecentsPanel
          onClose={() => setRecentsOpen(false)}
          onSelectAlbum={selectAlbum}
          onSelectPlaylist={selectPlaylist}
          onSelectCollection={(collection) => pushView({ type: 'collection', data: collection })}
        />
      )}
      {/* #72: Spotify albums (from the artist view) get their own panel. */}
      {open && selectedAlbum?.source === 'spotify' && (
        <JukeboxSpotifyTracksPanel album={selectedAlbum} onClose={() => setSelectedAlbum(null)} onEnqueue={onEnqueue} />
      )}
      {open && selectedAlbum && selectedAlbum.source !== 'spotify' && (
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
