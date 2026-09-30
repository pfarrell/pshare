import {
  installShaderDiagnostics,
  takeShaderFailures,
  __resetShaderDiagnosticsForTests,
} from './shaderDiagnostics';

// jsdom has no WebGL, so stand up a minimal prototype with the three methods
// the hook touches. This is exactly the surface the real context exposes.
class FakeGL {
  constructor() {
    this.COMPILE_STATUS = 'COMPILE_STATUS';
    this.compiled = [];
  }
  compileShader(shader) { this.compiled.push(shader); }
  getShaderParameter(shader) { return shader.ok; }
  getShaderInfoLog(shader) { return shader.log; }
}

let originalCompile;

beforeEach(() => {
  __resetShaderDiagnosticsForTests();
  window.WebGLRenderingContext = FakeGL;
  window.WebGL2RenderingContext = undefined;
  originalCompile = FakeGL.prototype.compileShader;
});

afterEach(() => {
  FakeGL.prototype.compileShader = originalCompile;
});

describe('shaderDiagnostics', () => {
  test('records the info log of a shader that fails to compile', () => {
    installShaderDiagnostics();
    const gl = new FakeGL();

    gl.compileShader({ ok: false, log: "ERROR: redefinition of 'ang'" });

    expect(takeShaderFailures()).toEqual(["ERROR: redefinition of 'ang'"]);
  });

  test('records nothing for a shader that compiles', () => {
    installShaderDiagnostics();
    const gl = new FakeGL();

    gl.compileShader({ ok: true, log: '' });

    expect(takeShaderFailures()).toEqual([]);
  });

  test('still performs the real compilation', () => {
    installShaderDiagnostics();
    const gl = new FakeGL();
    const shader = { ok: true, log: '' };

    gl.compileShader(shader);

    expect(gl.compiled).toEqual([shader]);
  });

  test('draining the failures empties the buffer', () => {
    installShaderDiagnostics();
    const gl = new FakeGL();
    gl.compileShader({ ok: false, log: 'boom' });

    expect(takeShaderFailures()).toEqual(['boom']);
    expect(takeShaderFailures()).toEqual([]);
  });

  test('installing twice does not double-wrap or double-report', () => {
    installShaderDiagnostics();
    installShaderDiagnostics();
    const gl = new FakeGL();

    gl.compileShader({ ok: false, log: 'boom' });

    expect(takeShaderFailures()).toEqual(['boom']);
  });

  test('falls back to a generic message when the info log is empty', () => {
    installShaderDiagnostics();
    const gl = new FakeGL();

    gl.compileShader({ ok: false, log: '' });

    expect(takeShaderFailures()).toEqual(['unknown shader compile error']);
  });
});
