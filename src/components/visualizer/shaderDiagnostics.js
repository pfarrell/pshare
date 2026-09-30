// butterchurn swallows shader compile errors entirely: a preset whose GLSL
// fails to compile makes loadPreset() and render() both return cleanly, at full
// frame rate, while drawing solid black. Verified during design, where
// declaring `float ang` collided with milkdrop's built-in `ang` varying and the
// only symptom was a black screen.
//
// So we wrap compileShader ourselves and check COMPILE_STATUS. The renderer
// drains this buffer after loading a preset to decide whether that preset is
// usable, which is also what keeps a broken custom preset from stranding the
// kiosk on a black rectangle.

let installed = false;
const failures = [];

export const installShaderDiagnostics = () => {
  if (installed) return;

  const prototypes = [
    typeof window.WebGLRenderingContext === 'function' && window.WebGLRenderingContext.prototype,
    typeof window.WebGL2RenderingContext === 'function' && window.WebGL2RenderingContext.prototype,
  ].filter(Boolean);

  for (const proto of prototypes) {
    const original = proto.compileShader;
    proto.compileShader = function patchedCompileShader(shader) {
      original.call(this, shader);
      if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) {
        failures.push(this.getShaderInfoLog(shader) || 'unknown shader compile error');
      }
    };
  }

  installed = true;
};

export const takeShaderFailures = () => failures.splice(0, failures.length);

export const __resetShaderDiagnosticsForTests = () => {
  installed = false;
  failures.length = 0;
};
