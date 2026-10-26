// Hands-free "play <type> <name>" commands typed or dictated into the search bar
// (GH #75). Kept separate from SearchBar so other interfaces can reuse it.

import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';

// "play list" is how iOS dictation often hears "playlist".
const COMMAND_RE = /^play\s+(artist|album|collection|playlist|play\s+list)[\s.,!?;:]+(.+)$/i;

// Dictation tends to add a trailing period, and sometimes a comma after the
// command word — strip punctuation only at the ends so names like "AC/DC" survive.
const EDGE_PUNCTUATION_RE = /^[\s.,!?;:]+|[\s.,!?;:]+$/g;

export const parseSearchCommand = (input) => {
  const normalized = (input || '').trim().replace(/\s+/g, ' ');
  const match = COMMAND_RE.exec(normalized);
  if (!match) return null;
  const type = match[1].toLowerCase().replace(/\s+/g, '') === 'playlist' ? 'playlist' : match[1].toLowerCase();
  const query = match[2].replace(EDGE_PUNCTUATION_RE, '');
  if (!query) return null;
  return { type, query };
};

// A command's type can be outranked by other result types, so keep paging
// while the backend says more matches of that type exist — but cap it, since
// a hands-free command shouldn't stall on a long tail of weak matches.
const MAX_PAGES = 5;

const findTopMatch = async ({ type, query }, profileId) => {
  let offset;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await apiService.search(query, offset, profileId);
    const match = (data.results || []).find((r) => r.type === type);
    if (match) return match.data;
    if (page === 0 && !data.resultCounts?.[type]) return null;
    if (!data.hasMore) return null;
    offset = (offset || 0) + (data.pageSize || data.results?.length || 0);
  }
  return null;
};

// Same track sources as each page's Play button (see useQueueActions callers).
const loadTracks = async (type, entity) => {
  switch (type) {
    case 'artist':
    case 'collection':
      return (await apiService.getRandomScopeTracks(type, entity.id)).data.tracks;
    case 'album':
      return (await apiService.getAlbum(entity.id, { summary: false })).data.tracks;
    case 'playlist': {
      const { playlist, tracks } = (await apiService.getPlaylist(entity.id)).data;
      return (tracks || []).map((track) => ({
        ...track,
        source_playlist: { id: playlist.id, name: playlist.name },
      }));
    }
    default:
      return [];
  }
};

// Finds the best match for a parsed command, replaces the queue with it, and
// navigates to its page. Anything that goes wrong — no match, nothing
// playable, a failed request — leaves the queue and page untouched.
export const runSearchCommand = async (command, { profileId = null, navigate } = {}) => {
  const { type } = command;
  let entity;
  let tracks;
  try {
    entity = await findTopMatch(command, profileId);
    tracks = entity ? await loadTracks(type, entity) : [];
  } catch (err) {
    console.error('Search command failed:', err);
    tracks = [];
  }

  if (!tracks?.length) {
    return { status: 'not_found' };
  }

  const { clearPlaylist, addTracks, setQueueSource } = usePlayerStore.getState();
  clearPlaylist();
  addTracks(tracks, false, { flashActivity: true, playImmediately: true });
  setQueueSource({ type, id: entity.id });
  navigate(`/${type}/${entity.id}`);

  return { status: 'playing', type, id: entity.id, name: entity.name ?? entity.title };
};
