// src/utils/reorder.js
// Pure list reordering for drag-and-drop and "Send to Top/Bottom".

export const moveItem = (list, fromIndex, toIndex, position = 'before') => {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return list;
  let insertAt = position === 'after' ? toIndex + 1 : toIndex;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  // insertAt was computed against the pre-removal list.
  if (fromIndex < insertAt) insertAt -= 1;
  next.splice(insertAt, 0, moved);
  return next;
};

export const moveToEdge = (list, index, edge) => {
  if (index < 0 || index >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  if (edge === 'top') next.unshift(moved);
  else next.push(moved);
  return next;
};
