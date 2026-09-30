import { mergePresets } from './loadPresets';
import { customPresets } from './presets';

describe('mergePresets', () => {
  test('combines the stock pack with custom presets', () => {
    const merged = mergePresets({ a: 1 }, { b: 2 });
    expect(merged).toEqual({ a: 1, b: 2 });
  });

  test('a custom preset wins over a stock preset of the same name', () => {
    const merged = mergePresets({ a: 'stock' }, { a: 'custom' });
    expect(merged.a).toBe('custom');
  });
});

describe('customPresets', () => {
  test('ships at least one hand-authored preset', () => {
    expect(Object.keys(customPresets).length).toBeGreaterThan(0);
  });

  test('every custom preset has the fields butterchurn requires', () => {
    for (const [name, preset] of Object.entries(customPresets)) {
      expect(preset.baseVals, `${name} baseVals`).toBeTypeOf('object');
      expect(preset.warp, `${name} warp`).toBeTypeOf('string');
      expect(preset.comp, `${name} comp`).toBeTypeOf('string');
      expect(preset.frame_eqs_str, `${name} frame_eqs_str`).toBeTypeOf('string');
    }
  });

  // Regression guard for the exact bug hit during design: milkdrop already
  // provides rad/ang/uv as built-ins, and redeclaring one makes the shader fail
  // to compile while butterchurn reports nothing and renders black.
  test('no custom preset redeclares a built-in milkdrop varying', () => {
    for (const [name, preset] of Object.entries(customPresets)) {
      for (const shader of [preset.warp, preset.comp]) {
        expect(shader, `${name} redeclares rad`).not.toMatch(/\bfloat\s+rad\b/);
        expect(shader, `${name} redeclares ang`).not.toMatch(/\bfloat\s+ang\b/);
        expect(shader, `${name} redeclares uv`).not.toMatch(/\bvec2\s+uv\b/);
      }
    }
  });
});
