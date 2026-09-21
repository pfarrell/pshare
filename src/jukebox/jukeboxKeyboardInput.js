// Simulates typing into a React-controlled <input>/<textarea> from outside
// React. React replaces the native value setter to track its own internal
// "last rendered value," so a plain `element.value = x` is silently ignored
// by React's change detection — this goes through the *native* setter first
// (the one React itself overrode), then dispatches a real bubbling 'input'
// event, which is what actually makes React's onChange fire.
const nativeValueSetterFor = (element) => {
  const proto = element.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, 'value').set;
};

export const setReactInputValue = (element, value) => {
  nativeValueSetterFor(element).call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

const NON_TEXT_INPUT_TYPES = ['checkbox', 'radio', 'button', 'submit', 'range', 'file', 'color'];

export const isTextInput = (element) =>
  !!element && (
    element.tagName === 'TEXTAREA' ||
    (element.tagName === 'INPUT' && !NON_TEXT_INPUT_TYPES.includes(element.type))
  );
