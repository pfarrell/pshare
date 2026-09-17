import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnsavedChangesStore } from '../stores/unsavedChangesStore';

export const UNSAVED_CHANGES_PROMPT = 'You have unsaved changes. Click OK to save and leave, or Cancel to stay on this page.';

// Everything an admin edit page needs to avoid silently losing edits:
// the browser's own beforeunload prompt, a confirm-save-then-go intercept on
// in-app link clicks, registration with Layout's pull-to-refresh prompt, and
// navigateAway() for the page's own Back/Cancel controls. Every save path
// goes through `save`, so there is exactly one payload definition per page.
export const useUnsavedChangesGuard = ({ isDirty, save, onSaveError, backLinkClass = 'admin-back-link' }) => {
  const navigate = useNavigate();
  const onSaveErrorRef = useRef(onSaveError);
  useEffect(() => { onSaveErrorRef.current = onSaveError; });

  const trySave = useCallback(async () => {
    try {
      await save();
      return true;
    } catch (err) {
      onSaveErrorRef.current?.(err);
      return false;
    }
  }, [save]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleClick = async (e) => {
      if (!isDirty) return;
      const link = e.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;
      // The page's own back link runs navigateAway() itself.
      if (link.classList.contains(backLinkClass)) return;

      e.preventDefault();
      e.stopPropagation();

      if (!window.confirm(UNSAVED_CHANGES_PROMPT)) return;
      if (await trySave()) {
        setTimeout(() => navigate(href), 0);
      }
    };
    // Capture phase so this runs before react-router's <Link> handler.
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [isDirty, trySave, navigate, backLinkClass]);

  useEffect(() => {
    useUnsavedChangesStore.getState().setUnsavedChanges(isDirty, save);
    return () => useUnsavedChangesStore.getState().clear();
  }, [isDirty, save]);

  const navigateAway = useCallback(async (destination) => {
    if (!isDirty) {
      navigate(destination);
      return;
    }
    if (!window.confirm(UNSAVED_CHANGES_PROMPT)) return;
    if (await trySave()) navigate(destination);
  }, [isDirty, trySave, navigate]);

  return { navigateAway };
};
