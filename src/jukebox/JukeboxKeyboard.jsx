import { useState } from 'react';
import { setReactInputValue } from './jukeboxKeyboardInput';

// No OS/compositor dependency — this exists specifically because the
// platform's own on-screen keyboard (squeekboard + labwc) proved unreliable
// on the actual kiosk hardware. Renders as a plain in-page overlay and
// writes directly into whatever text input currently has focus, via
// useJukeboxKeyboardFocus (see JukeboxApp.jsx).
const ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];
const SYMBOLS = ['-', '_', '.', '@', '!', '?', "'", '/', ':', ';'];

const JukeboxKeyboard = ({ targetElement }) => {
  const [shift, setShift] = useState(false);

  if (!targetElement) return null;

  // Edit at the caret/selection (not the end), so touching inside the text
  // to reposition the cursor works. Setting the value moves the caret to the
  // end, so it's restored explicitly afterwards.
  const replaceSelection = (text, deleteBack = 0) => {
    const value = targetElement.value ?? '';
    const end = targetElement.selectionEnd ?? value.length;
    let start = targetElement.selectionStart ?? end;
    if (start === end && deleteBack > 0) start = Math.max(0, start - deleteBack);
    setReactInputValue(targetElement, value.slice(0, start) + text + value.slice(end));
    const caret = start + text.length;
    targetElement.setSelectionRange?.(caret, caret);
  };

  const insert = (char) => replaceSelection(char);
  const backspace = () => replaceSelection('', 1);

  // The whole keyboard container also preventDefaults mousedown, so taps on
  // the gaps/padding between keys can't blur the input and dismiss it.
  // onMouseDown (not onClick) with preventDefault, on every key: this is
  // what keeps the target input focused while typing — without it, tapping
  // a key would steal focus away from the input, which would both blur it
  // (hiding this keyboard, since useJukeboxKeyboardFocus tracks focus) and
  // break the "type several characters in a row" flow entirely.
  const renderKey = (char) => (
    <button
      key={char}
      type="button"
      className="jukebox-keyboard-key"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => insert(shift ? char.toUpperCase() : char)}
    >
      {shift ? char.toUpperCase() : char}
    </button>
  );

  return (
    <div
      className="jukebox-keyboard"
      role="group"
      aria-label="On-screen keyboard"
      onMouseDown={(e) => e.preventDefault()}
    >
      {ROWS.map((row, i) => (
        <div className="jukebox-keyboard-row" key={i}>
          {row.map(renderKey)}
          {i === ROWS.length - 1 && (
            <>
              <button
                type="button"
                className={`jukebox-keyboard-key jukebox-keyboard-shift${shift ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShift((s) => !s)}
                aria-label="Shift"
                aria-pressed={shift}
              >
                ⇧
              </button>
              <button
                type="button"
                className="jukebox-keyboard-key jukebox-keyboard-backspace"
                onMouseDown={(e) => e.preventDefault()}
                onClick={backspace}
                aria-label="Backspace"
              >
                ⌫
              </button>
            </>
          )}
        </div>
      ))}
      <div className="jukebox-keyboard-row">
        {SYMBOLS.map(renderKey)}
      </div>
      <div className="jukebox-keyboard-row">
        <button
          type="button"
          className="jukebox-keyboard-key jukebox-keyboard-space"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(' ')}
          aria-label="Space"
        >
          Space
        </button>
        <button
          type="button"
          className="jukebox-keyboard-key jukebox-keyboard-done"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => targetElement.blur()}
          aria-label="Done"
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default JukeboxKeyboard;
