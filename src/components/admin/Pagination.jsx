// src/components/admin/Pagination.jsx
import { pageWindow } from '../../utils/pageWindow';

const edgeButtonStyle = (disabled) => ({
  padding: '0.5rem 1rem',
  backgroundColor: disabled ? 'var(--color-border)' : '#3b82f6',
  color: disabled ? 'var(--color-text-faint)' : 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: '0.875rem',
  fontWeight: '500',
});

const Pagination = ({ page, totalPages, onPageChange }) => {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
      <button onClick={() => onPageChange(page - 1)} disabled={page === 1} style={edgeButtonStyle(page === 1)}>
        Previous
      </button>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {pageWindow(page, totalPages).map((pageNum) => (
          <button
            key={pageNum}
            onClick={() => onPageChange(pageNum)}
            style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: page === pageNum ? '#3b82f6' : 'var(--color-bg-surface)',
              color: page === pageNum ? 'white' : 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: page === pageNum ? '600' : '400',
            }}
          >
            {pageNum}
          </button>
        ))}
      </div>
      <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} style={edgeButtonStyle(page === totalPages)}>
        Next
      </button>
    </div>
  );
};

export default Pagination;
