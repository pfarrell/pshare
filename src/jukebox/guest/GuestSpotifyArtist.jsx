// src/jukebox/guest/GuestSpotifyArtist.jsx
import { useParams } from 'react-router-dom';
import { apiService } from '../../services/api';
import { mergeArtistAlbums } from '../../utils/mergeArtistAlbums';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestRow from './GuestRow';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';
import { spotifyAlbumTracks, text } from './guestSpotify';

// A Spotify artist for phone guests (#72): every Spotify album, newest first.
// Albums the library owns (localId) open the library album page and add
// library tracks; the rest open the Spotify album page.
const GuestSpotifyArtist = () => {
  const { id } = useParams();
  const { token, path } = useGuest();
  const { data, error, loading, retry, notFound } = useGuestFetch(() => apiService.guestSpotifyArtist(token, id), [token, id]);

  if (loading || error || notFound || !data?.artist) {
    return <GuestStatus loading={loading} error={error} notFound={notFound || (!loading && !error && !data?.artist)} onRetry={retry}
      notFoundMessage="This artist isn't available right now." />;
  }

  const name = text(data.artist.name);
  const albums = mergeArtistAlbums([], (Array.isArray(data.albums) ? data.albums : []).filter((a) => a && a.id));

  return (
    <>
      <div className="jukebox-guest-detail-header">
        {data.artist.imageUrl && <img className="jukebox-guest-detail-art" src={data.artist.imageUrl} alt="" />}
        <div className="jukebox-guest-detail-text">
          <h1>{name}</h1>
          <span className="jukebox-guest-detail-meta">Spotify</span>
        </div>
      </div>
      {albums.length === 0 && <div className="jukebox-guest-message">No albums found.</div>}
      {albums.length > 0 && <h2 className="jukebox-guest-heading">Albums</h2>}
      {albums.map(({ album }) => {
        const owned = Number.isInteger(album.localId);
        const title = text(album.name);
        return (
          <GuestRow key={album.id} to={path(owned ? `album/${album.localId}` : `spotify/album/${album.id}`)}
            imageUrl={album.imageUrl ?? null} title={title} subtitle={text(album.releaseYear)}
            action={owned
              ? <GuestAddButton itemKey={`album-${album.localId}`} label={title || 'album'} kind="album" id={album.localId} variant="all" />
              : <GuestAddButton itemKey={`spotify-album-${album.id}`} label={title || 'album'} spotifyTracks={spotifyAlbumTracks(token, album.id)} variant="all" />} />
        );
      })}
    </>
  );
};

export default GuestSpotifyArtist;
