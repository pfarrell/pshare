import { useNavigate } from 'react-router-dom';
import { useFavoriteToggle } from './useFavoriteToggle';
import { shareLink } from '../utils/shareLink';

// The Edit / Favorite / Overtone / Share action list shared by an entity
// page's PlayActionsMenu overflow and its header long-press ContextMenu.
export const useEntityHeaderActions = ({
  kind,
  entity,
  favoriteExtras,
  canEdit,
  isAuthenticated,
  overtoneAction = null,
  share = null,
  extras = [],
  afterFavorite = [],
}) => {
  const navigate = useNavigate();
  const favorite = useFavoriteToggle(kind, entity, favoriteExtras);

  const actions = entity ? [
    canEdit && { key: 'edit', icon: '✎', label: 'Edit', onClick: () => navigate(`/admin/${kind}/${entity.id}`) },
    ...extras,
    isAuthenticated && { key: 'favorite', icon: favorite.icon, label: favorite.label, onClick: favorite.toggle },
    overtoneAction,
    ...afterFavorite,
    isAuthenticated && share && { key: 'share', icon: '📤', label: 'Share', onClick: () => shareLink(share) },
  ].filter(Boolean) : [];

  // Every account-gated item is hidden when logged out, so unless Overtone
  // applies a long-press would open an empty menu — suppress it instead.
  const shouldIgnore = (e) =>
    (!isAuthenticated && !overtoneAction) || e.target.tagName === 'A' || !!e.target.closest('button');

  return { actions, shouldIgnore };
};
