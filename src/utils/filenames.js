// Suggested on-disk image filename derived from an entity name
// (e.g. "The Beatles" -> "the_beatles"); callers append the extension.
export const toFilename = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
