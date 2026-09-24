// Loose title comparison — mirrors server/src/utils/titleMatch.ts. Kept as a
// small duplicate rather than shared, since frontend and backend are
// separate bundles/runtimes with no existing shared-code path between them.
// Strips parenthetical suffixes (e.g. "(Radio Edit)") and punctuation before
// comparing, and allows either side to be a substring of the other so things
// like "Poison arrow" / "Poison Arrow" or "Song" / "Song (Remastered)" still
// match.
export function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function titlesRoughlyMatch(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
