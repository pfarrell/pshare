import { isMobileDevice } from './device';

// The visualizer taps the player's <audio> elements with Web Audio, which
// routes their output through an AudioContext for the life of the page (the tap
// is irreversible). iOS suspends that context when the screen locks, which
// would break background playback and lock-screen controls, so it must never
// be offered there.
//
// A user-agent check alone is not enough: iPadOS and Safari's per-site
// "Request Desktop Website" toggle report a Mac user agent and platform. The one
// thing they cannot hide is multi-touch, which no real Mac reports, so a
// "MacIntel" with touch points is an iPad (or an iPhone in desktop-site mode).
const isIos = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Desktop browsers only. isMobileDevice() also rules out phones and narrow
// windows, where a full-screen visualizer has no good place to be opened from.
export const isVisualizerSupported = () => !isIos() && !isMobileDevice();
