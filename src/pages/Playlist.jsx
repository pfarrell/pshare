// src/pages/Playlist.jsx
import { useEffect, useState } from 'react';
import ImageLightbox from '../components/ImageLightbox';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import Track from '../components/Track';
import Loading from '../components/Loading';
import Retry from '../components/Retry';
import PlayActionsMenu from '../components/PlayActionsMenu';
import CoverCollage from '../components/CoverCollage';
import ContextMenu from '../components/ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import { useFavoritesStore } from '../stores/favoritesStore';
import { shareLink } from '../utils/shareLink';
import { formatCount } from '../utils/formatters';

export default function Playlist() {
  const { id } = useParams();
  const navigate = useNavigate();
  const addTracks = usePlayerStore((s) => s.addTracks);
  const setPlaylist = usePlayerStore((s) => s.setPlaylist);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const setPageTracks = usePlayerStore((s) => s.setPageTracks);
  const { user, isAdmin, isAuthenticated } = useAuthStore();
  const [playlistData, setPlaylistData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const isFavorite = useFavoritesStore((s) => s.isFavorite('playlist', parseInt(id)));
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const ctxMenu = useContextMenu({ shouldIgnore: (e) => !isAuthenticated || e.target.tagName === 'A' || !!e.target.closest('button') });

  const handleToggleFavorite = () => {
    if (!playlistData?.playlist) return;
    const { playlist: p } = playlistData;
    toggleFavorite('playlist', p.id, { id: p.id, name: p.name, image_path: p.image_path, track_count: playlistData.tracks?.length });
    ctxMenu.close();
  };

  useEffect(() => {
    loadPlaylist();
  }, [id]);

  useEffect(() => {
    // Lets the footer play button fall back to "Play Now" behavior when the playlist is
    // empty, instead of trying to resume a track that was never loaded.
    setPageTracks(playlistData?.tracks || []);
    return () => setPageTracks([]);
  }, [playlistData, setPageTracks]);

  const loadPlaylist = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getPlaylist(id);
      const { playlist, tracks } = response.data;
      setPlaylistData({
        ...response.data,
        tracks: (tracks || []).map((track) => ({
          ...track,
          source_playlist: { id: playlist.id, name: playlist.name },
        })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAll = () => {
    if (!playlistData?.tracks?.length) return;
    addTracks(playlistData.tracks, false, { flashActivity: true }); // store auto-starts playback if idle
  };

  const handlePlayNow = () => {
    if (!playlistData?.tracks?.length) return;
    setPlaylist(playlistData.tracks);
  };

  const handlePlayNext = () => {
    if (!playlistData?.tracks?.length) return;
    addTracks(playlistData.tracks, true, { flashActivity: true });
  };

  const handleAddToQueue = () => {
    if (!playlistData?.tracks?.length) return;
    addTracks(playlistData.tracks, false, { flashActivity: true });
  };

  if (loading) return <Loading />;
  if (error) return <Retry message={error} onRetry={loadPlaylist} />;
  if (!playlistData) return <div>Playlist not found</div>;

  const { playlist, tracks } = playlistData;
  // Show edit button if user is admin OR if user owns the playlist
  const canEdit = isAdmin || (user && playlist.user_id === user.id);

  // Distinct albums (by id, in track order) among this playlist's tracks that
  // have a cover — feeds the collage fallback when the playlist has no custom image.
  const albumCoverItems = [];
  const seenAlbumIds = new Set();
  for (const t of tracks || []) {
    const albumId = t.album?.id;
    if (albumId == null || seenAlbumIds.has(albumId) || !t.image_path) continue;
    seenAlbumIds.add(albumId);
    albumCoverItems.push({ id: albumId, image_path: t.image_path });
    if (albumCoverItems.length >= 4) break;
  }

  return (
    <div style={{ padding: '2rem', backgroundColor: 'var(--color-bg-surface-muted)', minHeight: '100%' }}>
      {/* Playlist Header */}
      <div
        style={{
          display: 'flex',
          gap: '2rem',
          marginBottom: '2rem',
          backgroundColor: 'var(--color-bg-surface)',
          padding: '2rem',
          borderRadius: '0.5rem',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}
        {...ctxMenu.triggerProps}
      >
        {/* Playlist Image */}
        <div style={{ flexShrink: 0, width: '200px', height: '200px', borderRadius: '0.5rem', overflow: 'hidden' }}>
          <CoverCollage
            imagePath={playlist.image_path}
            items={albumCoverItems}
            alt={playlist.name}
            onImageClick={playlist.image_path ? () => setShowImageModal(true) : undefined}
            placeholderGlyph="♪"
            imageContext="album_page"
          />
        </div>

        {/* Playlist Info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: 0, color: 'var(--color-text-primary)' }}>
              {playlist.name}
            </h1>
          </div>

          <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
            {formatCount(tracks?.length || 0, 'track')}
          </p>

          {/* Action Buttons */}
          <PlayActionsMenu
            onPlay={handlePlayAll}
            onPlayNow={handlePlayNow}
            onPlayNext={handlePlayNext}
            onAddToQueue={handleAddToQueue}
            disabled={!tracks?.length}
            overflowActions={[
              canEdit && { key: 'edit', icon: '✎', label: 'Edit', onClick: () => navigate(`/admin/playlist/${id}`) },
              isAuthenticated && {
                key: 'favorite',
                icon: isFavorite ? '★' : '☆',
                label: isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
                onClick: handleToggleFavorite,
              },
              isAuthenticated && { key: 'share', icon: '📤', label: 'Share', onClick: () => shareLink({ title: playlist.name, text: `${playlist.name} playlist` }) },
            ].filter(Boolean)}
          />
        </div>
      </div>

      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        testId="playlist-header-menu-backdrop"
      >
        {canEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); ctxMenu.close(); navigate(`/admin/playlist/${id}`); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); ctxMenu.close(); navigate(`/admin/playlist/${id}`); }}
          >
            ✎ Edit
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
        {isAuthenticated && (
          <button
            onClick={(e) => { e.stopPropagation(); ctxMenu.close(); shareLink({ title: playlist.name, text: `${playlist.name} playlist` }); }}
            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); ctxMenu.close(); shareLink({ title: playlist.name, text: `${playlist.name} playlist` }); }}
          >
            📤 Share
          </button>
        )}
      </ContextMenu>

      {showImageModal && playlist.image_path && (
        <ImageLightbox
          imageUrl={apiService.getImageUrl(playlist.image_path, 'album_page')}
          alt={playlist.name}
          title={playlist.name}
          onClose={() => setShowImageModal(false)}
        />
      )}

      {/* Tracks List */}
      <div style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: '0.5rem',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        overflowX: 'hidden',
        overflowY: 'visible'
      }}>
        {tracks && tracks.length > 0 ? (
          tracks.map((track, index) => (
            <Track
              key={track.id}
              track={track}
              index={index}
              trackCount={tracks.length}
              includeMeta={true}
              isPlaying={currentTrack?.id === track.id}
              showEdit={isAdmin}
            />
          ))
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            This playlist is empty
          </div>
        )}
      </div>
    </div>
  );
}
