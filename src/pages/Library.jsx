// src/pages/Library.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { usePlayerStore } from '../stores/playerStore';
import ArtistCard from '../components/ArtistCard';
import AlbumCard from '../components/AlbumCard';
import Track from '../components/Track';
import PlaylistResultCard from '../components/PlaylistResultCard';
import CollectionResultCard from '../components/CollectionResultCard';
import Loading from '../components/Loading';
import CardGrid from '../components/CardGrid';

const TABS = [
  { kind: 'artist', label: 'Artists' },
  { kind: 'album', label: 'Albums' },
  { kind: 'track', label: 'Tracks' },
  { kind: 'playlist', label: 'Playlists' },
  { kind: 'collection', label: 'Collections' },
];

const Library = () => {
  const navigate = useNavigate();
  const { items, loading, loaded, load } = useFavoritesStore();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const { isAdmin } = useAuthStore();
  const [activeKind, setActiveKind] = useState('artist');

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  if (loading && !loaded) return <Loading />;

  const itemsForKind = items.filter((f) => f.kind === activeKind && f.item);
  const activeTab = TABS.find((t) => t.kind === activeKind);

  return (
    <div style={{ padding: '2rem', paddingBottom: '8rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            onClick={() => setActiveKind(tab.kind)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '999px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              backgroundColor: activeKind === tab.kind ? '#7c3aed' : 'var(--color-border)',
              color: activeKind === tab.kind ? 'white' : 'var(--color-text-secondary)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {itemsForKind.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
          <p style={{ fontSize: '1.125rem' }}>No favorite {activeTab.label.toLowerCase()} yet.</p>
        </div>
      ) : activeKind === 'track' ? (
        <div>
          {itemsForKind.map((f, index) => (
            <Track
              key={f.item.id}
              track={f.item}
              index={index}
              trackCount={itemsForKind.length}
              layout="row"
              isPlaying={currentTrack?.id === f.item.id}
              showEdit={isAdmin}
            />
          ))}
        </div>
      ) : (
        <div className="artist-grid">
          <CardGrid>
            {itemsForKind.map((f) => {
              if (activeKind === 'artist') {
                return (
                  <ArtistCard
                    key={f.item.id}
                    artist={f.item}
                    imageUrl={apiService.getImageUrl(f.item.image_path, 'artist_search')}
                    onClick={(a) => navigate(`/artist/${a.id}`)}
                  />
                );
              }
              if (activeKind === 'album') {
                return (
                  <AlbumCard
                    key={f.item.id}
                    album={f.item}
                    artist={f.item.artist}
                    imageUrl={apiService.getImageUrl(f.item.image_path, 'album_small')}
                    onClick={(a) => navigate(`/album/${a.id}`)}
                  />
                );
              }
              if (activeKind === 'playlist') {
                return (
                  <PlaylistResultCard
                    key={f.item.id}
                    playlist={f.item}
                    imageUrl={apiService.getImageUrl(f.item.image_path, 'album_small')}
                    onClick={(p) => navigate(`/playlist/${p.id}`)}
                  />
                );
              }
              return (
                <CollectionResultCard
                  key={f.item.id}
                  collection={f.item}
                  imageUrl={apiService.getImageUrl(f.item.image_path, 'album_small')}
                  onClick={(cn) => navigate(`/collection/${cn.id}`)}
                />
              );
            })}
          </CardGrid>
        </div>
      )}
    </div>
  );
};

export default Library;
