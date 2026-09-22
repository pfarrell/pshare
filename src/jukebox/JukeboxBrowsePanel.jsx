import { useState } from 'react';
import QuickHitTab from './QuickHitTab';
import SearchTab from './SearchTab';
import JukeboxNextUpTab from './JukeboxNextUpTab';
import JukeboxArtistView from './JukeboxArtistView';
import JukeboxTracksPanel from './JukeboxTracksPanel';
import { useTouchScroll } from './useTouchScroll';

// Owns two pieces of navigation state: the artist drill-down stack (Search can
// push an artist, whose albums show in place of the tab — see JukeboxArtistView),
// and the selected album. An album never replaces anything in this panel: it
// opens JukeboxTracksPanel, a separate panel to this one's left, so the list
// you tapped from stays put. Any tab can select an album.
const JukeboxBrowsePanel = ({ onClose }) => {
  const [tab, setTab] = useState('quickhit');
  const [viewStack, setViewStack] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const panelRef = useTouchScroll({ axis: 'y' });

  const pushView = (view) => setViewStack((stack) => [...stack, view]);
  const popView = () => setViewStack((stack) => stack.slice(0, -1));
  const selectTab = (nextTab) => {
    setTab(nextTab);
    setViewStack([]); // switching tabs while drilled in would leave Back pointing nowhere sensible
  };

  const currentView = viewStack[viewStack.length - 1];

  // The tracks panel is a sibling, not a child, of the scrolling browse panel:
  // as a child, drags inside it would also bubble to this panel's scroll handler.
  return (
    <>
      <div className="jukebox-browse-panel" ref={panelRef}>
        <div className="jukebox-panel-header">
          <button
            className={tab === 'quickhit' ? 'active' : ''}
            onClick={() => selectTab('quickhit')}
          >
            Quick Hit
          </button>
          <button
            className={tab === 'search' ? 'active' : ''}
            onClick={() => selectTab('search')}
          >
            Search
          </button>
          <button
            className={tab === 'nextup' ? 'active' : ''}
            onClick={() => selectTab('nextup')}
          >
            Next Up
          </button>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        {currentView?.type === 'artist' && (
          <JukeboxArtistView
            artist={currentView.data}
            onSelectAlbum={setSelectedAlbum}
            onBack={popView}
          />
        )}
        {!currentView && tab === 'quickhit' && <QuickHitTab onSelectAlbum={setSelectedAlbum} />}
        {!currentView && tab === 'search' && (
          <SearchTab
            onSelectArtist={(artist) => pushView({ type: 'artist', data: artist })}
            onSelectAlbum={setSelectedAlbum}
          />
        )}
        {!currentView && tab === 'nextup' && <JukeboxNextUpTab />}
      </div>
      {selectedAlbum && (
        <JukeboxTracksPanel album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
      )}
    </>
  );
};

export default JukeboxBrowsePanel;
