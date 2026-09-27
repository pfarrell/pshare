import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import JukeboxLogin from './JukeboxLogin';
import JukeboxNowPlaying from './JukeboxNowPlaying';
import JukeboxBrowsePanel from './JukeboxBrowsePanel';
import JukeboxFooterStrip from './JukeboxFooterStrip';
import JukeboxToast from './JukeboxToast';
import JukeboxKeyboard from './JukeboxKeyboard';
import { useJukeboxKeyboardFocus } from './useJukeboxKeyboardFocus';
import { useJukeboxQueueEvents } from './useJukeboxQueueEvents';
import MusicPlayerWrapper from '../components/player/MusicPlayerWrapper';

// How long the drawer can sit open with no touch inside it before it closes
// itself back to Now Playing.
const IDLE_CLOSE_MS = 15000;
// How long the enqueue confirmation toast stays visible.
const TOAST_DURATION_MS = 2500;

const JukeboxApp = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const jukeboxDeviceId = useAuthStore((s) => s.jukeboxDeviceId ?? null);
  // Which drawer destination is showing; null = drawer closed. Tapping Now
  // Playing or the footer strip toggles between null and 'browse'; the
  // drawer's own JukeboxDrawerMenu can switch directly to any destination
  // via onSelectDestination without closing.
  const [activeDestination, setActiveDestination] = useState(null);
  // Set when the tracks panel's artist link is tapped: the target artist to
  // show in Search's drill-down view, carried across a destination switch to
  // Search if one is needed. JukeboxBrowsePanel consumes it (pushes it as the
  // artist view) and reports back via onPendingArtistConsumed.
  const [pendingArtist, setPendingArtist] = useState(null);
  // The platform's own on-screen keyboard (squeekboard + labwc) proved
  // unreliable on the actual kiosk hardware, so this shell provides its own —
  // see JukeboxKeyboard.jsx. Called unconditionally (before the early return
  // below) since it's a hook.
  const focusedInput = useJukeboxKeyboardFocus();
  // Opens the kiosk's own SSE connection for phone-enqueue delivery; a no-op
  // until jukeboxDeviceId is known (pre-login). Called unconditionally, like
  // useJukeboxKeyboardFocus above, since it's a hook.
  useJukeboxQueueEvents(jukeboxDeviceId);

  // Enqueueing something (a track, an album, an artist/collection shuffle)
  // from Browse closes everything, so the kiosk lands back on Now Playing
  // instead of leaving the drawer open over it.
  const closeAll = () => setActiveDestination(null);
  const toggleBrowse = () => setActiveDestination((current) => (current === null ? 'browse' : null));

  // A brief, generic confirmation that an enqueue actually did something —
  // otherwise closing the drawer is the only feedback, which looks
  // identical to a no-op tap. Deliberately separate from closeAll: closeAll
  // is also called by the idle-close timer below, which must never claim
  // something was added to the queue.
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);
  const handleEnqueue = () => {
    closeAll();
    setToastMessage('Added to queue');
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), TOAST_DURATION_MS);
  };
  // "Close the album page and show this artist's albums as if we'd
  // searched" — switches to Browse (a no-op if already there) and hands the
  // artist to the drawer.
  const jumpToArtist = (artist) => {
    setActiveDestination('browse');
    setPendingArtist(artist);
  };

  // Auto-close on inactivity: armed only while the drawer is open, reset by
  // any pointerdown inside it (Search, Next Up, Settings, drill-downs, or
  // the tracks/playlist side panels — which render as siblings of
  // .jukebox-browse-panel, not children, see JukeboxBrowsePanel.jsx) or on
  // the on-screen keyboard (also a sibling, not a descendant — see
  // JukeboxKeyboard.jsx — but typing into a Search box it's editing counts
  // as drawer activity just the same). Touches on Now Playing or the footer
  // strip don't count — those already have their own explicit close
  // behavior (toggleBrowse above). Also suspended while an AI Mix generation
  // is in flight (up to 45s with nobody touching anything — closing would
  // unmount JukeboxAiMixTab and discard the already-billed result); when it
  // settles, this effect re-runs and arms a fresh full-length timer.
  const [aiMixGenerating, setAiMixGenerating] = useState(false);
  const idleTimerRef = useRef(null);
  useEffect(() => {
    if (activeDestination === null || aiMixGenerating) {
      clearTimeout(idleTimerRef.current);
      return undefined;
    }
    const armTimer = () => {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(closeAll, IDLE_CLOSE_MS);
    };
    const handlePointerDown = (e) => {
      if (e.target.closest('.jukebox-browse-panel, .jukebox-tracks-panel, .jukebox-playlist-panel, .jukebox-keyboard')) {
        armTimer();
      }
    };
    armTimer();
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      clearTimeout(idleTimerRef.current);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [activeDestination, aiMixGenerating]);

  // Wrapped in .jukebox-app too: the login screen is the first thing a fresh
  // kiosk shows, and it needs the shell's dark ground and kiosk-scale sizing
  // just as much as the authenticated view does.
  if (!isAuthenticated) {
    return (
      <div className="jukebox-app">
        <JukeboxLogin />
        <JukeboxKeyboard targetElement={focusedInput} />
      </div>
    );
  }

  return (
    <div className="jukebox-app">
      <JukeboxNowPlaying onTap={toggleBrowse} />
      <JukeboxToast message={toastMessage} />
      <JukeboxBrowsePanel
        activeDestination={activeDestination}
        onSelectDestination={setActiveDestination}
        onEnqueue={handleEnqueue}
        pendingArtist={pendingArtist}
        onJumpToArtist={jumpToArtist}
        onPendingArtistConsumed={() => setPendingArtist(null)}
        onGeneratingChange={setAiMixGenerating}
      />
      <JukeboxFooterStrip onTap={toggleBrowse} />
      {/* MusicPlayerWrapper owns both <audio> elements and usePlayerEngine
          (gapless prefetch, Media Session, play logging), so it must stay
          mounted — but its own controls are replaced by the footer strip and
          the Next Up transport, so it's hidden. Its <audio> elements were
          already display:none, so playback is unaffected. */}
      <div className="jukebox-engine" hidden>
        <MusicPlayerWrapper />
      </div>
      <JukeboxKeyboard targetElement={focusedInput} />
    </div>
  );
};

export default JukeboxApp;
