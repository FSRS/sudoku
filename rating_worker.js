/* skfr + SEROB C++ host integration, modified in 2026 by ClubDS. LGPL-2.1-only. */
importScripts("rating.js?v=one-cell-se-1", "rating_runtime.js?v=one-cell-se-1");

let enginePromise;

function loadEngine() {
  if (!enginePromise) {
    enginePromise = createRating({
      locateFile: (file) => new URL(`${file}?v=one-cell-se-1`, self.location.href).href,
    }).catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

self.onmessage = async ({ data }) => {
  const { id, puzzle, mode, onlyOneCell = false } = data;
  try {
    const engine = await loadEngine();
    const raw = engine.rate(puzzle, mode, { onlyOneCell });
    if (raw.startsWith("ERROR,")) throw new Error(raw);
    // An empty reply is the engine declining the puzzle, not a rating of zero.
    const [er = null, ep = null, ed = null] = raw
      ? raw.split(",").map(Number)
      : [];
    self.postMessage({ id, result: { er: onlyOneCell ? null : er, ep, ed } });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
