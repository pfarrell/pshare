import { usePlayerStore } from '../stores/playerStore';
import { GLYPHS } from './jukeboxPlayerGlyphs';
import JukeboxProgressLine from './JukeboxProgressLine';

// A compact, always-visible transport: previous/play-pause/next go through
// the same playerStore actions and glyphs as JukeboxTransport (the fuller
// transport pinned at the top of Next Up, which this doesn't replace — both
// exist for now), plus a queue button that jumps straight to Next Up. Tapping
// the Now Playing screen above is still how you reach Browse; this strip no
// longer doubles as a generic "open Browse" tap target now that it holds real
// controls (see JukeboxApp.jsx).
const JukeboxFooterStrip = ({ onOpenQueue }) => {
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
      </div>
    </div>
  );
};

export default JukeboxFooterStrip;
