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
  // Items already shown this session plus the cursor into them, so Prev can
  // step back and Next re-walks history before pulling fresh items.
  const historyRef = useRef([]);
  const cursorRef = useRef(-1);
  const goRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    // A mode or profile-filter change re-runs this effect — the previous
    // pool was fetched for the old mode/filter, so it must not keep
    // draining out on screen under the new one.
    queueRef.current = [];
    historyRef.current = [];
    cursorRef.current = -1;

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

    const show = (item) => setCurrent(item ?? null);

    const advance = async () => {
      if (cursorRef.current < historyRef.current.length - 1) {
        cursorRef.current += 1;
        show(historyRef.current[cursorRef.current]);
        return;
      }
      if (queueRef.current.length === 0) {
        const pool = await fetchPool();
        if (cancelled) return;
        queueRef.current = pool;
      }
      if (cancelled) return;
      const [next, ...rest] = queueRef.current;
      queueRef.current = rest;
      if (next) {
        historyRef.current.push(next);
        cursorRef.current = historyRef.current.length - 1;
      }
      show(next);
    };

    const back = () => {
      if (cursorRef.current <= 0) return;
      cursorRef.current -= 1;
      show(historyRef.current[cursorRef.current]);
    };

    // Manual nav restarts the rotation timer so a tapped-to photo gets its
    // full time on screen.
    const startTimer = () => {
      clearInterval(timerRef.current);
      timerRef.current = setInterval(advance, ROTATION_MS);
    };
    goRef.current = (dir) => {
      startTimer();
      return dir < 0 ? back() : advance();
    };

    advance();
    startTimer();
    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
    };
  }, [mode, activeProfileId]);

  const navigate = (e, dir) => {
    e.stopPropagation();
    goRef.current?.(dir);
  };

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
      <button
        type="button"
        className="jukebox-screensaver-nav jukebox-screensaver-nav-prev"
        aria-label="Previous"
        onClick={(e) => navigate(e, -1)}
      >
        &#8249;
      </button>
      <button
        type="button"
        className="jukebox-screensaver-nav jukebox-screensaver-nav-next"
        aria-label="Next"
        onClick={(e) => navigate(e, 1)}
      >
        &#8250;
      </button>
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
