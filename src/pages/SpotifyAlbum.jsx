// src/pages/SpotifyAlbum.jsx
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { apiService } from '../services/api';
import Loading from '../components/Loading';
import OpenInSpotify from '../components/OpenInSpotify';
import { useQueueActions } from '../hooks/useQueueActions';
import { useSpotifyPlayability } from '../player/spotify/useCanPlaySpotify';
import { toSpotifyQueueTrack } from '../utils/trackSource';
import { formatDuration } from '../utils/formatters';

// A Spotify album the library doesn't own (#72), laid out like the Album page:
// cover, title, artist, year, Play/Add for the whole album and per track.
// Reached from the artist page grid; anything unplayable shows a quiet empty
// state rather than an error (there is no error boundary).
const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/;
const UNAVAILABLE = "This album isn't available right now.";
const FALLBACK_COVER = `${import.meta.env.BASE_URL}icons/icon-512.png`;
const text = (v) => (typeof v === 'string' ? v : '');

const QueueButtons = ({ source, name }) => {
  const { loading, play, addToQueue } = useQueueActions(source, { errorLabel: 'Failed to queue Spotify tracks' });
  return (
    <span className="spotify-actions">
      <button type="button" className="spotify-action-btn" disabled={loading} aria-label={`Play ${name}`} onClick={play}>▶</button>
      <button type="button" className="spotify-action-btn" disabled={loading} aria-label={`Add ${name} to queue`} onClick={addToQueue}>+</button>
    </span>
  );
};

const SpotifyAlbum = () => {
  const { spotifyId } = useParams();
  const location = useLocation();
  const localArtistId = location.state?.localArtistId ?? null;
  const year = text(location.state?.year);
  const playability = useSpotifyPlayability();
  const canPlay = playability === 'ready';
  const validId = SPOTIFY_ID.test(spotifyId ?? '');
  const [state, setState] = useState({ id: null, status: 'loading', data: null });

  useEffect(() => {
    if (!validId || !canPlay) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => apiService.getSpotifyAlbumTracks(spotifyId))
      .then((res) => {
        if (cancelled) return;
        const data = res?.data;
        const ok = data?.configured && data.album && Array.isArray(data.tracks);
        setState({ id: spotifyId, status: ok ? 'ready' : 'unavailable', data: ok ? data : null });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Spotify album unavailable:', spotifyId, err);
        setState({ id: spotifyId, status: 'unavailable', data: null });
      });
    return () => { cancelled = true; };
  }, [spotifyId, validId, canPlay]);

  const empty = <p className="spotify-album-unavailable">{UNAVAILABLE}</p>;
  if (!validId || playability === 'unavailable') return empty;
  if (!canPlay) return <Loading />;
  if (state.id !== spotifyId || state.status === 'loading') return <Loading />;
  if (state.status !== 'ready') return empty;

  const { album } = state.data;
  const title = text(album.name);
  const artistName = (Array.isArray(album.artists) ? album.artists : []).map((a) => text(a?.name)).filter(Boolean).join(', ');
  const entries = state.data.tracks.map((t) => ({ raw: t, entry: toSpotifyQueueTrack(t, album) })).filter((x) => x.entry);
  const externalUrl = album.id ? `https://open.spotify.com/album/${album.id}` : null;

  return (
    <div style={{ padding: '.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div className="media-page-header">
        <div style={{ flexShrink: 0 }}>
          <img src={text(album.imageUrl) || FALLBACK_COVER} alt={title} className="full-image" />
        </div>
        <div className="album-info" style={{ flex: 1 }}>
          <div className="album-header-title-row">
            <div className="album-header-textblock">
              <h1 className="album-header-title" style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>
                {title}
              </h1>
              {artistName && (
                <h2 className="album-header-artist" style={{ fontSize: '1.5rem', fontWeight: 'normal', margin: '0 0 0.5rem 0' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>by</span>{' '}
                  {localArtistId != null
                    ? <Link to={`/artist/${localArtistId}`} style={{ color: '#3b82f6' }}>{artistName}</Link>
                    : <span style={{ color: 'var(--color-text-primary)' }}>{artistName}</span>}
                </h2>
              )}
              {year && <p className="spotify-album-year">{year}</p>}
            </div>
            <div className="album-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <QueueButtons source={entries.map((x) => x.entry)} name={title} />
              <OpenInSpotify url={externalUrl} name={title} />
            </div>
          </div>
        </div>
      </div>

      <div className="spotify-album-tracks">
        {entries.map(({ raw, entry }, index) => (
          <div className="spotify-album-track" key={entry.uri || index}>
            <span className="spotify-album-track-number">{index + 1}</span>
            <span className="spotify-album-track-title">{entry.title}</span>
            <span className="spotify-album-track-duration">{raw?.durationMs ? formatDuration(Math.round(raw.durationMs / 1000)) : ''}</span>
            <QueueButtons source={[entry]} name={entry.title} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default SpotifyAlbum;
