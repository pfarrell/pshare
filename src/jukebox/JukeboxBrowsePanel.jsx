import { useState } from 'react';
import QuickHitTab from './QuickHitTab';
import SearchTab from './SearchTab';

const JukeboxBrowsePanel = ({ onClose }) => {
  const [tab, setTab] = useState('quickhit');

  return (
    <div className="jukebox-browse-panel">
      <div className="jukebox-panel-header">
        <button
          className={tab === 'quickhit' ? 'active' : ''}
          onClick={() => setTab('quickhit')}
        >
          Quick Hit
        </button>
        <button
          className={tab === 'search' ? 'active' : ''}
          onClick={() => setTab('search')}
        >
          Search
        </button>
        <button onClick={onClose} aria-label="Close">✕</button>
      </div>
      {tab === 'quickhit' && <QuickHitTab />}
      {tab === 'search' && <SearchTab />}
    </div>
  );
};

export default JukeboxBrowsePanel;
