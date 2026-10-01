import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/playerStore';
import { ensureAnalyserGraph } from '../../utils/analyserGraph';
import { installShaderDiagnostics } from './shaderDiagnostics';
import { createResolutionState, recordFrame } from './resolutionPolicy';
import { loadPresets } from './loadPresets';
import { createPresetCycle, BLEND_SECONDS, CYCLE_MS } from './presetCycle';

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 800;
// Frames right after a preset change are unrepresentative: the new preset's
// shaders compile, and for BLEND_SECONDS both presets render at once. Counting
// them dropped the real kiosk to half resolution about a second after it
// started, so the resolution policy ignores frames until this has passed.
const SETTLE_MS = (BLEND_SECONDS + 0.5) * 1000;

// butterchurn is ~188KB, so it is imported lazily and lands in the `visualizer`
// chunk. Injectable so the component can be tested without WebGL, which jsdom
// does not have.
const defaultCreateRenderer = async (context, canvas) => {
  const module = await import('butterchurn');
  const butterchurn = module.default ?? module;
  return butterchurn.createVisualizer(context, canvas, {
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    pixelRatio: 1,
    textureRatio: 1,
  });
};

const MilkdropCanvas = ({
  onDismiss,
  onFail,
  createRenderer = defaultCreateRenderer,
  loadPresetPack = loadPresets,
}) => {
  const canvasRef = useRef(null);
  const cycleRef = useRef(null);
  const frameRef = useRef(null);

  // Only the id matters: a track change triggers a fresh preset (effect below).
  // Everything about the track is read defensively, since there is no error
  // boundary anywhere in this app and a throw here would blank the kiosk.
  const currentTrack = usePlayerStore((s) => s.currentTrack);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const start = async () => {
      const audioA = usePlayerStore.getState().audioElementA;
      const audioB = usePlayerStore.getState().audioElementB;
      const graph = ensureAnalyserGraph(audioA, audioB);
      if (!graph) {
        onFail();
        return;
      }

      installShaderDiagnostics();

      let visualizer;
      let presets;
      try {
        visualizer = await createRenderer(graph.context, canvas);
        presets = await loadPresetPack();
      } catch {
        // WebGL unavailable, context creation refused, or the lazy chunk failed
        // to fetch. Falling back beats showing a black rectangle, which is
        // indistinguishable from a dead kiosk.
        onFail();
        return;
      }
      if (cancelled) return;

      visualizer.connectAudio(graph.sourceNode);

      const cycle = createPresetCycle({ presets, visualizer });
      let settleUntil = 0;
      // Every preset change (timer, track change, initial) goes through here so
      // each one opens a settle window.
      const changePreset = () => {
        cycle.next();
        settleUntil = performance.now() + SETTLE_MS;
      };
      cycleRef.current = { next: changePreset };
      changePreset();

      let resolution = createResolutionState();
      let appliedScale = null;
      let lastFrameAt = performance.now();

      const loop = () => {
        frameRef.current = requestAnimationFrame(loop);

        const now = performance.now();
        if (now >= settleUntil) {
          resolution = recordFrame(resolution, now - lastFrameAt);
        }
        lastFrameAt = now;

        if (resolution.scale !== appliedScale) {
          appliedScale = resolution.scale;
          const width = Math.round(BASE_WIDTH * appliedScale);
          const height = Math.round(BASE_HEIGHT * appliedScale);
          // butterchurn's setRendererSize only resizes its internal textures and
          // GL viewport, never the canvas element. The backing store has to
          // match, or a half-size viewport lands in one corner of a full-size
          // canvas. CSS stretches the smaller canvas back over the screen.
          canvas.width = width;
          canvas.height = height;
          visualizer.setRendererSize(width, height);
        }

        visualizer.render();
      };
      frameRef.current = requestAnimationFrame(loop);
    };

    start();

    return () => {
      cancelled = true;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      cycleRef.current = null;
      // The audio graph is deliberately left alone: it is module-scope, the tap
      // on the player's elements is irreversible, and closing its context would
      // silence playback permanently. See src/utils/analyserGraph.js.
    };
    // onFail is stable for the life of the screensaver; re-running this effect
    // would try to re-tap the audio elements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fresh preset on every track change, on top of the timed cycle below.
  useEffect(() => {
    cycleRef.current?.next();
  }, [currentTrack?.id]);

  useEffect(() => {
    const timer = setInterval(() => cycleRef.current?.next(), CYCLE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="jukebox-visualizer" onClick={onDismiss} data-testid="milkdrop-canvas">
      <canvas ref={canvasRef} className="jukebox-visualizer-canvas" width={BASE_WIDTH} height={BASE_HEIGHT} />
    </div>
  );
};

export default MilkdropCanvas;
