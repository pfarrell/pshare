import IframeModal from './IframeModal';

// View-only, like WikipediaModal: musicbrainz.org never navigates the parent
// app, so the iframe just displays.
const MusicBrainzModal = ({ url, onClose }) => (
  <IframeModal url={url} title="MusicBrainz" testId="musicbrainz-modal-backdrop" onClose={onClose} />
);

export default MusicBrainzModal;
