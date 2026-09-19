// The backend reports user-facing failures as { error: string }. Anything
// else (network errors, unexpected shapes) gets the caller's fallback rather
// than a raw axios message.
export const getErrorMessage = (err, fallback) => {
  const message = err?.response?.data?.error;
  return typeof message === 'string' && message ? message : fallback;
};
