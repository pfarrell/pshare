// Guest components must stay independent of the main app's player and auth
// stores (spec: "keep jukebox stuff separate").
const sources = import.meta.glob('./*.{js,jsx}', { query: '?raw', import: 'default', eager: true });

test('no guest source file imports playerStore or authStore', () => {
  const offenders = Object.entries(sources)
    .filter(([file]) => !file.endsWith('.test.js') && !file.endsWith('.test.jsx'))
    .filter(([, code]) => /stores\/(playerStore|authStore)/.test(code))
    .map(([file]) => file);
  expect(offenders).toEqual([]);
});

test('the glob actually found the guest sources', () => {
  expect(Object.keys(sources).some((f) => f.endsWith('GuestApp.jsx'))).toBe(true);
});
