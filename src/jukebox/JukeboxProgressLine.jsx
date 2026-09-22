import { usePlayerStore } from '../stores/playerStore';

// Display-only playback progress along the top edge of the tab bar. Deliberately
// has no handlers (and the CSS sets pointer-events: none): seeking lives in the
// Next Up transport, and a thin line is far too small a target to seek with.
const JukeboxProgressLine = () => {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);

  const percent = Number.isFinite(duration) && duration > 0
    ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
    : 0;

  return (
    <div
      className="jukebox-progress-line"
      role="progressbar"
      aria-label="Playback progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div className="jukebox-progress-line-fill" style={{ width: `${percent}%` }} />
    </div>
  );
};

export default JukeboxProgressLine;
