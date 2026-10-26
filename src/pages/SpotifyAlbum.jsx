// src/pages/SpotifyAlbum.jsx
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { apiService } from '../services/api';
import Loading from '../components/Loading';
import Track from '../components/Track';
import AboutSection from '../components/AboutSection';
import PlayActionsMenu from '../components/PlayActionsMenu';
import OpenInSpotify, { SpotifyLogo } from '../components/OpenInSpotify';
import { useQueueActions } from '../hooks/useQueueActions';
import { usePlayerStore } from '../stores/playerStore';
import { useSpotifyPlayability } from '../player/spotify/useCanPlaySpotify';
import { toSpotifyQueueTrack, isSpotifyTrack } from '../utils/trackSource';

// A Spotify album the library doesn't own (#72), built from the Album page's
// own parts so it reads as part of P·Share: same header, a Play split button,
// a Wikipedia "About this album" (best guess from the Spotify title, may be
// absent), and the shared Track rows. The artist links to the library artist
// when the library has them, otherwise to the in-app Spotify artist page.
// Anything unplayable shows a quiet empty state (there is no error boundary).
const SPOTIFY_ID = /^[A-Za-z0-9]{1,64}$/;
const UNAVAILABLE = "This album isn't available right now.";
const FALLBACK_COVER = `${import.meta.env.BASE_URL}icons/icon-512.png`;
const text = (v) => (typeof v === 'string' ? v : '');
const linkStyle = { color: '#3b82f6', textDecoration: 'none' };

const ArtistLinks = ({ artists, localArtistId }) => (
  <>
    {artists.map((artist, i) => {
      const name = text(artist?.name);
      // The library artist (if any) is the album's primary one.
      const to = i === 0 && localArtistId != null
        ? `/artist/${localArtistId}`
        : (SPOTIFY_ID.test(text(artist?.id)) ? `/spotify/artist/${artist.id}` : null);
      return (
        <span key={`${artist?.id ?? ''}-${i}`}>
          {i > 0 && ', '}
          {to ? <Link to={to} style={linkStyle}>{name}</Link> : <span style={{ color: 'var(--color-text-primary)' }}>{name}</span>}
        </span>
      );
    })}
  </>
);

const SpotifyAlbum = () => {
  const { spotifyId } = useParams();
  const location = useLocation();
  const playability = useSpotifyPlayability();
  const canPlay = playability === 'ready';
  const validId = SPOTIFY_ID.test(spotifyId ?? '');
  const [state, setState] = useState({ id: null, status: 'loading', data: null });
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  useEffect(() => {
    if (!validId || !canPlay) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => apiService.getSpotifyAlbumDetails(spotifyId))
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

  const ready = state.id === spotifyId && state.status === 'ready';
  const album = ready ? state.data.album : null;
  const entries = ready
    ? state.data.tracks.map((t) => toSpotifyQueueTrack(t, album)).filter(Boolean)
    : [];
  const queue = useQueueActions(entries, { errorLabel: 'Failed to queue Spotify tracks' });

  const empty = <p className="spotify-album-unavailable">{UNAVAILABLE}</p>;
  if (!validId || playability === 'unavailable') return empty;
  if (!canPlay || state.id !== spotifyId || state.status === 'loading') return <Loading />;
  if (!ready) return empty;

  const title = text(album.name);
  const artists = (Array.isArray(album.artists) ? album.artists : []).filter(Boolean);
  const artistName = artists.map((a) => text(a.name)).filter(Boolean).join(', ');
  // Navigation state (from an artist page grid) wins; the response's match covers search/deep links.
  const localArtistId = location.state?.localArtistId ?? state.data.localArtistId ?? null;
  const year = text(album.releaseYear) || text(location.state?.year);
  const meta = [year, text(album.label)].filter(Boolean).join(' · ');
  const externalUrl = album.id ? `https://open.spotify.com/album/${album.id}` : null;
  const playing = (entry) => isSpotifyTrack(currentTrack) && currentTrack.uri === entry.uri;

  return (
    <div style={{ padding: '.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div className="media-page-header">
        <div style={{ flexShrink: 0 }}>
          <img src={text(album.imageUrl) || FALLBACK_COVER} alt={artistName ? `${title} by ${artistName}` : title} className="full-image" />
        </div>
        <div className="album-info" style={{ flex: 1 }}>
          <div className="album-header-title-row">
            <div className="album-header-textblock">
              <h1 className="album-header-title" style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>
                {title}
              </h1>
              {artists.length > 0 && (
                <h2 className="album-header-artist" style={{ fontSize: '1.5rem', fontWeight: 'normal', margin: '0 0 0.5rem 0' }}>
                  <span style={{ color: 'var(--color-text-primary)' }}>by</span>{' '}
                  <ArtistLinks artists={artists} localArtistId={localArtistId} />
                </h2>
              )}
            </div>
            <div className="album-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <PlayActionsMenu
                onPlay={queue.play}
                onPlayNext={queue.playNext}
                onAddToQueue={queue.addToQueue}
                disabled={queue.loading || entries.length === 0}
              />
              <OpenInSpotify url={externalUrl} name={title} />
            </div>
          </div>
          <p className="spotify-album-meta">
            <SpotifyLogo className="spotify-album-meta-logo" />
            <span>{meta ? `${meta} · From Spotify` : 'From Spotify'}</span>
          </p>
          <div className="album-header-about">
            <AboutSection heading="About this album" summary={state.data.summary} />
          </div>
        </div>
      </div>

      <div style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        overflowX: 'hidden',
        overflowY: 'visible',
      }}>
        {entries.map((entry, index) => (
          <Track
            key={entry.uri || index}
            track={entry}
            index={index}
            trackCount={entries.length}
            isPlaying={playing(entry)}
            hideArtist={entry.artist?.name === artistName}
          />
        ))}
      </div>
    </div>
  );
};

export default SpotifyAlbum;
