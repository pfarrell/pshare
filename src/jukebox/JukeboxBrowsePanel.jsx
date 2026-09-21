import { useState } from 'react';
import QuickHitTab from './QuickHitTab';
import SearchTab from './SearchTab';
import JukeboxNextUpTab from './JukeboxNextUpTab';
import JukeboxArtistView from './JukeboxArtistView';
import JukeboxAlbumView from './JukeboxAlbumView';
import { useTouchScroll } from './useTouchScroll';

// Owns the drill-down navigation stack (which artist/album view, if any, is
// currently shown) so both tabs can push into it — Quick Hit only ever
// pushes albums, Search pushes both artists and albums. See
// JukeboxArtistView.jsx / JukeboxAlbumView.jsx for what each view does.
const JukeboxBrowsePanel = ({ onClose }) => {
  const [tab, setTab] = useState('quickhit');
  const [viewStack, setViewStack] = useState([]);
  const panelRef = useTouchScroll({ axis: 'y' });

  const pushView = (view) => setViewStack((stack) => [...stack, view]);
  const popView = () => setViewStack((stack) => stack.slice(0, -1));
  const selectTab = (nextTab) => {
    setTab(nextTab);
    setViewStack([]); // switching tabs while drilled in would leave Back pointing nowhere sensible
  };

  const currentView = viewStack[viewStack.length - 1];

  return (
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
          onSelectAlbum={(album) => pushView({ type: 'album', data: album })}
          onBack={popView}
        />
      )}
      {currentView?.type === 'album' && (
        <JukeboxAlbumView album={currentView.data} onBack={popView} />
      )}
      {!currentView && tab === 'quickhit' && (
        <QuickHitTab onSelectAlbum={(album) => pushView({ type: 'album', data: album })} />
      )}
      {!currentView && tab === 'search' && (
        <SearchTab
          onSelectArtist={(artist) => pushView({ type: 'artist', data: artist })}
          onSelectAlbum={(album) => pushView({ type: 'album', data: album })}
        />
      )}
      {!currentView && tab === 'nextup' && <JukeboxNextUpTab />}
    </div>
  );
};

export default JukeboxBrowsePanel;
