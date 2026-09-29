// src/jukebox/JukeboxScreensaver.jsx
import { useEffect, useRef, useState } from 'react';
import { apiService } from '../services/api';
import { useProfileFilterStore } from '../stores/profileFilterStore';

// How long each item stays on screen before rotating to the next.
const ROTATION_MS = 20000;
// How many items to fetch per pool refill (per source, in music mode).
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

// Idle screensaver: cycles full-bleed art while the kiosk sits untouched,
// whether or not music is playing. JukeboxApp owns activation/deactivation and which
// mode is active (see its idle-trigger effect) — this component is mounted
// only while active, so every mount starts a fresh fetch; there's no state
// worth preserving across dismissals. Renders null whenever it has no
// current item (both fetches failed, the profile filter matches nothing, or
// there are simply no photos uploaded yet) — from the user's perspective
// that's indistinguishable from the screensaver not having activated at all.
//
// mode='music': today's behavior — alternates albums/artists, profile-
// filtered, shows a View button that jumps to Browse.
// mode='photos': personal photos only (apiService.getRandomPhotos), no
// profile filter (photos aren't tagged), no View button — purely ambient,
// matching the GitHub issue's framing of photo-frame mode as "sort of
// outside music playback."
const JukeboxScreensaver = ({ mode, onDismiss, onView }) => {
  const activeProfileId = useProfileFilterStore((s) => s.activeProfileId);
  const [current, setCurrent] = useState(null);
  const queueRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    // A mode or profile-filter change re-runs this effect — the previous
    // pool was fetched for the old mode/filter, so it must not keep
    // draining out on screen under the new one.
    queueRef.current = [];

    const fetchPool = async () => {
      if (mode === 'photos') {
        const res = await apiService.getRandomPhotos(POOL_FETCH_SIZE).catch(() => ({ data: [] }));
        return shuffle((res.data ?? []).map((data) => ({ type: 'photo', data })));
      }
      const [albumsRes, artistsRes] = await Promise.all([
        apiService.getRandomAlbums(POOL_FETCH_SIZE, activeProfileId).catch(() => ({ data: [] })),
        apiService.getRandomArtists(POOL_FETCH_SIZE, activeProfileId).catch(() => ({ data: [] })),
      ]);
      const albums = shuffle((albumsRes.data ?? []).map((data) => ({ type: 'album', data })));
      const artists = shuffle((artistsRes.data ?? []).map((data) => ({ type: 'artist', data })));
      return interleave(albums, artists);
    };

    const advance = async () => {
      if (queueRef.current.length === 0) {
        const pool = await fetchPool();
        if (cancelled) return;
        queueRef.current = pool;
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
  }, [mode, activeProfileId]);

  if (!current) return null;

  const { type, data } = current;
  const isPhoto = type === 'photo';
  const label = isPhoto ? null : (type === 'artist' ? data.name : data.title) ?? 'this';
  const imageContext = type === 'artist' ? 'artist_page' : type === 'album' ? 'album_page' : 'photo_page';
  const imageUrl = data.image_path ? apiService.getImageUrl(data.image_path, imageContext) : null;

  return (
    <div className="jukebox-screensaver" onClick={onDismiss}>
      {imageUrl ? (
        <img className="jukebox-screensaver-art" src={imageUrl} alt={label ?? 'Photo'} draggable={false} />
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
      {!isPhoto && (
        <button
          type="button"
          className="jukebox-screensaver-view-button"
          onClick={(e) => { e.stopPropagation(); onView(current); }}
        >
          View {label}
        </button>
      )}
    </div>
  );
};

export default JukeboxScreensaver;
