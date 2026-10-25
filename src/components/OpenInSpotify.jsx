// src/components/OpenInSpotify.jsx
// Small Spotify logo + offsite arrow linking out to Spotify (experimental, #72).
// SpotifyLogo is also the subtle "this is from Spotify" marker on album covers.

export const SpotifyLogo = ({ className = 'spotify-open-logo' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="12" fill="#1db954" />
      <path
        d="M17.5 16.6a.75.75 0 0 1-1 .25c-2.85-1.74-6.43-2.13-10.65-1.17a.75.75 0 1 1-.33-1.46c4.62-1.05 8.58-.6 11.73 1.33.35.22.47.69.25 1.05Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.26-2-8.22-2.58-12.08-1.41a.94.94 0 1 1-.54-1.8c4.4-1.33 9.86-.69 13.6 1.61.44.27.58.85.31 1.29Zm.13-3.4C15.2 7.6 8.76 7.39 5.04 8.52a1.13 1.13 0 1 1-.65-2.16c4.27-1.3 11.38-1.05 15.86 1.61a1.13 1.13 0 0 1-1.15 1.96Z"
        fill="#000"
      />
  </svg>
);

const OpenInSpotify = ({ url, name }) => {
  if (typeof url !== 'string' || !url) return null;
  return (
    <a
      className="spotify-open-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${name} in Spotify`}
      title="Open in Spotify"
    >
      <SpotifyLogo />
      <span className="spotify-open-arrow" aria-hidden="true">↗</span>
    </a>
  );
};

export default OpenInSpotify;
