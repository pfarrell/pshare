// src/components/ArtistCard.jsx
import { formatCount } from '../utils/formatters';
import EntityCard from './EntityCard';
import { useAuthStore } from '../stores/authStore';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';

const ArtistCard = ({ artist, onClick, imageUrl }) => {
  const { isAuthenticated } = useAuthStore();
  const favorite = useFavoriteToggle('artist', artist);
  const albumCount = formatCount(artist.album_count || null, 'album');

  return (
    <EntityCard
      title={artist.name}
      imageUrl={imageUrl}
      imageShape="circle"
      listSubtitle="Artist"
      onClick={() => onClick(artist)}
      cardFooter={albumCount && (
        <p style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)', margin: '0.125rem 0 0 0' }}>{albumCount}</p>
      )}
      actions={[isAuthenticated && { key: 'favorite', icon: favorite.icon, label: favorite.label, onClick: favorite.toggle }]}
      menuTestId="artist-card-menu-backdrop"
    />
  );
};

export default ArtistCard;
