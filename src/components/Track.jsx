// src/components/Track.jsx
import { useState } from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { apiService } from '../services/api';
import { formatDuration } from '../utils/formatters';
import { useNavigate } from 'react-router-dom';
import { useContextMenu } from '../hooks/useContextMenu';
import { useIsMobile } from '../hooks/useIsMobile';
import { useIsCurrentPage } from '../hooks/useIsCurrentPage';
import ContextMenu from './ContextMenu';
import AddToPlaylistModal from './AddToPlaylistModal';
import TrackNotesModal from './TrackNotesModal';
import PlayButton from './PlayButton';
import { shareLink } from '../utils/shareLink';

const Track = ({ track, index, trackCount, includeMeta = false, isPlaying = false, showMakeSingle = false, showEdit = false, onMadeSingle }) => {
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [pressedButton, setPressedButton] = useState(null);
  const playlist = usePlayerStore((s) => s.playlist);
  const addTrack = usePlayerStore((s) => s.addTrack);
  const addTracks = usePlayerStore((s) => s.addTracks);
  const setPlaylist = usePlayerStore((s) => s.setPlaylist);
  const playTrackAtIndex = usePlayerStore((s) => s.playTrackAtIndex);
  const { isAuthenticated } = useAuthStore();
  const isFavorite = useFavoritesStore((s) => s.isFavorite('track', track.id));
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const downloadsEnabled = import.meta.env.VITE_ENABLE_DOWNLOADS !== 'false';
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  // Two independent menus so a mobile long-press doesn't dump every possible
  // action into one long list (Play Now/Next/Queue plus everything else was
  // 9-11 items deep). Long-pressing the play button itself opens playCtxMenu
  // (playback controls only); long-pressing anywhere else on the row opens
  // ctxMenu (everything else). shouldIgnore keeps the row's menu from also
  // firing for a touch that started on the play button — mirrors ResultRow.jsx's
  // hand-rolled version of this same split, reusing the shared hook instead.
  const ctxMenu = useContextMenu({ shouldIgnore: (e) => e.target.tagName === 'A' || !!e.target.closest('.play-button') });
  const playCtxMenu = useContextMenu();

  const onThisAlbum = useIsCurrentPage(track.album?.id ? `/album/${track.album.id}` : null);
  const onThisArtist = useIsCurrentPage(track.artist?.id ? `/artist/${track.artist.id}` : null);

  const handleTrackClick = () => {
    const existingIndex = playlist.findIndex((t) => t.id === track.id);
    if (existingIndex !== -1) {
      playTrackAtIndex(existingIndex);
    } else {
      addTrack(track, { flashActivity: true }); // store auto-starts playback if idle
    }
  };

  const handlePlayNow = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setPlaylist([track]);
    setTimeout(() => playCtxMenu.close(), 0);
  };

  const handlePlayNext = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    addTracks([track], true, { flashActivity: true }); // true = play next; store auto-starts playback if idle
    setPressedButton('next');
    setTimeout(() => {
      playCtxMenu.close();
      setPressedButton(null);
    }, 220);
  };

  const handleAddToQueue = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    addTrack(track, { flashActivity: true }); // store auto-starts playback if idle
    setPressedButton('queue');
    setTimeout(() => {
      playCtxMenu.close();
      setPressedButton(null);
    }, 220);
  };

  const handleGoToAlbum = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    navigate(`/album/${track.album.id}`);
    ctxMenu.close();
  };

  const handleGoToArtist = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    navigate(`/artist/${track.artist.id}`);
    ctxMenu.close();
  };

  const handleMakeSingle = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!window.confirm(`Remove "${track.title}" from this album and register it as a single for ${track.artist?.name || 'this artist'}?`)) {
      return;
    }
    try {
      await apiService.makeTrackSingle(track.id);
      ctxMenu.close();
      onMadeSingle?.(track.id);
    } catch (error) {
      alert('Failed to make track a single: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleEdit = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    navigate(`/admin/track/${track.id}`);
    ctxMenu.close();
  };

  const handleAddToPlaylist = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    ctxMenu.close();
    setShowPlaylistModal(true);
  };

  const handleShowNotes = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    ctxMenu.close();
    setShowNotesModal(true);
  };

  const handleToggleFavorite = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    toggleFavorite('track', track.id, {
      id: track.id,
      title: track.title,
      track_number: track.track_number,
      duration: track.duration,
      artist: track.artist,
      album: track.album,
      download_url: track.download_url,
    });
    ctxMenu.close();
  };

  const handleDownload = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    window.location.href = track.download_url;
    ctxMenu.close();
  };

  const handleShare = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Build the track's own URL rather than sharing window.location.href —
    // this row can render on an album/playlist/search page, and a share from
    // there must still point at this specific track, not the page it's on.
    const basename = import.meta.env.DEV ? '' : '/pshare/app';
    shareLink({
      title: track.title,
      text: track.artist?.name ? `${track.title} — ${track.artist.name}` : track.title,
      url: `${window.location.origin}${basename}/track/${track.id}`,
    });
    ctxMenu.close();
  };

  const playMenuActions = [
    { key: 'play-now', icon: '▶', label: 'Play Now', onClick: handlePlayNow },
    { key: 'play-next', icon: '⏭', label: 'Play Next', onClick: handlePlayNext, className: pressedButton === 'next' ? 'menu-btn-pressed' : '' },
    { key: 'add-queue', icon: '➕', label: 'Add to Queue', onClick: handleAddToQueue, className: pressedButton === 'queue' ? 'menu-btn-pressed' : '' },
  ];

  const rowMenuActions = [
    track.album?.id && !onThisAlbum && { key: 'album', icon: '💿', label: 'Go to Album', onClick: handleGoToAlbum },
    track.artist?.id && !onThisArtist && { key: 'artist', icon: '🎤', label: 'Go to Artist', onClick: handleGoToArtist },
    showMakeSingle && track.album?.id && track.album.title !== '_Singles' && { key: 'single', icon: '🎵', label: 'Make Single', onClick: handleMakeSingle },
    showEdit && { key: 'edit', icon: '✏️', label: 'Edit', onClick: handleEdit },
    isAuthenticated && { key: 'playlist', icon: '📋', label: 'Add to Playlist', onClick: handleAddToPlaylist },
    isAuthenticated && { key: 'notes', icon: '📝', label: 'Notes', onClick: handleShowNotes },
    isAuthenticated && {
      key: 'favorite',
      icon: isFavorite ? '★' : '☆',
      label: isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
      onClick: handleToggleFavorite,
    },
    downloadsEnabled && isAuthenticated && track.download_url && !isMobile && { key: 'download', icon: '⬇', label: 'Download', onClick: handleDownload },
    isAuthenticated && { key: 'share', icon: '📤', label: 'Share', onClick: handleShare },
  ];

  return (
    <div
      className={`track-item ${isPlaying ? 'currently-playing' : ''}`}
      style={{
        padding: '1rem',
        borderBottom: index < trackCount - 1 ? '1px solid var(--color-border)' : 'none',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
        backgroundColor: isPlaying ? '#dbeafe' : 'transparent',
        borderLeft: isPlaying ? '4px solid #3b82f6' : '4px solid transparent',
        position: 'relative',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none'
      }}
      {...ctxMenu.triggerProps}
      onMouseEnter={(e) => {
        if (!isPlaying) {
          e.currentTarget.style.backgroundColor = 'var(--color-bg-surface)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isPlaying) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <PlayButton
        size={24}
        className="track-play-button"
        active={isPlaying}
        onClick={handleTrackClick}
        aria-label={isPlaying ? 'Now playing' : `Play ${track.title}`}
        {...playCtxMenu.triggerProps}
      >
        {isPlaying && <span className="play-button-note">♪</span>}
      </PlayButton>

      <div className="track-info" onClick={handleTrackClick} style={{ flex: 1, minWidth: 0 }}>
        <h4 className="track-title" style={{
          fontWeight: isPlaying ? '600' : '500',
          color: isPlaying ? '#1d4ed8' : 'var(--color-text-primary)'
        }}>
          {String(index + 1).padStart(2, '0')}. {track.title}
          {track.artist.id !== track.album?.artist?.id && (' - ' + track.artist.name)}

          {track.duration && (
            <span style={{
              color: 'var(--color-text-muted)',
              fontWeight: 'normal',
              marginLeft: '0.5rem'
            }}>
              ({formatDuration(track.duration)})
            </span>
          )}
          <p className="track-artist-album">
            {includeMeta && track.album && (
              <>
              {' '}
              {track.album.title !== '_Singles' && (
                <>
                from
                <a onClick={(e) => {
                  e.stopPropagation();
                  if (track.album.id) {
                    navigate(`/album/${track.album.id}`);
                  } else {
                    console.log('Go to album:', track.album);
                  }
                }}>
                  {track.album.title}
                </a>
                {' '}
                </>
              )}
              by
              <a onClick={(e) => {
                e.stopPropagation();
                if (track.album.artist.id) {
                  navigate(`/artist/${track.album.artist.id}`);
                } else {
                  console.log('Go to artist:', track.album.artist.id);
                }
              }}>
              {track.album.artist.name}
              </a>
              </>
            )}
          </p>

        </h4>
      </div>

      <ContextMenu
        open={playCtxMenu.open}
        position={playCtxMenu.position}
        openedViaTouch={playCtxMenu.openedViaTouch}
        onDismiss={playCtxMenu.dismiss}
        onSwallowTouch={playCtxMenu.swallowTouch}
        actions={playMenuActions}
        testId="track-play-menu-backdrop"
      />

      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        openedViaTouch={ctxMenu.openedViaTouch}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        actions={rowMenuActions}
        testId="track-menu-backdrop"
      />

      {showPlaylistModal && (
        <AddToPlaylistModal
          track={track}
          onClose={() => setShowPlaylistModal(false)}
        />
      )}

      {showNotesModal && (
        <TrackNotesModal
          track={track}
          onClose={() => setShowNotesModal(false)}
        />
      )}
    </div>
  );
};

export default Track;
