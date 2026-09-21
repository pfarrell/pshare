import { useEffect, useState } from 'react';
import { isTextInput } from './jukeboxKeyboardInput';

// Tracks whichever text input/textarea currently has focus anywhere in
// Jukebox Mode, so JukeboxApp can show/hide the on-screen keyboard without
// each input needing its own wiring. Global focusin/focusout listeners are
// safe here because nothing outside Jukebox Mode is ever mounted at the same
// time (see App.jsx's jukeboxMode branch) — there's no risk of picking up
// focus events from the normal app.
export const useJukeboxKeyboardFocus = () => {
  const [focusedInput, setFocusedInput] = useState(null);

  useEffect(() => {
    const handleFocusIn = (e) => {
      if (isTextInput(e.target)) setFocusedInput(e.target);
    };
    // Only clear when the element that's losing focus is the one we're
    // tracking — a focusout on something else (e.g. a keyboard key, which
    // never receives focus in the first place thanks to its onMouseDown
    // preventDefault) shouldn't hide the keyboard.
    const handleFocusOut = (e) => {
      setFocusedInput((current) => (e.target === current ? null : current));
    };
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return focusedInput;
};
