import { useState } from 'react';
import { Link } from 'react-router-dom';

const GuestArt = ({ imageUrl }) => {
  const [failed, setFailed] = useState(false);
  if (!imageUrl || failed) {
    return <div className="jukebox-guest-row-art-placeholder" aria-hidden="true">♪</div>;
  }
  return <img className="jukebox-guest-row-art" src={imageUrl} alt="" draggable={false} onError={() => setFailed(true)} />;
};

// One browse/search row: art, title, optional subtitle, and an action slot.
// Title and subtitle are strings; callers own the fallbacks.
const GuestRow = ({ to, imageUrl, title, subtitle, action }) => {
  const body = (
    <>
      <GuestArt imageUrl={imageUrl} />
      <span className="jukebox-guest-row-text">
        <span className="jukebox-guest-row-title">{title}</span>
        {subtitle ? <span className="jukebox-guest-row-subtitle">{subtitle}</span> : null}
      </span>
    </>
  );

  return (
    <div className="jukebox-guest-row">
      {to ? <Link className="jukebox-guest-row-main" to={to}>{body}</Link> : <div className="jukebox-guest-row-main">{body}</div>}
      {action}
    </div>
  );
};

export default GuestRow;
