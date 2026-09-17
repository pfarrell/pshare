// src/components/player/PlaylistDrawerRow.jsx
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useIsCurrentPage } from '../../hooks/useIsCurrentPage';
import { formatPlaybackTime } from '../../utils/formatters';
import ContextMenu from '../ContextMenu';

// CSS's own animation (activity-row-flash, 0.6s x2) self-terminates the
// visual fade — this component has no timing logic of its own.
const ActivityOverlay = () => <div className="track-item-activity-overlay" />;

// One playlist row. Extracted out of PlaylistDrawer.jsx so it can own its own
// useContextMenu() call (a hook — can't be called per-item inside the
// parent's single .map(), same reason Track.jsx is its own per-row component
// elsewhere in the app). All the drag/touch/delete behavior below is
// unchanged from the pre-extraction inline JSX; the new piece is the
// right-click/long-press Go to Album / Go to Artist / Go to Playlist menu at the bottom.
const PlaylistDrawerRow = ({
  track,
  index,
  isActive,
  isFlashing,
  isDragged,
  mobile,
  imageUrl,
  artSize,
  rowRef,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onActivate,
  onTouchStartRow,
  onTouchEndRow,
  onRemove,
  hoverProps,
}) => {
  const navigate = useNavigate();
  const closeDrawer = usePlayerStore((s) => s.closeDrawer);
  const onThisAlbum = useIsCurrentPage(track.album?.id ? `/album/${track.album.id}` : null);
  const onThisArtist = useIsCurrentPage(track.artist?.id ? `/artist/${track.artist.id}` : null);
  const onThisPlaylist = useIsCurrentPage(track.source_playlist?.id ? `/playlist/${track.source_playlist.id}` : null);
  const hasMenuItems = Boolean(
    (track.album?.id && !onThisAlbum) ||
    (track.artist?.id && !onThisArtist) ||
    (track.source_playlist?.id && !onThisPlaylist)
  );
  const ctxMenu = useContextMenu({
    shouldIgnore: (e) => !hasMenuItems || e.target.closest('.track-delete-button'),
  });

  const handleGoToAlbum = (e) => {
    if (e) e.stopPropagation();
    navigate(`/album/${track.album.id}`);
    ctxMenu.close();
    closeDrawer();
  };

  const handleGoToArtist = (e) => {
    if (e) e.stopPropagation();
    navigate(`/artist/${track.artist.id}`);
    ctxMenu.close();
    closeDrawer();
  };

  const handleGoToPlaylist = (e) => {
    if (e) e.stopPropagation();
    navigate(`/playlist/${track.source_playlist.id}`);
    ctxMenu.close();
    closeDrawer();
  };

  const composedTouchStart = (e) => {
    onTouchStartRow(e);
    ctxMenu.triggerProps.onTouchStart(e);
  };

  const composedTouchMove = (e) => {
    ctxMenu.triggerProps.onTouchMove(e);
  };

  const composedTouchEnd = (e) => {
    ctxMenu.triggerProps.onTouchEnd(e);
    // A long-press just opened the menu — don't also treat this same
    // finger-release as a tap-to-play. A normal short tap never reaches
    // here with ctxMenu.open true (the long-press timer needs 500ms; a tap
    // releases well before that).
    if (ctxMenu.open) return;
    onTouchEndRow(index)(e);
  };

  return (
    <li
      ref={rowRef}
      className={`track-item ${isActive ? 'active' : ''} ${isDragged ? 'dragging' : ''}`}
      draggable={!mobile}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      onClick={!mobile ? () => onActivate(index) : undefined}
      onContextMenu={ctxMenu.triggerProps.onContextMenu}
      onTouchStart={mobile ? composedTouchStart : undefined}
      onTouchMove={mobile ? composedTouchMove : undefined}
      onTouchEnd={mobile ? composedTouchEnd : undefined}
      {...hoverProps}
    >
      {imageUrl ? (
        <img className="playlist-track-art" src={imageUrl} alt={track.title} style={{ width: artSize, height: artSize }} />
      ) : (
        <div className="playlist-track-art-blank" style={{ width: artSize, height: artSize }} />
      )}
      <span className="track-text">
        {index + 1}. {track.title} - {track.artist?.name} ({formatPlaybackTime(track.duration)})
      </span>
      <button
        className="track-delete-button"
        aria-label="Remove track from playlist"
        title="Remove from playlist"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(index);
        }}
      >
        &#10060;
      </button>
      {isFlashing && <ActivityOverlay />}

      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        openedViaTouch={ctxMenu.openedViaTouch}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        testId="playlist-row-menu-backdrop"
      >
        {track.album?.id && !onThisAlbum && (
          <button
            onClick={handleGoToAlbum}
            onTouchStart={(e) => { e.stopPropagation(); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleGoToAlbum(); }}
          >
            💿 Go to Album
          </button>
        )}
        {track.artist?.id && !onThisArtist && (
          <button
            onClick={handleGoToArtist}
            onTouchStart={(e) => { e.stopPropagation(); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleGoToArtist(); }}
          >
            🎤 Go to Artist
          </button>
        )}
        {track.source_playlist?.id && !onThisPlaylist && (
          <button
            onClick={handleGoToPlaylist}
            onTouchStart={(e) => { e.stopPropagation(); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleGoToPlaylist(); }}
          >
            📃 Go to Playlist
          </button>
        )}
      </ContextMenu>
    </li>
  );
};

export default PlaylistDrawerRow;
