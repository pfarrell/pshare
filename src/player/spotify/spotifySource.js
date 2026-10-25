// The SpotifySource the player store drives (see playerStore's "Spotify source plumbing"),
// implemented over an SDK adapter (spotifySdk.js in the app, a fake in tests).
//
// Contract used by the store: start(track) / pause() / resume() / seek(seconds) return
// Promises; isAvailable(), isDisplaced(), clearDisplaced() and activate() are synchronous.
// The hook (useSpotifyPlayback) additionally uses setDeviceId, setTokenFailed, getState and
// isSettled.
export const createSpotifySource = (adapter, { onDisplaced } = {}) => {
  let deviceId = null;
  let tokenFailed = false;
  let displaced = false;
  // True once a start() has landed (and until paused): only then does a null SDK state mean
  // another device took the playback away, rather than "nothing has started yet".
  let playing = false;
  // Starts run one at a time, so an older play request can never land on the device after a
  // newer one. A start superseded while waiting its turn is dropped without being sent.
  let generation = 0;
  let startChain = Promise.resolve();
  let commandsInFlight = 0;
  let lastTrack = null;

  const tracked = (run) => {
    commandsInFlight += 1;
    let promise;
    try {
      promise = Promise.resolve(run());
    } catch (error) {
      promise = Promise.reject(error);
    }
    return promise.finally(() => { commandsInFlight -= 1; });
  };

  adapter.onStateChange((state) => {
    if (state !== null || !playing || displaced) return;
    displaced = true;
    playing = false;
    onDisplaced?.();
  });

  const source = {
    setDeviceId: (id) => { deviceId = id ?? null; },
    setTokenFailed: (failed) => { tokenFailed = !!failed; },

    isAvailable: () => !!deviceId && !tokenFailed,
    isDisplaced: () => displaced,
    clearDisplaced: () => { displaced = false; },
    // True when no start/pause/resume is in flight, i.e. SDK state can be trusted to reflect
    // what the store last asked for.
    isSettled: () => commandsInFlight === 0,

    activate: () => {
      Promise.resolve()
        .then(() => adapter.activate())
        .catch((error) => console.warn('Spotify activate failed:', error));
    },

    start: (track) => {
      lastTrack = track;
      generation += 1;
      const gen = generation;
      playing = false;
      const run = startChain.catch(() => {}).then(async () => {
        if (gen !== generation) return; // superseded before its turn
        if (!deviceId) throw new Error('Spotify device is not ready');
        await adapter.playUri(track.uri, deviceId);
        if (gen === generation) playing = true;
      });
      startChain = run;
      return tracked(() => run);
    },

    pause: () => {
      playing = false;
      return tracked(() => adapter.pause());
    },

    resume: () => {
      // Another device has the session: SDK resume() would act on nothing, so take playback
      // back by starting the last track here again.
      if (displaced && lastTrack) {
        displaced = false;
        return source.start(lastTrack);
      }
      playing = true;
      return tracked(() => adapter.resume());
    },

    seek: (seconds) => tracked(() => adapter.seek(Math.max(0, Math.round(seconds * 1000)))),

    getState: () => adapter.getState(),
  };
  return source;
};
