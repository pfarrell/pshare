import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEntityHeaderActions } from './useEntityHeaderActions';
import { useFavoritesStore } from '../stores/favoritesStore';

vi.mock('../utils/shareLink', () => ({ shareLink: vi.fn() }));
import { shareLink } from '../utils/shareLink';

const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;
const overtone = { key: 'overtone', icon: '🔍', label: 'Overtone', onClick: vi.fn() };

beforeEach(() => {
  useFavoritesStore.setState({ isFavorite: () => false, toggleFavorite: vi.fn() });
});

describe('useEntityHeaderActions', () => {
  test('orders Edit, extras, Favorite, Overtone, afterFavorite, Share', () => {
    const { result } = renderHook(() => useEntityHeaderActions({
      kind: 'album',
      entity: { id: 7, title: 'T' },
      canEdit: true,
      isAuthenticated: true,
      overtoneAction: overtone,
      share: { title: 'T', text: 'T by A' },
      extras: [{ key: 'collection', icon: '▣', label: 'Add to Collection', onClick: vi.fn() }, false],
      afterFavorite: [{ key: 'download', icon: '⬇', label: 'Download', onClick: vi.fn() }],
    }), { wrapper });
    expect(result.current.actions.map((a) => a.key)).toEqual(['edit', 'collection', 'favorite', 'overtone', 'download', 'share']);
    result.current.actions.find((a) => a.key === 'share').onClick();
    expect(shareLink).toHaveBeenCalledWith({ title: 'T', text: 'T by A' });
  });

  test('logged out keeps only Overtone (no edit/favorite/share)', () => {
    const { result } = renderHook(() => useEntityHeaderActions({
      kind: 'artist', entity: { id: 1, name: 'A' }, canEdit: false, isAuthenticated: false,
      overtoneAction: overtone, share: { title: 'A', text: 'A' },
    }), { wrapper });
    expect(result.current.actions.map((a) => a.key)).toEqual(['overtone']);
  });

  test('no actions before the entity loads', () => {
    const { result } = renderHook(() => useEntityHeaderActions({ kind: 'album', entity: null, canEdit: true, isAuthenticated: true }), { wrapper });
    expect(result.current.actions).toEqual([]);
  });

  test('shouldIgnore: nothing applicable, links, and buttons', () => {
    const target = (tagName, insideButton = false) => ({ target: { tagName, closest: () => (insideButton ? {} : null) } });
    const loggedOut = renderHook(() => useEntityHeaderActions({ kind: 'collection', entity: { id: 1 }, canEdit: false, isAuthenticated: false }), { wrapper });
    expect(loggedOut.result.current.shouldIgnore(target('DIV'))).toBe(true);
    const loggedIn = renderHook(() => useEntityHeaderActions({ kind: 'collection', entity: { id: 1 }, canEdit: false, isAuthenticated: true }), { wrapper });
    expect(loggedIn.result.current.shouldIgnore(target('DIV'))).toBe(false);
    expect(loggedIn.result.current.shouldIgnore(target('A'))).toBe(true);
    expect(loggedIn.result.current.shouldIgnore(target('SPAN', true))).toBe(true);
  });
});
