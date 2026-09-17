import { Children, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import MenuItem from './MenuItem';

const MENU_WIDTH = 240; // clamp estimate used before layout; comfortably covers the mobile breakpoint's 200px min-width plus longer labels (e.g. "★ Remove from Favorites") at its larger 1rem font/padding
const BUTTON_HEIGHT = 44;
const MENU_PADDING = 16;
const JUST_OPENED_GUARD_MS = 350; // matches useContextMenu's justOpenedByLongPress window

// Portals and positions the action menu opened by useContextMenu, clamped to
// stay on-screen. Children are the menu's own <button> elements, or pass
// `actions` to have the menu render them — this component only owns the
// backdrop, portal, and positioning; callers own what the menu contains
// (button labels, styles, per-action behavior).
const ContextMenu = ({ open, position, openedViaTouch = false, onDismiss, onSwallowTouch, onClose, actions, testId = 'context-menu-backdrop', children }) => {
  const justOpened = useRef(false);
  const clearGuardTimer = useRef(null);

  useEffect(() => {
    // Only long-press opens need the tail-event guard below — a desktop
    // right-click's immediate follow-up click is a normal, expected
    // interaction and must not be swallowed.
    if (open && openedViaTouch) {
      justOpened.current = true;
      if (clearGuardTimer.current) clearTimeout(clearGuardTimer.current);
      clearGuardTimer.current = setTimeout(() => { justOpened.current = false; }, JUST_OPENED_GUARD_MS);
    }
    return () => {
      if (clearGuardTimer.current) clearTimeout(clearGuardTimer.current);
    };
  }, [open, openedViaTouch]);

  if (!open) return null;

  // Data-driven menus (actions) and hand-built menus (children) share the
  // same portal, positioning, and early-tap guard.
  const items = actions
    ? actions.filter(Boolean).map((action) => (
        <MenuItem
          key={action.key}
          className={action.className}
          onSelect={() => { onClose?.(); action.onClick(); }}
        >
          {action.icon} {action.label}
        </MenuItem>
      ))
    : children;

  // Swallows the very first click/touchend the menu receives right after a
  // long-press opens it — the finger's release can land on whichever item
  // the menu opened under, and without this guard that stray tail event
  // fires that item's action before the user has consciously chosen
  // anything. Capture phase so it runs before the item's own
  // onClick/onTouchEnd. No-op for a desktop right-click open.
  const guardEarlyTap = (e) => {
    if (justOpened.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const menuHeight = Children.toArray(items).filter(Boolean).length * BUTTON_HEIGHT + MENU_PADDING;
  let left = position.x;
  let top = position.y;
  if (left + MENU_WIDTH > window.innerWidth) left = window.innerWidth - MENU_WIDTH - 10;
  if (left < 10) left = 10;
  if (top + menuHeight > window.innerHeight) top = Math.max(10, top - menuHeight - 10);
  if (top < 10) top = 10;

  return createPortal(
    <>
      <div
        data-testid={testId}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1150 }}
        onClick={onDismiss}
        onTouchStart={onSwallowTouch}
        onTouchEnd={onDismiss}
      />
      <div
        className="track-dropdown"
        style={{ position: 'fixed', left: `${left}px`, top: `${top}px`, zIndex: 1200 }}
        onClickCapture={guardEarlyTap}
        onTouchEndCapture={guardEarlyTap}
      >
        {items}
      </div>
    </>,
    document.body
  );
};

export default ContextMenu;
