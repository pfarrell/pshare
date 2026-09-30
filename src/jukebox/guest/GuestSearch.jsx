import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiService } from '../../services/api';
import { useGuest } from './useGuest';
import { useGuestFetch } from './useGuestFetch';
import GuestRow from './GuestRow';
import GuestAddButton from './GuestAddButton';
import GuestStatus from './GuestStatus';
import { plural } from './plural';

const MIN_QUERY = 3;
const PREVIEW = 5;

const Section = ({ title, items, render }) => {
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;
  const visible = showAll ? items : items.slice(0, PREVIEW);
  return (
    <section className="jukebox-guest-section">
      <h2>{title}</h2>
      {visible.map(render)}
      {items.length > PREVIEW && !showAll && (
        <button type="button" className="jukebox-guest-show-all" onClick={() => setShowAll(true)}>
          Show all {items.length}
        </button>
      )}
    </section>
  );
};

const GuestSearch = () => {
  const { token, path } = useGuest();
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const tooShort = query.length < MIN_QUERY;

  const { data, error, loading, retry } = useGuestFetch(
    () => (tooShort ? Promise.resolve({ data: null }) : apiService.jukeboxSearch(token, query)),
    [token, query],
  );

  if (tooShort) return <div className="jukebox-guest-message">Type at least 3 characters to search.</div>;
  if (loading || error) return <GuestStatus loading={loading} error={error} onRetry={retry} />;

  const results = data?.results ?? [];
  const of = (type) => results.filter((r) => r.type === type).map((r) => r.data).filter(Boolean);
  const artists = of('artist');
  const albums = of('album');
  const playlists = of('playlist');
  const collections = of('collection');
  const tracks = (data?.tracks ?? []).filter(Boolean);

  if (![artists, albums, playlists, collections, tracks].some((list) => list.length)) {
    return <div className="jukebox-guest-message">No results for "{query}".</div>;
  }

  // Tracks lead: a song-title search is the common case on a phone, and the
  // fuzzy artist/album matches above them pushed tracks off the first screens.
  return (
    <>
      <Section title="Tracks" items={tracks} render={(t) => (
        <GuestRow key={t.id} title={t.artist?.name ? `${t.title ?? ''} - ${t.artist.name}` : (t.title ?? '')} subtitle={t.album?.title ?? ''}
          action={<GuestAddButton itemKey={`track-${t.id}`} label={t.title ?? 'track'} trackIds={[t.id]} />} />
      )} />
      <Section title="Artists" items={artists} render={(a) => (
        <GuestRow key={a.id} to={path(`artist/${a.id}`)} imageUrl={apiService.getImageUrl(a.image_path, 'artist_search')}
          title={a.name ?? ''} subtitle={plural(a.album_count, 'album')}
          action={<GuestAddButton itemKey={`artist-${a.id}`} label={a.name ?? 'artist'} kind="artist" id={a.id} variant="all" />} />
      )} />
      <Section title="Albums" items={albums} render={(a) => (
        <GuestRow key={a.id} to={path(`album/${a.id}`)} imageUrl={apiService.getImageUrl(a.image_path, 'album_small')}
          title={a.title ?? ''} subtitle={a.artist?.name ?? ''}
          action={<GuestAddButton itemKey={`album-${a.id}`} label={a.title ?? 'album'} kind="album" id={a.id} variant="all" />} />
      )} />
      <Section title="Playlists" items={playlists} render={(p) => (
        <GuestRow key={p.id} to={path(`playlist/${p.id}`)} imageUrl={apiService.getImageUrl(p.image_path, 'album_small')}
          title={p.name ?? ''} subtitle={plural(p.track_count, 'track')}
          action={<GuestAddButton itemKey={`playlist-${p.id}`} label={p.name ?? 'playlist'} kind="playlist" id={p.id} variant="all" />} />
      )} />
      <Section title="Collections" items={collections} render={(c) => (
        <GuestRow key={c.id} to={path(`collection/${c.id}`)} imageUrl={apiService.getImageUrl(c.image_path, 'album_small')}
          title={c.name ?? ''} subtitle={plural(c.album_count, 'album')}
          action={<GuestAddButton itemKey={`collection-${c.id}`} label={c.name ?? 'collection'} kind="collection" id={c.id} variant="all" />} />
      )} />
    </>
  );
};

export default GuestSearch;
