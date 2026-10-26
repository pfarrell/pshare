import { usePlayerStore, MAX_QUEUE_HISTORY } from './playerStore';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiService } from '../services/api';
import { markIncomingAudible } from '../player/spotify/transitionTimer';

vi.mock('../services/api', () => ({
  apiService: {
    getRandomScopeTracks: vi.fn(),
  },
}));

const track = (id, overrides = {}) => ({ id, title: `Track ${id}`, url: `/stream/${id}`, duration: 180, artist: { name: 'A' }, ...overrides });

const mockAudioElement = () => ({
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  load: vi.fn(),
  paused: true,
  src: '',
  currentTime: 0,
  duration: 0,
  readyState: 0,
});

const setActiveAudio = (audioElement, overrides = {}) =>
  usePlayerStore.setState({ audioElementA: audioElement, audioElementB: mockAudioElement(), activeSlot: 'a', ...overrides });

beforeEach(() => {
  apiService.getRandomScopeTracks.mockReset();
  usePlayerStore.setState({
    audioElementA: null,
    audioElementB: null,
    activeSlot: 'a',
    playlist: [],
    currentTrackIndex: -1,
    currentTrack: null,
    isPlaying: false,
    isBuffering: false,
    currentTime: 0,
    duration: 0,
    playlistFinished: false,
    nextTrackIndex: -1,
    playbackMode: 'off',
    shuffleHistory: [],
    drawerOpen: false,
    activityPulseToken: 0,
    recentlyAddedIndices: [],
    standbyUnlocked: false,
    pageTracks: [],
    queueSource: null,
  });
});

describe('playTrackAtIndex', () => {
  test('sets currentTrack/currentTrackIndex and loads the audio element', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1), track(2)] });
    usePlayerStore.getState().playTrackAtIndex(1);
    const state = usePlayerStore.getState();
    expect(state.currentTrackIndex).toBe(1);
    expect(state.currentTrack.id).toBe(2);
    expect(audioElement.src).toBe('/stream/2');
    expect(audioElement.load).toHaveBeenCalled();
    expect(audioElement.play).toHaveBeenCalled();
  });

  test('does nothing for an out-of-range index', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1)] });
    usePlayerStore.getState().playTrackAtIndex(5);
    expect(usePlayerStore.getState().currentTrackIndex).toBe(-1);
    expect(audioElement.load).not.toHaveBeenCalled();
  });

  test('sets isPlaying optimistically, without waiting for the audio element\'s async "play" event', () => {
    // usePlayerEngine only flips isPlaying via the <audio> element's native
    // 'play' event, which fires asynchronously (after network buffering) — not
    // simulated by this mock. addTrack/addTracks read isPlaying synchronously
    // right after this call to decide whether to auto-start a newly queued
    // track, so it must already be true here, not just once the real event
    // eventually fires.
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1)], isPlaying: false });
    usePlayerStore.getState().playTrackAtIndex(0);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  test('reverts isPlaying if play() actually fails', async () => {
    const audioElement = mockAudioElement();
    audioElement.play = vi.fn().mockRejectedValue(new Error('boom'));
    setActiveAudio(audioElement, { playlist: [track(1)], isPlaying: false });
    usePlayerStore.getState().playTrackAtIndex(0);
    expect(usePlayerStore.getState().isPlaying).toBe(true); // optimistic, before the rejection resolves
    await Promise.resolve().then().catch(() => {}); // let the play() rejection's .catch() run
    await new Promise((r) => setTimeout(r, 0));
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  test('a failed play() does not clobber isPlaying if a newer playTrackAtIndex call already superseded it', async () => {
    const audioElement = mockAudioElement();
    let rejectFirst;
    audioElement.play = vi.fn()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValueOnce(undefined);
    setActiveAudio(audioElement, { playlist: [track(1), track(2)], isPlaying: false });
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().playTrackAtIndex(1); // supersedes the first attempt before it rejects
    rejectFirst(new Error('boom'));
    await new Promise((r) => setTimeout(r, 0));
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1);
    expect(usePlayerStore.getState().isPlaying).toBe(true); // not stomped by the first attempt's failure
  });
});

describe('addTrack', () => {
  test('appends the track and starts playback when nothing is playing', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [], isPlaying: false });
    usePlayerStore.getState().addTrack(track(1));
    const state = usePlayerStore.getState();
    expect(state.playlist).toHaveLength(1);
    expect(state.currentTrackIndex).toBe(0);
    expect(audioElement.play).toHaveBeenCalled();
  });

  test('appends without starting playback when something is already playing', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1)], currentTrackIndex: 0, isPlaying: true });
    usePlayerStore.getState().addTrack(track(2));
    const state = usePlayerStore.getState();
    expect(state.playlist).toHaveLength(2);
    expect(state.currentTrackIndex).toBe(0); // unchanged
    expect(audioElement.play).not.toHaveBeenCalled();
  });

  test('throws on a track missing title or url', () => {
    expect(() => usePlayerStore.getState().addTrack({ id: 1 })).toThrow(/Invalid track/);
  });

  test('addTrack accepts a Spotify entry without url', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1)], currentTrackIndex: 0, isPlaying: true });
    usePlayerStore.getState().addTrack({ source: 'spotify', title: 'S', uri: 'spotify:track:x' });
    expect(usePlayerStore.getState().playlist).toHaveLength(2);
  });

  test('addTrack still rejects a local track without url', () => {
    expect(() => usePlayerStore.getState().addTrack({ id: 1, title: 'No url' })).toThrow(/Invalid track/);
    expect(() => usePlayerStore.getState().addTrack({ source: 'spotify', title: 'No uri' })).toThrow(/Invalid track/);
  });

  test('flashActivity bumps activityPulseToken', () => {
    setActiveAudio(mockAudioElement());
    usePlayerStore.getState().addTrack(track(1), { flashActivity: true });
    expect(usePlayerStore.getState().activityPulseToken).toBe(1);
  });

  test('regression: enqueuing a second track right after a first was started (before its real "play" event fires) queues behind it instead of interrupting it', () => {
    // Reproduces the jukebox-mode demo bug: playTrackAtIndex(0) already ran
    // (isPlaying is true optimistically per the fix above) but the mock never
    // fires a native 'play' event, matching the real async gap where a track
    // is genuinely playing before usePlayerEngine's handler would confirm it.
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1)], isPlaying: false });
    usePlayerStore.getState().playTrackAtIndex(0); // "Play album" style start
    audioElement.play.mockClear();

    usePlayerStore.getState().addTrack(track(2)); // tap a second, different track
    const state = usePlayerStore.getState();
    expect(state.playlist.map((t) => t.id)).toEqual([1, 2]);
    expect(state.currentTrackIndex).toBe(0); // still on track 1 — not jumped to track 2
    expect(audioElement.play).not.toHaveBeenCalled(); // track 1 was not interrupted
  });

  test('playImmediately appends and jumps to the new track even while something else is playing', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1)], currentTrackIndex: 0, isPlaying: true });
    usePlayerStore.getState().addTrack(track(2), { playImmediately: true });
    const state = usePlayerStore.getState();
    expect(state.playlist.map((t) => t.id)).toEqual([1, 2]);
    expect(state.currentTrackIndex).toBe(1);
    expect(audioElement.src).toBe('/stream/2');
    expect(audioElement.play).toHaveBeenCalled();
  });
});

describe('addTracks', () => {
  test('regression (fa854a2/fe75093): auto-plays the first track of a multi-track add at its real index when paused, even with an existing playlist', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, {
      playlist: [track(101), track(102)],
      currentTrackIndex: 0,
      isPlaying: false,
    });
    usePlayerStore.getState().addTracks([track(201), track(202)], false, { flashActivity: true });
    const state = usePlayerStore.getState();
    expect(state.playlist).toHaveLength(4);
    // First newly-added track is at index 2 (the real index), not 0 or -1.
    expect(state.currentTrackIndex).toBe(2);
    expect(audioElement.src).toBe('/stream/201');
  });

  test('playNext=true inserts immediately after the current track', () => {
    setActiveAudio(mockAudioElement(), {
      playlist: [track(1), track(2), track(3)],
      currentTrackIndex: 0,
      isPlaying: true,
    });
    usePlayerStore.getState().addTracks([track(99)], true);
    const ids = usePlayerStore.getState().playlist.map((t) => t.id);
    expect(ids).toEqual([1, 99, 2, 3]);
  });

  test('throws if tracks is not an array', () => {
    expect(() => usePlayerStore.getState().addTracks('nope')).toThrow(/must be provided as an array/);
  });

  test('shuffle mode: auto-starting a fresh queue picks a random track instead of track 0', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    setActiveAudio(mockAudioElement(), {
      playlist: [],
      currentTrackIndex: -1,
      isPlaying: false,
      playbackMode: 'shuffle',
    });
    usePlayerStore.getState().addTracks([track(1), track(2), track(3), track(4), track(5)]);
    const state = usePlayerStore.getState();
    expect(state.currentTrackIndex).toBe(4); // Math.floor(0.99 * 5)
    expect(state.shuffleHistory).toEqual([4]);
    randomSpy.mockRestore();
  });

  test('non-shuffle modes still auto-start at the deterministic start index', () => {
    setActiveAudio(mockAudioElement(), {
      playlist: [],
      currentTrackIndex: -1,
      isPlaying: false,
      playbackMode: 'off',
    });
    usePlayerStore.getState().addTracks([track(1), track(2), track(3)]);
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0);
  });

  test('playImmediately appends the batch to the end of an existing, currently-playing queue and jumps to the first newly-added track', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, {
      playlist: [track(1), track(2)],
      currentTrackIndex: 0,
      isPlaying: true,
    });
    usePlayerStore.getState().addTracks([track(3), track(4)], false, { playImmediately: true });
    const state = usePlayerStore.getState();
    expect(state.playlist.map((t) => t.id)).toEqual([1, 2, 3, 4]);
    expect(state.currentTrackIndex).toBe(2);
    expect(audioElement.src).toBe('/stream/3');
  });

  test('playImmediately ignores shuffle-idle-random-start and jumps deterministically to the first new track', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    setActiveAudio(mockAudioElement(), {
      playlist: [],
      currentTrackIndex: -1,
      isPlaying: false,
      playbackMode: 'shuffle',
    });
    usePlayerStore.getState().addTracks([track(1), track(2), track(3)], false, { playImmediately: true });
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0);
    randomSpy.mockRestore();
  });
});

describe('recentlyAddedIndices', () => {
  test('addTrack with flashActivity records the new entry\'s playlist position, not its id', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(99), track(98)] });
    usePlayerStore.getState().addTrack(track(5), { flashActivity: true });
    expect(usePlayerStore.getState().recentlyAddedIndices).toEqual([2]);
  });

  test('addTrack without flashActivity does not touch recentlyAddedIndices', () => {
    setActiveAudio(mockAudioElement(), { recentlyAddedIndices: [99] });
    usePlayerStore.getState().addTrack(track(1));
    expect(usePlayerStore.getState().recentlyAddedIndices).toEqual([99]);
  });

  test('a second flashActivity add replaces the previous batch instead of accumulating', () => {
    // Regression: queue track 2 (flash), then queue tracks 7/8 (flash) before
    // ever opening the drawer — only 7/8 (the latest batch) should remain
    // marked; track 2's earlier position should no longer be flagged even
    // though it was never seen.
    setActiveAudio(mockAudioElement(), {
      playlist: [track(1), track(2)],
      currentTrackIndex: 0,
      isPlaying: true,
      recentlyAddedIndices: [1],
    });
    usePlayerStore.getState().addTracks([track(7), track(8)], false, { flashActivity: true });
    expect(usePlayerStore.getState().recentlyAddedIndices).toEqual([2, 3]);
  });

  test('regression: queueing a track whose id already exists elsewhere in the playlist only marks the new occurrence', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(5)], isPlaying: true });
    usePlayerStore.getState().addTrack(track(5), { flashActivity: true });
    expect(usePlayerStore.getState().playlist).toHaveLength(2);
    expect(usePlayerStore.getState().recentlyAddedIndices).toEqual([1]);
  });

  test('clearRecentlyAdded resets the list to empty', () => {
    usePlayerStore.setState({ recentlyAddedIndices: [1, 2] });
    usePlayerStore.getState().clearRecentlyAdded();
    expect(usePlayerStore.getState().recentlyAddedIndices).toEqual([]);
  });
});

describe('removeTrackFromPlaylist', () => {
  test('refuses to remove the currently playing track', () => {
    usePlayerStore.setState({ playlist: [track(1), track(2)], currentTrackIndex: 0 });
    usePlayerStore.getState().removeTrackFromPlaylist(0);
    expect(usePlayerStore.getState().playlist).toHaveLength(2);
  });

  test('removing a track before the current one decrements currentTrackIndex', () => {
    usePlayerStore.setState({ playlist: [track(1), track(2), track(3)], currentTrackIndex: 2 });
    usePlayerStore.getState().removeTrackFromPlaylist(0);
    const state = usePlayerStore.getState();
    expect(state.playlist.map((t) => t.id)).toEqual([2, 3]);
    expect(state.currentTrackIndex).toBe(1);
  });

  test('removing the last track resets playback state', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1)], currentTrackIndex: -1 });
    usePlayerStore.getState().removeTrackFromPlaylist(0);
    const state = usePlayerStore.getState();
    expect(state.playlist).toHaveLength(0);
    expect(state.currentTrackIndex).toBe(-1);
    expect(audioElement.pause).toHaveBeenCalled();
  });
});

describe('reorderPlaylist', () => {
  test('moves a track and keeps currentTrackIndex pointing at the same track', () => {
    usePlayerStore.setState({ playlist: [track(1), track(2), track(3)], currentTrackIndex: 2 });
    usePlayerStore.getState().reorderPlaylist(0, 2); // move track 1 to index 2
    const state = usePlayerStore.getState();
    expect(state.playlist.map((t) => t.id)).toEqual([2, 1, 3]);
    expect(state.currentTrackIndex).toBe(2); // track 3 is at index 2 in [2,1,3]
  });
});

describe('playNext / playback modes', () => {
  test('non-shuffle: advances to the next index', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1), track(2)], currentTrackIndex: 0, nextTrackIndex: 1 });
    usePlayerStore.getState().playNext();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1);
  });

  test('non-shuffle: marks playlistFinished and pauses on the last track', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1), track(2)], currentTrackIndex: 1 });
    usePlayerStore.getState().playNext();
    const state = usePlayerStore.getState();
    expect(state.playlistFinished).toBe(true);
    expect(audioElement.pause).toHaveBeenCalled();
  });

  test('cyclePlaybackMode advances off -> shuffle -> repeat-all -> repeat-one -> off', () => {
    usePlayerStore.setState({ playbackMode: 'off' });
    const modes = [];
    for (let i = 0; i < 4; i++) {
      usePlayerStore.getState().cyclePlaybackMode();
      modes.push(usePlayerStore.getState().playbackMode);
    }
    expect(modes).toEqual(['shuffle', 'repeat-all', 'repeat-one', 'off']);
  });

  test('cyclePlaybackMode inserts shuffle-scope when queueSource is a collection', () => {
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [] } });
    usePlayerStore.setState({ playbackMode: 'off', queueSource: { type: 'collection', id: 7 } });
    const modes = [];
    for (let i = 0; i < 5; i++) {
      usePlayerStore.getState().cyclePlaybackMode();
      modes.push(usePlayerStore.getState().playbackMode);
    }
    expect(modes).toEqual(['shuffle-scope', 'shuffle', 'repeat-all', 'repeat-one', 'off']);
  });

  test('cyclePlaybackMode inserts shuffle-scope when queueSource is an artist', () => {
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [] } });
    usePlayerStore.setState({ playbackMode: 'off', queueSource: { type: 'artist', id: 3 } });
    const modes = [];
    for (let i = 0; i < 5; i++) {
      usePlayerStore.getState().cyclePlaybackMode();
      modes.push(usePlayerStore.getState().playbackMode);
    }
    expect(modes).toEqual(['shuffle-scope', 'shuffle', 'repeat-all', 'repeat-one', 'off']);
  });

  test('cyclePlaybackMode does NOT insert shuffle-scope when queueSource is an album or playlist', () => {
    usePlayerStore.setState({ playbackMode: 'off', queueSource: { type: 'album', id: 42 } });
    const modes = [];
    for (let i = 0; i < 4; i++) {
      usePlayerStore.getState().cyclePlaybackMode();
      modes.push(usePlayerStore.getState().playbackMode);
    }
    expect(modes).toEqual(['shuffle', 'repeat-all', 'repeat-one', 'off']);
  });

  test('shuffle-scope: advances linearly through the queue', () => {
    setActiveAudio(mockAudioElement(), {
      playlist: [track(1), track(2)],
      currentTrackIndex: 0,
      nextTrackIndex: 1,
      playbackMode: 'shuffle-scope',
    });
    usePlayerStore.getState().playNext();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1);
  });

  test('shuffle-scope: marks playlistFinished and pauses once the queue runs out', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1), track(2)], currentTrackIndex: 1, playbackMode: 'shuffle-scope' });
    usePlayerStore.getState().playNext();
    const state = usePlayerStore.getState();
    expect(state.playlistFinished).toBe(true);
    expect(audioElement.pause).toHaveBeenCalled();
  });

  test('entering shuffle mode does not interrupt the currently playing track', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1), track(2), track(3)], currentTrackIndex: 1 });
    usePlayerStore.getState().cyclePlaybackMode();
    const state = usePlayerStore.getState();
    expect(state.playbackMode).toBe('shuffle');
    expect(state.currentTrackIndex).toBe(1);
    expect(state.shuffleHistory).toEqual([1]);
  });

  test('repeat-all wraps from the last track back to index 0', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1), track(2)], currentTrackIndex: 1, playbackMode: 'repeat-all', nextTrackIndex: 0 });
    usePlayerStore.getState().playNext();
    const state = usePlayerStore.getState();
    expect(state.currentTrackIndex).toBe(0);
    expect(state.playlistFinished).toBe(false);
  });

  test('repeat-one replays the same track on auto-advance', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1), track(2)], currentTrackIndex: 0, playbackMode: 'repeat-one', nextTrackIndex: 0 });
    usePlayerStore.getState().playNext();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0);
  });

  test('repeat-one: a manual Next still advances to the real next track', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1), track(2), track(3)], currentTrackIndex: 0, playbackMode: 'repeat-one', nextTrackIndex: 0 });
    usePlayerStore.getState().playNext({ manual: true });
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1);
  });

  test('repeat-one: auto-advance (no manual flag) still replays even though a real next track exists', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1), track(2), track(3)], currentTrackIndex: 0, playbackMode: 'repeat-one', nextTrackIndex: 0 });
    usePlayerStore.getState().playNext();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0);
  });

  test('playPrev() on an empty playlist does not throw and leaves state sane', () => {
    setActiveAudio(mockAudioElement(), { playlist: [], currentTrackIndex: -1 });
    expect(() => usePlayerStore.getState().playPrev()).not.toThrow();
    const state = usePlayerStore.getState();
    expect(state.currentTrackIndex).toBe(-1);
    expect(state.playlist).toHaveLength(0);
  });
});

describe('playPrev restart threshold', () => {
  test('more than 3s into the track restarts it instead of moving to the previous track, while playing', () => {
    const audioElement = mockAudioElement();
    audioElement.paused = false;
    setActiveAudio(audioElement, { playlist: [track(1), track(2)], currentTrackIndex: 1, currentTime: 3.5 });
    usePlayerStore.getState().playPrev();
    const state = usePlayerStore.getState();
    expect(state.currentTrackIndex).toBe(1);
    expect(audioElement.currentTime).toBe(0);
  });

  test('more than 3s into the track restarts it instead of moving to the previous track, while paused', () => {
    const audioElement = mockAudioElement();
    audioElement.paused = true;
    setActiveAudio(audioElement, { playlist: [track(1), track(2)], currentTrackIndex: 1, currentTime: 10 });
    usePlayerStore.getState().playPrev();
    const state = usePlayerStore.getState();
    expect(state.currentTrackIndex).toBe(1);
    expect(audioElement.currentTime).toBe(0);
  });

  test('3s or less into the track moves to the previous track as before', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1), track(2)], currentTrackIndex: 1, currentTime: 3 });
    usePlayerStore.getState().playPrev();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0);
  });

  test('restarting the track leaves shuffle history untouched', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, {
      playlist: [track(1), track(2), track(3)],
      currentTrackIndex: 2,
      currentTime: 8,
      playbackMode: 'shuffle',
      shuffleHistory: [0, 2],
    });
    usePlayerStore.getState().playPrev();
    expect(usePlayerStore.getState().shuffleHistory).toEqual([0, 2]);
  });
});

describe('clearPlaylist', () => {
  test('resets all playback state and stops the audio element', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1)], currentTrackIndex: 0, currentTrack: track(1), isPlaying: true });
    usePlayerStore.getState().clearPlaylist();
    const state = usePlayerStore.getState();
    expect(state.playlist).toEqual([]);
    expect(state.currentTrackIndex).toBe(-1);
    expect(state.currentTrack).toBeNull();
    expect(audioElement.pause).toHaveBeenCalled();
  });
});

describe('setPlaylist', () => {
  test('replaces the queue and starts playing the first track', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [track(1)], currentTrackIndex: 0, isPlaying: true });
    usePlayerStore.getState().setPlaylist([track(9), track(10)]);
    const state = usePlayerStore.getState();
    expect(state.playlist.map((t) => t.id)).toEqual([9, 10]);
    expect(state.currentTrackIndex).toBe(0);
  });
});

describe('nextTrackIndex', () => {
  test('points at the following index in a non-shuffle playlist', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1), track(2), track(3)] });
    usePlayerStore.getState().playTrackAtIndex(0);
    expect(usePlayerStore.getState().nextTrackIndex).toBe(1);
  });

  test('is -1 on the last track', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1), track(2)] });
    usePlayerStore.getState().playTrackAtIndex(1);
    expect(usePlayerStore.getState().nextTrackIndex).toBe(-1);
  });

  test('is -1 on an empty playlist', () => {
    setActiveAudio(mockAudioElement(), { playlist: [] });
    usePlayerStore.getState().syncNextTrackIndex();
    expect(usePlayerStore.getState().nextTrackIndex).toBe(-1);
  });

  test('in shuffle mode, excludes everything already in shuffleHistory', () => {
    setActiveAudio(mockAudioElement(), {
      playlist: [track(1), track(2), track(3)],
      currentTrackIndex: 0,
      playbackMode: 'shuffle',
      shuffleHistory: [0],
    });
    usePlayerStore.getState().syncNextTrackIndex();
    expect([1, 2]).toContain(usePlayerStore.getState().nextTrackIndex);
  });

  test('in shuffle mode, is -1 once every track is in shuffleHistory', () => {
    usePlayerStore.setState({
      playlist: [track(1), track(2)],
      playbackMode: 'shuffle',
      shuffleHistory: [0, 1],
    });
    usePlayerStore.getState().syncNextTrackIndex();
    expect(usePlayerStore.getState().nextTrackIndex).toBe(-1);
  });

  test('playNext in shuffle mode advances to the precomputed nextTrackIndex, not a freshly-rolled one', () => {
    setActiveAudio(mockAudioElement(), {
      playlist: [track(1), track(2), track(3)],
      currentTrackIndex: 0,
      playbackMode: 'shuffle',
      shuffleHistory: [0],
      nextTrackIndex: 2,
    });
    usePlayerStore.getState().playNext();
    const state = usePlayerStore.getState();
    expect(state.currentTrackIndex).toBe(2);
    expect(state.shuffleHistory).toEqual([0, 2]);
  });

  test('repeat-all: nextTrackIndex wraps to 0 on the last track', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1), track(2)], playbackMode: 'repeat-all' });
    usePlayerStore.getState().playTrackAtIndex(1);
    expect(usePlayerStore.getState().nextTrackIndex).toBe(0);
  });

  test('repeat-one: nextTrackIndex is always the current index', () => {
    setActiveAudio(mockAudioElement(), { playlist: [track(1), track(2), track(3)], playbackMode: 'repeat-one' });
    usePlayerStore.getState().playTrackAtIndex(1);
    expect(usePlayerStore.getState().nextTrackIndex).toBe(1);
  });
});

describe('getActiveAudio / getStandbyAudio', () => {
  test('resolves slot A as active by default', () => {
    const a = mockAudioElement();
    const b = mockAudioElement();
    usePlayerStore.setState({ audioElementA: a, audioElementB: b, activeSlot: 'a' });
    expect(usePlayerStore.getState().getActiveAudio()).toBe(a);
    expect(usePlayerStore.getState().getStandbyAudio()).toBe(b);
  });

  test('resolves slot B as active when activeSlot is b', () => {
    const a = mockAudioElement();
    const b = mockAudioElement();
    usePlayerStore.setState({ audioElementA: a, audioElementB: b, activeSlot: 'b' });
    expect(usePlayerStore.getState().getActiveAudio()).toBe(b);
    expect(usePlayerStore.getState().getStandbyAudio()).toBe(a);
  });

  test('setAudioElement assigns into the given slot', () => {
    const a = mockAudioElement();
    usePlayerStore.getState().setAudioElement('a', a);
    expect(usePlayerStore.getState().audioElementA).toBe(a);
    const b = mockAudioElement();
    usePlayerStore.getState().setAudioElement('b', b);
    expect(usePlayerStore.getState().audioElementB).toBe(b);
  });
});

describe('ensureStandbyLoaded', () => {
  test('loads the standby element with the next track when it differs from what is already loaded', () => {
    const standby = mockAudioElement();
    usePlayerStore.setState({
      audioElementA: mockAudioElement(), audioElementB: standby, activeSlot: 'a',
      playlist: [track(1), track(2)], nextTrackIndex: 1,
    });
    usePlayerStore.getState().ensureStandbyLoaded();
    expect(standby.src).toBe('/stream/2');
    expect(standby.load).toHaveBeenCalled();
  });

  test('does nothing if the standby element is already loaded with that track', () => {
    const standby = mockAudioElement();
    standby.src = '/stream/2';
    usePlayerStore.setState({
      audioElementA: mockAudioElement(), audioElementB: standby, activeSlot: 'a',
      playlist: [track(1), track(2)], nextTrackIndex: 1,
    });
    usePlayerStore.getState().ensureStandbyLoaded();
    expect(standby.load).not.toHaveBeenCalled();
  });

  test('does nothing when there is no next track', () => {
    const standby = mockAudioElement();
    usePlayerStore.setState({
      audioElementA: mockAudioElement(), audioElementB: standby, activeSlot: 'a',
      playlist: [track(1)], nextTrackIndex: -1,
    });
    usePlayerStore.getState().ensureStandbyLoaded();
    expect(standby.load).not.toHaveBeenCalled();
  });
});

describe('playNext gapless handoff', () => {
  test('flips activeSlot and plays the standby element directly when it is already loaded and ready', () => {
    const active = mockAudioElement();
    const standby = mockAudioElement();
    standby.src = '/stream/2';
    standby.readyState = 3;
    usePlayerStore.setState({
      audioElementA: active, audioElementB: standby, activeSlot: 'a',
      playlist: [track(1), track(2)], currentTrackIndex: 0, nextTrackIndex: 1,
    });
    usePlayerStore.getState().playNext();
    const state = usePlayerStore.getState();
    expect(state.activeSlot).toBe('b');
    expect(state.currentTrackIndex).toBe(1);
    expect(state.currentTrack.id).toBe(2);
    expect(standby.play).toHaveBeenCalled();
    expect(standby.load).not.toHaveBeenCalled(); // no reload — that's the whole point
  });

  test('resets duration and currentTime to the standby track values on handoff', () => {
    const active = mockAudioElement();
    const standby = mockAudioElement();
    standby.src = '/stream/2';
    standby.readyState = 3;
    standby.duration = 200;
    usePlayerStore.setState({
      audioElementA: active, audioElementB: standby, activeSlot: 'a',
      playlist: [track(1), track(2)], currentTrackIndex: 0, nextTrackIndex: 1,
      duration: 180, currentTime: 170,
    });
    usePlayerStore.getState().playNext();
    const state = usePlayerStore.getState();
    expect(state.duration).toBe(200);
    expect(state.currentTime).toBe(0);
  });

  test('falls back to a normal load on the active element when the standby is not ready', () => {
    const active = mockAudioElement();
    const standby = mockAudioElement(); // src: '', readyState: 0 — not ready
    usePlayerStore.setState({
      audioElementA: active, audioElementB: standby, activeSlot: 'a',
      playlist: [track(1), track(2)], currentTrackIndex: 0, nextTrackIndex: 1,
    });
    usePlayerStore.getState().playNext();
    const state = usePlayerStore.getState();
    expect(state.activeSlot).toBe('a'); // unchanged
    expect(active.src).toBe('/stream/2');
    expect(active.load).toHaveBeenCalled();
  });

  test('pauses the outgoing active element on handoff so it cannot keep playing in the background', () => {
    const active = mockAudioElement();
    active.paused = false; // still mid-playback — e.g. a manual/Bluetooth skip before natural 'ended'
    const standby = mockAudioElement();
    standby.src = '/stream/2';
    standby.readyState = 3;
    usePlayerStore.setState({
      audioElementA: active, audioElementB: standby, activeSlot: 'a',
      playlist: [track(1), track(2)], currentTrackIndex: 0, nextTrackIndex: 1,
    });
    usePlayerStore.getState().playNext({ manual: true });
    expect(active.pause).toHaveBeenCalled();
  });

  test('falls back when the standby element is loaded but for the wrong track', () => {
    const active = mockAudioElement();
    const standby = mockAudioElement();
    standby.src = '/stream/99'; // stale — loaded for a track that's no longer next
    standby.readyState = 3;
    usePlayerStore.setState({
      audioElementA: active, audioElementB: standby, activeSlot: 'a',
      playlist: [track(1), track(2)], currentTrackIndex: 0, nextTrackIndex: 1,
    });
    usePlayerStore.getState().playNext();
    expect(usePlayerStore.getState().activeSlot).toBe('a');
    expect(active.src).toBe('/stream/2');
  });
});

describe('standby unlock', () => {
  test('the first playTrackAtIndex call unlocks the standby element with a muted silent clip', () => {
    const active = mockAudioElement();
    const standby = mockAudioElement();
    usePlayerStore.setState({
      audioElementA: active, audioElementB: standby, activeSlot: 'a',
      playlist: [track(1)], standbyUnlocked: false,
    });
    usePlayerStore.getState().playTrackAtIndex(0);
    expect(standby.play).toHaveBeenCalled();
    expect(usePlayerStore.getState().standbyUnlocked).toBe(true);
  });

  test('subsequent playTrackAtIndex calls do not re-unlock', () => {
    const active = mockAudioElement();
    const standby = mockAudioElement();
    usePlayerStore.setState({
      audioElementA: active, audioElementB: standby, activeSlot: 'a',
      playlist: [track(1), track(2)], standbyUnlocked: true,
    });
    usePlayerStore.getState().playTrackAtIndex(1);
    expect(standby.play).not.toHaveBeenCalled();
  });
});

describe('closeDrawer', () => {
  test('sets drawerOpen to false when it was open', () => {
    usePlayerStore.setState({ drawerOpen: true });
    usePlayerStore.getState().closeDrawer();
    expect(usePlayerStore.getState().drawerOpen).toBe(false);
  });

  test('is a no-op (stays false) when already closed', () => {
    usePlayerStore.setState({ drawerOpen: false });
    usePlayerStore.getState().closeDrawer();
    expect(usePlayerStore.getState().drawerOpen).toBe(false);
  });
});

describe('togglePlayPause with an empty playlist', () => {
  test('enqueues and plays pageTracks, same as Play Now, when the playlist is empty', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [], currentTrackIndex: -1, pageTracks: [track(1), track(2)] });
    usePlayerStore.getState().togglePlayPause();
    const state = usePlayerStore.getState();
    expect(state.playlist.map((t) => t.id)).toEqual([1, 2]);
    expect(state.currentTrackIndex).toBe(0);
    expect(audioElement.src).toBe('/stream/1');
    expect(audioElement.play).toHaveBeenCalled();
  });

  test('does nothing when the playlist is empty and there are no pageTracks to fall back to', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, { playlist: [], currentTrackIndex: -1, pageTracks: [] });
    usePlayerStore.getState().togglePlayPause();
    const state = usePlayerStore.getState();
    expect(state.playlist).toHaveLength(0);
    expect(audioElement.play).not.toHaveBeenCalled();
  });

  test('resumes normally (ignoring pageTracks) when the playlist already has tracks', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, {
      playlist: [track(1)], currentTrackIndex: 0, playlistFinished: false, pageTracks: [track(9)],
    });
    usePlayerStore.getState().togglePlayPause();
    const state = usePlayerStore.getState();
    expect(state.playlist).toHaveLength(1);
    expect(audioElement.play).toHaveBeenCalled();
  });

  test('shuffle mode: resuming a finished queue picks a fresh random track and clears shuffleHistory', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, {
      playlist: [track(1), track(2), track(3)],
      currentTrackIndex: 2,
      playlistFinished: true,
      playbackMode: 'shuffle',
      shuffleHistory: [0, 1, 2],
    });
    usePlayerStore.getState().togglePlayPause();
    const state = usePlayerStore.getState();
    expect(state.currentTrackIndex).not.toBe(2);
    expect(state.playlistFinished).toBe(false);
    expect(state.shuffleHistory).toEqual([state.currentTrackIndex]);
    expect(audioElement.play).toHaveBeenCalled();
  });

  test('non-shuffle modes: resuming a finished queue restarts from track 0', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, {
      playlist: [track(1), track(2)],
      currentTrackIndex: 1,
      playlistFinished: true,
      playbackMode: 'repeat-all',
    });
    usePlayerStore.getState().togglePlayPause();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0);
  });

  test('shuffle mode: a plain mid-track pause (not finished) resumes the same track in place', () => {
    const audioElement = mockAudioElement();
    setActiveAudio(audioElement, {
      playlist: [track(1), track(2)],
      currentTrackIndex: 0,
      playlistFinished: false,
      playbackMode: 'shuffle',
    });
    usePlayerStore.getState().togglePlayPause();
    const state = usePlayerStore.getState();
    expect(state.currentTrackIndex).toBe(0);
    expect(audioElement.play).toHaveBeenCalled();
    expect(audioElement.load).not.toHaveBeenCalled(); // resumed in place, not reloaded via playTrackAtIndex
  });
});

describe('queueSource', () => {
  test('setQueueSource stores the source', () => {
    usePlayerStore.getState().setQueueSource({ type: 'album', id: 42 });
    expect(usePlayerStore.getState().queueSource).toEqual({ type: 'album', id: 42 });
  });

  test.each([
    ['addTrack', () => usePlayerStore.getState().addTrack(track(1))],
    ['addTracks', () => usePlayerStore.getState().addTracks([track(1), track(2)])],
    ['clearPlaylist', () => usePlayerStore.getState().clearPlaylist()],
  ])('%s clears an existing queueSource', (_name, action) => {
    usePlayerStore.setState({ queueSource: { type: 'album', id: 42 } });
    action();
    expect(usePlayerStore.getState().queueSource).toBeNull();
  });

  test('removeTrackFromPlaylist clears an existing queueSource', () => {
    usePlayerStore.setState({
      playlist: [track(1), track(2)],
      currentTrackIndex: 0,
      queueSource: { type: 'album', id: 42 },
    });
    usePlayerStore.getState().removeTrackFromPlaylist(1);
    expect(usePlayerStore.getState().queueSource).toBeNull();
  });

  test('reorderPlaylist clears an existing queueSource', () => {
    usePlayerStore.setState({
      playlist: [track(1), track(2)],
      currentTrackIndex: 0,
      queueSource: { type: 'album', id: 42 },
    });
    usePlayerStore.getState().reorderPlaylist(0, 1);
    expect(usePlayerStore.getState().queueSource).toBeNull();
  });

  test('setPlaylist (via clearPlaylist + addTracks) clears an existing queueSource', () => {
    usePlayerStore.setState({
      playlist: [track(1)],
      queueSource: { type: 'album', id: 42 },
    });
    usePlayerStore.getState().setPlaylist([track(2), track(3)]);
    expect(usePlayerStore.getState().queueSource).toBeNull();
  });
});

describe('enterScopeShuffle', () => {
  test('does nothing without a collection/artist queueSource', async () => {
    usePlayerStore.setState({ playlist: [track(1)], currentTrackIndex: 0, queueSource: null });
    await usePlayerStore.getState().enterScopeShuffle();
    expect(apiService.getRandomScopeTracks).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().playlist).toEqual([track(1)]);
  });

  test('does nothing when queueSource is an album or playlist (not a shuffleable scope)', async () => {
    usePlayerStore.setState({ playlist: [track(1)], currentTrackIndex: 0, queueSource: { type: 'album', id: 42 } });
    await usePlayerStore.getState().enterScopeShuffle();
    expect(apiService.getRandomScopeTracks).not.toHaveBeenCalled();
  });

  test('drops everything queued after the current track, keeps the current track, and appends a random batch', async () => {
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [track(10), track(11)] } });
    usePlayerStore.setState({
      playlist: [track(1), track(2), track(3)],
      currentTrackIndex: 0,
      playbackMode: 'shuffle-scope',
      queueSource: { type: 'artist', id: 3 },
    });
    await usePlayerStore.getState().enterScopeShuffle();
    const state = usePlayerStore.getState();
    expect(state.playlist.map((t) => t.id)).toEqual([1, 10, 11]);
    expect(state.queueSource).toEqual({ type: 'artist', id: 3 });
    expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('artist', 3, { limit: 25, excludeTrackIds: [1] });
  });

  test('excludes only numeric ids when the queue holds a Spotify entry', async () => {
    apiService.getRandomScopeTracks.mockResolvedValue({ data: { tracks: [] } });
    usePlayerStore.setState({
      playlist: [track(1), { source: 'spotify', title: 'S', uri: 'spotify:track:x' }, track(3)],
      currentTrackIndex: 1,
      playbackMode: 'shuffle-scope',
      queueSource: { type: 'artist', id: 3 },
    });
    await usePlayerStore.getState().enterScopeShuffle();
    expect(apiService.getRandomScopeTracks).toHaveBeenCalledWith('artist', 3, { limit: 25, excludeTrackIds: [1] });
  });

  test('discards the fetched batch if playbackMode changed away from shuffle-scope while the fetch was in flight', async () => {
    let resolveFetch;
    apiService.getRandomScopeTracks.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    usePlayerStore.setState({
      playlist: [track(1)],
      currentTrackIndex: 0,
      playbackMode: 'shuffle-scope',
      queueSource: { type: 'artist', id: 3 },
    });
    const pending = usePlayerStore.getState().enterScopeShuffle();
    usePlayerStore.setState({ playbackMode: 'off' });
    resolveFetch({ data: { tracks: [track(10)] } });
    await pending;
    expect(usePlayerStore.getState().playlist.map((t) => t.id)).toEqual([1]);
  });
});

describe('appendScopeShuffleTracks', () => {
  test('appends tracks to the playlist without touching queueSource or currentTrackIndex', () => {
    usePlayerStore.setState({
      playlist: [track(1)],
      currentTrackIndex: 0,
      queueSource: { type: 'artist', id: 3 },
    });
    usePlayerStore.getState().appendScopeShuffleTracks([track(2), track(3)]);
    const state = usePlayerStore.getState();
    expect(state.playlist.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(state.currentTrackIndex).toBe(0);
    expect(state.queueSource).toEqual({ type: 'artist', id: 3 });
  });

  test('is a no-op for an empty batch', () => {
    usePlayerStore.setState({ playlist: [track(1)] });
    usePlayerStore.getState().appendScopeShuffleTracks([]);
    expect(usePlayerStore.getState().playlist).toEqual([track(1)]);
  });
});

describe('queue history trimming', () => {
  test('playTrackAtIndex trims the oldest tracks once more than MAX_QUEUE_HISTORY (100) precede the play pointer', () => {
    const audioElement = mockAudioElement();
    const playlist = Array.from({ length: 105 }, (_, i) => track(i + 1));
    setActiveAudio(audioElement, { playlist, currentTrackIndex: 99 });
    usePlayerStore.getState().playTrackAtIndex(101); // 101 tracks would precede this one
    const state = usePlayerStore.getState();
    expect(state.playlist).toHaveLength(104); // 100 history + the new current track + trimmed by 1
    expect(state.playlist[0].id).toBe(2); // oldest 1 track (id 1) dropped
    expect(state.currentTrackIndex).toBe(100);
    expect(state.currentTrack.id).toBe(102);
  });

  test('does not trim when 100 or fewer tracks precede the play pointer', () => {
    const audioElement = mockAudioElement();
    const playlist = Array.from({ length: 101 }, (_, i) => track(i + 1));
    setActiveAudio(audioElement, { playlist, currentTrackIndex: 50 });
    usePlayerStore.getState().playTrackAtIndex(100);
    const state = usePlayerStore.getState();
    expect(state.playlist).toHaveLength(101);
    expect(state.currentTrackIndex).toBe(100);
  });

  test('never trims upcoming (not-yet-played) tracks', () => {
    const audioElement = mockAudioElement();
    const playlist = Array.from({ length: 150 }, (_, i) => track(i + 1));
    setActiveAudio(audioElement, { playlist, currentTrackIndex: 99 });
    usePlayerStore.getState().playTrackAtIndex(101);
    const state = usePlayerStore.getState();
    // Upcoming tracks (ids 103-150, originally indices 102-149) are all still present.
    expect(state.playlist.at(-1).id).toBe(150);
    expect(state.playlist).toHaveLength(149); // only the 1 oldest history track dropped
  });

  test('shifts shuffleHistory and recentlyAddedIndices to match the trimmed playlist', () => {
    const audioElement = mockAudioElement();
    const playlist = Array.from({ length: 105 }, (_, i) => track(i + 1));
    setActiveAudio(audioElement, {
      playlist,
      currentTrackIndex: 99,
      playbackMode: 'shuffle',
      shuffleHistory: [2, 50, 99],
      recentlyAddedIndices: [2, 101],
    });
    usePlayerStore.getState().playTrackAtIndex(101);
    const state = usePlayerStore.getState();
    // dropCount = 101 - 100 = 1. playTrackAtIndex adds 101 to shuffleHistory in shuffle mode.
    // All indices shift down by 1: [2,50,99,101] -> [1,49,98,100] and [2,101] -> [1,100]
    expect(state.shuffleHistory).toEqual([1, 49, 98, 100]);
    expect(state.recentlyAddedIndices).toEqual([1, 100]);
  });

  test('playNext also trims via its gapless-handoff fast path (bypasses playTrackAtIndex)', () => {
    const active = mockAudioElement();
    const standby = mockAudioElement();
    const playlist = Array.from({ length: 105 }, (_, i) => track(i + 1));
    standby.src = playlist[101].url;
    standby.readyState = 3;
    usePlayerStore.setState({
      audioElementA: active, audioElementB: standby, activeSlot: 'a',
      playlist, currentTrackIndex: 100, nextTrackIndex: 101,
    });
    usePlayerStore.getState().playNext();
    const state = usePlayerStore.getState();
    expect(state.playlist.length).toBeLessThan(105);
    expect(state.currentTrackIndex).toBeLessThanOrEqual(MAX_QUEUE_HISTORY);
  });
});

describe('spotify source routing', () => {
  const spotifyTrack = (n, overrides = {}) => ({
    source: 'spotify',
    uri: `spotify:track:${n}`,
    spotifyId: `${n}`,
    title: `Spotify ${n}`,
    artist: { name: 'S' },
    album: { title: 'SA' },
    imageUrl: null,
    duration: 200,
    ...overrides,
  });

  const fakeSource = (overrides = {}) => ({
    start: vi.fn(() => Promise.resolve()),
    pause: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    seek: vi.fn(() => Promise.resolve()),
    isAvailable: () => true,
    isDisplaced: () => false,
    clearDisplaced: vi.fn(),
    activate: vi.fn(),
    ...overrides,
  });

  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  const setup = (state = {}) => {
    const active = mockAudioElement();
    const standby = mockAudioElement();
    usePlayerStore.setState({
      audioElementA: active, audioElementB: standby, activeSlot: 'a', standbyUnlocked: true, ...state,
    });
    return { active, standby };
  };

  beforeEach(() => {
    usePlayerStore.setState({ activeSource: 'local', spotifySource: null, consecutiveSkips: 0 });
  });

  afterEach(() => {
    usePlayerStore.setState({ activeSource: 'local', spotifySource: null, consecutiveSkips: 0 });
  });

  test('starts with the local source active and no Spotify source registered', () => {
    usePlayerStore.getState().setSpotifySource(null);
    expect(usePlayerStore.getState().activeSource).toBe('local');
    expect(usePlayerStore.getState().spotifySource).toBeNull();
    const source = fakeSource();
    usePlayerStore.getState().setSpotifySource(source);
    expect(usePlayerStore.getState().spotifySource).toBe(source);
  });

  describe('transition timing (debug flag on)', () => {
    let log;
    beforeEach(() => {
      localStorage.setItem('pshare-debug-transitions', '1');
      log = vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => {
      localStorage.removeItem('pshare-debug-transitions');
      vi.restoreAllMocks();
    });

    test('a rejected Spotify start followed by a skip to local leaves no misleading mark', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const source = fakeSource({ start: vi.fn(() => Promise.reject(new Error('timeout'))) });
      const { active } = setup({ playlist: [track(1), spotifyTrack(2), track(3)], spotifySource: source, currentTrackIndex: 0 });
      active.paused = false;
      usePlayerStore.getState().playTrackAtIndex(1, { auto: true });
      await flush();
      expect(usePlayerStore.getState().activeSource).toBe('local');
      markIncomingAudible('local');
      expect(log).not.toHaveBeenCalled();
    });

    test('a plain local to local advance logs nothing', () => {
      const { active } = setup({ playlist: [track(1), track(2)], currentTrackIndex: 0 });
      active.paused = false;
      usePlayerStore.getState().playTrackAtIndex(1, { auto: true });
      markIncomingAudible('local');
      expect(log).not.toHaveBeenCalled();
    });
  });

  test('playing a Spotify track pauses both audio elements and calls start with that track', () => {
    const source = fakeSource();
    const sp = spotifyTrack(1);
    const { active, standby } = setup({ playlist: [track(1), sp], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(1);
    const state = usePlayerStore.getState();
    expect(active.pause).toHaveBeenCalled();
    expect(standby.pause).toHaveBeenCalled();
    expect(active.load).not.toHaveBeenCalled();
    expect(source.start).toHaveBeenCalledWith(sp);
    expect(state.activeSource).toBe('spotify');
    expect(state.currentTrackIndex).toBe(1);
    expect(state.currentTrack).toBe(sp);
    expect(state.isPlaying).toBe(true);
    expect(state.currentTime).toBe(0);
    expect(state.duration).toBe(200);
  });

  test('start resolving resets consecutiveSkips', async () => {
    const source = fakeSource();
    setup({ playlist: [spotifyTrack(1)], spotifySource: source, consecutiveSkips: 2 });
    usePlayerStore.getState().playTrackAtIndex(0, { auto: true });
    await flush();
    expect(usePlayerStore.getState().consecutiveSkips).toBe(0);
    expect(source.pause).not.toHaveBeenCalled();
  });

  test('a local play event (setIsPlaying(true)) resets consecutiveSkips', () => {
    usePlayerStore.setState({ consecutiveSkips: 3 });
    usePlayerStore.getState().setIsPlaying(true);
    expect(usePlayerStore.getState().consecutiveSkips).toBe(0);
  });

  test('playing a local track while Spotify is active pauses the Spotify source and switches back to local', () => {
    const source = fakeSource();
    const { active } = setup({ playlist: [spotifyTrack(1), track(2)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().playTrackAtIndex(1);
    expect(source.pause).toHaveBeenCalled();
    expect(usePlayerStore.getState().activeSource).toBe('local');
    expect(active.src).toBe('/stream/2');
    expect(active.play).toHaveBeenCalled();
  });

  test('togglePlayPause while Spotify is active pauses the Spotify source, not audio', () => {
    const source = fakeSource();
    const { active } = setup({ playlist: [spotifyTrack(1)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    active.pause.mockClear();
    active.paused = true; // the idle <audio> element is paused — must not be mistaken for "nothing playing"

    usePlayerStore.getState().togglePlayPause();
    expect(source.pause).toHaveBeenCalled();
    expect(active.play).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    usePlayerStore.getState().togglePlayPause();
    expect(source.resume).toHaveBeenCalled();
    expect(active.play).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  test('seek while Spotify is active seeks the Spotify source', () => {
    const source = fakeSource();
    const { active } = setup({ playlist: [spotifyTrack(1)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().seek(42);
    expect(source.seek).toHaveBeenCalledWith(42);
    expect(active.currentTime).toBe(0);
  });

  test('Spotify → local with a ready standby pauses Spotify and plays the standby element', () => {
    const source = fakeSource();
    const { active, standby } = setup({ playlist: [spotifyTrack(1), track(2)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    standby.src = '/stream/2';
    standby.readyState = 3;

    usePlayerStore.getState().playNext();
    const state = usePlayerStore.getState();
    expect(source.pause).toHaveBeenCalled();
    expect(state.activeSource).toBe('local');
    expect(state.activeSlot).toBe('b');
    expect(state.currentTrackIndex).toBe(1);
    expect(standby.play).toHaveBeenCalled();
    expect(standby.load).not.toHaveBeenCalled();
    expect(active.load).not.toHaveBeenCalled();
  });

  test('Spotify → local without a ready standby loads the track on the active element', () => {
    const source = fakeSource();
    const { active } = setup({ playlist: [spotifyTrack(1), track(2)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().playNext();
    expect(source.pause).toHaveBeenCalled();
    expect(usePlayerStore.getState().activeSource).toBe('local');
    expect(usePlayerStore.getState().activeSlot).toBe('a');
    expect(active.src).toBe('/stream/2');
  });

  test('local → Spotify via playNext starts the Spotify track, even with something loaded in standby', () => {
    const source = fakeSource();
    const { active, standby } = setup({ playlist: [track(1), spotifyTrack(2)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    standby.readyState = 4;
    usePlayerStore.getState().playNext();
    expect(source.start).toHaveBeenCalledWith(usePlayerStore.getState().playlist[1]);
    expect(usePlayerStore.getState().activeSlot).toBe('a');
    expect(usePlayerStore.getState().activeSource).toBe('spotify');
    expect(active.pause).toHaveBeenCalled();
  });

  test('with no spotifySource registered, an auto-advance onto a Spotify track skips to the next local track', () => {
    const { active } = setup({ playlist: [track(1), spotifyTrack(2), track(3)] });
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().playNext();
    const state = usePlayerStore.getState();
    expect(state.currentTrackIndex).toBe(2);
    expect(state.activeSource).toBe('local');
    expect(state.playlistFinished).toBe(false);
    expect(active.src).toBe('/stream/3');
  });

  test('with no spotifySource registered, a queue of only Spotify tracks terminates with playlistFinished', () => {
    setup({ playlist: [spotifyTrack(1), spotifyTrack(2), spotifyTrack(3)], playbackMode: 'repeat-all' });
    usePlayerStore.getState().playTrackAtIndex(0);
    const state = usePlayerStore.getState();
    expect(state.playlistFinished).toBe(true);
    expect(state.isPlaying).toBe(false);
  });

  test('repeat-all queue of only Spotify tracks with the source unavailable stops with playlistFinished and does not loop', async () => {
    // Available enough to try start(), but every start() rejects (e.g. device gone) —
    // exercises the async skip path as well as the synchronous one.
    const rejecting = fakeSource({ start: vi.fn(() => Promise.reject(new Error('no device'))) });
    setup({ playlist: [spotifyTrack(1), spotifyTrack(2), spotifyTrack(3)], playbackMode: 'repeat-all', spotifySource: rejecting });
    usePlayerStore.getState().playTrackAtIndex(0);
    for (let i = 0; i < 10; i++) await flush();
    expect(rejecting.start.mock.calls.length).toBeLessThanOrEqual(3);
    expect(usePlayerStore.getState().playlistFinished).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    // isAvailable() false: start must never be called at all.
    const unavailable = fakeSource({ isAvailable: () => false });
    usePlayerStore.setState({ spotifySource: unavailable, consecutiveSkips: 0, playlistFinished: false });
    usePlayerStore.getState().playTrackAtIndex(0);
    expect(unavailable.start).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().playlistFinished).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  test('shuffle queue of only Spotify tracks with the source unavailable stops', () => {
    const source = fakeSource({ isAvailable: () => false });
    setup({ playlist: [spotifyTrack(1), spotifyTrack(2), spotifyTrack(3), spotifyTrack(4)], playbackMode: 'shuffle', spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    expect(usePlayerStore.getState().playlistFinished).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(source.start).not.toHaveBeenCalled();
  });

  test('repeat-one: an unplayable Spotify track is tried once, then the following local track plays', async () => {
    const source = fakeSource({ start: vi.fn(() => Promise.reject(new Error('no device'))) });
    const { active } = setup({ playlist: [spotifyTrack(1), track(2), track(3)], playbackMode: 'repeat-one', spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    for (let i = 0; i < 10; i++) await flush();
    const state = usePlayerStore.getState();
    expect(source.start).toHaveBeenCalledTimes(1);
    expect(state.currentTrackIndex).toBe(1);
    expect(state.activeSource).toBe('local');
    expect(active.src).toBe('/stream/2');
    // repeat-one applies to the newly playing track as normal.
    expect(state.nextTrackIndex).toBe(1);
  });

  test('repeat-one: a queue where every track is unplayable terminates with playlistFinished', async () => {
    const source = fakeSource({ start: vi.fn(() => Promise.reject(new Error('no device'))) });
    setup({ playlist: [spotifyTrack(1), spotifyTrack(2), spotifyTrack(3)], playbackMode: 'repeat-one', spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    for (let i = 0; i < 10; i++) await flush();
    expect(source.start.mock.calls.length).toBeLessThanOrEqual(3);
    expect(usePlayerStore.getState().playlistFinished).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    const unavailable = fakeSource({ isAvailable: () => false });
    usePlayerStore.setState({ spotifySource: unavailable, consecutiveSkips: 0, playlistFinished: false });
    usePlayerStore.getState().playTrackAtIndex(1);
    expect(unavailable.start).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().playlistFinished).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  test('displaced: auto-advance skips Spotify tracks; a manual playTrackAtIndex onto one clears displaced and starts it', () => {
    let displaced = true;
    const source = fakeSource({
      isDisplaced: () => displaced,
      clearDisplaced: vi.fn(() => { displaced = false; }),
    });
    const { active } = setup({ playlist: [track(1), spotifyTrack(2), track(3)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().playNext();
    expect(source.start).not.toHaveBeenCalled();
    expect(source.clearDisplaced).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(2);
    expect(active.src).toBe('/stream/3');

    usePlayerStore.getState().playTrackAtIndex(1);
    expect(source.clearDisplaced).toHaveBeenCalled();
    expect(source.start).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1);
    expect(usePlayerStore.getState().activeSource).toBe('spotify');
  });

  test('start rejecting advances to the next track', async () => {
    const source = fakeSource({ start: vi.fn(() => Promise.reject(new Error('nope'))) });
    const { active } = setup({ playlist: [spotifyTrack(1), track(2)], spotifySource: source });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    usePlayerStore.getState().playTrackAtIndex(0);
    await flush();
    warn.mockRestore();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1);
    expect(usePlayerStore.getState().activeSource).toBe('local');
    expect(active.src).toBe('/stream/2');
  });

  test('stale start: selecting a local track while start is pending pauses Spotify when start resolves', async () => {
    let resolveStart;
    const source = fakeSource({ start: vi.fn(() => new Promise((resolve) => { resolveStart = resolve; })) });
    const { active } = setup({ playlist: [spotifyTrack(1), track(2)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().playTrackAtIndex(1);
    source.pause.mockClear();
    expect(active.src).toBe('/stream/2');

    resolveStart();
    await flush();
    expect(source.pause).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().activeSource).toBe('local');
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1);
  });

  test('stale start rejecting after the user moved on does not skip anything', async () => {
    let rejectStart;
    const source = fakeSource({ start: vi.fn(() => new Promise((_, reject) => { rejectStart = reject; })) });
    setup({ playlist: [spotifyTrack(1), track(2), track(3)], spotifySource: source });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().playTrackAtIndex(1);
    rejectStart(new Error('late'));
    await flush();
    warn.mockRestore();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1);
  });

  test('ensureStandbyLoaded does not touch the standby element when next is Spotify', () => {
    const { standby } = setup({ playlist: [track(1), spotifyTrack(2)], nextTrackIndex: 1 });
    usePlayerStore.getState().ensureStandbyLoaded();
    expect(standby.load).not.toHaveBeenCalled();
    expect(standby.src).toBe('');
  });

  test('first playTrackAtIndex calls spotifySource.activate', () => {
    const source = fakeSource();
    setup({ playlist: [track(1), track(2)], spotifySource: source, standbyUnlocked: false });
    usePlayerStore.getState().playTrackAtIndex(0);
    expect(source.activate).toHaveBeenCalledTimes(1);
    usePlayerStore.getState().playTrackAtIndex(1);
    expect(source.activate).toHaveBeenCalledTimes(1);
  });


  test('a source registered after the first local play is activated on the next manual play', () => {
    setup({ playlist: [track(1), track(2), track(3)], standbyUnlocked: false });
    usePlayerStore.getState().playTrackAtIndex(0);
    const source = fakeSource();
    usePlayerStore.getState().setSpotifySource(source);
    usePlayerStore.getState().playNext();
    expect(source.activate).not.toHaveBeenCalled();
    usePlayerStore.getState().playTrackAtIndex(2);
    expect(source.activate).toHaveBeenCalledTimes(1);
  });

  test('clearPlaylist while Spotify is active pauses the Spotify source', () => {
    const source = fakeSource();
    setup({ playlist: [spotifyTrack(1)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().clearPlaylist();
    expect(source.pause).toHaveBeenCalled();
    expect(usePlayerStore.getState().activeSource).toBe('local');
  });

  test('a rejected start followed by a skip to local pauses the Spotify source', async () => {
    const source = fakeSource({ start: vi.fn(() => Promise.reject(new Error('timed out'))) });
    const { active } = setup({ playlist: [spotifyTrack(1), track(2)], spotifySource: source });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    usePlayerStore.getState().playTrackAtIndex(0);
    await flush();
    warn.mockRestore();
    expect(active.src).toBe('/stream/2');
    expect(source.pause).toHaveBeenCalled();
  });

  test('a stale start rejecting after the user moved to a local track pauses the Spotify source', async () => {
    let rejectStart;
    const source = fakeSource({ start: vi.fn(() => new Promise((_, reject) => { rejectStart = reject; })) });
    setup({ playlist: [spotifyTrack(1), track(2)], spotifySource: source });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().playTrackAtIndex(1);
    source.pause.mockClear();
    rejectStart(new Error('timed out'));
    await flush();
    warn.mockRestore();
    expect(source.pause).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().currentTrackIndex).toBe(1);
  });

  test('auto local→Spotify keeps the local element playing until start resolves', async () => {
    let resolveStart;
    const source = fakeSource({ start: vi.fn(() => new Promise((resolve) => { resolveStart = resolve; })) });
    const { active } = setup({ playlist: [track(1), spotifyTrack(2)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    active.paused = false; // still playing its last few hundred ms

    usePlayerStore.getState().playNext();
    expect(source.start).toHaveBeenCalled();
    expect(usePlayerStore.getState().activeSource).toBe('spotify');
    expect(active.pause).not.toHaveBeenCalled();

    resolveStart();
    await flush();
    expect(active.pause).toHaveBeenCalled();
  });

  test('auto local→Spotify whose start is superseded never pauses the element the newer track is using', async () => {
    let resolveStart;
    const source = fakeSource({ start: vi.fn(() => new Promise((resolve) => { resolveStart = resolve; })) });
    const { active } = setup({ playlist: [track(1), spotifyTrack(2), track(3)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    active.paused = false;
    usePlayerStore.getState().playNext();
    usePlayerStore.getState().playTrackAtIndex(2); // user picks a local track while start is pending
    expect(active.src).toBe('/stream/3');

    resolveStart();
    await flush();
    expect(active.pause).not.toHaveBeenCalled();
  });

  test('manual local→Spotify pauses the local element immediately', () => {
    const source = fakeSource({ start: vi.fn(() => new Promise(() => {})) });
    const { active } = setup({ playlist: [track(1), spotifyTrack(2)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    active.paused = false;
    usePlayerStore.getState().playNext({ manual: true });
    expect(active.pause).toHaveBeenCalled();
  });

  test('unregistering the source while Spotify is active pauses it, ignores its pending start and advances to the next local track', async () => {
    let resolveStart;
    const source = fakeSource({ start: vi.fn(() => new Promise((resolve) => { resolveStart = resolve; })) });
    const { active } = setup({ playlist: [spotifyTrack(1), spotifyTrack(2), track(3)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);

    usePlayerStore.getState().setSpotifySource(null);
    const state = usePlayerStore.getState();
    expect(source.pause).toHaveBeenCalled();
    expect(state.spotifySource).toBeNull();
    expect(state.activeSource).toBe('local');
    expect(state.currentTrackIndex).toBe(2);
    expect(active.src).toBe('/stream/3');

    source.pause.mockClear();
    resolveStart();
    await flush();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(2);
    expect(usePlayerStore.getState().activeSource).toBe('local');
  });

  test('unregistering the source while Spotify is active with nothing playable left stops', () => {
    const source = fakeSource();
    setup({ playlist: [track(1), spotifyTrack(2)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(1);
    usePlayerStore.getState().setSpotifySource(null);
    const state = usePlayerStore.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.playlistFinished).toBe(true);
  });

  test('unregistering the source while local is active changes nothing else', () => {
    const source = fakeSource();
    const { active } = setup({ playlist: [track(1), spotifyTrack(2)], spotifySource: source });
    usePlayerStore.getState().playTrackAtIndex(0);
    usePlayerStore.getState().setSpotifySource(null);
    expect(source.pause).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().currentTrackIndex).toBe(0);
    expect(active.src).toBe('/stream/1');
  });
});
