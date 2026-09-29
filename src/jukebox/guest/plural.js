// "1 album" / "3 albums". Counts from the API can arrive as numeric strings
// (Postgres bigint), so coerce before comparing. Returns '' when there is no
// usable count so callers can drop the subtitle instead of printing "NaN".
export const plural = (count, word) => {
  if (count === null || count === undefined || count === '') return '';
  const n = Number(count);
  if (Number.isNaN(n)) return '';
  return `${n} ${word}${n === 1 ? '' : 's'}`;
};
