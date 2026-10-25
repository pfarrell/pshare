import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiService } from '../services/api';

const MESSAGES = {
  not_premium: "That Spotify account isn't Premium",
  failed: "Couldn't connect Spotify. Try again.",
};

// Account page card for linking Spotify (the user's own account and any jukebox devices).
// Renders nothing unless the backend says this user is allowed.
const SpotifyConnectionCard = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const message = MESSAGES[searchParams.get('spotify')] ?? null;

  const load = useCallback(async () => {
    try {
      const res = await Promise.resolve().then(() => apiService.getSpotifyStatus());
      setStatus(res?.data ?? null);
    } catch (err) {
      console.warn('Spotify status unavailable', err);
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const disconnect = async (key, target, deviceId) => {
    setBusyKey(key);
    try {
      await (deviceId === undefined
        ? apiService.disconnectSpotify(target)
        : apiService.disconnectSpotify(target, deviceId));
    } catch (err) {
      console.warn('Spotify disconnect failed', err);
    }
    await load();
    setBusyKey(null);
  };

  if (!status?.allowed) return null;

  const devices = Array.isArray(status.devices) ? status.devices : [];

  const renderRow = (key, label, connected, target, deviceId) => (
    <div className="spotify-card-row" key={key}>
      <span className="spotify-card-label">{label}</span>
      {connected ? (
        <button
          className="spotify-card-button danger"
          disabled={busyKey === key}
          onClick={() => disconnect(key, target, deviceId)}
        >
          Disconnect
        </button>
      ) : (
        <a className="spotify-card-button" href={apiService.spotifyConnectUrl(target, deviceId)}>
          Connect Spotify
        </a>
      )}
    </div>
  );

  return (
    <div className="spotify-card">
      <div className="spotify-card-title">Spotify</div>
      {message && <div className="spotify-card-message">{message}</div>}
      {renderRow('user', 'Spotify', !!status.connected, 'user')}
      {devices.map((d) => renderRow(`device-${d?.id}`, `Jukebox: ${d?.name ?? ''}`, !!d?.connected, 'device', d?.id))}
    </div>
  );
};

export default SpotifyConnectionCard;
