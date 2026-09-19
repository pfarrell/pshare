import { handleSmallImageError } from './imageFallback';

const fakeEvent = (src) => {
  const target = { src, onerror: () => {} };
  return { target };
};

describe('handleSmallImageError', () => {
  test('swaps a /sm/ thumbnail for the full-size path and disarms onerror', () => {
    const e = fakeEvent('https://patf.net/images/albums/sm/abbey_road.jpg');
    handleSmallImageError(e);
    expect(e.target.src).toBe('https://patf.net/images/albums/abbey_road.jpg');
    expect(e.target.onerror).toBeNull();
  });

  test('leaves a non-/sm/ path alone so a missing full-size image cannot loop', () => {
    const handler = () => {};
    const e = { target: { src: 'https://patf.net/images/albums/abbey_road.jpg', onerror: handler } };
    handleSmallImageError(e);
    expect(e.target.src).toBe('https://patf.net/images/albums/abbey_road.jpg');
    expect(e.target.onerror).toBe(handler);
  });
});
