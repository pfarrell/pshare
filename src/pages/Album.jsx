// src/pages/Album.jsx
import { useEffect, useMemo, useState, useRef } from 'react';
import ImageLightbox from '../components/ImageLightbox';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '../services/api';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import Track from '../components/Track';
import Loading from '../components/Loading';
import PageError from '../components/PageError';
import TagsSection from '../components/TagsSection';
import ExternalLinks from '../components/ExternalLinks';
import NotesSection from '../components/NotesSection';
import CompilationArtistLinks from '../components/CompilationArtistLinks';
import AboutSection from '../components/AboutSection';
import PlayActionsMenu from '../components/PlayActionsMenu';
import AddToCollectionModal from '../components/AddToCollectionModal';
import ContextMenu from '../components/ContextMenu';
import { useContextMenu } from '../hooks/useContextMenu';
import { useOvertoneAction } from '../hooks/useOvertoneAction';
import { useFetch } from '../hooks/useFetch';
import { useEntityHeaderActions } from '../hooks/useEntityHeaderActions';
import { useQueueActions } from '../hooks/useQueueActions';
import { useIsMobile } from '../hooks/useIsMobile';
import { useSpotifyAlbumFill } from '../player/spotify/useSpotifyAlbumFill';
import { mergeAlbumFill } from '../utils/mergeAlbumFill';
import { isSpotifyTrack } from '../utils/trackSource';
import { useSummaryRetry } from '../hooks/useSummaryRetry';

const Album = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const collectionId = location.state?.collectionId ?? null;
  // Captured once at mount, not read fresh on every render: the mobile
  // now-playing bar's "go to album" tap sets this so the page can land on
  // the track that's actually playing instead of the top of the album.
  const scrollToTrackIdRef = useRef(location.state?.scrollToTrackId ?? null);
  // 'pending' → 'scrolled' (library tracks rendered) → 'done' (re-scrolled
  // once after Spotify fill rows arrived above it and pushed it down).
  const scrollStateRef = useRef('pending');
  const activeTrackRef = useRef(null);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const setPageTracks = usePlayerStore((s) => s.setPageTracks);
  const { isAdmin, isAuthenticated } = useAuthStore();
  const { data: albumData, setData: setAlbumData, loading, error, reload } = useFetch(
    () => apiService.getAlbum(id).then((response) => response.data),
    [id]
  );
  // The page response gives up on a slow Wikipedia after ~1s; ask again if it came back without a summary.
  const summary = useSummaryRetry(
    albumData?.summary,
    () => apiService.getAlbumSummary(id).then((response) => response.data.summary),
    { loaded: !loading && !!albumData, key: id }
  );
  // #72: Spotify tracks for the positions this library album is missing
  // (desktop sessions that can play Spotify only; otherwise the library list as-is).
  const isMobile = useIsMobile();
  // Keyed on the library track count so Make Single refetches and the emptied
  // position can fill.
  const fill = useSpotifyAlbumFill(albumData?.album?.id ?? null, { enabled: !isMobile, refreshKey: albumData?.tracks?.length ?? null });
  const tracks = useMemo(() => mergeAlbumFill(albumData?.tracks, fill), [albumData?.tracks, fill]);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [adjacentAlbums, setAdjacentAlbums] = useState({ prev: null, next: null });
  const { overflowAction: overtoneAction, modal: overtoneModal } = useOvertoneAction(albumData?.album?.musicbrainz_id, 'release');
  const { actions: headerActions, shouldIgnore } = useEntityHeaderActions({
    kind: 'album',
    entity: albumData?.album ?? null,
    favoriteExtras: { track_count: albumData?.tracks?.length, artist: albumData?.artist ?? null },
    canEdit: isAdmin,
    isAuthenticated,
    overtoneAction,
    share: albumData?.album ? { title: albumData.album.title, text: `${albumData.album.title} by ${albumData?.artist?.name ?? ''}` } : null,
    extras: [isAuthenticated && { key: 'collection', icon: '▣', label: 'Add to Collection', onClick: () => setShowCollectionModal(true) }],
  });
  const ctxMenu = useContextMenu({ shouldIgnore });

  useEffect(() => {
    let cancelled = false;
    apiService.getAdjacentAlbums(id, collectionId)
      .then((response) => {
        if (!cancelled) setAdjacentAlbums(response.data);
      })
      .catch((error) => {
        console.error('Error fetching adjacent albums:', error);
        if (!cancelled) setAdjacentAlbums({ prev: null, next: null });
      });
    return () => { cancelled = true; };
  }, [id, collectionId]);

  const goToAdjacentAlbum = (albumId) => {
    navigate(`/album/${albumId}`, collectionId ? { state: { collectionId } } : undefined);
  };

  useEffect(() => {
    // Lets the footer play button start playing this album's tracks when the playlist is
    // empty, instead of trying to resume a track that was never loaded.
    setPageTracks(tracks || []);
    return () => setPageTracks([]);
  }, [tracks, setPageTracks]);

  useEffect(() => {
    if (scrollStateRef.current !== 'pending' || !scrollToTrackIdRef.current || !activeTrackRef.current) return;
    activeTrackRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    scrollStateRef.current = 'scrolled'; // one-shot: only on the arrival that requested it
  }, [albumData]);

  useEffect(() => {
    if (scrollStateRef.current !== 'scrolled' || tracks === albumData?.tracks || !activeTrackRef.current) return;
    activeTrackRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    scrollStateRef.current = 'done';
  }, [tracks, albumData]);

  const queue = useQueueActions(tracks, { queueSource: albumData?.album ? { type: 'album', id: albumData.album.id } : undefined });

  const handleMadeSingle = (trackId) => {
    setAlbumData((d) => ({ ...d, tracks: d.tracks.filter((t) => t.id !== trackId) }));
  };

  // Helper function to check if a track is currently playing
  // Spotify entries have no id, so they compare by uri; the two kinds never match each other.
  const isTrackPlaying = (track) => {
    if (!currentTrack) return false;
    if (isSpotifyTrack(track)) return isSpotifyTrack(currentTrack) && currentTrack.uri === track.uri;
    return !isSpotifyTrack(currentTrack) && currentTrack.id === track.id;
  };

  if (loading) {
    return <Loading message="Loading album" />;
  }

  if (error || !albumData?.album) {
    return <PageError message={error ? 'Failed to load album' : 'Album not found'} />;
  }

  const { artist, album, secondary_artists, compilation_artists, collections, notes } = albumData;

  // Collaborators are folded into the primary artist heading itself
  // ("Elton John, Ray Charles"); every other non-primary role (featured,
  // guest, compilation) stays in the smaller "Also featuring" line below.
  const collaborators = (secondary_artists || []).filter((sa) => sa.role === 'collaborator');
  const featuringArtists = album.is_compilation
    ? (compilation_artists || [])
    : (secondary_artists || []).filter((sa) => sa.role !== 'collaborator');

  return (
    <div style={{ padding: '.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Album Header */}
      <div className='media-page-header' {...ctxMenu.triggerProps}>
        {/* Album Cover */}
        <div style={{ flexShrink: 0 }}>
          <img
            src={apiService.getImageUrl(album.image_path, 'album_page')}
            alt={`${album.title} by ${artist.name}`}
            className='full-image'
            onClick={() => setShowAlbumModal(true)}
            style={{ cursor: 'zoom-in' }}
            onError={(e) => {
              console.log(`Failed to load album image: ${e.target.src}`);
            }}
          />
        </div>
        {showAlbumModal && (
          <ImageLightbox
            imageUrl={apiService.getImageUrl(album.image_path, 'album_page')}
            alt={`${album.title} by ${artist.name}`}
            title={album.title}
            subtitle={artist.name}
            onClose={() => setShowAlbumModal(false)}
          />
        )}
        
        {/* Album Info */}
        <div className="album-info" style={{ flex: 1 }}>
          <div className="album-header-title-row">
            <div className="album-header-textblock">
              <h1 className="album-header-title" style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', color: 'var(--color-text-primary)' }}>
                {album.title}
              </h1>

              <h2 className="album-header-artist" style={{ fontSize: '1.5rem', fontWeight: 'normal', margin: '0 0 0.5rem 0' }}>
                <span style={{ color: 'var(--color-text-primary)' }}>by</span>{' '}
                <span style={{ cursor: 'pointer', color: '#3b82f6' }} onClick={() => navigate(`/artist/${artist.id}`)}>
                  {artist.name}
                </span>
                {collaborators.map((c) => (
                  <span key={c.id}>
                    {', '}
                    <span style={{ cursor: 'pointer', color: '#3b82f6' }} onClick={() => navigate(`/artist/${c.id}`)}>
                      {c.name}
                    </span>
                  </span>
                ))}
              </h2>
            </div>

            {/* Action Buttons */}
            <div className="album-header-actions" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <PlayActionsMenu
                onPlay={queue.play}
                onPlayNext={queue.playNext}
                onAddToQueue={queue.addToQueue}
                overflowActions={headerActions}
              />
              {overtoneModal}
            </div>
          </div>
          {featuringArtists.length > 0 && (
            <p className="album-header-featuring" style={{ fontSize: '0.95rem', margin: '0 0 1rem 0', color: 'var(--color-text-muted)' }}>
              {album.is_compilation ? 'Featuring:' : 'Also featuring:'}{' '}
              <CompilationArtistLinks
                artists={featuringArtists}
                mobileVisibleCount={album.is_compilation ? 5 : undefined}
              />
            </p>
          )}
          {collections?.length > 0 && (
            <p className="album-header-collections" style={{ fontSize: '0.95rem', margin: '0 0 1rem 0', color: 'var(--color-text-muted)' }}>
              In collections:{' '}
              {collections.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ', '}
                  <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => navigate(`/collection/${c.id}`)}>
                    {c.name}
                  </span>
                </span>
              ))}
            </p>
          )}

          {(adjacentAlbums.prev || adjacentAlbums.next) && (
            <div className="album-header-adjacent-nav" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', margin: '0 0 1rem 0', fontSize: '0.95rem' }}>
              <div style={{ textAlign: 'left' }}>
                {adjacentAlbums.prev && (
                  <span style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }} onClick={() => goToAdjacentAlbum(adjacentAlbums.prev.id)}>
                    ‹ {adjacentAlbums.prev.title}
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                {adjacentAlbums.next && (
                  <span style={{ cursor: 'pointer', color: 'var(--color-text-muted)' }} onClick={() => goToAdjacentAlbum(adjacentAlbums.next.id)}>
                    {adjacentAlbums.next.title} ›
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="album-header-about">
            <AboutSection
              heading="About this album"
              summary={summary}
            />
          </div>

          {/* Album Description */}
          {album.description && (
            <div className="album-header-description">
              <p style={{ lineHeight: '1.6', color: 'var(--color-text-secondary)', margin: '0 0 1rem 0' }}>
                {album.description}
              </p>
            </div>
          )}
        </div>
      </div>

      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        onClose={ctxMenu.close}
        actions={headerActions}
        testId="album-header-menu-backdrop"
      />

      {showCollectionModal && (
        <AddToCollectionModal
          album={album}
          onClose={() => setShowCollectionModal(false)}
        />
      )}

      {/* Track List */}
      <div style={{
        backgroundColor: 'var(--color-bg-surface)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        overflowX: 'hidden',
        overflowY: 'visible'
      }}>
        {tracks.map((track, index) => {
          const spotify = isSpotifyTrack(track);
          return (
            <Track
              key={spotify ? track.uri : (track.id || index)}
              ref={!spotify && track.id === scrollToTrackIdRef.current ? activeTrackRef : undefined}
              scrollAnchor={!spotify && track.id === scrollToTrackIdRef.current}
              track={track}
              index={index}
              trackCount={tracks.length}
              isPlaying={isTrackPlaying(track)}
              showMakeSingle={isAdmin && !spotify}
              showEdit={isAdmin && !spotify}
              onMadeSingle={handleMadeSingle}
              markSpotify={spotify}
              hideArtist={spotify && track.artist?.name === artist?.name}
            />
          );
        })}
      </div>

      <ExternalLinks entityType="album" entityId={parseInt(id)} />
      <TagsSection entityType="album" entityId={parseInt(id)} isLoggedIn={isAdmin} />
      <NotesSection entityType="album" entityId={parseInt(id)} notes={notes || []} isLoggedIn={isAuthenticated} onChange={reload} />
    </div>
  );
};

export default Album;
