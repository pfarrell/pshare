import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminFormActions from './AdminFormActions';

describe('AdminFormActions', () => {
  test('Save submits the form; Cancel and Delete call their handlers', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    render(<form onSubmit={onSubmit}><AdminFormActions saving={false} onCancel={onCancel} onDelete={onDelete} deleteLabel="Delete Artist" /></form>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Artist' }));
    expect(onSubmit).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });

  test('saving disables everything and relabels Save', () => {
    render(<form><AdminFormActions saving onCancel={vi.fn()} onDelete={vi.fn()} deleteLabel="Delete Album" /></form>);
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Album' })).toBeDisabled();
  });

  test('Cancel and Delete are optional', () => {
    render(<form><AdminFormActions saving={false} /></form>);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
