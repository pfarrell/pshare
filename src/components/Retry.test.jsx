// src/components/Retry.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Retry from './Retry';

describe('Retry', () => {
  test('shows `message` and calls onRetry instead of reloading', async () => {
    const onRetry = vi.fn();
    render(<Retry message="Failed to load collection" onRetry={onRetry} />);
    expect(screen.getByText('Failed to load collection')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('still accepts the legacy `error` prop (string or Error)', () => {
    const { rerender } = render(<Retry error="Network Error" />);
    expect(screen.getByText('Network Error')).toBeInTheDocument();
    rerender(<Retry error={new Error('Timeout')} />);
    expect(screen.getByText('Timeout')).toBeInTheDocument();
  });
});
