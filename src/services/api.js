// src/services/api.js
import axios from 'axios';

const getBaseURL = () => {
  if (import.meta.env.DEV) {
    return '/api';
  } else {
    return '/pshare/api';
  }
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Enable credentials for httpOnly cookie
api.defaults.withCredentials = true;

// Builds "?a=1&b=2", skipping null/undefined/'' values. Uses
// encodeURIComponent (not URLSearchParams, which encodes spaces as '+')
// so URLs stay byte-identical to the hand-built ones this replaced.
export const qs = (params) => {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

const entityImages = (kind) => ({
  list: (id) => api.get(`/admin/${kind}/${id}/images`),
  add: (id, image_url, image_name, set_primary = false) =>
    api.post(`/admin/${kind}/${id}/images`, { image_url, image_name, set_primary }),
  setPrimary: (id, imgId) => api.patch(`/admin/${kind}/${id}/images/${imgId}/primary`),
  remove: (id, imgId) => api.delete(`/admin/${kind}/${id}/images/${imgId}`),
});

const notes = (kind) => ({
  add: (id, content) => api.post(`/${kind}/${id}/notes`, { content }),
  remove: (id, noteId) => api.delete(`/${kind}/${id}/notes/${noteId}`),
});

const images = { album: entityImages('album'), artist: entityImages('artist') };
const noteApis = { album: notes('album'), collection: notes('collection'), track: notes('track') };

export const apiService = {
  entityImages: images,
  notes: noteApis,

  // Auth
  signup: (username, password, email = null) => api.post('/auth/signup', { username, password, email }),
  login: (username, password) => api.post('/auth/login', { username, password }),
  jukeboxLogin: (username, password, deviceName) => api.post('/auth/jukebox-login', { username, password, deviceName }),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  getGoogleStartUrl: (returnTo = null, intent = null) => {
    const params = new URLSearchParams();
    if (returnTo) params.set('return_to', returnTo);
    if (intent) params.set('intent', intent);
    const qs = params.toString();
    return `${getBaseURL()}/auth/google/start${qs ? `?${qs}` : ''}`;
  },
  disconnectGoogle: () => api.delete('/auth/google/disconnect'),
  getRecallStartUrl: (returnTo = null) => {
    const params = new URLSearchParams();
    if (returnTo) params.set('return_to', returnTo);
    const qs = params.toString();
    return `${getBaseURL()}/auth/recall/connect${qs ? `?${qs}` : ''}`;
  },
  disconnectRecall: () => api.delete('/auth/recall/connect'),
  setPassword: (password) => api.put('/auth/set-password', { password }),
  changePassword: (currentPassword, newPassword) => api.put('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (username) => api.post('/auth/forgot-password', { username }),
  validateResetToken: (token) => api.get(`/auth/reset-password/validate${qs({ token })}`),
  resetPassword: (token, newPassword) => api.post('/auth/reset-password', { token, newPassword }),

  // Artists
  getRandomArtists: (size = 60, tag = null) => api.get(`/artists/random${qs({ size, tag })}`),
  getArtist: (id) => api.get(`/artist/${id}`), // Returns { artist, summary, albums }

  // Albums
  getAlbum: (id) => api.get(`/album/${id}`), // Returns { artist, album, tracks }
  getRandomAlbums: (size = 30, tag = null) => api.get(`/albums/random${qs({ size, tag })}`),
  getRecentAlbums: (size = 20) => api.get(`/albums/recent${qs({ size })}`),
  getAdjacentAlbums: (id, collectionId = null) => api.get(`/album/${id}/adjacent${qs({ collection_id: collectionId })}`), // Returns { prev, next }

  // Tracks
  getTrack: (id) => api.get(`/track/${id}`), // Returns { track }

  // Recall notes
  getRecallConnectUrl: () => `${getBaseURL()}/auth/recall/connect`,
  addAlbumNote: noteApis.album.add,
  deleteAlbumNote: noteApis.album.remove,
  addCollectionNote: noteApis.collection.add,
  deleteCollectionNote: noteApis.collection.remove,
  addTrackNote: noteApis.track.add,
  deleteTrackNote: noteApis.track.remove,
  getTrackNotes: (trackId) => api.get(`/track/${trackId}/notes`),
  getRecallItemUrl: (itemId) => `https://patf.com/recall/items/${itemId}`,

  // Tags
  getTags: () => api.get('/tags'),
  getAlbumTags: (id) => api.get(`/tags/album/${id}`),
  getArtistTags: (id) => api.get(`/tags/artist/${id}`),
  getTagContent: (tagName) => api.get(`/tags/${encodeURIComponent(tagName)}/content`),
  addTagToAlbum: (id, name) => api.post(`/tags/album/${id}`, { name }),
  removeTagFromAlbum: (id, tagName) => api.delete(`/tags/album/${id}/${encodeURIComponent(tagName)}`),
  addTagToArtist: (id, name) => api.post(`/tags/artist/${id}`, { name }),
  removeTagFromArtist: (id, tagName) => api.delete(`/tags/artist/${id}/${encodeURIComponent(tagName)}`),
  setDefaultTag: (tag) => api.put('/auth/default-tag', { tag }),

  // Search
  search: (query, offset) => api.get(`/search${qs({ q: query, offset: offset || undefined })}`),

  // log
  log: (id) => api.get(`/log/${id}`),
  getLogs: (page = 1, limit = 25) => api.get(`/log/admin${qs({ page, limit })}`),

  // Admin
  createArtist: (name) => api.post('/admin/artist', { name }),
  createAlbum: (title, artist_id) => api.post('/admin/album', { title, artist_id }),
  searchAdminArtists: (q) => api.get(`/admin/artists/search${qs({ q })}`),
  searchAdminAlbums: (q) => api.get(`/admin/albums/search${qs({ q })}`),
  getAdminTags: () => api.get('/admin/tags'),
  deleteAdminTag: (id) => api.delete(`/admin/tags/${id}`),
  searchMusicbrainzArtist: (q) => api.get(`/admin/musicbrainz/search-artist${qs({ q })}`),
  searchMusicbrainzRelease: (q) => api.get(`/admin/musicbrainz/search-release${qs({ q })}`),
  updateArtist: (id, data) => api.put(`/admin/artist/${id}`, data),
  deleteArtist: (id) => api.delete(`/admin/artist/${id}`),
  updateAlbum: (id, data) => api.put(`/admin/album/${id}`, data),
  deleteAlbum: (id) => api.delete(`/admin/album/${id}`),
  compareAlbums: (idA, idB) => api.get(`/admin/album/${idA}/compare/${idB}`),
  updateTrack: (id, data) => api.put(`/admin/track/${id}`, data),
  deleteTrack: (id) => api.delete(`/admin/track/${id}`),
  makeTrackSingle: (id) => api.post(`/admin/track/${id}/make-single`),
  searchMusicbrainzRecording: (q, artist) => api.get(`/admin/musicbrainz/search-recording${qs({ q, artist })}`),
  getTrackAdminDetail: (id) => api.get(`/admin/track/${id}`),
  addTrackCollaborator: (trackId, artistId, role) => api.post(`/admin/track/${trackId}/collaborators`, { artist_id: artistId, role }),
  removeTrackCollaborator: (trackId, collaboratorId) => api.delete(`/admin/track/${trackId}/collaborators/${collaboratorId}`),
  updateTrackRecordingMbid: (trackId, musicbrainzRecordingId) => api.put(`/admin/track/${trackId}/recording-mbid`, { musicbrainz_recording_id: musicbrainzRecordingId }),
  getTrackMusicbrainzPreview: (trackId) => api.get(`/admin/track/${trackId}/musicbrainz-preview`),
  moveAlbumToArtist: (id, target_artist_id) => api.post(`/admin/album/${id}/move-to-artist`, { target_artist_id }),
  mergeAlbum: (id, destination_album_id, track_offset) => api.post(`/admin/album/${id}/merge`, { destination_album_id, track_offset }),
  getReprocessPreview: (albumId) => api.get(`/admin/album/${albumId}/reprocess-preview`),
  applyReprocess: (albumId, data) => api.post(`/admin/album/${albumId}/reprocess-apply`, data),
  dismissDuplicate: (kind, entity_a_id, entity_b_id) => api.post('/admin/duplicates/dismiss', { kind, entity_a_id, entity_b_id }),
  getDuplicateAlbums: (page = 1, limit = 25) => api.get(`/admin/duplicates/albums${qs({ page, limit })}`),
  getDuplicateTracks: (page = 1, limit = 25) => api.get(`/admin/duplicates/tracks${qs({ page, limit })}`),
  resolveDuplicateAlbum: (targetId, loserId, trackOffset = 0) => api.post(`/admin/duplicates/albums/${targetId}/resolve`, { loser_id: loserId, track_offset: trackOffset }),
  resolveDuplicateTrack: (targetId, loserId) => api.post(`/admin/duplicates/tracks/${targetId}/resolve`, { loser_id: loserId }),
  getAlbumSecondaryArtists: (id) => api.get(`/admin/album/${id}/artists`),
  addArtistToAlbum: (albumId, artistId, role) => api.post(`/admin/album/${albumId}/artists`, { artist_id: artistId, role }),
  removeArtistFromAlbum: (albumId, artistId) => api.delete(`/admin/album/${albumId}/artists/${artistId}`),
  getArtistSecondaryAlbums: (id) => api.get(`/admin/artist/${id}/albums`),
  addAlbumToArtist: (artistId, albumId, role) => api.post(`/admin/artist/${artistId}/albums`, { album_id: albumId, role }),
  removeAlbumFromArtist: (artistId, albumId) => api.delete(`/admin/artist/${artistId}/albums/${albumId}`),
  getRelatedArtists: (id) => api.get(`/admin/artist/${id}/related`),
  hideArtistRelation: (artistId, relatedId, hidden) => api.patch(`/admin/artist/${artistId}/related/${relatedId}/hide`, { hidden }),
  forceShowArtistRelation: (artistId, relatedId, force_show) => api.patch(`/admin/artist/${artistId}/related/${relatedId}/force-show`, { force_show }),
  previewArtistStubs: (id) => api.get(`/admin/artist/${id}/merge-stubs`),
  mergeArtists: (id, loser_ids) => api.post(`/admin/artist/${id}/merge`, { loser_ids }),
  addRelatedArtist: (artistId, relatedArtistId, kind = 'related') => api.post(`/admin/artist/${artistId}/related`, { related_artist_id: relatedArtistId, kind }),
  removeRelatedArtist: (artistId, relatedArtistId, kind) => api.delete(`/admin/artist/${artistId}/related/${relatedArtistId}`, { params: { kind } }),
  getErrors: (page = 1, limit = 25, source = null) => api.get(`/admin/errors${qs({ page, limit, source })}`),
  dismissError: (id) => api.delete(`/admin/errors/${id}`),
  clearErrors: () => api.delete('/admin/errors'),
  getSignups: (page = 1, limit = 25) => api.get(`/admin/signups${qs({ page, limit })}`),
  getSignupUnseenCount: () => api.get('/admin/signups/unseen-count'),
  markSignupsSeen: () => api.post('/admin/signups/seen'),

  // Upload
  uploadTracks: (formData) => api.post('/admin/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getUploadStatus: () => api.get('/admin/upload/status'),
  getRecentUploads: (limit = 50) => api.get(`/admin/upload/recent${qs({ limit })}`),
  retryUpload: (id) => api.post(`/admin/upload/${id}/retry`),
  dismissUpload: (id) => api.delete(`/admin/upload/${id}`),
  clearFailedUploads: () => api.delete('/admin/upload/failed'),

  // Playlists
  getPlaylists: () => api.get('/playlists'),
  getPlaylist: (id) => api.get(`/playlist/${id}`),
  createPlaylist: (name, trackIds) => api.post('/playlists', { name, track_ids: trackIds }),
  addTrackToPlaylist: (playlistId, trackId) => api.post(`/playlist/${playlistId}/tracks`, { track_id: trackId }),
  removeTrackFromPlaylist: (playlistId, trackId) => api.delete(`/playlist/${playlistId}/tracks/${trackId}`),
  reorderPlaylistTracks: (playlistId, track_orders) => api.patch(`/playlist/${playlistId}/tracks/reorder`, { track_orders }),
  updatePlaylist: (id, data) => api.put(`/playlist/${id}`, data),
  downloadPlaylistImage: (id, image_url, image_name) => api.post(`/admin/playlist/${id}/image`, { image_url, image_name }),

  // Collections
  getCollections: () => api.get('/collections'),
  getCollection: (id) => api.get(`/collection/${id}`),
  createCollection: (name) => api.post('/collections', { name }),
  updateCollection: (id, data) => api.put(`/collection/${id}`, data),
  deleteCollection: (id) => api.delete(`/collection/${id}`),
  addAlbumToCollection: (collectionId, albumId) => api.post(`/collection/${collectionId}/albums`, { album_id: albumId }),
  addStubToCollection: (collectionId, title, artist_name) =>
    api.post(`/collection/${collectionId}/stubs`, { title, artist_name }),
  removeAlbumFromCollection: (collectionId, albumId) => api.delete(`/collection/${collectionId}/albums/${albumId}`),
  removeStubFromCollection: (collectionId, stubId) =>
    api.delete(`/collection/${collectionId}/stubs/${stubId}`),
  reorderCollectionAlbums: (collectionId, album_orders, stub_orders = []) =>
    api.patch(`/collection/${collectionId}/albums/reorder`, { album_orders, stub_orders }),
  resolveStub: (collectionId, stubId, albumId) =>
    api.post(`/collection/${collectionId}/stubs/${stubId}/resolve`, { album_id: albumId }),
  downloadCollectionImage: (id, image_url, image_name) => api.post(`/admin/collection/${id}/image`, { image_url, image_name }),

  // Shuffle scope — dispatches to the right entity's random-tracks endpoint. Used by
  // useQueueActions' play() (Artist/Collection), playerStore's enterScopeShuffle, and
  // usePlayerEngine's top-up and queue-exhaustion effects.
  getRandomScopeTracks: (type, id, { limit = 25, excludeTrackIds = [] } = {}) => {
    const path = type === 'artist' ? `/artist/${id}/tracks/random` : `/collection/${id}/tracks/random`;
    return api.post(path, { limit, excludeTrackIds });
  },

  // Favorites
  getFavorites: (kind = null) => api.get(`/favorites${qs({ kind })}`),
  addFavorite: (kind, target_id) => api.post('/favorites', { kind, target_id }),
  removeFavorite: (kind, target_id) => api.delete('/favorites', { data: { kind, target_id } }),

  // Image management
  getAlbumImages: images.album.list,
  addAlbumImage: images.album.add,
  setAlbumImagePrimary: images.album.setPrimary,
  deleteAlbumImage: images.album.remove,

  getArtistImages: images.artist.list,
  addArtistImage: images.artist.add,
  setArtistImagePrimary: images.artist.setPrimary,
  deleteArtistImage: images.artist.remove,

  // Image URL helpers
  getImageUrl: (imagePath, context = 'base') => {
    if (!imagePath) return null;

    const baseUrl = import.meta.env.DEV ? '/images' : 'https://patf.net/images';

    switch (context) {
      case 'artist_search':
        return `${baseUrl}/artists/sm/${imagePath}`;
      case 'artist_page':
        return `${baseUrl}/artists/${imagePath}`;
      case 'album_small':
        return `${baseUrl}/albums/sm/${imagePath}`;
      case 'album_page':
        return `${baseUrl}/albums/${imagePath}`;
      case 'base':
      default:
        return `${baseUrl}/${imagePath}`;
    }
  }
};

export default api;
