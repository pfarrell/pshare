// 1. SCROLL TO TOP FIX
// Add this to your src/App.jsx file

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import api from './services/api';
import Layout from './components/Layout';
import Home from './pages/Home';
import Search from './pages/Search';
import Artist from './pages/Artist';
import Album from './pages/Album';
import TrackPage from './pages/TrackPage';
import Library from './pages/Library';
import Account from './pages/Account';
import Admin from './pages/Admin';
import Playlists from './pages/Playlists';
import Playlist from './pages/Playlist';
import Collections from './pages/Collections';
import Collection from './pages/Collection';
import AdminCollection from './pages/AdminCollection';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminArtist from './pages/AdminArtist';
import AdminAlbum from './pages/AdminAlbum';
import AdminTrack from './pages/AdminTrack';
import AdminUpload from './pages/AdminUpload';
import AdminPlaylist from './pages/AdminPlaylist';
import AdminLogs from './pages/AdminLogs';
import AdminTags from './pages/AdminTags';
import AdminErrors from './pages/AdminErrors';
import AdminSignups from './pages/AdminSignups';
import AdminNew from './pages/AdminNew';
import AdminDuplicateAlbums from './pages/AdminDuplicateAlbums';
import AdminDuplicateTracks from './pages/AdminDuplicateTracks';
import TagPage from './pages/TagPage';
import ProtectedRoute from './components/ProtectedRoute';
import MusicPlayerWrapper from './components/player/MusicPlayerWrapper';
import NowPlaying from './components/NowPlaying';

// Handle scroll to top on route changes
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll to top when route changes
    window.scrollTo(0, 0);

    // The home page owns its own scroll behavior (restoring a cached
    // scroll position on back-navigation, or scrolling to top on a fresh
    // load) — resetting .main-content here would race with that.
    if (pathname === '/') return;

    // Also scroll the main content container if it exists
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
}

function App() {
  const basename = import.meta.env.DEV ? '/' : '/pshare/app';
  const [authInitialized, setAuthInitialized] = useState(false);

  // Initialize auth on app startup
  useEffect(() => {
    const initAuth = async () => {
      try {
        await useAuthStore.getState().initialize();
      } catch (error) {
        console.error('Failed to initialize auth:', error);
      } finally {
        setAuthInitialized(true);
      }
    };
    initAuth();
  }, []);

  // Handle session expiry: if the backend returns 401 while the frontend thinks
  // we're logged in, clear auth state so ProtectedRoute redirects to login.
  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && useAuthStore.getState().isAuthenticated) {
          toast.error('Session expired. Please log in again.');
          useAuthStore.getState().logout();
        }
        return Promise.reject(error);
      }
    );
    return () => api.interceptors.response.eject(interceptorId);
  }, []);

  // 2. FULLSCREEN/PWA SETUP FOR MOBILE
  useEffect(() => {
    const setupMobileFullscreen = () => {
      // Add PWA meta tags if not already present
      const addMetaTag = (name, content) => {
        if (!document.querySelector(`meta[name="${name}"]`)) {
          const meta = document.createElement('meta');
          meta.name = name;
          meta.content = content;
          document.head.appendChild(meta);
        }
      };

      // PWA meta tags for fullscreen experience
      addMetaTag('apple-mobile-web-app-capable', 'yes');
      addMetaTag('apple-mobile-web-app-status-bar-style', 'black-translucent');
      addMetaTag('mobile-web-app-capable', 'yes');
      addMetaTag('theme-color', '#1a252f');
      
      // Viewport meta tag for better mobile experience
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
      }

      // Prevent iOS Safari from showing address bar when scrolling
      const preventBounce = (e) => {
        if (e.target === document.body) {
          e.preventDefault();
        }
      };
      
      document.addEventListener('touchmove', preventBounce, { passive: false });
      
      // Hide address bar on iOS
      const hideAddressBar = () => {
        if (window.navigator.standalone !== true) {
          setTimeout(() => {
            window.scrollTo(0, 1);
            setTimeout(() => window.scrollTo(0, 0), 0);
          }, 1000);
        }
      };
      
      window.addEventListener('load', hideAddressBar);
      window.addEventListener('orientationchange', hideAddressBar);
      
      return () => {
        document.removeEventListener('touchmove', preventBounce);
        window.removeEventListener('load', hideAddressBar);
        window.removeEventListener('orientationchange', hideAddressBar);
      };
    };

    const cleanup = setupMobileFullscreen();
    return cleanup;
  }, []);

  // Wait for auth to initialize before rendering routes
  if (!authInitialized) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#3a4853'
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: '1.5rem' }}>Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <Router basename={basename}>
      <ScrollToTop /> {/* Add the ScrollToTop component here */}
      <Toaster
        position={window.innerWidth <= 768 ? "bottom-center" : "bottom-right"}
        containerStyle={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0))' }}
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            style: {
              background: '#10b981',
            },
          },
          error: {
            style: {
              background: '#ef4444',
            },
          },
        }}
      />
      {/* Player lives outside Routes so it is never unmounted during navigation */}
      <div className="app-footer">
        <NowPlaying />
        <MusicPlayerWrapper />
      </div>

      <div className="app h-screen overflow-hidden">
        <Routes>
          {/* All pages use the shared layout */}
          <Route path="/*" element={
            <Layout>
              <Routes>
                {/* /login and /signup are reachable without a session — every
                    other route below is nested under the ProtectedRoute wrapper. */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
                {/* Public: viewable/playable without an account so shared links
                    work for a logged-out visitor. The backend routes behind
                    these (server/src/index.ts) are public for the same reason;
                    account-gated actions on these pages hide themselves via
                    isAuthenticated/isAdmin checks already in each component. */}
                <Route path="/artist/:id" element={<Artist />} />
                <Route path="/album/:id" element={<Album />} />
                <Route path="/playlist/:id" element={<Playlist />} />
                <Route path="/track/:id" element={<TrackPage />} />
                <Route path="/*" element={
                  <ProtectedRoute>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/search" element={<Search />} />
                      <Route path="/library" element={<Library />} />
                      <Route path="/account" element={<Account />} />
                      <Route path="/admin" element={
                        <ProtectedRoute requireAdmin>
                          <Admin />
                        </ProtectedRoute>
                      } />
                      <Route path="/playlists" element={<Playlists />} />
                      <Route path="/collections" element={<Collections />} />
                      <Route path="/collection/:id" element={<Collection />} />
                      <Route path="/tags/:name" element={<TagPage />} />
                      <Route path="/admin/collection/:id" element={<AdminCollection />} />
                      <Route path="/admin/artist/:id" element={
                        <ProtectedRoute requireAdmin>
                          <AdminArtist />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/album/:id" element={
                        <ProtectedRoute requireAdmin>
                          <AdminAlbum />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/track/:id" element={
                        <ProtectedRoute requireAdmin>
                          <AdminTrack />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/upload" element={
                        <ProtectedRoute requireAdmin>
                          <AdminUpload />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/playlist/:id" element={<AdminPlaylist />} />
                      <Route path="/admin/logs" element={
                        <ProtectedRoute requireAdmin>
                          <AdminLogs />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/tags" element={
                        <ProtectedRoute requireAdmin>
                          <AdminTags />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/errors" element={
                        <ProtectedRoute requireAdmin>
                          <AdminErrors />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/duplicates/albums" element={
                        <ProtectedRoute requireAdmin>
                          <AdminDuplicateAlbums />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/duplicates/tracks" element={
                        <ProtectedRoute requireAdmin>
                          <AdminDuplicateTracks />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/signups" element={
                        <ProtectedRoute requireAdmin>
                          <AdminSignups />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/new" element={
                        <ProtectedRoute requireAdmin>
                          <AdminNew />
                        </ProtectedRoute>
                      } />
                    </Routes>
                  </ProtectedRoute>
                } />
              </Routes>
            </Layout>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
