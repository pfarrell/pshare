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

const mk = (id, title, duration_sec = 226) => ({
  id, title, duration_sec, media_file_id: 1000 + id, album_id: 5, album_title: 'Greatest Hits of the 90s', url: `http://localhost:3000/stream/${id}`,
});
const group = {
  reasons: ['file', 'musicbrainz'],
  album_ids: [5],
  tracks: [mk(100, 'I Touch Myself'), mk(200, 'I touch Myself', 227), mk(300, 'I Touch Myself (Remaster)', 228)],
};
const respond = (groups) => ({ data: { groups, pagination: { page: 1, limit: 25, total: groups.length, totalPages: 1 } } });
const rowOf = (name) => screen.getByRole('link', { name }).closest('[data-track-row]');
const check = async (user, name) => user.click(within(rowOf(name)).getByRole('checkbox'));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminDuplicateTracks', () => {
  test('shows an empty state when there are no candidate groups', async () => {
    apiService.getDuplicateTracks.mockResolvedValue(respond([]));
    renderPage();

    await screen.findByText('No possible duplicate tracks found.');
  });

  test('lists every version of a group as its own row with the match reasons and album links', async () => {
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    renderPage();

    const link = await screen.findByRole('link', { name: 'I Touch Myself' });
    expect(link).toHaveAttribute('href', '/album/5');
    // Deliberately no target="_blank": see the comment on the Link in the page.
    expect(link).not.toHaveAttribute('target');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'I touch Myself' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'I Touch Myself (Remaster)' })).toBeInTheDocument();
    expect(screen.getByText(/3 versions .* matched by same audio file, same MusicBrainz recording/)).toBeInTheDocument();
  });

  test('every track renders its own player up front, on its stream url, without downloading until played', async () => {
    apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
    renderPage();

    await screen.findByRole('link', { name: 'I Touch Myself' });
    const players = document.querySelectorAll('audio');
    expect(players).toHaveLength(3);
    players.forEach((p) => expect(p).toHaveAttribute('preload', 'none'));
    expect(rowOf('I touch Myself').querySelector('audio')).toHaveAttribute('src', 'http://localhost:3000/stream/200');
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

  test('every track lists its own album (linked, with artist and id)', async () => {
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

  describe('picking tracks with checkboxes', () => {
    test('nothing happens until other versions are checked: both actions are disabled', async () => {
      apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
      renderPage();

      await screen.findByRole('link', { name: 'I Touch Myself' });
      expect(within(rowOf('I touch Myself')).getByText('Consolidate to this version')).toBeDisabled();
      expect(within(rowOf('I touch Myself')).getByText('Remove selected')).toBeDisabled();
      expect(screen.getByText('0 selected')).toBeInTheDocument();
    });

    test('consolidate acts on the checked tracks only, using the clicked row as the main version', async () => {
      const user = userEvent.setup();
      apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
      apiService.setCanonicalTrackFile.mockResolvedValue({ data: { success: true } });
      renderPage();

      await screen.findByRole('link', { name: 'I Touch Myself' });
      await check(user, 'I Touch Myself');
      // the third version stays unchecked and must not be touched
      await user.click(within(rowOf('I touch Myself')).getByText('Consolidate 1 selected to this version'));

      const prompt = window.confirm.mock.calls[0][0];
      expect(prompt).toContain('Consolidate: use the audio file of "I touch Myself"');
      expect(prompt).toContain('"I Touch Myself"');
      expect(prompt).toContain('No tracks are removed from the album');
      expect(prompt).not.toMatch(/delete/i);
      expect(apiService.setCanonicalTrackFile).toHaveBeenCalledWith(200, [100]);
    });

    test('the group stays after a partial consolidate: moved tracks show the main file, unchecked ones are untouched', async () => {
      const user = userEvent.setup();
      apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
      apiService.setCanonicalTrackFile.mockResolvedValue({ data: { success: true } });
      renderPage();

      await screen.findByRole('link', { name: 'I Touch Myself' });
      await check(user, 'I Touch Myself');
      await user.click(within(rowOf('I touch Myself')).getByText('Consolidate 1 selected to this version'));

      expect(await screen.findByText(/3 versions/)).toBeInTheDocument();
      expect(within(rowOf('I Touch Myself')).getByText(/file #1200/)).toBeInTheDocument(); // moved to track 200's file
      expect(within(rowOf('I touch Myself')).getByText(/file #1200/)).toBeInTheDocument();
      expect(within(rowOf('I Touch Myself (Remaster)')).getByText(/file #1300/)).toBeInTheDocument(); // untouched
      // its checkbox is cleared once acted on
      expect(within(rowOf('I Touch Myself')).getByRole('checkbox')).not.toBeChecked();
    });

    test('a checked main row is ignored: only the other checked tracks are sent', async () => {
      const user = userEvent.setup();
      apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
      apiService.setCanonicalTrackFile.mockResolvedValue({ data: { success: true } });
      renderPage();

      await screen.findByRole('link', { name: 'I Touch Myself' });
      await check(user, 'I touch Myself'); // the one we will click from
      await check(user, 'I Touch Myself (Remaster)');
      await user.click(within(rowOf('I touch Myself')).getByText('Consolidate 1 selected to this version'));

      expect(apiService.setCanonicalTrackFile).toHaveBeenCalledWith(200, [300]);
    });

    test('consolidating every other version finishes the group and it leaves the list', async () => {
      const user = userEvent.setup();
      apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
      apiService.setCanonicalTrackFile.mockResolvedValue({ data: { success: true } });
      renderPage();

      await screen.findByRole('link', { name: 'I Touch Myself' });
      await check(user, 'I Touch Myself');
      await check(user, 'I Touch Myself (Remaster)');
      await user.click(within(rowOf('I touch Myself')).getByText('Consolidate 2 selected to this version'));

      expect(apiService.setCanonicalTrackFile).toHaveBeenCalledWith(200, [100, 300]);
      expect(await screen.findByText('No possible duplicate tracks found.')).toBeInTheDocument();
    });

    test('Select all checks every version in the group and Clear selection undoes it', async () => {
      const user = userEvent.setup();
      apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
      renderPage();

      await screen.findByRole('link', { name: 'I Touch Myself' });
      await user.click(screen.getByText('Select all'));
      expect(screen.getByText('3 selected')).toBeInTheDocument();
      screen.getAllByRole('checkbox').forEach((c) => expect(c).toBeChecked());

      await user.click(screen.getByText('Clear selection'));
      expect(screen.getByText('0 selected')).toBeInTheDocument();
    });

    test('"Remove" deletes only the checked tracks on the main version\'s album and says so in the confirmation', async () => {
      const user = userEvent.setup();
      apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
      apiService.removeOtherDuplicateTracks.mockResolvedValue({ data: { success: true, removed: 1 } });
      renderPage();

      await screen.findByRole('link', { name: 'I Touch Myself' });
      await check(user, 'I Touch Myself (Remaster)');
      await user.click(within(rowOf('I touch Myself')).getByText('Remove 1 selected'));

      const prompt = window.confirm.mock.calls[0][0];
      expect(prompt).toContain('REMOVE "I Touch Myself (Remaster)" from this album and keep "I touch Myself"');
      expect(prompt).toContain('cannot be undone');
      expect(apiService.removeOtherDuplicateTracks).toHaveBeenCalledWith(200, [300]);
      expect(apiService.setCanonicalTrackFile).not.toHaveBeenCalled();
      // the unchecked version is not removed and the group is still there
      expect(await screen.findByText(/2 versions/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'I Touch Myself' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'I Touch Myself (Remaster)' })).not.toBeInTheDocument();
    });

    test('cancelling the confirmation changes nothing for either action', async () => {
      const user = userEvent.setup();
      window.confirm.mockReturnValue(false);
      apiService.getDuplicateTracks.mockResolvedValue(respond([group]));
      renderPage();

      await screen.findByRole('link', { name: 'I Touch Myself' });
      await check(user, 'I Touch Myself');
      await user.click(within(rowOf('I touch Myself')).getByText('Remove 1 selected'));
      await user.click(within(rowOf('I touch Myself')).getByText('Consolidate 1 selected to this version'));

      expect(apiService.removeOtherDuplicateTracks).not.toHaveBeenCalled();
      expect(apiService.setCanonicalTrackFile).not.toHaveBeenCalled();
      expect(screen.getByRole('link', { name: 'I Touch Myself' })).toBeInTheDocument();
    });

    test('a track with no media file cannot be the main version to consolidate to', async () => {
      const user = userEvent.setup();
      const noFile = { ...group, tracks: [mk(100, 'I Touch Myself'), { ...mk(200, 'I touch Myself'), media_file_id: null }] };
      apiService.getDuplicateTracks.mockResolvedValue(respond([noFile]));
      renderPage();

      await screen.findByRole('link', { name: 'I Touch Myself' });
      expect(within(rowOf('I touch Myself')).getByText(/file #none/)).toBeInTheDocument();
      await check(user, 'I Touch Myself');
      expect(within(rowOf('I touch Myself')).getByText('Consolidate 1 selected to this version')).toBeDisabled();
      await check(user, 'I touch Myself');
      expect(within(rowOf('I Touch Myself')).getByText('Consolidate 1 selected to this version')).toBeEnabled();
    });
  });

  describe('a group spanning several albums', () => {
    const onAlbum = (id, title, album_id, album_title) => ({ ...mk(id, title), album_id, album_title, album_artist: 'Genesis' });
    const spanning = {
      reasons: ['musicbrainz'],
      album_ids: [5, 9],
      tracks: [
        onAlbum(100, 'Invisible Touch', 5, 'Invisible Touch'),
        onAlbum(150, 'Invisible Touch (Remaster)', 5, 'Invisible Touch'),
        onAlbum(200, 'Invisible Touch', 9, 'Platinum Collection'),
      ],
    };
    const platinumRow = () => screen.getByRole('link', { name: 'Platinum Collection' }).closest('[data-track-row]');

    test('is labelled with how many albums it spans', async () => {
      apiService.getDuplicateTracks.mockResolvedValue(respond([spanning]));
      renderPage();

      await screen.findByText(/3 versions - across 2 albums/);
      expect(screen.getByRole('link', { name: 'Platinum Collection' })).toHaveAttribute('href', '/album/9');
    });

    test('"Remove" skips checked tracks on other albums, tells you, and sends only same-album ids', async () => {
      const user = userEvent.setup();
      apiService.getDuplicateTracks.mockResolvedValue(respond([spanning]));
      apiService.removeOtherDuplicateTracks.mockResolvedValue({ data: { success: true, removed: 1 } });
      renderPage();

      await screen.findByText(/across 2 albums/);
      // main = the first row (track 100, album 5); check one track on the same album and one on album 9
      const mainRow = screen.getAllByRole('listitem')[0];
      await user.click(within(rowOf('Invisible Touch (Remaster)')).getByRole('checkbox'));
      await user.click(within(platinumRow()).getByRole('checkbox'));
      await user.click(within(mainRow).getByText('Remove 1 selected'));

      const prompt = window.confirm.mock.calls[0][0];
      expect(prompt).toContain('REMOVE "Invisible Touch (Remaster)" from this album');
      expect(prompt).toContain('1 selected track is on other albums and will be left alone');
      expect(apiService.removeOtherDuplicateTracks).toHaveBeenCalledWith(100, [150]);
    });

    test('a main version with only other-album tracks checked cannot remove them, but can consolidate them', async () => {
      const user = userEvent.setup();
      apiService.getDuplicateTracks.mockResolvedValue(respond([spanning]));
      apiService.setCanonicalTrackFile.mockResolvedValue({ data: { success: true } });
      renderPage();

      await screen.findByText(/across 2 albums/);
      await user.click(within(platinumRow()).getByRole('checkbox'));
      const albumFiveRow = screen.getAllByRole('listitem')[0];
      expect(within(albumFiveRow).getByText('Remove selected')).toBeDisabled();
      expect(within(albumFiveRow).getByText('Remove selected')).toHaveAttribute('title', expect.stringMatching(/other albums/));
      await user.click(within(albumFiveRow).getByText('Consolidate 1 selected to this version'));

      expect(apiService.setCanonicalTrackFile).toHaveBeenCalledWith(100, [200]);
    });

    test('removing same-album duplicates keeps the group while tracks on other albums remain', async () => {
      const user = userEvent.setup();
      apiService.getDuplicateTracks.mockResolvedValue(respond([spanning]));
      apiService.removeOtherDuplicateTracks.mockResolvedValue({ data: { success: true, removed: 1 } });
      renderPage();

      await screen.findByText(/across 2 albums/);
      const albumFiveRows = screen.getAllByRole('listitem');
      await user.click(within(albumFiveRows[1]).getByRole('checkbox')); // "Invisible Touch (Remaster)", album 5
      await user.click(within(albumFiveRows[0]).getByText('Remove 1 selected'));

      expect(apiService.removeOtherDuplicateTracks).toHaveBeenCalledWith(100, [150]);
      expect(await screen.findByText(/2 versions - across 2 albums/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Platinum Collection' })).toBeInTheDocument();
    });
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
