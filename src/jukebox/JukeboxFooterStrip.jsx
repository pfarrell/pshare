import { usePlayerStore } from '../stores/playerStore';
import { GLYPHS } from './jukeboxPlayerGlyphs';
import JukeboxProgressLine from './JukeboxProgressLine';

// A compact, always-visible transport: previous/play-pause/next go through
// playerStore actions, plus a queue button (Next Up) and a settings gear.
// Tapping the Now Playing screen above is how you reach Browse; this strip
// doesn't double as a generic "open Browse" tap target (see JukeboxApp.jsx).
const JukeboxFooterStrip = ({ onOpenQueue, onOpenSettings }) => {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playPrev = usePlayerStore((s) => s.playPrev);
  const playNext = usePlayerStore((s) => s.playNext);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);

  return (
    <div className="jukebox-footer-strip">
      <JukeboxProgressLine />
      <div className="jukebox-footer-controls">
        <button type="button" aria-label="Previous" onClick={playPrev}>{GLYPHS.PREV}</button>
        <button
          type="button"
          className="jukebox-footer-play"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={togglePlayPause}
        >
          {isPlaying ? GLYPHS.PAUSE : GLYPHS.PLAY}
        </button>
        <button type="button" aria-label="Next" onClick={() => playNext({ manual: true })}>{GLYPHS.NEXT}</button>
        <button type="button" aria-label="Open queue" onClick={onOpenQueue}>⋯</button>
        <button type="button" className="jukebox-footer-gear" aria-label="Settings" onClick={onOpenSettings}>⚙</button>
      </div>
    </div>
  );
};

export default JukeboxFooterStrip;
