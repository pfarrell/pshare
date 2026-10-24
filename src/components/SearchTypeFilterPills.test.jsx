import { render, screen, fireEvent } from '@testing-library/react';
import SearchTypeFilterPills from './SearchTypeFilterPills';

const results = [
  { type: 'album', data: { id: 1 } },
  { type: 'album', data: { id: 2 } },
  { type: 'artist', data: { id: 3 } },
];
const counts = { album: 2, artist: 1, playlist: 0, collection: 0 };

test('renders one pill per type present, each labeled with its server-reported count', () => {
  render(<SearchTypeFilterPills results={results} counts={counts} activeTypes={new Set()} onToggle={vi.fn()} />);
  expect(screen.getByText('Albums 2')).toBeInTheDocument();
  expect(screen.getByText('Artists 1')).toBeInTheDocument();
});

test('does not render a pill for a type with zero count', () => {
  render(<SearchTypeFilterPills results={results} counts={counts} activeTypes={new Set()} onToggle={vi.fn()} />);
  expect(screen.queryByText(/Playlists/)).toBeNull();
  expect(screen.queryByText(/Collections/)).toBeNull();
});

test('renders nothing when every count is zero', () => {
  const zeroCounts = { album: 0, artist: 0, playlist: 0, collection: 0 };
  const { container } = render(<SearchTypeFilterPills results={[]} counts={zeroCounts} activeTypes={new Set()} onToggle={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

test('uses the count from the counts prop even when fewer matching items have loaded so far', () => {
  const partiallyLoaded = [{ type: 'album', data: { id: 1 } }];
  render(<SearchTypeFilterPills results={partiallyLoaded} counts={counts} activeTypes={new Set()} onToggle={vi.fn()} />);
  expect(screen.getByText('Albums 2')).toBeInTheDocument();
});

test('applies the active class to a pill in activeTypes', () => {
  render(<SearchTypeFilterPills results={results} counts={counts} activeTypes={new Set(['album'])} onToggle={vi.fn()} />);
  expect(screen.getByText('Albums 2')).toHaveClass('active');
  expect(screen.getByText('Artists 1')).not.toHaveClass('active');
});

test('clicking a pill calls onToggle with that type', () => {
  const onToggle = vi.fn();
  render(<SearchTypeFilterPills results={results} counts={counts} activeTypes={new Set()} onToggle={onToggle} />);
  fireEvent.click(screen.getByText('Albums 2'));
  expect(onToggle).toHaveBeenCalledWith('album');
});

test('renders extra pills passed as children, even when every count is zero', () => {
  const zeroCounts = { album: 0, artist: 0, playlist: 0, collection: 0 };
  render(
    <SearchTypeFilterPills counts={zeroCounts} activeTypes={new Set()} onToggle={vi.fn()}>
      <button type="button">Extra</button>
    </SearchTypeFilterPills>
  );
  expect(screen.getByRole('button', { name: 'Extra' })).toBeInTheDocument();
});
