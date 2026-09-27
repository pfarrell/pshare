import JukeboxProgressLine from './JukeboxProgressLine';

// What's left of the old bottom tab bar once Next Up, Browse and the
// settings gear all move into the drawer (see JukeboxDrawerMenu): a slim,
// display-mostly strip holding just the playback progress line, still
// tappable as an alternative to tapping the Now Playing screen — both open
// the drawer to Browse, or close it, via the same onTap toggle owned by
// JukeboxApp.
const JukeboxFooterStrip = ({ onTap }) => (
  <button type="button" className="jukebox-footer-strip" aria-label="Browse" onClick={onTap}>
    <JukeboxProgressLine />
  </button>
);

export default JukeboxFooterStrip;
