import { useParams } from 'react-router-dom';
import { apiService } from '../../services/api';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestRow from './GuestRow';
import GuestTrackList from './GuestTrackList';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';

const GuestArtist = () => {
  const { id } = useParams();
  const { token, path } = useGuest();
  const { data, error, loading, retry, notFound } = useGuestFetch(() => apiService.guestArtist(token, id), [token, id]);

  if (loading || error || notFound || !data) {
    return <GuestStatus loading={loading} error={error} notFound={notFound || (!loading && !error && !data)} onRetry={retry} notFoundMessage="Artist not found." />;
  }

  const { artist, albums, singles } = data;
  const imageUrl = apiService.getImageUrl(artist?.image_path, 'artist_page');

  return (
    <>
      <div className="jukebox-guest-detail-header">
        {imageUrl && <img className="jukebox-guest-detail-art" src={imageUrl} alt="" />}
        <div className="jukebox-guest-detail-text">
          <h1>{artist?.name ?? ''}</h1>
        </div>
        <GuestAddButton itemKey={`artist-${artist?.id}`} label={artist?.name ?? 'artist'} kind="artist" id={artist?.id} variant="all" />
      </div>

      {(albums ?? []).length > 0 && <h2 className="jukebox-guest-heading">Albums</h2>}
      {(albums ?? []).filter(Boolean).map((a) => (
        <GuestRow key={a.id} to={path(`album/${a.id}`)} imageUrl={apiService.getImageUrl(a.image_path, 'album_small')}
          title={a.title ?? ''} subtitle={a.release_year ?? ''}
          action={<GuestAddButton itemKey={`album-${a.id}`} label={a.title ?? 'album'} kind="album" id={a.id} variant="all" />} />
      ))}

      {(singles ?? []).length > 0 && <h2 className="jukebox-guest-heading">Singles</h2>}
      <GuestTrackList tracks={singles} />
    </>
  );
};

export default GuestArtist;
