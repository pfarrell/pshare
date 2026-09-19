// src/components/admin/AdminPanel.jsx
// Bordered admin section: tone 'relations' (green) or 'warning' (amber),
// both theme-aware via --color-success-* / --color-warning-* tokens.
const AdminPanel = ({ tone, title, actions, children }) => (
  <section className={`admin-panel admin-panel--${tone}`}>
    {(title || actions) && (
      <div className="admin-panel-header">
        {title && <h3 className="admin-panel-title">{title}</h3>}
        {actions}
      </div>
    )}
    {children}
  </section>
);

export default AdminPanel;
