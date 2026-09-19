// A rendered <Link>'s href already includes the router basename (e.g.
// "/pshare/app/album/1" in production), but navigate() expects a path
// relative to that basename and would prefix it a second time.
export const toRouterPath = (href, basename = import.meta.env.BASE_URL) => {
  const base = (basename || '/').replace(/\/+$/, '');
  if (!base) return href;
  if (href === base) return '/';
  return href.startsWith(`${base}/`) ? href.slice(base.length) : href;
};
