// src/components/ResultRow.jsx
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PlayButton from './PlayButton';
import { useIsMobile } from '../hooks/useIsMobile';

const ResultRow = ({
  imageUrl,
  imageContent,
  imageShape = 'square',
  title,
  subtitle,
  onClick,
  onImageError,
  onContextMenu,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  play,
  triggerProps,
}) => {
  const isMobile = useIsMobile();
  const trigger = triggerProps ?? { onContextMenu, onTouchStart, onTouchMove, onTouchEnd };
  const [showPlayMenu, setShowPlayMenu] = useState(false);
  const [playMenuPos, setPlayMenuPos] = useState({ x: 0, y: 0 });
  const playLongPressTimer = useRef(null);
  const playTouchStartPos = useRef({ x: 0, y: 0 });
  const playJustOpenedByLongPress = useRef(false);
  const playClearLongPressFlagTimer = useRef(null);

  // Long-press (mobile) / right-click (desktop) on the play button reveals
  // Play Now / Play Next / Add to Queue, mirroring Track.jsx's dropdown.
  // Both onPlayNext and onAddToQueue must be supplied to enable it — a
  // caller that only wants tap-to-play-all can omit them.
  const hasPlayMenu = !!(play && play.onPlayNext && play.onAddToQueue);

  useEffect(() => {
    return () => {
      if (playLongPressTimer.current) clearTimeout(playLongPressTimer.current);
      if (playClearLongPressFlagTimer.current) clearTimeout(playClearLongPressFlagTimer.current);
    };
  }, []);

  const openPlayMenu = (x, y) => {
    const menuWidth = 180;
    const menuHeight = 130;
    let px = x - menuWidth / 2;
    let py = y;
    if (px < 10) px = 10;
    if (px + menuWidth > window.innerWidth) px = window.innerWidth - menuWidth - 10;
    if (py + menuHeight > window.innerHeight) py = Math.max(10, y - menuHeight - 10);
    setPlayMenuPos({ x: px, y: py });
    setShowPlayMenu(true);
  };

  const handlePlayClick = (e) => {
    e.stopPropagation();
    if (playJustOpenedByLongPress.current) return;
    if (!play || play.loading) return;
    play.onPlay();
  };

  const handlePlayContextMenu = (e) => {
    if (!hasPlayMenu) return;
    e.preventDefault();
    e.stopPropagation();
    openPlayMenu(e.clientX, e.clientY);
  };

  const handlePlayTouchStart = (e) => {
    if (!hasPlayMenu || showPlayMenu) return;
    e.stopPropagation();
    playTouchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    playLongPressTimer.current = setTimeout(() => {
      playJustOpenedByLongPress.current = true;
      openPlayMenu(playTouchStartPos.current.x, playTouchStartPos.current.y);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };

  const handlePlayTouchMove = (e) => {
    if (!hasPlayMenu) return;
    const dx = Math.abs(e.touches[0].clientX - playTouchStartPos.current.x);
    const dy = Math.abs(e.touches[0].clientY - playTouchStartPos.current.y);
    if (dx > 10 || dy > 10) {
      if (playLongPressTimer.current) { clearTimeout(playLongPressTimer.current); playLongPressTimer.current = null; }
    }
  };

  const handlePlayTouchEnd = (e) => {
    if (!hasPlayMenu) return;
    if (playLongPressTimer.current) { clearTimeout(playLongPressTimer.current); playLongPressTimer.current = null; }
    if (playJustOpenedByLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
      if (playClearLongPressFlagTimer.current) clearTimeout(playClearLongPressFlagTimer.current);
      playClearLongPressFlagTimer.current = setTimeout(() => { playJustOpenedByLongPress.current = false; }, 350);
    }
  };

  const choosePlayAction = (e, action) => {
    // The menu is portaled to document.body, but React bubbles synthetic events
    // through the component tree, not the DOM tree — without stopPropagation this
    // click would still reach the row's own onClick (navigation), same pitfall
    // already guarded against in Track.jsx's and AlbumCard's own dropdown buttons.
    e.stopPropagation();
    setShowPlayMenu(false);
    if (!play || play.loading) return;
    action();
  };

  return (
    <div
      className="result-row"
      onClick={onClick}
      {...trigger}
    >
      <div className={`result-row-image result-row-image-${imageShape}`}>
        {imageContent || <img src={imageUrl} alt={title} onError={onImageError} />}
      </div>
      <div className="result-row-text">
        <h3 className="result-row-title">{title}</h3>
        {subtitle && <p className="result-row-subtitle">{subtitle}</p>}
      </div>
      {play && (
        <PlayButton
          size={isMobile ? 32 : 40}
          data-result-row-play="true"
          onClick={handlePlayClick}
          onContextMenu={handlePlayContextMenu}
          onTouchStart={handlePlayTouchStart}
          onTouchMove={handlePlayTouchMove}
          onTouchEnd={handlePlayTouchEnd}
          loading={play.loading}
          aria-label={play.label}
        />
      )}

      {showPlayMenu && hasPlayMenu && createPortal(
        <>
          <div
            data-testid="result-row-play-menu-backdrop"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (playJustOpenedByLongPress.current) return;
              setShowPlayMenu(false);
            }}
            onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (playJustOpenedByLongPress.current) return;
              setShowPlayMenu(false);
            }}
          />
          <div
            className="track-dropdown"
            style={{ position: 'fixed', left: `${playMenuPos.x}px`, top: `${playMenuPos.y}px`, zIndex: 100 }}
          >
            {play.onPlayNow && <button onClick={(e) => choosePlayAction(e, play.onPlayNow)}>▶ Play Now</button>}
            <button onClick={(e) => choosePlayAction(e, play.onPlayNext)}>⏭ Play Next</button>
            <button onClick={(e) => choosePlayAction(e, play.onAddToQueue)}>➕ Add to Queue</button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

export default ResultRow;
