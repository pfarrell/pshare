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
  default: ({ onOpenQueue }) => (
    <div data-testid="jukebox-footer-strip">
      <button onClick={onOpenQueue}>trigger-open-queue</button>
    </div>
  ),
}));
vi.mock('./JukeboxBrowsePanel', () => ({
  default: ({ activeDestination, onSelectDestination, onEnqueue, pendingArtist, onJumpToArtist, onPendingArtistConsumed, onGeneratingChange }) => (
    <div
      className="jukebox-browse-panel"
      data-testid="jukebox-browse-panel"
      data-active-destination={activeDestination ?? 'none'}
      data-pending-artist={pendingArtist?.name ?? 'none'}
    >
      <button onClick={() => onSelectDestination('nextup')}>trigger-select-nextup</button>
      <button onClick={() => onSelectDestination('settings')}>trigger-select-settings</button>
      <button onClick={onEnqueue}>trigger-enqueue</button>
      <button onClick={() => onJumpToArtist({ id: 42, name: 'Jumped Artist' })}>trigger-jump-to-artist</button>
      <button onClick={onPendingArtistConsumed}>trigger-pending-artist-consumed</button>
      <button onClick={() => onGeneratingChange(true)}>trigger-generating-start</button>
      <button onClick={() => onGeneratingChange(false)}>trigger-generating-end</button>
    </div>
  ),
}));
vi.mock('./JukeboxKeyboard', () => ({
  default: ({ targetElement }) => (targetElement ? <div className="jukebox-keyboard" data-testid="jukebox-keyboard" /> : null),
}));
vi.mock('./useJukeboxKeyboardFocus', () => ({ useJukeboxKeyboardFocus: vi.fn() }));

import { useAuthStore } from '../stores/authStore';
import { useJukeboxKeyboardFocus } from './useJukeboxKeyboardFocus';

const renderApp = () => render(<MemoryRouter><JukeboxApp /></MemoryRouter>);
const activeDestination = () => screen.getByTestId('jukebox-browse-panel').getAttribute('data-active-destination');
const pendingArtistName = () => screen.getByTestId('jukebox-browse-panel').getAttribute('data-pending-artist');
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
  global.EventSource = NoOpEventSource;
});

afterEach(() => {
  vi.useRealTimers();
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

test('jumping to an artist from a different destination switches to Browse and carries the artist along', () => {
  renderApp();
  fireEvent.click(nowPlayingTap());
  fireEvent.click(screen.getByText('trigger-select-nextup'));

  fireEvent.click(screen.getByText('trigger-jump-to-artist'));

  expect(activeDestination()).toBe('browse');
  expect(pendingArtistName()).toBe('Jumped Artist');
});

test('jumping to an artist while already on Browse still carries the artist along', () => {
  renderApp();
  fireEvent.click(nowPlayingTap());

  fireEvent.click(screen.getByText('trigger-jump-to-artist'));

  expect(activeDestination()).toBe('browse');
  expect(pendingArtistName()).toBe('Jumped Artist');
});

test('clears the pending artist once the drawer reports it consumed', () => {
  renderApp();
  fireEvent.click(screen.getByText('trigger-jump-to-artist'));
  expect(pendingArtistName()).toBe('Jumped Artist');

  fireEvent.click(screen.getByText('trigger-pending-artist-consumed'));

  expect(pendingArtistName()).toBe('none');
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
