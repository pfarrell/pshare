import { useEffect, useRef, useState } from 'react';
import { apiService } from '../services/api';
import { useProfileFilterStore } from '../stores/profileFilterStore';

// How long each item stays on screen before rotating to the next.
const ROTATION_MS = 20000;
// How many of each (albums, artists) to fetch per pool refill.
const POOL_FETCH_SIZE = 10;

// Fisher-Yates — used to shuffle each fetched batch before interleaving.
const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// Alternates two arrays: [a0, b0, a1, b1, ...], trailing off with whichever
// side is longer. Keeps the rotation from showing several albums in a row.
const interleave = (a, b) => {
  const out = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
};

// Idle screensaver: cycles full-bleed album/artist art while the kiosk sits
// untouched with nothing playing. JukeboxApp owns activation/deactivation
// (see its idle-trigger effect) — this component is mounted only while
// active, so every mount starts a fresh fetch; there's no state worth
// preserving across dismissals. Renders null whenever it has no current item
// (both fetches failed, or the profile filter matches nothing) — from the
// user's perspective that's indistinguishable from the screensaver not
// having activated at all.
const JukeboxScreensaver = ({ onDismiss, onView }) => {
  const activeProfileId = useProfileFilterStore((s) => s.activeProfileId);
  const [current, setCurrent] = useState(null);
  const queueRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    // A profile-filter change re-runs this effect (activeProfileId is a
    // dependency below) — the previous pool was fetched under the old
    // filter, so it must not keep draining out on screen under the new one.
    queueRef.current = [];

    const advance = async () => {
      if (queueRef.current.length === 0) {
        const [albumsRes, artistsRes] = await Promise.all([
          apiService.getRandomAlbums(POOL_FETCH_SIZE, activeProfileId).catch(() => ({ data: [] })),
          apiService.getRandomArtists(POOL_FETCH_SIZE, activeProfileId).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const albums = shuffle((albumsRes.data ?? []).map((data) => ({ type: 'album', data })));
        const artists = shuffle((artistsRes.data ?? []).map((data) => ({ type: 'artist', data })));
        queueRef.current = interleave(albums, artists);
      }
      if (cancelled) return;
      const [next, ...rest] = queueRef.current;
      queueRef.current = rest;
      setCurrent(next ?? null);
    };

    advance();
    const timer = setInterval(advance, ROTATION_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeProfileId]);

  if (!current) return null;

  const { type, data } = current;
  const label = (type === 'artist' ? data.name : data.title) ?? 'this';
  const imageUrl = data.image_path
    ? apiService.getImageUrl(data.image_path, type === 'artist' ? 'artist_page' : 'album_page')
    : null;

  return (
    <div className="jukebox-screensaver" onClick={onDismiss}>
      {imageUrl ? (
        <img className="jukebox-screensaver-art" src={imageUrl} alt={label} draggable={false} />
      ) : (
        <svg
          className="jukebox-screensaver-art-placeholder"
          fill="none" stroke="currentColor" aria-hidden="true"
          viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      )}
      <button
        type="button"
        className="jukebox-screensaver-view-button"
        onClick={(e) => { e.stopPropagation(); onView(current); }}
      >
        View {label}
      </button>
    </div>
  );
};

export default JukeboxScreensaver;
