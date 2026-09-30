import { isVisualizerSupported } from './visualizerSupport';

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// What an iPad reports with "Request Desktop Website" on (the default on iPadOS):
// a Mac user agent and platform, distinguishable only by its touch points.
const MAC_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';

const setNavigator = ({ userAgent = DESKTOP_CHROME_UA, platform = 'Linux x86_64', maxTouchPoints = 0 } = {}) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
  // jsdom does not define maxTouchPoints at all, so there is nothing to spy on.
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
};

beforeEach(() => {
  window.innerWidth = 1280;
  setNavigator();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete navigator.maxTouchPoints;
});

describe('isVisualizerSupported', () => {
  test('is true on a normal desktop browser', () => {
    expect(isVisualizerSupported()).toBe(true);
  });

  test('is true on a real Mac, which has no touch points', () => {
    setNavigator({ userAgent: MAC_SAFARI_UA, platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isVisualizerSupported()).toBe(true);
  });

  // The Web Audio tap routes the player's audio through an AudioContext for the
  // life of the page, and iOS suspends that when the screen locks, which would
  // break background playback and lock-screen controls.
  test('is false on an iPhone', () => {
    setNavigator({ userAgent: IPHONE_UA, platform: 'iPhone', maxTouchPoints: 5 });
    expect(isVisualizerSupported()).toBe(false);
  });

  test('is false on an iPad posing as a Mac (desktop-site mode)', () => {
    setNavigator({ userAgent: MAC_SAFARI_UA, platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isVisualizerSupported()).toBe(false);
  });

  test('is false on an iPhone even with the desktop-site toggle on', () => {
    setNavigator({ userAgent: MAC_SAFARI_UA, platform: 'MacIntel', maxTouchPoints: 5 });
    window.innerWidth = 1024;
    expect(isVisualizerSupported()).toBe(false);
  });

  test('is false on an Android phone', () => {
    setNavigator({ userAgent: ANDROID_UA, platform: 'Linux armv81', maxTouchPoints: 5 });
    expect(isVisualizerSupported()).toBe(false);
  });

  test('is false in a narrow window', () => {
    window.innerWidth = 600;
    expect(isVisualizerSupported()).toBe(false);
  });
});
