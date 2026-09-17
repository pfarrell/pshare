// src/components/admin/RelationList.jsx
// A titled list of relation rows (members, related artists, appears-on,
// additional album artists) inside a relations AdminPanel.
const RelationList = ({ title, titleExtra, items, getKey = (item) => item.id, renderName, renderMeta, rowActions, onRemove, rowStyle }) => {
  if (!items?.length && !titleExtra) return null;
  return (
    <div className="admin-relation-list">
      {(title || titleExtra) && <div className="admin-relation-list-title">{title}{titleExtra}</div>}
      {(items || []).map((item) => (
        <div key={getKey(item)} className="admin-relation-row" style={rowStyle?.(item)}>
          <span className="admin-relation-name">{renderName(item)}</span>
          <div className="admin-relation-actions">
            {renderMeta?.(item)}
            {rowActions?.(item)}
            {onRemove && (
              <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove(item)}>Remove</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default RelationList;
