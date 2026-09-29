import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Renders the enqueue URL as a scannable QR code — see
// docs/superpowers/specs/2026-09-25-jukebox-server-queue-design.md. There is
// deliberately no rotate action here: kiosk users shouldn't be able to
// invalidate the token; rotation is an admin operation (the API route still
// exists at POST /jukebox/devices/:id/rotate-token).
const JukeboxQrCode = ({ url }) => {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url).then((result) => { if (!cancelled) setDataUrl(result); });
    return () => { cancelled = true; };
  }, [url]);

  return (
    <div className="jukebox-qr-code">
      {dataUrl && <img src={dataUrl} alt="QR code" />}
    </div>
  );
};

export default JukeboxQrCode;
