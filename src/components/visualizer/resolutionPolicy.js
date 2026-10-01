// Adaptive internal render resolution for the Milkdrop renderer.
//
// Measured on the Pi 5 kiosk (1280x800, V3D 7.1): four of five sampled presets
// hold a vsync-locked 59.5fps at native resolution, while one heavy preset drops
// to 37.7fps and recovers completely at half internal resolution. So a single
// renderer plus this scaler is enough; no second render path is needed.
//
// Pure on purpose: jsdom has no WebGL, so all the policy lives here where it
// tests normally, and the component just applies whatever scale comes back.

export const FULL_SCALE = 1;
export const HALF_SCALE = 0.5;

// One window is ~1 second at 60fps.
const WINDOW = 60;
// p95 frame time above this means we are missing frames at the current scale.
const DEGRADE_MS = 22;
// Recover only well below the degrade threshold, and only after a streak, so a
// preset sitting between the two does not flap between resolutions.
const RECOVER_MS = 15;
const RECOVER_STREAK = 3;

export const createResolutionState = () => ({
  samples: [],
  scale: FULL_SCALE,
  goodWindows: 0,
});

const p95 = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
};

export const recordFrame = (state, frameMs) => {
  const samples = [...state.samples, frameMs];
  if (samples.length < WINDOW) return { ...state, samples };

  const windowP95 = p95(samples);

  if (state.scale === FULL_SCALE) {
    if (windowP95 > DEGRADE_MS) {
      return { samples: [], scale: HALF_SCALE, goodWindows: 0 };
    }
    return { ...state, samples: [] };
  }

  if (windowP95 < RECOVER_MS) {
    const goodWindows = state.goodWindows + 1;
    if (goodWindows >= RECOVER_STREAK) {
      return { samples: [], scale: FULL_SCALE, goodWindows: 0 };
    }
    return { samples: [], scale: HALF_SCALE, goodWindows };
  }

  return { samples: [], scale: HALF_SCALE, goodWindows: 0 };
};
