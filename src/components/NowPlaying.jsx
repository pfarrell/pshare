// src/components/player/NowPlaying.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../stores/playerStore';
import { apiService } from '../services/api';
import ImageLightbox from './ImageLightbox';

const NowPlaying = () => {
  const navigate = useNavigate();
  const [showArtModal, setShowArtModal] = useState(false);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const closeDrawer = usePlayerStore((s) => s.closeDrawer);

  // On mobile this component renders as a fixed bar above the transport controls
  // (see .now-playing in index.css) rather than inline in the footer — CSS alone
  // can't tell whether that bar exists in the DOM, so the page content's bottom
  // clearance (--footer-clearance) is driven by this class instead. No-op on
  // desktop, where .now-playing stays part of the normal footer flow.
  useEffect(() => {
    document.body.classList.toggle('has-now-playing', !!currentTrack);
    return () => document.body.classList.remove('has-now-playing');
  }, [currentTrack]);

  const handleArtistClick = (track) => {
    navigate(`/artist/${track.artist.id}`);
    closeDrawer();
  };

  const handleTrackClick = (track) => {
    if (track.source_playlist?.id) {
      navigate(`/playlist/${track.source_playlist.id}`);
    } else {
      // scrollToTrackId lets Album.jsx land the page on this exact track
      // instead of the top of the album — the whole point of tapping the
      // mobile now-playing bar is to see the track that's actually playing.
      navigate(`/album/${track.album.id}`, { state: { scrollToTrackId: track.id } });
    }
    closeDrawer();
  };

  if (!currentTrack) {
    return null;
  }

  // Every backend route puts the album art path at the track's top level
  // (image_path), not nested under album.image_path — the nested album
  // object only ever carries id/title/artist for navigation.
  const albumArtUrl = currentTrack.image_path
    ? apiService.getImageUrl(currentTrack.image_path, 'album_small')
    : null;
  const artistName = currentTrack.artist?.name || 'Unknown Artist';

  return (
    <div className="now-playing">
      {albumArtUrl ? (
        <img
          src={albumArtUrl}
          alt={currentTrack.album?.title}
          className="now-playing-art"
          onClick={() => setShowArtModal(true)}
          style={{ cursor: 'zoom-in' }}
        />
      ) : (
        <svg
          width="24" height="24" fill="none" stroke="currentColor"
          viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      )}
      <div className="track-info show">
        <div className="track-artist" onClick={() => handleArtistClick(currentTrack)} title="go to artist">
          {artistName}
        </div>
        <div
          className="track-title"
          onClick={() => handleTrackClick(currentTrack)}
          title={currentTrack.source_playlist?.id ? 'go to playlist' : 'go to album'}
        >
          {currentTrack.title}
          {/* Desktop already shows the artist on its own line above (.track-artist);
              this inline suffix is mobile-only (see .now-playing-title-artist in
              index.css) since the mobile bar hides that separate line entirely. */}
          <span className="now-playing-title-artist"> — {artistName}</span>
        </div>
      </div>
      {showArtModal && (
        <ImageLightbox
          imageUrl={apiService.getImageUrl(currentTrack.image_path, 'album_page')}
          alt={currentTrack.album?.title}
          title={currentTrack.album?.title}
          subtitle={currentTrack.artist?.name}
          onClose={() => setShowArtModal(false)}
        />
      )}
    </div>
  );
};

export default NowPlaying;
