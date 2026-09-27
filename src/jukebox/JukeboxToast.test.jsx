import { render, screen } from '@testing-library/react';
import JukeboxToast from './JukeboxToast';

test('renders nothing when there is no message', () => {
  const { container } = render(<JukeboxToast message={null} />);
  expect(container).toBeEmptyDOMElement();
});

test('shows the message as an accessible status', () => {
  render(<JukeboxToast message="Added to queue" />);
  expect(screen.getByRole('status')).toHaveTextContent('Added to queue');
});
