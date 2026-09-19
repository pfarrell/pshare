import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IframeModal from './IframeModal';

describe('IframeModal', () => {
  const url = 'https://example.org/page';

  test('renders an iframe with the given url and title', () => {
    render(<IframeModal url={url} title="Example" testId="example-backdrop" onClose={vi.fn()} />);
    expect(screen.getByTitle('Example')).toHaveAttribute('src', url);
  });

  test('close button and backdrop call onClose; clicks inside the box do not', async () => {
    const onClose = vi.fn();
    render(<IframeModal url={url} title="Example" testId="example-backdrop" onClose={onClose} />);
    await userEvent.click(screen.getByTitle('Example'));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByTestId('example-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test('forwards iframeRef to the iframe element', () => {
    const ref = createRef();
    render(<IframeModal url={url} title="Example" testId="example-backdrop" onClose={vi.fn()} iframeRef={ref} />);
    expect(ref.current).toBe(screen.getByTitle('Example'));
  });
});
