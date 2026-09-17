const TONE_BORDER = {
  relations: 'var(--color-success-border)',
  warning: 'var(--color-warning-border)',
  neutral: 'var(--color-border-strong)',
};

// Search box + result list driven by a useEntitySearch() instance.
// renderItem draws a row's left side; renderAction (optional) its right side.
const EntitySearchPicker = ({
  search,
  placeholder,
  tone = 'neutral',
  autoFocus = false,
  submitClassName = 'btn btn-primary',
  onSubmit,
  onQueryChange,
  renderItem,
  renderAction,
  pickOnRowClick = !renderAction,
  onPick,
  emptyAction,
  maxHeight = '250px',
}) => {
  const border = TONE_BORDER[tone];
  return (
    <>
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit?.(); search.search(); }}
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            type="text"
            value={search.query}
            onChange={(e) => { search.setQuery(e.target.value); onQueryChange?.(e.target.value); }}
            placeholder={placeholder}
            autoFocus={autoFocus}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '0.5rem', fontSize: '0.875rem',
              border: `1px solid ${border}`, borderRadius: '4px',
              backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)',
            }}
          />
        </div>
        <button type="submit" className={submitClassName} disabled={search.searching || search.query.trim().length < search.minLength}>
          {search.searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {search.results.length > 0 && (
        <div style={{
          maxHeight, overflowY: 'auto', border: `1px solid ${border}`, borderRadius: '4px',
          backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', marginBottom: '0.75rem',
        }}>
          {search.results.map((item) => (
            <div
              key={item.id}
              className="entity-search-result"
              onClick={pickOnRowClick ? () => onPick(item) : undefined}
              style={{
                padding: '0.6rem 0.75rem', borderBottom: '1px solid var(--color-border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
                cursor: pickOnRowClick ? 'pointer' : 'default',
              }}
            >
              <div style={{ minWidth: 0 }}>{renderItem(item)}</div>
              {renderAction?.(item)}
            </div>
          ))}
        </div>
      )}

      {emptyAction && search.hasSearched && !search.searching && search.results.length === 0 && emptyAction}
    </>
  );
};

export default EntitySearchPicker;
