function getSkfrRating(boardString) {
  if (!window.Module || !window.Module._ratePuzzleC) {
    console.warn("SKFR module not loaded yet.");
    return null;
  }

  if (boardString.length !== 81) {
    return null;
  }

  // Replace dots with zeros if any, skfr likes '0' or '.'
  const ze = boardString.replace(/\./g, "0");

  const erPtr = window.Module._malloc(4);
  const epPtr = window.Module._malloc(4);
  const edPtr = window.Module._malloc(4);
  const aigPtr = window.Module._malloc(4);

  const rc = window.Module.ccall(
    "ratePuzzleC",
    "number",
    ["string", "number", "number", "number", "number"],
    [ze, erPtr, epPtr, edPtr, aigPtr],
  );

  const er = window.Module.getValue(erPtr, "i32");
  const ep = window.Module.getValue(epPtr, "i32");
  const ed = window.Module.getValue(edPtr, "i32");

  window.Module._free(erPtr);
  window.Module._free(epPtr);
  window.Module._free(edPtr);
  window.Module._free(aigPtr);

  if (er === 0) return null;

  return (er / 10).toFixed(1);
}

window.getSkfrRating = getSkfrRating;
