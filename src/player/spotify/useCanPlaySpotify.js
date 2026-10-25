// src/player/spotify/useCanPlaySpotify.js
import { useEffect, useState } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { getSpotifyStatusCached } from './statusCache';
import { canPlaySpotify } from './eligibility';
import { isIOSDevice } from '../../utils/device';

// How long to wait for the SDK to register its source before giving up.
export const SOURCE_WAIT_MS = 15000;

// Whether this session can play Spotify in-page (#72):
//   'checking'    — status not resolved yet, or eligible but the SDK hasn't registered (bounded by SOURCE_WAIT_MS)
//   'ready'       — eligible status AND a registered SDK source
//   'unavailable' — ineligible, or the SDK never registered in time
// Reactive to the source, so callers light up once the SDK is ready.
export const useSpotifyPlayability = () => {
  const [eligible, setEligible] = useState(null); // null = status not resolved yet
  const [waitedOut, setWaitedOut] = useState(false);
  const hasSpotifySource = usePlayerStore((s) => s.spotifySource) != null;

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getSpotifyStatusCached())
      .then((status) => {
        if (cancelled) return;
        setEligible(canPlaySpotify({ status, isSecureContext: window.isSecureContext, isIOS: isIOSDevice() }));
      })
      .catch(() => { if (!cancelled) setEligible(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (eligible !== true || hasSpotifySource) return undefined;
    const timer = setTimeout(() => setWaitedOut(true), SOURCE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [eligible, hasSpotifySource]);

  if (eligible === true && hasSpotifySource) return 'ready';
  if (eligible === false || waitedOut) return 'unavailable';
  return 'checking';
};

export const useCanPlaySpotify = () => useSpotifyPlayability() === 'ready';
