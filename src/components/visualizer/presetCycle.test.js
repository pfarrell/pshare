import { createPresetCycle } from './presetCycle';
import {
  __pushShaderFailureForTests,
  __resetShaderDiagnosticsForTests,
} from './shaderDiagnostics';

const makeVisualizer = () => ({ loadPreset: vi.fn() });

beforeEach(() => {
  __resetShaderDiagnosticsForTests();
});

describe('createPresetCycle', () => {
  test('loads a preset from the pack', () => {
    const visualizer = makeVisualizer();
    const presets = { alpha: { id: 'alpha' }, beta: { id: 'beta' } };
    const cycle = createPresetCycle({ presets, visualizer, random: () => 0 });

    cycle.next();

    expect(visualizer.loadPreset).toHaveBeenCalledWith({ id: 'alpha' }, expect.any(Number));
  });

  test('picks a different preset than the one currently showing', () => {
    const visualizer = makeVisualizer();
    const presets = { alpha: { id: 'alpha' }, beta: { id: 'beta' } };
    const cycle = createPresetCycle({ presets, visualizer, random: () => 0 });

    cycle.next();
    cycle.next();

    expect(visualizer.loadPreset).toHaveBeenNthCalledWith(2, { id: 'beta' }, expect.any(Number));
  });

  test('a single-preset pack reloads that preset rather than throwing', () => {
    const visualizer = makeVisualizer();
    const cycle = createPresetCycle({
      presets: { only: { id: 'only' } },
      visualizer,
      random: () => 0,
    });

    expect(() => { cycle.next(); cycle.next(); }).not.toThrow();
  });

  test('an empty preset pack is a no-op rather than a crash', () => {
    const visualizer = makeVisualizer();
    const cycle = createPresetCycle({ presets: {}, visualizer, random: () => 0 });

    expect(() => cycle.next()).not.toThrow();
    expect(visualizer.loadPreset).not.toHaveBeenCalled();
  });

  // Review Focus #4: a broken custom preset must not strand the kiosk on black.
  test('skips a preset whose shaders fail to compile and loads the next one', () => {
    const visualizer = {
      loadPreset: vi.fn(() => {
        // Simulate butterchurn compiling a broken shader silently: the failure
        // only ever shows up in the diagnostics buffer.
        if (visualizer.loadPreset.mock.calls.length === 1) {
          __pushShaderFailureForTests("ERROR: redefinition of 'ang'");
        }
      }),
    };
    const presets = { broken: { id: 'broken' }, good: { id: 'good' } };
    const cycle = createPresetCycle({ presets, visualizer, random: () => 0 });

    cycle.next();

    expect(visualizer.loadPreset).toHaveBeenCalledTimes(2);
    expect(visualizer.loadPreset).toHaveBeenLastCalledWith({ id: 'good' }, expect.any(Number));
  });

  test('gives up after exhausting the pack rather than looping forever', () => {
    const visualizer = {
      loadPreset: vi.fn(() => __pushShaderFailureForTests('always broken')),
    };
    const presets = { a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' } };
    const cycle = createPresetCycle({ presets, visualizer, random: () => 0 });

    expect(() => cycle.next()).not.toThrow();
    expect(visualizer.loadPreset.mock.calls.length).toBeLessThanOrEqual(3);
  });

  test('a loadPreset that throws is caught and the next preset tried', () => {
    const visualizer = {
      loadPreset: vi.fn(() => {
        if (visualizer.loadPreset.mock.calls.length === 1) throw new Error('bad preset');
      }),
    };
    const presets = { bad: { id: 'bad' }, good: { id: 'good' } };
    const cycle = createPresetCycle({ presets, visualizer, random: () => 0 });

    expect(() => cycle.next()).not.toThrow();
    expect(visualizer.loadPreset).toHaveBeenCalledTimes(2);
  });
});
