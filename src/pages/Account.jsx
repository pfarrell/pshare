import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiService } from '../services/api';
import { isLanAccess } from '../utils/device';
import toast from 'react-hot-toast';
import HomeViewToggle from '../components/HomeViewToggle';
import ProfilePickerControl from '../components/ProfilePickerControl';
import ThemeToggle from '../components/ThemeToggle';

const cardStyle = {
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border-strong)',
  borderRadius: '6px',
  padding: '1.25rem',
  marginBottom: '1.5rem',
};

const inputStyle = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border-strong)',
  borderRadius: '6px',
  color: 'var(--color-text-primary)',
  fontSize: '1rem',
  boxSizing: 'border-box',
};

const buttonStyle = {
  padding: '0.625rem 1rem',
  backgroundColor: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  fontSize: '0.875rem',
  fontWeight: '500',
  cursor: 'pointer',
};

const Account = () => {
  const { user, setUser, logout } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [password, setPasswordField] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectingRecall, setDisconnectingRecall] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const linked = searchParams.get('linked');
  const error = searchParams.get('error');

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setSettingPassword(true);
    try {
      await apiService.setPassword(password);
      setUser({ ...user, has_password: true });
      setPasswordField('');
      setConfirmPassword('');
      toast.success('Password set');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to set password');
    } finally {
      setSettingPassword(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setChangingPassword(true);
    try {
      await apiService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      toast.success('Password changed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDisconnectRecall = async () => {
    setDisconnectingRecall(true);
    try {
      await apiService.disconnectRecall();
      setUser({ ...user, recall_connected: false });
      toast.success('Recall account disconnected');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to disconnect Recall');
    } finally {
      setDisconnectingRecall(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleDisconnectGoogle = async () => {
    setDisconnecting(true);
    try {
      await apiService.disconnectGoogle();
      setUser({ ...user, google_connected: false });
      toast.success('Google account disconnected');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to disconnect Google');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '1.5rem' }}>Account</h1>

      {linked === 'google' && (
        <div style={{ backgroundColor: '#065f46', border: '1px solid #10b981', borderRadius: '6px', padding: '0.75rem 1rem', color: '#a7f3d0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Google account connected.
        </div>
      )}
      {error === 'google_already_linked' && (
        <div style={{ backgroundColor: '#7f1d1d', border: '1px solid #991b1b', borderRadius: '6px', padding: '0.75rem 1rem', color: '#fca5a5', fontSize: '0.875rem', marginBottom: '1rem' }}>
          That Google account is already linked to another user.
        </div>
      )}
      {linked === 'recall' && (
        <div style={{ backgroundColor: '#065f46', border: '1px solid #10b981', borderRadius: '6px', padding: '0.75rem 1rem', color: '#a7f3d0', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Recall account connected.
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', marginBottom: '0.5rem' }}>
          Profile
        </div>
        <div style={{ color: 'var(--color-text-primary)' }}>{user?.username}</div>
        {user?.email && <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{user.email}</div>}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', marginBottom: '0.75rem' }}>
          Home View
        </div>
        <HomeViewToggle variant="light" />
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', marginBottom: '0.75rem' }}>
          Filter
        </div>
        <ProfilePickerControl allowSetDefault variant="light" />
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', marginBottom: '0.75rem' }}>
          Theme
        </div>
        <ThemeToggle variant="light" />
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', marginBottom: '0.75rem' }}>
          Connected accounts
        </div>
        {user?.google_connected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-primary)', fontSize: '0.875rem' }}>Google — connected</span>
            {user?.has_password ? (
              <button onClick={handleDisconnectGoogle} disabled={disconnecting} style={{ ...buttonStyle, backgroundColor: '#ef4444' }}>
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            ) : (
              <span style={{ color: 'var(--color-text-faint)', fontSize: '0.75rem' }}>Set a password to disconnect</span>
            )}
          </div>
        ) : !isLanAccess() ? (
          <a
            href={apiService.getGoogleStartUrl(null, 'link')}
            style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}
          >
            Connect Google Account
          </a>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: user?.google_connected || !isLanAccess() ? '0.75rem' : 0 }}>
          {user?.recall_connected ? (
            <>
              <span style={{ color: 'var(--color-text-primary)', fontSize: '0.875rem' }}>Recall — connected</span>
              <button onClick={handleDisconnectRecall} disabled={disconnectingRecall} style={{ ...buttonStyle, backgroundColor: '#ef4444' }}>
                {disconnectingRecall ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </>
          ) : !isLanAccess() ? (
            <a
              href={apiService.getRecallStartUrl('/account')}
              style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}
            >
              Connect Recall Account
            </a>
          ) : null}
        </div>
      </div>

      {!user?.has_password && (
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', marginBottom: '0.75rem' }}>
            Set a password
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
            You signed up with Google and don't have a password yet. Set one to also sign in with your username, and to be able to disconnect Google later.
          </p>
          <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="password"
              placeholder="New password (min 6 characters)"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordField(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirm password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={inputStyle}
            />
            <button type="submit" disabled={settingPassword} style={buttonStyle}>
              {settingPassword ? 'Saving...' : 'Set password'}
            </button>
          </form>
        </div>
      )}

      {user?.has_password && (
        <div style={cardStyle}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', marginBottom: '0.75rem' }}>
            Change Password
          </div>
          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="password"
              placeholder="Current password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="New password (min 6 characters)"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              style={inputStyle}
            />
            <button type="submit" disabled={changingPassword} style={buttonStyle}>
              {changingPassword ? 'Saving...' : 'Change password'}
            </button>
          </form>
        </div>
      )}

      <div style={cardStyle}>
        <button onClick={handleLogout} style={{ ...buttonStyle, backgroundColor: '#ef4444' }}>
          Log Out
        </button>
      </div>
    </div>
  );
};

export default Account;
