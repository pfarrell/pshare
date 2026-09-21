import { isJukeboxMode } from '../jukebox/jukeboxMode';

// Google OAuth can't work over the plain-HTTP LAN origin — Google rejects
// redirect URIs pointing at private IPs — so Google entry points are hidden there.
export const isLanAccess = () => window.location.hostname === '172.16.1.10';

// Jukebox Mode's kiosk hardware is touch-primary but wide-screened (a
// 10.1"+ touchscreen) and runs desktop Chromium, so neither the width nor
// the user-agent check below ever fires for it — without this, shared
// components that branch on isMobileDevice() (e.g. PlaylistDrawer's
// draggable={!mobile}, native HTML5 drag reordering that hijacks a touch
// drag meant as a scroll) misclassify it as "desktop."
export const isMobileDevice = () =>
  window.innerWidth <= 768 ||
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  isJukeboxMode();
