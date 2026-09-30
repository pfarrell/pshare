// The guest app is rendered in its own Router branch, so it can't navigate to
// /login in-app: it does a full page load instead, with return_to pointing back
// at the guest page (Login/Signup already honor return_to and, after signing in,
// load that URL). Both URLs live under the router basename in production.
const appBase = () => (import.meta.env.DEV ? '' : '/pshare/app');

export const guestLoginUrl = (pathWithSearch) =>
  `${appBase()}/login?return_to=${encodeURIComponent(appBase() + pathWithSearch)}`;

export const redirectToLogin = (pathWithSearch) => {
  window.location.assign(guestLoginUrl(pathWithSearch));
};
