import { render, screen } from '@testing-library/react';
import AdminPanel from './AdminPanel';

describe('AdminPanel', () => {
  test('renders tone class, title heading, actions, and children', () => {
    render(<AdminPanel tone="relations" title="Relations" actions={<button>+ Add</button>}><p>body</p></AdminPanel>);
    const heading = screen.getByRole('heading', { name: 'Relations' });
    expect(heading.closest('section')).toHaveClass('admin-panel', 'admin-panel--relations');
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  test('omits the header when there is no title or actions', () => {
    const { container } = render(<AdminPanel tone="warning"><p>only</p></AdminPanel>);
    expect(container.querySelector('.admin-panel-header')).toBeNull();
  });
});
