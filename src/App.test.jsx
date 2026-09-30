import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScrollToTop } from './App';
import App from './App';

// App's auth-init effect calls apiService.getMe() on mount. Mocked here so
// the guest-chrome test below resolves deterministically (as a 401 — the
// "nobody is logged in" case) rather than depending on a real network round
// trip in jsdom.
vi.mock('./services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    apiService: {
      ...actual.apiService,
      getMe: vi.fn(() => Promise.reject({ response: { status: 401 } })),
    },
  };
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop />
    </MemoryRouter>
  );
}

describe('ScrollToTop', () => {
  let mainContent;

  beforeEach(() => {
    mainContent = document.createElement('div');
    mainContent.className = 'main-content';
    // jsdom doesn't implement Element.scrollTo.
    mainContent.scrollTo = (x, y) => { mainContent.scrollTop = y ?? (typeof x === 'object' ? x.top : 0) ?? 0; };
    document.body.appendChild(mainContent);
  });

  afterEach(() => {
    mainContent.remove();
  });

  test('resets .main-content scroll on a non-home route', () => {
    mainContent.scrollTop = 300;
    renderAt('/artist/1');
    expect(mainContent.scrollTop).toBe(0);
  });

  test('leaves .main-content scroll untouched on the home route', () => {
    mainContent.scrollTop = 300;
    renderAt('/');
    expect(mainContent.scrollTop).toBe(300);
  });
});

// The guest components' own tests render them in isolation, so none can catch a
// regression where the real App tree wraps /jukebox/:token in the app
// header/hamburger menu and the persistent audio-player footer (rendered
// unconditionally, outside <Routes>, for every route in the normal tree, see
// App.jsx). This renders the real App component, with window.location pointing
// at a guest link, to prove the chrome-free early-return branch is actually
// what a visitor gets.
describe('App: anonymous visitor at /jukebox/:token', () => {
  const originalPathname = window.location.pathname;

  afterEach(() => {
    window.history.pushState({}, '', originalPathname);
  });

  test('renders the guest app with no Layout header/hamburger/footer chrome', async () => {
    window.history.pushState({}, '', '/jukebox/sometoken');

    render(<App />);

    // Wait for the auth-init effect (mocked getMe() rejecting 401) to
    // resolve so App moves past its "Loading..." gate.
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    // The guest app itself renders (its first-load state is the
    // "your name" form).
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();

    // None of the normal app's chrome is present.
    expect(document.querySelector('.app-footer')).not.toBeInTheDocument();
    expect(document.querySelector('.app-header')).not.toBeInTheDocument();
    expect(document.querySelector('.header-content')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Menu')).not.toBeInTheDocument();
  });
});

describe('App: logged-in visitor at /jukebox/:token', () => {
  const originalPathname = window.location.pathname;

  afterEach(() => {
    window.history.pushState({}, '', originalPathname);
    localStorage.clear();
  });

  test('stays in the guest app instead of being redirected to the normal app', async () => {
    const { apiService } = await import('./services/api');
    apiService.getMe.mockResolvedValueOnce({ data: { user: { id: 2, username: 'pat', admin: false } } });
    window.history.pushState({}, '', '/jukebox/sometoken');

    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(window.location.pathname).toBe('/jukebox/sometoken');
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(document.querySelector('.app-header')).not.toBeInTheDocument();
  });

  test('keeps a logged-in visitor on a deep guest link too', async () => {
    const { apiService } = await import('./services/api');
    apiService.getMe.mockResolvedValueOnce({ data: { user: { id: 2, username: 'pat', admin: false } } });
    localStorage.setItem('jukebox-guest-name', 'Pat');
    window.history.pushState({}, '', '/jukebox/sometoken/playlists');

    render(<App />);
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(window.location.pathname).toBe('/jukebox/sometoken/playlists');
    expect(document.querySelector('.jukebox-guest')).toBeInTheDocument();
  });
});
