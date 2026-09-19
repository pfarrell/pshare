import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

describe('Modal', () => {
  test('renders children in a dialog; outside click closes, inside click does not', async () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} testId="m-backdrop" labelledBy="m-title"><h2 id="m-title">Hello</h2></Modal>);
    expect(screen.getByRole('dialog', { name: 'Hello' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('Hello'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('m-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('dismissible=false ignores outside clicks', async () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} dismissible={false} testId="m-backdrop">x</Modal>);
    await userEvent.click(screen.getByTestId('m-backdrop'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('size and layer map to CSS classes', () => {
    render(<Modal size="md" layer="top" testId="m-backdrop">x</Modal>);
    expect(screen.getByTestId('m-backdrop')).toHaveClass('modal-backdrop', 'modal-backdrop--top');
    expect(screen.getByRole('dialog')).toHaveClass('modal-panel', 'modal-panel--md');
  });
});
