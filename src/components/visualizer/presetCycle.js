import { takeShaderFailures } from './shaderDiagnostics';

export const CYCLE_MS = 30000;
export const BLEND_SECONDS = 2.0;

// Picks and loads presets, skipping any whose shaders fail to compile.
//
// butterchurn reports a broken preset by rendering solid black rather than by
// throwing, so the only way to notice is to drain the shader diagnostics buffer
// after each load. A broken custom preset must never strand the kiosk on a
// black screen, so we move on to the next one.
export const createPresetCycle = ({ presets, visualizer, random = Math.random }) => {
  const names = Object.keys(presets);
  const broken = new Set();
  let currentName = null;

  const pick = () => {
    const candidates = names.filter((n) => !broken.has(n) && n !== currentName);
    const pool = candidates.length > 0 ? candidates : names.filter((n) => !broken.has(n));
    if (pool.length === 0) return null;
    return pool[Math.floor(random() * pool.length) % pool.length];
  };

  const next = () => {
    for (let attempt = 0; attempt < names.length; attempt += 1) {
      const name = pick();
      if (name === null) return;

      takeShaderFailures();
      try {
        visualizer.loadPreset(presets[name], BLEND_SECONDS);
      } catch {
        broken.add(name);
        continue;
      }

      const failures = takeShaderFailures();
      if (failures.length > 0) {
        broken.add(name);
        continue;
      }

      currentName = name;
      return;
    }
  };

  return { next, CYCLE_MS };
};
