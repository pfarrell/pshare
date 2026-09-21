import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import JukeboxLogin from './JukeboxLogin';

vi.mock('../services/api', () => ({
  apiService: { jukeboxLogin: vi.fn() },
}));
vi.mock('../stores/authStore', () => ({
  useAuthStore: { getState: vi.fn() },
}));

import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';

beforeEach(() => {
  useAuthStore.getState.mockReturnValue({ initialize: vi.fn().mockResolvedValue(true) });
});

test('submits username, password, and device name to jukeboxLogin', async () => {
  apiService.jukeboxLogin.mockResolvedValue({ data: { user: { id: 1 }, device: { id: 1, name: 'Kitchen' } } });
  render(<JukeboxLogin />);

  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'patf' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
  fireEvent.change(screen.getByLabelText('Device Name'), { target: { value: 'Kitchen' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

  await waitFor(() => {
    expect(apiService.jukeboxLogin).toHaveBeenCalledWith('patf', 'hunter2', 'Kitchen');
  });
});

test('re-initializes auth state after a successful login', async () => {
  const initialize = vi.fn().mockResolvedValue(true);
  useAuthStore.getState.mockReturnValue({ initialize });
  apiService.jukeboxLogin.mockResolvedValue({ data: { user: { id: 1 }, device: { id: 1, name: 'Kitchen' } } });
  render(<JukeboxLogin />);

  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'patf' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } });
  fireEvent.change(screen.getByLabelText('Device Name'), { target: { value: 'Kitchen' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

  await waitFor(() => expect(initialize).toHaveBeenCalled());
});

test('shows an error message on failed login without calling initialize', async () => {
  const initialize = vi.fn();
  useAuthStore.getState.mockReturnValue({ initialize });
  apiService.jukeboxLogin.mockRejectedValue({ response: { data: { error: 'Invalid username or password' } } });
  render(<JukeboxLogin />);

  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'patf' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
  fireEvent.change(screen.getByLabelText('Device Name'), { target: { value: 'Kitchen' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

  await waitFor(() => {
    expect(screen.getByText('Invalid username or password')).toBeInTheDocument();
  });
  expect(initialize).not.toHaveBeenCalled();
});
