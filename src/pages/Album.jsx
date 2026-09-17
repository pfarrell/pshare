// src/pages/Album.jsx
import { useEffect, useState } from 'react';
import ImageLightbox from '../components/ImageLightbox';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import Track from '../components/Track';
import Loading from '../components/Loading';
import PageError from '../components/PageError';
import TagsSection from '../components/TagsSection';
import NotesSection from '../components/NotesSection';
import CompilationArtistLinks from '../components/CompilationArtistLinks';
import AboutSection from '../components/AboutSection';
import PlayActionsMenu from '../components/PlayActionsMenu';
import AddToCollectionModal from '../components/AddToCollectionModal';
import ContextMenu from '../components/ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useOvertoneAction } from '../hooks/useOvertoneAction';
import { shareLink } from '../utils/shareLink';

const Album = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const collectionId = location.state?.collectionId ?? null;
  const addTracks = usePlayerStore((s) => s.addTracks);
  const setPlaylist = usePlayerStore((s) => s.setPlaylist);
  const setCollectionContext = usePlayerStore((s) => s.setCollectionContext);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const setPageTracks = usePlayerStore((s) => s.setPageTracks);
  const { isAdmin, isAuthenticated } = useAuthStore();
  const [albumData, setAlbumData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [adjacentAlbums, setAdjacentAlbums] = useState({ prev: null, next: null });
  const isFavorite = useFavoritesStore((s) => s.isFavorite('album', parseInt(id)));
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const { overflowAction: overtoneAction, modal: overtoneModal } = useOvertoneAction(albumData?.album?.musicbrainz_id, 'release');
  // Edit/Add to Collection/Favorite/Share are all account-gated, so unless
  // Overtone applies (musicbrainz_id present — no login needed for that one),
  // a logged-out visitor's long-press would open an empty menu. Suppress it
  // entirely in that case rather than popping up nothing.
  const ctxMenu = useContextMenu({ shouldIgnore: (e) => (!isAuthenticated && !overtoneAction) || e.target.tagName === 'A' || !!e.target.closest('button') });

  useEffect(() => {
    const fetchAlbumData = async () => {
      try {
        setLoading(true);
        const response = await apiService.getAlbum(id);
        console.log('Album API Response:', response.data);
        setAlbumData(response.data);
      } catch (error) {
        console.error('Error fetching album data:', error);
        setError('Failed to load album');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchAlbumData();
    }
  }, [id, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    apiService.getAdjacentAlbums(id, collectionId)
      .then((response) => {
        if (!cancelled) setAdjacentAlbums(response.data);
      })
      .catch((error) => {
        console.error('Error fetching adjacent albums:', error);
        if (!cancelled) setAdjacentAlbums({ prev: null, next: null });
      });
    return () => { cancelled = true; };
  }, [id, collectionId]);

  const goToAdjacentAlbum = (albumId) => {
    navigate(`/album/${albumId}`, collectionId ? { state: { collectionId } } : undefined);
  };

  useEffect(() => {
    // Lets the footer play button fall back to "Play Now" behavior when the playlist is
    // empty, instead of trying to resume a track that was never loaded.
    setPageTracks(albumData?.tracks || []);
    return () => setPageTracks([]);
  }, [albumData, setPageTracks]);

  const reload = () => {
    setRefreshKey(refreshKey + 1)
  }

  // Whenever this album is played from a collection, tag the queue with that
  // context so usePlayerEngine can auto-advance into the collection's next
  // album once playback naturally runs out.
  const tagCollectionContext = () => {
    if (collectionId) {
      setCollectionContext({ collectionId, albumId: album.id });
    }
  };

  const handlePlay = () => {
    if (albumData?.tracks) {
      addTracks(albumData.tracks, false, { flashActivity: true }); // store auto-starts playback if idle
      tagCollectionContext();
    }
  };

  const handlePlayNow = () => {
    if (albumData?.tracks) {
      setPlaylist(albumData.tracks);
      tagCollectionContext();
    }
  };

  const handlePlayNext = () => {
    if (albumData?.tracks) {
      addTracks(albumData.tracks, true, { flashActivity: true }); // store auto-starts playback if idle
      tagCollectionContext();
    }
  };

  const handleAddToQueue = () => {
    if (albumData?.tracks) {
      addTracks(albumData.tracks, false, { flashActivity: true }); // store auto-starts playback if idle
      tagCollectionContext();
    }
  };

  const handleToggleFavorite = () => {
    if (!albumData?.album) return;
    toggleFavorite('album', album.id, {
      id: album.id,
      title: album.title,
      image_path: album.image_path,
      track_count: tracks?.length,
      artist: artist ? { id: artist.id, name: artist.name } : null,
    });
    ctxMenu.close();
  };

  const handleMadeSingle = (trackId) => {
    setAlbumData((d) => ({ ...d, tracks: d.tracks.filter((t) => t.id !== trackId) }));
  };

  // Helper function to check if a track is currently playing
  const isTrackPlaying = (track) => {
    return currentTrack && currentTrack.id === track.id;
  };

  if (loading) {
    return <Loading message="Loading album" />;
  }

  if (error || !albumData?.album) {
    return <PageError message={error || 'Album not found'} />;
  }

  const { artist, album, tracks, summary, secondary_artists, compilation_artists, collections, notes } = albumData;

  // Collaborators are folded into the primary artist heading itself
  // ("Elton John, Ray Charles"); every other non-primary role (featured,
  // guest, compilation) stays in the smaller "Also featuring" line below.
  const collaborators = (secondary_artists || []).filter((sa) => sa.role === 'collaborator');
  const featuringArtists = album.is_compilation
    ? (compilation_artists || [])
    : (secondary_artists || []).filter((sa) => sa.role !== 'collaborator');

  return (
    <div style={{ padding: '.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Album Header */}
      <div className='media-page-header' {...ctxMenu.triggerProps}>
        {/* Album Cover */}
        <div style={{ flexShrink: 0 }}>
          <img
            src={apiService.getImageUrl(album.image_path, 'album_page')}
            alt={`${album.title} by ${artist.name}`}
            className='full-image'
            onClick={() => setShowAlbumModal(true)}
            style={{ cursor: 'zoom-in' }}
            onError={(e) => {
              console.log(`Failed to load album image: ${e.target.src}`);
            }}
          />
        </div>
        {showAlbumModal && (
          <ImageLightbox
            imageUrl={apiService.getImageUrl(album.image_path, 'album_page')}
            alt={`${album.title} by ${artist.name}`}
            title={album.title}
            subtitle={artist.name}
            onClose={() => setShowAlbumModal(false)}
          />
        )}
        
        {/* Album Info */}
        <div className="album-info" style={{ flex: 1 }}>
          <div className="album-header-title-row">
            <div className="album-header-textblock">
              <h1 className="album-header-title" style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>
                {album.title}
              </h1>

              <h2 className="album-header-artist" style={{ fontSize: '1.5rem', fontWeight: 'normal', margin: '0 0 0.5rem 0' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>by</span>{' '}
                <span style={{ cursor: 'pointer', color: '#3b82f6' }} onClick={() => navigate(`/artist/${artist.id}`)}>
                  {artist.name}
                </span>
                {collaborators.map((c) => (
                  <span key={c.id}>
                    {', '}
                    <span style={{ cursor: 'pointer', color: '#3b82f6' }} onClick={() => navigate(`/artist/${c.id}`)}>
                      {c.name}
                    </span>
                  </span>
                ))}
              </h2>
            </div>

            {/* Action Buttons */}
            <div className="album-header-actions" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <PlayActionsMenu
                onPlay={handlePlay}
                onPlayNow={handlePlayNow}
                onPlayNext={handlePlayNext}
                onAddToQueue={handleAddToQueue}
                overflowActions={[
                  isAdmin && { key: 'edit', icon: '✎', label: 'Edit', onClick: () => navigate(`/admin/album/${id}`) },
                  isAuthenticated && { key: 'collection', icon: '▣', label: 'Add to Collection', onClick: () => setShowCollectionModal(true) },
                  isAuthenticated && {
                    key: 'favorite',
                    icon: isFavorite ? '★' : '☆',
                    label: isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
                    onClick: handleToggleFavorite,
                  },
                  overtoneAction,
                  isAuthenticated && { key: 'share', icon: '📤', label: 'Share', onClick: () => shareLink({ title: album.title, text: `${album.title} by ${artist.name}` }) },
                ].filter(Boolean)}
              />
              {overtoneModal}
            </div>
          </div>
          {featuringArtists.length > 0 && (
            <p className="album-header-featuring" style={{ fontSize: '0.95rem', margin: '0 0 1rem 0', color: 'var(--color-text-muted)' }}>
              {album.is_compilation ? 'Featuring:' : 'Also featuring:'}{' '}
              <CompilationArtistLinks
                artists={featuringArtists}
                mobileVisibleCount={album.is_compilation ? 5 : undefined}
              />
            </p>
          )}
          {collections?.length > 0 && (
            <p className="album-header-collections" style={{ fontSize: '0.95rem', margin: '0 0 1rem 0', color: 'var(--color-text-muted)' }}>
              In collections:{' '}
              {collections.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ', '}
                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate(`/collection/${c.id}`)}>
                    {c.name}
                  </span>
                </span>
              ))}
            </p>
          )}

          {(adjacentAlbums.prev || adjacentAlbums.next) && (
            <div className="album-header-adjacent-nav" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', margin: '0 0 1rem 0', fontSize: '0.95rem' }}>
              <div style={{ textAlign: 'left' }}>
                {adjacentAlbums.prev && (
                  <span style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }} onClick={() => goToAdjacentAlbum(adjacentAlbums.prev.id)}>
                    ‹ {adjacentAlbums.prev.title}
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                {adjacentAlbums.next && (
                  <span style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }} onClick={() => goToAdjacentAlbum(adjacentAlbums.next.id)}>
                    {adjacentAlbums.next.title} ›
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="album-header-about">
            <AboutSection
              heading="About this album"
              summary={summary}
            />
          </div>

          {/* Album Description */}
          {album.description && (
            <div className="album-header-description">
              <p style={{ lineHeight: '1.6', color: 'var(--color-text-secondary)', margin: '0 0 1rem 0' }}>
                {album.description}
              </p>
            </div>
          )}
        </div>
      </div>

      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        testId="album-header-menu-backdrop"
      >
        {isAdmin && (
          <button
            onClick={(e) => { e.stopPropagation(); ctxMenu.close(); navigate(`/admin/album/${id}`); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); ctxMenu.close(); navigate(`/admin/album/${id}`); }}
          >
            ✎ Edit
          </button>
        )}
        {isAuthenticated && (
          <button
            onClick={(e) => { e.stopPropagation(); ctxMenu.close(); setShowCollectionModal(true); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); ctxMenu.close(); setShowCollectionModal(true); }}
          >
            ▣ Add to Collection
          </button>
        )}
        {isAuthenticated && (
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleFavorite(); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleToggleFavorite(); }}
          >
            {isFavorite ? '★ Remove from Favorites' : '☆ Add to Favorites'}
          </button>
        )}
        {overtoneAction && (
          <button
            onClick={(e) => { e.stopPropagation(); ctxMenu.close(); overtoneAction.onClick(); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); ctxMenu.close(); overtoneAction.onClick(); }}
          >
            {overtoneAction.icon} {overtoneAction.label}
          </button>
        )}
        {isAuthenticated && (
          <button
            onClick={(e) => { e.stopPropagation(); ctxMenu.close(); shareLink({ title: album.title, text: `${album.title} by ${artist.name}` }); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); ctxMenu.close(); shareLink({ title: album.title, text: `${album.title} by ${artist.name}` }); }}
          >
            📤 Share
          </button>
        )}
      </ContextMenu>

      {showCollectionModal && (
        <AddToCollectionModal
          album={album}
          onClose={() => setShowCollectionModal(false)}
        />
      )}

      {/* Track List */}
      <div style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        overflowX: 'hidden',
        overflowY: 'visible'
      }}>
        {tracks.map((track, index) => (
          <Track
            key={track.id || index}
            track={track}
            index={index}
            trackCount={tracks.length}
            isPlaying={isTrackPlaying(track)}
            showMakeSingle={isAdmin}
            showEdit={isAdmin}
            onMadeSingle={handleMadeSingle}
          />
        ))}
      </div>

      <TagsSection entityType="album" entityId={parseInt(id)} isLoggedIn={isAdmin} />
      <NotesSection entityType="album" entityId={parseInt(id)} notes={notes || []} isLoggedIn={isAuthenticated} onChange={reload} />
    </div>
  );
};

export default Album;
