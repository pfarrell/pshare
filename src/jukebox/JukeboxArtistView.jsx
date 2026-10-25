import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import JukeboxAlbumTile from './JukeboxAlbumTile';
import { useQueueActions } from '../hooks/useQueueActions';
import { useSpotifyArtistAlbums } from '../player/spotify/useSpotifyArtistAlbums';
import { mergeArtistAlbums } from '../utils/mergeArtistAlbums';
import { SpotifyLogo } from '../components/OpenInSpotify';

// Drill-down from a search-result artist: shows that artist's albums in the
// same panel slot. Tapping an album opens the tracks panel (via onSelectAlbum,
// owned by JukeboxBrowsePanel). "Shuffle artist" plays a random selection of
// the artist's tracks — the same call the shared ArtistCard's play button
// makes — and is available immediately, since it doesn't need the albums.
const JukeboxArtistView = ({ artist, onSelectAlbum, onBack, onEnqueue }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    setData(null);
    apiService.getArtist(artist.id, { summary: false })
      .then((response) => setData(response.data))
      .catch(() => setError(true));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the artist actually changes, not on every load() identity change
  }, [artist.id]);

  // #72: unowned Spotify albums, merged in by year ([] unless the kiosk can play Spotify).
  const spotifyAlbums = useSpotifyArtistAlbums(artist.id);
  const merged = data ? mergeArtistAlbums(data.albums, spotifyAlbums) : [];

  const shuffle = useQueueActions(
    () => apiService.getRandomScopeTracks('artist', artist.id).then((response) => response.data.tracks),
    { queueSource: { type: 'artist', id: artist.id }, errorLabel: 'Failed to shuffle artist' }
  );

  return (
    <div className="jukebox-drill-view">
      <button type="button" className="jukebox-back-button" onClick={onBack}>‹ Back</button>
      <div className="jukebox-artist-header">
        <h2 className="jukebox-drill-title">{artist.name}</h2>
        <button
          type="button"
          className="jukebox-shuffle-button"
          disabled={shuffle.loading}
          onClick={() => { shuffle.play(); onEnqueue?.(); }}
        >
          Shuffle artist
        </button>
      </div>

      {error && (
        <div className="jukebox-panel-error">
          <p>Failed to load albums.</p>
          <button onClick={load}>Retry</button>
        </div>
      )}
      {!error && data === null && <div className="jukebox-panel-loading">Loading…</div>}
      {!error && data !== null && merged.length === 0 && (
        <p className="jukebox-panel-empty">No albums found</p>
      )}
      {!error && data !== null && merged.length > 0 && (
        <div className="jukebox-album-grid">
          {merged.map(({ kind, album }) => (kind === 'spotify' ? (
            <JukeboxAlbumTile
              key={`spotify-${album.id}`}
              album={{
                id: album.id,
                title: typeof album.name === 'string' ? album.name : '',
                source: 'spotify',
                imageUrl: album.imageUrl ?? null,
                artist: { name: data.artist?.name ?? artist.name },
              }}
              imageUrl={album.imageUrl ?? null}
              badge={<SpotifyLogo className="jukebox-spotify-logo jukebox-album-tile-badge" />}
              onSelect={onSelectAlbum}
            />
          ) : (
            <JukeboxAlbumTile
              key={album.id}
              album={{ ...album, artist: album.artist ?? data.artist }}
              imageUrl={apiService.getImageUrl(album.image_path, 'album_small')}
              onSelect={onSelectAlbum}
            />
          )))}
        </div>
      )}
    </div>
  );
};

export default JukeboxArtistView;
