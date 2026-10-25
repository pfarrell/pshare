import { vi } from 'vitest';

vi.mock('../jukebox/jukeboxMode', () => ({ isJukeboxMode: vi.fn(() => false) }));

import { isMobileDevice, isIOSDevice } from './device';
import { isJukeboxMode } from '../jukebox/jukeboxMode';

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  isJukeboxMode.mockReturnValue(false);
});

test('returns true when viewport width is at or below the 768px breakpoint', () => {
  Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
  expect(isMobileDevice()).toBe(true);
});

test('returns false on a wide viewport with a desktop user agent', () => {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  expect(isMobileDevice()).toBe(false);
});

test('returns true on a wide viewport when the user agent is mobile', () => {
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  const originalUA = navigator.userAgent;
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    configurable: true,
  });
  expect(isMobileDevice()).toBe(true);
  Object.defineProperty(navigator, 'userAgent', { value: originalUA, configurable: true });
});

test('returns true on a wide viewport with a desktop user agent when jukebox mode is active', () => {
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  isJukeboxMode.mockReturnValue(true);
  expect(isMobileDevice()).toBe(true);
});

describe('isIOSDevice', () => {
  const originalUA = navigator.userAgent;
  const originalTouchPoints = navigator.maxTouchPoints;
  const setNavigator = (userAgent, maxTouchPoints = 0) => {
    Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
  };

  afterEach(() => setNavigator(originalUA, originalTouchPoints));

  test('true for iPhone, iPad and iPod user agents', () => {
    setNavigator('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isIOSDevice()).toBe(true);
    setNavigator('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)');
    expect(isIOSDevice()).toBe(true);
    setNavigator('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)');
    expect(isIOSDevice()).toBe(true);
  });

  test('true for iPadOS reporting as a Mac with touch', () => {
    setNavigator('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5);
    expect(isIOSDevice()).toBe(true);
  });

  test('false for a desktop Mac without touch and for Android', () => {
    setNavigator('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0);
    expect(isIOSDevice()).toBe(false);
    setNavigator('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5);
    expect(isIOSDevice()).toBe(false);
  });
});
