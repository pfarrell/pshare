import { ensureAnalyserGraph, __resetAnalyserGraphForTests } from './analyserGraph';

const makeFakeContext = () => {
  const listeners = {};
  return {
    state: 'running',
    destination: { id: 'destination' },
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    createGain: vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn() })),
    createMediaElementSource: vi.fn(() => ({ connect: vi.fn() })),
    addEventListener: vi.fn((type, fn) => { listeners[type] = fn; }),
    __fire: (type) => listeners[type]?.(),
  };
};

let fakeContext;

beforeEach(() => {
  __resetAnalyserGraphForTests();
  fakeContext = makeFakeContext();
  // A function expression, not an arrow: Vitest 4 mocks built from arrow
  // functions are not constructible, and the graph calls `new AudioContext()`.
  window.AudioContext = vi.fn(function AudioContext() { return fakeContext; });
});

const audioA = { id: 'a' };
const audioB = { id: 'b' };

describe('ensureAnalyserGraph', () => {
  test('taps both audio elements and connects to the destination', () => {
    const graph = ensureAnalyserGraph(audioA, audioB);

    expect(graph).not.toBeNull();
    expect(fakeContext.createMediaElementSource).toHaveBeenCalledTimes(2);
    expect(fakeContext.createMediaElementSource).toHaveBeenCalledWith(audioA);
    expect(fakeContext.createMediaElementSource).toHaveBeenCalledWith(audioB);
    expect(graph.sourceNode.connect).toHaveBeenCalledWith(fakeContext.destination);
  });

  // Review Focus #2: the screensaver can activate many times per page load.
  // createMediaElementSource throws on a second call for the same element,
  // which would break playback outright.
  test('is idempotent: a second call reuses the graph and never re-taps', () => {
    const first = ensureAnalyserGraph(audioA, audioB);
    const second = ensureAnalyserGraph(audioA, audioB);

    expect(second).toBe(first);
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
    expect(fakeContext.createMediaElementSource).toHaveBeenCalledTimes(2);
  });

  // Review Focus #3: playback now flows through this graph, so a suspended
  // context is silence, not just a paused visualizer.
  test('resumes the context if it is ever suspended', () => {
    ensureAnalyserGraph(audioA, audioB);

    fakeContext.state = 'suspended';
    fakeContext.__fire('statechange');

    expect(fakeContext.resume).toHaveBeenCalled();
  });

  test('never closes the context', () => {
    ensureAnalyserGraph(audioA, audioB);
    ensureAnalyserGraph(audioA, audioB);
    expect(fakeContext.close).not.toHaveBeenCalled();
  });

  test('returns null when Web Audio is unavailable', () => {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    expect(ensureAnalyserGraph(audioA, audioB)).toBeNull();
  });

  test('returns null when an audio element is missing', () => {
    expect(ensureAnalyserGraph(audioA, null)).toBeNull();
    expect(window.AudioContext).not.toHaveBeenCalled();
  });
});
