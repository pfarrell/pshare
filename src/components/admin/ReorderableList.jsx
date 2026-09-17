// src/components/admin/ReorderableList.jsx
import { useEffect, useRef, useState } from 'react';
import ContextMenu from '../ContextMenu';
import { useContextMenu } from '../../hooks/useContextMenu';
import { moveItem, moveToEdge } from '../../utils/reorder';

const AUTO_SCROLL_EDGE_PX = 60;
const AUTO_SCROLL_SPEED_PX = 12;

// Shows exactly where a dragged row would land, between two rows.
const DropIndicator = () => (
  <div data-testid="drop-indicator" style={{ height: '3px', backgroundColor: '#3b82f6', borderRadius: '2px' }} />
);

// Auto-scrolls Layout's .main-content (not window — the app is a fixed-height
// flex column with its own scroll area) while a native drag hovers near its
// top/bottom edge. Listens on document: the fixed .app-header/.app-footer
// overlap those edge zones, so the cursor is over them, not the container.
const useDragAutoScroll = () => {
  const frameRef = useRef(null);
  const directionRef = useRef(0);

  useEffect(() => {
    const container = document.querySelector('.main-content');
    if (!container) return undefined;

    const step = () => {
      if (directionRef.current !== 0) container.scrollTop += directionRef.current * AUTO_SCROLL_SPEED_PX;
      frameRef.current = requestAnimationFrame(step);
    };

    const handleDragOver = (e) => {
      const rect = container.getBoundingClientRect();
      if (e.clientY < rect.top + AUTO_SCROLL_EDGE_PX) directionRef.current = -1;
      else if (e.clientY > rect.bottom - AUTO_SCROLL_EDGE_PX) directionRef.current = 1;
      else directionRef.current = 0;
      if (!frameRef.current) frameRef.current = requestAnimationFrame(step);
    };

    const stop = () => {
      directionRef.current = 0;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', stop);
    document.addEventListener('dragend', stop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', stop);
      document.removeEventListener('dragend', stop);
      stop();
    };
  }, []);
};

// Its own component because useContextMenu is a hook — each row needs its
// own menu state. A right-click/long-press on a row's buttons is meant for
// that button, so those don't open the row menu.
const ReorderableRow = ({ isDragged, dragHandlers, menuTestId, onMoveToEdge, children }) => {
  const ctxMenu = useContextMenu({ shouldIgnore: (e) => !!e.target.closest('button') });
  return (
    <div
      draggable
      {...dragHandlers}
      {...ctxMenu.triggerProps}
      style={{
        padding: '1rem',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'move',
        backgroundColor: isDragged ? 'var(--color-bg-surface-muted)' : 'var(--color-bg-surface)',
      }}
    >
      {children}
      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        openedViaTouch={ctxMenu.openedViaTouch}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        onClose={ctxMenu.close}
        actions={[
          { key: 'top', icon: '⬆', label: 'Send to Top', onClick: () => onMoveToEdge('top') },
          { key: 'bottom', icon: '⬇', label: 'Send to Bottom', onClick: () => onMoveToEdge('bottom') },
        ]}
        testId={menuTestId}
      />
    </div>
  );
};

const ReorderableList = ({ items, getKey, renderRow, onReorder, menuTestId }) => {
  const [draggedKey, setDraggedKey] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { key, position: 'before' | 'after' }
  useDragAutoScroll();

  return (
    <>
      {items.map((item, index) => {
        const key = getKey(item);
        const isDropTarget = dropTarget?.key === key;
        const dragHandlers = {
          onDragStart: (e) => {
            setDraggedKey(key);
            e.dataTransfer.effectAllowed = 'move';
          },
          onDragOver: (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const rect = e.currentTarget.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            setDropTarget({ key, position: e.clientY < midpoint ? 'before' : 'after' });
          },
          onDragEnd: () => {
            setDraggedKey(null);
            setDropTarget(null);
          },
          onDrop: (e) => {
            e.preventDefault();
            const position = dropTarget?.position ?? 'before';
            setDropTarget(null);
            if (draggedKey === null || draggedKey === key) return;
            const fromIndex = items.findIndex((i) => getKey(i) === draggedKey);
            setDraggedKey(null);
            const next = moveItem(items, fromIndex, index, position);
            if (next !== items) onReorder(next);
          },
        };

        return (
          <div key={key}>
            {isDropTarget && dropTarget.position === 'before' && <DropIndicator />}
            <ReorderableRow
              isDragged={draggedKey === key}
              dragHandlers={dragHandlers}
              menuTestId={menuTestId}
              onMoveToEdge={(edge) => onReorder(moveToEdge(items, index, edge))}
            >
              {renderRow(item, index)}
            </ReorderableRow>
            {isDropTarget && dropTarget.position === 'after' && <DropIndicator />}
          </div>
        );
      })}
    </>
  );
};

export default ReorderableList;
