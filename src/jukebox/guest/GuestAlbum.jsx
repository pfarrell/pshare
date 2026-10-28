import { useParams, Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { formatDuration } from '../../utils/formatters';
import { mergeAlbumFill } from '../../utils/mergeAlbumFill';
import { SpotifyLogo } from '../../components/OpenInSpotify';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestRow from './GuestRow';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';
import { artistNames, text } from './guestSpotify';

// #72: the album's missing positions filled from Spotify arrive as
// `spotifyFill` (only while the kiosk can play Spotify); they're interleaved
// with the library tracks, kept in their raw /search/spotify shape for adding.
const spotifyRow = (item) => (typeof item?.uri === 'string' && item.uri ? { spotifyItem: item } : null);

const GuestAlbum = () => {
  const { id } = useParams();
  const { token, path } = useGuest();
  const { data, error, loading, retry, notFound } = useGuestFetch(() => apiService.guestAlbum(token, id), [token, id]);

  if (loading || error || notFound || !data) {
    return <GuestStatus loading={loading} error={error} notFound={notFound || (!loading && !error && !data)} onRetry={retry} notFoundMessage="Album not found." />;
  }

  const { album, artist } = data;
  const library = (data.tracks ?? []).filter(Boolean);
  const rows = mergeAlbumFill(library, data.spotifyFill, spotifyRow) ?? [];
  const filled = rows !== library;
  const trackIds = library.map((t) => t.id);
  const items = filled
    ? rows.map((r) => (r.spotifyItem ? { spotifyTrack: r.spotifyItem } : { trackId: r.id }))
    : undefined;
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
        <GuestAddButton itemKey={`album-${album?.id}`} label={album?.title ?? 'album'} trackIds={filled ? undefined : trackIds} items={items} variant="all" />
      </div>
      {rows.map((r) => {
        if (r.spotifyItem) {
          const t = r.spotifyItem;
          const duration = Number(t.durationMs) > 0 ? formatDuration(Number(t.durationMs) / 1000) : '';
          return (
            <GuestRow
              key={t.uri}
              title={text(t.name)}
              subtitle={<>{[artistNames(t.artists), duration].filter(Boolean).join(' · ')}<SpotifyLogo className="jukebox-guest-spotify-marker" /></>}
              action={<GuestAddButton itemKey={`spotify-track-${t.uri}`} label={text(t.name) || 'track'} spotifyTracks={[t]} />}
            />
          );
        }
        return (
          <GuestRow
            key={r.id}
            title={r.title ?? ''}
            subtitle={[r.artist?.name, r.duration ? formatDuration(r.duration) : ''].filter(Boolean).join(' · ')}
            action={<GuestAddButton itemKey={`track-${r.id}`} label={r.title ?? 'track'} trackIds={[r.id]} />}
          />
        );
      })}
    </>
  );
};

export default GuestAlbum;
