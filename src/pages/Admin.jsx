// src/pages/Admin.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';

const cardStyle = {
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--color-border-strong)',
  borderRadius: '6px',
  padding: '1.25rem',
  marginBottom: '1.5rem',
  position: 'relative',
};

const buttonStyle = {
  width: '100%',
  padding: '0.625rem 1rem',
  backgroundColor: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  fontSize: '0.875rem',
  fontWeight: '500',
  cursor: 'pointer',
};

const badgeStyle = {
  position: 'absolute',
  top: '-0.5rem',
  right: '-0.5rem',
  backgroundColor: '#dc2626',
  color: 'white',
  borderRadius: '9999px',
  minWidth: '1.5rem',
  height: '1.5rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.75rem',
  fontWeight: '600',
  padding: '0 0.375rem',
};

const Admin = () => {
  const navigate = useNavigate();
  const [unseenSignups, setUnseenSignups] = useState(0);

  useEffect(() => {
    apiService.getSignupUnseenCount()
      .then((response) => setUnseenSignups(response.data.count))
      .catch((err) => console.error('Failed to load signup count:', err));
  }, []);

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '1.5rem' }}>Admin</h1>

      <div style={cardStyle}>
        <button onClick={() => navigate('/admin/upload')} style={buttonStyle}>Upload</button>
      </div>
      <div style={cardStyle}>
        <button onClick={() => navigate('/admin/new')} style={buttonStyle}>New</button>
      </div>
      <div style={cardStyle}>
        <button onClick={() => navigate('/admin/logs')} style={buttonStyle}>Logs</button>
      </div>
      <div style={cardStyle}>
        <button onClick={() => navigate('/admin/tags')} style={buttonStyle}>Tags</button>
      </div>
      <div style={cardStyle}>
        <button onClick={() => navigate('/admin/errors')} style={buttonStyle}>Errors</button>
      </div>
      <div style={cardStyle}>
        <button onClick={() => navigate('/admin/duplicates/albums')} style={buttonStyle}>Duplicate Albums</button>
      </div>
      <div style={cardStyle}>
        {unseenSignups > 0 && <span style={badgeStyle}>{unseenSignups}</span>}
        <button onClick={() => navigate('/admin/signups')} style={buttonStyle}>Signups</button>
      </div>
    </div>
  );
};

export default Admin;
