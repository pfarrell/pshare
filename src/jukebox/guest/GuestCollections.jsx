import { apiService } from '../../services/api';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestRow from './GuestRow';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';

const GuestCollections = () => {
  const { token, path } = useGuest();
  const { data, error, loading, retry, notFound } = useGuestFetch(() => apiService.guestCollections(token), [token]);
  const items = data ?? [];
  const cover = (p) => p.image_path ?? p.preview_albums?.[0]?.image_path ?? null;

  return (
    <>
      <h1 className="jukebox-guest-heading">Collections</h1>
      <GuestStatus loading={loading} error={error} notFound={notFound} onRetry={retry} />
      {!loading && !error && !notFound && items.length === 0 && <div className="jukebox-guest-message">No collections yet.</div>}
      {items.map((p) => (
        <GuestRow key={p.id} to={path(`collection/${p.id}`)} imageUrl={apiService.getImageUrl(cover(p), 'album_small')}
          title={p.name ?? ''}
          action={<GuestAddButton itemKey={`collection-${p.id}`} label={p.name ?? 'collection'} kind="collection" id={p.id} variant="all" />} />
      ))}
    </>
  );
};

export default GuestCollections;
