// src/jukebox/JukeboxSpotifyArtistView.jsx
import JukeboxAlbumTile from './JukeboxAlbumTile';
import { useSpotifyCatalogArtist } from '../player/spotify/useSpotifyCatalogArtist';
import { mergeArtistAlbums } from '../utils/mergeArtistAlbums';
import { SpotifyLogo } from '../components/OpenInSpotify';

// Drill-down from a Spotify artist in the kiosk's search results (#72): every
// Spotify album, newest first, in the same slot as JukeboxArtistView. An album
// the library owns (localId) opens the library tracks panel; the rest are
// Spotify tiles (logo badge, source: 'spotify'), which JukeboxBrowsePanel
// routes to JukeboxSpotifyTracksPanel. No "Shuffle artist": that's a library
// call.
const JukeboxSpotifyArtistView = ({ artist, onSelectAlbum, onBack }) => {
  const result = useSpotifyCatalogArtist(artist.id);
  const name = result.status === 'ready' && typeof result.artist.name === 'string' ? result.artist.name : artist.name;
  const albums = result.status === 'ready' ? mergeArtistAlbums([], result.albums) : [];

  return (
    <div className="jukebox-drill-view">
      <button type="button" className="jukebox-back-button" onClick={onBack}>‹ Back</button>
      <div className="jukebox-artist-header">
        <h2 className="jukebox-drill-title">{name}</h2>
      </div>

      {result.status === 'loading' && <div className="jukebox-panel-loading">Loading…</div>}
      {result.status === 'unavailable' && <p className="jukebox-panel-empty">This artist isn&apos;t available right now</p>}
      {result.status === 'ready' && albums.length === 0 && <p className="jukebox-panel-empty">No albums found</p>}
      {albums.length > 0 && (
        <div className="jukebox-album-grid">
          {albums.map(({ album }) => {
            const title = typeof album.name === 'string' ? album.name : '';
            const imageUrl = album.imageUrl ?? null;
            const owned = Number.isInteger(album.localId);
            return (
              <JukeboxAlbumTile
                key={album.id}
                album={owned
                  ? { id: album.localId, title, artist: { name } }
                  : { id: album.id, title, source: 'spotify', imageUrl, artist: { name } }}
                imageUrl={imageUrl}
                badge={owned ? null : <SpotifyLogo className="jukebox-spotify-logo jukebox-album-tile-badge" />}
                onSelect={onSelectAlbum}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JukeboxSpotifyArtistView;
