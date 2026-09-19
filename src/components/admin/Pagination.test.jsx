import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from './Pagination';

describe('Pagination', () => {
  test('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPageChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('Previous disabled on page 1; page and Next buttons call onPageChange', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={8} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange.mock.calls).toEqual([[3], [2]]);
  });
});
