// src/components/PlaylistResultCard.jsx
import { formatCount } from '../utils/formatters';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import EntityCard from './EntityCard';
import CoverCollage from './CoverCollage';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';
import { useQueueActions } from '../hooks/useQueueActions';

// previewAlbums is only passed by the Playlists list page (its API response
// is the only one that includes it) — that's what scopes the collage to that
// page without affecting Search results or Library/Favorites, which render
// this same card with a plain imageUrl.
const PlaylistResultCard = ({ playlist, onClick, imageUrl, previewAlbums }) => {
  const { isAuthenticated } = useAuthStore();
  const favorite = useFavoriteToggle('playlist', playlist);
  const queue = useQueueActions(
    () => apiService.getPlaylist(playlist.id).then((response) => response.data.tracks.map((track) => ({
      ...track,
      source_playlist: { id: playlist.id, name: playlist.name },
    }))),
    { errorLabel: 'Failed to play playlist' }
  );
  const trackCount = formatCount(playlist.track_count || null, 'track');

  return (
    <EntityCard
      title={playlist.name}
      imageUrl={imageUrl}
      listSubtitle={trackCount ? `Playlist · ${trackCount}` : 'Playlist'}
      listImageContent={(!playlist.image_path && previewAlbums?.length)
        ? <CoverCollage items={previewAlbums} alt={playlist.name} placeholderGlyph="♪" />
        : undefined}
      cardFooter={trackCount && (
        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)', margin: '0.125rem 0 0 0' }}>{trackCount}</p>
      )}
      onClick={() => onClick(playlist)}
      play={{
        loading: queue.loading,
        onPlay: queue.playAll,
        onPlayNow: queue.playNow,
        onPlayNext: queue.playNext,
        onAddToQueue: queue.addToQueue,
        label: `Play ${playlist.name}`,
      }}
      actions={[isAuthenticated && { key: 'favorite', icon: favorite.icon, label: favorite.label, onClick: favorite.toggle }]}
      menuTestId="playlist-card-menu-backdrop"
    />
  );
};

export default PlaylistResultCard;
