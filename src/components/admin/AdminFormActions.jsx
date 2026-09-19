// src/components/admin/AdminFormActions.jsx
const AdminFormActions = ({ saving, onCancel, onDelete, deleteLabel }) => (
  <div className="admin-form-actions">
    <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
      {saving ? 'Saving...' : 'Save'}
    </button>
    {onCancel && (
      <button type="button" className="btn btn-muted btn-lg" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
    )}
    {onDelete && (
      <button type="button" className="btn btn-danger btn-lg admin-form-actions-delete" onClick={onDelete} disabled={saving}>
        {deleteLabel}
      </button>
    )}
  </div>
);

export default AdminFormActions;
