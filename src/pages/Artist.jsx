// src/pages/Artist.jsx
import { Fragment, useState } from 'react';
import ImageLightbox from '../components/ImageLightbox';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { getAlbumYear } from '../utils/formatters';
import { useAuthStore } from '../stores/authStore';
import { usePlayerStore } from '../stores/playerStore';
import AlbumCard from '../components/AlbumCard';
import Track from '../components/Track';
import AboutSection from '../components/AboutSection';
import Loading from '../components/Loading';
import Retry from '../components/Retry';
import PageError from '../components/PageError';
import TagsSection from '../components/TagsSection';
import PlayActionsMenu from '../components/PlayActionsMenu';
import ContextMenu from '../components/ContextMenu';
import CardGrid from '../components/CardGrid';
import { useContextMenu } from '../hooks/useContextMenu';
import { useOvertoneAction } from '../hooks/useOvertoneAction';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';
import { useFetch } from '../hooks/useFetch';
import { shareLink } from '../utils/shareLink';
import { useIsMobile } from '../hooks/useIsMobile';

const Artist = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuthStore();
  const addTracks = usePlayerStore((s) => s.addTracks);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const { data: artistData, loading, error } = useFetch(
    () => apiService.getArtist(id).then((response) => response.data),
    [id]
  );
  const [showAllSimilar, setShowAllSimilar] = useState(false);
  const isMobile = useIsMobile();
  const [showArtistModal, setShowArtistModal] = useState(false);
  const favorite = useFavoriteToggle('artist', artistData?.artist ?? null);
  const startScopeShuffle = usePlayerStore((s) => s.startScopeShuffle);
  const [shuffleLoading, setShuffleLoading] = useState(false);
  const { overflowAction: overtoneAction, modal: overtoneModal } = useOvertoneAction(artistData?.artist?.musicbrainz_id);
  // Edit/Favorite/Share are all account-gated, so unless Overtone applies
  // (musicbrainz_id present — no login needed for that one), a logged-out
  // visitor's long-press would open an empty menu. Suppress it entirely in
  // that case rather than popping up nothing.
  const ctxMenu = useContextMenu({ shouldIgnore: (e) => (!isAuthenticated && !overtoneAction) || e.target.tagName === 'A' || !!e.target.closest('button') });

  const handleShuffleArtist = async () => {
    setShuffleLoading(true);
    try {
      await startScopeShuffle('artist', artistData.artist.id);
    } finally {
      setShuffleLoading(false);
    }
  };

  const handleAlbumClick = (album) => {
    navigate(`/album/${album.id}`);
  };

  if (loading) {
    return (
      <Loading message="Loading artist"/>
    );
  }

  if (error || !artistData || !artistData.artist) {
    return <PageError message={error ? 'Failed to load artist' : 'Artist not found'} />;
  }

  const { artist, summary, albums, singles, appears_on, performances, related_artists, members, group_albums, similar_artists } = artistData;

  const headerActions = [
    isAdmin && { key: 'edit', icon: '✎', label: 'Edit', onClick: () => navigate(`/admin/artist/${id}`) },
    isAuthenticated && {
      key: 'favorite',
      icon: favorite.icon,
      label: favorite.label,
      onClick: favorite.toggle,
    },
    overtoneAction,
    isAuthenticated && { key: 'share', icon: '📤', label: 'Share', onClick: () => shareLink({ title: artist.name, text: artist.name }) },
  ].filter(Boolean);

  const handlePlaySingles = () => {
    if (singles?.length) {
      addTracks(singles, false, { flashActivity: true }); // store auto-starts playback if idle
    }
  };

  return (
    <div style={{ padding: '.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Artist Header */}
      <div className='media-page-header' {...ctxMenu.triggerProps}>
        {/* Artist Image */}
        <div style={{ flexShrink: 0 }}>
          <img
            src={apiService.getImageUrl(artist.image_path, 'artist_page')}
            alt={artist.name}
            className='full-image'
            onClick={() => setShowArtistModal(true)}
            style={{ cursor: 'zoom-in' }}
            onError={(e) => {
              console.log(`Failed to load artist image: ${e.target.src}`);
            }}
          />
        </div>
        {showArtistModal && (
          <ImageLightbox
            imageUrl={apiService.getImageUrl(artist.image_path, 'artist_page')}
            alt={artist.name}
            title={artist.name}
            onClose={() => setShowArtistModal(false)}
          />
        )}
        
        {/* Artist Info */}
        <div style={{ flex: 1 }}>
          <div className="artist-header-title-row" style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', margin: 0, color: 'var(--color-text-primary)' }}>
              {artist.name}
            </h1>

            <div className="artist-header-actions" style={{ display: 'flex', gap: '0.5rem' }}>
              <PlayActionsMenu
                onPlay={(albums?.length > 0 || singles?.length > 0) ? handleShuffleArtist : undefined}
                disabled={shuffleLoading}
                overflowActions={headerActions}
              />
              {overtoneModal}
            </div>
          </div>

          <AboutSection
            heading="About this artist"
            summary={summary}
          />

          {members && members.length > 0 && (
            <p style={{ fontSize: '0.95rem', margin: '0.5rem 0 0 0', color: 'var(--color-text-muted)' }}>
              Members:{' '}
              {members.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && ' · '}
                  <span
                    style={{ color: '#3b82f6', cursor: 'pointer' }}
                    onClick={() => navigate(`/artist/${m.id}`)}
                  >
                    {m.name}
                  </span>
                </span>
              ))}
            </p>
          )}

          {related_artists && related_artists.length > 0 && (
            <p style={{ fontSize: '0.95rem', margin: '0.5rem 0 0 0', color: 'var(--color-text-muted)' }}>
              Related artists:{' '}
              {related_artists.map((ra, i) => (
                <span key={ra.id}>
                  {i > 0 && ' · '}
                  <span
                    style={{ color: '#3b82f6', cursor: 'pointer' }}
                    onClick={() => navigate(`/artist/${ra.id}`)}
                  >
                    {ra.name}
                  </span>
                </span>
              ))}
            </p>
          )}

          {similar_artists && similar_artists.length > 0 && (() => {
            const cap = isMobile ? 3 : 10;
            const expandedCap = 25;
            const displayed = showAllSimilar
              ? similar_artists.slice(0, expandedCap)
              : similar_artists.slice(0, cap);
            const hasMore = !showAllSimilar && similar_artists.length > cap;
            return (
              <p style={{ fontSize: '0.95rem', margin: '0.5rem 0 0 0', color: 'var(--color-text-muted)' }}>
                Similar artists:{' '}
                {displayed.map((sa, i) => (
                  <span key={sa.id}>
                    {i > 0 && ' · '}
                    {sa.has_tracks ? (
                      <span
                        style={{ color: '#3b82f6', cursor: 'pointer' }}
                        onClick={() => navigate(`/artist/${sa.id}`)}
                      >
                        {sa.name}
                      </span>
                    ) : (
                      <span>{sa.name}</span>
                    )}
                  </span>
                ))}
                {hasMore && !showAllSimilar && (
                  <span
                    style={{ color: '#3b82f6', cursor: 'pointer', marginLeft: '0.5rem' }}
                    onClick={() => setShowAllSimilar(true)}
                  >
                    {' '}+{Math.min(similar_artists.length, expandedCap) - cap} more
                  </span>
                )}
                {showAllSimilar && (
                  <span
                    style={{ color: '#3b82f6', cursor: 'pointer', marginLeft: '0.5rem' }}
                    onClick={() => setShowAllSimilar(false)}
                  >
                    {' '}show less
                  </span>
                )}
              </p>
            );
          })()}

        </div>
      </div>

      <ContextMenu
        open={ctxMenu.open}
        position={ctxMenu.position}
        onDismiss={ctxMenu.dismiss}
        onSwallowTouch={ctxMenu.swallowTouch}
        onClose={ctxMenu.close}
        actions={headerActions}
        testId="artist-header-menu-backdrop"
      />

      {/* Albums Grid */}
      {albums && albums.length > 0 && (
        <div className="artist-grid" style={{ minHeight: 'auto' }}>
          <CardGrid>
            {albums.map((album, i) => {
              const imageUrl = apiService.getImageUrl(album.image_path, 'album_small')
              const showDivider = i > 0 && !!getAlbumYear(albums[i - 1].release_year) && !getAlbumYear(album.release_year)
              return (
                <Fragment key={album.id}>
                  {showDivider && <div className="album-year-divider" />}
                  <AlbumCard
                    album={album}
                    artist={album.artist}
                    imageUrl={imageUrl}
                    onClick={handleAlbumClick}
                    hideArtist={album.artist?.id === artist.id}
                  />
                </Fragment>
              )
            })}
          </CardGrid>
        </div>
      )}

      {/* Group Discographies */}
      {group_albums && group_albums.length > 0 && group_albums.map(({ group, albums: groupAlbums }) => (
        <div className="artist-grid" style={{ minHeight: 'auto' }} key={`group-${group.id}`}>
          <h2
            style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: '0.75rem 0 0.75rem 0', color: 'var(--color-text-primary)', cursor: 'pointer' }}
            onClick={() => navigate(`/artist/${group.id}`)}
          >
            With {group.name}
          </h2>
          <CardGrid>
            {groupAlbums.map((album) => {
              const imageUrl = apiService.getImageUrl(album.image_path, 'album_small')
              return (
                <AlbumCard
                  key={`group-${group.id}-${album.id}`}
                  album={album}
                  artist={album.artist}
                  imageUrl={imageUrl}
                  onClick={handleAlbumClick}
                  hideArtist
                />
              )
            })}
          </CardGrid>
        </div>
      ))}

      {/* Singles */}
      {singles && singles.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: 0, color: 'var(--color-text-primary)' }}>
              Singles
            </h2>
            <button
              className="play-oval-toggle"
              onClick={handlePlaySingles}
              style={{ fontSize: '0.875rem' }}
            >
              ▶ Play All
            </button>
          </div>
          <div style={{
            backgroundColor: 'var(--color-bg-surface)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            overflowX: 'hidden',
          }}>
            {singles.map((track, index) => (
              <Track
                key={track.id}
                track={track}
                index={index}
                trackCount={singles.length}
                isPlaying={currentTrack?.id === track.id}
                showEdit={isAdmin}
              />
            ))}
          </div>
        </div>
      )}

      {/* Appears On */}
      {appears_on && appears_on.length > 0 && (
        <div className="artist-grid" style={{ minHeight: 'auto' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: '0.75rem 0 0.75rem 0', color: 'var(--color-text-primary)' }}>
            Appears On
          </h2>
          <CardGrid>
            {appears_on.map((album) => {
              const imageUrl = apiService.getImageUrl(album.image_path, 'album_small')
              return (
                <AlbumCard
                  key={`appears-${album.id}`}
                  album={album}
                  artist={album.artist}
                  imageUrl={imageUrl}
                  onClick={handleAlbumClick}
                />
              )
            })}
          </CardGrid>
        </div>
      )}

      {/* Performances */}
      {performances && performances.length > 0 && (
        <div className="artist-grid" style={{ minHeight: 'auto' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: '0.75rem 0 0.75rem 0', color: 'var(--color-text-primary)' }}>
            Performances
          </h2>
          <CardGrid>
            {performances.map((album) => {
              const imageUrl = apiService.getImageUrl(album.image_path, 'album_small')
              return (
                <AlbumCard
                  key={`performance-${album.id}`}
                  album={album}
                  artist={album.artist}
                  imageUrl={imageUrl}
                  onClick={handleAlbumClick}
                />
              )
            })}
          </CardGrid>
        </div>
      )}

      <TagsSection entityType="artist" entityId={parseInt(id)} isLoggedIn={isAdmin} />
    </div>
  );
};

export default Artist;
