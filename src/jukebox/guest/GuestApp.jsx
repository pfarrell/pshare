import { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { getStoredGuestName } from '../../utils/jukeboxGuestName';
import { GuestProvider } from './GuestContext';
import { useGuest } from './useGuest';
import GuestShell from './GuestShell';
import GuestNameGate from './GuestNameGate';
import GuestHome from './GuestHome';
import GuestSearch from './GuestSearch';
import GuestPlaylists from './GuestPlaylists';
import GuestCollections from './GuestCollections';

const Placeholder = ({ name }) => <div>{name}</div>;   // TASK 9/10: delete once every route has a real page

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

  if (!nameSaved) return <GuestNameGate onSaved={() => setNameSaved(true)} />;

  return (
    <GuestProvider token={token}>
      <Routes>
        <Route path="/jukebox/:token" element={<GuestShell />}>
          <Route index element={<GuestHome />} />
          <Route path="search" element={<GuestSearch />} />
          <Route path="artist/:id" element={<Placeholder name="artist" />} />
          <Route path="album/:id" element={<Placeholder name="album" />} />
          <Route path="playlist/:id" element={<Placeholder name="playlist" />} />
          <Route path="collection/:id" element={<Placeholder name="collection" />} />
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
