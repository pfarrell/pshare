// Hand-authored presets, merged over the stock butterchurn pack at load time.
// To add one: write a module beside this file exporting a preset object, then
// add it here. No build step, no .milk conversion.
import { rings } from './rings';

export const customPresets = {
  'P-Share - Rings': rings,
};
