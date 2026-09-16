import { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { apiService } from '../../services/api';
import { isMobileDevice } from '../../utils/device';
import PlaylistDrawerRow from './PlaylistDrawerRow';
import PlaylistTrackTooltip from './PlaylistTrackTooltip';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useRowHoverTooltip } from '../../hooks/useRowHoverTooltip';
import ContextMenu from '../ContextMenu';

const PlaylistDrawer = ({ onSaveQueue }) => {
  const playlist = usePlayerStore((s) => s.playlist);
  const currentTrackIndex = usePlayerStore((s) => s.currentTrackIndex);
  const drawerOpen = usePlayerStore((s) => s.drawerOpen);
  const playTrackAtIndex = usePlayerStore((s) => s.playTrackAtIndex);
  const removeTrackFromPlaylist = usePlayerStore((s) => s.removeTrackFromPlaylist);
  const reorderPlaylist = usePlayerStore((s) => s.reorderPlaylist);
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause);
  const toggleDrawer = usePlayerStore((s) => s.toggleDrawer);
  const closeDrawer = usePlayerStore((s) => s.closeDrawer);
  const clearPlaylist = usePlayerStore((s) => s.clearPlaylist);
  const recentlyAddedIndices = usePlayerStore((s) => s.recentlyAddedIndices);
  const clearRecentlyAdded = usePlayerStore((s) => s.clearRecentlyAdded);

  const [draggedIndex, setDraggedIndex] = useState(null);
  const touchStartTimeRef = useRef(0);
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const activeRowRef = useRef(null);
  // This component never unmounts (MusicPlayerWrapper always renders it; the
  // `if (!drawerOpen) return null` below is the only thing hiding it), so
  // "first open after an edit" has to be detected via the drawerOpen
  // transition, not mount/unmount — snapshot the batch when it opens, then
  // clear the store so a later open/close cycle shows no flash. Matched by
  // playlist position, not track id — the same track can appear twice.
  const [flashIndices, setFlashIndices] = useState([]);
  useEffect(() => {
    if (!drawerOpen) return;
    setFlashIndices(recentlyAddedIndices);
    if (recentlyAddedIndices.length > 0) clearRecentlyAdded();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the drawerOpen transition, not every recentlyAddedIndices change
  }, [drawerOpen]);

  // Same transition-based approach as flashIndices above: this component
  // never unmounts, so land on the current track every time the drawer
  // opens, not just on first mount.
  useEffect(() => {
    if (!drawerOpen) return;
    activeRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [drawerOpen]);

  const mobile = isMobileDevice();
  const { tooltip, getRowHoverProps } = useRowHoverTooltip({ disabled: mobile });

  const bgCtx = useContextMenu({
    shouldIgnore: (e) => Boolean(e.target.closest('.track-item')) || playlist.length === 0,
  });

  const handleSaveQueue = (e) => {
    if (e) e.stopPropagation();
    bgCtx.close();
    onSaveQueue?.();
  };

  const handleClearPlaylist = (e) => {
    if (e) e.stopPropagation();
    bgCtx.close();
    if (playlist.length === 0 || window.confirm('Clear the playlist? This will stop playback.')) {
      clearPlaylist();
    }
    closeDrawer();
  };

  if (!drawerOpen) return null;

  const handleRowActivate = (index) => {
    if (index === currentTrackIndex) {
      togglePlayPause();
    } else {
      playTrackAtIndex(index);
    }
  };

  const handleTouchStart = (e) => {
    touchStartTimeRef.current = Date.now();
    touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (index) => (e) => {
    // A tap on the delete button is handled by its own click handler, not
    // row activation — otherwise the bubbled touchend plays the track first,
    // which then blocks the delete (a track can't be removed while playing).
    if (e.target.closest('.track-delete-button')) return;
    const duration = Date.now() - touchStartTimeRef.current;
    const dx = Math.abs(e.changedTouches[0].clientX - touchStartPosRef.current.x);
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartPosRef.current.y);
    // Tap, not a scroll: short press, finger barely moved.
    if (duration < 300 && dx < 10 && dy < 10) {
      e.preventDefault();
      handleRowActivate(index);
    }
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const insertAt = e.clientY > midpoint ? index + 1 : index;
    reorderPlaylist(draggedIndex, insertAt);
    setDraggedIndex(null);
  };

  return (
    <>
      <div className="playlist-backdrop" onClick={toggleDrawer} />
      <div
        className="music-player-playlist-container"
        onContextMenu={bgCtx.triggerProps.onContextMenu}
        onTouchStart={bgCtx.triggerProps.onTouchStart}
        onTouchMove={bgCtx.triggerProps.onTouchMove}
        onTouchEnd={bgCtx.triggerProps.onTouchEnd}
      >
        <ul className="playlist">
          {playlist.map((track, index) => {
            const imageUrl = track.image_path ? apiService.getImageUrl(track.image_path, 'album_small') : null;
            const artSize = mobile ? 32 : 40;
            return (
              <PlaylistDrawerRow
                key={`${track.id}-${index}`}
                track={track}
                index={index}
                isActive={index === currentTrackIndex}
                rowRef={index === currentTrackIndex ? activeRowRef : undefined}
                isFlashing={flashIndices.includes(index)}
                isDragged={draggedIndex === index}
                mobile={mobile}
                imageUrl={imageUrl}
                artSize={artSize}
                onDragStart={() => setDraggedIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={() => setDraggedIndex(null)}
                onDrop={(e) => handleDrop(e, index)}
                onActivate={handleRowActivate}
                onTouchStartRow={handleTouchStart}
                onTouchEndRow={handleTouchEnd}
                onRemove={removeTrackFromPlaylist}
                hoverProps={getRowHoverProps(track)}
              />
            );
          })}
        </ul>

        <ContextMenu
          open={bgCtx.open}
          position={bgCtx.position}
          openedViaTouch={bgCtx.openedViaTouch}
          onDismiss={bgCtx.dismiss}
          onSwallowTouch={bgCtx.swallowTouch}
          testId="save-queue-drawer-menu-backdrop"
        >
          <button
            onClick={handleSaveQueue}
            onTouchStart={(e) => { e.stopPropagation(); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleSaveQueue(); }}
          >
            💾 Save as Playlist
          </button>
          <button
            onClick={handleClearPlaylist}
            onTouchStart={(e) => { e.stopPropagation(); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleClearPlaylist(); }}
          >
            🗑 Clear Playlist
          </button>
        </ContextMenu>
      </div>

      {tooltip && <PlaylistTrackTooltip track={tooltip.track} x={tooltip.x} y={tooltip.y} />}
    </>
  );
};

export default PlaylistDrawer;
