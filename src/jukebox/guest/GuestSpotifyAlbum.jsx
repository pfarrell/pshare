// src/jukebox/guest/GuestSpotifyAlbum.jsx
import { useParams } from 'react-router-dom';
import { apiService } from '../../services/api';
import { formatDuration } from '../../utils/formatters';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestRow from './GuestRow';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';
import { artistNames, text } from './guestSpotify';

// A Spotify album for phone guests (#72): add a track or the whole album.
// 404 (bad id, or the kiosk can't play Spotify right now) is "not available".
const GuestSpotifyAlbum = () => {
  const { id } = useParams();
  const { token } = useGuest();
  const { data, error, loading, retry, notFound } = useGuestFetch(() => apiService.guestSpotifyAlbum(token, id), [token, id]);

  if (loading || error || notFound || !data?.album) {
    return <GuestStatus loading={loading} error={error} notFound={notFound || (!loading && !error && !data?.album)} onRetry={retry}
      notFoundMessage="This album isn't available right now." />;
  }

  const { album } = data;
  const tracks = (Array.isArray(data.tracks) ? data.tracks : []).filter((t) => t && t.uri);
  const title = text(album.name);

  return (
    <>
      <div className="jukebox-guest-detail-header">
        {album.imageUrl && <img className="jukebox-guest-detail-art" src={album.imageUrl} alt="" />}
        <div className="jukebox-guest-detail-text">
          <h1>{title}</h1>
          {artistNames(album.artists) && <span>{artistNames(album.artists)}</span>}
          <span className="jukebox-guest-detail-meta">Spotify</span>
        </div>
        <GuestAddButton itemKey={`spotify-album-${album.id ?? id}`} label={title || 'album'} spotifyTracks={tracks} variant="all" />
      </div>
      {tracks.map((t) => (
        <GuestRow key={t.uri} title={text(t.name)}
          subtitle={[artistNames(t.artists), t.durationMs ? formatDuration(Math.round(t.durationMs / 1000)) : ''].filter(Boolean).join(' · ')}
          action={<GuestAddButton itemKey={`spotify-track-${t.uri}`} label={text(t.name) || 'track'} spotifyTracks={[t]} />} />
      ))}
    </>
  );
};

export default GuestSpotifyAlbum;
