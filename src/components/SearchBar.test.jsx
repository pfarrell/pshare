import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import SearchBar from './SearchBar';
import { usePlayerStore } from '../stores/playerStore';

// Captures the current location so we can assert navigation happened
const LocationDisplay = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
};

const renderSearchBar = () =>
  render(
    <MemoryRouter>
      <SearchBar />
      <LocationDisplay />
    </MemoryRouter>
  );

describe('SearchBar', () => {
  test('renders the search input', () => {
    renderSearchBar();
    expect(
      screen.getByPlaceholderText('Search for songs, artists, or albums')
    ).toBeInTheDocument();
  });

  test('navigates to /search?q=... on form submit', async () => {
    const user = userEvent.setup();
    renderSearchBar();

    await user.type(
      screen.getByPlaceholderText('Search for songs, artists, or albums'),
      'pink floyd'
    );
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/search?q=pink%20floyd'
    );
  });

  test('does not navigate when query is empty', async () => {
    const user = userEvent.setup();
    renderSearchBar();

    await user.keyboard('{Enter}');

    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  test('does not navigate when query is only whitespace', async () => {
    const user = userEvent.setup();
    renderSearchBar();

    await user.type(
      screen.getByPlaceholderText('Search for songs, artists, or albums'),
      '   '
    );
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  test('shows a clear button only once there is text, and clears it on click', async () => {
    const user = userEvent.setup();
    renderSearchBar();
    const input = screen.getByPlaceholderText(
      'Search for songs, artists, or albums'
    );

    expect(
      screen.queryByRole('button', { name: 'Clear search' })
    ).not.toBeInTheDocument();

    await user.type(input, 'pink floyd');
    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    expect(clearButton).toBeInTheDocument();

    await user.click(clearButton);

    expect(input).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Clear search' })
    ).not.toBeInTheDocument();
  });

  test('closes the playlist drawer on submit', async () => {
    const closeDrawer = vi.fn();
    usePlayerStore.setState({ closeDrawer });
    const user = userEvent.setup();
    renderSearchBar();

    await user.type(
      screen.getByPlaceholderText('Search for songs, artists, or albums'),
      'pink floyd'
    );
    await user.keyboard('{Enter}');

    expect(closeDrawer).toHaveBeenCalled();
  });
});
