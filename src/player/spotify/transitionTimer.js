// Measures the silence gap at each source switch (experimental, #72). Enabled only with
// localStorage['pshare-debug-transitions'] === '1'; otherwise every call is a cheap no-op.
// A negative gap means the outgoing and incoming sources overlapped.

const STALE_MS = 15000;

let pending = null;

export const isTransitionTimingEnabled = () => {
  try {
    return localStorage.getItem('pshare-debug-transitions') === '1';
  } catch {
    return false;
  }
};

// The outgoing source stopped (or will stop at `at`, an epoch-ms estimate) at a switch.
export const markOutgoingEnd = (fromSource, at) => {
  if (!isTransitionTimingEnabled()) return;
  pending = { from: fromSource, at: Number.isFinite(at) ? at : Date.now() };
};

// The incoming source is audible. Logs only if a switch is pending and it's a cross-source or
// spotify→spotify transition; a plain local→local 'playing' event never has a pending mark.
export const markIncomingAudible = (toSource) => {
  if (!pending || !isTransitionTimingEnabled()) {
    pending = null;
    return;
  }
  const { from, at } = pending;
  pending = null;
  const now = Date.now();
  if (now - at > STALE_MS) return;
  if (from === 'local' && toSource === 'local') return;
  try {
    console.log(`[transition] ${from}→${toSource} gap ${Math.round(now - at)}ms`);
  } catch {
    // never throw from instrumentation
  }
};

// Drops a pending mark (a start that failed or was skipped must not time the next audible event).
export const clearPendingTransition = () => {
  pending = null;
};
