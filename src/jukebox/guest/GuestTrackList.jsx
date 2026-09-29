import { formatDuration } from '../../utils/formatters';
import GuestRow from './GuestRow';
import GuestAddButton from './GuestAddButton';

// Track rows for detail pages. Subtitle is the artist name and duration; both
// are optional. Tracks are nullable-safe: artist/album may be null.
const GuestTrackList = ({ tracks }) => (
  <>
    {(tracks ?? []).filter(Boolean).map((t) => (
      <GuestRow
        key={t.id}
        title={t.title ?? ''}
        subtitle={[t.artist?.name, t.duration ? formatDuration(t.duration) : ''].filter(Boolean).join(' · ')}
        action={<GuestAddButton itemKey={`track-${t.id}`} label={t.title ?? 'track'} trackIds={[t.id]} />}
      />
    ))}
  </>
);

export default GuestTrackList;
