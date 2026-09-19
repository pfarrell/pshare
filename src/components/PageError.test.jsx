// src/components/PageError.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PageError from './PageError';

describe('PageError', () => {
  test('shows the message and Go Home navigates to /', async () => {
    render(
      <MemoryRouter initialEntries={['/album/1']}>
        <Routes>
          <Route path="/album/:id" element={<PageError message="Album not found" />} />
          <Route path="/" element={<div>Home page</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Album not found')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go Home' }));
    expect(await screen.findByText('Home page')).toBeInTheDocument();
  });

  test('onHome overrides the default navigation', async () => {
    const onHome = vi.fn();
    render(<MemoryRouter><PageError message="x" onHome={onHome} /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Go Home' }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });
});
