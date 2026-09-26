import { useAuthStore } from './authStore';
import { useProfileFilterStore } from './profileFilterStore';
import { useFavoritesStore } from './favoritesStore';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    login: vi.fn(),
    logout: vi.fn(),
    signup: vi.fn(),
    getMe: vi.fn(),
    getFavorites: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

const initialState = {
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  loading: false,
};

beforeEach(() => {
  useAuthStore.setState(initialState);
  useProfileFilterStore.setState({ activeProfileId: null });
  useFavoritesStore.setState({ items: [], loading: false, loaded: false });
  localStorage.clear();
  vi.clearAllMocks();
});

describe('authStore — initial state', () => {
  test('user is null', () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  test('isAuthenticated is false', () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  test('isAdmin is false', () => {
    expect(useAuthStore.getState().isAdmin).toBe(false);
  });

  test('loading is false', () => {
    expect(useAuthStore.getState().loading).toBe(false);
  });
});

describe('authStore — initialize', () => {
  test('sets isAuthenticated on success', async () => {
    apiService.getMe.mockResolvedValue({
      data: { user: { id: 1, username: 'pat', admin: false, default_profile_id: null } },
    });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  test('clears auth state on a real 401', async () => {
    useAuthStore.setState({ user: { id: 1, username: 'pat' }, isAuthenticated: true, isAdmin: false });
    apiService.getMe.mockRejectedValue({ response: { status: 401 } });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  test('does not clear existing auth state on a 502', async () => {
    useAuthStore.setState({ user: { id: 1, username: 'pat' }, isAuthenticated: true, isAdmin: true });
    apiService.getMe.mockRejectedValue({ response: { status: 502 } });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user).toEqual({ id: 1, username: 'pat' });
    expect(useAuthStore.getState().isAdmin).toBe(true);
  });

  test('does not clear existing auth state on a network error with no response', async () => {
    useAuthStore.setState({ user: { id: 1, username: 'pat' }, isAuthenticated: true, isAdmin: false });
    apiService.getMe.mockRejectedValue(new Error('Network Error'));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  test('clears loading after a non-401 error', async () => {
    apiService.getMe.mockRejectedValue({ response: { status: 502 } });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().loading).toBe(false);
  });

  test('stores jukeboxDeviceId and jukeboxEnqueueToken from the /auth/me response', async () => {
    apiService.getMe.mockResolvedValue({
      data: { user: { id: 1, username: 'kitchen', admin: false, default_profile_id: null }, jukeboxDeviceId: 7, jukeboxEnqueueToken: 'abc123' },
    });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().jukeboxDeviceId).toBe(7);
    expect(useAuthStore.getState().jukeboxEnqueueToken).toBe('abc123');
  });

  test('stores null jukeboxDeviceId/jukeboxEnqueueToken for a normal session', async () => {
    apiService.getMe.mockResolvedValue({
      data: { user: { id: 1, username: 'someone', admin: false, default_profile_id: null }, jukeboxDeviceId: null, jukeboxEnqueueToken: null },
    });

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().jukeboxDeviceId).toBeNull();
    expect(useAuthStore.getState().jukeboxEnqueueToken).toBeNull();
  });
});

describe('authStore — login', () => {
  test('sets isAuthenticated on success', async () => {
    apiService.login.mockResolvedValue({
      data: { user: { id: 1, username: 'pat', admin: false, default_profile_id: null } },
    });

    await useAuthStore.getState().login('pat', 'password');

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  test('sets isAdmin true for admin users', async () => {
    apiService.login.mockResolvedValue({
      data: { user: { id: 1, username: 'pat', admin: true, default_profile_id: null } },
    });

    await useAuthStore.getState().login('pat', 'password');

    expect(useAuthStore.getState().isAdmin).toBe(true);
  });

  test('sets isAdmin false for non-admin users', async () => {
    apiService.login.mockResolvedValue({
      data: { user: { id: 2, username: 'regular', admin: false, default_profile_id: null } },
    });

    await useAuthStore.getState().login('regular', 'password');

    expect(useAuthStore.getState().isAdmin).toBe(false);
  });

  test('returns { success: true } on success', async () => {
    apiService.login.mockResolvedValue({
      data: { user: { id: 1, username: 'pat', admin: false, default_profile_id: null } },
    });

    const result = await useAuthStore.getState().login('pat', 'password');

    expect(result).toEqual({ success: true });
  });

  test('returns { success: false, error } on failure', async () => {
    apiService.login.mockRejectedValue({
      response: { data: { error: 'Invalid username or password' } },
    });

    const result = await useAuthStore.getState().login('pat', 'wrong');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid username or password');
  });

  test('leaves isAuthenticated false on failure', async () => {
    apiService.login.mockRejectedValue({
      response: { data: { error: 'Invalid username or password' } },
    });

    await useAuthStore.getState().login('pat', 'wrong');

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  test('loads favorites on successful login', async () => {
    apiService.login.mockResolvedValue({
      data: { user: { id: 1, username: 'pat', admin: false, default_profile_id: null } },
    });

    await useAuthStore.getState().login('pat', 'password');

    expect(apiService.getFavorites).toHaveBeenCalled();
  });
});

describe('authStore — signup', () => {
  test('sets isAuthenticated on success', async () => {
    apiService.signup.mockResolvedValue({
      data: { user: { id: 3, username: 'newuser', admin: false, default_profile_id: null } },
    });

    await useAuthStore.getState().signup('newuser', 'password');

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  test('sets user from the response', async () => {
    apiService.signup.mockResolvedValue({
      data: { user: { id: 3, username: 'newuser', admin: false, default_profile_id: null } },
    });

    await useAuthStore.getState().signup('newuser', 'password');

    expect(useAuthStore.getState().user).toEqual({ id: 3, username: 'newuser', admin: false, default_profile_id: null });
  });

  test('returns { success: false, error } on failure without changing auth state', async () => {
    apiService.signup.mockRejectedValue({
      response: { data: { error: 'Username already taken' } },
    });

    const result = await useAuthStore.getState().signup('newuser', 'password');

    expect(result).toEqual({ success: false, error: 'Username already taken' });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('authStore — logout', () => {
  test('clears user', async () => {
    useAuthStore.setState({ user: { id: 1, username: 'pat' }, isAuthenticated: true, isAdmin: false });
    apiService.logout.mockResolvedValue({});

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().user).toBeNull();
  });

  test('clears isAuthenticated', async () => {
    useAuthStore.setState({ user: { id: 1, username: 'pat' }, isAuthenticated: true, isAdmin: false });
    apiService.logout.mockResolvedValue({});

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  test('clears isAdmin', async () => {
    useAuthStore.setState({ user: { id: 1, username: 'pat' }, isAuthenticated: true, isAdmin: true });
    apiService.logout.mockResolvedValue({});

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAdmin).toBe(false);
  });

  test('clears favorites', async () => {
    useAuthStore.setState({ user: { id: 1, username: 'pat' }, isAuthenticated: true, isAdmin: false });
    useFavoritesStore.setState({ items: [{ id: 1, kind: 'artist', target_id: 5, item: {} }], loaded: true });
    apiService.logout.mockResolvedValue({});

    await useAuthStore.getState().logout();

    expect(useFavoritesStore.getState().items).toEqual([]);
  });
});
