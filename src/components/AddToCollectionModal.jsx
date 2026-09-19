// src/components/AddToCollectionModal.jsx
import { apiService } from '../services/api';
import AddToContainerModal from './AddToContainerModal';

const AddToCollectionModal = ({ album, onClose }) => (
  <AddToContainerModal
    subjectTitle={album.title}
    copy={{
      addTitle: 'Add to Collection',
      createTitle: 'Create New Collection',
      filterPlaceholder: 'Filter collections...',
      loading: 'Loading collections...',
      empty: 'No collections found',
      unnamed: '(Unnamed Collection)',
      nameLabel: 'Collection Name',
      namePlaceholder: 'Enter collection name',
      createButton: 'Create & Add Album',
      addButton: 'Add to Collection',
      enterName: 'Please enter a collection name',
      selectOne: 'Please select a collection',
      loadFailed: 'Failed to load collections',
      addFailed: 'Failed to add to collection',
      createFailed: 'Failed to create collection',
      duplicateNameMessage: (name) => `A collection named "${name}" already exists. Add album to it?`,
    }}
    loadItems={() => apiService.getCollections().then((response) => response.data)}
    createAndAdd={async (name) => {
      const response = await apiService.createCollection(name);
      await apiService.addAlbumToCollection(response.data.id, album.id);
    }}
    addItem={(collectionId) => apiService.addAlbumToCollection(collectionId, album.id)}
    // 409 = already in collection (unique constraint)
    describeAddError={(err, name) => (
      err.response?.status === 409 || err.response?.data?.error?.includes('unique')
        ? `"${album.title}" is already in "${name}"`
        : 'Failed to add to collection'
    )}
    onClose={onClose}
  />
);

export default AddToCollectionModal;
