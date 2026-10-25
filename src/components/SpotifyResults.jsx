// src/components/SpotifyResults.jsx
import { useState } from 'react';
import CardGrid from './CardGrid';
import { useIsMobile } from '../hooks/useIsMobile';
import { useViewModeStore } from '../stores/viewModeStore';
import { formatDuration } from '../utils/formatters';
import { useQueueActions } from '../hooks/useQueueActions';
import { toSpotifyQueueTrack } from '../utils/trackSource';
import { apiService } from '../services/api';

// "From Spotify" section at the bottom of the Search page. These items are
// not in the library. By default they only link out to Spotify; with
// `canPlay` tracks and albums also get play / add buttons that queue
// Spotify entries through useQueueActions. Deliberately does not reuse EntityCard:
// that shell always renders an <img> (no null-image fallback) and carries a
// play button / context menu that would wrongly imply local playback.

const joinArtistNames = (artists) =>
  (Array.isArray(artists) ? artists : [])
    .map((a) => (typeof a?.name === 'string' ? a.name : ''))
    .filter(Boolean)
    .join(', ');

const queueTracks = (track) => {
  const entry = toSpotifyQueueTrack(track);
  return entry ? [entry] : null;
};

const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

const SpotifyImage = ({ imageUrl, alt, glyph }) => {
  const [failed, setFailed] = useState(false);
  if (typeof imageUrl !== 'string' || !imageUrl || failed) {
    return <div className="spotify-image-fallback" aria-hidden="true">{glyph}</div>;
  }
  return <img src={imageUrl} alt={alt} onError={() => setFailed(true)} />;
};

const OpenInSpotify = ({ url, name }) => {
  if (typeof url !== 'string' || !url) return null;
  return (
    <a
      className="spotify-open-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${name} in Spotify`}
      title="Open in Spotify"
    >
      <svg className="spotify-open-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="12" fill="#1db954" />
        <path
          d="M17.5 16.6a.75.75 0 0 1-1 .25c-2.85-1.74-6.43-2.13-10.65-1.17a.75.75 0 1 1-.33-1.46c4.62-1.05 8.58-.6 11.73 1.33.35.22.47.69.25 1.05Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.26-2-8.22-2.58-12.08-1.41a.94.94 0 1 1-.54-1.8c4.4-1.33 9.86-.69 13.6 1.61.44.27.58.85.31 1.29Zm.13-3.4C15.2 7.6 8.76 7.39 5.04 8.52a1.13 1.13 0 1 1-.65-2.16c4.27-1.3 11.38-1.05 15.86 1.61a1.13 1.13 0 0 1-1.15 1.96Z"
          fill="#000"
        />
      </svg>
      <span className="spotify-open-arrow" aria-hidden="true">↗</span>
    </a>
  );
};

// Play / add buttons. Spotify adds deliberately pass no queueSource, so the
// end-of-queue continuation in usePlayerEngine never fires for these queues.
const SpotifyActions = ({ source, name }) => {
  const { loading, play, addToQueue } = useQueueActions(source, { errorLabel: 'Failed to load Spotify tracks' });
  return (
    <span className="spotify-actions">
      <button type="button" className="spotify-action-btn" disabled={loading} aria-label={`Play ${name}`} onClick={play}>▶</button>
      <button type="button" className="spotify-action-btn" disabled={loading} aria-label={`Add ${name} to queue`} onClick={addToQueue}>+</button>
    </span>
  );
};

// Fetches an album's full track list (the endpoint pages past 50 tracks) as
// queue entries. Every failure or odd shape yields [] so nothing is enqueued.
const albumTracksSource = (album) => async () => {
  try {
    const response = await apiService.getSpotifyAlbumTracks(album.id);
    const data = response?.data;
    if (!data?.configured || !Array.isArray(data.tracks)) {
      console.warn('Spotify album tracks unavailable:', album.id);
      return [];
    }
    const parent = data.album ?? album;
    return data.tracks.map((t) => toSpotifyQueueTrack(t, parent)).filter(Boolean);
  } catch (err) {
    console.warn('Spotify album tracks failed:', album.id, err);
    return [];
  }
};

// Card on desktop card mode, compact row on mobile / desktop list mode —
// same split EntityCard uses, built on the same .artist-card / .result-row
// classes so it sits naturally in a CardGrid next to local results.
const SpotifyItem = ({ title, subtitle, imageUrl, imageShape = 'square', glyph, externalUrl, asRow, actionsSource }) => {
  const isMobile = useIsMobile();
  const viewMode = useViewModeStore((s) => s.mode);

  if (asRow || isMobile || viewMode === 'list') {
    return (
      <div className="result-row spotify-result">
        <div className={`result-row-image result-row-image-${imageShape}`}>
          <SpotifyImage imageUrl={imageUrl} alt={title} glyph={glyph} />
        </div>
        <div className="result-row-text">
          <h3 className="result-row-title">{title}</h3>
          {subtitle && <p className="result-row-subtitle">{subtitle}</p>}
        </div>
        {actionsSource && <SpotifyActions source={actionsSource} name={title} />}
        <OpenInSpotify url={externalUrl} name={title} />
      </div>
    );
  }

  return (
    <div className="artist-card spotify-result" style={{ position: 'relative' }}>
      <span className="search-result-type-badge spotify-badge">SPOTIFY</span>
      <div className="artist-card-image">
        <SpotifyImage imageUrl={imageUrl} alt={title} glyph={glyph} />
      </div>
      <div className="artist-card-title">
        <h3>{title}</h3>
        {subtitle && <p className="spotify-card-subtitle">{subtitle}</p>}
        {actionsSource && <SpotifyActions source={actionsSource} name={title} />}
        <OpenInSpotify url={externalUrl} name={title} />
      </div>
    </div>
  );
};

const SpotifyResults = ({ loading, tracks = [], albums = [], artists = [], canPlay = false }) => {
  if (loading) {
    return (
      <div className="search-section spotify-section" data-testid="spotify-loading">
        <p className="spotify-loading">
          <span className="spotify-loading-spinner" aria-hidden="true" /> Checking Spotify…
        </p>
      </div>
    );
  }

  if (artists.length === 0 && albums.length === 0 && tracks.length === 0) return null;

  return (
    <div className="search-section spotify-section" data-testid="spotify-section">
      <h2 className="search-section-title">From Spotify</h2>

      {artists.length > 0 && (
        <div className="spotify-group">
          <h3 className="spotify-group-title">Artists</h3>
          <CardGrid>
            {artists.map((artist, i) => (
              <SpotifyItem
                key={artist.id ?? `artist-${i}`}
                title={text(artist.name)}
                subtitle="Artist"
                imageUrl={artist.imageUrl}
                imageShape="circle"
                glyph="♫"
                externalUrl={artist.externalUrl}
              />
            ))}
          </CardGrid>
        </div>
      )}

      {albums.length > 0 && (
        <div className="spotify-group">
          <h3 className="spotify-group-title">Albums</h3>
          <CardGrid>
            {albums.map((album, i) => (
              <SpotifyItem
                key={album.id ?? `album-${i}`}
                title={text(album.name)}
                subtitle={[joinArtistNames(album.artists), text(album.releaseYear)].filter(Boolean).join(' · ')}
                imageUrl={album.imageUrl}
                glyph="♪"
                externalUrl={album.externalUrl}
                actionsSource={canPlay && album.id ? albumTracksSource(album) : null}
              />
            ))}
          </CardGrid>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="spotify-group">
          <h3 className="spotify-group-title">Tracks</h3>
          <div className="spotify-track-list">
            {tracks.map((track, i) => (
              <SpotifyItem
                key={track.id ?? `track-${i}`}
                asRow
                title={text(track.name)}
                subtitle={[
                  joinArtistNames(track.artists),
                  text(track.album?.name),
                  formatDuration(Number.isFinite(track.durationMs) ? Math.floor(track.durationMs / 1000) : 0),
                ].filter(Boolean).join(' · ')}
                imageUrl={track.album?.imageUrl}
                glyph="♪"
                externalUrl={track.externalUrl}
                actionsSource={canPlay ? (queueTracks(track)) : null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SpotifyResults;
