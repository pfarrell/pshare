import { render, screen, fireEvent, act } from '@testing-library/react';
import toast from 'react-hot-toast';
import VisualizerToggle from './VisualizerToggle';
import { usePlayerStore } from '../../stores/playerStore';

// The real MilkdropCanvas needs WebGL and Web Audio, neither of which jsdom has.
// The stub exposes its two callbacks as buttons so tests can drive them.
vi.mock('./MilkdropCanvas', () => ({
  default: ({ onDismiss, onFail }) => (
    <div data-testid="milkdrop-canvas">
      <button onClick={onDismiss}>stub-dismiss</button>
      <button onClick={onFail}>stub-fail</button>
    </div>
  ),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

const DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const openButton = () => screen.getByRole('button', { name: 'Visualizer' });

beforeEach(() => {
  window.innerWidth = 1280;
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(DESKTOP_UA);
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
  usePlayerStore.setState({ currentTrack: { id: 1, title: 'One' } });
  toast.error.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VisualizerToggle', () => {
  test('offers a Visualizer button on desktop while a track is loaded', () => {
    render(<VisualizerToggle />);
    expect(openButton()).toBeInTheDocument();
  });

  test('renders nothing when no track is loaded', () => {
    usePlayerStore.setState({ currentTrack: null });
    render(<VisualizerToggle />);
    expect(screen.queryByRole('button', { name: 'Visualizer' })).not.toBeInTheDocument();
  });

  // The phone PWA must never get the button: the audio tap would route
  // background playback through a Web Audio context that iOS suspends on lock.
  test('renders nothing on an iPhone', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_UA);
    render(<VisualizerToggle />);
    expect(screen.queryByRole('button', { name: 'Visualizer' })).not.toBeInTheDocument();
  });

  // Mounting MilkdropCanvas is what taps the player's audio, irreversibly. So
  // nothing may mount it until the person actually asks for the visualizer.
  test('does not mount the visualizer until the button is clicked', () => {
    render(<VisualizerToggle />);
    expect(screen.queryByTestId('milkdrop-canvas')).not.toBeInTheDocument();
  });

  test('clicking the button opens the visualizer full screen, outside the footer', () => {
    render(<VisualizerToggle />);

    fireEvent.click(openButton());

    const canvas = screen.getByTestId('milkdrop-canvas');
    expect(canvas).toBeInTheDocument();
    // Portaled to <body> so the fixed footer cannot clip or stack over it.
    expect(canvas.closest('.visualizer-overlay').parentElement).toBe(document.body);
  });

  test('dismissing the visualizer closes it and keeps the button', () => {
    render(<VisualizerToggle />);
    fireEvent.click(openButton());

    fireEvent.click(screen.getByText('stub-dismiss'));

    expect(screen.queryByTestId('milkdrop-canvas')).not.toBeInTheDocument();
    expect(openButton()).toBeInTheDocument();
  });

  test('pressing Escape closes the visualizer', () => {
    render(<VisualizerToggle />);
    fireEvent.click(openButton());

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByTestId('milkdrop-canvas')).not.toBeInTheDocument();
  });

  test('other keys do not close it', () => {
    render(<VisualizerToggle />);
    fireEvent.click(openButton());

    fireEvent.keyDown(window, { key: 'a' });

    expect(screen.getByTestId('milkdrop-canvas')).toBeInTheDocument();
  });

  // A visualizer that cannot start (no WebGL, chunk failed to load) must say so
  // rather than flash open and vanish, and must not leave a black overlay.
  test('when the visualizer fails to start it closes and says why', () => {
    render(<VisualizerToggle />);
    fireEvent.click(openButton());

    fireEvent.click(screen.getByText('stub-fail'));

    expect(screen.queryByTestId('milkdrop-canvas')).not.toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toMatch(/visualizer/i);
  });

  test('clearing the queue while it is open closes it instead of leaving a black screen', () => {
    render(<VisualizerToggle />);
    fireEvent.click(openButton());

    act(() => {
      usePlayerStore.setState({ currentTrack: null });
    });

    expect(screen.queryByTestId('milkdrop-canvas')).not.toBeInTheDocument();
  });

  test('stops listening for Escape once closed', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    render(<VisualizerToggle />);
    fireEvent.click(openButton());
    fireEvent.click(screen.getByText('stub-dismiss'));

    expect(removeSpy.mock.calls.some(([type]) => type === 'keydown')).toBe(true);
  });
});
