// src/jukebox/JukeboxFactoidScreensaver.jsx
import { useEffect, useRef, useState } from 'react';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import JukeboxScreensaver from './JukeboxScreensaver';

// Longer than the art screensaver's 20s: a sentence has to be read, not just
// glanced at.
const ROTATION_MS = 30000;

// Shows the host only. The full URL is useful in the admin panel but is noise
// on a kiosk from across the room.
const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

// Idle screensaver that shows cached factoids about whatever is playing.
// Generation happens in the backend worker; this component only ever reads the
// cache, which is why it is instant and costs nothing to leave running.
//
// When the cache has nothing for the current track it renders the music art
// screensaver instead. That is not an error path: an empty cache is the normal
// state on day one and for every newly uploaded album, and a black rectangle
// is indistinguishable from a dead kiosk (the same reasoning as
// JukeboxApp's visualizerFailed fallback).
const JukeboxFactoidScreensaver = ({ onDismiss, onView }) => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const trackId = currentTrack?.id ?? null;
  const [factoids, setFactoids] = useState(null); // null = still loading
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setIndex(0);

    const load = async () => {
      try {
        const res = trackId != null
          ? await apiService.getFactoidsForTrack(trackId)
          : await apiService.getRandomFactoids();
        if (cancelled) return;
        setFactoids(res?.data?.factoids ?? []);
      } catch {
        // Any failure is the same as an empty cache from here: fall through to
        // the art screensaver rather than showing nothing.
        if (!cancelled) setFactoids([]);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [trackId]);

  useEffect(() => {
    if (!factoids || factoids.length <= 1) return undefined;
    timerRef.current = setInterval(
      () => setIndex((i) => (i + 1) % factoids.length),
      ROTATION_MS,
    );
    return () => clearInterval(timerRef.current);
  }, [factoids]);

  // Still loading: render nothing rather than flashing the art screensaver for
  // one frame and then replacing it.
  if (factoids === null) return null;

  if (factoids.length === 0) {
    return <JukeboxScreensaver mode="music" onDismiss={onDismiss} onView={onView} />;
  }

  const current = factoids[index % factoids.length];
  // Optional chaining with a string fallback throughout: there is no error
  // boundary in this app, so a malformed row must never throw during render.
  const subject = typeof current?.subject === 'string' ? current.subject : null;
  const text = typeof current?.text === 'string' ? current.text : '';
  const host = typeof current?.source_url === 'string' ? hostOf(current.source_url) : null;
  const artPath = currentTrack?.image_path ?? null;
  const artUrl = artPath ? apiService.getImageUrl(artPath, 'album_page') : null;

  return (
    <div className="jukebox-factoid-screensaver" onClick={onDismiss}>
      {artUrl && (
        <img className="jukebox-factoid-screensaver-art" src={artUrl} alt="" draggable={false} />
      )}
      <div className="jukebox-factoid-screensaver-body">
        {subject && <p className="jukebox-factoid-screensaver-subject">About {subject}</p>}
        <p className="jukebox-factoid-screensaver-text">{text}</p>
        {host && <p className="jukebox-factoid-screensaver-source">{host}</p>}
      </div>
    </div>
  );
};

export default JukeboxFactoidScreensaver;
