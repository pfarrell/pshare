// src/components/Retry.jsx
// Error block with a Retry button. Pass onRetry to re-run just the failed
// load; without it Retry falls back to a full page reload.
const Retry = ({ message, error, onRetry }) => {
  const text = message ?? (typeof error === 'string' ? error : error?.message);
  return (
    <div className="loading-container">
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#ef4444', fontSize: '1.25rem' }}>{text}</p>
        <button
          onClick={onRetry ?? (() => window.location.reload())}
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
          Retry
        </button>
      </div>
    </div>
  );
};

export default Retry;
