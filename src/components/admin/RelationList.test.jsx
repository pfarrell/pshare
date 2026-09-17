import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import RelationList from './RelationList';

describe('RelationList', () => {
  const items = [{ id: 1, name: 'John' }, { id: 2, name: 'Paul' }];

  test('renders title, rows, meta, and a Remove button per row', async () => {
    const onRemove = vi.fn();
    render(<RelationList title="Members" items={items} renderName={(i) => i.name} renderMeta={() => <span>pill</span>} onRemove={onRemove} />);
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getAllByText('pill')).toHaveLength(2);
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    expect(onRemove).toHaveBeenCalledWith(items[1]);
  });

  test('renders nothing when empty without titleExtra', () => {
    const { container } = render(<RelationList title="Members" items={[]} renderName={(i) => i.name} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('keeps the header when empty but titleExtra is present', () => {
    render(<RelationList title="Similar Artists" titleExtra={<button>show 2 hidden</button>} items={[]} renderName={(i) => i.name} />);
    expect(screen.getByRole('button', { name: 'show 2 hidden' })).toBeInTheDocument();
  });
});
