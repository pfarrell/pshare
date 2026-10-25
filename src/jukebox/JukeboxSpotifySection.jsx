// src/jukebox/JukeboxSpotifySection.jsx
import { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { useQueueActions } from '../hooks/useQueueActions';
import { useCanPlaySpotify } from '../player/spotify/useCanPlaySpotify';
import { albumQueueTracks } from '../player/spotify/albumQueue';
import { visibleSpotifyResults } from '../utils/spotifyResults';
import { toSpotifyQueueTrack } from '../utils/trackSource';
import { SpotifyLogo } from '../components/OpenInSpotify';

// Spotify results at the bottom of the kiosk's search tab (#72). Only when the
// kiosk can play Spotify; hides albums/tracks the library already has. A tap
// *adds* to the queue (like tapping a local track here) — never play-now, so a
// guest's pick can't cut off the current song. Any failure renders nothing.
const ALBUM_LIMIT = 4;
const TRACK_LIMIT = 5;

const names = (artists) => (Array.isArray(artists) ? artists : [])
  .map((a) => (typeof a?.name === 'string' ? a.name : '')).filter(Boolean).join(', ');
const text = (v) => (typeof v === 'string' ? v : '');

const SpotifyRow = ({ source, title, subtitle, onEnqueue }) => {
  const { loading, addToQueue } = useQueueActions(source, { errorLabel: 'Failed to add Spotify tracks' });
  return (
    <button
      type="button"
      className="jukebox-spotify-row"
      disabled={loading}
      aria-label={`Add ${title} to queue`}
      onClick={() => { addToQueue(); onEnqueue?.(); }}
    >
      <SpotifyLogo className="jukebox-spotify-logo" />
      <span className="jukebox-spotify-row-text">
        <span className="jukebox-spotify-row-title">{title}</span>
        {subtitle && <span className="jukebox-spotify-row-subtitle">{subtitle}</span>}
      </span>
      <span className="jukebox-spotify-row-add" aria-hidden="true">+</span>
    </button>
  );
};

const JukeboxSpotifySection = ({ query, onEnqueue }) => {
  const canPlay = useCanPlaySpotify();
  const [result, setResult] = useState({ query: null, data: null });

  useEffect(() => {
    const q = typeof query === 'string' ? query.trim() : '';
    if (!canPlay || !q) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => apiService.searchSpotify(q))
      .then((res) => {
        if (!cancelled) setResult({ query: q, data: res?.data?.configured ? res.data : null });
      })
      .catch((err) => { if (!cancelled) console.warn('Kiosk Spotify search failed:', err); });
    return () => { cancelled = true; };
  }, [canPlay, query]);

  if (!canPlay || !result.data || result.query !== (query ?? '').trim()) return null;
  const { albums, tracks } = visibleSpotifyResults(result.data);
  const shownAlbums = albums.filter((a) => a.id).slice(0, ALBUM_LIMIT);
  const shownTracks = tracks.slice(0, TRACK_LIMIT)
    .map((t) => ({ raw: t, entry: toSpotifyQueueTrack(t) })).filter((x) => x.entry);
  if (shownAlbums.length === 0 && shownTracks.length === 0) return null;

  return (
    <section className="jukebox-search-section jukebox-spotify-section">
      <div className="jukebox-search-section-header">
        <h3>More from Spotify</h3>
      </div>
      {shownAlbums.map((album) => (
        <SpotifyRow
          key={`album-${album.id}`}
          source={albumQueueTracks(album)}
          title={text(album.name)}
          subtitle={['Album', names(album.artists), text(album.releaseYear)].filter(Boolean).join(' · ')}
          onEnqueue={onEnqueue}
        />
      ))}
      {shownTracks.map(({ raw, entry }) => (
        <SpotifyRow
          key={entry.uri}
          source={[entry]}
          title={entry.title}
          subtitle={[names(raw.artists), text(raw.album?.name)].filter(Boolean).join(' · ')}
          onEnqueue={onEnqueue}
        />
      ))}
    </section>
  );
};

export default JukeboxSpotifySection;
