import { render, screen, fireEvent, act } from '@testing-library/react';
import ResultRow from './ResultRow';

test('renders the title and subtitle', () => {
  render(<ResultRow imageUrl="/x.jpg" title="Test Title" subtitle="Album · Test Artist" onClick={vi.fn()} />);
  expect(screen.getByText('Test Title')).toBeInTheDocument();
  expect(screen.getByText('Album · Test Artist')).toBeInTheDocument();
});

test('does not render a subtitle element when subtitle is not provided', () => {
  render(<ResultRow imageUrl="/x.jpg" title="Test Title" onClick={vi.fn()} />);
  expect(screen.queryByText(/·/)).toBeNull();
});

test('applies the circle image class when imageShape is "circle"', () => {
  render(<ResultRow imageUrl="/x.jpg" imageShape="circle" title="Test Title" onClick={vi.fn()} />);
  expect(document.querySelector('.result-row-image-circle')).not.toBeNull();
});

test('clicking the row fires onClick', () => {
  const onClick = vi.fn();
  render(<ResultRow imageUrl="/x.jpg" title="Test Title" onClick={onClick} />);
  fireEvent.click(screen.getByText('Test Title'));
  expect(onClick).toHaveBeenCalled();
});

test('does not render a play button when the play prop is absent', () => {
  render(<ResultRow imageUrl="/x.jpg" title="Test Title" onClick={vi.fn()} />);
  expect(screen.queryByRole('button')).toBeNull();
});

test('renders a play button and fires onPlay without firing onClick', () => {
  const onClick = vi.fn();
  const onPlay = vi.fn();
  render(
    <ResultRow
      imageUrl="/x.jpg"
      title="Test Title"
      onClick={onClick}
      play={{ loading: false, onPlay, label: 'Play Test Title' }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Play Test Title' }));
  expect(onPlay).toHaveBeenCalled();
  expect(onClick).not.toHaveBeenCalled();
});

test('play button is disabled while loading and does not call onPlay', () => {
  const onPlay = vi.fn();
  render(
    <ResultRow
      imageUrl="/x.jpg"
      title="Test Title"
      onClick={vi.fn()}
      play={{ loading: true, onPlay, label: 'Play Test Title' }}
    />
  );
  const button = screen.getByRole('button', { name: 'Play Test Title' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(onPlay).not.toHaveBeenCalled();
});

test('the play button carries a data-result-row-play marker so callers can guard other handlers against it', () => {
  render(
    <ResultRow
      imageUrl="/x.jpg"
      title="Test Title"
      onClick={vi.fn()}
      play={{ loading: false, onPlay: vi.fn(), label: 'Play Test Title' }}
    />
  );
  expect(screen.getByRole('button', { name: 'Play Test Title' })).toHaveAttribute('data-result-row-play', 'true');
});

describe('long-press / right-click play menu', () => {
  const playWithMenu = (overrides = {}) => ({
    loading: false,
    onPlay: vi.fn(),
    onPlayNext: vi.fn(),
    onAddToQueue: vi.fn(),
    label: 'Play Test Title',
    ...overrides,
  });

  test('a long-press does nothing extra when onPlayNext/onAddToQueue are not provided', () => {
    vi.useFakeTimers();
    render(
      <ResultRow
        imageUrl="/x.jpg"
        title="Test Title"
        onClick={vi.fn()}
        play={{ loading: false, onPlay: vi.fn(), label: 'Play Test Title' }}
      />
    );
    const button = screen.getByRole('button', { name: 'Play Test Title' });
    fireEvent.touchStart(button, { touches: [{ clientX: 50, clientY: 50 }] });
    act(() => { vi.advanceTimersByTime(500); });

    expect(screen.queryByText('⏭ Play Next')).toBeNull();
    vi.useRealTimers();
  });

  test('long-pressing the play button opens a menu with Play Next / Add to Queue', () => {
    vi.useFakeTimers();
    render(<ResultRow imageUrl="/x.jpg" title="Test Title" onClick={vi.fn()} play={playWithMenu()} />);
    const button = screen.getByRole('button', { name: 'Play Test Title' });

    fireEvent.touchStart(button, { touches: [{ clientX: 50, clientY: 50 }] });
    act(() => { vi.advanceTimersByTime(500); });

    expect(screen.getByText('⏭ Play Next')).toBeInTheDocument();
    expect(screen.getByText('➕ Add to Queue')).toBeInTheDocument();
    vi.useRealTimers();
  });

  test('right-clicking the play button opens the menu directly (desktop)', () => {
    const play = playWithMenu();
    render(<ResultRow imageUrl="/x.jpg" title="Test Title" onClick={vi.fn()} play={play} />);
    const button = screen.getByRole('button', { name: 'Play Test Title' });

    fireEvent.contextMenu(button, { clientX: 50, clientY: 50 });

    expect(screen.getByText('⏭ Play Next')).toBeInTheDocument();
  });


  test('choosing "Play Next" from the menu calls onPlayNext and closes the menu', () => {
    const play = playWithMenu();
    render(<ResultRow imageUrl="/x.jpg" title="Test Title" onClick={vi.fn()} play={play} />);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Play Test Title' }), { clientX: 50, clientY: 50 });

    fireEvent.click(screen.getByText('⏭ Play Next'));

    expect(play.onPlayNext).toHaveBeenCalledTimes(1);
    expect(play.onPlay).not.toHaveBeenCalled();
    expect(screen.queryByText('⏭ Play Next')).toBeNull();
  });

  test('choosing "Add to Queue" from the menu calls onAddToQueue and closes the menu', () => {
    const play = playWithMenu();
    render(<ResultRow imageUrl="/x.jpg" title="Test Title" onClick={vi.fn()} play={play} />);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Play Test Title' }), { clientX: 50, clientY: 50 });

    fireEvent.click(screen.getByText('➕ Add to Queue'));

    expect(play.onAddToQueue).toHaveBeenCalledTimes(1);
    expect(play.onPlay).not.toHaveBeenCalled();
    expect(screen.queryByText('➕ Add to Queue')).toBeNull();
  });

  test('clicking the backdrop closes the menu without calling any handler', () => {
    const play = playWithMenu();
    render(<ResultRow imageUrl="/x.jpg" title="Test Title" onClick={vi.fn()} play={play} />);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Play Test Title' }), { clientX: 50, clientY: 50 });
    expect(screen.getByText('⏭ Play Next')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('result-row-play-menu-backdrop'));

    expect(screen.queryByText('⏭ Play Next')).toBeNull();
    expect(play.onPlay).not.toHaveBeenCalled();
    expect(play.onPlayNext).not.toHaveBeenCalled();
    expect(play.onAddToQueue).not.toHaveBeenCalled();
  });
});

describe('ResultRow — triggerProps', () => {
  test('spreads a single triggerProps object onto the row', () => {
    const onContextMenu = vi.fn();
    render(<ResultRow imageUrl="/x.jpg" title="Row" triggerProps={{ onContextMenu, onTouchStart: vi.fn(), onTouchMove: vi.fn(), onTouchEnd: vi.fn() }} />);
    fireEvent.contextMenu(screen.getByText('Row').closest('.result-row'));
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });
});
