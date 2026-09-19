import { fireEvent, render, screen } from '@testing-library/react';
import WikipediaSlugInput from './WikipediaSlugInput';

const paste = (el, text) => fireEvent.paste(el, { clipboardData: { getData: () => text } });

describe('WikipediaSlugInput', () => {
  test('pasting a Wikipedia URL stores just the slug', () => {
    const onChange = vi.fn();
    render(<WikipediaSlugInput value="" onChange={onChange} placeholder="slug" />);
    paste(screen.getByPlaceholderText('slug'), 'https://en.wikipedia.org/wiki/Abbey_Road');
    expect(onChange).toHaveBeenCalledWith('Abbey_Road');
  });

  test('pasting a plain slug is left to the normal input flow', () => {
    const onChange = vi.fn();
    render(<WikipediaSlugInput value="" onChange={onChange} placeholder="slug" />);
    paste(screen.getByPlaceholderText('slug'), 'Abbey_Road');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('typing calls onChange with the raw value', () => {
    const onChange = vi.fn();
    render(<WikipediaSlugInput value="" onChange={onChange} placeholder="slug" />);
    fireEvent.change(screen.getByPlaceholderText('slug'), { target: { value: 'The_Beatles' } });
    expect(onChange).toHaveBeenCalledWith('The_Beatles');
  });
});
