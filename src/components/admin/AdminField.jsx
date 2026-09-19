// src/components/admin/AdminField.jsx
const AdminField = ({ label, htmlFor, help, children }) => (
  <div className="admin-field">
    {label && <label htmlFor={htmlFor} className="admin-label">{label}</label>}
    {children}
    {help && <small className="admin-help">{help}</small>}
  </div>
);

export default AdminField;
