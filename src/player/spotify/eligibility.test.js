import { canPlaySpotify } from './eligibility';

const eligible = { status: { allowed: true, connected: true }, isSecureContext: true, isIOS: false };

test('true when allowed, connected, in a secure context and not on iOS', () => {
  expect(canPlaySpotify(eligible)).toBe(true);
});

test('false outside a secure context', () => {
  expect(canPlaySpotify({ ...eligible, isSecureContext: false })).toBe(false);
});

test('false on iOS', () => {
  expect(canPlaySpotify({ ...eligible, isIOS: true })).toBe(false);
});

test('false when not connected', () => {
  expect(canPlaySpotify({ ...eligible, status: { allowed: true, connected: false } })).toBe(false);
});

test('false when not allowed', () => {
  expect(canPlaySpotify({ ...eligible, status: { allowed: false, connected: true } })).toBe(false);
});

test('false when there is no status at all', () => {
  expect(canPlaySpotify({ ...eligible, status: null })).toBe(false);
});
