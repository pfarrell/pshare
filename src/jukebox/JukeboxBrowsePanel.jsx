import { useState } from 'react';
import QuickHitTab from './QuickHitTab';

// Search tab is added in a later task — see
// docs/superpowers/specs/2026-09-20-jukebox-mode-design.md §4.
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
        <button onClick={onClose} aria-label="Close">✕</button>
      </div>
      {tab === 'quickhit' && <QuickHitTab />}
    </div>
  );
};

export default JukeboxBrowsePanel;
