import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EntitySearchPicker from './EntitySearchPicker';

const makeSearch = (overrides = {}) => ({
  query: 'ab', setQuery: vi.fn(), results: [], setResults: vi.fn(), searching: false,
  hasSearched: false, search: vi.fn(), reset: vi.fn(), clearResults: vi.fn(), minLength: 2, ...overrides,
});

describe('EntitySearchPicker', () => {
  test('submitting runs onSubmit then search', async () => {
    const search = makeSearch();
    const onSubmit = vi.fn();
    render(<EntitySearchPicker search={search} placeholder="Find" onSubmit={onSubmit} renderItem={(i) => i.name} onPick={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSubmit).toHaveBeenCalled();
    expect(search.search).toHaveBeenCalled();
  });

  test('row click picks when there is no renderAction', async () => {
    const onPick = vi.fn();
    const item = { id: 1, name: 'Row One' };
    render(<EntitySearchPicker search={makeSearch({ results: [item] })} placeholder="Find" renderItem={(i) => i.name} onPick={onPick} />);
    await userEvent.click(screen.getByText('Row One'));
    expect(onPick).toHaveBeenCalledWith(item);
  });

  test('with renderAction the row is not clickable unless pickOnRowClick', async () => {
    const onPick = vi.fn();
    const item = { id: 1, name: 'Row One' };
    render(<EntitySearchPicker search={makeSearch({ results: [item] })} placeholder="Find" renderItem={(i) => i.name} renderAction={() => <button type="button">Add</button>} onPick={onPick} />);
    await userEvent.click(screen.getByText('Row One'));
    expect(onPick).not.toHaveBeenCalled();
  });

  test('emptyAction shows only after a search with no results', () => {
    const { rerender } = render(<EntitySearchPicker search={makeSearch()} placeholder="Find" renderItem={(i) => i.name} emptyAction={<button>Create</button>} />);
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
    rerender(<EntitySearchPicker search={makeSearch({ hasSearched: true })} placeholder="Find" renderItem={(i) => i.name} emptyAction={<button>Create</button>} />);
    expect(screen.getByText('Create')).toBeInTheDocument();
  });
});
