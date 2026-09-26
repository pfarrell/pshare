import JukeboxProgressLine from './JukeboxProgressLine';
import JukeboxProfilePicker from './JukeboxProfilePicker';

const TABS = [
  { key: 'browse', label: 'Browse' },
  { key: 'nextup', label: 'Next Up' },
];

// The bottom bar that replaces the old footer transport, the floating Browse
// button and the drawer's own tab row. Which tab is active and what tapping
// does (open / switch / close) is decided by JukeboxApp — this only reports
// taps and reflects `activeTab` (null = drawer closed).
//
// The settings gear (JukeboxProfilePicker) lives here too, as a slim slot on
// the left — deliberately NOT one of the two equal-width tabs above (it's a
// filter/settings control, not a browse destination), sized to about a
// finger's width rather than matching Browse/Next Up. See index.css's
// `.jukebox-tab-bar .jukebox-profile-picker` rules.
const JukeboxTabBar = ({ activeTab, onTabPress }) => (
  <nav className="jukebox-tab-bar" aria-label="Browse">
    <JukeboxProgressLine />
    <JukeboxProfilePicker />
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
