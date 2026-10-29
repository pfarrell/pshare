// src/components/SpotifyResults.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import CardGrid from './CardGrid';
import { useIsMobile } from '../hooks/useIsMobile';
import { useViewModeStore } from '../stores/viewModeStore';
import { formatDuration } from '../utils/formatters';
import { useQueueActions } from '../hooks/useQueueActions';
import { toSpotifyQueueTrack } from '../utils/trackSource';
import OpenInSpotify from './OpenInSpotify';
import { albumQueueTracks } from '../player/spotify/albumQueue';

// Spotify items on the Search page (#72). In the default view each item is
// mixed into the library results (SpotifyResultCard in the results grid,
// SpotifyTrackRow for tracks on mobile — desktop tracks use Track's row
// layout); the "Spotify" pill shows SpotifyResults, the grouped "From
// Spotify" section. These items are not in the library. By default they only link out to Spotify; with
// `canPlay` tracks and albums also get play / add buttons that queue
// Spotify entries through useQueueActions, and artists open the in-app
// Spotify artist page. An artist the library has (localId, shown in the
// Spotify-only mode) always opens its library artist page. Deliberately does not reuse EntityCard:
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

// Play / add buttons. Spotify adds deliberately pass no queueSource, so the
// end-of-queue continuation in usePlayerEngine never fires for these queues.
const SpotifyActions = ({ source, name }) => {
  const { loading, play, addToQueue } = useQueueActions(source, { errorLabel: 'Failed to load Spotify tracks' });
  return (
    <span className="spotify-actions">
      <button type="button" className="spotify-action-btn spotify-action-play" disabled={loading} aria-label={`Play ${name}`} onClick={play}>▶</button>
      <button type="button" className="spotify-action-btn" disabled={loading} aria-label={`Add ${name} to queue`} onClick={addToQueue}>+</button>
    </span>
  );
};

// Card on desktop card mode, compact row on mobile / desktop list mode —
// same split EntityCard uses, built on the same .artist-card / .result-row
// classes so it sits naturally in a CardGrid next to local results.
// `tint` (#72): the faint Spotify-green background Spotify album cards and track rows carry.
const SpotifyItem = ({ title, subtitle, imageUrl, imageShape = 'square', glyph, externalUrl, asRow, actionsSource, to, linkState, tint = false }) => {
  const isMobile = useIsMobile();
  const viewMode = useViewModeStore((s) => s.mode);
  const titleNode = to ? <Link to={to} state={linkState} className="spotify-result-link">{title}</Link> : title;

  if (asRow || isMobile || viewMode === 'list') {
    return (
      <div className={`result-row spotify-result${tint ? ' spotify-tint' : ''}`}>
        <div className={`result-row-image result-row-image-${imageShape}`}>
          <SpotifyImage imageUrl={imageUrl} alt={title} glyph={glyph} />
        </div>
        <div className="result-row-text">
          <h3 className="result-row-title">{titleNode}</h3>
          {subtitle && <p className="result-row-subtitle">{subtitle}</p>}
        </div>
        {actionsSource && <SpotifyActions source={actionsSource} name={title} />}
        <OpenInSpotify url={externalUrl} name={title} />
      </div>
    );
  }

  return (
    <div className={`artist-card spotify-result${tint ? ' spotify-tint' : ''}`} style={{ position: 'relative' }}>
      <span className="search-result-type-badge spotify-badge">SPOTIFY</span>
      <div className="artist-card-image">
        <SpotifyImage imageUrl={imageUrl} alt={title} glyph={glyph} />
      </div>
      <div className="artist-card-title">
        <h3>{titleNode}</h3>
        {subtitle && <p className="spotify-card-subtitle">{subtitle}</p>}
        {actionsSource && <SpotifyActions source={actionsSource} name={title} />}
        <OpenInSpotify url={externalUrl} name={title} />
      </div>
    </div>
  );
};

const artistPath = (artist, canPlay) => {
  if (Number.isInteger(artist.localId)) return `/artist/${artist.localId}`;
  return canPlay && typeof artist.id === 'string' && artist.id ? `/spotify/artist/${artist.id}` : null;
};

/** One Spotify artist or album, as a grid card (or a row on mobile / list mode). */
export const SpotifyResultCard = ({ kind, item, canPlay = false }) => {
  if (kind === 'artist') {
    return (
      <SpotifyItem
        title={text(item.name)}
        subtitle="Artist"
        imageUrl={item.imageUrl}
        imageShape="circle"
        glyph="♫"
        externalUrl={item.externalUrl}
        to={artistPath(item, canPlay)}
        tint={!Number.isInteger(item.localId)}
      />
    );
  }
  const albumId = typeof item.id === 'string' && item.id ? item.id : null;
  return (
    <SpotifyItem
      title={text(item.name)}
      subtitle={[joinArtistNames(item.artists), text(item.releaseYear)].filter(Boolean).join(' · ')}
      imageUrl={item.imageUrl}
      glyph="♪"
      externalUrl={item.externalUrl}
      actionsSource={canPlay && albumId ? albumQueueTracks(item) : null}
      to={canPlay && albumId ? `/spotify/album/${albumId}` : null}
      linkState={{ year: text(item.releaseYear) || null }}
      tint
    />
  );
};

/** One Spotify track as a compact row. */
export const SpotifyTrackRow = ({ item, canPlay = false }) => (
  <SpotifyItem
    asRow
    tint
    title={text(item.name)}
    subtitle={[
      joinArtistNames(item.artists),
      text(item.album?.name),
      formatDuration(Number.isFinite(item.durationMs) ? Math.floor(item.durationMs / 1000) : 0),
    ].filter(Boolean).join(' · ')}
    imageUrl={item.album?.imageUrl}
    glyph="♪"
    externalUrl={item.externalUrl}
    actionsSource={canPlay ? queueTracks(item) : null}
  />
);

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
              <SpotifyResultCard key={artist.id ?? `artist-${i}`} kind="artist" item={artist} canPlay={canPlay} />
            ))}
          </CardGrid>
        </div>
      )}

      {albums.length > 0 && (
        <div className="spotify-group">
          <h3 className="spotify-group-title">Albums</h3>
          <CardGrid>
            {albums.map((album, i) => (
              <SpotifyResultCard key={album.id ?? `album-${i}`} kind="album" item={album} canPlay={canPlay} />
            ))}
          </CardGrid>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="spotify-group">
          <h3 className="spotify-group-title">Tracks</h3>
          <div className="spotify-track-list">
            {tracks.map((track, i) => (
              <SpotifyTrackRow key={track.id ?? `track-${i}`} item={track} canPlay={canPlay} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SpotifyResults;
