import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import Track from '../components/Track';
import { useQueueActions } from '../hooks/useQueueActions';
import { useTouchScroll } from './useTouchScroll';

// A playlist's track list, shown the same way an album's is (see
// JukeboxTracksPanel) — "operates like an album" per the design: tap to open,
// Play playlist / Add to queue for the whole thing, tap a track to enqueue
// just that one. Kept as its own component rather than generalizing
// JukeboxTracksPanel: the data shape differs (getPlaylist vs. getAlbum, no
// artist), and each stays simpler for it.
const JukeboxPlaylistPanel = ({ playlist, onClose, onEnqueue }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const bodyRef = useTouchScroll({ axis: 'y' });

  const load = () => {
    setError(false);
    setData(null);
    apiService.getPlaylist(playlist.id)
      .then((response) => setData(response.data))
      .catch(() => setError(true));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the playlist actually changes, not on every load() identity change
  }, [playlist.id]);

  const queue = useQueueActions(data?.tracks ?? [], {
    queueSource: { type: 'playlist', id: playlist.id },
    errorLabel: 'Failed to queue playlist',
  });

  const imagePath = data?.playlist?.image_path ?? playlist.image_path;
  const ready = data !== null && data.tracks.length > 0;

  return (
    <div className="jukebox-tracks-panel">
      <div className="jukebox-tracks-panel-header">
        <div className="jukebox-tracks-panel-top">
          {imagePath ? (
            <img
              className="jukebox-tracks-panel-art"
              src={apiService.getImageUrl(imagePath, 'album_small')}
              alt=""
              draggable={false}
            />
          ) : (
            <div className="jukebox-tracks-panel-art jukebox-tracks-panel-art-placeholder" aria-hidden="true">♪</div>
          )}
          <div className="jukebox-tracks-panel-titles">
            <h2 className="jukebox-tracks-panel-title">{playlist.name}</h2>
          </div>
          <button type="button" className="jukebox-tracks-panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="jukebox-tracks-panel-actions">
          <button type="button" disabled={!ready} onClick={() => { queue.play(); onEnqueue?.(); }}>Play playlist</button>
          <button type="button" disabled={!ready} onClick={() => { queue.addToQueue(); onEnqueue?.(); }}>Add to queue</button>
        </div>
      </div>

      <div className="jukebox-tracks-panel-body" ref={bodyRef}>
        {error && (
          <div className="jukebox-panel-error">
            <p>Failed to load playlist.</p>
            <button onClick={load}>Retry</button>
          </div>
        )}
        {!error && data === null && <div className="jukebox-panel-loading">Loading…</div>}
        {!error && data !== null && (
          // Must be onClick, not onClickCapture: a capture-phase listener fires
          // before Track's own bubble-phase tap-to-enqueue handler, and since
          // onEnqueue (closeAll) synchronously unmounts this panel, it can win
          // that race and discard the enqueue before Track's handler runs —
          // see JukeboxTracksPanel.jsx / JukeboxTracksPanel.test.jsx, which hit
          // this on real hardware.
          <div className="jukebox-search-tracks" onClick={() => onEnqueue?.()}>
            {data.tracks.map((track, index) => (
              <Track key={track.id} track={track} index={index} trackCount={data.tracks.length} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default JukeboxPlaylistPanel;
