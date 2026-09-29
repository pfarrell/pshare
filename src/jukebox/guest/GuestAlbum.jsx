import { useParams, Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestTrackList from './GuestTrackList';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';

const GuestAlbum = () => {
  const { id } = useParams();
  const { token, path } = useGuest();
  const { data, error, loading, retry, notFound } = useGuestFetch(() => apiService.guestAlbum(token, id), [token, id]);

  if (loading || error || notFound || !data) {
    return <GuestStatus loading={loading} error={error} notFound={notFound || (!loading && !error && !data)} onRetry={retry} notFoundMessage="Album not found." />;
  }

  const { album, artist, tracks } = data;
  const trackIds = (tracks ?? []).filter(Boolean).map((t) => t.id);
  const imageUrl = apiService.getImageUrl(album?.image_path, 'album_page');

  return (
    <>
      <div className="jukebox-guest-detail-header">
        {imageUrl && <img className="jukebox-guest-detail-art" src={imageUrl} alt="" />}
        <div className="jukebox-guest-detail-text">
          <h1>{album?.title ?? ''}</h1>
          {artist?.id != null && <Link to={path(`artist/${artist.id}`)}>{artist.name ?? ''}</Link>}
          {album?.release_year ? <span className="jukebox-guest-detail-meta">{album.release_year}</span> : null}
        </div>
        <GuestAddButton itemKey={`album-${album?.id}`} label={album?.title ?? 'album'} trackIds={trackIds} variant="all" />
      </div>
      <GuestTrackList tracks={tracks} />
    </>
  );
};

export default GuestAlbum;
