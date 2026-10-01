import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxApp from './JukeboxApp';

vi.mock('../stores/authStore', () => ({ useAuthStore: vi.fn() }));
// useAuthStore is mocked above as a single vi.fn() that ignores its selector
// argument (mockReturnValue applies to every call), so JukeboxApp's second
// selector — for jukeboxDeviceId, read by useJukeboxQueueEvents below — comes
// back as whatever isAuthenticated was set to for that test, never actually
// null. That's enough to make the hook believe a device is known and try to
// open a real EventSource/fetch pending queue on every render, so its
// dependencies are stubbed here with defensive defaults rather than exercised
// for real — this file is about the app shell and drawer state, not the SSE
// hook (covered by useJukeboxQueueEvents.test.js).
vi.mock('../services/api', () => ({
  apiService: {
    getJukeboxPendingQueue: vi.fn(() => Promise.resolve({ data: [] })),
    markJukeboxDelivered: vi.fn(() => Promise.resolve({})),
    getTrack: vi.fn(() => Promise.resolve({ data: { track: {} } })),
  },
  jukeboxEventsUrl: vi.fn((id) => `/api/jukebox/devices/${id}/events`),
}));
vi.mock('./JukeboxLogin', () => ({ default: () => <div data-testid="jukebox-login" /> }));
vi.mock('./JukeboxNowPlaying', () => ({
  default: ({ onTap }) => (
    <div data-testid="jukebox-now-playing">
      <button onClick={onTap}>trigger-now-playing-tap</button>
    </div>
  ),
}));
vi.mock('../components/player/MusicPlayerWrapper', () => ({ default: () => <div data-testid="player-engine" /> }));
vi.mock('./JukeboxProgressLine', () => ({ default: () => <div data-testid="progress-line" /> }));
vi.mock('./JukeboxFooterStrip', () => ({
  default: ({ onOpenQueue, onOpenSettings }) => (
    <div data-testid="jukebox-footer-strip">
      <button onClick={onOpenQueue}>trigger-open-queue</button>
      <button onClick={onOpenSettings}>trigger-open-settings</button>
    </div>
  ),
}));
vi.mock('./JukeboxBrowsePanel', () => ({
  default: ({ activeDestination, onSelectDestination, onEnqueue, pendingItem, onJumpToArtist, onPendingItemConsumed, onGeneratingChange, onPlaylistSaved }) => (
    <div
      className="jukebox-browse-panel"
      data-testid="jukebox-browse-panel"
      data-active-destination={activeDestination ?? 'none'}
      data-pending-item={pendingItem ? `${pendingItem.type}:${pendingItem.data.name ?? pendingItem.data.title}` : 'none'}
    >
      <button onClick={() => onSelectDestination('nextup')}>trigger-select-nextup</button>
      <button onClick={() => onSelectDestination('settings')}>trigger-select-settings</button>
      <button onClick={onEnqueue}>trigger-enqueue</button>
      <button onClick={() => onJumpToArtist({ id: 42, name: 'Jumped Artist' })}>trigger-jump-to-artist</button>
      <button onClick={onPendingItemConsumed}>trigger-pending-item-consumed</button>
      <button onClick={() => onGeneratingChange(true)}>trigger-generating-start</button>
      <button onClick={() => onGeneratingChange(false)}>trigger-generating-end</button>
      <button onClick={() => onPlaylistSaved('Road Trip')}>trigger-playlist-saved</button>
      <button onClick={() => onPlaylistSaved('Long Name', 5000)}>trigger-playlist-saved-long</button>
    </div>
  ),
}));
vi.mock('./JukeboxKeyboard', () => ({
  default: ({ targetElement }) => (targetElement ? <div className="jukebox-keyboard" data-testid="jukebox-keyboard" /> : null),
}));
vi.mock('../stores/playerStore', () => ({ usePlayerStore: vi.fn() }));
// The queue publisher subscribes to the real playerStore, which is a bare vi.fn()
// here. Mocked with BOTH exports: useJukeboxQueueEvents imports
// requestJukeboxStatePublish from the same module.
vi.mock('./jukeboxStatePublisher', () => ({
  useJukeboxStatePublisher: vi.fn(),
  requestJukeboxStatePublish: vi.fn(),
}));
vi.mock('../stores/jukeboxScreensaverStore', () => ({ useJukeboxScreensaverStore: vi.fn() }));
vi.mock('./JukeboxScreensaver', () => ({
  default: ({ mode, onDismiss, onView }) => (
    <div data-testid="jukebox-screensaver" data-mode={mode}>
      <button onClick={onDismiss}>trigger-screensaver-dismiss</button>
      <button onClick={() => onView({ type: 'artist', data: { id: 99, name: 'Screensaver Artist' } })}>trigger-screensaver-view</button>
    </div>
  ),
}));
// The real MilkdropCanvas needs WebGL and Web Audio, neither of which jsdom has.
// The stub exposes its two callbacks as buttons so tests can drive them.
vi.mock('../components/visualizer/MilkdropCanvas', () => ({
  default: ({ onDismiss, onFail }) => (
    <div data-testid="milkdrop-canvas">
      <button onClick={onDismiss}>trigger-visualizer-dismiss</button>
      <button onClick={onFail}>trigger-visualizer-fail</button>
    </div>
  ),
}));
// The real factoid screensaver fetches from the API and falls back to the art
// screensaver itself; here it is a stub exposing its two callbacks as buttons.
vi.mock('./JukeboxFactoidScreensaver', () => ({
  default: ({ onDismiss, onView }) => (
    <div data-testid="factoid-screensaver">
      <button onClick={onDismiss}>trigger-factoid-dismiss</button>
      <button onClick={() => onView({ type: 'album', data: { id: 7, title: 'Factoid Album' } })}>trigger-factoid-view</button>
    </div>
  ),
}));
vi.mock('./useJukeboxKeyboardFocus', () => ({ useJukeboxKeyboardFocus: vi.fn() }));

import { useAuthStore } from '../stores/authStore';
import { useJukeboxKeyboardFocus } from './useJukeboxKeyboardFocus';
import { usePlayerStore } from '../stores/playerStore';
import { useJukeboxStatePublisher } from './jukeboxStatePublisher';
import { useJukeboxScreensaverStore } from '../stores/jukeboxScreensaverStore';

const renderApp = () => render(<MemoryRouter><JukeboxApp /></MemoryRouter>);
const activeDestination = () => screen.getByTestId('jukebox-browse-panel').getAttribute('data-active-destination');
const pendingItemLabel = () => screen.getByTestId('jukebox-browse-panel').getAttribute('data-pending-item');
const nowPlayingTap = () => screen.getByText('trigger-now-playing-tap');

// jsdom has no native EventSource, and useJukeboxQueueEvents (run
// unconditionally by JukeboxApp) opens one as soon as it sees a
// non-null-ish deviceId — a no-op stub keeps that hook from throwing here.
class NoOpEventSource {
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  useJukeboxKeyboardFocus.mockReturnValue(null);
  useAuthStore.mockReturnValue(true);
  usePlayerStore.mockReturnValue(false);
  useJukeboxScreensaverStore.mockReturnValue('music');
  global.EventSource = NoOpEventSource;
});

afterEach(() => {
  vi.useRealTimers();
});

test('mounts the queue publisher for phones once authenticated', () => {
  renderApp();
  expect(useJukeboxStatePublisher).toHaveBeenCalled();
});

test('shows JukeboxLogin when not authenticated', () => {
  useAuthStore.mockReturnValue(false);
  renderApp();
  expect(screen.getByTestId('jukebox-login')).toBeInTheDocument();
});

test('renders the on-screen keyboard, unauthenticated, when an input is focused', () => {
  useAuthStore.mockReturnValue(false);
  useJukeboxKeyboardFocus.mockReturnValue(document.createElement('input'));
  renderApp();
  expect(screen.getByTestId('jukebox-keyboard')).toBeInTheDocument();
});

test('renders the on-screen keyboard, authenticated, when an input is focused', () => {
  useJukeboxKeyboardFocus.mockReturnValue(document.createElement('input'));
  renderApp();
  expect(screen.getByTestId('jukebox-keyboard')).toBeInTheDocument();
});

test('shows the now-playing view, the footer strip and the drawer when authenticated', () => {
  renderApp();
  expect(screen.getByTestId('jukebox-now-playing')).toBeInTheDocument();
  expect(screen.getByTestId('jukebox-footer-strip')).toBeInTheDocument();
  expect(screen.getByTestId('jukebox-browse-panel')).toBeInTheDocument();
});

test('keeps the audio engine mounted but hidden', () => {
  renderApp();
  const engine = screen.getByTestId('player-engine');
  expect(engine).toBeInTheDocument();
  expect(engine.closest('.jukebox-engine')).toHaveAttribute('hidden');
});

test('the drawer starts closed', () => {
  renderApp();
  expect(activeDestination()).toBe('none');
});

test('tapping the now-playing screen opens the drawer to Browse when closed', () => {
  renderApp();
  fireEvent.click(nowPlayingTap());
  expect(activeDestination()).toBe('browse');
});

test('tapping the now-playing screen again closes the drawer', () => {
  renderApp();
  fireEvent.click(nowPlayingTap());
  fireEvent.click(nowPlayingTap());
  expect(activeDestination()).toBe('none');
});

test('tapping the footer\'s queue button jumps straight to Next Up', () => {
  renderApp();
  fireEvent.click(screen.getByText('trigger-open-queue'));
  expect(activeDestination()).toBe('nextup');
});

test('tapping the footer\'s queue button switches to Next Up even when another destination is already open', () => {
  renderApp();
  fireEvent.click(nowPlayingTap());
  expect(activeDestination()).toBe('browse');

  fireEvent.click(screen.getByText('trigger-open-queue'));

  expect(activeDestination()).toBe('nextup');
});

test('selecting a destination from the drawer menu switches to it without closing', () => {
  renderApp();
  fireEvent.click(nowPlayingTap());
  expect(activeDestination()).toBe('browse');

  fireEvent.click(screen.getByText('trigger-select-nextup'));

  expect(activeDestination()).toBe('nextup');
});

test('passes the drawer an onEnqueue callback that closes the drawer when called', () => {
  renderApp();
  fireEvent.click(nowPlayingTap());
  expect(activeDestination()).toBe('browse');

  fireEvent.click(screen.getByText('trigger-enqueue'));

  expect(activeDestination()).toBe('none');
});

describe('enqueue toast', () => {
  test('shows a confirmation toast when something is enqueued', () => {
    renderApp();
    fireEvent.click(nowPlayingTap());

    fireEvent.click(screen.getByText('trigger-enqueue'));

    expect(screen.getByRole('status')).toHaveTextContent('Added to queue');
  });

  test('a save reported with a longer duration outlasts the default toast', async () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.click(nowPlayingTap());
    fireEvent.click(screen.getByText('trigger-playlist-saved-long'));

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(screen.getByRole('status')).toHaveTextContent('Saved as "Long Name"');

    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('the toast auto-dismisses', async () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.click(nowPlayingTap());
    fireEvent.click(screen.getByText('trigger-enqueue'));
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('tapping the now-playing screen to close the drawer does not show a toast', () => {
    renderApp();
    fireEvent.click(nowPlayingTap());

    fireEvent.click(nowPlayingTap());

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('the drawer auto-closing from inactivity does not show a toast', async () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.click(nowPlayingTap());

    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });

    expect(activeDestination()).toBe('none');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('playlist saved toast', () => {
  test('shows a confirmation toast naming the saved playlist', () => {
    renderApp();
    fireEvent.click(nowPlayingTap());

    fireEvent.click(screen.getByText('trigger-playlist-saved'));

    expect(screen.getByRole('status')).toHaveTextContent('Saved as "Road Trip"');
  });

  test('does not close the drawer (unlike enqueue) so playback/browsing continues uninterrupted', () => {
    renderApp();
    fireEvent.click(nowPlayingTap());
    fireEvent.click(screen.getByText('trigger-select-nextup'));

    fireEvent.click(screen.getByText('trigger-playlist-saved'));

    expect(activeDestination()).toBe('nextup');
  });

  test('the toast auto-dismisses', async () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.click(nowPlayingTap());
    fireEvent.click(screen.getByText('trigger-playlist-saved'));
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

test('jumping to an artist from a different destination switches to Browse and carries the item along', () => {
  renderApp();
  fireEvent.click(nowPlayingTap());
  fireEvent.click(screen.getByText('trigger-select-nextup'));

  fireEvent.click(screen.getByText('trigger-jump-to-artist'));

  expect(activeDestination()).toBe('browse');
  expect(pendingItemLabel()).toBe('artist:Jumped Artist');
});

test('jumping to an artist while already on Browse still carries the item along', () => {
  renderApp();
  fireEvent.click(nowPlayingTap());

  fireEvent.click(screen.getByText('trigger-jump-to-artist'));

  expect(activeDestination()).toBe('browse');
  expect(pendingItemLabel()).toBe('artist:Jumped Artist');
});

test('clears the pending item once the drawer reports it consumed', () => {
  renderApp();
  fireEvent.click(screen.getByText('trigger-jump-to-artist'));
  expect(pendingItemLabel()).toBe('artist:Jumped Artist');

  fireEvent.click(screen.getByText('trigger-pending-item-consumed'));

  expect(pendingItemLabel()).toBe('none');
});

// --- Drawer auto-close on inactivity ---------------------------------------

describe('drawer inactivity auto-close', () => {
  test('closes the drawer after 15s with no activity inside it', async () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.click(nowPlayingTap());
    expect(activeDestination()).toBe('browse');

    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });

    expect(activeDestination()).toBe('none');
  });

  test('does not close before 15s have passed', async () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.click(nowPlayingTap());

    await act(async () => { await vi.advanceTimersByTimeAsync(14000); });

    expect(activeDestination()).toBe('browse');
  });

  test('activity inside the drawer resets the idle timer', async () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.click(nowPlayingTap());

    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    fireEvent.pointerDown(screen.getByTestId('jukebox-browse-panel'));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); }); // 20s total, but only 10s since the reset

    expect(activeDestination()).toBe('browse');

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); // 15s since the reset

    expect(activeDestination()).toBe('none');
  });

  test('typing on the on-screen keyboard resets the idle timer', async () => {
    vi.useFakeTimers();
    useJukeboxKeyboardFocus.mockReturnValue(document.createElement('input'));
    renderApp();
    fireEvent.click(nowPlayingTap());

    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    fireEvent.pointerDown(screen.getByTestId('jukebox-keyboard'));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); }); // 20s total, but only 10s since the reset

    expect(activeDestination()).toBe('browse');

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); // 15s since the reset

    expect(activeDestination()).toBe('none');
  });

  test('activity outside the drawer does not reset the idle timer', async () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.click(nowPlayingTap());

    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    fireEvent.pointerDown(document.body);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); // 15s total since opening

    expect(activeDestination()).toBe('none');
  });

  test('does not arm the timer while the drawer is closed', async () => {
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });

    expect(activeDestination()).toBe('none'); // never opened; nothing to assert beyond "did not throw"
  });

  test('does not close while an AI Mix generation is in flight, then re-arms a full timer once it settles', async () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.click(nowPlayingTap());

    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    fireEvent.click(screen.getByText('trigger-generating-start'));
    await act(async () => { await vi.advanceTimersByTimeAsync(45000); }); // well past 15s, nobody touching anything

    expect(activeDestination()).toBe('browse');

    fireEvent.click(screen.getByText('trigger-generating-end'));
    await act(async () => { await vi.advanceTimersByTimeAsync(14000); });

    expect(activeDestination()).toBe('browse'); // fresh 15s, not the leftover 5s

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    expect(activeDestination()).toBe('none');
  });
});

describe('idle screensaver', () => {
  const SCREENSAVER_IDLE_MS = 2 * 60 * 1000;

  test('activates after 2 minutes idle with the drawer closed and nothing playing', async () => {
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();
  });

  test('does not activate before 2 minutes have passed', async () => {
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS - 1000); });

    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();
  });

  test('any activity anywhere resets the idle timer', async () => {
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(90 * 1000); });
    fireEvent.pointerDown(document.body);
    await act(async () => { await vi.advanceTimersByTimeAsync(90 * 1000); }); // 3 min total, 90s since the reset

    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 1000); }); // 2 min since the reset

    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();
  });

  test('does not arm while the drawer is open', async () => {
    vi.useFakeTimers();
    renderApp();
    fireEvent.click(nowPlayingTap());

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();
  });

  test('arms while something is playing, so art shows over playback', async () => {
    vi.useFakeTimers();
    usePlayerStore.mockReturnValue(true);
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS - 1000); });
    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();
  });

  test('dismissing during playback hides it and re-arms a fresh timer', async () => {
    vi.useFakeTimers();
    usePlayerStore.mockReturnValue(true);
    renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });
    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('trigger-screensaver-dismiss'));
    fireEvent.click(screen.getByText('trigger-screensaver-dismiss'));
    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });
    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();
  });

  test('does not arm when the mode is off', async () => {
    vi.useFakeTimers();
    useJukeboxScreensaverStore.mockReturnValue('off');
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();
  });

  test('switching to Off in Settings while active hides it immediately', async () => {
    vi.useFakeTimers();
    const { rerender } = renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });
    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();

    useJukeboxScreensaverStore.mockReturnValue('off');
    rerender(<MemoryRouter><JukeboxApp /></MemoryRouter>);

    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();
  });

  test('dismissing the screensaver hides it and re-arms a fresh timer', async () => {
    vi.useFakeTimers();
    renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });
    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();

    // A real tap fires pointerdown before click (same gesture) — the
    // document-level pointerdown listener is what re-arms the idle timer,
    // so the dismiss tap is simulated as both, matching how a real screen
    // tap behaves (see the drawer-idle-close tests above for the same
    // pattern with fireEvent.pointerDown).
    fireEvent.pointerDown(screen.getByText('trigger-screensaver-dismiss'));
    fireEvent.click(screen.getByText('trigger-screensaver-dismiss'));

    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();
  });

  test('playback starting while the screensaver is active leaves it up', async () => {
    vi.useFakeTimers();
    const { rerender } = renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });
    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();

    usePlayerStore.mockReturnValue(true);
    rerender(<MemoryRouter><JukeboxApp /></MemoryRouter>);

    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();
  });

  test('choosing View from the screensaver closes it, opens Browse, and carries the item along', async () => {
    vi.useFakeTimers();
    renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    fireEvent.click(screen.getByText('trigger-screensaver-view'));

    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();
    expect(activeDestination()).toBe('browse');
    expect(pendingItemLabel()).toBe('artist:Screensaver Artist');
  });

  test('passes the current screensaver mode through to JukeboxScreensaver', async () => {
    vi.useFakeTimers();
    useJukeboxScreensaverStore.mockReturnValue('photos');
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    expect(screen.getByTestId('jukebox-screensaver')).toHaveAttribute('data-mode', 'photos');
  });
});

test('the footer gear opens Settings, and tapping it again returns to Browse', () => {
  renderApp();
  fireEvent.click(screen.getByText('trigger-open-settings'));
  expect(activeDestination()).toBe('settings');
  fireEvent.click(screen.getByText('trigger-open-settings'));
  expect(activeDestination()).toBe('browse');
});

test('tapping the footer queue button while on Next Up returns to Browse', () => {
  renderApp();
  fireEvent.click(screen.getByText('trigger-open-queue'));
  fireEvent.click(screen.getByText('trigger-open-queue'));
  expect(activeDestination()).toBe('browse');
});

// A testing aid: localStorage 'jukebox-screensaver-idle-seconds' shortens the
// idle delay without a redeploy. The default stays 2 minutes.
describe('screensaver idle override', () => {
  const KEY = 'jukebox-screensaver-idle-seconds';
  const DEFAULT_MS = 2 * 60 * 1000;

  afterEach(() => {
    localStorage.removeItem(KEY);
  });

  test('a stored override shortens the idle delay', async () => {
    localStorage.setItem(KEY, '15');
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(14000); });
    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();
  });

  test.each([
    ['not a number', 'soon'],
    ['zero', '0'],
    ['negative', '-5'],
    ['below the 5 second floor', '2'],
  ])('an override that is %s falls back to the 2 minute default', async (_label, value) => {
    localStorage.setItem(KEY, value);
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(DEFAULT_MS - 1000); });
    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();
  });

  test('with no override the default is still 2 minutes', async () => {
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });

    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();
  });
});

describe('visualizer screensaver', () => {
  const SCREENSAVER_IDLE_MS = 2 * 60 * 1000;

  beforeEach(() => {
    useJukeboxScreensaverStore.mockReturnValue('visualizer');
  });

  test('shows the visualizer, not the art screensaver, when the screensaver activates', async () => {
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    expect(screen.getByTestId('milkdrop-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();
  });

  test('does not mount the visualizer in any other screensaver mode', async () => {
    useJukeboxScreensaverStore.mockReturnValue('music');
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    expect(screen.queryByTestId('milkdrop-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();
  });

  // Review Focus #1: a kiosk with visualizer persisted but no WebGL must not
  // sit on a black rectangle, which is indistinguishable from a dead kiosk.
  test('falls back to the music screensaver when the visualizer fails to start', async () => {
    vi.useFakeTimers();
    renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });
    expect(screen.getByTestId('milkdrop-canvas')).toBeInTheDocument();

    fireEvent.click(screen.getByText('trigger-visualizer-fail'));

    expect(screen.queryByTestId('milkdrop-canvas')).not.toBeInTheDocument();
    const fallback = screen.getByTestId('jukebox-screensaver');
    expect(fallback).toHaveAttribute('data-mode', 'music');
  });

  test('dismissing the visualizer closes the screensaver', async () => {
    vi.useFakeTimers();
    renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    fireEvent.click(screen.getByText('trigger-visualizer-dismiss'));

    expect(screen.queryByTestId('milkdrop-canvas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();
  });
});

describe('factoid screensaver', () => {
  const SCREENSAVER_IDLE_MS = 2 * 60 * 1000;

  beforeEach(() => {
    useJukeboxScreensaverStore.mockReturnValue('factoids');
  });

  test('shows the factoid screensaver, not the art or visualizer one, when the screensaver activates', async () => {
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    expect(screen.getByTestId('factoid-screensaver')).toBeInTheDocument();
    expect(screen.queryByTestId('jukebox-screensaver')).not.toBeInTheDocument();
    expect(screen.queryByTestId('milkdrop-canvas')).not.toBeInTheDocument();
  });

  test('does not mount the factoid screensaver in any other mode', async () => {
    useJukeboxScreensaverStore.mockReturnValue('music');
    vi.useFakeTimers();
    renderApp();

    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    expect(screen.queryByTestId('factoid-screensaver')).not.toBeInTheDocument();
    expect(screen.getByTestId('jukebox-screensaver')).toBeInTheDocument();
  });

  test('dismissing the factoid screensaver closes it', async () => {
    vi.useFakeTimers();
    renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    fireEvent.click(screen.getByText('trigger-factoid-dismiss'));

    expect(screen.queryByTestId('factoid-screensaver')).not.toBeInTheDocument();
  });

  test('choosing View from the factoid screensaver closes it and carries the item to Browse', async () => {
    vi.useFakeTimers();
    renderApp();
    await act(async () => { await vi.advanceTimersByTimeAsync(SCREENSAVER_IDLE_MS); });

    fireEvent.click(screen.getByText('trigger-factoid-view'));

    expect(screen.queryByTestId('factoid-screensaver')).not.toBeInTheDocument();
    expect(activeDestination()).toBe('browse');
    expect(pendingItemLabel()).toBe('album:Factoid Album');
  });
});
