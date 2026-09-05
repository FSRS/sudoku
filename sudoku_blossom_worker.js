self.window = self;
self.t = (key, ...args) => {
  if (key === "teks_unit_with_index") return `${args[0]} ${args[1]}`;
  if (key === "teks_burr_on") return `${args[0]}`;
  return key;
};

importScripts("sudoku_constants.js", "sudoku_solver.js", "sudoku_teks.js");

const serializeNode = (node) => ({
  cells: [...node.cells],
  digits: [...node.digits],
});

const serializeResult = (result) => ({
  change: result.change,
  type: result.type,
  cells: result.cells,
  hint: result.hint,
  blossom: {
    kind: result.blossom.kind,
    burrText: result.blossom.burrText,
    burr: result.blossom.burr.map(serializeNode),
    mainPath: result.blossom.mainPath.map(serializeNode),
    branches: result.blossom.branches.map((path) => path.map(serializeNode)),
    alses: result.blossom.alses.map((als) => ({ cells: als.cells })),
    rank: result.blossom.rank,
  },
});

self.onmessage = ({ data }) => {
  const { id, kind, board, candidateLists, findAll } = data;
  try {
    const pencils = candidateLists.map((row) =>
      row.map((digits) => new Set(digits)),
    );
    const finder =
      kind === "all"
        ? techniques.blossomLoop
        : kind === "region"
          ? techniques.regionBlossomLoop
          : kind === "aals"
            ? techniques.aalsBlossomLoop
            : techniques.cellBlossomLoop;
    const found = finder(board, pencils, findAll);
    const results = Array.isArray(found)
      ? found.map(serializeResult)
      : found.change
        ? [serializeResult(found)]
        : [];
    self.postMessage({ id, results });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // The worker is reused, so release the position cache while it is idle.
    techniques._releaseAICCache();
  }
};
