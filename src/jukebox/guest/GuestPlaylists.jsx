import { apiService } from '../../services/api';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestRow from './GuestRow';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';

const GuestPlaylists = () => {
  const { token, path } = useGuest();
  const { data, error, loading, retry, notFound } = useGuestFetch(() => apiService.guestPlaylists(token), [token]);
  const items = data ?? [];
  const cover = (p) => p.image_path ?? p.preview_albums?.[0]?.image_path ?? null;

  return (
    <>
      <h1 className="jukebox-guest-heading">Playlists</h1>
      <GuestStatus loading={loading} error={error} notFound={notFound} onRetry={retry} />
      {!loading && !error && !notFound && items.length === 0 && <div className="jukebox-guest-message">No playlists yet.</div>}
      {items.map((p) => {
        const count = p.track_count ?? 0;
        return (
          <GuestRow key={p.id} to={path(`playlist/${p.id}`)} imageUrl={apiService.getImageUrl(cover(p), 'album_small')}
            title={p.name ?? ''} subtitle={`${count} ${count === 1 ? 'track' : 'tracks'}`}
            action={<GuestAddButton itemKey={`playlist-${p.id}`} label={p.name ?? 'playlist'} kind="playlist" id={p.id} variant="all" />} />
        );
      })}
    </>
  );
};

export default GuestPlaylists;
