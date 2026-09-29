import { useParams } from 'react-router-dom';
import { apiService } from '../../services/api';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestTrackList from './GuestTrackList';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';

const GuestPlaylist = () => {
  const { id } = useParams();
  const { token } = useGuest();
  const { data, error, loading, retry, notFound } = useGuestFetch(() => apiService.guestPlaylist(token, id), [token, id]);

  if (loading || error || notFound || !data) {
    return <GuestStatus loading={loading} error={error} notFound={notFound || (!loading && !error && !data)} onRetry={retry} notFoundMessage="Playlist not found." />;
  }

  const { playlist, tracks } = data;
  const trackIds = (tracks ?? []).filter(Boolean).map((t) => t.id);

  return (
    <>
      <div className="jukebox-guest-detail-header">
        <div className="jukebox-guest-detail-text">
          <h1>{playlist?.name ?? ''}</h1>
          <span className="jukebox-guest-detail-meta">{trackIds.length} {trackIds.length === 1 ? 'track' : 'tracks'}</span>
        </div>
        <GuestAddButton itemKey={`playlist-${playlist?.id}`} label={playlist?.name ?? 'playlist'} trackIds={trackIds} variant="all" />
      </div>
      <GuestTrackList tracks={tracks} />
    </>
  );
};

export default GuestPlaylist;
