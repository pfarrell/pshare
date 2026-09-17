import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from './ConfirmDialog';

describe('ConfirmDialog', () => {
  test('inline confirm calls onConfirm; cancel calls onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Confirm" message="Add it?" confirmLabel="Add to Existing" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('heading', { name: 'Confirm' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add to Existing' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('requireTypedPhrase gates the confirm button (exact match) and Enter submits', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="Delete" message="Sure?" confirmLabel="Delete" requireTypedPhrase="delete me" onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'Delete Me');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'delete me{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('pending confirm shows busyLabel and blocks outside-click cancel; rejection shows the error', async () => {
    let reject;
    const onConfirm = vi.fn(() => new Promise((_, rej) => { reject = rej; }));
    const onCancel = vi.fn();
    render(<ConfirmDialog title="t" message="m" confirmLabel="Go" busyLabel="Going…" testId="cd-backdrop" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(screen.getByRole('button', { name: 'Going…' })).toBeDisabled();
    await userEvent.click(screen.getByTestId('cd-backdrop'));
    expect(onCancel).not.toHaveBeenCalled();
    reject({ response: { data: { error: 'Boom' } } });
    expect(await screen.findByText('Boom')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Go' })).not.toBeDisabled());
  });
});
