// One context-menu button. Menus are portaled to <body>, but React bubbles
// synthetic events through the component tree, so every handler must stop
// propagation or it reaches the row that opened the menu. preventDefault on
// touchend suppresses the synthesized click (the mobile ghost-tap).
const MenuItem = ({ onSelect, className, children }) => (
  <button
    className={className}
    onClick={(e) => { e.stopPropagation(); onSelect(); }}
    onTouchStart={(e) => { e.stopPropagation(); }}
    onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); onSelect(); }}
  >
    {children}
  </button>
);

export default MenuItem;
