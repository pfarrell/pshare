import { useParams } from 'react-router-dom';
import { apiService } from '../../services/api';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestRow from './GuestRow';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';

const GuestCollection = () => {
  const { id } = useParams();
  const { token, path } = useGuest();
  const { data, error, loading, retry, notFound } = useGuestFetch(() => apiService.guestCollection(token, id), [token, id]);

  if (loading || error || notFound || !data) {
    return <GuestStatus loading={loading} error={error} notFound={notFound || (!loading && !error && !data)} onRetry={retry} notFoundMessage="Collection not found." />;
  }

  const { collection, albums } = data;

  return (
    <>
      <div className="jukebox-guest-detail-header">
        <div className="jukebox-guest-detail-text">
          <h1>{collection?.name ?? ''}</h1>
        </div>
        <GuestAddButton itemKey={`collection-${collection?.id}`} label={collection?.name ?? 'collection'} kind="collection" id={collection?.id} variant="all" />
      </div>
      {(albums ?? []).filter(Boolean).map((a) => (
        <GuestRow key={a.id} to={path(`album/${a.id}`)} imageUrl={apiService.getImageUrl(a.image_path, 'album_small')}
          title={a.title ?? ''} subtitle={[a.artist?.name, a.release_year].filter(Boolean).join(' · ')}
          action={<GuestAddButton itemKey={`album-${a.id}`} label={a.title ?? 'album'} kind="album" id={a.id} variant="all" />} />
      ))}
    </>
  );
};

export default GuestCollection;
