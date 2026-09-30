import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiService } from '../../services/api';
import { remoteErrorMessage } from '../../utils/jukeboxRemote';
import { useGuest } from './useGuest';
import { useGuestQueue } from './useGuestQueue';
import { redirectToLogin } from './guestLogin';
import GuestRow from './GuestRow';
import GuestStatus from './GuestStatus';

// The kiosk's queue: the current track and what follows. Anyone with the QR
// link can look; skipping to a track or removing one needs a login (a 401 sends
// a logged-out visitor to login and back here). Commands name a queue row plus
// its track id, so a stale view can never hit the wrong track.
const GuestQueue = () => {
  const { token } = useGuest();
  const { pathname, search } = useLocation();
  const { data, error, loading, refresh, notFound } = useGuestQueue(token);
  const [busyKey, setBusyKey] = useState(null);
  const [message, setMessage] = useState(null);

  const act = async (command, entry) => {
    if (busyKey !== null) return; // one command at a time: a double tap cannot fire twice
    setBusyKey(`${command}-${entry.index}`);
    setMessage(null);
    try {
      await apiService.sendJukeboxCommand(token, command, { index: entry.index, trackId: entry.id });
      await refresh();
    } catch (err) {
      if (err?.response?.status === 401) {
        redirectToLogin(pathname + search);
        return;
      }
      setMessage(remoteErrorMessage(err));
    } finally {
      setBusyKey(null);
    }
  };

  if (!data) {
    return (
      <>
        <h1 className="jukebox-guest-heading">Queue</h1>
        <GuestStatus loading={loading} error={error} notFound={notFound} onRetry={refresh}
          notFoundMessage="This link is no longer valid. Scan the code on the jukebox again." />
      </>
    );
  }

  if (!data.connected) {
    return (
      <>
        <h1 className="jukebox-guest-heading">Queue</h1>
        <div className="jukebox-guest-message">The jukebox is not connected.</div>
      </>
    );
  }

  const entries = (data.queue ?? []).filter(Boolean);
  const current = entries.find((e) => e.index === data.currentIndex) ?? null;
  const upcoming = entries.filter((e) => e !== current);

  if (entries.length === 0) {
    return (
      <>
        <h1 className="jukebox-guest-heading">Queue</h1>
        <div className="jukebox-guest-message">Nothing queued. Add music from Search or Home.</div>
      </>
    );
  }

  const row = (entry, { removable }) => {
    const title = typeof entry.title === 'string' ? entry.title : '';
    const artist = typeof entry.artist === 'string' ? entry.artist : '';
    return (
      <GuestRow
        key={`${entry.index}-${entry.id}`}
        className={entry === current ? 'jukebox-guest-row-current' : undefined}
        title={title}
        subtitle={artist}
        onSelect={() => act('jump', entry)}
        action={removable ? (
          <button
            type="button"
            className="jukebox-guest-add jukebox-guest-remove"
            aria-label={`Remove ${title || 'track'} from queue`}
            disabled={busyKey !== null}
            onClick={() => act('remove', entry)}
          >
            ×
          </button>
        ) : null}
      />
    );
  };

  // Plain shuffle does not play in queue order, so the list is "what is left"
  // and says so; repeat one replays the current track before moving on.
  const shuffled = data.playbackMode === 'shuffle';
  const upcomingHeading = shuffled ? 'Left to play' : 'Up next';
  const modeNote = shuffled
    ? 'Shuffle is on, so these play in random order.'
    : (data.playbackMode === 'repeat-one' ? 'Repeat one is on, so the current track plays again first.' : null);

  return (
    <>
      <h1 className="jukebox-guest-heading">Queue</h1>
      {message && <div className="jukebox-guest-message" role="status">{message}</div>}
      {current && (
        <section className="jukebox-guest-section">
          <h2>{data.isPlaying ? 'Now playing' : 'Current track'}</h2>
          {row(current, { removable: false })}
        </section>
      )}
      {upcoming.length > 0 && (
        <section className="jukebox-guest-section">
          <h2>{upcomingHeading}</h2>
          {modeNote && <p className="jukebox-guest-queue-note">{modeNote}</p>}
          {upcoming.map((entry) => row(entry, { removable: true }))}
        </section>
      )}
    </>
  );
};

export default GuestQueue;
