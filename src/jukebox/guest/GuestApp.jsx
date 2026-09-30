import { useState, useEffect } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { getStoredGuestName } from '../../utils/jukeboxGuestName';
import { setStoredJukeboxToken } from '../../utils/jukeboxEnqueueToken';
import { GuestProvider } from './GuestContext';
import { useGuest } from './useGuest';
import GuestShell from './GuestShell';
import GuestNameGate from './GuestNameGate';
import GuestHome from './GuestHome';
import GuestSearch from './GuestSearch';
import GuestPlaylists from './GuestPlaylists';
import GuestCollections from './GuestCollections';
import GuestArtist from './GuestArtist';
import GuestAlbum from './GuestAlbum';
import GuestPlaylist from './GuestPlaylist';
import GuestCollection from './GuestCollection';

const GuestNotFound = () => {
  const { path } = useGuest();
  return (
    <div className="jukebox-guest-message">
      <p>That page does not exist.</p>
      <Link to={path('')}>Home</Link>
    </div>
  );
};

// Route paths are absolute (/jukebox/:token/...) so this works inside any
// <Router>: App.jsx's dedicated anonymous branch and the normal tree alike.
const GuestApp = ({ token }) => {
  const [nameSaved, setNameSaved] = useState(() => getStoredGuestName() != null);

  // Remember which kiosk this device is talking to, so the main app's "Send to
  // Jukebox" action and its menu remote work once the visitor is logged in.
  useEffect(() => { setStoredJukeboxToken(token); }, [token]);

  if (!nameSaved) return <GuestNameGate onSaved={() => setNameSaved(true)} />;

  return (
    <GuestProvider token={token}>
      <Routes>
        <Route path="/jukebox/:token" element={<GuestShell />}>
          <Route index element={<GuestHome />} />
          <Route path="search" element={<GuestSearch />} />
          <Route path="artist/:id" element={<GuestArtist />} />
          <Route path="album/:id" element={<GuestAlbum />} />
          <Route path="playlist/:id" element={<GuestPlaylist />} />
          <Route path="collection/:id" element={<GuestCollection />} />
          <Route path="playlists" element={<GuestPlaylists />} />
          <Route path="collections" element={<GuestCollections />} />
          <Route path="*" element={<GuestNotFound />} />
        </Route>
        <Route path="*" element={<GuestNotFound />} />
      </Routes>
    </GuestProvider>
  );
};

export default GuestApp;
