// src/components/PageError.jsx
import { useNavigate } from 'react-router-dom';

// Full-page "couldn't load this" block with a way out.
const PageError = ({ message, onHome }) => {
  const navigate = useNavigate();
  return (
    <div className="loading-container">
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#ef4444', fontSize: '1.25rem' }}>{message}</p>
        <button
          onClick={onHome ?? (() => navigate('/'))}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          Go Home
        </button>
      </div>
    </div>
  );
};

export default PageError;
