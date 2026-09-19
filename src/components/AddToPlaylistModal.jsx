// src/components/AddToPlaylistModal.jsx
import { apiService } from '../services/api';
import AddToContainerModal from './AddToContainerModal';

const AddToPlaylistModal = ({ track, onClose }) => (
  <AddToContainerModal
    subjectTitle={track.title}
    copy={{
      addTitle: 'Add to Playlist',
      createTitle: 'Create New Playlist',
      filterPlaceholder: 'Filter playlists...',
      loading: 'Loading playlists...',
      empty: 'No playlists found',
      unnamed: '(Unnamed Playlist)',
      nameLabel: 'Playlist Name',
      namePlaceholder: 'Enter playlist name',
      createButton: 'Create & Add Track',
      addButton: 'Add to Playlist',
      enterName: 'Please enter a playlist name',
      selectOne: 'Please select a playlist',
      loadFailed: 'Failed to load playlists',
      addFailed: 'Failed to add track to playlist',
      createFailed: 'Failed to create playlist',
      duplicateNameMessage: (name) => `A playlist named "${name}" already exists. Add track to existing playlist?`,
      alreadyInMessage: (name) => `"${track.title}" is already in "${name}". Add it anyway?`,
    }}
    loadItems={() => apiService.getPlaylists().then((response) => response.data)}
    createAndAdd={async (name) => {
      const response = await apiService.createPlaylist(name);
      await apiService.addTrackToPlaylist(response.data.id, track.id);
    }}
    addItem={(playlistId) => apiService.addTrackToPlaylist(playlistId, track.id)}
    isAlreadyInItem={async (playlistId) => {
      try {
        const response = await apiService.getPlaylist(playlistId);
        return (response.data.tracks || []).some((t) => t.id === track.id);
      } catch (error) {
        console.error('Error checking for duplicate track:', error);
        return false;
      }
    }}
    onClose={onClose}
  />
);

export default AddToPlaylistModal;
