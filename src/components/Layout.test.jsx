import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import { useAuthStore } from '../stores/authStore';
import { useUnsavedChangesStore } from '../stores/unsavedChangesStore';

vi.mock('./SearchBar', () => ({ default: () => null }));
vi.mock('../services/api', () => ({
  apiService: {
    getTags: vi.fn(() => Promise.resolve({ data: [] })),
    getSignupUnseenCount: vi.fn(() => Promise.resolve({ data: { count: 0 } })),
    getProfiles: vi.fn(() => Promise.resolve({ data: [] })),
  },
}));

import { apiService } from '../services/api';

const renderLayout = () =>
  render(
    <MemoryRouter>
      <Layout>
        <div>page content</div>
      </Layout>
    </MemoryRouter>
  );

const renderLayoutWithRoutes = (initialPath = '/') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/account" element={<Layout><div>Account page</div></Layout>} />
        <Route path="/admin" element={<Layout><div>Admin page</div></Layout>} />
        <Route path="*" element={
          <Layout>
            <div>page content</div>
          </Layout>
        } />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isAdmin: false });
});

describe('Layout — logged-in hamburger menu', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 1, username: 'pat', admin: false }, isAuthenticated: true, isAdmin: false });
  });

  test('clicking the hamburger opens a dropdown whose username navigates to Account', () => {
    renderLayoutWithRoutes('/');
    const toggle = screen.getByText('pat').closest('button');
    fireEvent.click(toggle);
    const usernameInDropdown = screen.getAllByText('pat')[1];
    fireEvent.click(usernameInDropdown);
    expect(screen.getByText('Account page')).toBeInTheDocument();
  });

  test('does not show Home View, Tag Filter, Account, or Logout', () => {
    renderLayout();
    const toggle = screen.getByText('pat').closest('button');
    fireEvent.click(toggle);
    expect(screen.queryByText('Home View')).not.toBeInTheDocument();
    expect(screen.queryByText('Tag Filter')).not.toBeInTheDocument();
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
  });

  test('shows Playlists, Collections, and Favorites', () => {
    renderLayout();
    const toggle = screen.getByText('pat').closest('button');
    fireEvent.click(toggle);
    expect(screen.getByText('Playlists')).toBeInTheDocument();
    expect(screen.getByText('Collections')).toBeInTheDocument();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
  });

  test('does not show Admin, Upload, New, or Logs for a non-admin', () => {
    renderLayout();
    const toggle = screen.getByText('pat').closest('button');
    fireEvent.click(toggle);
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
    expect(screen.queryByText('New')).not.toBeInTheDocument();
    expect(screen.queryByText('Logs')).not.toBeInTheDocument();
  });
});

describe('Layout — logged-in admin', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 1, username: 'admin-pat', admin: true }, isAuthenticated: true, isAdmin: true });
    apiService.getSignupUnseenCount.mockResolvedValue({ data: { count: 0 } });
  });

  test('shows an unseen-signup badge on the Admin link when opening the menu', async () => {
    apiService.getSignupUnseenCount.mockResolvedValue({ data: { count: 2 } });
    renderLayout();
    const toggle = screen.getByText('admin-pat').closest('button');
    fireEvent.click(toggle);
    expect(await screen.findByText('2')).toBeInTheDocument();
  });

  test('shows no badge when there are no unseen signups', async () => {
    renderLayout();
    const toggle = screen.getByText('admin-pat').closest('button');
    fireEvent.click(toggle);
    await screen.findByText('Admin');
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  test('shows a single Admin link, not Upload/New/Logs', () => {
    renderLayout();
    const toggle = screen.getByText('admin-pat').closest('button');
    fireEvent.click(toggle);
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
    expect(screen.queryByText('New')).not.toBeInTheDocument();
    expect(screen.queryByText('Logs')).not.toBeInTheDocument();
  });

  test('clicking Admin navigates to /admin', () => {
    renderLayoutWithRoutes('/');
    const toggle = screen.getByText('admin-pat').closest('button');
    fireEvent.click(toggle);
    fireEvent.click(screen.getByText('Admin'));
    expect(screen.getByText('Admin page')).toBeInTheDocument();
  });
});

describe('Layout — logged-out hamburger menu', () => {
  test('still shows Home View and Tag Filter', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByText('Home View')).toBeInTheDocument();
    expect(screen.getByText('Tag Filter')).toBeInTheDocument();
  });

  test('shows Login / Sign Up, not Account or Logout', () => {
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByText('Login / Sign Up')).toBeInTheDocument();
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
    expect(screen.queryByText('Logout')).not.toBeInTheDocument();
  });
});

// Simulates a pull-to-refresh gesture: touchstart at the top of the
// scroll container, then a touchmove past the 60px activation threshold,
// then touchend to trigger the refresh (or the unsaved-changes prompt).
const pullToRefresh = (container) => {
  const mainContent = container.querySelector('.main-content');
  fireEvent.touchStart(mainContent, { touches: [{ clientY: 0 }] });
  fireEvent.touchMove(mainContent, { touches: [{ clientY: 80 }] });
  fireEvent.touchEnd(mainContent);
};

describe('Layout — pull-to-refresh with unsaved changes', () => {
  beforeEach(() => {
    useUnsavedChangesStore.setState({ hasUnsavedChanges: false, save: null });
  });

  test('refreshes directly when there are no unsaved changes', () => {
    const { container } = renderLayout();
    pullToRefresh(container);
    expect(screen.queryByRole('heading', { name: 'Unsaved changes' })).not.toBeInTheDocument();
  });

  test('shows the unsaved-changes prompt instead of refreshing immediately', () => {
    useUnsavedChangesStore.setState({ hasUnsavedChanges: true, save: vi.fn() });
    const { container } = renderLayout();
    pullToRefresh(container);
    expect(screen.getByRole('heading', { name: 'Unsaved changes' })).toBeInTheDocument();
  });

  test('Save & Refresh calls the registered save function and closes the prompt', async () => {
    const save = vi.fn().mockResolvedValue();
    useUnsavedChangesStore.setState({ hasUnsavedChanges: true, save });
    const { container } = renderLayout();
    pullToRefresh(container);
    fireEvent.click(screen.getByText('Save & Refresh'));
    await screen.findByText('page content');
    expect(save).toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Unsaved changes' })).not.toBeInTheDocument();
  });

  test('Discard Changes closes the prompt without calling save', () => {
    const save = vi.fn();
    useUnsavedChangesStore.setState({ hasUnsavedChanges: true, save });
    const { container } = renderLayout();
    pullToRefresh(container);
    fireEvent.click(screen.getByText('Discard Changes'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Unsaved changes' })).not.toBeInTheDocument();
  });

  test('Cancel closes the prompt without calling save', () => {
    const save = vi.fn();
    useUnsavedChangesStore.setState({ hasUnsavedChanges: true, save });
    const { container } = renderLayout();
    pullToRefresh(container);
    fireEvent.click(screen.getByText('Cancel'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Unsaved changes' })).not.toBeInTheDocument();
  });
});
