// Shared by every jukebox remote UI (the main app's menu row and the guest
// app's bar): what to tell the user when a command doesn't go through.
export const REMOTE_STATUS_MESSAGES = {
  401: 'Log in again to control the jukebox',
  404: 'This jukebox link has expired. Scan its QR code again',
  409: 'The jukebox is not connected',
  429: 'Slow down, try again in a moment',
};

export const remoteErrorMessage = (err) =>
  REMOTE_STATUS_MESSAGES[err?.response?.status] ?? 'Could not reach the jukebox';
