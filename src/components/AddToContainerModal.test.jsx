import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import AddToContainerModal from './AddToContainerModal';
import { useAuthStore } from '../stores/authStore';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const copy = {
  addTitle: 'Add to Box', createTitle: 'Create New Box', filterPlaceholder: 'Filter boxes...',
  loading: 'Loading boxes...', empty: 'No boxes found', unnamed: '(Unnamed Box)',
  nameLabel: 'Box Name', namePlaceholder: 'Enter box name', createButton: 'Create & Add Thing',
  addButton: 'Add to Box', enterName: 'Please enter a box name', selectOne: 'Please select a box',
  loadFailed: 'Failed to load boxes', addFailed: 'Failed to add', createFailed: 'Failed to create box',
  duplicateNameMessage: (name) => `A box named "${name}" already exists. Add to it?`,
  alreadyInMessage: (name) => `"Thing" is already in "${name}". Add it anyway?`,
};

const items = [
  { id: 1, name: 'Old Mine', user_id: 1, updated_at: '2026-01-01' },
  { id: 2, name: 'New Mine', user_id: 1, updated_at: '2026-06-01' },
  { id: 3, name: 'Theirs', user_id: 99, updated_at: '2026-07-01' },
];

const renderModal = (overrides = {}) => {
  const props = {
    subjectTitle: 'Thing',
    copy,
    loadItems: vi.fn().mockResolvedValue(items),
    createAndAdd: vi.fn().mockResolvedValue(),
    addItem: vi.fn().mockResolvedValue(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<AddToContainerModal {...props} />);
  return props;
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: { id: 1 }, isAdmin: false });
});

describe('AddToContainerModal', () => {
  test('lists only writable items, most recently updated first', async () => {
    renderModal();
    await screen.findByText('New Mine');
    const names = screen.getAllByText(/Mine$/).map((el) => el.textContent);
    expect(names).toEqual(['New Mine', 'Old Mine']);
    expect(screen.queryByText('Theirs')).not.toBeInTheDocument();
  });

  test('select + add calls addItem, toasts, and closes', async () => {
    const props = renderModal();
    await userEvent.click(await screen.findByText('Old Mine'));
    await userEvent.click(screen.getByRole('button', { name: 'Add to Box' }));
    expect(props.addItem).toHaveBeenCalledWith(1);
    expect(toast.success).toHaveBeenCalledWith('Added "Thing" to "Old Mine"');
    expect(props.onClose).toHaveBeenCalled();
  });

  test('create new with a fresh name calls createAndAdd', async () => {
    const props = renderModal();
    await userEvent.click(await screen.findByText('+ Create New...'));
    await userEvent.type(screen.getByPlaceholderText('Enter box name'), 'Fresh');
    await userEvent.click(screen.getByRole('button', { name: 'Create & Add Thing' }));
    expect(props.createAndAdd).toHaveBeenCalledWith('Fresh');
    expect(toast.success).toHaveBeenCalledWith('Created "Fresh" and added "Thing"');
  });

  test('regression: duplicate name → Add to Existing → already-in confirmation stays visible', async () => {
    const props = renderModal({ isAlreadyInItem: vi.fn().mockResolvedValue(true) });
    await userEvent.click(await screen.findByText('+ Create New...'));
    await userEvent.type(screen.getByPlaceholderText('Enter box name'), 'old mine');
    await userEvent.click(screen.getByRole('button', { name: 'Create & Add Thing' }));
    expect(screen.getByText('A box named "Old Mine" already exists. Add to it?')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add to Existing' }));
    expect(await screen.findByText('"Thing" is already in "Old Mine". Add it anyway?')).toBeInTheDocument();
    expect(props.addItem).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Add Anyway' }));
    await waitFor(() => expect(props.addItem).toHaveBeenCalledWith(1));
    expect(props.onClose).toHaveBeenCalled();
  });

  test('describeAddError customizes the failure toast', async () => {
    renderModal({
      addItem: vi.fn().mockRejectedValue({ response: { status: 409 } }),
      describeAddError: (err, name) => (err.response?.status === 409 ? `"Thing" is already in "${name}"` : 'Failed to add'),
    });
    await userEvent.click(await screen.findByText('New Mine'));
    await userEvent.click(screen.getByRole('button', { name: 'Add to Box' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('"Thing" is already in "New Mine"'));
  });
});
