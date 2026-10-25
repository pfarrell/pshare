import { create } from 'zustand';
import { apiService } from '../services/api';
import { isSpotifyTrack, localTrackIds } from '../utils/trackSource';

// "Shuffle scope" (collection, artist, ...) fetches tracks from the scope in batches rather
// than all at once (a scope can be large) — an initial batch on entry, then another whenever
// the queue is down to this many unplayed tracks (see the top-up effect in usePlayerEngine).
export const SCOPE_SHUFFLE_BATCH_SIZE = 25;
export const SCOPE_SHUFFLE_TOPUP_REMAINING = 5;

// Play no longer clears the queue on every primary Play action (see useQueueActions.play) —
// it appends and jumps, leaving whatever was previously queued behind the play pointer as
// history. Bounds how much of that history is kept so the queue array doesn't grow forever;
// upcoming (not-yet-played) tracks are never trimmed regardless of queue length.
export const MAX_QUEUE_HISTORY = 100;

const validateTrack = (track) => {
  if (isSpotifyTrack(track)) {
    if (!track.title || !track.uri) {
      throw new Error('Invalid track object. Spotify tracks must contain title and uri properties');
    }
    return;
  }
  if (!track || !track.title || !track.url) {
    throw new Error('Invalid track object. Must contain at least title and url properties');
  }
};

// Pure function: given the fields that decide "what plays after this," resolves the next
// playlist index (or -1 if there is none). Shuffle's pick is rolled once here and reused by
// playNext() rather than rolled again at advance time, so it's knowable ahead of time —
// required for prefetching the next track before the current one ends.
const computeNextIndex = ({ playbackMode, shuffleHistory, playlist, currentTrackIndex }) => {
  if (playlist.length === 0) return -1;
  if (playbackMode === 'repeat-one') return currentTrackIndex;
  // Tracks arrive pre-randomized from the server (see enterScopeShuffle /
  // appendScopeShuffleTracks), so "next" is just the next queued slot.
  if (playbackMode === 'shuffle-scope') {
    return currentTrackIndex < playlist.length - 1 ? currentTrackIndex + 1 : -1;
  }
  if (playbackMode === 'shuffle') {
    const remaining = playlist.map((_, i) => i).filter((i) => !shuffleHistory.includes(i));
    if (remaining.length === 0) return -1;
    return remaining[Math.floor(Math.random() * remaining.length)];
  }
  if (currentTrackIndex === playlist.length - 1) {
    return playbackMode === 'repeat-all' ? 0 : -1;
  }
  return currentTrackIndex + 1;
};

// A ~0-length silent WAV, used only to "unlock" the standby <audio> element for iOS Safari —
// WebKit only allows a media element's *first* play() to succeed if it's called synchronously
// inside a user gesture. The standby element is never played by a real gesture (its first
// .play() happens later, inside a timeupdate/ended handler during a gapless handoff), so we
// preemptively call play()/pause() on it here, inside the same gesture that starts the very
// first track, while we still can.
const SILENT_AUDIO_DATA_URI = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const unlockAudioElement = (audioElement) => {
  if (!audioElement) return;
  audioElement.src = SILENT_AUDIO_DATA_URI;
  audioElement.play()
    .then(() => {
      // Something real may have been loaded into it while play() was pending.
      if (audioElement.src === SILENT_AUDIO_DATA_URI) audioElement.pause();
    })
    .catch(() => {});
};

const standbyMatchesTarget = (standby, target) => !!standby && !!target?.url && standby.src.endsWith(target.url);

// --- Spotify source plumbing (experimental, #72) ---------------------------------------------
// A SpotifySource (registered later via setSpotifySource) is a second playback engine beside the
// <audio> pair. Every call into it is wrapped: Spotify failures only ever warn, never throw into
// a transport action (and from there into a render).
const callSpotify = (source, method, ...args) => {
  if (!source) return;
  try {
    Promise.resolve(source[method](...args)).catch((error) => console.warn(`Spotify ${method} failed:`, error));
  } catch (error) {
    console.warn(`Spotify ${method} failed:`, error);
  }
};

const spotifyCanStart = (source, auto) => {
  try {
    return !!source && source.isAvailable() && !(auto && source.isDisplaced());
  } catch (error) {
    console.warn('Spotify availability check failed:', error);
    return false;
  }
};

const activateSpotify = (source) => {
  try {
    source?.activate();
  } catch (error) {
    console.warn('Spotify activate failed:', error);
  }
};

// Identifies the latest playTrackAtIndex/clearPlaylist call, so a Spotify start() that settles
// after the user has moved on is recognized as stale (index alone isn't enough — trimQueueHistory
// shifts indices).
let playAttempt = 0;

// Silences the <audio> pair when a Spotify track takes over. Kept as its own step so a later
// change can defer it for auto (non-manual) local→Spotify advances until start() resolves.
const pauseLocalAudio = (get) => {
  get().audioElementA?.pause();
  get().audioElementB?.pause();
};

const playSpotifyTrackAtIndex = (set, get, index, auto, attempt) => {
  const { playlist, playbackMode, shuffleHistory, standbyUnlocked, spotifySource } = get();
  const track = playlist[index];
  const nextShuffleHistory = playbackMode === 'shuffle' && !shuffleHistory.includes(index) ? [...shuffleHistory, index] : shuffleHistory;
  pauseLocalAudio(get);
  set({
    activeSource: 'spotify',
    currentTrackIndex: index,
    currentTrack: track,
    playlistFinished: false,
    shuffleHistory: nextShuffleHistory,
    isPlaying: true,
    // <audio> buffering events are ignored while Spotify is active, so don't leave a stale spinner.
    isBuffering: false,
    currentTime: 0,
    duration: Number.isFinite(track.duration) ? track.duration : 0,
  });
  if (!standbyUnlocked) {
    unlockAudioElement(get().getStandbyAudio());
    activateSpotify(spotifySource);
    set({ standbyUnlocked: true });
  }
  get().trimQueueHistory();
  get().syncNextTrackIndex();

  if (!auto) {
    try {
      spotifySource?.clearDisplaced();
    } catch (error) {
      console.warn('Spotify clearDisplaced failed:', error);
    }
  }
  if (!spotifyCanStart(spotifySource, auto)) {
    get().skipUnplayable(get().currentTrackIndex);
    return;
  }

  const isCurrentAttempt = () => attempt === playAttempt && get().activeSource === 'spotify';
  let started;
  try {
    started = Promise.resolve(spotifySource.start(track));
  } catch (error) {
    started = Promise.reject(error);
  }
  started.then(
    () => {
      if (isCurrentAttempt()) {
        set({ consecutiveSkips: 0 });
        // Paused (togglePlayPause) while start() was still pending.
        if (!get().isPlaying) callSpotify(spotifySource, 'pause');
        return;
      }
      // Stale: the user moved on while start() was pending. Silence it — unless a newer Spotify
      // start is already underway on the same source, which replaces this one on its own (pausing
      // here could stop that newer track instead).
      const { activeSource, isPlaying } = get();
      if (activeSource !== 'spotify' || !isPlaying) callSpotify(spotifySource, 'pause');
    },
    (error) => {
      console.warn('Spotify start failed:', error);
      if (isCurrentAttempt()) get().skipUnplayable(get().currentTrackIndex);
    },
  );
};

export const usePlayerStore = create((set, get) => ({
  // DOM bridge — two raw <audio> elements, set once by usePlayerEngine on mount. activeSlot
  // says which one is currently "live"; the other is standby, used to gaplessly prefetch and
  // hand off to the next track (see Task 3).
  audioElementA: null,
  audioElementB: null,
  activeSlot: 'a',
  setAudioElement: (slot, audioElement) => set(slot === 'a' ? { audioElementA: audioElement } : { audioElementB: audioElement }),
  getActiveAudio: () => (get().activeSlot === 'a' ? get().audioElementA : get().audioElementB),
  getStandbyAudio: () => (get().activeSlot === 'a' ? get().audioElementB : get().audioElementA),

  // Playback state
  playlist: [],
  currentTrackIndex: -1,
  currentTrack: null,
  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  playlistFinished: false,
  // The playlist index that will play after the current track, kept in sync by every action
  // that mutates playlist/currentTrackIndex/playbackMode/shuffleHistory. -1 means there is no next track.
  nextTrackIndex: -1,
  // Whether the standby element has been unlocked for iOS. Set to true after the first playTrackAtIndex call.
  standbyUnlocked: false,

  // Which engine is currently producing sound: the <audio> pair ('local') or the registered
  // SpotifySource ('spotify'). usePlayerEngine ignores <audio> events while this is 'spotify'.
  activeSource: 'local',
  spotifySource: null,
  setSpotifySource: (spotifySource) => set({ spotifySource: spotifySource ?? null }),
  // Unplayable (Spotify) tracks skipped in a row without anything actually starting. Caps the
  // skip chain at one pass over the queue so repeat-all/shuffle can't spin forever.
  consecutiveSkips: 0,

  // Tracks belonging to whatever detail page (album, etc.) is currently mounted, kept in sync
  // by that page's own effect. Lets togglePlayPause start playing this page's tracks when the
  // playlist is empty, instead of trying to resume a track that was never loaded.
  pageTracks: [],
  setPageTracks: (tracks) => set({ pageTracks: tracks || [] }),

  // The source of the most recent primary "Play" action — e.g. { type: 'collection', id } or
  // { type: 'album', id } — set only by useQueueActions' play() (never by playNext/addToQueue).
  // Used for two things: (1) deriving a scope for the manual "shuffle scope" playback mode,
  // only meaningful when type is 'collection'/'artist' (see cyclePlaybackMode/
  // enterScopeShuffle below), and (2) usePlayerEngine's queue-exhaustion auto-continue effect,
  // which knows how to keep going for all four types. Cleared by any generic queue mutation
  // below, same as collectionContext/scopeContext (which this field replaces) were.
  queueSource: null,
  setQueueSource: (queueSource) => set({ queueSource }),

  // Shuffle/repeat state
  playbackMode: 'off', // 'off' | 'shuffle' | 'shuffle-scope' | 'repeat-all' | 'repeat-one'
  shuffleHistory: [],

  // UI state
  drawerOpen: false,
  activityPulseToken: 0,
  // Playlist positions (not track ids — the same track can legitimately
  // appear twice) from the most recent flashActivity add. Replaced wholesale
  // on each add (not merged) so only the latest batch flashes when the
  // drawer opens, and cleared by the drawer itself once shown so it doesn't
  // flash again.
  recentlyAddedIndices: [],
  clearRecentlyAdded: () => set({ recentlyAddedIndices: [] }),

  // Internal setters — called only by usePlayerEngine in response to <audio> events
  setIsPlaying: (isPlaying) => set(isPlaying ? { isPlaying, consecutiveSkips: 0 } : { isPlaying }),
  setBuffering: (isBuffering) => set({ isBuffering }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  // Internal — recomputed at the end of every action that changes what "next" resolves to.
  syncNextTrackIndex: () => set({ nextTrackIndex: computeNextIndex(get()) }),

  // Internal — keeps at most MAX_QUEUE_HISTORY tracks before currentTrackIndex, dropping the
  // oldest ones once there are more. Called after every move of currentTrackIndex
  // (playTrackAtIndex, and playNext's gapless-handoff fast path which bypasses
  // playTrackAtIndex). Upcoming (index >= currentTrackIndex) tracks are never touched.
  trimQueueHistory: () => {
    const { playlist, currentTrackIndex, shuffleHistory, recentlyAddedIndices } = get();
    if (currentTrackIndex <= MAX_QUEUE_HISTORY) return;
    const dropCount = currentTrackIndex - MAX_QUEUE_HISTORY;
    set({
      playlist: playlist.slice(dropCount),
      currentTrackIndex: currentTrackIndex - dropCount,
      shuffleHistory: shuffleHistory.filter((i) => i >= dropCount).map((i) => i - dropCount),
      recentlyAddedIndices: recentlyAddedIndices.filter((i) => i >= dropCount).map((i) => i - dropCount),
    });
  },

  ensureStandbyLoaded: () => {
    const { nextTrackIndex, playlist } = get();
    const standby = get().getStandbyAudio();
    const target = nextTrackIndex === -1 ? null : playlist[nextTrackIndex];
    if (!standby || !target || isSpotifyTrack(target) || standbyMatchesTarget(standby, target)) return;
    standby.src = target.url;
    standby.load();
  },

  // Transport
  // `auto` is true only for advances nobody asked for (playNext without manual, skipUnplayable).
  playTrackAtIndex: (index, { auto = false } = {}) => {
    const { playlist, playbackMode, shuffleHistory, standbyUnlocked } = get();
    const audioElement = get().getActiveAudio();
    if (index < 0 || index >= playlist.length || !audioElement) return;
    const track = playlist[index];
    playAttempt += 1;
    // A deliberate selection starts a fresh skip budget.
    if (!auto) set({ consecutiveSkips: 0 });
    if (isSpotifyTrack(track)) {
      playSpotifyTrackAtIndex(set, get, index, auto, playAttempt);
      return;
    }
    if (get().activeSource === 'spotify') callSpotify(get().spotifySource, 'pause');
    set({ activeSource: 'local' });
    const nextShuffleHistory = playbackMode === 'shuffle' && !shuffleHistory.includes(index) ? [...shuffleHistory, index] : shuffleHistory;
    // isPlaying is set optimistically here rather than left for the <audio>
    // element's async 'play' event (usePlayerEngine's handlePlay) to set it.
    // addTrack/addTracks read isPlaying to decide whether a newly queued track
    // should auto-start — leaving it false for the real gap between "we called
    // .play()" and "the browser fired 'play'" (which can be hundreds of ms on
    // a cold network fetch) let any enqueue action that landed in that window
    // force-interrupt what was just started instead of queuing behind it. The
    // real 'play' event still fires and just re-confirms this, a no-op; if
    // playback actually fails, the .catch() below reverts it.
    set({ currentTrackIndex: index, currentTrack: track, playlistFinished: false, shuffleHistory: nextShuffleHistory, isPlaying: true });
    audioElement.src = track.url;
    audioElement.load();
    audioElement.play().catch((error) => {
      console.error('Playback failed:', error);
      // Only revert if this attempt is still the current one — a later
      // playTrackAtIndex call may have already superseded it, and we must not
      // stomp on that newer attempt's optimistic isPlaying:true.
      if (get().currentTrackIndex === index) set({ isPlaying: false });
    });
    if (!standbyUnlocked) {
      unlockAudioElement(get().getStandbyAudio());
      activateSpotify(get().spotifySource);
      set({ standbyUnlocked: true });
    }
    get().trimQueueHistory();
    get().syncNextTrackIndex();
  },

  // A track that can't play in this session (Spotify unavailable/displaced/failed to start):
  // move past it silently. Stops once a whole queue's worth of tracks has been skipped in a row.
  skipUnplayable: (index) => {
    const consecutiveSkips = get().consecutiveSkips + 1;
    if (consecutiveSkips >= get().playlist.length) {
      set({ consecutiveSkips, playlistFinished: true, isPlaying: false });
      return;
    }
    set({ consecutiveSkips, currentTrackIndex: index });
    if (get().playbackMode === 'repeat-one') {
      // Repeat-one would re-target this same unplayable track; skip past it the way a manual
      // Next does. playTrackAtIndex re-syncs nextTrackIndex, so repeat-one applies to whatever
      // plays next.
      set({ nextTrackIndex: computeNextIndex({ ...get(), playbackMode: 'off' }) });
    } else {
      get().syncNextTrackIndex();
    }
    get().playNext();
  },

  // For a gesture whose playback only starts after async work (a voice
  // command's search, say): unlock any element that hasn't played yet while
  // we're still inside the gesture. The active element is only touched before
  // anything has ever been loaded into it, so a real track is never replaced.
  unlockForGesture: () => {
    const { currentTrack, standbyUnlocked } = get();
    activateSpotify(get().spotifySource);
    if (!currentTrack) unlockAudioElement(get().getActiveAudio());
    if (!standbyUnlocked) {
      unlockAudioElement(get().getStandbyAudio());
      set({ standbyUnlocked: true });
    }
  },

  togglePlayPause: () => {
    const { playlistFinished, playlist, pageTracks, playbackMode, currentTrackIndex, activeSource, isPlaying, spotifySource } = get();
    const audioElement = get().getActiveAudio();
    if (!audioElement) return;
    // While Spotify is active the <audio> pair sits paused, so its `paused` flag says nothing.
    const spotifyActive = activeSource === 'spotify';
    if (spotifyActive ? !isPlaying : audioElement.paused) {
      if (playlist.length === 0) {
        if (pageTracks.length > 0) {
          get().addTracks(pageTracks);
        }
        return;
      }
      if (playlistFinished || currentTrackIndex === -1) {
        if (playbackMode === 'shuffle' && playlist.length > 1) {
          let startIndex;
          do {
            startIndex = Math.floor(Math.random() * playlist.length);
          } while (startIndex === currentTrackIndex);
          set({ shuffleHistory: [] });
          get().playTrackAtIndex(startIndex);
        } else {
          get().playTrackAtIndex(0);
        }
      } else if (spotifyActive) {
        set({ isPlaying: true });
        callSpotify(spotifySource, 'resume');
      } else {
        audioElement.play().catch((error) => console.error('Playback failed:', error));
      }
    } else if (spotifyActive) {
      set({ isPlaying: false });
      callSpotify(spotifySource, 'pause');
    } else {
      audioElement.pause();
    }
  },

  seek: (time) => {
    if (get().activeSource === 'spotify') {
      if (!Number.isFinite(time)) return;
      set({ currentTime: time });
      callSpotify(get().spotifySource, 'seek', time);
      return;
    }
    const audioElement = get().getActiveAudio();
    if (!audioElement || !Number.isFinite(time)) return;
    audioElement.currentTime = time;
  },

  playNext: ({ manual = false } = {}) => {
    const { playbackMode, shuffleHistory, nextTrackIndex, playlist, activeSlot, currentTrackIndex, activeSource } = get();
    const audioElement = get().getActiveAudio();
    const spotifyActive = activeSource === 'spotify';
    const targetIndex = manual && playbackMode === 'repeat-one'
      ? computeNextIndex({ playbackMode: 'off', shuffleHistory, playlist, currentTrackIndex })
      : nextTrackIndex;
    if (targetIndex === -1) {
      set({ playlistFinished: true });
      audioElement?.pause();
      if (spotifyActive) {
        // No <audio> 'pause' event will report this while Spotify is the active source.
        set({ isPlaying: false });
        callSpotify(get().spotifySource, 'pause');
      }
      return;
    }
    if (playbackMode === 'shuffle') {
      set({ shuffleHistory: [...shuffleHistory, targetIndex] });
    }

    const standby = get().getStandbyAudio();
    const target = playlist[targetIndex];
    const standbyReady = standbyMatchesTarget(standby, target) && standby.readyState >= 3; // HAVE_FUTURE_DATA

    if (!standbyReady || isSpotifyTrack(target)) {
      get().playTrackAtIndex(targetIndex, { auto: !manual });
      return;
    }

    if (spotifyActive) {
      // Spotify → local gapless-ready: silence Spotify, then the usual slot flip below.
      callSpotify(get().spotifySource, 'pause');
      set({ activeSource: 'local' });
    }

    set({
      activeSlot: activeSlot === 'a' ? 'b' : 'a',
      currentTrackIndex: targetIndex,
      currentTrack: target,
      playlistFinished: false,
      currentTime: 0,
      duration: Number.isFinite(standby.duration) ? standby.duration : 0,
    });
    // The outgoing element only stops on its own when it reaches a natural 'ended' — a manual
    // skip (UI button, media-session/Bluetooth 'nexttrack') can land here while it's still mid-track,
    // and without this it keeps playing in the background, inaudible to any further transport control.
    audioElement?.pause();
    standby.play().catch((error) => console.error('Playback failed:', error));
    get().trimQueueHistory();
    get().syncNextTrackIndex();
  },

  playPrev: () => {
    const { playbackMode, shuffleHistory, playlist, currentTrackIndex, currentTime } = get();
    if (playlist.length === 0) return;
    if (currentTime > 3) {
      get().seek(0);
      return;
    }
    set({ playlistFinished: false });
    if (playbackMode === 'shuffle' && shuffleHistory.length > 1) {
      const newHistory = shuffleHistory.slice(0, -1);
      const prevIndex = newHistory[newHistory.length - 1];
      set({ shuffleHistory: newHistory });
      get().playTrackAtIndex(prevIndex);
      return;
    }
    const prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
    get().playTrackAtIndex(prevIndex);
  },

  // Shuffle Scope only ever appears as a cycle stop when a scope is available — a queueSource
  // whose type is 'collection' or 'artist' (set by the entity's Play action; see
  // useQueueActions) — there's nothing for it to shuffle otherwise.
  cyclePlaybackMode: () => {
    const { playbackMode, currentTrackIndex, shuffleHistory, queueSource } = get();
    const hasShuffleScope = queueSource?.type === 'collection' || queueSource?.type === 'artist';
    const order = hasShuffleScope
      ? ['off', 'shuffle-scope', 'shuffle', 'repeat-all', 'repeat-one']
      : ['off', 'shuffle', 'repeat-all', 'repeat-one'];
    const next = order[(order.indexOf(playbackMode) + 1) % order.length];
    set({
      playbackMode: next,
      shuffleHistory: next === 'shuffle' && currentTrackIndex >= 0 ? [currentTrackIndex] : shuffleHistory,
    });
    if (next === 'shuffle-scope') {
      get().enterScopeShuffle();
    } else {
      get().syncNextTrackIndex();
    }
  },

  // Entered only via cyclePlaybackMode landing on 'shuffle-scope'. The currently playing track
  // keeps playing uninterrupted (mirrors how toggling plain Shuffle on today reshuffles what's
  // next without restarting playback) — everything queued after it is dropped and replaced
  // with a fresh random batch from the whole scope. Unlike addTracks, this does NOT clear
  // queueSource, since the point is to keep shuffling within it.
  enterScopeShuffle: async () => {
    const { playlist, currentTrackIndex, queueSource } = get();
    const scope = (queueSource?.type === 'collection' || queueSource?.type === 'artist') ? queueSource : null;
    if (!scope) return;
    const truncated = currentTrackIndex >= 0 ? playlist.slice(0, currentTrackIndex + 1) : [];
    set({ playlist: truncated });
    get().syncNextTrackIndex();
    try {
      const response = await apiService.getRandomScopeTracks(scope.type, scope.id, {
        limit: SCOPE_SHUFFLE_BATCH_SIZE,
        excludeTrackIds: localTrackIds(truncated),
      });
      if (get().playbackMode !== 'shuffle-scope') return;
      get().appendScopeShuffleTracks(response.data?.tracks || []);
    } catch (error) {
      console.error('Failed to load scope shuffle tracks:', error);
    }
  },

  // Shared by enterScopeShuffle (initial batch) and usePlayerEngine's top-up effect
  // (subsequent batches, fetched as the queue runs low). Appends without touching
  // queueSource or currentTrackIndex.
  appendScopeShuffleTracks: (tracks) => {
    if (!tracks || tracks.length === 0) return;
    set({ playlist: [...get().playlist, ...tracks] });
    get().syncNextTrackIndex();
  },

  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen })),
  closeDrawer: () => set({ drawerOpen: false }),

  triggerActivityPulse: () => set((state) => ({ activityPulseToken: state.activityPulseToken + 1 })),

  // Queue management
  addTrack: (track, { flashActivity = false, playImmediately = false } = {}) => {
    validateTrack(track);
    const { playlist, isPlaying } = get();
    const newPlaylist = [...playlist, track];
    set({ playlist: newPlaylist, queueSource: null });
    if (flashActivity) {
      set({ recentlyAddedIndices: [newPlaylist.length - 1] });
      get().triggerActivityPulse();
    }
    if (playImmediately || !isPlaying) {
      get().playTrackAtIndex(newPlaylist.length - 1);
    }
    get().syncNextTrackIndex();
  },

  // playImmediately jumps straight to the first newly-added track, bypassing the
  // shuffle-idle-random-start below — a deliberate "play this now" action (e.g. an
  // album's Play) always starts at the first track it just queued, not a random one.
  addTracks: (tracks, playNext = false, { flashActivity = false, playImmediately = false } = {}) => {
    if (!Array.isArray(tracks)) {
      throw new Error('Tracks must be provided as an array');
    }
    tracks.forEach(validateTrack);
    const { playlist, currentTrackIndex, isPlaying, playbackMode } = get();

    let newPlaylist;
    let startIndex;
    if (playNext && currentTrackIndex >= 0) {
      startIndex = currentTrackIndex + 1;
      newPlaylist = [...playlist.slice(0, startIndex), ...tracks, ...playlist.slice(startIndex)];
    } else {
      startIndex = playlist.length;
      newPlaylist = [...playlist, ...tracks];
    }

    set({ playlist: newPlaylist, queueSource: null });
    if (flashActivity) {
      const newIndices = tracks.map((_, i) => startIndex + i);
      set({ recentlyAddedIndices: newIndices });
      get().triggerActivityPulse();
    }
    if (playImmediately) {
      get().playTrackAtIndex(startIndex);
    } else if (!isPlaying) {
      if (playbackMode === 'shuffle' && newPlaylist.length > 1) {
        const randomIndex = Math.floor(Math.random() * newPlaylist.length);
        set({ shuffleHistory: [] });
        get().playTrackAtIndex(randomIndex);
      } else {
        get().playTrackAtIndex(startIndex);
      }
    }
    get().syncNextTrackIndex();
  },

  clearPlaylist: () => {
    const audioElement = get().getActiveAudio();
    playAttempt += 1;
    if (get().activeSource === 'spotify') {
      callSpotify(get().spotifySource, 'pause');
      set({ activeSource: 'local' });
    }
    set({
      playlist: [],
      currentTrackIndex: -1,
      currentTrack: null,
      isPlaying: false,
      shuffleHistory: [],
      playlistFinished: false,
      currentTime: 0,
      duration: 0,
      queueSource: null,
    });
    if (audioElement) {
      audioElement.pause();
      audioElement.src = '';
    }
    get().syncNextTrackIndex();
  },

  removeTrackFromPlaylist: (index) => {
    const { playlist, currentTrackIndex, playbackMode, shuffleHistory } = get();
    const audioElement = get().getActiveAudio();
    if (index < 0 || index >= playlist.length || index === currentTrackIndex) return;

    const newPlaylist = playlist.filter((_, i) => i !== index);
    let newCurrentIndex = currentTrackIndex;
    if (index < currentTrackIndex) newCurrentIndex -= 1;

    let newShuffleHistory = shuffleHistory;
    if (playbackMode === 'shuffle' && shuffleHistory.includes(index)) {
      newShuffleHistory = shuffleHistory.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));
    }

    set({ playlist: newPlaylist, currentTrackIndex: newCurrentIndex, shuffleHistory: newShuffleHistory, queueSource: null });

    if (newPlaylist.length === 0) {
      set({ currentTrackIndex: -1, currentTrack: null, isPlaying: false, currentTime: 0, duration: 0 });
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
      }
    }
    get().syncNextTrackIndex();
  },

  reorderPlaylist: (fromIndex, toIndex) => {
    const { playlist, currentTrackIndex } = get();
    if (fromIndex === toIndex) return;
    const currentTrackRef = playlist[currentTrackIndex];
    const newPlaylist = [...playlist];
    const [moved] = newPlaylist.splice(fromIndex, 1);
    let insertIndex = toIndex;
    if (fromIndex < toIndex) {
      insertIndex = toIndex - 1;
    }
    newPlaylist.splice(insertIndex, 0, moved);
    const newCurrentIndex = currentTrackRef ? newPlaylist.indexOf(currentTrackRef) : -1;
    set({ playlist: newPlaylist, currentTrackIndex: newCurrentIndex, queueSource: null });
    get().syncNextTrackIndex();
  },

  setPlaylist: (tracks) => {
    get().clearPlaylist();
    if (tracks.length > 0) {
      get().addTracks(tracks);
    }
  },
}));
