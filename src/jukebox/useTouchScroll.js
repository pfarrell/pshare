import { useRef, useCallback } from 'react';

const DRAG_THRESHOLD_PX = 6;

// --- Momentum (inertial coast after release) --------------------------------
// Native momentum scrolling comes from the browser's own touch-scroll physics,
// which this hook already bypasses entirely (see the file comment below) by
// setting scrollTop/scrollLeft directly — so momentum has to be hand-rolled
// too, on both input paths, the same way the drag itself is.
//
// Only the last VELOCITY_WINDOW_MS of movement feeds the release velocity, so
// a drag that starts slow and ends in a fast flick reflects the flick, not an
// average over the whole gesture.
const VELOCITY_WINDOW_MS = 100;
// Below this release speed (px/ms), it reads as "just stopped dragging" —
// no coast.
const MIN_FLING_VELOCITY = 0.05;
// Clamped so a single noisy/duplicate event near release can't launch an
// absurdly long coast.
const MAX_FLING_VELOCITY = 3.5;
// Velocity halves every this many ms — an exponential decay, so the coast
// naturally reads as "fast, then trailing off," not a linear ramp-down.
const MOMENTUM_HALF_LIFE_MS = 325;
// Momentum stops once the coast has slowed to below this — imperceptible
// beyond this point.
const STOP_VELOCITY = 0.02;

// Chromium's native drag-to-scroll proved unreliable on the actual kiosk
// hardware, so this hook takes drag-to-scroll over directly, tracking raw
// pointer deltas and setting scrollTop/scrollLeft manually.
//
// Two input paths feed the same drag logic, because two kinds of device exist:
//  - Real touch events (touchstart/touchmove) — phones, and touchscreens the OS
//    reports as touch.
//  - Mouse-like pointer events. The Pi kiosk's touchscreen is delivered to
//    Chromium as a *mouse* (recorded from real drags: pointerdown/mousedown/
//    pointermove/mouseup/click, zero touch events), so on that hardware the
//    touch path never fires. A mouse drag never scrolls natively either, which
//    is why content "didn't scroll" while the scrollbar thumb still worked.
// `pointerType === 'touch'` pointers are ignored on the pointer path: real touch
// devices emit those alongside touch events, and handling both would fight.
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

    // ---- Shared drag tracking -------------------------------------------
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let dragging = false;
    // Recent (time, position) samples along the active axis, for computing a
    // release velocity — see the momentum section below.
    let samples = [];
    let momentumFrame = null;

    const stopMomentum = () => {
      if (momentumFrame != null) {
        cancelAnimationFrame(momentumFrame);
        momentumFrame = null;
      }
    };

    // A fresh touch/click grabs the content immediately, same as iOS — any
    // coast still in progress from a previous release is cancelled.
    const begin = (x, y) => {
      stopMomentum();
      startX = x;
      startY = y;
      startScroll = axis === 'y' ? el.scrollTop : el.scrollLeft;
      dragging = false;
      samples = [];
    };

    // Returns true when this movement is (part of) a scroll drag we've claimed.
    const track = (x, y) => {
      const dx = x - startX;
      const dy = y - startY;
      const delta = axis === 'y' ? dy : dx;
      const cross = axis === 'y' ? dx : dy;

      if (!dragging) {
        // Only claim the gesture once movement is clearly along our axis and
        // past a small threshold — otherwise a tap (or a drag meant for
        // something else, e.g. a horizontal swipe surfacing inside a
        // vertical list) gets swallowed into an unwanted scroll.
        if (Math.abs(delta) < DRAG_THRESHOLD_PX || Math.abs(delta) < Math.abs(cross)) return false;
        dragging = true;
      }

      if (axis === 'y') {
        el.scrollTop = startScroll - delta;
      } else {
        el.scrollLeft = startScroll - delta;
      }

      // Track raw position (not delta) — its rate of change is identical to
      // delta's (they differ by the constant startX/startY), and keeping the
      // window trimmed to the last VELOCITY_WINDOW_MS is simpler this way.
      const now = performance.now();
      samples.push({ t: now, pos: axis === 'y' ? y : x });
      while (samples.length > 1 && now - samples[0].t > VELOCITY_WINDOW_MS) samples.shift();

      return true;
    };

    // Called on release. No-op unless the gesture was an actual drag (a tap
    // never reaches here with `dragging` true) moving fast enough at the end
    // to read as a flick.
    const maybeStartMomentum = () => {
      if (samples.length < 2) return;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      if (dt <= 0) return;

      let velocity = (last.pos - first.pos) / dt;
      if (Math.abs(velocity) < MIN_FLING_VELOCITY) return;
      velocity = Math.sign(velocity) * Math.min(Math.abs(velocity), MAX_FLING_VELOCITY);

      let lastFrameTime = performance.now();
      const step = (frameTime) => {
        const frameDt = frameTime - lastFrameTime;
        lastFrameTime = frameTime;

        const before = axis === 'y' ? el.scrollTop : el.scrollLeft;
        const next = before - velocity * frameDt;
        if (axis === 'y') el.scrollTop = next; else el.scrollLeft = next;
        const after = axis === 'y' ? el.scrollTop : el.scrollLeft;

        velocity *= Math.pow(0.5, frameDt / MOMENTUM_HALF_LIFE_MS);

        // Stop once imperceptibly slow, or once a scroll bound has clamped
        // the assignment and there's no further room to coast into.
        if (Math.abs(velocity) < STOP_VELOCITY || after === before) {
          momentumFrame = null;
          return;
        }
        momentumFrame = requestAnimationFrame(step);
      };
      momentumFrame = requestAnimationFrame(step);
    };

    // ---- Touch events ---------------------------------------------------
    const handleTouchStart = (e) => {
      const touch = e.touches[0];
      begin(touch.clientX, touch.clientY);
    };

    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      if (track(touch.clientX, touch.clientY)) e.preventDefault();
    };

    const handleTouchEnd = () => {
      if (dragging) maybeStartMomentum();
      dragging = false;
    };

    // ---- Mouse-like pointer events --------------------------------------
    let pointerDown = false;
    let suppressClick = false;
    let suppressTimer = null;

    const isTextEntry = (target) =>
      target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]');

    const handlePointerDown = (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      if (isTextEntry(e.target)) return; // let the caret/selection work inside inputs
      pointerDown = true;
      begin(e.clientX, e.clientY);
    };

    const handlePointerMove = (e) => {
      if (!pointerDown || e.pointerType === 'touch') return;
      const wasDragging = dragging;
      if (track(e.clientX, e.clientY) && !wasDragging) {
        // Keep receiving moves if the pointer leaves the scroller mid-drag.
        try {
          el.setPointerCapture?.(e.pointerId);
        } catch {
          // Capture is a nicety; the drag still works without it.
        }
      }
    };

    const handlePointerEnd = () => {
      if (!pointerDown) return;
      pointerDown = false;
      if (dragging) {
        // A drag that ends over an element still produces a click on it (or on
        // the nearest common ancestor) — swallow it so dragging the grid can't
        // also open whatever album the finger happened to lift over. The click
        // is dispatched right after pointerup, so the flag only needs to live
        // until the next task; clearing it prevents eating a later, real tap
        // if no click ever arrives.
        suppressClick = true;
        clearTimeout(suppressTimer);
        suppressTimer = setTimeout(() => {
          suppressClick = false;
        }, 0);
        maybeStartMomentum();
      }
      dragging = false;
    };

    const handleClickCapture = (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      clearTimeout(suppressTimer);
      e.stopPropagation();
      e.preventDefault();
    };

    // While a pointer is held down, a mouse drag would otherwise start
    // selecting text under the finger.
    const handleSelectStart = (e) => {
      if (pointerDown) e.preventDefault();
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerEnd);
    el.addEventListener('pointercancel', handlePointerEnd);
    el.addEventListener('click', handleClickCapture, { capture: true });
    el.addEventListener('selectstart', handleSelectStart);

    cleanupRef.current = () => {
      stopMomentum();
      clearTimeout(suppressTimer);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerEnd);
      el.removeEventListener('pointercancel', handlePointerEnd);
      el.removeEventListener('click', handleClickCapture, { capture: true });
      el.removeEventListener('selectstart', handleSelectStart);
    };
  }, [axis]);

  return attachRef;
};
