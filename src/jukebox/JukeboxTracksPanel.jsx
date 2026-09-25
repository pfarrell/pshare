import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import Track from '../components/Track';
import { useQueueActions } from '../hooks/useQueueActions';
import { useTouchScroll } from './useTouchScroll';

// The album's track list, shown in its own panel to the left of the Browse
// panel (see JukeboxBrowsePanel, which owns which album is selected). Tapping a
// track enqueues just that track — Track's own tap-to-play is already
// per-track — while the header's buttons act on the whole album.
//
// The title/cover render from the `album` prop straight away, so the panel
// doesn't flash empty while getAlbum() is in flight (or if it fails).
const JukeboxTracksPanel = ({ album, onClose, onEnqueue, onSelectArtist }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const bodyRef = useTouchScroll({ axis: 'y' });

  const load = () => {
    setError(false);
    setData(null);
    apiService.getAlbum(album.id)
      .then((response) => setData(response.data))
      .catch(() => setError(true));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the album actually changes, not on every load() identity change
  }, [album.id]);

  // Hand the hook the tracks we've already loaded (not a refetching function),
  // so a tap can't fail on the network. Empty until loaded, when the buttons
  // below are disabled anyway.
  const queue = useQueueActions(data?.tracks ?? [], {
    queueSource: { type: 'album', id: album.id },
    errorLabel: 'Failed to queue album',
  });

  const imagePath = data?.album?.image_path ?? album.image_path;
  const artist = data?.artist ?? album.artist;
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
            <h2 className="jukebox-tracks-panel-title">{album.title}</h2>
            {/* Only a tappable link when the artist has an id to jump to —
                same defensive check AlbumCard uses elsewhere for its "Go to
                Artist" action. Search results and getAlbum() both normally
                supply one; a stub/orphaned album may not. */}
            {artist?.id ? (
              <button type="button" className="jukebox-tracks-panel-artist-link" onClick={() => onSelectArtist?.(artist)}>
                {artist.name}
              </button>
            ) : (
              <span className="jukebox-tracks-panel-artist">{artist?.name ?? ''}</span>
            )}
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
        {!error && data === null && <div className="jukebox-panel-loading">Loading…</div>}
        {!error && data !== null && (
          // Track (src/components/Track.jsx) has no onClick prop of its own — a
          // bubble-phase listener here fires after Track's internal tap-to-
          // enqueue handlers, so it still catches every track tap regardless of
          // which element inside the row was actually tapped, without racing
          // ahead of the enqueue. This must be onClick, not onClickCapture: a
          // capture-phase listener runs *before* Track's own bubble-phase
          // handler, and since onEnqueue (closeAll) synchronously unmounts this
          // whole panel, it could win that race and discard the enqueue before
          // Track's handler ever ran — confirmed on real hardware, not just in
          // theory (see JukeboxTracksPanel.test.jsx).
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

export default JukeboxTracksPanel;
