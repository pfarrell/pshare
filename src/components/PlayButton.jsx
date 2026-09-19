// src/components/PlayButton.jsx
import { forwardRef } from 'react';

// Shared circular play button used anywhere a bare "play" affordance
// is needed (track rows, result rows, album cards, the header's plain Play
// control). Sizing is driven entirely by the `size` prop (px) — the
// triangle and spinner are drawn in `em` units scaled off it, so there's no
// per-caller CSS to keep in sync. The fused Play + "▾" menu split button
// (PlayActionsMenu's .play-split) is a different, two-target control and
// intentionally does NOT use this component.
const PlayButton = forwardRef(({ size = 40, active = false, loading = false, disabled, className = '', style, children, ...rest }, ref) => {
  const isDisabled = disabled ?? loading;

  return (
    <button
      ref={ref}
      type="button"
      className={`play-button${active ? ' play-button-active' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, fontSize: `${size}px`, ...style }}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <span className="play-button-spinner" aria-hidden="true" />
      ) : children || (
        <span className="play-button-triangle" aria-hidden="true" />
      )}
    </button>
  );
});

PlayButton.displayName = 'PlayButton';

export default PlayButton;
