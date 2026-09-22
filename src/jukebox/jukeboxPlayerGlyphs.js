// Transport glyphs and the playback-mode → glyph/title mapping for the jukebox
// transport. Deliberately duplicated from MusicPlayerWrapper's private
// constants instead of exported from it: editing that shared component is
// exactly what the jukebox bottom-tabs design avoids. If the two ever drift
// only glyphs are affected.
export const GLYPHS = { PREV: '⏪', NEXT: '⏩', PLAY: '⏵', PAUSE: '⏸' };

const SHUFFLE = '\u{1F500}';
// Distinct from SHUFFLE on purpose: shuffle-scope (shuffle within an
// artist/collection) needs its own glyph so it's distinguishable without hover.
const SHUFFLE_SCOPE = '\u{1F3B2}';
const REPEAT_ALL = '\u{1F501}';
const REPEAT_ONE = '\u{1F502}';

const MODE_DISPLAY = {
  off: { glyph: SHUFFLE, title: 'Shuffle: Off' },
  shuffle: { glyph: SHUFFLE, title: 'Shuffle' },
  'repeat-all': { glyph: REPEAT_ALL, title: 'Repeat All' },
  'repeat-one': { glyph: REPEAT_ONE, title: 'Repeat One' },
};

const SCOPE_TYPE_LABEL = {
  collection: 'Collection',
  artist: 'Artist',
};

export const getPlaybackModeDisplay = (playbackMode, queueSource) => {
  if (playbackMode === 'shuffle-scope') {
    return { glyph: SHUFFLE_SCOPE, title: `Shuffle ${SCOPE_TYPE_LABEL[queueSource?.type] || 'Scope'}` };
  }
  return MODE_DISPLAY[playbackMode] ?? MODE_DISPLAY.off;
};
