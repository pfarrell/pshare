import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminDuplicateTracks from './AdminDuplicateTracks';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getDuplicateTracks: vi.fn(),
    setCanonicalTrackFile: vi.fn(),
    removeOtherDuplicateTracks: vi.fn(),
    dismissDuplicate: vi.fn(),
  },
}));

const renderPage = () => render(<MemoryRouter><AdminDuplicateTracks /></MemoryRouter>);

const mk = (id, title, duration_sec = 226) => ({ id, title, duration_sec, media_file_id: 1000 + id, album_id: 5, album_title: 'Greatest Hits of the 90s', url: `http://localhost:3000/stream/${id}` });
const group = {
  reasons: ['file', 'musicbrainz'],
  album_id: 5,
  album_title: 'Greatest Hits of the 90s',
  tracks: [mk(100, 'I Touch Myself'), mk(200, 'I touch Myself', 227), mk(300, 'I Touch Myself (Remaster)', 228)],
};
const respond = (groups) => ({ data: { groups, pagination: { page: 1, limit: 25, total: groups.length, totalPages: 1 } } });
const rowOf = (name) => screen.getByRole('link', { name }).parentElement;

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.clearAllMocks();
});

describe('AdminDuplicateTracks', () => {
  test('shows an empty state when there are no candidate groups', async () => {
    apiService.getDuplicateTracks.mockResolvedValue(respond([]));
    renderPage();

    await screen.findByText('No possible duplicate tracks found.');
  });

  test('renders every version in a group with the match reasons, album context, and album links', async () => {
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    renderPage();

    const link = await screen.findByRole('link', { name: 'I Touch Myself' });
    expect(link).toHaveAttribute('href', '/album/5');
    // Deliberately no target="_blank": see the comment on the Link in the page.
    expect(link).not.toHaveAttribute('target');
    expect(screen.getByRole('link', { name: 'I touch Myself' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'I Touch Myself (Remaster)' })).toBeInTheDocument();
    expect(screen.getByText(/3 versions .* matched by same audio file, same MusicBrainz recording/)).toBeInTheDocument();
    expect(screen.getAllByText(/Greatest Hits of the 90s/).length).toBeGreaterThanOrEqual(1);
  });

  test('every track lists its own album (linked, with artist and id) so same-album and separate-release tracks are distinguishable', async () => {
    const mixed = {
      ...group,
      tracks: [
        { ...mk(100, 'I Touch Myself'), album_artist: 'Divinyls' },
        { ...mk(200, 'I touch Myself', 227), album_id: 9, album_title: 'Essential 90s', album_artist: 'Various Artists' },
      ],
    };
    apiService.getDuplicateTracks.mockResolvedValue(respond([mixed]));
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    const first = rowOf('I Touch Myself');
    expect(within(first).getByRole('link', { name: 'Greatest Hits of the 90s' })).toHaveAttribute('href', '/album/5');
    expect(first).toHaveTextContent('by Divinyls (album #5)');
    const second = rowOf('I touch Myself');
    expect(within(second).getByRole('link', { name: 'Essential 90s' })).toHaveAttribute('href', '/album/9');
    expect(second).toHaveTextContent('by Various Artists (album #9)');
  });

  test('every track renders its own player up front, on its stream url, without downloading until played', async () => {
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    const players = document.querySelectorAll('audio');
    expect(players).toHaveLength(3);
    players.forEach((p) => expect(p).toHaveAttribute('preload', 'none'));
    expect(rowOf('I touch Myself').querySelector('audio')).toHaveAttribute('src', 'http://localhost:3000/stream/200');
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  test('starting one preview pauses the others', async () => {
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    const [first, second, third] = document.querySelectorAll('audio');
    [first, second, third].forEach((p) => { p.pause = vi.fn(); });
    fireEvent.play(second);

    expect(first.pause).toHaveBeenCalled();
    expect(third.pause).toHaveBeenCalled();
    expect(second.pause).not.toHaveBeenCalled();
  });

  test('"Consolidate to this version" points the other tracks at the chosen track\'s file without deleting anything', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    apiService.setCanonicalTrackFile.mockResolvedValue({ data: { success: true } });
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    await user.click(within(rowOf('I touch Myself')).getByText('Consolidate to this version'));

    const prompt = window.confirm.mock.calls[0][0];
    expect(prompt).toContain('Consolidate: use the audio file of "I touch Myself"');
    expect(prompt).toContain('No tracks are removed from the album');
    expect(prompt).not.toMatch(/delete/i);
    expect(apiService.setCanonicalTrackFile).toHaveBeenCalledWith(200, [100, 300]);
    expect(screen.getByText('No possible duplicate tracks found.')).toBeInTheDocument();
  });

  test('"Remove others" deletes the rest of the group, keeps the chosen track, and says so in the confirmation', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    apiService.removeOtherDuplicateTracks.mockResolvedValue({ data: { success: true, removed: 2 } });
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    await user.click(within(rowOf('I touch Myself')).getByText('Remove others'));

    const prompt = window.confirm.mock.calls[0][0];
    expect(prompt).toContain('REMOVE 2 other tracks from the album and keep "I touch Myself"');
    expect(prompt).toContain('cannot be undone');
    expect(apiService.removeOtherDuplicateTracks).toHaveBeenCalledWith(200, [100, 300]);
    expect(apiService.setCanonicalTrackFile).not.toHaveBeenCalled();
    expect(screen.getByText('No possible duplicate tracks found.')).toBeInTheDocument();
  });

  test('cancelling the confirmation changes nothing for either action', async () => {
    const user = userEvent.setup();
    window.confirm.mockReturnValue(false);
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    await user.click(within(rowOf('I touch Myself')).getByText('Remove others'));
    await user.click(within(rowOf('I touch Myself')).getByText('Consolidate to this version'));

    expect(apiService.removeOtherDuplicateTracks).not.toHaveBeenCalled();
    expect(apiService.setCanonicalTrackFile).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'I Touch Myself' })).toBeInTheDocument();
  });

  test('shows each track\'s media file and does not offer a track with no file as the definitive one', async () => {
    const noFile = { ...group, tracks: [mk(100, 'I Touch Myself'), { ...mk(200, 'I touch Myself'), media_file_id: null }] };
    apiService.getDuplicateTracks.mockResolvedValue(respond([noFile]));
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    expect(within(rowOf('I Touch Myself')).getByText(/file #1100/)).toBeInTheDocument();
    expect(within(rowOf('I touch Myself')).getByText(/file #none/)).toBeInTheDocument();
    expect(within(rowOf('I touch Myself')).getByText('Consolidate to this version')).toBeDisabled();
    expect(within(rowOf('I Touch Myself')).getByText('Consolidate to this version')).toBeEnabled();
  });

  test('"Not a duplicate" dismisses that track against the others and leaves the rest grouped', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    apiService.dismissDuplicate.mockResolvedValue({ data: { success: true } });
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    await user.click(within(rowOf('I Touch Myself (Remaster)')).getByText('Not a duplicate'));

    expect(apiService.dismissDuplicate).toHaveBeenCalledWith('track', 300, 100);
    expect(apiService.dismissDuplicate).toHaveBeenCalledWith('track', 300, 200);
    expect(screen.queryByRole('link', { name: 'I Touch Myself (Remaster)' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'I Touch Myself' })).toBeInTheDocument();
    expect(screen.getByText(/2 versions/)).toBeInTheDocument();
  });

  test('dismissing from a two-version group removes the whole group', async () => {
    const user = userEvent.setup();
    const pairGroup = { ...group, tracks: group.tracks.slice(0, 2) };
    apiService.getDuplicateTracks.mockResolvedValue(respond([pairGroup]));
    apiService.dismissDuplicate.mockResolvedValue({ data: { success: true } });
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    await user.click(within(rowOf('I Touch Myself')).getByText('Not a duplicate'));

    expect(screen.getByText('No possible duplicate tracks found.')).toBeInTheDocument();
  });
});
