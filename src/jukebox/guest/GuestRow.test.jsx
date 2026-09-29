import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GuestRow from './GuestRow';

const renderRow = (props) => render(<MemoryRouter><GuestRow {...props} /></MemoryRouter>);

test('renders title, subtitle and the action', () => {
  renderRow({ title: 'Song', subtitle: 'Band', action: <button>act</button> });
  expect(screen.getByText('Song')).toBeInTheDocument();
  expect(screen.getByText('Band')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'act' })).toBeInTheDocument();
});

test('renders the main area as a link when `to` is given', () => {
  renderRow({ title: 'Album', to: '/jukebox/tok/album/1' });
  expect(screen.getByRole('link')).toHaveAttribute('href', '/jukebox/tok/album/1');
});

test('renders no link without `to`', () => {
  renderRow({ title: 'Song' });
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('falls back to a placeholder when there is no image or it fails to load', () => {
  const { container } = renderRow({ title: 'A', imageUrl: '/x.jpg' });
  fireEvent.error(container.querySelector('img'));
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('.jukebox-guest-row-art-placeholder')).not.toBeNull();
});

test('does not throw or print "undefined" when subtitle is missing', () => {
  renderRow({ title: 'Song' });
  expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
});
