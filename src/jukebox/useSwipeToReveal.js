import { useRef, useState, useCallback } from 'react';

const DRAG_THRESHOLD_PX = 6;
// Width of the delete button area revealed by a full swipe-open.
export const REVEAL_WIDTH_PX = 72;
const OPEN_SNAP_THRESHOLD_PX = REVEAL_WIDTH_PX / 2;

// Swipe-left-to-reveal-a-delete-button for a single jukebox Next Up row
// (see JukeboxQueueRow.jsx). Mirrors useTouchScroll.js's two input paths —
// real touch events, and the kiosk touchscreen's mouse-like pointer events —
// and its click-suppression trick, for the same reason: a claimed gesture
// (here, a horizontal drag, or a tap that closes an already-open row) must
// not also fire whatever a plain tap on this row would (Track.jsx's
// tap-to-play).
//
// `isOpen`/`onOpenChange` are owned by the caller, not this hook: only one
// row may be open at a time, which needs state one level up (JukeboxNextUpTab)
// to coordinate across rows.
export const useSwipeToReveal = ({ isOpen, onOpenChange, disabled = false }) => {
  // Non-null only while a horizontal drag is actively in progress — the
  // live, finger-following offset. Once released, this resets to null and
  // the rendered offset falls back to isOpen ? -REVEAL_WIDTH_PX : 0, i.e.
  // whatever the caller's state (updated via onOpenChange) says it should be.
  const [dragOffset, setDragOffset] = useState(null);
  const cleanupRef = useRef(null);
  const configRef = useRef({ isOpen, onOpenChange, disabled });
  configRef.current = { isOpen, onOpenChange, disabled };

  const attachRef = useCallback((el) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let baseOffset = 0;
    let axis = null; // null (undecided) | 'x' (claimed horizontal) | 'y' (ceded to vertical scroll)
    let lastOffset = 0;
    let pointerDown = false;
    let suppressClick = false;
    let suppressTimer = null;

    const begin = (x, y) => {
      // Disabled rows (the currently-playing one) never reveal — forcing
      // axis to 'y' up front means move() below always cedes immediately,
      // and taps pass straight through untouched, same as a plain Track row.
      if (configRef.current.disabled) {
        axis = 'y';
        return;
      }
      startX = x;
      startY = y;
      baseOffset = configRef.current.isOpen ? -REVEAL_WIDTH_PX : 0;
      axis = null;
    };

    // Returns true once this movement has been claimed as a horizontal swipe.
    const move = (x, y) => {
      if (axis === 'y') return false;
      const dx = x - startX;
      const dy = y - startY;
      if (axis === null) {
        // Same shape as useTouchScroll's delta-vs-cross gate: don't decide
        // until movement is clearly past a small threshold, then let
        // whichever axis dominates win the gesture.
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return false;
        if (Math.abs(dy) > Math.abs(dx)) {
          axis = 'y'; // cede to the ancestor's vertical scroll
          return false;
        }
        axis = 'x';
      }
      lastOffset = Math.min(0, Math.max(-REVEAL_WIDTH_PX, baseOffset + dx));
      setDragOffset(lastOffset);
      return true;
    };

    const finishDrag = () => {
      const finalOpen = lastOffset <= -OPEN_SNAP_THRESHOLD_PX;
      setDragOffset(null);
      configRef.current.onOpenChange(finalOpen);
    };

    // A tap (never became a horizontal drag) closes an already-open row —
    // unless it landed on the delete button, which has its own onClick and
    // is what actually removes the track. Returns whether it intercepted the
    // tap, so callers know whether to also suppress the click that follows.
    const maybeCloseOnTap = (target) => {
      if (!configRef.current.isOpen) return false;
      if (target?.closest?.('.jukebox-queue-row-delete')) return false;
      configRef.current.onOpenChange(false);
      return true;
    };

    const armClickSuppression = () => {
      suppressClick = true;
      clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => { suppressClick = false; }, 0);
    };

    // ---- Touch events ---------------------------------------------------
    const handleTouchStart = (e) => {
      const touch = e.touches[0];
      begin(touch.clientX, touch.clientY);
    };

    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      if (move(touch.clientX, touch.clientY)) e.preventDefault();
    };

    // Registered non-passive: a tap that closes an open row needs to
    // preventDefault() here to suppress the click Ios/Chromium would
    // otherwise synthesize right after — there was no touchmove to swallow
    // it earlier, since a tap never moved at all.
    const handleTouchEnd = (e) => {
      if (axis === 'x') {
        finishDrag();
      } else if (axis === null) {
        if (maybeCloseOnTap(e.target)) e.preventDefault();
      }
      axis = null;
    };

    const handleTouchCancel = () => { axis = null; };

    // ---- Mouse-like pointer events --------------------------------------
    const handlePointerDown = (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      pointerDown = true;
      begin(e.clientX, e.clientY);
    };

    const handlePointerMove = (e) => {
      if (!pointerDown || e.pointerType === 'touch') return;
      move(e.clientX, e.clientY);
    };

    const handlePointerEnd = (e) => {
      if (!pointerDown) return;
      pointerDown = false;
      if (axis === 'x') {
        armClickSuppression();
        finishDrag();
      } else if (axis === null) {
        if (maybeCloseOnTap(e.target)) armClickSuppression();
      }
      axis = null;
    };

    const handleClickCapture = (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      clearTimeout(suppressTimer);
      e.stopPropagation();
      e.preventDefault();
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: false });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerEnd);
    el.addEventListener('pointercancel', handlePointerEnd);
    el.addEventListener('click', handleClickCapture, { capture: true });

    cleanupRef.current = () => {
      clearTimeout(suppressTimer);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerEnd);
      el.removeEventListener('pointercancel', handlePointerEnd);
      el.removeEventListener('click', handleClickCapture, { capture: true });
    };
  }, []);

  const offset = dragOffset !== null ? dragOffset : (isOpen ? -REVEAL_WIDTH_PX : 0);
  return { attachRef, offset, isDragging: dragOffset !== null };
};
