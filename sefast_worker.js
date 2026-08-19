/* SukakuExplainer rating worker: mode 0=current SE, mode 1=Explainer 1.2.1. */
importScripts("sefast_runtime.js", "sefast_native.js");

let enginePromise;

async function loadEngine() {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const native = await createSeFastNative();
    const toStateHex = (state) => {
      let result = "";
      for (let cell = 0; cell < 81; cell++) {
        const value = state.charCodeAt(cell);
        result += value === 0 ? "." : String(value);
      }
      result += ":";
      for (let cell = 81; cell < 162; cell++) {
        result += state.charCodeAt(cell).toString(16).padStart(3, "0");
      }
      return result;
    };
    self.sefastNativeClosure = (state, onIds, offIds, dynamic, nishio) => {
      const pointer = native.ccall(
        "sefast_closure_packed",
        "number",
        ["string", "string", "string", "number", "number"],
        [state, onIds, offIds, dynamic, nishio],
      );
      const length = native._sefast_closure_length();
      const values = native.HEAPU16.subarray(
        pointer >>> 1,
        (pointer >>> 1) + length,
      );
      let result = "";
      for (let start = 0; start < values.length; start += 8192) {
        result += String.fromCharCode(...values.subarray(start, start + 8192));
      }
      return result;
    };
    self.sefastParallelChoose = (state, cells, multiple, dynamic, nishio,
      level, nestingLimit) => {
      const hex = toStateHex(state);
      let result;
      if (dynamic === 0 && multiple === 0 && nishio === 0 && level === 0) {
        result = native.ccall(
          "sefast_best_static", "string", ["string"], [hex],
        );
      } else if (dynamic !== 0) {
        result = native.ccall(
          "sefast_best_chain_cells",
          "string",
          ["string", "string", "number", "number", "number", "number", "number"],
          [hex, cells, multiple, dynamic, nishio, level, nestingLimit],
        );
      } else {
        return "-1";
      }
      return result === "" ? "-2" : result;
    };
    const response = await fetch("sefast.wasm");
    const bytes = await response.arrayBuffer();
    const imports = {};
    const exports = {};
    const runtime = TeaVM.wasmGC.defaults(imports, exports);
    const module = await WebAssembly.compile(bytes, {
      builtins: ["js-string"],
    });
    const instance = await WebAssembly.instantiate(module, imports);
    runtime.supplyExports(instance.exports);
    for (const [key, value] of Object.entries(instance.exports)) {
      if (value instanceof WebAssembly.Global) {
        Object.defineProperty(exports, key, { get: () => value.value });
      }
    }
    return exports;
  })();
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
