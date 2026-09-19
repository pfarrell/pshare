// src/pages/TrackPage.jsx
import { useEffect, useState } from 'react';
import ImageLightbox from '../components/ImageLightbox';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { useContextMenu } from '../hooks/useContextMenu';
import { useEntityHeaderActions } from '../hooks/useEntityHeaderActions';
import { useIsMobile } from '../hooks/useIsMobile';
import { useFetch } from '../hooks/useFetch';
import PlayButton from '../components/PlayButton';
import Loading from '../components/Loading';
import PageError from '../components/PageError';
import ContextMenu from '../components/ContextMenu';
import AddToPlaylistModal from '../components/AddToPlaylistModal';
import TrackNotesModal from '../components/TrackNotesModal';

// Matches the basename App.jsx's <Router> uses — needed here because
// login/signup's return_to is a raw browser redirect (window.location.href),
// not a React Router navigate(), so it has to include the app's own path
// prefix in production to land back on this page instead of 404ing at the
// site root.
const BASENAME = import.meta.env.DEV ? '' : '/pshare/app';

const TrackPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuthStore();
  const addTrack = usePlayerStore((s) => s.addTrack);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const setPageTracks = usePlayerStore((s) => s.setPageTracks);
  const downloadsEnabled = import.meta.env.VITE_ENABLE_DOWNLOADS !== 'false';
  const isMobile = useIsMobile();
  const { data: track, loading, error } = useFetch(
    () => apiService.getTrack(id).then((response) => response.data.track),
    [id]
  );
  const [showImageModal, setShowImageModal] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const { actions: headerActions, shouldIgnore } = useEntityHeaderActions({
    kind: 'track',
    entity: track,
    canEdit: isAdmin,
    isAuthenticated,
    share: track ? { title: track.title, text: track.artist?.name ? `${track.title} by ${track.artist.name}` : track.title } : null,
    extras: [
      isAuthenticated && { key: 'playlist', icon: '📋', label: 'Add to Playlist', onClick: () => setShowPlaylistModal(true) },
      isAuthenticated && { key: 'notes', icon: '📝', label: 'Notes', onClick: () => setShowNotesModal(true) },
    ],
    afterFavorite: [
      downloadsEnabled && isAuthenticated && track?.download_url && !isMobile && {
        key: 'download', icon: '⬇', label: 'Download', onClick: () => { window.location.href = track.download_url; },
      },
    ],
  });
  const ctxMenu = useContextMenu({ shouldIgnore });

  useEffect(() => {
    // Lets the footer play button fall back to "Play Now" behavior when the
    // playlist is empty, matching Album.jsx/Artist.jsx's usage of setPageTracks.
    setPageTracks(track ? [track] : []);
    return () => setPageTracks([]);
  }, [track, setPageTracks]);

  const handlePlayNow = () => {
    if (!track) return;
    addTrack(track, { flashActivity: true }); // store auto-starts playback if idle
  };

  // A logged-out visitor can view and play the shared track itself (the
  // whole point of sharing), but browsing onward into the catalog via the
  // artist/album name is an account feature here — send them to log in or
  // sign up instead, with return_to pointed back at this track.
  const handleEntityClick = (path) => {
    if (isAuthenticated) {
      navigate(path);
    } else {
      navigate(`/login?return_to=${encodeURIComponent(`${BASENAME}/track/${id}`)}`);
    }
  };

  if (loading) {
    return <Loading message="Loading track" />;
  }

  if (error || !track) {
    return <PageError message={error ? 'Failed to load track' : 'Track not found'} />;
  }

  const isPlaying = Boolean(currentTrack && currentTrack.id === track.id);

  return (
    <div style={{ padding: '.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div className="media-page-header" {...ctxMenu.triggerProps}>
        <div style={{ flexShrink: 0 }}>
          <img
            src={apiService.getImageUrl(track.image_path, 'album_page')}
            alt={track.title}
            className="full-image"
            onClick={() => setShowImageModal(true)}
            style={{ cursor: 'zoom-in' }}
          />
        </div>
        {showImageModal && (
          <ImageLightbox
            imageUrl={apiService.getImageUrl(track.image_path, 'album_page')}
            alt={track.title}
            title={track.title}
            subtitle={track.artist?.name}
            onClose={() => setShowImageModal(false)}
          />
        )}
        <div style={{ flex: 1 }}>
          {/* Reuses Album.jsx's title-row classes (title-row/textblock/actions)
              so this page picks up the same mobile layout for free: title +
              artist + play button share one left-aligned row instead of the
              button getting a separate centered row below everything. */}
          <div className="album-header-title-row">
            <div className="album-header-textblock">
              <h1 className="album-header-title" style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>
                {track.title}
              </h1>
              {track.artist?.name && (
                <h2 className="album-header-artist" style={{ fontSize: '1.5rem', fontWeight: 'normal', margin: '0 0 0.5rem 0' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>by</span>{' '}
                  {track.artist.id ? (
                    <span style={{ cursor: 'pointer', color: '#3b82f6' }} onClick={() => handleEntityClick(`/artist/${track.artist.id}`)}>
                      {track.artist.name}
                    </span>
                  ) : <span style={{ color: '#3b82f6' }}>{track.artist.name}</span>}
                </h2>
              )}
            </div>
            <div className="album-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <PlayButton
                size={48}
                active={isPlaying}
                onClick={handlePlayNow}
                aria-label={isPlaying ? 'Now playing' : 'Play'}
              />
            </div>
          </div>
          {track.album?.title && (
            <p style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', textAlign: 'left' }}>
              <span style={{ color: 'var(--color-text-primary)' }}>from</span>{' '}
              {track.album.id ? (
                <span style={{ cursor: 'pointer', color: '#3b82f6' }} onClick={() => handleEntityClick(`/album/${track.album.id}`)}>
                  {track.album.title}
                </span>
              ) : <span style={{ color: '#3b82f6' }}>{track.album.title}</span>}
            </p>
          )}
        </div>
      </div>

      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        openedViaTouch={ctxMenu.openedViaTouch}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        onClose={ctxMenu.close}
        actions={headerActions}
        testId="track-page-header-menu-backdrop"
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

export default TrackPage;
