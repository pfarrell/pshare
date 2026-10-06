import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Admin from './Admin';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuthStore } from '../stores/authStore';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getSignupUnseenCount: vi.fn(),
  },
}));

const renderAdmin = () =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/upload" element={<div>Upload page</div>} />
        <Route path="/admin/new" element={<div>New page</div>} />
        <Route path="/admin/logs" element={<div>Logs page</div>} />
        <Route path="/admin/factoids" element={<div>Factoids page</div>} />
        <Route path="/admin/errors" element={<div>Errors page</div>} />
        <Route path="/admin/signups" element={<div>Signups page</div>} />
      </Routes>
    </MemoryRouter>
  );

// Mirrors how App.jsx actually wires the /admin route:
// <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
const initialAuthState = { user: null, isAuthenticated: false, isAdmin: false, loading: false };

const renderProtectedAdmin = (authOverrides = {}) => {
  useAuthStore.setState({ ...initialAuthState, ...authOverrides });
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={
          <ProtectedRoute requireAdmin>
            <Admin />
          </ProtectedRoute>
        } />
      </Routes>
    </MemoryRouter>
  );
};

describe('Admin', () => {
  beforeEach(() => {
    apiService.getSignupUnseenCount.mockResolvedValue({ data: { count: 0 } });
  });

  test('renders links to Upload, New, Logs, Errors, and Signups', () => {
    renderAdmin();
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
    expect(screen.getByText('Signups')).toBeInTheDocument();
  });

  test('clicking Signups navigates to /admin/signups', () => {
    renderAdmin();
    fireEvent.click(screen.getByText('Signups'));
    expect(screen.getByText('Signups page')).toBeInTheDocument();
  });

  test('shows the unseen signup count as a badge on the Signups card', async () => {
    apiService.getSignupUnseenCount.mockResolvedValue({ data: { count: 3 } });
    renderAdmin();
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  test('shows no badge when there are no unseen signups', async () => {
    apiService.getSignupUnseenCount.mockResolvedValue({ data: { count: 0 } });
    renderAdmin();
    await waitFor(() => expect(apiService.getSignupUnseenCount).toHaveBeenCalled());
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  test('clicking Upload navigates to /admin/upload', () => {
    renderAdmin();
    fireEvent.click(screen.getByText('Upload'));
    expect(screen.getByText('Upload page')).toBeInTheDocument();
  });

  test('clicking New navigates to /admin/new', () => {
    renderAdmin();
    fireEvent.click(screen.getByText('New'));
    expect(screen.getByText('New page')).toBeInTheDocument();
  });

  test('clicking Logs navigates to /admin/logs', () => {
    renderAdmin();
    fireEvent.click(screen.getByText('Logs'));
    expect(screen.getByText('Logs page')).toBeInTheDocument();
  });

  test('clicking Factoids navigates to /admin/factoids', () => {
    renderAdmin();
    fireEvent.click(screen.getByText('Factoids'));
    expect(screen.getByText('Factoids page')).toBeInTheDocument();
  });

  test('clicking Errors navigates to /admin/errors', () => {
    renderAdmin();
    fireEvent.click(screen.getByText('Errors'));
    expect(screen.getByText('Errors page')).toBeInTheDocument();
  });
});

describe('Admin route protection', () => {
  afterEach(() => {
    useAuthStore.setState(initialAuthState);
  });

  test('denies access to a non-admin user', () => {
    renderProtectedAdmin({ isAuthenticated: true, isAdmin: false, user: { id: 1, username: 'pat', admin: false } });
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
  });

  test('allows access to an admin user', () => {
    renderProtectedAdmin({ isAuthenticated: true, isAdmin: true, user: { id: 1, username: 'admin-pat', admin: true } });
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });
});
