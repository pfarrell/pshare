import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import JukeboxApp from './JukeboxApp';

vi.mock('../stores/authStore', () => ({ useAuthStore: vi.fn() }));
vi.mock('./JukeboxLogin', () => ({ default: () => <div data-testid="jukebox-login" /> }));
vi.mock('./JukeboxNowPlaying', () => ({ default: () => <div data-testid="jukebox-now-playing" /> }));
vi.mock('../components/player/MusicPlayerWrapper', () => ({ default: () => <div data-testid="jukebox-footer" /> }));

import { useAuthStore } from '../stores/authStore';

const renderApp = () => render(<MemoryRouter><JukeboxApp /></MemoryRouter>);

test('shows JukeboxLogin when not authenticated', () => {
  useAuthStore.mockReturnValue(false);
  renderApp();
  expect(screen.getByTestId('jukebox-login')).toBeInTheDocument();
});

test('shows the now-playing view and footer player when authenticated', () => {
  useAuthStore.mockReturnValue(true);
  renderApp();
  expect(screen.getByTestId('jukebox-now-playing')).toBeInTheDocument();
  expect(screen.getByTestId('jukebox-footer')).toBeInTheDocument();
});
