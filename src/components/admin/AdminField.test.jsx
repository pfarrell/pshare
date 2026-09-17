import { render, screen } from '@testing-library/react';
import AdminField from './AdminField';

describe('AdminField', () => {
  test('associates the label with the input and shows help text', () => {
    render(<AdminField label="Release Year" htmlFor="year" help="Four digits"><input id="year" /></AdminField>);
    expect(screen.getByLabelText('Release Year')).toBeInTheDocument();
    expect(screen.getByText('Four digits')).toHaveClass('admin-help');
  });
});
