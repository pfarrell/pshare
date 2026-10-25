import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import JukeboxAlbumTile from './JukeboxAlbumTile';
import JukeboxPlaylistTile from './JukeboxPlaylistTile';
import JukeboxCollectionTile from './JukeboxCollectionTile';
import { useCanPlaySpotify } from '../player/spotify/useCanPlaySpotify';
import { SpotifyLogo } from '../components/OpenInSpotify';

const GRID_SIZE = 20;

// Newest first; an entry without a usable last_played sorts last rather than
// breaking the comparison.
const timeOf = (item) => {
  const t = Date.parse(item.last_played);
  return Number.isNaN(t) ? -Infinity : t;
};

const byTime = (items) => items.sort((a, b) => timeOf(b.data) - timeOf(a.data)).slice(0, GRID_SIZE);

const merge = (albums, playlists, collections) => byTime([
  ...albums.map((data) => ({ kind: 'album', data })),
  ...playlists.map((data) => ({ kind: 'playlist', data })),
  ...collections.map((data) => ({ kind: 'collection', data })),
]);

// #72: recently played Spotify albums (GET /spotify/plays/recent-albums) as
// Spotify album tiles; JukeboxBrowsePanel routes source: 'spotify' albums to
// the Spotify tracks panel. Only while the kiosk can play Spotify.
const spotifyTileAlbum = (a) => ({
  id: a.id,
  title: typeof a.name === 'string' ? a.name : '',
  source: 'spotify',
  imageUrl: typeof a.imageUrl === 'string' ? a.imageUrl : null,
  artist: { name: typeof a.artistName === 'string' ? a.artistName : '' },
});

const useRecentSpotifyAlbums = (canPlay) => {
  const [albums, setAlbums] = useState([]);
  useEffect(() => {
    if (!canPlay) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => apiService.getRecentSpotifyAlbums(GRID_SIZE))
      .then((response) => {
        if (cancelled || !Array.isArray(response?.data)) return;
        setAlbums(response.data.filter((a) => a && typeof a.id === 'string' && a.id));
      })
      .catch((err) => { if (!cancelled) console.warn('Recent Spotify albums unavailable:', err); });
    return () => { cancelled = true; };
  }, [canPlay]);
  return canPlay ? albums : [];
};

// A plain vertical grid of tiles, recently played albums, playlists and
// collections (and Spotify albums, #72) mixed by time: tapping one drills into it via onSelectAlbum /
// onSelectPlaylist / onSelectCollection (owned by JukeboxBrowsePanel, same as
// a search result's tap). Rendered inside the Recent drawer (see
// JukeboxRecentsPanel.jsx), which owns the vertical scrolling - there is
// deliberately no scroller here.
const QuickHitTab = ({ onSelectAlbum, onSelectPlaylist, onSelectCollection, profileId = null }) => {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const spotifyAlbums = useRecentSpotifyAlbums(useCanPlaySpotify());

  const load = () => {
    setError(false);
    setItems(null);
    // A failed playlists or collections request must never take the albums down with it,
    // so only the albums request drives the error state.
    const playlistsRequest = apiService.getRecentPlaylists(GRID_SIZE)
      .then((response) => response.data)
      .catch(() => []);
    const collectionsRequest = apiService.getRecentCollections(GRID_SIZE)
      .then((response) => response.data)
      .catch(() => []);
    Promise.all([apiService.getRecentAlbums(GRID_SIZE, profileId).then((response) => response.data), playlistsRequest, collectionsRequest])
      .then(([albums, playlists, collections]) => setItems(merge(albums, playlists, collections)))
      .catch(() => setError(true));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  if (error) {
    return (
      <div className="jukebox-panel-error">
        <p>Failed to load albums.</p>
        <button onClick={load}>Retry</button>
      </div>
    );
  }

  if (items === null) {
    return <div className="jukebox-panel-loading">Loading…</div>;
  }

  // items is already newest-first and capped, so re-merging with the Spotify
  // list and capping again gives the overall newest GRID_SIZE.
  const shown = spotifyAlbums.length > 0
    ? byTime([...items, ...spotifyAlbums.map((data) => ({ kind: 'spotify-album', data }))])
    : items;

  if (shown.length === 0) {
    return <p className="jukebox-panel-empty">Nothing played yet</p>;
  }

  return (
    <div className="jukebox-album-grid">
      {shown.map(({ kind, data }) => (kind === 'spotify-album' ? (
        <JukeboxAlbumTile
          key={`spotify-${data.id}`}
          album={spotifyTileAlbum(data)}
          imageUrl={typeof data.imageUrl === 'string' ? data.imageUrl : null}
          badge={<SpotifyLogo className="jukebox-spotify-logo jukebox-album-tile-badge" />}
          onSelect={onSelectAlbum}
        />
      ) : kind === 'album' ? (
        <JukeboxAlbumTile
          key={`album-${data.id}`}
          album={data}
          imageUrl={apiService.getImageUrl(data.image_path, 'album_small')}
          onSelect={onSelectAlbum}
        />
      ) : kind === 'collection' ? (
        <JukeboxCollectionTile
          key={`collection-${data.id}`}
          collection={data}
          imageUrl={apiService.getImageUrl(data.image_path, 'album_small')}
          onSelect={onSelectCollection}
        />
      ) : (
        <JukeboxPlaylistTile
          key={`playlist-${data.id}`}
          playlist={data}
          imageUrl={apiService.getImageUrl(data.image_path, 'album_small')}
          onSelect={onSelectPlaylist}
        />
      )))}
    </div>
  );
};

export default QuickHitTab;
