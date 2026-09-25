import JukeboxProgressLine from './JukeboxProgressLine';

const TABS = [
  { key: 'browse', label: 'Browse' },
  { key: 'nextup', label: 'Next Up' },
];

// The bottom bar that replaces the old footer transport, the floating Browse
// button and the drawer's own tab row. Which tab is active and what tapping
// does (open / switch / close) is decided by JukeboxApp — this only reports
// taps and reflects `activeTab` (null = drawer closed).
const JukeboxTabBar = ({ activeTab, onTabPress }) => (
  <nav className="jukebox-tab-bar" aria-label="Browse">
    <JukeboxProgressLine />
    {TABS.map(({ key, label }) => (
      <button
        key={key}
        type="button"
        aria-pressed={activeTab === key}
        onClick={() => onTabPress(key)}
      >
        {label}
      </button>
    ))}
  </nav>
);

export default JukeboxTabBar;
