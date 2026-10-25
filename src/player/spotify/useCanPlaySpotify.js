// src/player/spotify/useCanPlaySpotify.js
import { useEffect, useState } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { getSpotifyStatusCached } from './statusCache';
import { canPlaySpotify } from './eligibility';
import { isIOSDevice } from '../../utils/device';

// Whether this session can play Spotify in-page right now: eligible status
// (computed once per mount) AND a registered SDK source (reactive, so callers
// light up once the SDK is ready).
export const useCanPlaySpotify = () => {
  const [eligible, setEligible] = useState(false);
  const hasSpotifySource = usePlayerStore((s) => s.spotifySource) != null;
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getSpotifyStatusCached())
      .then((status) => {
        if (cancelled) return;
        setEligible(canPlaySpotify({ status, isSecureContext: window.isSecureContext, isIOS: isIOSDevice() }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return eligible && hasSpotifySource;
};
