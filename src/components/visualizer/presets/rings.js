// A hand-authored preset, kept in the repo as the worked example for writing
// your own. Verified rendering on the Pi kiosk at 59.8fps.
//
// A butterchurn preset is plain data, not a compiled artifact:
//   baseVals        sparse overrides of milkdrop's defaults
//   *_eqs_str       JavaScript, compiled at load time via new Function
//   warp / comp     GLSL shader bodies
// so a preset can be edited and reloaded live with no build step.
//
// Shader bodies get these built-ins for free: uv, rad, ang, time, bass, mid,
// treb, their _att variants, vol, frame, fps, resolution, aspect, and _qa.._qh
// carrying q1..q32 from the equations above. DO NOT redeclare any of them: a
// collision makes the shader fail to compile, and butterchurn reports nothing
// and renders solid black.

export const rings = {
  baseVals: {
    decay: 0.96,
    echo_zoom: 1,
    zoom: 0.99,
    wave_a: 0,
    darken_center: 0,
  },
  shapes: [],
  waves: [],
  init_eqs_str: 'a.q1=0;',
  frame_eqs_str: 'a.q1=a.bass_att; a.q2=a.treb_att;',
  pixel_eqs_str: '',
  warp: `shader_body {
  ret = texture2D(sampler_main, uv).rgb * 0.94;
}`,
  comp: `shader_body {
  float rings = sin(rad * 26.0 - time * 2.2 + bass_att * 7.0);
  float spokes = sin(ang * 6.0 + time * 0.6);
  float v = smoothstep(0.1, 1.0, rings * 0.5 + 0.5) * (0.30 + bass_att * 0.55);
  vec3 col = vec3(
    v * (0.25 + treb_att * 0.6),
    v * (0.10 + mid_att * 0.45),
    v * (0.75 + bass_att * 0.25)
  );
  col += spokes * 0.07 * vec3(0.35, 0.15, 0.95);
  ret = col;
}`,
};
