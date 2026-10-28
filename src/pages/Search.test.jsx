import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Search from './Search';
import { apiService } from '../services/api';
import { getSpotifyStatusCached } from '../player/spotify/statusCache';
import { usePlayerStore } from '../stores/playerStore';
import { useProfileFilterStore } from '../stores/profileFilterStore';

vi.mock('../services/api', () => ({
  apiService: {
    search: vi.fn(),
    searchSpotify: vi.fn(),
    getImageUrl: () => '/img/sm/x.jpg',
  },
}));

vi.mock('../player/spotify/statusCache', () => ({ getSpotifyStatusCached: vi.fn() }));

vi.mock('../components/AddToCollectionModal', () => ({ default: () => null }));

// jsdom doesn't implement IntersectionObserver. This fake captures the
// callback passed by Search.jsx so a test can invoke it directly to
// simulate the sentinel scrolling into view.
let intersectionCallback;
beforeEach(() => {
  intersectionCallback = null;
  // Vitest 4's vi.fn() requires a `function`/`class` implementation (not an
  // arrow function) to support being invoked with `new`, which is how
  // Search.jsx constructs this — see IntersectionObserver usage below.
  global.IntersectionObserver = vi.fn(function (callback) {
    intersectionCallback = callback;
    return { observe: vi.fn(), disconnect: vi.fn() };
  });
  // apiService.search is a single module-scoped mock shared by every test in
  // this file (created once by the vi.mock factory above). Without clearing
  // call history between tests, the new pagination tests' exact-call-count
  // assertions (toHaveBeenCalledTimes(2)) would accumulate calls left over
  // from earlier tests in the file and fail spuriously when run together,
  // even though each test still sets its own fresh mockResolvedValue(Once).
  apiService.search.mockClear();
  // Default: Spotify unconfigured, so tests that predate the Spotify section
  // see exactly the page they always did. Spotify tests override this.
  apiService.searchSpotify.mockReset();
  apiService.searchSpotify.mockResolvedValue({ data: { configured: false, tracks: [], albums: [], artists: [] } });
  getSpotifyStatusCached.mockReset();
  getSpotifyStatusCached.mockResolvedValue(null);
  useProfileFilterStore.setState({ activeProfileId: null });
});

function triggerIntersection() {
  intersectionCallback([{ isIntersecting: true }]);
}

const renderSearch = (q) =>
  render(
    <MemoryRouter initialEntries={[`/search?q=${q}`]}>
      <Routes>
        <Route path="/search" element={<Search />} />
      </Routes>
    </MemoryRouter>
  );

test('renders mixed-type results in the order the API returned', async () => {
  apiService.search.mockResolvedValue({
    data: {
      results: [
        { type: 'artist', data: { id: 1, name: 'Ranked Artist', image_path: 'a.jpg' } },
        { type: 'album', data: { id: 2, title: 'Ranked Album', image_path: 'b.jpg', artist: { id: 3, name: 'Other Artist' } } },
      ],
      tracks: [],
      count: 2,
    },
  });

  renderSearch('ranked');

  await screen.findByText('Ranked Artist');
  // Distinct artist names (rather than reusing "Ranked Artist" for both the
  // artist card and the album's artist subtitle) avoid a duplicate-text match
  // on getByText, and asserting heading order actually verifies the API's
  // ranking order made it to the DOM instead of just checking presence.
  const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(headings).toEqual(['Ranked Artist', 'Ranked Album']);
  expect(screen.getByText('ARTIST')).toBeInTheDocument();
  expect(screen.getByText('ALBUM')).toBeInTheDocument();
});

test('renders tracks in their own section, separate from the ranked results', async () => {
  apiService.search.mockResolvedValue({
    data: {
      results: [],
      tracks: [{ id: 9, title: 'Some Track', duration: 180, artist: { name: 'Some Artist' } }],
      count: 1,
    },
  });

  renderSearch('track');

  expect(await screen.findByText(/Some Track/)).toBeInTheDocument();
  expect(screen.getByText('Tracks (1)')).toBeInTheDocument();
});

test('shows a no-results message when both results and tracks are empty', async () => {
  apiService.search.mockResolvedValue({ data: { results: [], tracks: [], count: 0 } });

  renderSearch('nothing');

  expect(await screen.findByText('No results found for "nothing"')).toBeInTheDocument();
});

test('renders a pill per type present, filters the grid when a pill is toggled, and shows everything again when toggled off', async () => {
  apiService.search.mockResolvedValue({
    data: {
      results: [
        { type: 'artist', data: { id: 1, name: 'Only Artist', image_path: 'a.jpg' } },
        { type: 'album', data: { id: 2, title: 'Only Album', image_path: 'b.jpg', artist: { id: 3, name: 'Other Artist' } } },
      ],
      hasMore: false,
      resultCounts: { album: 1, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 2,
    },
  });

  renderSearch('mixed');
  await screen.findByText('Only Artist');

  expect(screen.getByText('Albums 1')).toBeInTheDocument();
  expect(screen.getByText('Artists 1')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Albums 1'));

  expect(screen.getByText('Only Album')).toBeInTheDocument();
  expect(screen.queryByText('Only Artist')).toBeNull();
  expect(screen.getByText('Results (1)')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Albums 1'));

  expect(screen.getByText('Only Artist')).toBeInTheDocument();
  expect(screen.getByText('Only Album')).toBeInTheDocument();
});

test('resets the active type filter when a new search query is submitted', async () => {
  apiService.search.mockResolvedValueOnce({
    data: {
      results: [
        { type: 'artist', data: { id: 1, name: 'First Artist', image_path: 'a.jpg' } },
        { type: 'album', data: { id: 2, title: 'First Album', image_path: 'b.jpg', artist: { id: 3, name: 'Other Artist' } } },
      ],
      hasMore: false,
      resultCounts: { album: 1, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 2,
    },
  });

  const SearchWithNavHelper = () => {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate('/search?q=second')}>go to second search</button>
        <Search />
      </>
    );
  };

  render(
    <MemoryRouter initialEntries={['/search?q=first']}>
      <Routes>
        <Route path="/search" element={<SearchWithNavHelper />} />
      </Routes>
    </MemoryRouter>
  );

  await screen.findByText('First Artist');
  fireEvent.click(screen.getByText('Albums 1'));
  expect(screen.queryByText('First Artist')).toBeNull();

  apiService.search.mockResolvedValueOnce({
    data: {
      results: [
        { type: 'artist', data: { id: 4, name: 'Second Artist', image_path: 'a.jpg' } },
      ],
      hasMore: false,
      resultCounts: { album: 0, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  fireEvent.click(screen.getByText('go to second search'));

  expect(await screen.findByText('Second Artist')).toBeInTheDocument();
});

test('loads and appends the next page when the sentinel intersects', async () => {
  apiService.search.mockResolvedValueOnce({
    data: {
      results: [{ type: 'artist', data: { id: 1, name: 'Page One Artist', image_path: 'a.jpg' } }],
      hasMore: true,
      resultCounts: { album: 0, artist: 2, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
      pageSize: 30,
    },
  });

  renderSearch('paged');
  await screen.findByText('Page One Artist');

  apiService.search.mockResolvedValueOnce({
    data: {
      results: [{ type: 'artist', data: { id: 2, name: 'Page Two Artist', image_path: 'a.jpg' } }],
      hasMore: false,
      resultCounts: { album: 0, artist: 2, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  // The IntersectionObserver is constructed in a useEffect that fires after
  // the commit that shows 'Page One Artist' — under load, that effect can
  // still be pending here, so wait for it rather than assuming it has
  // already run by the time findByText above resolved.
  await waitFor(() => expect(intersectionCallback).not.toBeNull());
  triggerIntersection();

  await screen.findByText('Page Two Artist');
  expect(screen.getByText('Page One Artist')).toBeInTheDocument();
  expect(apiService.search).toHaveBeenLastCalledWith('paged', 30, null);
});

test('does not duplicate an entity that reappears on a later page', async () => {
  apiService.search.mockResolvedValueOnce({
    data: {
      results: [{ type: 'artist', data: { id: 1, name: 'Repeat Artist', image_path: 'a.jpg' } }],
      hasMore: true,
      resultCounts: { album: 0, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  renderSearch('dupe');
  await screen.findByText('Repeat Artist');

  apiService.search.mockResolvedValueOnce({
    data: {
      // Same (type, id) as page 1 — simulates the raw exact/fuzzy duplicate
      // edge case landing on a different page.
      results: [{ type: 'artist', data: { id: 1, name: 'Repeat Artist', image_path: 'a.jpg' } }],
      hasMore: false,
      resultCounts: { album: 0, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  await waitFor(() => expect(intersectionCallback).not.toBeNull());
  triggerIntersection();

  await waitFor(() => expect(apiService.search).toHaveBeenCalledTimes(2));
  expect(screen.getAllByText('Repeat Artist')).toHaveLength(1);
});

test('does not render a sentinel once hasMore is false', async () => {
  apiService.search.mockResolvedValue({
    data: {
      results: [{ type: 'artist', data: { id: 1, name: 'Only Artist', image_path: 'a.jpg' } }],
      hasMore: false,
      resultCounts: { album: 0, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  renderSearch('done');
  await screen.findByText('Only Artist');

  expect(global.IntersectionObserver).not.toHaveBeenCalled();
});

test('shows the heading and pill counts from resultCounts, not the loaded page size', async () => {
  apiService.search.mockResolvedValue({
    data: {
      results: [{ type: 'artist', data: { id: 1, name: 'Solo Artist', image_path: 'a.jpg' } }],
      hasMore: true,
      resultCounts: { album: 5, artist: 40, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  renderSearch('many');
  await screen.findByText('Solo Artist');

  expect(screen.getByText('Results (45)')).toBeInTheDocument();
  expect(screen.getByText('Artists 40')).toBeInTheDocument();
});

test('resets pagination state when a new search query is submitted', async () => {
  apiService.search.mockResolvedValueOnce({
    data: {
      results: [{ type: 'artist', data: { id: 1, name: 'First Page Artist', image_path: 'a.jpg' } }],
      hasMore: true,
      resultCounts: { album: 0, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  const SearchWithNavHelper = () => {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate('/search?q=second')}>go to second search</button>
        <Search />
      </>
    );
  };

  render(
    <MemoryRouter initialEntries={['/search?q=first']}>
      <Routes>
        <Route path="/search" element={<SearchWithNavHelper />} />
      </Routes>
    </MemoryRouter>
  );

  await screen.findByText('First Page Artist');

  apiService.search.mockResolvedValueOnce({
    data: {
      results: [{ type: 'artist', data: { id: 9, name: 'Second Search Artist', image_path: 'a.jpg' } }],
      hasMore: false,
      resultCounts: { album: 0, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  fireEvent.click(screen.getByText('go to second search'));

  await screen.findByText('Second Search Artist');
  expect(screen.queryByText('First Page Artist')).toBeNull();
  // performSearch calls apiService.search with an explicit `undefined` offset
  // and the active profile id (null here, since no test sets the profile
  // filter store) — toHaveBeenCalledWith compares argument arrays by length,
  // so all three positions must be asserted.
  expect(apiService.search).toHaveBeenLastCalledWith('second', undefined, null);
});

test('discards a loadMore response that resolves after a new search has already started', async () => {
  apiService.search.mockResolvedValueOnce({
    data: {
      results: [{ type: 'artist', data: { id: 1, name: 'Race First Page', image_path: 'a.jpg' } }],
      hasMore: true,
      resultCounts: { album: 0, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  const SearchWithNavHelper = () => {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate('/search?q=racenew')}>go to new search</button>
        <Search />
      </>
    );
  };

  render(
    <MemoryRouter initialEntries={['/search?q=raceold']}>
      <Routes>
        <Route path="/search" element={<SearchWithNavHelper />} />
      </Routes>
    </MemoryRouter>
  );

  await screen.findByText('Race First Page');

  // loadMore's fetch is held open deliberately, to resolve it only after a
  // new search has already completed below.
  let resolveLoadMore;
  apiService.search.mockImplementationOnce(
    () => new Promise((resolve) => { resolveLoadMore = resolve; })
  );
  await waitFor(() => expect(intersectionCallback).not.toBeNull());
  triggerIntersection();
  await waitFor(() => expect(apiService.search).toHaveBeenCalledTimes(2));

  apiService.search.mockResolvedValueOnce({
    data: {
      results: [{ type: 'artist', data: { id: 2, name: 'Race New Query Artist', image_path: 'a.jpg' } }],
      hasMore: false,
      resultCounts: { album: 0, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });
  fireEvent.click(screen.getByText('go to new search'));
  await screen.findByText('Race New Query Artist');

  // The stale loadMore fetch (started before the new search) finally
  // resolves now, well after the new search's own results are showing.
  await act(async () => {
    resolveLoadMore({
      data: {
        results: [{ type: 'artist', data: { id: 3, name: 'Stale Page Two Artist', image_path: 'a.jpg' } }],
        hasMore: false,
        resultCounts: { album: 0, artist: 99, playlist: 0, collection: 0 },
        tracks: [],
        count: 1,
      },
    });
  });

  expect(screen.queryByText('Stale Page Two Artist')).toBeNull();
  expect(screen.getByText('Results (1)')).toBeInTheDocument();
});

test('re-runs the search when the profile filter is switched while already on the page', async () => {
  apiService.search.mockResolvedValue({
    data: {
      results: [{ type: 'artist', data: { id: 1, name: 'Profiled Artist', image_path: 'a.jpg' } }],
      hasMore: false,
      resultCounts: { album: 0, artist: 1, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  renderSearch('jazz');
  await screen.findByText('Profiled Artist');
  expect(apiService.search).toHaveBeenLastCalledWith('jazz', undefined, null);

  // The header's profile chip is rendered on every page, so switching the
  // filter without touching the query is a normal interaction here.
  await act(async () => {
    useProfileFilterStore.setState({ activeProfileId: 3 });
  });

  await waitFor(() => expect(apiService.search).toHaveBeenLastCalledWith('jazz', undefined, 3));
});

test('loads more with the new profile id after a profile switch, not the old one', async () => {
  apiService.search.mockResolvedValue({
    data: {
      results: [{ type: 'artist', data: { id: 1, name: 'Paged Profiled Artist', image_path: 'a.jpg' } }],
      hasMore: true,
      resultCounts: { album: 0, artist: 40, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
      pageSize: 30,
    },
  });

  renderSearch('paged');
  await screen.findByText('Paged Profiled Artist');
  await waitFor(() => expect(intersectionCallback).not.toBeNull());
  const observersBeforeSwitch = global.IntersectionObserver.mock.calls.length;

  await act(async () => {
    useProfileFilterStore.setState({ activeProfileId: 3 });
  });
  // loadMore's identity changes with activeProfileId, which re-runs the
  // observer effect and re-captures intersectionCallback — waiting for that
  // fresh observer is what guarantees the trigger below goes through the
  // post-switch loadMore rather than the stale closure this test is about.
  await waitFor(() =>
    expect(global.IntersectionObserver.mock.calls.length).toBeGreaterThan(observersBeforeSwitch));

  await act(async () => { triggerIntersection(); });

  await waitFor(() => expect(apiService.search).toHaveBeenLastCalledWith('paged', 30, 3));
});

test('a failed loadMore keeps existing results in place and shows an inline error, not the full-page error view', async () => {
  apiService.search.mockResolvedValueOnce({
    data: {
      results: [{ type: 'artist', data: { id: 1, name: 'Kept Page One Artist', image_path: 'a.jpg' } }],
      hasMore: true,
      resultCounts: { album: 0, artist: 2, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
      pageSize: 30,
    },
  });

  renderSearch('flaky');
  await screen.findByText('Kept Page One Artist');

  apiService.search.mockRejectedValueOnce(new Error('network blip'));

  await waitFor(() => expect(intersectionCallback).not.toBeNull());
  triggerIntersection();

  await screen.findByText('Failed to load more results.');

  // The first page's results, heading, and pills must still be mounted —
  // a loadMore failure must not trigger the full-page error takeover that
  // performSearch failures use, which would unmount all of this.
  expect(screen.getByText('Kept Page One Artist')).toBeInTheDocument();
  expect(screen.getByText('Results (2)')).toBeInTheDocument();
  expect(screen.getByText('Artists 2')).toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// Spotify results mixed into the local results (#72)
// ---------------------------------------------------------------------------

const LOCAL_WITH_TRACK = {
  data: {
    results: [{ type: 'artist', data: { id: 1, name: 'Local Artist', image_path: 'a.jpg' } }],
    hasMore: false,
    resultCounts: { album: 0, artist: 1, playlist: 0, collection: 0 },
    tracks: [{ id: 9, title: 'Dreams', duration: 180, artist: { id: 1, name: 'Fleetwood Mac' } }],
    count: 2,
  },
};

const spotifyResponse = (overrides = {}) => ({
  data: {
    configured: true,
    artists: [{ uri: 'spotify:artist:r1', id: 'r1', name: 'Spotify Artist', imageUrl: 'https://i.scdn.co/r1.jpg', externalUrl: 'https://open.spotify.com/artist/r1' }],
    albums: [{ uri: 'spotify:album:a1', id: 'a1', name: 'Spotify Album', artists: [{ id: 'x', name: 'Album Artist' }, { id: 'y', name: 'Guest' }], releaseYear: 1999, totalTracks: 10, imageUrl: 'https://i.scdn.co/a1.jpg', externalUrl: 'https://open.spotify.com/album/a1' }],
    tracks: [{ uri: 'spotify:track:t1', id: 't1', name: 'Spotify Track', artists: [{ id: 'x', name: 'Track Artist' }], album: { id: 'a1', name: 'Spotify Album', imageUrl: null }, durationMs: 185000, explicit: false, externalUrl: 'https://open.spotify.com/track/t1' }],
    ...overrides,
  },
});

const httpError = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

test('Spotify album and track render inside the results grid and Tracks list, not a "From Spotify" section', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockResolvedValue(spotifyResponse());

  const { container } = renderSearch('spot');

  await screen.findByText('Spotify Artist');
  expect(apiService.searchSpotify).toHaveBeenCalledWith('spot');
  expect(screen.queryByText('From Spotify')).toBeNull();
  expect(screen.getByText('Spotify Album')).toBeInTheDocument();
  expect(screen.getByText('Album Artist, Guest · 1999')).toBeInTheDocument();
  expect(screen.getByText('Results (3)')).toBeInTheDocument();

  // Spotify artist/album sit in the results grid, before the Tracks section...
  const tracksHeading = screen.getByText('Tracks (2)');
  expect(follows(screen.getByText('Spotify Album'), tracksHeading)).toBe(true);
  // ...and the Spotify track is a row in the Tracks list, after the library track.
  const rows = [...container.querySelectorAll('.track-row')];
  expect(rows.map((r) => r.querySelector('.track-row-title').textContent)).toEqual(['Dreams', 'Spotify Track']);
  expect(rows[1].querySelector('.track-row-subtitle')).toHaveTextContent('Track Artist · Spotify Album · 3:05');

  const link = screen.getByRole('link', { name: 'Open Spotify Track in Spotify' });
  expect(link).toHaveAttribute('href', 'https://open.spotify.com/track/t1');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('shows Spotify play buttons only when the session can play Spotify and a source is registered', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockResolvedValue(spotifyResponse());
  getSpotifyStatusCached.mockResolvedValue({ allowed: true, connected: true, devices: [] });
  vi.stubGlobal('isSecureContext', true);
  const prior = usePlayerStore.getState().spotifySource;
  try {
    usePlayerStore.setState({ spotifySource: null });
    renderSearch('spot');

    await screen.findByText('Spotify Track');
    await waitFor(() => expect(getSpotifyStatusCached).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Play Spotify Track' })).toBeNull();

    act(() => { usePlayerStore.setState({ spotifySource: { isAvailable: () => true } }); });
    expect(await screen.findByRole('button', { name: 'Play Spotify Track' })).toBeInTheDocument();
  } finally {
    usePlayerStore.setState({ spotifySource: prior });
    vi.unstubAllGlobals();
  }
});

test('renders local results while Spotify is still pending, then mixes Spotify in when it arrives', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  let resolveSpotify;
  apiService.searchSpotify.mockReturnValue(new Promise((resolve) => { resolveSpotify = resolve; }));

  renderSearch('slow');

  expect(await screen.findByText('Local Artist')).toBeInTheDocument();
  expect(screen.queryByTestId('spotify-loading')).toBeNull();
  expect(screen.queryByText('Spotify Artist')).toBeNull();

  await act(async () => { resolveSpotify(spotifyResponse()); });

  expect(await screen.findByText('Spotify Artist')).toBeInTheDocument();
});

test('renders no Spotify section when Spotify is not configured', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({ configured: false }));

  renderSearch('unconfigured');

  await screen.findByText('Local Artist');
  await waitFor(() => expect(screen.queryByTestId('spotify-loading')).toBeNull());
  expect(screen.queryByText('From Spotify')).toBeNull();
  expect(screen.queryByText('Spotify Artist')).toBeNull();
});

test.each([
  ['502', () => httpError(502, { error: 'Spotify search failed' })],
  ['429', () => httpError(429, { error: 'Spotify rate limit exceeded', retryAfter: 30 })],
  ['network', () => new Error('Network Error')],
])('renders local results and no Spotify section when Spotify fails (%s)', async (_label, makeError) => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockRejectedValue(makeError());

  renderSearch('failing');

  expect(await screen.findByText('Local Artist')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByTestId('spotify-loading')).toBeNull());
  expect(screen.queryByText('From Spotify')).toBeNull();
  expect(screen.getByText(/Dreams/)).toBeInTheDocument();
  expect(errorSpy.mock.calls.length + warnSpy.mock.calls.length).toBeGreaterThan(0);
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

test('still renders local results when Spotify rejects before the local search resolves', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  let resolveLocal;
  apiService.search.mockReturnValue(new Promise((resolve) => { resolveLocal = resolve; }));
  apiService.searchSpotify.mockRejectedValue(httpError(502));

  renderSearch('order');
  await waitFor(() => expect(errorSpy).toHaveBeenCalled());

  await act(async () => { resolveLocal(LOCAL_WITH_TRACK); });

  expect(await screen.findByText('Local Artist')).toBeInTheDocument();
  expect(screen.queryByText('From Spotify')).toBeNull();
  errorSpy.mockRestore();
});

test('hides Spotify items the library already has (non-null localId) by default', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({
    artists: [],
    albums: [
      { id: 'owned', name: 'OK Computer', artists: [{ id: 'r', name: 'Radiohead' }], localId: 12, externalUrl: 'https://open.spotify.com/album/owned' },
      { id: 'new', name: 'Hail to the Thief (Live)', artists: [{ id: 'r', name: 'Radiohead' }], localId: null, externalUrl: 'https://open.spotify.com/album/new' },
    ],
    tracks: [],
  }));

  renderSearch('radiohead');

  expect(await screen.findByText('Hail to the Thief (Live)')).toBeInTheDocument();
  expect(screen.queryByText('OK Computer')).toBeNull();
});

test('hides a matched Spotify artist but still shows that artist\'s unmatched album', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({
    artists: [{ id: 'r', name: 'Radiohead', imageUrl: null, externalUrl: 'https://open.spotify.com/artist/r', localId: 3 }],
    albums: [{ id: 'new', name: 'Unowned Album', artists: [{ id: 'r', name: 'Radiohead' }], localId: null, externalUrl: 'https://open.spotify.com/album/new' }],
    tracks: [],
  }));

  renderSearch('radiohead');

  expect(await screen.findByRole('link', { name: 'Open Unowned Album in Spotify' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Open Radiohead in Spotify' })).toBeNull();
});

test('omits the whole section when every Spotify result is already in the library', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({
    artists: [{ id: 'r', name: 'Local Artist', imageUrl: null, externalUrl: 'https://open.spotify.com/artist/r', localId: 1 }],
    albums: [],
    tracks: [],
  }));

  renderSearch('alldupes');

  await screen.findByText('Local Artist');
  await waitFor(() => expect(screen.queryByTestId('spotify-loading')).toBeNull());
  expect(screen.queryByText('From Spotify')).toBeNull();
  // ...but the Spotify pill is still offered, since there are Spotify results to show.
  expect(screen.getByRole('button', { name: 'Spotify 1' })).toBeInTheDocument();
});

// ---------------------------------------------------------------------------
// "Spotify" (Spotify-only) pill
// ---------------------------------------------------------------------------

test('shows no Spotify pill when Spotify is unconfigured, failed, or returned nothing', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({ artists: [], albums: [], tracks: [] }));

  renderSearch('nothing');

  await screen.findByText('Local Artist');
  await waitFor(() => expect(screen.queryByTestId('spotify-loading')).toBeNull());
  expect(screen.queryByRole('button', { name: /^Spotify/ })).toBeNull();
  // The local type pills are unaffected.
  expect(screen.getByRole('button', { name: 'Artists 1' })).toBeInTheDocument();
});

test('shows no Spotify pill when Spotify is not configured, even if lists are non-empty', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({ configured: false }));

  renderSearch('unconfigured');

  await screen.findByText('Local Artist');
  await waitFor(() => expect(screen.queryByTestId('spotify-loading')).toBeNull());
  expect(screen.queryByRole('button', { name: /^Spotify/ })).toBeNull();
});

test('the Spotify pill hides local results and shows every Spotify result, library matches included', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({
    albums: [
      { id: 'owned', name: 'Owned Album', artists: [{ id: 'x', name: 'X' }], localId: 12, externalUrl: 'https://open.spotify.com/album/owned' },
      { id: 'new', name: 'New Album', artists: [{ id: 'x', name: 'X' }], localId: null, externalUrl: 'https://open.spotify.com/album/new' },
    ],
  }));

  renderSearch('spot');

  await screen.findByText('New Album');
  expect(screen.queryByText('Owned Album')).toBeNull();
  const pill = screen.getByRole('button', { name: 'Spotify 4' });
  expect(pill).not.toHaveClass('active');

  fireEvent.click(pill);

  expect(pill).toHaveClass('active');
  expect(screen.queryByText('Local Artist')).toBeNull();
  expect(screen.queryByText(/^Results/)).toBeNull();
  expect(screen.queryByText(/^Tracks \(/)).toBeNull();
  expect(screen.getByText('From Spotify')).toBeInTheDocument();
  expect(screen.getByText('Owned Album')).toBeInTheDocument();
  expect(screen.getByText('New Album')).toBeInTheDocument();
  expect(screen.getByText('Spotify Artist')).toBeInTheDocument();
  // Type pills stay available to switch back (their counts include the mixed-in Spotify items).
  expect(screen.getByRole('button', { name: 'Artists 2' })).toBeInTheDocument();

  fireEvent.click(pill);

  expect(screen.getByText('Local Artist')).toBeInTheDocument();
  expect(screen.queryByText('Owned Album')).toBeNull();
});

test('choosing a type pill turns Spotify-only off', async () => {
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify.mockResolvedValue(spotifyResponse());

  renderSearch('spot');

  await screen.findByText('Spotify Artist');
  fireEvent.click(screen.getByRole('button', { name: 'Spotify 3' }));
  expect(screen.queryByText('Local Artist')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Artists 2' }));

  expect(screen.getByText('Local Artist')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Spotify 3' })).not.toHaveClass('active');
  expect(screen.getByRole('button', { name: 'Artists 2' })).toHaveClass('active');
});

test('no "No results" message when only Spotify matched, in the mixed view or Spotify-only mode', async () => {
  apiService.search.mockResolvedValue({ data: { results: [], tracks: [], count: 0 } });
  apiService.searchSpotify.mockResolvedValue(spotifyResponse());

  renderSearch('onlyspotify');

  await screen.findByText('Spotify Track');
  expect(screen.queryByText('No results found for "onlyspotify"')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Spotify 3' }));

  expect(screen.queryByText('No results found for "onlyspotify"')).toBeNull();
  expect(screen.getByText('Spotify Track')).toBeInTheDocument();
});

test('tolerates null imageUrl, empty/missing artists arrays, and missing fields', async () => {
  apiService.search.mockResolvedValue({ data: { results: [], tracks: [], count: 0 } });
  apiService.searchSpotify.mockResolvedValue({
    data: {
      configured: true,
      artists: [{ id: 'r', name: 'Imageless Artist', imageUrl: null, externalUrl: null }],
      albums: [{ id: 'a', name: 'Artistless Album', artists: [], imageUrl: null, releaseYear: null }],
      tracks: [
        { id: 't', name: 'Bare Track', artists: [], album: null, durationMs: null },
        { id: 'u', name: 'No Artists Key' },
      ],
    },
  });

  renderSearch('sparse');

  expect(await screen.findByText('Imageless Artist')).toBeInTheDocument();
  expect(screen.getByText('Artistless Album')).toBeInTheDocument();
  expect(screen.getByText('Bare Track')).toBeInTheDocument();
  expect(screen.getByText('No Artists Key')).toBeInTheDocument();
  // No externalUrl → no link rendered rather than a dead href.
  expect(screen.queryByRole('link', { name: 'Open Imageless Artist in Spotify' })).toBeNull();
  // Spotify items count as results, so there's no "no results" message.
  expect(screen.queryByText('No results found for "sparse"')).toBeNull();
});

test('does not refetch Spotify when loading more local results', async () => {
  apiService.search.mockResolvedValueOnce({
    data: {
      results: [{ type: 'artist', data: { id: 1, name: 'Page One Artist', image_path: 'a.jpg' } }],
      hasMore: true,
      resultCounts: { album: 0, artist: 2, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
      pageSize: 30,
    },
  });
  apiService.searchSpotify.mockResolvedValue(spotifyResponse());

  renderSearch('paged');
  await screen.findByText('Page One Artist');
  await waitFor(() => expect(apiService.searchSpotify).toHaveBeenCalled());
  await act(async () => {});
  // These Spotify items carry no score, so they wait for the last library page.
  expect(screen.queryByText('Spotify Artist')).toBeNull();

  apiService.search.mockResolvedValueOnce({
    data: {
      results: [{ type: 'artist', data: { id: 2, name: 'Page Two Artist', image_path: 'a.jpg' } }],
      hasMore: false,
      resultCounts: { album: 0, artist: 2, playlist: 0, collection: 0 },
      tracks: [],
      count: 1,
    },
  });

  await waitFor(() => expect(intersectionCallback).not.toBeNull());
  triggerIntersection();

  await screen.findByText('Page Two Artist');
  expect(apiService.search).toHaveBeenCalledTimes(2);
  expect(apiService.searchSpotify).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Spotify Artist')).toBeInTheDocument();
});

test('ignores a stale Spotify response from a previous query', async () => {
  let resolveFirstSpotify;
  apiService.search.mockResolvedValue(LOCAL_WITH_TRACK);
  apiService.searchSpotify
    .mockReturnValueOnce(new Promise((resolve) => { resolveFirstSpotify = resolve; }))
    .mockResolvedValueOnce(spotifyResponse({
      artists: [],
      albums: [],
      tracks: [{ id: 'n', name: 'New Query Track', artists: [{ name: 'X' }], album: { name: 'Y', imageUrl: null }, durationMs: 60000, externalUrl: 'https://open.spotify.com/track/n' }],
    }));

  const SearchWithNavHelper = () => {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate('/search?q=second')}>go to second search</button>
        <Search />
      </>
    );
  };

  render(
    <MemoryRouter initialEntries={['/search?q=first']}>
      <Routes>
        <Route path="/search" element={<SearchWithNavHelper />} />
      </Routes>
    </MemoryRouter>
  );

  await screen.findByText('Local Artist');
  fireEvent.click(screen.getByText('go to second search'));
  expect(await screen.findByText('New Query Track')).toBeInTheDocument();

  await act(async () => { resolveFirstSpotify(spotifyResponse()); });

  expect(screen.getByText('New Query Track')).toBeInTheDocument();
  expect(screen.queryByText('Spotify Artist')).toBeNull();
});

// ---------------------------------------------------------------------------
// Ordering, profile filter and type pills with mixed results
// ---------------------------------------------------------------------------

const scoredLocal = (results, extra = {}) => ({
  data: {
    results,
    hasMore: false,
    resultCounts: {
      album: results.filter((r) => r.type === 'album').length,
      artist: results.filter((r) => r.type === 'artist').length,
      playlist: 0,
      collection: 0,
    },
    tracks: [],
    count: results.length,
    pageSize: 30,
    ...extra,
  },
});
const localAlbum = (id, title, score) => ({ type: 'album', data: { id, title, image_path: 'x.jpg', artist: { id: 1, name: 'Somebody' } }, score });
const localArtist = (id, name, score) => ({ type: 'artist', data: { id, name, image_path: 'a.jpg' }, score });
const spArtist = (id, name, score) => ({ uri: `spotify:artist:${id}`, id, name, imageUrl: null, externalUrl: `https://open.spotify.com/artist/${id}`, localId: null, score });
const spAlbum = (id, name, score) => ({ uri: `spotify:album:${id}`, id, name, artists: [{ id: 'z', name: 'Z' }], releaseYear: null, imageUrl: null, externalUrl: `https://open.spotify.com/album/${id}`, localId: null, score });

test('Spotify artist with a higher score renders before a lower-scoring library album in the results grid', async () => {
  apiService.search.mockResolvedValue(scoredLocal([localAlbum(1, 'High Library Album', 0.9), localAlbum(2, 'Low Library Album', 0.3)]));
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({ artists: [spArtist('s1', 'Middle Spotify Artist', 0.6)], albums: [], tracks: [] }));

  renderSearch('ordering');

  const spotifyArtist = await screen.findByText('Middle Spotify Artist');
  expect(follows(screen.getByText('High Library Album'), spotifyArtist)).toBe(true);
  expect(follows(spotifyArtist, screen.getByText('Low Library Album'))).toBe(true);
});

test('owned Spotify items (localId set) are not shown in the mixed view', async () => {
  apiService.search.mockResolvedValue(scoredLocal([localArtist(1, 'Local Artist', 2)]));
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({
    artists: [{ ...spArtist('s1', 'Owned Spotify Artist', 2), localId: 1 }],
    albums: [spAlbum('s2', 'Unowned Spotify Album', 2)],
    tracks: [],
  }));

  renderSearch('owned');

  await screen.findByText('Unowned Spotify Album');
  expect(screen.queryByText('Owned Spotify Artist')).toBeNull();
});

test('Spotify pill still shows only Spotify results, including owned ones', async () => {
  apiService.search.mockResolvedValue(scoredLocal([localArtist(1, 'Local Artist', 2)]));
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({
    artists: [{ ...spArtist('s1', 'Owned Spotify Artist', 2), localId: 1 }],
    albums: [spAlbum('s2', 'Unowned Spotify Album', 2)],
    tracks: [],
  }));

  renderSearch('owned');
  await screen.findByText('Unowned Spotify Album');

  fireEvent.click(screen.getByRole('button', { name: 'Spotify 2' }));

  expect(screen.getByText('From Spotify')).toBeInTheDocument();
  expect(screen.getByText('Owned Spotify Artist')).toBeInTheDocument();
  expect(screen.queryByText('Local Artist')).toBeNull();
});

test('with a profile filter active, searchSpotify is not called and no Spotify items render', async () => {
  useProfileFilterStore.setState({ activeProfileId: 7 });
  apiService.search.mockResolvedValue(scoredLocal([localArtist(1, 'Local Artist', 2)]));
  apiService.searchSpotify.mockResolvedValue(spotifyResponse());

  renderSearch('profiled');

  await screen.findByText('Local Artist');
  await act(async () => {});
  expect(apiService.searchSpotify).not.toHaveBeenCalled();
  expect(screen.queryByText('Spotify Artist')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Spotify/ })).toBeNull();
});

test('Albums type pill hides Spotify artists and the heading counts library + Spotify albums', async () => {
  apiService.search.mockResolvedValue(scoredLocal([localArtist(1, 'Local Artist', 2), localAlbum(2, 'Local Album', 2)]));
  apiService.searchSpotify.mockResolvedValue(spotifyResponse({
    artists: [spArtist('s1', 'Spotify Artist', 2)],
    albums: [spAlbum('s2', 'Spotify Album', 2)],
    tracks: [],
  }));

  renderSearch('pills');
  await screen.findByText('Spotify Album');
  expect(screen.getByText('Results (4)')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Albums 2' }));

  expect(screen.getByText('Results (2)')).toBeInTheDocument();
  expect(screen.getByText('Local Album')).toBeInTheDocument();
  expect(screen.getByText('Spotify Album')).toBeInTheDocument();
  expect(screen.queryByText('Spotify Artist')).toBeNull();
  expect(screen.queryByText('Local Artist')).toBeNull();
});

test('Spotify results that arrive after page 2 loaded are placed by score without reordering library results', async () => {
  apiService.search.mockResolvedValueOnce(scoredLocal(
    [localArtist(1, 'Page One Top', 2), localAlbum(2, 'Page One Low', 0.3)],
    { hasMore: true },
  ));
  let resolveSpotify;
  apiService.searchSpotify.mockReturnValue(new Promise((resolve) => { resolveSpotify = resolve; }));

  renderSearch('late');
  await screen.findByText('Page One Top');

  apiService.search.mockResolvedValueOnce(scoredLocal([localAlbum(3, 'Page Two Lowest', 0.25)]));
  await waitFor(() => expect(intersectionCallback).not.toBeNull());
  triggerIntersection();
  await screen.findByText('Page Two Lowest');

  await act(async () => {
    resolveSpotify(spotifyResponse({ artists: [spArtist('s1', 'Late Spotify Artist', 0.5)], albums: [], tracks: [] }));
  });

  const late = await screen.findByText('Late Spotify Artist');
  const top = screen.getByText('Page One Top');
  const low = screen.getByText('Page One Low');
  const lowest = screen.getByText('Page Two Lowest');
  expect(follows(top, late)).toBe(true);
  expect(follows(late, low)).toBe(true);
  expect(follows(low, lowest)).toBe(true);
});
