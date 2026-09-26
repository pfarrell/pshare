// src/utils/profilesCache.test.js
import {
  getProfilesCached,
  __resetProfilesCacheForTests,
  invalidateProfilesCache,
  subscribeProfilesInvalidated,
} from './profilesCache';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({ apiService: { getProfiles: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  __resetProfilesCacheForTests();
});

test('fetches once and caches the promise across multiple calls', async () => {
  apiService.getProfiles.mockResolvedValue({ data: [{ id: 1, name: 'Kids', tags: [] }] });

  await getProfilesCached();
  await getProfilesCached();

  expect(apiService.getProfiles).toHaveBeenCalledTimes(1);
});

test('__resetProfilesCacheForTests clears the cache so the next call refetches', async () => {
  apiService.getProfiles.mockResolvedValue({ data: [] });
  await getProfilesCached();
  __resetProfilesCacheForTests();
  await getProfilesCached();
  expect(apiService.getProfiles).toHaveBeenCalledTimes(2);
});

test('invalidateProfilesCache clears the cache and notifies subscribers', async () => {
  apiService.getProfiles.mockResolvedValue({ data: [] });
  await getProfilesCached();
  const listener = vi.fn();
  subscribeProfilesInvalidated(listener);

  invalidateProfilesCache();

  expect(listener).toHaveBeenCalledTimes(1);
  await getProfilesCached();
  expect(apiService.getProfiles).toHaveBeenCalledTimes(2);
});

test('subscribeProfilesInvalidated returns an unsubscribe function', () => {
  const listener = vi.fn();
  const unsubscribe = subscribeProfilesInvalidated(listener);

  unsubscribe();
  invalidateProfilesCache();

  expect(listener).not.toHaveBeenCalled();
});

test('does not notify a listener that was never subscribed', () => {
  const listener = vi.fn();

  invalidateProfilesCache();

  expect(listener).not.toHaveBeenCalled();
});
