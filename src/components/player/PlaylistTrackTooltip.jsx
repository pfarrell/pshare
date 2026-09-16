import { createPortal } from 'react-dom';
import { apiService } from '../../services/api';
import { formatDuration, getAlbumYear } from '../../utils/formatters';

// Estimates used only for viewport clamping before layout, same idiom as
// ContextMenu.jsx's MENU_WIDTH/BUTTON_HEIGHT constants.
const TOOLTIP_WIDTH = 160;
const TOOLTIP_HEIGHT = 250;
const CURSOR_OFFSET = 16; // keeps the tooltip from appearing directly under the pointer, covering the row it describes

// Hover infobox for a playlist row: portaled to document.body and positioned
// at (x, y) — the caller (useRowHoverTooltip) supplies a cursor position
// that this component clamps to stay on-screen, the same pattern
// ContextMenu.jsx uses for its own fixed-position menu.
const PlaylistTrackTooltip = ({ track, x, y }) => {
  const imageUrl = track.image_path ? apiService.getImageUrl(track.image_path, 'album_page') : null;
  const year = getAlbumYear(track.album?.release_year);

  let left = x + CURSOR_OFFSET;
  let top = y + CURSOR_OFFSET;
  if (left + TOOLTIP_WIDTH > window.innerWidth) left = window.innerWidth - TOOLTIP_WIDTH - 10;
  if (left < 10) left = 10;
  if (top + TOOLTIP_HEIGHT > window.innerHeight) top = y - TOOLTIP_HEIGHT - CURSOR_OFFSET;
  if (top < 10) top = 10;

  return createPortal(
    <div
      className="playlist-track-tooltip"
      style={{ position: 'fixed', left: `${left}px`, top: `${top}px`, width: TOOLTIP_WIDTH, pointerEvents: 'none', zIndex: 1100 }}
    >
      {imageUrl ? (
        <img className="playlist-track-tooltip-art" src={imageUrl} alt={track.title} />
      ) : (
        <div className="playlist-track-tooltip-art-blank" />
      )}
      <div className="playlist-track-tooltip-text">
        <div className="playlist-track-tooltip-artist">{track.artist?.name}</div>
        {track.album && (
          <div className="playlist-track-tooltip-album">
            {track.album.title}{year ? ` (${year})` : ''}
          </div>
        )}
        <div className="playlist-track-tooltip-title">{track.title}</div>
        <div className="playlist-track-tooltip-duration">{formatDuration(track.duration)}</div>
      </div>
    </div>,
    document.body
  );
};

export default PlaylistTrackTooltip;
