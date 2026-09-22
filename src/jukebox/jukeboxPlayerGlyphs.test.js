import { GLYPHS, getPlaybackModeDisplay } from './jukeboxPlayerGlyphs';

test('exposes the transport glyphs', () => {
  expect(GLYPHS).toEqual({ PREV: '⏪', NEXT: '⏩', PLAY: '⏵', PAUSE: '⏸' });
});

test('maps each plain playback mode to a glyph and title', () => {
  expect(getPlaybackModeDisplay('off', null)).toEqual({ glyph: '\u{1F500}', title: 'Shuffle: Off' });
  expect(getPlaybackModeDisplay('shuffle', null)).toEqual({ glyph: '\u{1F500}', title: 'Shuffle' });
  expect(getPlaybackModeDisplay('repeat-all', null)).toEqual({ glyph: '\u{1F501}', title: 'Repeat All' });
  expect(getPlaybackModeDisplay('repeat-one', null)).toEqual({ glyph: '\u{1F502}', title: 'Repeat One' });
});

test('shuffle-scope uses its own glyph and names the scope from the queue source', () => {
  expect(getPlaybackModeDisplay('shuffle-scope', { type: 'artist' })).toEqual({ glyph: '\u{1F3B2}', title: 'Shuffle Artist' });
  expect(getPlaybackModeDisplay('shuffle-scope', { type: 'collection' })).toEqual({ glyph: '\u{1F3B2}', title: 'Shuffle Collection' });
});

test('shuffle-scope with an unknown or missing source falls back to a generic label', () => {
  expect(getPlaybackModeDisplay('shuffle-scope', null).title).toBe('Shuffle Scope');
  expect(getPlaybackModeDisplay('shuffle-scope', { type: 'weird' }).title).toBe('Shuffle Scope');
});

test('an unrecognized mode falls back to the "off" display instead of crashing', () => {
  expect(getPlaybackModeDisplay('nonsense', null)).toEqual({ glyph: '\u{1F500}', title: 'Shuffle: Off' });
});
