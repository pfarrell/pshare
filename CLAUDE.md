# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (root)

```bash
npm run dev          # Vite dev server — proxies /api → localhost:3000 (prefix stripped)
npm run build        # Production build (base URL /bemused/app/)
npm run lint         # ESLint
npm run deploy       # Build and rsync frontend to /var/www/bemused/shared/public/frontend on patf.com
npm run full-deploy  # Build and deploy both frontend and backend
```

### Backend (server/)

```bash
npm run dev          # tsx watch — API server on port 3000
npm run build        # TypeScript compile
npm run start        # Run compiled JS
npm run worker       # Upload queue worker — must run as a separate process alongside dev server
npm run deploy       # Build and deploy to /var/www/bemused-node/releases/<timestamp> with symlinked current
npm run db:snapshot  # Dump PostgreSQL database to snapshots/
npm run db:restore   # Restore from a snapshot
npm run db:schema:dump  # Dump schema-only SQL to schema.sql
npm run db:reset     # Reset database
```

**Deploy commands by change type**: `npm run deploy` (frontend changes only), `cd server && npm run deploy` (backend changes only), `npm run full-deploy` (both layers changed).

**Deploying is a manual, per-layer step — committing to `main` does not make code live.** Frontend and backend are deployed independently and can drift out of sync with each other and with `main` by hours or days; a commit that's been on `main` for a while may simply never have been deployed. Before concluding a feature is "broken" in production, run `npm run deploy:status` (works from either `/home/pfarrell/proj/bemused` or `/home/pfarrell/proj/bemused/server` — it reports both layers) and read its per-layer output rather than assuming the code itself is at fault. See the `check-deploy` skill for details on what the output means.

## Specs and Plans

Design specs live in `docs/superpowers/specs/` and implementation plans in `docs/superpowers/plans/`. Never commit these files to git.

Frontend tests use Vitest + React Testing Library. Run with `npm test` (root). Test files live alongside source as `*.test.js` / `*.test.jsx`. Backend has a growing test suite using Node's built-in test runner (`cd server && npm test`, i.e. `tsx --test 'src/**/*.test.ts'`); files live alongside source as `*.test.ts` (e.g. `services/artistMergeService.test.ts`, `utils/http.test.ts`). Coverage is partial, not comprehensive — most admin routes still have no tests, verified only by the manual dev-DB testing pattern used throughout `docs/superpowers/plans/`. Check for an existing `*.test.ts` file next to whatever you're touching before assuming there's nothing to run or extend.

## Architecture

This is a React SPA monorepo for a personal music streaming service called "P·Share". The monorepo has two layers: `src/` (React SPA frontend) and `server/` (Hono + Kysely + PostgreSQL backend). The Vite dev server proxies `/api` → `http://localhost:3000`, stripping the `/api` prefix — backend routes do **not** use an `/api` prefix. In production, the frontend deploys to `/var/www/bemused/shared/public/frontend` and the backend deploys to `/var/www/bemused-node/` with symlinked releases.

Images are served externally: `https://patf.net/images/` in production, `/images` in dev. The backend deploy symlinks `public/images` from a NAS share rather than serving images through the Node app.

## Frontend

**Routing** (`src/App.jsx`): All routes render inside `Layout`. The basename switches between `/` (dev) and `/bemused/app` (prod) via `import.meta.env.DEV`. Admin routes are wrapped in `<ProtectedRoute requireAdmin>`. Routes:
- `/` — Home (artist or album grid)
- `/search` — Search
- `/login`, `/signup` — Auth forms
- `/artist/:id`, `/album/:id` — Artist and album detail
- `/library` — User library
- `/playlists`, `/playlist/:id` — Playlists list and detail
- `/collections`, `/collection/:id` — Collections list and detail
- `/tags/:name` — Tag browse
- `/admin` — Admin hub (links to Upload, New, Logs) (require admin)
- `/admin/artist/:id`, `/admin/album/:id`, `/admin/collection/:id`, `/admin/playlist/:id` — Admin edit pages (require admin)
- `/admin/upload`, `/admin/logs`, `/admin/new` — Admin upload, log viewer, entity creation (require admin)

**There is no error boundary anywhere in the app.** An uncaught exception during render — anywhere in the component tree — unmounts the entire React tree and leaves a blank white screen, with no fallback UI. This makes defensive handling of nullable/malformed API data a correctness requirement, not a nicety: prefer `field?.subfield` with a string/number fallback, never `field?.subfield || field` (if `field` is an object, that pattern renders the raw object as a JSX child, which React throws on rather than stringifying — this exact bug crashed the player on tracks with a null artist). When debugging a report of "the whole app went blank," suspect an uncaught render exception first.

**Layout** (`src/components/Layout.jsx`): Fixed header (`.header-content`) with `SearchBar`, a `ViewModeToggle` pill rendered directly after `SearchBar` (desktop-only — hidden below 768px via its `.view-mode-toggle-desktop` class — and controls `viewModeStore`), active tag filter chip (links to `/tags/:name`, has clear button), and a hamburger/user menu whose contents differ by auth state. The hamburger/user-menu toggle button has `aria-label="Menu"` (added so tests can target it by accessible name rather than DOM position, since `ViewModeToggle`'s two buttons now render before it in the DOM). Logged in: a bordered username row at top (navigates to `/account`, styled identically to the rows below it — full-width, `0.5rem 1rem` padding, hover highlight), then Home, Playlists, Collections, Favorites, and (admin only) a single Admin link to the `/admin` hub — Home View toggle, Tag Filter, and Logout all moved off this menu and onto the Account page. Logged out: unchanged from before — `HomeViewToggle` (artists/albums) and `TagFilterControl` (tag autocomplete input) rendered directly in the dropdown, plus Home/Playlists/Collections/Login-Sign-Up nav links. `HomeViewToggle` and `TagFilterControl` (`src/components/`) are standalone components shared between this dropdown and `Account.jsx`'s cards — each takes a `variant` prop (`'dark'` default for the dropdown, `'light'` for Account's white cards) that swaps surface colors only. `TagFilterControl` fetches `apiService.getTags()` on its own mount (not lazily when the menu opens, and not lifted into `Layout` state) but caches the promise at module scope (`src/utils/tagsCache.js`) so the network call happens at most once per page load no matter how many times it mounts/unmounts (dropdown open/close, Account page visits). Scrollable `.main-content` div with pull-to-refresh (increments `refreshKey` to remount current page on pull ≥ 60px). The fixed footer (`NowPlaying` + `MusicPlayerWrapper`) is rendered in `src/App.jsx`, not `Layout.jsx` — it sits outside `<Routes>` so `MusicPlayerWrapper`/`usePlayerEngine` never unmount during route changes.

**Audio player**: `playerStore` (Zustand) is the single source of truth for all playback state and owns the transport logic (play/pause/seek/queue management). It drives **two** `<audio>` elements (`audioElementA`/`audioElementB`) rather than one, tracked by `activeSlot` (`'a' | 'b'`) — `getActiveAudio()`/`getStandbyAudio()` resolve which is which. This exists for gapless playback: while the active element nears the end of a track (last ~15s, per `usePlayerEngine`'s `timeupdate` handler), the standby element is silently pre-loaded with whatever `nextTrackIndex` resolves to (kept in sync by every playlist-mutating action, including a precomputed shuffle pick so prefetching works in shuffle mode too). When the active element ends, `playNext()` flips `activeSlot` and plays the standby element directly if it's already loaded and ready (`readyState >= 3`) — no network refetch, no decode restart — falling back to a normal load on the active element otherwise (slow connection, very short track, or the queue changed since prefetching started). `usePlayerEngine(audioRefA, audioRefB)` (`src/hooks/usePlayerEngine.js`) is the only code that touches the real `<audio>` DOM elements — it binds both into the store, bridges DOM events to store actions (guarding each handler so only events from the *active* element affect state — the standby element fires its own `loadstart`/`canplay`/etc. while prefetching, which must not be mistaken for the live track buffering), fires `apiService.log(id)` at the 5-second mark, drives the prefetch/re-target logic, and drives the Media Session API (feature-detected via `'mediaSession' in navigator`) for lock-screen/Bluetooth controls. The very first `playTrackAtIndex` call also "unlocks" the standby element for iOS Safari by playing/pausing a silent clip on it inside that same gesture-originated call — otherwise the first gapless handoff's `.play()` call on a never-before-played element can be silently blocked, since iOS only allows a media element's first `play()` if it happens synchronously inside a user gesture. `MusicPlayerWrapper` renders both `<audio>` elements and transport controls from store state via `usePlayerEngine`; `PlaylistDrawer` renders the slide-out queue (drag-reorder on desktop, tap/scroll-disambiguating touch handling on mobile). Every component that wants to play audio calls `playerStore` actions directly (`addTrack`, `addTracks`, `clearPlaylist`, `playTrackAtIndex`, `setPlaylist`) — these actions internally decide whether to auto-start playback (callers never need to check "is anything playing").

**State management** (`src/stores/`): Five Zustand stores:
- `playerStore` — `audioElementA`, `audioElementB`, `activeSlot`, `nextTrackIndex`, `standbyUnlocked`, `playlist`, `currentTrackIndex`, `currentTrack`, `isPlaying`, `isBuffering`, `currentTime`, `duration`, `playlistFinished`, `shuffle`, `shuffleHistory`, `drawerOpen`, `activityPulseToken`. `audioElementA`/`audioElementB` are the two live `<audio>` DOM nodes (one active, one standby for gapless prefetch), bound in by `usePlayerEngine`.
- `authStore` — `user`, `isAuthenticated`, `isAdmin`, `loading`. Auth uses httpOnly cookie (set by backend). Calls `initialize()` on app start to check `/auth/me`. On login/init, populates `tagFilterStore` from `user.default_tag`.
- `tagFilterStore` — `activeTag` (persisted to `localStorage` as `tag-filter`). Tag filters the home feed and is shown as a chip in the header.
- `homeModeStore` — `mode` (`'artists'` | `'albums'`, persisted to `localStorage` as `home-mode`). Controls whether Home shows an artist grid or album grid.
- `viewModeStore` — `mode` (`'card'` | `'list'`, persisted to `localStorage` as `browse-view-mode`). Controls whether non-admin browse grids (Home, Search, Library, Artist, Collection, TagPage, Playlists, Collections) render as square cards or compact rows on desktop; mobile always renders rows regardless of this store's value.

**API** (`src/services/api.js`): Single axios instance. Base URL is `/api` in dev (proxied to `localhost:3000`) and `/bemused/api` in production. `withCredentials: true` for httpOnly cookie auth. Methods are grouped by domain: auth, artists, albums, tags, search, log, admin (artist/album/track/relation/image ops), upload, playlists, collections, image management. `apiService.getImageUrl(imagePath, context)` constructs absolute URLs at `https://patf.net/images/` (prod) or `/images` (dev) using context strings: `artist_search`, `artist_page`, `album_small`, `album_page`. `apiService.log(id)` fires at the 5-second mark of each track, tracked by `usePlayerEngine`.

**Pages** (`src/pages/`):
- `Home` — random artists or albums grid (controlled by `homeModeStore`), tag-filtered via `tagFilterStore`
- `Artist` (`/artist/:id`) — fetches `getArtist(id)` → `{ artist, summary, albums }`; clicking artist name reloads
- `Album` (`/album/:id`) — fetches `getAlbum(id)` → `{ artist, album, tracks, summary }`; clicking album title reloads
- `Search` (`/search?q=...`) — fetches `search(query)` → `{ artists, albums, tracks, playlists }`
- `Library` — user's personal library view
- `Playlists` — list all playlists
- `Playlist` — single playlist with track list
- `Collections` — list all collections
- `Collection` — single collection with album list
- `TagPage` — browse artists and albums tagged with a given tag
- `Login`, `Signup` — authentication forms
- `Account` (`/account`) — signed-in user's profile, Home View toggle, Tag Filter (with "set default"), connected accounts (Google link/disconnect), set-password form, Log Out
- `Admin` (`/admin`) — hub linking to Upload, New, and Logs; the only admin entry point in the hamburger menu
- `AdminArtist`, `AdminAlbum` — edit metadata, manage images and artist relations
- `AdminCollection`, `AdminPlaylist` — edit collection or playlist metadata and contents
- `AdminUpload` — upload audio files; polls upload queue status
- `AdminLogs` — paginated playback log viewer
- `AdminNew` — create new artist or album records

**Key components** (`src/components/`):
- `Track` — accepts `{ track, index, trackCount, includeMeta, isPlaying }`; `includeMeta=true` shows album/artist links (used in Search)
- `SearchBar` — search input, navigates to `/search?q=…`
- `NowPlaying` — current track display in footer
- `HomeViewToggle` — segmented Artists/Albums control for the home feed; `variant` prop (`'dark'`/`'light'`) picks surface colors for the hamburger dropdown vs. Account's white cards; used by both
- `TagFilterControl` — tag-filter input with autocomplete; `allowSetDefault` shows a "set default" action (Account only), `variant` prop matches `HomeViewToggle`'s; fetches the tag list once per page load via a module-scope cache (`src/utils/tagsCache.js`), not per-mount
- `ViewModeToggle` — desktop-only card/list pill in the header, controls `viewModeStore`
- `CardGrid` — `forwardRef` wrapper that replaces raw `<div className="artist-grid-container">` markup everywhere it's used; adds a `view-list` CSS class (grid → flex-column) when `!isMobile && mode === 'list'`. Every browse grid should go through this component rather than hand-rolling the container div.
- `MusicPlayerWrapper` (`src/components/player/`) — renders the `<audio>` element and transport controls (play/pause/seek/next/prev/shuffle) from `playerStore` state via `usePlayerEngine`
- `PlaylistDrawer` (`src/components/player/`) — slide-out queue view; drag-reorder on desktop, tap/scroll-disambiguating touch handling on mobile, delete-per-row, activity overlay for just-added tracks
- `ProtectedRoute` — redirects to `/login` if not authenticated; `requireAdmin` prop also enforces admin role

**Styling**: Tailwind v4 (nominally) + custom CSS in `src/index.css`. CSS classes (`.app-header`, `.main-content`, `.app-footer`, `.artist-grid`, `.track-item`, `.now-playing`, etc.) are defined there. Fixed header/footer, 4.5em on desktop / `--mb` (currently `2.75rem`) on mobile. Many mobile overrides use `!important` due to competing inline styles on page components.

**Tailwind is installed but not actually wired into the build.** `src/index.css` uses v3-style `@tailwind base; @tailwind components; @tailwind utilities;` directives, but there's no `postcss.config.js` and no `@tailwindcss/postcss`/`@tailwindcss/vite` plugin in `vite.config.js` — confirmed by inspecting `dist/assets/*.css`, where those directives appear verbatim, unprocessed. Tailwind's preflight (the `*, ::before, ::after { box-sizing: border-box }` reset) has therefore never actually run; every element defaults to the browser's native `box-sizing: content-box` unless a rule sets it explicitly. Any custom CSS that combines an explicit `height`/`width` with `padding` (the safe-area-inset pattern below is the main offender) must set `box-sizing: border-box` itself — don't assume Tailwind's reset covers it. Fixing the Tailwind integration properly (so utility classes and preflight actually work) is a separate, codebase-wide task, not something to bundle into an unrelated fix.

**PWA / installed-app considerations** (P·Share is meant to be used as an iOS home-screen PWA, via `vite-plugin-pwa` — see `manifest`/`workbox` config in `vite.config.js`):
- **Safe-area insets only have real, non-zero values in standalone/installed mode.** In a normal mobile Safari tab `env(safe-area-inset-top/bottom)` resolve to `0` (the browser's own chrome already occupies that space); in the installed PWA (`display-mode: standalone`) they're real (~59px top / ~34px bottom on an iPhone with Dynamic Island). **A CSS bug that only manifests with non-zero insets will look perfectly fine in Safari and only break once installed to the home screen** — always verify layout changes around `.app-header`/`.app-footer`/`.music-player-playlist-container`/`.main-content` on the actual installed app, not just in mobile Safari or devtools device emulation (which also reports `0` insets).
- Mobile chrome height/inset math lives behind a single tunable custom property: `:root { --mb: 2.75rem; }` (inside the `@media (max-width: 768px)` block in `src/index.css`). `.app-header`/`.app-footer` compute `height: calc(var(--mb) + env(safe-area-inset-*))` and also set `padding: env(safe-area-inset-*)` so content clears the notch/home-indicator — this only avoids double-counting the inset under `box-sizing: border-box` (see above; this is exactly why that property had to be added explicitly).
- There's a separate `@supports (-webkit-touch-callout: none)` block with its own `.main-content` height override for iOS Safari quirks. Because it has the same selector specificity and `!important` as the mobile breakpoint's rule, **whichever one is later in the file wins outright** — if you edit the inset math in one, you must mirror it in the other, or remove the duplicate. A `@media (display-mode: standalone)` block also existed purely to handle `.app` height (`100vh`/`100dvh` fallback); it used to *also* override `.main-content` height with a stale hardcoded value, which was dead code in practice (shadowed by the `@supports` block) but still worth deleting rather than leaving as a trap.
- Service worker (`vite-plugin-pwa`, `registerType: 'autoUpdate'`, Workbox `generateSW`) precaches `index.html` and all built assets. In practice, an installed iOS PWA can still serve a stale precached shell after a deploy even following a force-quit + relaunch — when debugging "my fix isn't showing up," verify the *server* is serving the new build first (e.g. `curl` the deployed CSS/JS and diff against a local build) before assuming it's a caching problem on the phone.
- Safe-area inset math can't be meaningfully unit-tested in jsdom (it has no concept of `env()` or `display-mode`). Verify visually — a screenshot from the actual installed PWA, pixel-measured if needed, was what caught the box-sizing bug above (the `:active` pseudo-class doesn't reliably render either, on touch, since handlers often unmount the element before the transition can paint).
- `isMobileDevice()` (`src/utils/device.js`) — used by `Wikipedia.jsx` to pick a mobile vs. desktop Wikipedia URL — checks `window.innerWidth <= 768` OR a mobile-UA regex. Safari's per-site "Request Desktop Website" toggle changes *both* signals at once (reports a desktop-width viewport and swaps `navigator.userAgent`), silently defeating this check. It's per-site and persistent, and can carry over into an installed PWA on the same origin, surviving a reinstall. If a mobile-only feature "doesn't work" on one specific device/installed PWA while working fine elsewhere, check this toggle before assuming a code or cache bug.

## Backend

**Entry point** (`server/src/index.ts`): Hono app on port 3000 (configurable via `PORT` env var). Global middleware: `cors` (all origins in dev; allowlist of patf.net/patf.com/172.16.1.10 in prod) and `authMiddleware` (extracts user from httpOnly `auth` cookie into `c.get('user')`). Admin routes mount a sub-app with `requireAdmin` guard.

**Route modules** (`server/src/routes/`):
- `auth` (`/auth`) — login, logout, signup, `/auth/me`, default-tag update
- `artists` (`/artists`, `/artist`) — list, random (tag-filterable), detail; singular alias used by frontend
- `albums` (`/albums`, `/album`) — list, random (tag-filterable), detail; singular alias
- `search` (`/search`) — full-text search across artists, albums, tracks, playlists
- `streams` (`/stream`) — audio file streaming
- `logs` (`/log`) — playback event logging; admin log viewer
- `playlists` (`/playlist`, `/playlists`, `/top`, `/newborns`, `/surprise`) — playlist CRUD and auto-generated views
- `collections` (`/collection`, `/collections`) — collection CRUD
- `tags` (`/tags`) — tag CRUD; `/tags/:name/content` for tag browse
- `admin` (`/admin`) — artist/album/track admin ops, image download, artist relations, stub merging (protected by `requireAdmin`)
- `upload` (`/admin/upload`) — multipart file upload (2GB body limit); inserts to `upload_queue` and returns immediately; processing deferred to worker

**Database** (`server/src/db/database.ts`): Kysely with `pg.Pool` (max 10 connections). Connection string from `BEMUSED_DB` env var. Tables:
- `artists` — name, image path, Wikipedia text, MusicBrainz ID + confidence + status
- `albums` — title, `artist_id`, year, disc number, genre, image path, Wikipedia, MusicBrainz metadata
- `tracks` — title, number, year, `album_id`/`artist_id`, media file FK, Wikipedia, duration
- `media_files` — file system records linking audio files to entities; `entity_id`/`entity_type` for current records. `tracks.media_file_id → media_files.id` has a real FK (`ON DELETE RESTRICT`); multiple tracks may share one media_files row when the same recording (matched by file_hash) appears on more than one release — going forward only, no backfill of pre-existing library duplicates yet.
- `playlists` — named playlists with optional user ownership and auto-generated flag
- `playlist_tracks` — ordered join table for playlist ↔ track
- `logs` — playback events: track/album/artist IDs, action, IP, timestamp
- `favorites` — user ↔ entity favorites by kind (artist/album/track)
- `upload_queue` — pending/processing/completed/failed upload jobs with full file and metadata fields
- `users` — username, email, bcrypt password, admin flag, default_tag
- `user_playlists` — user ↔ playlist with role
- `artist_albums` — many-to-many artist ↔ album with role (primary/compilation/featured/guest/collaborator) and order
- `artist_relations` — similar/related artist pairs with source, similarity score, `is_hidden`, `force_show`
- `external_lookups` — cache of results from external service lookups (entity_type, entity_id, service)
- `images` — image records for artists/albums with source, status, dimensions, primary flag
- `collections` — named album collections
- `collection_albums` — ordered join table for collection ↔ album
- `tags` — tag names
- `albums_tags`, `artists_tags`, `tags_tracks` — many-to-many tag associations

**`albums.artist_id` and `tracks.artist_id`/`tracks.album_id` have no foreign key constraint** — confirmed via `pg_constraint`, this is not an oversight in isolated code, it's the actual schema. Deleting an artist (directly, or via the `admin` route's stub-merging) does not cascade or get rejected; it silently orphans any album/track still pointing at it, which then 404s (`GET /album/:id` explicitly checks the artist exists) or surfaces with a null artist elsewhere (e.g. search, which left-joins). Any code path that deletes or merges an `artists` row must first reassign or null out dependent `albums.artist_id`/`tracks.artist_id` rows — the database will not catch a missed case.

**Auth** (`server/src/middleware/auth.ts`): JWT in httpOnly `auth` cookie, 24h expiry. `authMiddleware` runs globally and sets `c.get('user')` if cookie is valid. `requireAdmin` blocks non-admin users with 403. Passwords hashed with bcrypt.

**LAN access via 172.16.1.10**: The same machine that serves `https://patf.com` is also reachable on the home LAN at `http://172.16.1.10` (plain HTTP, no TLS — nginx has a dedicated `server_name 172.16.1.10` block in `server/bemused.nginx.conf` that does NOT redirect to HTTPS, unlike the patf.com block). Two backend functions branch on the request's `Host` header (passed through unchanged by nginx's `proxy_set_header Host $host`) to keep LAN traffic on the LAN: `cookieOptionsForRequest()` in `server/src/routes/auth.ts` issues a host-only, non-`Secure` cookie for `Host: 172.16.1.10` instead of the usual `Secure`, `domain: .patf.com` cookie, and `streamBase()` in `server/src/db/streamUrl.ts` returns `http://172.16.1.10/bemused` instead of the fixed `BEMUSED_PATH` env var. **Sessions are NOT shared between the two origins by design** — logging in via the LAN IP and via patf.com are independent logins. See `docs/superpowers/specs/2026-07-03-lan-access-design.md` for the full design. Browsers block service worker registration on non-HTTPS, non-localhost origins, so the LAN origin runs as a plain SPA with no offline caching/PWA-install — expected, not a bug.

**Upload flow**: `POST /admin/upload` accepts multipart (2GB body limit), writes files to a temp dir, inserts rows into `upload_queue` with `status: 'pending'`, returns immediately.

**Queue worker** (`server/src/workers/queue-handler.ts`): Run via `cd server && npm run worker` — a **separate process** from the API server, required for uploads to be processed. Polls `upload_queue` every 5 seconds for `pending` rows. For each: extracts ID3 tags, resolves or creates artist/album/track records, moves file to `$BEMUSED_UPLOAD_PATH/{artist}/{album}/{track}.mp3`, creates a `MediaFile` record, updates queue status to `completed` or `failed`. MBID lookup and similar-artist side effects run non-blocking.

**Migrations** (`server/migrations/`): 20 SQL files (`000`–`019`). Runner at `server/scripts/run-migrations.js` tracks applied migrations in `schema_migrations` table. Migrations run automatically on every backend deploy.

**External services** (`server/src/services/`): All calls are non-blocking; used by the worker and admin scripts:
- `musicbrainz` — MBID lookups for artists and albums
- `coverArtArchive` — album art from Cover Art Archive
- `fanart` — artist/album images from Fanart.tv
- `lastfm` — artist/album metadata from Last.fm
- `lastfmSimilar` — similar artist data from Last.fm
- `listenbrainzSimilar` — similar artists from ListenBrainz
- `wikipedia` — artist/album summaries from Wikipedia API
- `imageResize` — image resizing via `sharp`
