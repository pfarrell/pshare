import { parseWikipediaSlug } from '../../utils/wikipediaSlug';

// Text input for a Wikipedia article slug that also accepts a pasted
// wikipedia.org URL, storing only the slug part.
const WikipediaSlugInput = ({ id, value, onChange, placeholder, className = 'admin-input', style }) => (
  <input
    id={id}
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onPaste={(e) => {
      const text = e.clipboardData.getData('text');
      const parsed = parseWikipediaSlug(text);
      if (parsed !== text) {
        e.preventDefault();
        onChange(parsed);
      }
    }}
    placeholder={placeholder}
    autoCorrect="off"
    autoCapitalize="off"
    spellCheck="false"
    className={className}
    style={style}
  />
);

export default WikipediaSlugInput;
