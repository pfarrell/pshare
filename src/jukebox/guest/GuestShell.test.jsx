import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GuestShell from './GuestShell';
import { GuestProvider } from './GuestContext';

vi.mock('../../services/api', () => ({ apiService: { submitToJukebox: vi.fn(), sendJukeboxCommand: vi.fn() } }));

const renderShell = (route = '/jukebox/tok') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <GuestProvider token="tok">
        <Routes>
          <Route path="/jukebox/:token" element={<GuestShell />}>
            <Route index element={<div>home page</div>} />
            <Route path="search" element={<div>search page</div>} />
            <Route path="playlists" element={<div>playlists page</div>} />
          </Route>
        </Routes>
      </GuestProvider>
    </MemoryRouter>
  );

test('renders the child page', () => {
  renderShell();
  expect(screen.getByText('home page')).toBeInTheDocument();
});

test('submitting the search box navigates to the search route with the query', () => {
  renderShell();
  fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'abba' } });
  fireEvent.submit(screen.getByRole('search'));
  expect(screen.getByText('search page')).toBeInTheDocument();
});

test('the search box shows the current query on the search route', () => {
  renderShell('/jukebox/tok/search?q=queen');
  expect(screen.getByPlaceholderText('Search')).toHaveValue('queen');
});

test('the menu opens with Home, Playlists and Collections links and no admin or account links', () => {
  renderShell();
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/jukebox/tok');
  expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('href', '/jukebox/tok/playlists');
  expect(screen.getByRole('link', { name: 'Collections' })).toHaveAttribute('href', '/jukebox/tok/collections');
  expect(screen.queryByRole('link', { name: /admin|account|login|favorites/i })).not.toBeInTheDocument();
});

test('choosing a menu link navigates and closes the menu', () => {
  renderShell();
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  fireEvent.click(screen.getByRole('link', { name: 'Playlists' }));
  expect(screen.getByText('playlists page')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Collections' })).not.toBeInTheDocument();
});

test('always shows the jukebox remote, on every guest page', () => {
  renderShell('/jukebox/tok/playlists');
  expect(screen.getByRole('button', { name: 'Jukebox play or pause' })).toBeInTheDocument();
});

test('the menu links to the Queue page', () => {
  renderShell();
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  expect(screen.getByRole('link', { name: 'Queue' })).toHaveAttribute('href', '/jukebox/tok/queue');
});
