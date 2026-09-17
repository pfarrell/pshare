import { toRouterPath } from './routerPath';

describe('toRouterPath', () => {
  test('strips the app basename from a rendered <Link> href', () => {
    expect(toRouterPath('/pshare/app/album/1', '/pshare/app/')).toBe('/album/1');
    expect(toRouterPath('/pshare/app', '/pshare/app/')).toBe('/');
  });

  test('is a no-op in dev (basename "/") and for look-alike prefixes', () => {
    expect(toRouterPath('/album/1', '/')).toBe('/album/1');
    expect(toRouterPath('/pshare/apple', '/pshare/app/')).toBe('/pshare/apple');
  });
});
