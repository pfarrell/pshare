// src/utils/pageWindow.js
// The (up to) five page numbers shown in a pager, keeping the current page
// centered except near either end.
export const pageWindow = (current, totalPages) => {
  const count = Math.min(5, totalPages);
  let first;
  if (totalPages <= 5 || current <= 3) first = 1;
  else if (current >= totalPages - 2) first = totalPages - 4;
  else first = current - 2;
  return Array.from({ length: count }, (_, i) => first + i);
};
