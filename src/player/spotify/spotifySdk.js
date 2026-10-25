// Thin adapter over the Spotify Web Playback SDK (experimental, #72). The only file that
// touches window.Spotify. Not unit-tested (the SDK can't run in jsdom): keep logic out of here
// and in spotifySource.js / useSpotifyPlayback.js, which are tested against a fake adapter.

const SDK_SRC = 'https://sdk.scdn.co/spotify-player.js';
const PLAY_URL = 'https://api.spotify.com/v1/me/player/play';
const PLAY_TIMEOUT_MS = 8000;
// playUri always starts from 0, so a matching state further in than this is the *previous*
// playback of the same uri (repeat-one), not the one just requested.
const PLAY_MATCH_MAX_POSITION_MS = 5000;

let sdkPromise = null;

const loadSdk = () => {
  if (window.Spotify?.Player) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = () => resolve();
      const script = document.createElement('script');
      script.src = SDK_SRC;
      script.async = true;
      script.onerror = () => {
        sdkPromise = null;
        script.remove();
        reject(new Error('Spotify Web Playback SDK failed to load'));
      };
      document.body.appendChild(script);
    });
  }
  return sdkPromise;
};

// SDK state -> { uri, positionMs, durationMs, paused, loading } (or null: nothing is playing
// on this device). A relinked track reports the uri that was asked for via linked_from.
const toState = (sdkState) => {
  if (!sdkState) return null;
  const track = sdkState.track_window?.current_track;
  return {
    uri: track?.linked_from?.uri || track?.uri || null,
    positionMs: sdkState.position ?? 0,
    durationMs: sdkState.duration ?? 0,
    paused: !!sdkState.paused,
    loading: !!sdkState.loading,
  };
};

export const createSpotifySdkAdapter = ({ name, getOAuthToken }) => {
  let player = null;
  const listeners = {
    state: new Set(), ready: new Set(), notReady: new Set(), initError: new Set(),
    authError: new Set(), accountError: new Set(), playbackError: new Set(),
  };
  const on = (key) => (cb) => {
    listeners[key].add(cb);
    return () => listeners[key].delete(cb);
  };
  const emit = (key, value) => {
    listeners[key].forEach((cb) => {
      try {
        cb(value);
      } catch (error) {
        console.warn(`Spotify ${key} listener failed:`, error);
      }
    });
  };
  const requirePlayer = () => {
    if (!player) throw new Error('Spotify player is not loaded');
    return player;
  };

  // Resolves on the first state that shows `uri` freshly playing.
  const waitForPlaying = (uri) => {
    let off;
    const promise = new Promise((resolve) => {
      off = on('state')((state) => {
        if (state && !state.paused && state.uri === uri && state.positionMs < PLAY_MATCH_MAX_POSITION_MS) resolve();
      });
    });
    return { promise, cancel: () => off() };
  };

  return {
    load: async () => {
      await loadSdk();
      if (player) return;
      player = new window.Spotify.Player({
        name,
        volume: 1,
        // A fresh token on every call; failures are reported by getOAuthToken itself.
        getOAuthToken: (cb) => { getOAuthToken().then(cb, () => {}); },
      });
      player.addListener('player_state_changed', (s) => emit('state', toState(s)));
      player.addListener('ready', ({ device_id: deviceId }) => emit('ready', deviceId));
      player.addListener('not_ready', ({ device_id: deviceId }) => emit('notReady', deviceId));
      player.addListener('initialization_error', (e) => emit('initError', e));
      player.addListener('authentication_error', (e) => emit('authError', e));
      player.addListener('account_error', (e) => emit('accountError', e));
      player.addListener('playback_error', (e) => emit('playbackError', e));
    },

    connect: () => new Promise((resolve, reject) => {
      const offs = [];
      const settle = (fn, value) => { offs.forEach((off) => off()); fn(value); };
      offs.push(on('ready')((deviceId) => settle(resolve, deviceId)));
      ['initError', 'authError', 'accountError'].forEach((key) => {
        offs.push(on(key)((e) => settle(reject, new Error(e?.message || `Spotify ${key}`))));
      });
      requirePlayer().connect().then((ok) => {
        if (!ok) settle(reject, new Error('Spotify player refused to connect'));
      }, (error) => settle(reject, error));
    }),

    disconnect: () => {
      player?.disconnect();
      player = null;
    },

    activate: () => player?.activateElement(),

    playUri: (uri, deviceId) => {
      // Subscribed before the request goes out, so an early state change can't be missed.
      const waiter = waitForPlaying(uri);
      // Aborted on timeout, so a hung PUT can't land late and start this track over a newer one.
      const controller = new AbortController();
      const request = (async () => {
        const token = await getOAuthToken();
        const response = await fetch(`${PLAY_URL}?device_id=${encodeURIComponent(deviceId)}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uris: [uri] }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Spotify play request failed: ${response.status}`);
        await waiter.promise;
      })();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`Spotify did not start ${uri} in time`));
        }, PLAY_TIMEOUT_MS);
      });
      return Promise.race([request, timeout]).finally(() => {
        clearTimeout(timer);
        waiter.cancel();
      });
    },

    pause: () => requirePlayer().pause(),
    resume: () => requirePlayer().resume(),
    seek: (ms) => requirePlayer().seek(ms),
    getState: async () => (player ? toState(await player.getCurrentState()) : null),

    onStateChange: on('state'),
    onReady: on('ready'),
    onNotReady: on('notReady'),
    onAuthError: on('authError'),
    onAccountError: on('accountError'),
    onPlaybackError: on('playbackError'),
  };
};
