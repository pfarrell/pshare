import { useEffect } from 'react';

const DRAG_THRESHOLD_PX = 6;

// Chromium's native touch-drag-to-scroll gesture recognition proved
// unreliable on the actual kiosk hardware (a Wayland/labwc/touch-input
// combination outside anything fixable in app code — the browser still
// exposes a mouse-draggable scrollbar thumb, so the element genuinely does
// scroll, it just never converts a touch drag on the *content* into one).
// This hook takes that translation over directly: track raw touch movement
// and set scrollTop/scrollLeft ourselves rather than relying on the browser
// to recognize the gesture.
//
// Native listeners (not React's synthetic onTouchMove) so the touchmove
// listener can be registered non-passive — passive:false is what lets
// preventDefault() actually suppress whatever the browser would otherwise
// attempt, once we've decided to own the gesture.
export const useTouchScroll = (ref, { axis = 'y' } = {}) => {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

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

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [ref, axis]);
};
