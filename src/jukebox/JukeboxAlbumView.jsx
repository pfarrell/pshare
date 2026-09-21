import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import AlbumCard from '../components/AlbumCard';
import Track from '../components/Track';

// Drill-down from a search/artist-browse album: shows the album's own tap-
// to-play PlayButton (queues the whole album, unchanged) plus its track
// list — tapping an individual Track enqueues just that track (Track's own
// tap-to-play is already per-track, nothing new needed here).
const JukeboxAlbumView = ({ album, onBack }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

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

  return (
    <div className="jukebox-drill-view">
      <button type="button" className="jukebox-back-button" onClick={onBack}>‹ Back</button>

      {error && (
        <div className="jukebox-panel-error">
          <p>Failed to load album.</p>
          <button onClick={load}>Retry</button>
        </div>
      )}
      {!error && data === null && <div className="jukebox-panel-loading">Loading…</div>}
      {!error && data !== null && (
        <>
          <div className="jukebox-search-albums">
            <AlbumCard
              album={data.album}
              artist={data.artist}
              imageUrl={apiService.getImageUrl(data.album.image_path, 'album_small')}
              onClick={() => {}}
            />
          </div>
          <div className="jukebox-search-tracks">
            {data.tracks.map((track, index) => (
              <Track key={track.id} track={track} index={index} trackCount={data.tracks.length} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default JukeboxAlbumView;
