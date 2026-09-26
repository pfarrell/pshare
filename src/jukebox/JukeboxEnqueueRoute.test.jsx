import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import JukeboxEnqueueRoute from './JukeboxEnqueueRoute';
import { useAuthStore } from '../stores/authStore';
import { getStoredJukeboxToken } from '../utils/jukeboxEnqueueToken';

vi.mock('./JukeboxEnqueuePage', () => ({ default: ({ token }) => <div>Enqueue page for {token}</div> }));

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/jukebox/:token" element={<JukeboxEnqueueRoute />} />
        <Route path="/" element={<div>Normal app home</div>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({ isAuthenticated: false });
});

test('renders JukeboxEnqueuePage with the token when not authenticated', () => {
  renderAt('/jukebox/abc123');
  expect(screen.getByText('Enqueue page for abc123')).toBeInTheDocument();
});

test('stores the token and redirects to / when already authenticated', async () => {
  useAuthStore.setState({ isAuthenticated: true });
  renderAt('/jukebox/abc123');

  await waitFor(() => expect(screen.getByText('Normal app home')).toBeInTheDocument());
  expect(getStoredJukeboxToken()).toBe('abc123');
});
