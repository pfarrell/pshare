// Whether this session can play Spotify in-page: the effective owner is allowlisted and
// connected, the page is a secure context (EME needs one), and it isn't iOS (no Web Playback
// SDK support there).
export const canPlaySpotify = ({ status, isSecureContext, isIOS }) =>
  !!status?.allowed && !!status?.connected && !!isSecureContext && !isIOS;
