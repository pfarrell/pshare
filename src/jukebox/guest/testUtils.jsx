import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { GuestProvider } from './GuestContext';

// Renders one guest page at its real route so useParams/useSearchParams work.
export const renderGuest = (element, { path, route, token = 'tok' }) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <GuestProvider token={token}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<div>elsewhere</div>} />
        </Routes>
      </GuestProvider>
    </MemoryRouter>
  );
