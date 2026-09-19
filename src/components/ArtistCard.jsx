// src/components/ArtistCard.jsx
import { formatCount } from '../utils/formatters';
import EntityCard from './EntityCard';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';
import { useQueueActions } from '../hooks/useQueueActions';

const ArtistCard = ({ artist, onClick, imageUrl }) => {
  const { isAuthenticated } = useAuthStore();
  const favorite = useFavoriteToggle('artist', artist);
  const albumCount = formatCount(artist.album_count || null, 'album');
  const queue = useQueueActions(
    () => apiService.getRandomScopeTracks('artist', artist.id).then((response) => response.data.tracks),
    { queueSource: { type: 'artist', id: artist.id }, errorLabel: 'Failed to play artist' }
  );

  return (
    <EntityCard
      title={artist.name}
      imageUrl={imageUrl}
      imageShape="circle"
      listSubtitle="Artist"
      onClick={() => onClick(artist)}
      play={{
        loading: queue.loading,
        onPlay: queue.play,
        onPlayNext: queue.playNext,
        onAddToQueue: queue.addToQueue,
        label: `Play ${artist.name}`,
      }}
      cardFooter={albumCount && (
        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)', margin: '0.125rem 0 0 0' }}>{albumCount}</p>
      )}
      actions={[isAuthenticated && { key: 'favorite', icon: favorite.icon, label: favorite.label, onClick: favorite.toggle }]}
      menuTestId="artist-card-menu-backdrop"
    />
  );
};

export default ArtistCard;
