// src/pages/Playlists.jsx
import { useEffect, useState } from 'react';
import ImageLightbox from '../components/ImageLightbox';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import Loading from '../components/Loading';
import Retry from '../components/Retry';
import PlaylistResultCard from '../components/PlaylistResultCard';
import CoverCollage from '../components/CoverCollage';
import CardGrid from '../components/CardGrid';
import PlaylistSortToggle from '../components/PlaylistSortToggle';
import { useIsMobile } from '../hooks/useIsMobile';
import { useViewModeStore } from '../stores/viewModeStore';
import { usePlaylistSortStore } from '../stores/playlistSortStore';
import { formatCount } from '../utils/formatters';

const sortPlaylists = (playlists, sortBy) => {
  const sorted = [...playlists];
  if (sortBy === 'alpha') {
    // A playlist can have a null name (one does in prod); with no error
    // boundary an uncaught throw here is a white screen for the whole app.
    sorted.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  } else {
    sorted.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
  return sorted;
};

export default function Playlists() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const viewMode = useViewModeStore((s) => s.mode);
  const sortBy = usePlaylistSortStore((s) => s.sortBy);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoomedPlaylist, setZoomedPlaylist] = useState(null);

  useEffect(() => {
    loadPlaylists();
  }, []);

  const loadPlaylists = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getPlaylists();
      setPlaylists(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <Retry message={error} onRetry={loadPlaylists} />;

  const sortedPlaylists = sortPlaylists(playlists, sortBy);

  return (
    <div style={{ padding: '2rem', paddingBottom: '8rem', maxWidth: '1400px', margin: '0 auto' }}>
      {playlists.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <PlaylistSortToggle />
        </div>
      )}
      {playlists.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
          <p style={{ fontSize: '1.125rem' }}>No playlists found</p>
        </div>
      ) : (isMobile || viewMode === 'list') ? (
        <div className="artist-grid">
          <CardGrid>
            {sortedPlaylists.map((playlist) => (
              <PlaylistResultCard
                key={playlist.id}
                playlist={playlist}
                imageUrl={apiService.getImageUrl(playlist.image_path, 'album_small')}
                previewAlbums={playlist.preview_albums}
                onClick={() => navigate(`/playlist/${playlist.id}`)}
              />
            ))}
          </CardGrid>
        </div>
      ) : (
        <div className="artist-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1.5rem'
        }}>
          {sortedPlaylists.map((playlist) => (
            <div
              key={playlist.id}
              onClick={() => navigate(`/playlist/${playlist.id}`)}
              style={{
                cursor: 'pointer',
                backgroundColor: 'var(--color-bg-surface)',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                overflow: 'hidden',
                transition: 'transform 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              {/* Playlist Image */}
              <div style={{
                width: '100%',
                paddingBottom: '100%',
                position: 'relative',
                backgroundColor: 'var(--color-border)'
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                  <CoverCollage
                    imagePath={playlist.image_path}
                    items={playlist.preview_albums}
                    alt={playlist.name}
                    onImageClick={playlist.image_path ? (e) => { e.stopPropagation(); setZoomedPlaylist(playlist); } : undefined}
                    placeholderGlyph="♪"
                    imageContext="album_small"
                  />
                </div>
              </div>

              {/* Playlist Name */}
              <div style={{ padding: '1rem' }}>
                <h3 style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: 'var(--color-text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {playlist.name}
                </h3>
                {formatCount(playlist.track_count || null, 'track') && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.25rem 0 0 0' }}>
                    {formatCount(playlist.track_count || null, 'track')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {zoomedPlaylist && (
        <ImageLightbox
          imageUrl={apiService.getImageUrl(zoomedPlaylist.image_path, 'album_page')}
          alt={zoomedPlaylist.name}
          title={zoomedPlaylist.name}
          onClose={() => setZoomedPlaylist(null)}
        />
      )}
    </div>
  );
}
