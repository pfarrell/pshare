import { getErrorMessage } from './errors';

describe('getErrorMessage', () => {
  test('returns the server-provided error string', () => {
    expect(getErrorMessage({ response: { data: { error: 'Name is required' } } }, 'Failed')).toBe('Name is required');
  });

  test('falls back when there is no response body error', () => {
    expect(getErrorMessage(new Error('Network Error'), 'Failed to save')).toBe('Failed to save');
    expect(getErrorMessage({ response: { data: {} } }, 'Failed to save')).toBe('Failed to save');
    expect(getErrorMessage(undefined, 'Failed to save')).toBe('Failed to save');
  });

  test('ignores a non-string or empty error field', () => {
    expect(getErrorMessage({ response: { data: { error: { code: 1 } } } }, 'Fallback')).toBe('Fallback');
    expect(getErrorMessage({ response: { data: { error: '' } } }, 'Fallback')).toBe('Fallback');
  });
});
