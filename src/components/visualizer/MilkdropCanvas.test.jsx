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

  // The render loop is driven by hand with a fake clock, so frame timing (and
  // therefore the adaptive resolution policy) is deterministic.
  describe('adaptive resolution', () => {
    let now;
    let frameCallback;

    const runFrames = (count, frameMs) => {
      for (let i = 0; i < count; i += 1) {
        now += frameMs;
        act(() => { frameCallback(now); });
      }
    };

    // Enough frames to get past the settle window that follows a preset load.
    const pastSettle = () => runFrames(200, 16);

    beforeEach(() => {
      now = 0;
      frameCallback = null;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      window.requestAnimationFrame.mockImplementation((cb) => { frameCallback = cb; return 1; });
    });

    const mountAndStart = async () => {
      const result = renderCanvas();
      await waitFor(() => expect(visualizer.connectAudio).toHaveBeenCalled());
      await waitFor(() => expect(frameCallback).not.toBeNull());
      return result;
    };

    // butterchurn's setRendererSize only resizes its internal textures and GL
    // viewport; it never touches the canvas element. If the canvas backing
    // store keeps its old size, a 640x400 viewport lands in the bottom-left
    // quarter of a 1280x800 canvas (seen on the real kiosk).
    test('halving the render size also halves the canvas backing store', async () => {
      await mountAndStart();
      pastSettle();

      runFrames(60, 30);

      const canvas = document.querySelector('canvas');
      expect(visualizer.setRendererSize).toHaveBeenLastCalledWith(640, 400);
      expect(canvas.width).toBe(640);
      expect(canvas.height).toBe(400);
    });

    test('recovering restores the full canvas backing store', async () => {
      await mountAndStart();
      pastSettle();
      runFrames(60, 30);
      expect(document.querySelector('canvas').width).toBe(640);

      // Recovery needs three consecutive good 60-frame windows, plus up to one
      // window's worth of frames to flush slow samples left over from the
      // degrade above. 300 frames clears that with room to spare.
      runFrames(300, 12);

      const canvas = document.querySelector('canvas');
      expect(visualizer.setRendererSize).toHaveBeenLastCalledWith(1280, 800);
      expect(canvas.width).toBe(1280);
      expect(canvas.height).toBe(800);
    });

    // Shader compilation and the blend between presets make the frames right
    // after a preset change unrepresentative; counting them dropped the real
    // kiosk to half resolution about a second after it started.
    test('slow frames right after the first preset loads do not cause a downscale', async () => {
      await mountAndStart();

      // 61 frames fills the 60-sample window, but 61 * 40ms = 2440ms is still
      // inside the 2500ms settle window, so none of them may be counted.
      runFrames(61, 40);

      const sizes = visualizer.setRendererSize.mock.calls;
      expect(sizes.every(([w, h]) => w === 1280 && h === 800)).toBe(true);
    });

    test('a track change starts a new settle window too', async () => {
      await mountAndStart();
      pastSettle();
      visualizer.setRendererSize.mockClear();

      act(() => {
        usePlayerStore.setState({ currentTrack: { id: 2, title: 'Two' } });
      });
      runFrames(61, 40);

      expect(visualizer.setRendererSize).not.toHaveBeenCalledWith(640, 400);
    });
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
