import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { setReactInputValue, isTextInput } from './jukeboxKeyboardInput';

const ControlledInput = () => {
  const [value, setValue] = useState('ab');
  return <input data-testid="target" value={value} onChange={(e) => setValue(e.target.value)} />;
};

test('setReactInputValue updates a React-controlled input and triggers its onChange', () => {
  render(<ControlledInput />);
  const input = screen.getByTestId('target');
  expect(input.value).toBe('ab');

  setReactInputValue(input, 'abc');

  expect(input.value).toBe('abc');
});

test('isTextInput accepts <textarea> and plain <input>', () => {
  expect(isTextInput(document.createElement('textarea'))).toBe(true);
  expect(isTextInput(document.createElement('input'))).toBe(true);
});

test('isTextInput rejects non-text input types, other elements, and null', () => {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  expect(isTextInput(checkbox)).toBe(false);
  expect(isTextInput(document.createElement('button'))).toBe(false);
  expect(isTextInput(null)).toBe(false);
});
