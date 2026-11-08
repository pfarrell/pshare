// A Wikipedia summary from the API counts as present only when it has text;
// null, {} and a blank summary all mean "nothing to show".
export const hasWikipediaContent = (summary) =>
  !!summary && Object.keys(summary).length > 0 && !!summary.summary && summary.summary.trim() !== '';
