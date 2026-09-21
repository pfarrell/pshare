import { useRef, useCallback } from 'react';

const DRAG_THRESHOLD_PX = 6;

// Chromium's native touch-drag-to-scroll gesture recognition proved
// unreliable on the actual kiosk hardware (confirmed via screenshot: the
// scrollbar thumb is present and mouse/pointer-draggable, so the element
// genuinely does scroll, it just never converts a touch drag on the
// *content* into one). This hook takes that translation over directly,
// tracking raw touchmove deltas and setting scrollTop/scrollLeft manually.
//
// Returns a callback ref, not a plain useRef object, on purpose: a plain
// `useRef` + `useEffect([ref])` only attaches listeners once, on whichever
// render first ran the effect — if the scrollable element doesn't exist yet
// on that render (e.g. a loading state that resolves later, as in
// QuickHitTab), `ref.current` stays null forever from the effect's point of
// view, since mutating `.current` doesn't re-trigger the effect. A callback
// ref fires exactly when the DOM node is actually attached or detached,
// regardless of which render that happens on.
export const useTouchScroll = ({ axis = 'y' } = {}) => {
  const cleanupRef = useRef(null);

  const attachRef = useCallback((el) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let dragging = false;

    const handleTouchStart = (e) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startScroll = axis === 'y' ? el.scrollTop : el.scrollLeft;
      dragging = false;
    };

    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const delta = axis === 'y' ? dy : dx;
      const cross = axis === 'y' ? dx : dy;

      if (!dragging) {
        // Only claim the gesture once movement is clearly along our axis and
        // past a small threshold — otherwise a tap (or a drag meant for
        // something else, e.g. a horizontal swipe surfacing inside a
        // vertical list) gets swallowed into an unwanted scroll.
        if (Math.abs(delta) < DRAG_THRESHOLD_PX || Math.abs(delta) < Math.abs(cross)) return;
        dragging = true;
      }

      if (axis === 'y') {
        el.scrollTop = startScroll - delta;
      } else {
        el.scrollLeft = startScroll - delta;
      }
      e.preventDefault();
    };

    const handleTouchEnd = () => {
      dragging = false;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    cleanupRef.current = () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [axis]);

  return attachRef;
};
