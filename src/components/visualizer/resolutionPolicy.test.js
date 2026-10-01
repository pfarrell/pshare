import {
  FULL_SCALE,
  HALF_SCALE,
  createResolutionState,
  recordFrame,
} from './resolutionPolicy';

const feed = (state, frameMs, count) => {
  let next = state;
  for (let i = 0; i < count; i += 1) next = recordFrame(next, frameMs);
  return next;
};

describe('resolutionPolicy', () => {
  test('starts at full scale', () => {
    expect(createResolutionState().scale).toBe(FULL_SCALE);
  });

  test('stays at full scale while frames are comfortably within budget', () => {
    const state = feed(createResolutionState(), 16, 240);
    expect(state.scale).toBe(FULL_SCALE);
  });

  test('drops to half scale once a full window is over budget', () => {
    const state = feed(createResolutionState(), 30, 60);
    expect(state.scale).toBe(HALF_SCALE);
  });

  test('does not drop before a full window has been sampled', () => {
    const state = feed(createResolutionState(), 30, 59);
    expect(state.scale).toBe(FULL_SCALE);
  });

  test('recovers to full scale only after a sustained good streak', () => {
    let state = feed(createResolutionState(), 30, 60);
    expect(state.scale).toBe(HALF_SCALE);

    state = feed(state, 12, 60);
    expect(state.scale).toBe(HALF_SCALE);
    state = feed(state, 12, 60);
    expect(state.scale).toBe(HALF_SCALE);
    state = feed(state, 12, 60);
    expect(state.scale).toBe(FULL_SCALE);
  });

  // Hysteresis: a preset sitting between the two thresholds must not flap
  // between resolutions every window, which would look worse than either.
  test('does not oscillate in the band between the thresholds', () => {
    let state = feed(createResolutionState(), 30, 60);
    expect(state.scale).toBe(HALF_SCALE);

    state = feed(state, 18, 600);
    expect(state.scale).toBe(HALF_SCALE);
  });

  test('a good streak is reset by a single bad window', () => {
    let state = feed(createResolutionState(), 30, 60);
    state = feed(state, 12, 120);
    state = feed(state, 30, 60);
    state = feed(state, 12, 120);
    expect(state.scale).toBe(HALF_SCALE);
  });
});
