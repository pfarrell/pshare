import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxApp from './JukeboxApp';

vi.mock('../stores/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('./JukeboxLogin', () => ({ default: () => <div data-testid="jukebox-login" /> }));
vi.mock('./JukeboxNowPlaying', () => ({ default: () => <div data-testid="jukebox-now-playing" /> }));
vi.mock('../components/player/MusicPlayerWrapper', () => ({ default: () => <div data-testid="jukebox-footer" /> }));
vi.mock('./JukeboxBrowsePanel', () => ({ default: ({ onClose }) => <div data-testid="jukebox-browse-panel"><button onClick={onClose}>close-panel</button></div> }));
vi.mock('./JukeboxKeyboard', () => ({ default: ({ targetElement }) => (targetElement ? <div data-testid="jukebox-keyboard" /> : null) }));
vi.mock('./useJukeboxKeyboardFocus', () => ({ useJukeboxKeyboardFocus: vi.fn() }));

import { useAuthStore } from '../stores/authStore';
import { useJukeboxKeyboardFocus } from './useJukeboxKeyboardFocus';

const renderApp = () => render(<MemoryRouter><JukeboxApp /></MemoryRouter>);

beforeEach(() => {
  useJukeboxKeyboardFocus.mockReturnValue(null);
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
  useAuthStore.mockReturnValue(true);
  useJukeboxKeyboardFocus.mockReturnValue(document.createElement('input'));
  renderApp();
  expect(screen.getByTestId('jukebox-keyboard')).toBeInTheDocument();
});

test('shows the now-playing view and footer player when authenticated', () => {
  useAuthStore.mockReturnValue(true);
  renderApp();
  expect(screen.getByTestId('jukebox-now-playing')).toBeInTheDocument();
  expect(screen.getByTestId('jukebox-footer')).toBeInTheDocument();
});

test('tapping the browse button opens the browse panel', () => {
  useAuthStore.mockReturnValue(true);
  renderApp();
  fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
  expect(screen.getByTestId('jukebox-browse-panel')).toBeInTheDocument();
});

test('tapping the browse panel\'s close button closes it', () => {
  useAuthStore.mockReturnValue(true);
  renderApp();
  fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
  fireEvent.click(screen.getByText('close-panel'));
  expect(screen.queryByTestId('jukebox-browse-panel')).not.toBeInTheDocument();
});
