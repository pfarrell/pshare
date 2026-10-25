// src/jukebox/JukeboxSpotifyTracksPanel.jsx
import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import Track from '../components/Track';
import { useQueueActions } from '../hooks/useQueueActions';
import { useTouchScroll } from './useTouchScroll';
import { toSpotifyQueueTrack } from '../utils/trackSource';

// The kiosk's tracks panel for a Spotify album (#72), mirroring
// JukeboxTracksPanel (same classes/actions) so it feels identical, but loading
// from /spotify/albums/:id/tracks. `album` is the shape JukeboxArtistView
// builds: { id: spotifyId, title, source: 'spotify', imageUrl, artist: { name } }.
// No artist link (it's already the artist being browsed) and no queueSource.
const JukeboxSpotifyTracksPanel = ({ album, onClose, onEnqueue }) => {
  const [tracks, setTracks] = useState(null);
  const [error, setError] = useState(false);
  const bodyRef = useTouchScroll({ axis: 'y' });

  const load = () => {
    setError(false);
    setTracks(null);
    Promise.resolve()
      .then(() => apiService.getSpotifyAlbumTracks(album.id))
      .then((response) => {
        const data = response?.data;
        if (!data?.configured || !Array.isArray(data.tracks)) throw new Error('Spotify album unavailable');
        setTracks(data.tracks.map((t) => toSpotifyQueueTrack(t, data.album ?? { name: album.title, imageUrl: album.imageUrl })).filter(Boolean));
      })
      .catch((err) => {
        console.warn('Kiosk Spotify album failed:', album.id, err);
        setError(true);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the album actually changes
  }, [album.id]);

  const queue = useQueueActions(tracks ?? [], { errorLabel: 'Failed to queue Spotify album' });
  const ready = tracks !== null && tracks.length > 0;
  const imageUrl = typeof album.imageUrl === 'string' && album.imageUrl ? album.imageUrl : null;

  return (
    <div className="jukebox-tracks-panel">
      <div className="jukebox-tracks-panel-header">
        <div className="jukebox-tracks-panel-top">
          {imageUrl ? (
            <img className="jukebox-tracks-panel-art" src={imageUrl} alt="" draggable={false} />
          ) : (
            <div className="jukebox-tracks-panel-art jukebox-tracks-panel-art-placeholder" aria-hidden="true">♪</div>
          )}
          <div className="jukebox-tracks-panel-titles">
            <h2 className="jukebox-tracks-panel-title">{album.title}</h2>
            <span className="jukebox-tracks-panel-artist">{album.artist?.name ?? ''}</span>
          </div>
          <button type="button" className="jukebox-tracks-panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="jukebox-tracks-panel-actions">
          <button type="button" disabled={!ready} onClick={() => { queue.play(); onEnqueue?.(); }}>Play album</button>
          <button type="button" disabled={!ready} onClick={() => { queue.addToQueue(); onEnqueue?.(); }}>Add to queue</button>
        </div>
      </div>

      <div className="jukebox-tracks-panel-body" ref={bodyRef}>
        {error && (
          <div className="jukebox-panel-error">
            <p>Failed to load album.</p>
            <button onClick={load}>Retry</button>
          </div>
        )}
        {!error && tracks === null && <div className="jukebox-panel-loading">Loading…</div>}
        {!error && tracks !== null && (
          // Bubble-phase onClick, same reason as JukeboxTracksPanel: Track's own
          // tap-to-enqueue must run before onEnqueue unmounts the panel.
          <div className="jukebox-search-tracks" onClick={() => onEnqueue?.()}>
            {tracks.map((track, index) => (
              <Track key={track.uri || index} track={track} index={index} trackCount={tracks.length} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default JukeboxSpotifyTracksPanel;
