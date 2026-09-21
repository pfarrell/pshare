import { render, screen, fireEvent } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import JukeboxKeyboard from './JukeboxKeyboard';

// Harness: a real controlled input plus a real DOM node, so the keyboard
// writes into an element React itself is watching — the same mechanics as
// production, not a mock.
const Harness = () => {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const [target, setTarget] = useState(null);

  useEffect(() => { setTarget(inputRef.current); }, []);

  return (
    <>
      <input ref={inputRef} data-testid="target" value={value} onChange={(e) => setValue(e.target.value)} />
      <JukeboxKeyboard targetElement={target} />
    </>
  );
};

test('renders nothing when there is no target element', () => {
  render(<JukeboxKeyboard targetElement={null} />);
  expect(screen.queryByRole('group', { name: 'On-screen keyboard' })).not.toBeInTheDocument();
});

test('tapping a letter key appends it to the target input', () => {
  render(<Harness />);
  fireEvent.click(screen.getByText('q'));
  expect(screen.getByTestId('target')).toHaveValue('q');
});

test('shift capitalizes subsequent letters', () => {
  render(<Harness />);
  fireEvent.click(screen.getByLabelText('Shift'));
  fireEvent.click(screen.getByText('Q'));
  expect(screen.getByTestId('target')).toHaveValue('Q');
});

test('backspace removes the last character', () => {
  render(<Harness />);
  fireEvent.click(screen.getByText('q'));
  fireEvent.click(screen.getByText('w'));
  fireEvent.click(screen.getByLabelText('Backspace'));
  expect(screen.getByTestId('target')).toHaveValue('q');
});

test('space inserts a space character', () => {
  render(<Harness />);
  fireEvent.click(screen.getByText('a'));
  fireEvent.click(screen.getByLabelText('Space'));
  fireEvent.click(screen.getByText('b'));
  expect(screen.getByTestId('target')).toHaveValue('a b');
});

test('a symbol key inserts that symbol', () => {
  render(<Harness />);
  fireEvent.click(screen.getByText('@'));
  expect(screen.getByTestId('target')).toHaveValue('@');
});

test('Done blurs the target element', () => {
  render(<Harness />);
  const input = screen.getByTestId('target');
  input.focus();
  expect(input).toHaveFocus();
  fireEvent.click(screen.getByLabelText('Done'));
  expect(input).not.toHaveFocus();
});

test('keys use onMouseDown to prevent default, so tapping one does not blur the target', () => {
  render(<Harness />);
  const input = screen.getByTestId('target');
  input.focus();
  fireEvent.mouseDown(screen.getByText('q'));
  expect(input).toHaveFocus();
});
