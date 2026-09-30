import ConfirmDialog from '../../components/ConfirmDialog';
import { redirectToLogin } from './guestLogin';

// Shown when a logged-out visitor taps a control that needs an account (the
// remote, skip, remove). Redirecting straight to /login felt like the page
// broke, so they confirm first; cancelling leaves them where they were.
const GuestLoginPrompt = ({ returnTo, onCancel }) => (
  <ConfirmDialog
    title="Log in or sign up to continue"
    message="Controlling playback and the queue needs an account. Log in or sign up and you'll come right back to this page."
    confirmLabel="Log in / Sign up"
    onConfirm={() => redirectToLogin(returnTo)}
    onCancel={onCancel}
  />
);

export default GuestLoginPrompt;
