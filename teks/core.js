let _memoComplexFish = {
  franken: new Set(),
  mutant: new Set(),
};

window.resetComplexFishMemo = function () {
  _memoComplexFish.franken = new Set();
  _memoComplexFish.mutant = new Set();
};

window.addCellColor = function (r, c, color) {
  const existing = boardState[r][c].cellColor;
  if (!existing) {
    boardState[r][c].cellColor = [color]; // Starts as array to support splitting
  } else if (Array.isArray(existing)) {
    if (!existing.includes(color)) existing.push(color);
  } else {
    if (existing !== color) boardState[r][c].cellColor = [existing, color];
  }
};

window.addCandidateCircle = function (r, c, num, color) {
  boardState[r][c].candCircles.set(num, color);
};

window.addCandidateColor = function (r, c, num, color) {
  const existing = boardState[r][c].pencilColors.get(num);
  if (!existing) {
    boardState[r][c].pencilColors.set(num, [color]);
  } else if (Array.isArray(existing)) {
    if (!existing.includes(color)) existing.push(color);
  } else {
    if (existing !== color)
      boardState[r][c].pencilColors.set(num, [existing, color]);
  }
};

const CELL_PART = new Uint8Array(81);
const CELL_BIT = new Int32Array(81);
for (let id = 0; id < 81; id++) {
  CELL_PART[id] = (id / 27) | 0;
  CELL_BIT[id] = 1 << (id % 27);
}

const PEER = new Int32Array(81 * 3);
for (let id = 0; id < 81; id++) {
  for (let part = 0; part < 3; part++)
    PEER[id * 3 + part] = PEER_BITSETS[id][part];
}

const UNIT_POS = new Int32Array(27 * 3);
for (let u = 0; u < 27; u++) {
  for (let part = 0; part < 3; part++)
    UNIT_POS[u * 3 + part] = UNIT_BITSETS[u][part];
}

const UNIT_IDS = [];
for (let u = 0; u < 27; u++) {
  const ids = [];
  for (let part = 0; part < 3; part++) {
    let m = UNIT_POS[u * 3 + part];
    while (m) {
      ids.push(part * 27 + (31 - Math.clz32(m & -m)));
      m &= m - 1;
    }
  }
  UNIT_IDS.push(ids);
}

const UNIT_CELLS = UNIT_IDS.map((ids) =>
  ids.map((id) => [(id / 9) | 0, id % 9]),
);
const UNIT_OFFSET = { row: 0, col: 9, box: 18 };

const lowest = (m) => 31 - Math.clz32(m & -m);

const pop = (m) => {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
};

const bits9 = (m) => {
  const out = [];
  while (m) {
    out.push(lowest(m));
    m &= m - 1;
  }
  return out;
};

const boxOf = (r, c) => ((r / 3) | 0) * 3 + ((c / 3) | 0);
const pointOf = (r, c) => (r % 3) * 3 + (c % 3);

const buildGrid = (pencils) => {
  const cand = new Uint16Array(81);
  const row = new Uint16Array(81);
  const col = new Uint16Array(81);
  const box = new Uint16Array(81);
  const pos = new Int32Array(27);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const set = pencils[r][c];
      if (!set || set.size === 0) continue;
      const id = r * 9 + c;
      const b = boxOf(r, c);
      const p = pointOf(r, c);
      const part = CELL_PART[id];
      const bit = CELL_BIT[id];
      let cm = 0;
      for (const d of set) {
        const k = d - 1;
        cm |= 1 << k;
        row[k * 9 + r] |= 1 << c;
        col[k * 9 + c] |= 1 << r;
        box[k * 9 + b] |= 1 << p;
        pos[k * 3 + part] |= bit;
      }
      cand[id] = cm;
    }
  }
  return { cand, row, col, box, pos };
};

const commonPeers = (g, id1, id2, k) => {
  const out = [];
  for (let part = 0; part < 3; part++) {
    let m = PEER[id1 * 3 + part] & PEER[id2 * 3 + part] & g.pos[k * 3 + part];
    const base = part * 27;
    while (m) {
      const b = lowest(m);
      out.push(base + b);
      m &= m - 1;
    }
  }
  return out;
};

const seesId = (id1, id2) =>
  (PEER[id1 * 3 + CELL_PART[id2]] & CELL_BIT[id2]) !== 0;

const SEES_MATRIX = new Uint8Array(81 * 81);
for (let id1 = 0; id1 < 81; id1++) {
  for (let id2 = 0; id2 < 81; id2++) {
    if ((PEER[id1 * 3 + CELL_PART[id2]] & CELL_BIT[id2]) !== 0) {
      SEES_MATRIX[id1 * 81 + id2] = 1;
    }
  }
}

const _getUniqueRemovals = (arr) => {
  const seen = new Uint8Array(4096);
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    const key = (el.r << 8) | (el.c << 4) | el.num;
    if (seen[key] === 0) {
      seen[key] = 1;
      result.push(el);
    }
  }
  return result;
};

class AICNode {
  /**
   * @param {number[]} cells - Array of cell IDs (0-80). For basic nodes, length is 1.
   * @param {number[]} digits - Array of digits (1-9). For basic nodes, length is 1.
   */
  constructor(cells, digits) {
    this.cells = cells;
    this.digits = digits;

    this.isSingleDigit = this.digits.length === 1;
    this.isSingleCell = this.cells.length === 1;

    // Initialize 9 bitsets, each consisting of three 27-bit parts
    this.NodeBitset = Array.from({ length: 9 }, () => [0, 0, 0]);
    this.NandBitset = Array.from({ length: 9 }, () => [0, 0, 0]);

    // --- 1. Populate NodeBitset ---
    // Only enable the bit for the specific cell(s) and digit(s) this node represents
    for (const d of this.digits) {
      for (const id of this.cells) {
        const part = Math.floor(id / 27);
        const bit = id % 27;
        this.NodeBitset[d - 1][part] |= 1 << bit;
      }
    }

    // --- 2. Populate NandBitset (Weak Links) ---

    // Process A: Single Digit (e.g., standard nodes or grouped line/box nodes)
    if (this.isSingleDigit) {
      const d = this.digits[0];

      // Calculate common peers: Intersection (AND) of peers for all cells in the node
      let commonPeers = null;
      for (const id of this.cells) {
        if (commonPeers === null) {
          // Copy the 3 parts from the first cell to initialize
          commonPeers = [...PEER_BITSETS[id]];
        } else {
          // Bitwise AND intersection for each of the 3 parts
          commonPeers[0] &= PEER_BITSETS[id][0];
          commonPeers[1] &= PEER_BITSETS[id][1];
          commonPeers[2] &= PEER_BITSETS[id][2];
        }
      }

      if (commonPeers !== null) {
        // Apply the resolved common peers directly into the NandBitset
        this.NandBitset[d - 1][0] |= commonPeers[0];
        this.NandBitset[d - 1][1] |= commonPeers[1];
        this.NandBitset[d - 1][2] |= commonPeers[2];
      }
    }

    // Process B: Single Cell (e.g., standard nodes or intra-cell bivalue nodes)
    if (this.isSingleCell) {
      const id = this.cells[0];
      const part = Math.floor(id / 27);
      const bit = id % 27;

      // Enable the bits of this cell for all OTHER digits (mutually exclusive)
      for (let d = 1; d <= 9; d++) {
        if (!this.digits.includes(d)) {
          this.NandBitset[d - 1][part] |= 1 << bit;
        }
      }
    }

    // Note: Because we used two separate `if` statements above,
    // a basic node (which is BOTH single cell and single digit) will process both natively!
  }
}


const techniques = {};

Object.assign(techniques, {
  _templatingCache: null,

  _getBoxIndex: (r, c) => boxOf(r, c),
  _getPointIndex: (r, c) => pointOf(r, c),

  _cellToId: (r, c) => r * 9 + c,
  _idToCell: (id) => [Math.floor(id / 9), id % 9],

  _sees: (cell1, cell2) => {
    const id1 = cell1[0] * 9 + cell1[1];
    const id2 = cell2[0] * 9 + cell2[1];
    return SEES_MATRIX[id1 * 81 + id2] === 1;
  },

  _commonVisibleCells: (cell1, cell2) => {
    const id1 = cell1[0] * 9 + cell1[1];
    const id2 = cell2[0] * 9 + cell2[1];

    const common = [];
    for (let part = 0; part < 3; part++) {
      let m = PEER[id1 * 3 + part] & PEER[id2 * 3 + part];
      const base = part * 27;
      while (m) {
        const b = 31 - Math.clz32(m & -m);
        common.push(techniques._idToCell(base + b));
        m &= m - 1;
      }
    }
    return common;
  },
  _getCommonUnits: (cells) => {
    // Determine which units (row, col, box) contain ALL the provided cells
    if (!cells || cells.length === 0) return [];

    const rSet = new Set(cells.map(([r, _]) => r));
    const cSet = new Set(cells.map(([_, c]) => c));
    const bSet = new Set(cells.map(([r, c]) => techniques._getBoxIndex(r, c)));

    const units = [];
    // If all cells share the same row index, get that row's cells
    if (rSet.size === 1)
      units.push({
        type: "row",
        idx: rSet.values().next().value,
        cells: techniques._getUnitCells("row", rSet.values().next().value),
      });

    // If all cells share the same col index, get that col's cells
    if (cSet.size === 1)
      units.push({
        type: "col",
        idx: cSet.values().next().value,
        cells: techniques._getUnitCells("col", cSet.values().next().value),
      });

    // If all cells share the same box index, get that box's cells
    if (bSet.size === 1)
      units.push({
        type: "box",
        idx: bSet.values().next().value,
        cells: techniques._getUnitCells("box", bSet.values().next().value),
      });

    return units;
  },

  combinations: function* (arr, size) {
    if (size > arr.length) return;
    const indices = Array.from({ length: size }, (_, i) => i);
    const result = new Array(size); // Pre-allocate
    while (true) {
      for (let k = 0; k < size; k++) result[k] = arr[indices[k]];
      yield result.slice();
      let i = size - 1;
      while (i >= 0 && indices[i] === i + arr.length - size) {
        i--;
      }
      if (i < 0) return;
      indices[i]++;
      for (let j = i + 1; j < size; j++) {
        indices[j] = indices[j - 1] + 1;
      }
    }
  },

  _getUnitCells: (unitType, idx) => UNIT_CELLS[UNIT_OFFSET[unitType] + idx],

  // --- UNIT CACHING ---
  _getUnitCellsCached: (unitIndex) => UNIT_CELLS[unitIndex],

  _normalizeCells: (cells) =>
    cells.map((cell) => [
      cell.r !== undefined ? cell.r : cell[0],
      cell.c !== undefined ? cell.c : cell[1],
    ]),

  _formatCellsRC: (cells) => {
    if (!cells || cells.length === 0) return "";
    const normalized = techniques._normalizeCells(cells);
    if (normalized.length === 1) {
      return `r${normalized[0][0] + 1}c${normalized[0][1] + 1}`;
    }
    if (normalized.every((cell) => cell[0] === normalized[0][0])) {
      const columns = normalized
        .map((cell) => cell[1] + 1)
        .sort((a, b) => a - b)
        .join("");
      return `r${normalized[0][0] + 1}c${columns}`;
    }
    if (normalized.every((cell) => cell[1] === normalized[0][1])) {
      const rows = normalized
        .map((cell) => cell[0] + 1)
        .sort((a, b) => a - b)
        .join("");
      return `r${rows}c${normalized[0][1] + 1}`;
    }
    return normalized.map(([r, c]) => `r${r + 1}c${c + 1}`).join(",");
  },

  _formatBoxPoints: (cells, boxIndex) => {
    if (!cells || cells.length === 0) return "";
    const points = techniques
      ._normalizeCells(cells)
      .map(([r, c]) => (r % 3) * 3 + (c % 3) + 1)
      .sort((a, b) => a - b)
      .join("");
    return `b${boxIndex + 1}p${points}`;
  },

  _formatRectangleBounds: (cells) => {
    const normalized = techniques._normalizeCells(cells);
    const rows = [...new Set(normalized.map(([r]) => r + 1))]
      .sort((a, b) => a - b)
      .join("");
    const columns = [...new Set(normalized.map(([, c]) => c + 1))]
      .sort((a, b) => a - b)
      .join("");
    return `r${rows}c${columns}`;
  },

  _formatGuardianExtras: (cells, excludedDigits, pencils) =>
    cells
      .map(([r, c]) => {
        const extras = [...pencils[r][c]]
          .filter((digit) => !excludedDigits.has(digit))
          .sort((a, b) => a - b)
          .join("");
        return `(${extras})r${r + 1}c${c + 1}`;
      })
      .join(","),

  _formatAicLocation: (cells, preferBox = false) => {
    if (cells.length === 0) return "";
    if (cells.length === 1) {
      const r = Math.floor(cells[0] / 9);
      const c = cells[0] % 9;
      if (preferBox) {
        const box = Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1;
        const point = (r % 3) * 3 + (c % 3) + 1;
        return `b${box}p${point}`;
      }
      return `r${r + 1}c${c + 1}`;
    }
    const boxes = [
      ...new Set(
        cells.map(
          (id) =>
            Math.floor(Math.floor(id / 9) / 3) * 3 +
            Math.floor((id % 9) / 3) +
            1,
        ),
      ),
    ];
    if (preferBox && boxes.length === 1) {
      const points = cells
        .map((id) => (Math.floor(id / 9) % 3) * 3 + ((id % 9) % 3) + 1)
        .sort((a, b) => a - b);
      return `b${boxes[0]}p${points.join("")}`;
    }
    const rows = [...new Set(cells.map((id) => Math.floor(id / 9) + 1))].sort(
      (a, b) => a - b,
    );
    const columns = [...new Set(cells.map((id) => (id % 9) + 1))].sort(
      (a, b) => a - b,
    );
    if (rows.length === 1) return `r${rows[0]}c${columns.join("")}`;
    if (columns.length === 1) return `r${rows.join("")}c${columns[0]}`;
    return [...cells]
      .sort((a, b) => a - b)
      .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
      .join("");
  },

  _formatCompactAicLocation: (cells) => {
    if (cells.length <= 1) return techniques._formatAicLocation(cells);
    const uniqueCells = [...new Set(cells)];
    const rows = new Set(uniqueCells.map((id) => Math.floor(id / 9)));
    const columns = new Set(uniqueCells.map((id) => id % 9));
    if (rows.size === 1 || columns.size === 1) {
      return techniques._formatAicLocation(uniqueCells);
    }
    const groupByRow = rows.size <= columns.size;
    const groups = new Map();
    for (const id of uniqueCells) {
      const key = groupByRow ? Math.floor(id / 9) : id % 9;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(groupByRow ? id % 9 : Math.floor(id / 9));
    }
    return Array.from(groups.entries())
      .map(([key, values]) => {
        const positions = values
          .sort((a, b) => a - b)
          .map((value) => value + 1)
          .join("");
        return groupByRow
          ? `r${key + 1}c${positions}`
          : `r${positions}c${key + 1}`;
      })
      .join(",");
  },

  _hasNandCandidates: (node, pencils) => {
    const digit = node.digits[0];
    for (let part = 0; part < 3; part++) {
      let mask = node.NandBitset[digit - 1][part];
      let bit = 0;
      while (mask > 0) {
        if (mask & 1) {
          const id = part * 27 + bit;
          const r = Math.floor(id / 9);
          const c = id % 9;
          if (pencils[r][c] && pencils[r][c].has(digit)) return true;
        }
        mask >>>= 1;
        bit++;
      }
    }
    return false;
  },

  _cellBitsetAnd: (left, right) => [
    left[0] & right[0],
    left[1] & right[1],
    left[2] & right[2],
  ],

  _setCellBit: (bitset, id) => {
    bitset[Math.floor(id / 27)] |= 1 << (id % 27);
  },

  _getCellBits: (bitset) => {
    const ids = [];
    for (let part = 0; part < 3; part++) {
      let mask = bitset[part];
      let bit = 0;
      while (mask > 0) {
        if (mask & 1) ids.push(part * 27 + bit);
        mask >>= 1;
        bit++;
      }
    }
    return ids;
  },

});
