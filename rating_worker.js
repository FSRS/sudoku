/* skfr + SEROB C++ host integration, modified in 2026 by ClubDS. LGPL-2.1-only. */
importScripts("rating.js", "rating_runtime.js");

let enginePromise;

function loadEngine() {
  if (!enginePromise) {
    enginePromise = createRating().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

self.onmessage = async ({ data }) => {
  const { id, puzzle, mode } = data;
  try {
    const engine = await loadEngine();
    const raw = engine.rate(puzzle, mode);
    if (raw.startsWith("ERROR,")) throw new Error(raw);
    // An empty reply is the engine declining the puzzle, not a rating of zero.
    const [er = null, ep = null, ed = null] = raw ? raw.split(",").map(Number) : [];
    self.postMessage({ id, result: { er, ep, ed } });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
