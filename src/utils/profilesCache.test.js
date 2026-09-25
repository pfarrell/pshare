// src/utils/profilesCache.test.js
import { getProfilesCached, __resetProfilesCacheForTests } from './profilesCache';
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
