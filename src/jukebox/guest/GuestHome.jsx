import { useState } from 'react';
import { apiService } from '../../services/api';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestRow from './GuestRow';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';
import { plural } from './plural';

const GuestHome = () => {
  const { token, path } = useGuest();
  const [mode, setMode] = useState('artists');
  const { data, error, loading, retry, notFound } = useGuestFetch(() => apiService.guestHome(token, mode), [token, mode]);

  return (
    <>
      <div className="jukebox-guest-toggle" role="group" aria-label="Home view">
        {['artists', 'albums'].map((m) => (
          <button key={m} type="button" className={mode === m ? 'active' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m === 'artists' ? 'Artists' : 'Albums'}
          </button>
        ))}
      </div>
      <GuestStatus loading={loading} error={error} notFound={notFound} onRetry={retry}
        notFoundMessage="This link is no longer valid. Scan the code on the jukebox again." />
      {(data ?? []).map((item) => (mode === 'albums' ? (
        <GuestRow key={item.id} to={path(`album/${item.id}`)} imageUrl={apiService.getImageUrl(item.image_path, 'album_small')}
          title={item.title ?? ''} subtitle={item.artist?.name ?? ''}
          action={<GuestAddButton itemKey={`album-${item.id}`} label={item.title ?? 'album'} kind="album" id={item.id} variant="all" />} />
      ) : (
        <GuestRow key={item.id} to={path(`artist/${item.id}`)} imageUrl={apiService.getImageUrl(item.image_path, 'artist_search')}
          title={item.name ?? ''} subtitle={plural(item.album_count, 'album')}
          action={<GuestAddButton itemKey={`artist-${item.id}`} label={item.name ?? 'artist'} kind="artist" id={item.id} variant="all" />} />
      )))}
    </>
  );
};

export default GuestHome;
