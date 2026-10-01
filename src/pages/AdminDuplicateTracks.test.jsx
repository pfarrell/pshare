import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminDuplicateTracks from './AdminDuplicateTracks';
import { apiService } from '../services/api';

vi.mock('../services/api', () => ({
  apiService: {
    getDuplicateTracks: vi.fn(),
    resolveDuplicateTrackGroup: vi.fn(),
    dismissDuplicate: vi.fn(),
  },
}));

const renderPage = () => render(<MemoryRouter><AdminDuplicateTracks /></MemoryRouter>);

const mk = (id, title, duration_sec = 226) => ({ id, title, duration_sec, album_id: 5, album_title: 'Greatest Hits of the 90s', url: `http://localhost:3000/stream/${id}` });
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
    expect(screen.getByText(/Greatest Hits of the 90s/)).toBeInTheDocument();
  });

  test('every track has its own preview that reveals an audio player on its stream url', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    expect(screen.getAllByText('Preview')).toHaveLength(3);

    await user.click(within(rowOf('I touch Myself')).getByText('Preview'));
    expect(rowOf('I touch Myself').querySelector('audio')).toHaveAttribute('src', 'http://localhost:3000/stream/200');
  });

  test('keeping a track merges all other versions into it and removes the group', async () => {
    const user = userEvent.setup();
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    apiService.resolveDuplicateTrackGroup.mockResolvedValue({ data: { success: true } });
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    await user.click(within(rowOf('I touch Myself')).getByText('Keep this one'));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Keep "I touch Myself" and delete 2 other versions'));
    expect(apiService.resolveDuplicateTrackGroup).toHaveBeenCalledWith(200, [100, 300]);
    expect(screen.queryByRole('link', { name: 'I Touch Myself' })).not.toBeInTheDocument();
    expect(screen.getByText('No possible duplicate tracks found.')).toBeInTheDocument();
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
