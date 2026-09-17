import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { useUnsavedChangesGuard, UNSAVED_CHANGES_PROMPT } from './useUnsavedChangesGuard';
import { useUnsavedChangesStore } from '../stores/unsavedChangesStore';

const Harness = ({ isDirty, save, onSaveError }) => {
  const { navigateAway } = useUnsavedChangesGuard({ isDirty, save, onSaveError });
  return (
    <>
      <Link to="/elsewhere">elsewhere</Link>
      <a href="/back" className="admin-back-link" onClick={(e) => e.preventDefault()}>back</a>
      <button onClick={() => navigateAway('/dest')}>leave</button>
    </>
  );
};

const renderHarness = (props) => render(
  <MemoryRouter initialEntries={['/edit']}>
    <Routes>
      <Route path="/edit" element={<Harness {...props} />} />
      <Route path="/elsewhere" element={<div>Elsewhere page</div>} />
      <Route path="/dest" element={<div>Dest page</div>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  useUnsavedChangesStore.setState({ hasUnsavedChanges: false, save: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useUnsavedChangesGuard', () => {
  test('dirty + internal link + confirm OK saves, then navigates', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const save = vi.fn().mockResolvedValue();
    renderHarness({ isDirty: true, save });
    await userEvent.click(screen.getByText('elsewhere'));
    expect(confirmSpy).toHaveBeenCalledWith(UNSAVED_CHANGES_PROMPT);
    expect(save).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Elsewhere page')).toBeInTheDocument();
  });

  test('dirty + confirm Cancel neither saves nor navigates', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const save = vi.fn();
    renderHarness({ isDirty: true, save });
    await userEvent.click(screen.getByText('elsewhere'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('leave')).toBeInTheDocument();
  });

  test('clean state does not intercept links', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderHarness({ isDirty: false, save: vi.fn() });
    await userEvent.click(screen.getByText('elsewhere'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('Elsewhere page')).toBeInTheDocument();
  });

  test('the page-owned back link is never intercepted', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderHarness({ isDirty: true, save: vi.fn() });
    await userEvent.click(screen.getByText('back'));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  test('navigateAway saves via save() before navigating when dirty', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const save = vi.fn().mockResolvedValue();
    renderHarness({ isDirty: true, save });
    await userEvent.click(screen.getByText('leave'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Dest page')).toBeInTheDocument();
  });

  test('navigateAway navigates without prompting when clean', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderHarness({ isDirty: false, save: vi.fn() });
    await userEvent.click(screen.getByText('leave'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('Dest page')).toBeInTheDocument();
  });

  test('a failed save reports via onSaveError and stays on the page', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const err = new Error('boom');
    const onSaveError = vi.fn();
    renderHarness({ isDirty: true, save: vi.fn().mockRejectedValue(err), onSaveError });
    await userEvent.click(screen.getByText('leave'));
    await waitFor(() => expect(onSaveError).toHaveBeenCalledWith(err));
    expect(screen.getByText('leave')).toBeInTheDocument();
  });

  test('registers with unsavedChangesStore and clears on unmount', () => {
    const save = vi.fn();
    const { unmount } = renderHarness({ isDirty: true, save });
    expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(true);
    expect(useUnsavedChangesStore.getState().save).toBe(save);
    unmount();
    expect(useUnsavedChangesStore.getState().hasUnsavedChanges).toBe(false);
    expect(useUnsavedChangesStore.getState().save).toBeNull();
  });
});
