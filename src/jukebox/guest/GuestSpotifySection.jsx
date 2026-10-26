// src/jukebox/guest/GuestSpotifySection.jsx
import { useEffect, useState } from 'react';
import { apiService } from '../../services/api';
import { visibleSpotifyResults } from '../../utils/spotifyResults';
import { useGuest } from './useGuest';
import GuestRow from './GuestRow';
import GuestAddButton from './GuestAddButton';
import { artistNames, spotifyAlbumTracks, text } from './guestSpotify';

const LIMIT = 5;

// "From Spotify" under the guest search results (#72): artists, albums and
// tracks the library doesn't have, shown only while the kiosk can play
// Spotify (the server answers available: false otherwise). Any failure
// renders nothing: the local results above stand on their own.
const GuestSpotifySection = ({ query }) => {
  const { token, path } = useGuest();
  const [result, setResult] = useState({ query: null, data: null });

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => apiService.guestSpotifySearch(token, query))
      .then((res) => { if (!cancelled) setResult({ query, data: res?.data?.available ? res.data : null }); })
      .catch(() => { if (!cancelled) setResult({ query, data: null }); });
    return () => { cancelled = true; };
  }, [token, query]);

  if (result.query !== query || !result.data) return null;
  const { artists, albums, tracks } = visibleSpotifyResults(result.data);
  const shownArtists = artists.filter((a) => a.id).slice(0, LIMIT);
  const shownAlbums = albums.filter((a) => a.id).slice(0, LIMIT);
  const shownTracks = tracks.filter((t) => t.uri).slice(0, LIMIT);
  if (!shownArtists.length && !shownAlbums.length && !shownTracks.length) return null;

  return (
    <section className="jukebox-guest-section jukebox-guest-spotify">
      <h2>From Spotify</h2>
      {shownTracks.map((t) => (
        <GuestRow key={t.uri} imageUrl={t.album?.imageUrl ?? null}
          title={artistNames(t.artists) ? `${text(t.name)} - ${artistNames(t.artists)}` : text(t.name)}
          subtitle={text(t.album?.name)}
          action={<GuestAddButton itemKey={`spotify-track-${t.uri}`} label={text(t.name) || 'track'} spotifyTracks={[t]} />} />
      ))}
      {shownArtists.map((a) => (
        <GuestRow key={a.id} to={path(`spotify/artist/${a.id}`)} imageUrl={a.imageUrl ?? null}
          title={text(a.name)} subtitle="Artist" />
      ))}
      {shownAlbums.map((a) => (
        <GuestRow key={a.id} to={path(`spotify/album/${a.id}`)} imageUrl={a.imageUrl ?? null}
          title={text(a.name)} subtitle={[artistNames(a.artists), text(a.releaseYear)].filter(Boolean).join(' · ')}
          action={<GuestAddButton itemKey={`spotify-album-${a.id}`} label={text(a.name) || 'album'}
            spotifyTracks={spotifyAlbumTracks(token, a.id)} variant="all" />} />
      ))}
    </section>
  );
};

export default GuestSpotifySection;
