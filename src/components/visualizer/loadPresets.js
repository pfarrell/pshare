import { customPresets } from './presets';

export const mergePresets = (stock, custom) => ({ ...stock, ...custom });

// butterchurn-presets is ~638KB minified, so it is imported lazily and lands in
// the `visualizer` chunk (see manualChunks in vite.config.js), which is in turn
// excluded from the Workbox precache manifest.
export const loadPresets = async () => {
  const module = await import('butterchurn-presets');
  const pack = module.default ?? module;
  return mergePresets(pack.getPresets(), customPresets);
};
