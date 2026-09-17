// src/components/EntityCard.jsx
import ResultRow from './ResultRow';
import ContextMenu from './ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import { useIsMobile } from '../hooks/useIsMobile';
import { useViewModeStore } from '../stores/viewModeStore';
import { handleSmallImageError } from '../utils/imageFallback';

// Shared shell for browse-grid cards: a compact ResultRow on mobile or in
// list view, a square .artist-card otherwise, plus a right-click/long-press
// menu built from `actions`. Callers own only what differs per entity.
const EntityCard = ({
  title,
  imageUrl,
  imageAlt,
  imageShape = 'square',
  cardImageStyle,
  listSubtitle,
  listImageContent,
  cardTitleStyle,
  cardFooter,
  onClick,
  play,
  actions = [],
  shouldIgnore,
  menuTestId,
}) => {
  const isMobile = useIsMobile();
  const viewMode = useViewModeStore((s) => s.mode);
  const hasActions = actions.some(Boolean);
  const ctxMenu = useContextMenu({
    shouldIgnore: (e) => !hasActions || !!e.target.closest('[data-result-row-play]') || !!shouldIgnore?.(e),
  });
  const handleClick = () => {
    if (!ctxMenu.open) onClick();
  };

  return (
    <>
      {(isMobile || viewMode === 'list') ? (
        <ResultRow
          imageUrl={imageUrl}
          imageContent={listImageContent}
          imageShape={imageShape}
          title={title}
          subtitle={listSubtitle}
          onClick={handleClick}
          onImageError={handleSmallImageError}
          triggerProps={ctxMenu.triggerProps}
          play={play}
        />
      ) : (
        <div className="artist-card" onClick={handleClick} {...ctxMenu.triggerProps}>
          <div className="artist-card-image">
            <img src={imageUrl} alt={imageAlt ?? title} style={cardImageStyle} onError={handleSmallImageError} />
          </div>
          <div className="artist-card-title">
            <h3 style={cardTitleStyle}>{title}</h3>
            {cardFooter}
          </div>
        </div>
      )}
      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        openedViaTouch={ctxMenu.openedViaTouch}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        onClose={ctxMenu.close}
        actions={actions}
        testId={menuTestId}
      />
    </>
  );
};

export default EntityCard;
