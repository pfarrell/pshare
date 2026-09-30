import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import MilkdropCanvas from './MilkdropCanvas';
import { usePlayerStore } from '../../stores/playerStore';
import { __resetAnalyserGraphForTests } from '../../utils/analyserGraph';

const makeVisualizer = () => ({
  loadPreset: vi.fn(),
  connectAudio: vi.fn(),
  setRendererSize: vi.fn(),
  render: vi.fn(),
});

let visualizer;
let fakeContext;

const renderCanvas = (props = {}) =>
  render(
    <MilkdropCanvas
      onDismiss={props.onDismiss ?? vi.fn()}
      onFail={props.onFail ?? vi.fn()}
      createRenderer={props.createRenderer ?? (() => visualizer)}
      loadPresetPack={props.loadPresetPack ?? (async () => ({ alpha: { id: 'alpha' } }))}
    />,
  );

beforeEach(() => {
  __resetAnalyserGraphForTests();
  visualizer = makeVisualizer();
  fakeContext = {
    state: 'running',
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    createGain: vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn() })),
    createMediaElementSource: vi.fn(() => ({ connect: vi.fn() })),
    addEventListener: vi.fn(),
  };
  // A function expression, not an arrow: Vitest 4 mocks built from arrow
  // functions are not constructible, and the graph calls `new AudioContext()`.
  window.AudioContext = vi.fn(function AudioContext() { return fakeContext; });
  usePlayerStore.setState({
    audioElementA: { id: 'a' },
    audioElementB: { id: 'b' },
    currentTrack: { id: 1, title: 'One' },
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MilkdropCanvas', () => {
  test('renders a canvas and connects it to the audio graph', async () => {
    renderCanvas();

    await waitFor(() => expect(visualizer.connectAudio).toHaveBeenCalled());
    expect(document.querySelector('canvas')).toBeInTheDocument();
  });

  test('loads an initial preset', async () => {
    renderCanvas();
    await waitFor(() => expect(visualizer.loadPreset).toHaveBeenCalled());
  });

  test('clicking it dismisses the screensaver', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    renderCanvas({ onDismiss });

    await waitFor(() => expect(visualizer.connectAudio).toHaveBeenCalled());
    await user.click(screen.getByTestId('milkdrop-canvas'));

    expect(onDismiss).toHaveBeenCalled();
  });

  test('reports failure when Web Audio is unavailable', async () => {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    const onFail = vi.fn();

    renderCanvas({ onFail });

    await waitFor(() => expect(onFail).toHaveBeenCalled());
  });

  test('reports failure when the renderer cannot be created', async () => {
    const onFail = vi.fn();
    renderCanvas({
      onFail,
      createRenderer: () => { throw new Error('no webgl'); },
    });

    await waitFor(() => expect(onFail).toHaveBeenCalled());
  });

  test('reports failure when the preset pack cannot be fetched', async () => {
    const onFail = vi.fn();
    renderCanvas({
      onFail,
      loadPresetPack: async () => { throw new Error('chunk load failed'); },
    });

    await waitFor(() => expect(onFail).toHaveBeenCalled());
  });

  // Review Focus #5: there is no error boundary anywhere in this app, so a
  // throw here blanks the whole kiosk.
  test('a track change to a track with missing fields does not throw', async () => {
    renderCanvas();
    await waitFor(() => expect(visualizer.loadPreset).toHaveBeenCalled());
    const before = visualizer.loadPreset.mock.calls.length;

    act(() => {
      usePlayerStore.setState({ currentTrack: { id: 2 } });
    });

    await waitFor(() => expect(visualizer.loadPreset.mock.calls.length).toBeGreaterThan(before));
  });

  test('a track change to null does not throw', async () => {
    renderCanvas();
    await waitFor(() => expect(visualizer.loadPreset).toHaveBeenCalled());

    expect(() => {
      act(() => {
        usePlayerStore.setState({ currentTrack: null });
      });
    }).not.toThrow();
  });

  test('unmounting cancels the render loop but never closes the audio context', async () => {
    const { unmount } = renderCanvas();
    await waitFor(() => expect(visualizer.connectAudio).toHaveBeenCalled());

    unmount();

    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    // Closing the context would silence kiosk playback permanently, since the
    // player's elements are now routed through this graph irreversibly.
    expect(fakeContext.close).not.toHaveBeenCalled();
  });

  test('remounting does not create a second audio context', async () => {
    const { unmount } = renderCanvas();
    await waitFor(() => expect(visualizer.connectAudio).toHaveBeenCalled());
    unmount();

    visualizer = makeVisualizer();
    renderCanvas();
    await waitFor(() => expect(visualizer.connectAudio).toHaveBeenCalled());

    expect(window.AudioContext).toHaveBeenCalledTimes(1);
    expect(fakeContext.createMediaElementSource).toHaveBeenCalledTimes(2);
  });
});
