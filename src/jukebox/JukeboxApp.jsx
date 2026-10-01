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
import { useJukeboxStatePublisher } from './jukeboxStatePublisher';
import MusicPlayerWrapper from '../components/player/MusicPlayerWrapper';
import { useJukeboxScreensaverStore } from '../stores/jukeboxScreensaverStore';
import JukeboxScreensaver from './JukeboxScreensaver';
import JukeboxFactoidScreensaver from './JukeboxFactoidScreensaver';
import MilkdropCanvas from '../components/visualizer/MilkdropCanvas';

// How long the drawer can sit open with no touch inside it before it closes
// itself back to Now Playing.
const IDLE_CLOSE_MS = 15000;
// How long the enqueue confirmation toast stays visible.
const TOAST_DURATION_MS = 2500;
// How long the kiosk must sit untouched (drawer closed; playback or not)
// before the screensaver takes over.
const SCREENSAVER_IDLE_MS = 2 * 60 * 1000;
// Testing aid: a whole number of seconds in localStorage under this key
// shortens the idle delay without a redeploy (e.g. to watch the screensaver
// without waiting two minutes). Anything unusable, or under the floor, is
// ignored so a typo can never make the screensaver fire constantly.
const SCREENSAVER_IDLE_OVERRIDE_KEY = 'jukebox-screensaver-idle-seconds';
const SCREENSAVER_IDLE_MIN_SECONDS = 5;

const screensaverIdleMs = () => {
  try {
    const seconds = Number(localStorage.getItem(SCREENSAVER_IDLE_OVERRIDE_KEY));
    if (Number.isFinite(seconds) && seconds >= SCREENSAVER_IDLE_MIN_SECONDS) return seconds * 1000;
  } catch {
    // localStorage can throw (private windows, blocked site data); use the default.
  }
  return SCREENSAVER_IDLE_MS;
};

const JukeboxApp = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const jukeboxDeviceId = useAuthStore((s) => s.jukeboxDeviceId ?? null);
  // Which drawer destination is showing; null = drawer closed. Tapping Now
  // Playing or the footer strip toggles between null and 'browse'; the
  // drawer's own JukeboxDrawerMenu can switch directly to any destination
  // via onSelectDestination without closing.
  const [activeDestination, setActiveDestination] = useState(null);
  // Set when something elsewhere in the app wants Browse to jump straight to
  // an artist or album drill-down view: the tracks panel's artist link
  // (jumpToArtist below), or the idle screensaver's "View" button (which
  // calls jumpToItem directly, since it already knows whether it's showing
  // an album or an artist). Carried across a destination switch to Browse if
  // one is needed. JukeboxBrowsePanel consumes it (pushes the artist view,
  // or opens the tracks panel for an album) and reports back via
  // onPendingItemConsumed.
  const [pendingItem, setPendingItem] = useState(null);
  // The platform's own on-screen keyboard (squeekboard + labwc) proved
  // unreliable on the actual kiosk hardware, so this shell provides its own —
  // see JukeboxKeyboard.jsx. Called unconditionally (before the early return
  // below) since it's a hook.
  const focusedInput = useJukeboxKeyboardFocus();
  // Opens the kiosk's own SSE connection for phone-enqueue delivery; a no-op
  // until jukeboxDeviceId is known (pre-login). Called unconditionally, like
  // useJukeboxKeyboardFocus above, since it's a hook.
  useJukeboxQueueEvents(jukeboxDeviceId);
  // Publishes the queue for the phone Queue page. Same null-until-known rule.
  useJukeboxStatePublisher(jukeboxDeviceId);
  const screensaverMode = useJukeboxScreensaverStore((s) => s.mode);

  // Enqueueing something (a track, an album, an artist/collection shuffle)
  // from Browse closes everything, so the kiosk lands back on Now Playing
  // instead of leaving the drawer open over it.
  const closeAll = () => setActiveDestination(null);
  // The footer's queue and gear buttons: tapping the one for the destination
  // already showing goes back to Browse, since there is no drawer menu any
  // more to get back there from Next Up or Settings.
  const toggleDestination = (dest) => setActiveDestination((current) => (current === dest ? 'browse' : dest));
  const toggleBrowse = () => setActiveDestination((current) => (current === null ? 'browse' : null));

  // A brief, generic confirmation that something actually happened —
  // otherwise closing the drawer (enqueue) or nothing at all (save) is the
  // only feedback, which looks identical to a no-op tap. Shared by both
  // handlers below, each of which decides for itself whether to closeAll —
  // showToast never does, since the idle-close timer also calls closeAll
  // and must never look like it's claiming something happened.
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(toastTimerRef.current), []);
  const showToast = (message, durationMs = TOAST_DURATION_MS) => {
    setToastMessage(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), durationMs);
  };
  const handleEnqueue = () => {
    closeAll();
    showToast('Added to queue');
  };
  // Saving doesn't close the drawer or interrupt playback — Next Up stays
  // open and the queue keeps playing, unlike enqueue above.
  // durationMs lets AI Mix hold the name on screen longer, since a generated
  // playlist's name isn't one you typed and needs to be read to be remembered.
  const handlePlaylistSaved = (name, durationMs) => showToast(`Saved as "${name}"`, durationMs);
  // "Close the album/artist page and show this item as if we'd searched" —
  // switches to Browse (a no-op if already there) and hands the item to the
  // drawer. Generic over artist/album so both the tracks panel's artist link
  // and the idle screensaver's View button can share it.
  const jumpToItem = (item) => {
    setActiveDestination('browse');
    setPendingItem(item);
  };
  const jumpToArtist = (artist) => jumpToItem({ type: 'artist', data: artist });

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

  // Idle screensaver: armed only from the closed-drawer Now Playing screen
  // (never while a drawer destination is open — see the drawer's own
  // idle-close effect above, which returns here first). Playback does not
  // matter: art shows over a playing kiosk too, and audio keeps going
  // underneath. Any pointerdown anywhere resets the timer; the drawer
  // opening or the feature being turned off in Settings force it off
  // immediately, not just block future activations.
  const [screensaverActive, setScreensaverActive] = useState(false);
  // Set when the visualizer cannot start (no WebGL, lazy chunk failed to
  // fetch). A black rectangle is indistinguishable from a dead kiosk, so we
  // fall back to the music screensaver for the rest of this page's life.
  const [visualizerFailed, setVisualizerFailed] = useState(false);
  const screensaverTimerRef = useRef(null);
  useEffect(() => {
    if (activeDestination !== null || screensaverMode === 'off') {
      clearTimeout(screensaverTimerRef.current);
      setScreensaverActive(false);
      return undefined;
    }
    const arm = () => {
      clearTimeout(screensaverTimerRef.current);
      screensaverTimerRef.current = setTimeout(() => setScreensaverActive(true), screensaverIdleMs());
    };
    arm();
    document.addEventListener('pointerdown', arm);
    return () => {
      clearTimeout(screensaverTimerRef.current);
      document.removeEventListener('pointerdown', arm);
    };
  }, [activeDestination, screensaverMode]);

  // Explicit alongside the effect's own teardown above (which fires once
  // activeDestination changes) so the dismissal is immediate rather than
  // waiting a render cycle.
  const handleScreensaverView = (item) => {
    setScreensaverActive(false);
    jumpToItem(item);
  };

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
      {screensaverActive && (
        screensaverMode === 'factoids' ? (
          <JukeboxFactoidScreensaver
            onDismiss={() => setScreensaverActive(false)}
            onView={handleScreensaverView}
          />
        ) : screensaverMode === 'visualizer' && !visualizerFailed ? (
          <MilkdropCanvas
            onDismiss={() => setScreensaverActive(false)}
            onFail={() => setVisualizerFailed(true)}
          />
        ) : (
          <JukeboxScreensaver
            mode={screensaverMode === 'visualizer' ? 'music' : screensaverMode}
            onDismiss={() => setScreensaverActive(false)}
            onView={handleScreensaverView}
          />
        )
      )}
      <JukeboxBrowsePanel
        activeDestination={activeDestination}
        onSelectDestination={setActiveDestination}
        onEnqueue={handleEnqueue}
        pendingItem={pendingItem}
        onJumpToArtist={jumpToArtist}
        onPendingItemConsumed={() => setPendingItem(null)}
        onGeneratingChange={setAiMixGenerating}
        onPlaylistSaved={handlePlaylistSaved}
      />
      <JukeboxFooterStrip
        onOpenQueue={() => toggleDestination('nextup')}
        onOpenSettings={() => toggleDestination('settings')}
      />
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
