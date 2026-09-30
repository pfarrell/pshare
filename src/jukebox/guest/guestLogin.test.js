import { guestLoginUrl } from './guestLogin';

afterEach(() => vi.unstubAllEnvs());

test('in dev the login url has no app base path and returns to the current guest page', () => {
  vi.stubEnv('DEV', true);
  expect(guestLoginUrl('/jukebox/tok/search?q=abba')).toBe(
    `/login?return_to=${encodeURIComponent('/jukebox/tok/search?q=abba')}`,
  );
});

test('in production both the login url and the return target carry the /pshare/app base path', () => {
  vi.stubEnv('DEV', false);
  expect(guestLoginUrl('/jukebox/tok')).toBe(
    `/pshare/app/login?return_to=${encodeURIComponent('/pshare/app/jukebox/tok')}`,
  );
});

test('the return target survives special characters in the query', () => {
  vi.stubEnv('DEV', true);
  const url = guestLoginUrl('/jukebox/tok/search?q=a&b=c d');
  const returned = new URL(url, 'http://x').searchParams.get('return_to');
  expect(returned).toBe('/jukebox/tok/search?q=a&b=c d');
});
