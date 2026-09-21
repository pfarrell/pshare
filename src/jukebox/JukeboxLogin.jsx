import { useState } from 'react';
import { apiService } from '../services/api';
import { useAuthStore } from '../stores/authStore';

// Distinct from the normal Login page on purpose: this posts to
// /auth/jukebox-login (a long-lived, device-scoped session — see
// docs/superpowers/specs/2026-09-20-jukebox-mode-design.md), not
// /auth/login, and asks for a device name so multiple kiosks stay
// distinguishable. Only ever shown once per physical device, at setup.
const JukeboxLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiService.jukeboxLogin(username, password, deviceName);
      await useAuthStore.getState().initialize();
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="jukebox-login">
      <h1>P·Share Jukebox</h1>
      <form onSubmit={handleSubmit}>
        {error && <p className="jukebox-login-error">{error}</p>}
        <label htmlFor="jukebox-login-username">Username</label>
        <input
          id="jukebox-login-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <label htmlFor="jukebox-login-password">Password</label>
        <input
          id="jukebox-login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <label htmlFor="jukebox-login-device-name">Device Name</label>
        <input
          id="jukebox-login-device-name"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="e.g. Kitchen"
        />
        <button type="submit" disabled={submitting}>Log In</button>
      </form>
    </div>
  );
};

export default JukeboxLogin;
