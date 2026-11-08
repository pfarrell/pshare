import { useEffect, useState } from 'react';
import { hasWikipediaContent } from '../utils/wikipediaSummary';

// GET /album/:id and /artist/:id only wait ~1s for Wikipedia, so a slow
// lookup leaves the page without a summary even when an article exists. When
// the loaded page has none, ask the summary endpoint once (it has no
// deadline) and show what it finds. `key` identifies the page (its id), so a
// late answer for a previous page is dropped.
export const useSummaryRetry = (pageSummary, fetchSummary, { loaded, key }) => {
  const [retried, setRetried] = useState({ key: null, summary: null });
  const needsRetry = loaded && !hasWikipediaContent(pageSummary);

  useEffect(() => {
    if (!needsRetry) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => fetchSummary())
      .then((summary) => {
        if (!cancelled && hasWikipediaContent(summary)) setRetried({ key, summary });
      })
      .catch((err) => console.warn('Wikipedia summary retry failed:', err));
    return () => { cancelled = true; };
    // fetchSummary is a fresh closure every render; key identifies the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, needsRetry]);

  if (needsRetry && retried.key === key) return retried.summary;
  return pageSummary;
};
