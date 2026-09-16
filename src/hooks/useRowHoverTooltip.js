import { useCallback, useEffect, useRef, useState } from 'react';

// Shared hover-tooltip-with-delay behavior for a list of rows: rest the
// mouse on a row for `delay` ms and a tooltip for that row's data appears at
// the cursor, then tracks the cursor until the mouse leaves. Only one
// tooltip is ever live for the whole list, so the caller renders it once
// (e.g. via a portal) using the `tooltip` state, rather than each row owning
// its own instance.
export const useRowHoverTooltip = ({ delay = 500, disabled = false } = {}) => {
  const [tooltip, setTooltip] = useState(null);
  const timerRef = useRef(null);
  const posRef = useRef({ x: 0, y: 0 });

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const getRowHoverProps = useCallback((track) => {
    if (disabled) return {};

    return {
      onMouseEnter: (e) => {
        posRef.current = { x: e.clientX, y: e.clientY };
        clearTimer();
        timerRef.current = setTimeout(() => {
          setTooltip({ track, x: posRef.current.x, y: posRef.current.y });
        }, delay);
      },
      onMouseMove: (e) => {
        posRef.current = { x: e.clientX, y: e.clientY };
        setTooltip((current) => (current ? { ...current, x: e.clientX, y: e.clientY } : current));
      },
      onMouseLeave: () => {
        clearTimer();
        setTooltip(null);
      },
    };
  }, [delay, disabled]);

  return { tooltip, getRowHoverProps };
};
