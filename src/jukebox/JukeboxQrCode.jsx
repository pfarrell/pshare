import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { apiService } from '../services/api';

// Renders the enqueue URL as a scannable QR code, plus a rotate action —
// see docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md.
// Regenerating invalidates the old token immediately server-side; the
// parent (JukeboxProfilePicker) is responsible for rebuilding `url` from
// the new token via onRotated.
const JukeboxQrCode = ({ url, deviceId, onRotated }) => {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url).then((result) => { if (!cancelled) setDataUrl(result); });
    return () => { cancelled = true; };
  }, [url]);

  const handleRotate = async () => {
    const res = await apiService.rotateJukeboxToken(deviceId);
    onRotated(res.data.enqueue_token);
  };

  return (
    <div className="jukebox-qr-code">
      {dataUrl && <img src={dataUrl} alt="QR code" />}
      <button type="button" onClick={handleRotate}>Get new QR code</button>
    </div>
  );
};

export default JukeboxQrCode;
