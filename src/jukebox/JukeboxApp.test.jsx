import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxApp from './JukeboxApp';

vi.mock('../stores/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('./JukeboxLogin', () => ({ default: () => <div data-testid="jukebox-login" /> }));
vi.mock('./JukeboxNowPlaying', () => ({ default: () => <div data-testid="jukebox-now-playing" /> }));
vi.mock('../components/player/MusicPlayerWrapper', () => ({ default: () => <div data-testid="player-engine" /> }));
vi.mock('./JukeboxProgressLine', () => ({ default: () => <div data-testid="progress-line" /> }));
vi.mock('./JukeboxBrowsePanel', () => ({
  default: ({ activeTab, onEnqueue, pendingArtist, onJumpToArtist, onPendingArtistConsumed }) => (
    <div data-testid="jukebox-browse-panel" data-active-tab={activeTab ?? 'none'} data-pending-artist={pendingArtist?.name ?? 'none'}>
      <button onClick={onEnqueue}>trigger-enqueue</button>
      <button onClick={() => onJumpToArtist({ id: 42, name: 'Jumped Artist' })}>trigger-jump-to-artist</button>
      <button onClick={onPendingArtistConsumed}>trigger-pending-artist-consumed</button>
    </div>
  ),
}));
vi.mock('./JukeboxKeyboard', () => ({ default: ({ targetElement }) => (targetElement ? <div data-testid="jukebox-keyboard" /> : null) }));
vi.mock('./useJukeboxKeyboardFocus', () => ({ useJukeboxKeyboardFocus: vi.fn() }));

import { useAuthStore } from '../stores/authStore';
import { useJukeboxKeyboardFocus } from './useJukeboxKeyboardFocus';

const renderApp = () => render(<MemoryRouter><JukeboxApp /></MemoryRouter>);
const activeTab = () => screen.getByTestId('jukebox-browse-panel').getAttribute('data-active-tab');
const pendingArtistName = () => screen.getByTestId('jukebox-browse-panel').getAttribute('data-pending-artist');
const tab = (name) => screen.getByRole('button', { name });

beforeEach(() => {
  useJukeboxKeyboardFocus.mockReturnValue(null);
  useAuthStore.mockReturnValue(true);
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

test('shows the now-playing view, the tab bar and the drawer when authenticated', () => {
  renderApp();
  expect(screen.getByTestId('jukebox-now-playing')).toBeInTheDocument();
  expect(screen.getByRole('navigation', { name: 'Browse' })).toBeInTheDocument();
  expect(screen.getByTestId('jukebox-browse-panel')).toBeInTheDocument();
});

test('has no Browse button any more', () => {
  renderApp();
  expect(screen.queryByRole('button', { name: 'Browse' })).not.toBeInTheDocument();
});

test('keeps the audio engine mounted but hidden', () => {
  renderApp();
  const engine = screen.getByTestId('player-engine');
  expect(engine).toBeInTheDocument();
  expect(engine.closest('.jukebox-engine')).toHaveAttribute('hidden');
});

test('the drawer starts closed', () => {
  renderApp();
  expect(activeTab()).toBe('none');
});

test('tapping a tab while the drawer is closed opens it on that tab', () => {
  renderApp();
  fireEvent.click(tab('Search'));
  expect(activeTab()).toBe('search');
  expect(tab('Search')).toHaveAttribute('aria-pressed', 'true');
});

test('tapping the active tab closes the drawer', () => {
  renderApp();
  fireEvent.click(tab('Quick Hit'));
  fireEvent.click(tab('Quick Hit'));
  expect(activeTab()).toBe('none');
  expect(tab('Quick Hit')).toHaveAttribute('aria-pressed', 'false');
});

test('tapping a different tab switches to it', () => {
  renderApp();
  fireEvent.click(tab('Quick Hit'));
  fireEvent.click(tab('Next Up'));
  expect(activeTab()).toBe('nextup');
  expect(tab('Quick Hit')).toHaveAttribute('aria-pressed', 'false');
  expect(tab('Next Up')).toHaveAttribute('aria-pressed', 'true');
});

test('reopening after a close starts on whichever tab was tapped', () => {
  renderApp();
  fireEvent.click(tab('Search'));
  fireEvent.click(tab('Search'));
  fireEvent.click(tab('Next Up'));
  expect(activeTab()).toBe('nextup');
});

test('passes the drawer an onEnqueue callback that closes the drawer when called', () => {
  renderApp();
  fireEvent.click(tab('Quick Hit'));
  expect(activeTab()).toBe('quickhit');

  fireEvent.click(screen.getByText('trigger-enqueue'));

  expect(activeTab()).toBe('none');
  expect(tab('Quick Hit')).toHaveAttribute('aria-pressed', 'false');
});

test('jumping to an artist from a different tab switches to Search and carries the artist along', () => {
  renderApp();
  fireEvent.click(tab('Quick Hit'));

  fireEvent.click(screen.getByText('trigger-jump-to-artist'));

  expect(activeTab()).toBe('search');
  expect(tab('Search')).toHaveAttribute('aria-pressed', 'true');
  expect(pendingArtistName()).toBe('Jumped Artist');
});

test('jumping to an artist while already on Search still carries the artist along', () => {
  renderApp();
  fireEvent.click(tab('Search'));

  fireEvent.click(screen.getByText('trigger-jump-to-artist'));

  expect(activeTab()).toBe('search');
  expect(pendingArtistName()).toBe('Jumped Artist');
});

test('clears the pending artist once the drawer reports it consumed', () => {
  renderApp();
  fireEvent.click(screen.getByText('trigger-jump-to-artist'));
  expect(pendingArtistName()).toBe('Jumped Artist');

  fireEvent.click(screen.getByText('trigger-pending-artist-consumed'));

  expect(pendingArtistName()).toBe('none');
});
