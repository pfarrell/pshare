import { useState } from 'react';
import { apiService } from '../services/api';
import { getStoredGuestName, setStoredGuestName } from '../utils/jukeboxGuestName';

// No Layout, no player chrome — reached via a kiosk's QR code by a visitor
// with no account. See
// docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md Design §4.
const JukeboxEnqueuePage = ({ token }) => {
  const [name, setName] = useState(() => getStoredGuestName() ?? '');
  const [nameSaved, setNameSaved] = useState(() => getStoredGuestName() != null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [confirmedId, setConfirmedId] = useState(null);
  const [error, setError] = useState(null);

  const handleSaveName = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setStoredGuestName(name.trim());
    setNameSaved(true);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setError(null);
    try {
      const res = await apiService.jukeboxSearch(token, query.trim());
      setResults(res.data.tracks);
    } catch {
      setError('Something went wrong. Try again.');
    }
  };

  const handleAdd = async (track) => {
    setError(null);
    try {
      await apiService.submitToJukebox(token, [track.id], getStoredGuestName());
      setConfirmedId(track.id);
      setTimeout(() => setConfirmedId((current) => (current === track.id ? null : current)), 2000);
    } catch {
      setError('Could not add that track. Try again.');
    }
  };

  if (!nameSaved) {
    return (
      <div className="jukebox-enqueue-page">
        <form onSubmit={handleSaveName}>
          <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">Continue</button>
        </form>
      </div>
    );
  }

  return (
    <div className="jukebox-enqueue-page">
      <form role="search" onSubmit={handleSearch}>
        <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit">Search</button>
      </form>

      {error && <div className="jukebox-enqueue-error">{error}</div>}

      {results?.map((track) => (
        <div key={track.id}>
          <span>{track.title}</span>
          <span>{track.artist?.name}</span>
          <button type="button" onClick={() => handleAdd(track)}>Add to queue</button>
          {confirmedId === track.id && <span>Added!</span>}
        </div>
      ))}
    </div>
  );
};

export default JukeboxEnqueuePage;
