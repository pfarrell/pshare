import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Search from './Search';
import { apiService } from '../services/api';
import { useProfileFilterStore } from '../stores/profileFilterStore';

vi.mock('../services/api', () => ({
  apiService: {
    search: vi.fn(),
    getImageUrl: () => '/img/sm/x.jpg',
  },
}));

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
