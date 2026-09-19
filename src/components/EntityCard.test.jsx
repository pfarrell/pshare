import { fireEvent, render, screen } from '@testing-library/react';
import EntityCard from './EntityCard';
import { useViewModeStore } from '../stores/viewModeStore';

const baseProps = {
  title: 'Card Title',
  imageUrl: '/images/albums/sm/x.jpg',
  listSubtitle: 'Album · Artist',
  menuTestId: 'entity-card-menu-backdrop',
};

beforeEach(() => {
  window.innerWidth = 1024;
  useViewModeStore.setState({ mode: 'card' });
});

describe('EntityCard', () => {
  test('card mode renders the title and cardFooter, and clicking calls onClick', () => {
    const onClick = vi.fn();
    render(<EntityCard {...baseProps} onClick={onClick} cardFooter={<p>footer</p>} actions={[]} />);
    expect(screen.getByText('footer')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Card Title'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('list mode renders a ResultRow with the list subtitle', () => {
    useViewModeStore.setState({ mode: 'list' });
    render(<EntityCard {...baseProps} onClick={vi.fn()} actions={[]} />);
    expect(screen.getByText('Album · Artist')).toBeInTheDocument();
  });

  test('right-click opens the actions menu; selecting closes it and runs the action', () => {
    const onFavorite = vi.fn();
    render(<EntityCard {...baseProps} onClick={vi.fn()} actions={[{ key: 'favorite', icon: '☆', label: 'Add to Favorites', onClick: onFavorite }]} />);
    fireEvent.contextMenu(screen.getByText('Card Title').closest('.artist-card'));
    fireEvent.click(screen.getByText('☆ Add to Favorites'));
    expect(onFavorite).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('entity-card-menu-backdrop')).not.toBeInTheDocument();
  });

  test('no menu when there are no truthy actions', () => {
    render(<EntityCard {...baseProps} onClick={vi.fn()} actions={[false, null]} />);
    fireEvent.contextMenu(screen.getByText('Card Title').closest('.artist-card'));
    expect(screen.queryByTestId('entity-card-menu-backdrop')).not.toBeInTheDocument();
  });

  test('image error falls back from /sm/ to the full-size image', () => {
    render(<EntityCard {...baseProps} onClick={vi.fn()} actions={[]} />);
    const img = screen.getByAltText('Card Title');
    fireEvent.error(img);
    // jsdom resolves img.src to an absolute URL, so match the path suffix.
    expect(img.src).toMatch(/\/images\/albums\/x\.jpg$/);
  });
});
