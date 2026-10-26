// src/pages/SpotifyArtist.jsx
import { useParams } from 'react-router-dom';
import Loading from '../components/Loading';
import CardGrid from '../components/CardGrid';
import OpenInSpotify, { SpotifyLogo } from '../components/OpenInSpotify';
import AboutSection from '../components/AboutSection';
import SpotifyAlbumCard from '../components/SpotifyAlbumCard';
import { useSpotifyCatalogArtist } from '../player/spotify/useSpotifyCatalogArtist';
import { mergeArtistAlbums } from '../utils/mergeArtistAlbums';

// A Spotify artist (#72), reached from a Spotify search result: header plus
// every Spotify album, newest first. Albums the library owns open and play the
// library copy (see SpotifyAlbumCard). Anything unplayable shows a quiet empty
// state rather than an error (there is no error boundary).
const UNAVAILABLE = "This artist isn't available right now.";
const FALLBACK_IMAGE = `${import.meta.env.BASE_URL}icons/icon-512.png`;
const text = (v) => (typeof v === 'string' ? v : '');

const SpotifyArtist = () => {
  const { spotifyId } = useParams();
  const result = useSpotifyCatalogArtist(spotifyId, { details: true });

  if (result.status === 'loading') return <Loading />;
  if (result.status !== 'ready') return <p className="spotify-album-unavailable">{UNAVAILABLE}</p>;

  const name = text(result.artist.name);
  const albums = mergeArtistAlbums([], result.albums);

  return (
    <div style={{ padding: '.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div className="media-page-header">
        <div style={{ flexShrink: 0 }}>
          <img src={text(result.artist.imageUrl) || FALLBACK_IMAGE} alt={name} className="full-image" />
        </div>
        <div style={{ flex: 1 }}>
          <div className="artist-header-title-row" style={{ marginBottom: '1rem' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: 0, color: 'var(--color-text-primary)' }}>
              {name}
            </h1>
            <div className="artist-header-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <OpenInSpotify url={text(result.artist.externalUrl) || null} name={name} />
            </div>
          </div>
          <p className="spotify-album-meta">
            <SpotifyLogo className="spotify-album-meta-logo" />
            <span>From Spotify</span>
          </p>
          <AboutSection heading="About this artist" summary={result.summary} />
        </div>
      </div>

      {albums.length === 0
        ? <p className="spotify-album-unavailable">No albums found.</p>
        : (
          <div className="artist-grid" style={{ minHeight: 'auto' }}>
            <CardGrid>
              {albums.map(({ album }) => <SpotifyAlbumCard key={album.id} album={album} />)}
            </CardGrid>
          </div>
        )}
    </div>
  );
};

export default SpotifyArtist;
