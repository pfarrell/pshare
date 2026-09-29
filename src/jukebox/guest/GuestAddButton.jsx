import { apiService } from '../../services/api';
import { useGuest } from './GuestContext';

const BIG_ADD = 25;
const SHUFFLE_KINDS = ['artist', 'collection'];

const label = (variant, { state, count }, shuffle) => {
  const all = variant === 'all';
  switch (state) {
    case 'adding': return count > BIG_ADD ? `Adding ${count} tracks...` : '...';
    case 'added': return all ? 'Added' : '✓';
    case 'slow': return 'Slow down, try again in a moment';
    case 'empty': return 'Nothing to add';
    case 'error': return all ? 'Try again' : '!';
    default: return all ? (shuffle ? 'Shuffle' : 'Add all') : '+';
  }
};

const GuestAddButton = ({ itemKey, label: name, trackIds, kind, id, variant = 'icon' }) => {
  const { token, enqueue, statusFor } = useGuest();
  const status = statusFor(itemKey);
  // Artists and collections can be huge (a collection may hold 140+ albums),
  // so they shuffle a random batch, like the kiosk's "Shuffle All".
  const shuffle = !trackIds && SHUFFLE_KINDS.includes(kind);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const fetchIds = shuffle ? apiService.guestRandomTracks : apiService.guestTrackIds;
    const source = trackIds ?? (() => fetchIds(token, kind, id).then((res) => res.data?.trackIds ?? []));
    enqueue(itemKey, source);
  };

  return (
    <button
      type="button"
      className={`jukebox-guest-add jukebox-guest-add-${variant} jukebox-guest-add-${status.state}`}
      aria-label={shuffle ? `Add random tracks from ${name}` : `Add ${name} to queue`}
      disabled={status.state === 'adding'}
      onClick={handleClick}
    >
      {label(variant, status, shuffle)}
    </button>
  );
};

export default GuestAddButton;
