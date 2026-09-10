/* SEROB C++ host integration, modified in 2026 by ClubDS. LGPL-2.1-only. */
importScripts("sefast_native.js", "sefast_runtime.js");

let enginePromise;

function loadEngine() {
  if (!enginePromise) {
    enginePromise = createSeFast().catch((error) => {
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
    let raw = mode === 0 ? engine.rateLowCurrent(puzzle) : "";
    if (raw === "") raw = engine.rate(puzzle, mode);
    if (raw.startsWith("ERROR,")) throw new Error(raw);
    const [er, ep, ed] = raw.split(",").map(Number);
    self.postMessage({ id, result: { er, ep, ed } });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
