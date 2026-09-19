import IframeModal from './IframeModal';

// View-only: unlike OvertoneModal, there's no postMessage bridge here —
// Wikipedia never navigates the parent app, so the iframe just displays.
const WikipediaModal = ({ url, onClose }) => (
  <IframeModal url={url} title="Wikipedia" testId="wikipedia-modal-backdrop" onClose={onClose} />
);

export default WikipediaModal;
