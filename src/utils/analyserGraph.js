// Module-scope Web Audio graph for the visualizer.
//
// createMediaElementSource() is irreversible and can only be called once per
// <audio> element per page load: a second call throws, and once an element is
// routed through Web Audio it stays routed for the life of the page. If this
// graph were ever closed or disconnected, kiosk playback would go silent
// permanently. So it lives at module scope and outlives every component that
// borrows it, the same pattern as src/utils/tagsCache.js.
//
// Nothing else in the app calls this. It is reached only from the visualizer,
// which is only mounted from the jukebox kiosk screensaver, so the iOS PWA
// never creates a tap at all. That reachability gate is deliberate: Safari's
// per-site "Request Desktop Website" toggle changes navigator.userAgent and
// window.innerWidth together, so a device sniff would be unreliable on exactly
// the platform it would be protecting.

let graph = null;

export const ensureAnalyserGraph = (audioA, audioB) => {
  if (graph) return graph;
  if (!audioA || !audioB) return null;

  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;

  let context;
  try {
    context = new Ctor();
  } catch {
    return null;
  }

  const sourceNode = context.createGain();
  sourceNode.gain.value = 1;

  try {
    context.createMediaElementSource(audioA).connect(sourceNode);
    context.createMediaElementSource(audioB).connect(sourceNode);
  } catch {
    // Either element was already tapped by something else. The elements are
    // now in an indeterminate routing state, so the only safe move is to wire
    // what we have straight to the destination and give up on visualizing.
    sourceNode.connect(context.destination);
    return null;
  }

  sourceNode.connect(context.destination);

  context.addEventListener('statechange', () => {
    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }
  });

  graph = { context, sourceNode };
  return graph;
};

// The graph is deliberately never torn down in production. This exists so each
// test can start from a clean module state.
export const __resetAnalyserGraphForTests = () => {
  graph = null;
};
