// Jukebox-only album tile for the Quick Hit grid. Deliberately not AlbumCard:
// that component is shared with the normal site and carries a play button,
// ⋯ menu and favorite/collection actions, none of which belong on a kiosk tile
// whose one job is "tap to open this album's tracks".
const QuickHitAlbumTile = ({ album, imageUrl, onSelect }) => (
  <button type="button" className="jukebox-quick-hit-tile" onClick={() => onSelect(album)}>
    {imageUrl ? (
      // alt="" on purpose: the title/artist text below already names the
      // album, and a broken image would otherwise render alt text over the art.
      <img className="jukebox-quick-hit-art" src={imageUrl} alt="" draggable={false} />
    ) : (
      <div className="jukebox-quick-hit-art-placeholder" aria-hidden="true">♪</div>
    )}
    <span className="jukebox-quick-hit-title">{album.title}</span>
    <span className="jukebox-quick-hit-artist">{album.artist?.name ?? ''}</span>
  </button>
);

export default QuickHitAlbumTile;
