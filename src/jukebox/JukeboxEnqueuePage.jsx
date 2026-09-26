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

  const handleSaveName = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setStoredGuestName(name.trim());
    setNameSaved(true);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    const res = await apiService.jukeboxSearch(token, query.trim());
    setResults(res.data.results.filter((r) => r.type === 'track'));
  };

  const handleAdd = async (track) => {
    await apiService.submitToJukebox(token, [track.id], getStoredGuestName());
    setConfirmedId(track.id);
    setTimeout(() => setConfirmedId((current) => (current === track.id ? null : current)), 2000);
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

      {results?.map((result) => (
        <div key={result.data.id}>
          <span>{result.data.title}</span>
          <span>{result.data.artist?.name}</span>
          <button type="button" onClick={() => handleAdd(result.data)}>Add to queue</button>
          {confirmedId === result.data.id && <span>Added!</span>}
        </div>
      ))}
    </div>
  );
};

export default JukeboxEnqueuePage;
