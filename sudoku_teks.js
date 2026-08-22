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

const SEES_MATRIX = new Uint8Array(81 * 81);
for (let id1 = 0; id1 < 81; id1++) {
  for (let id2 = 0; id2 < 81; id2++) {
    if ((PEER_MAP[id1] & (1n << BigInt(id2))) !== 0n) {
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

const techniques = {
  _templatingCache: null,

  _getBoxIndex: (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3),
  _getPointIndex: (r, c) => Math.floor(r % 3) * 3 + Math.floor(c % 3),

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

    // Intersection of two peer sets is just a fast bitwise AND
    const commonMask = PEER_MAP[id1] & PEER_MAP[id2];

    const common = [];
    if (commonMask === 0n) return common;

    // Iterate bits to find enabled cells (0-80)
    for (let i = 0; i < 81; i++) {
      if ((commonMask & CELL_MASK[i]) !== 0n) {
        common.push(techniques._idToCell(i));
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

  _getUnitCells: (unitType, idx) => {
    const cells = [];
    if (unitType === "row") for (let c = 0; c < 9; c++) cells.push([idx, c]);
    else if (unitType === "col")
      for (let r = 0; r < 9; r++) cells.push([r, idx]);
    else if (unitType === "box") {
      const startRow = Math.floor(idx / 3) * 3;
      const startCol = (idx % 3) * 3;
      for (let r_offset = 0; r_offset < 3; r_offset++) {
        for (let c_offset = 0; c_offset < 3; c_offset++) {
          cells.push([startRow + r_offset, startCol + c_offset]);
        }
      }
    }
    return cells;
  },

  // --- UNIT CACHING ---
  _unitCache: [],
  _getUnitCellsCached: (unitIndex) => {
    if (techniques._unitCache.length === 0) {
      for (let i = 0; i < 27; i++) {
        let type = i < 9 ? "row" : i < 18 ? "col" : "box";
        let idx = i < 9 ? i : i < 18 ? i - 9 : i - 18;
        techniques._unitCache.push(techniques._getUnitCells(type, idx));
      }
    }
    return techniques._unitCache[unitIndex];
  },

  eliminateCandidates: (board, pencils, findAll = false) => {
    // Initialize Cache
    techniques._resetAICCache();

    const removals = [];
    let newr = 0;
    let newc = 0;
    let newd = 0;
    let newpr = 0;
    let newpc = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        // Find all concrete numbers (given or filled)
        if (board[r][c] > 0) {
          const num = board[r][c];
          // Look at all peers
          for (let pr = 0; pr < 9; pr++) {
            for (let pc = 0; pc < 9; pc++) {
              if (techniques._sees([r, c], [pr, pc])) {
                // If the peer has this number as a candidate, mark it for removal
                if (pencils[pr][pc].has(num)) {
                  newpr = pr;
                  newpc = pc;
                  newr = r;
                  newc = c;
                  newd = num;
                  removals.push({ r: pr, c: pc, num });
                }
              }
            }
          }
        }
      }
    }
    if (removals.length > 0) {
      // De-duplicate removals (a cell can be a peer in multiple ways)
      const uniqueRemovals = _getUniqueRemovals(removals);
      const res = {
        change: true,
        type: "remove",
        cells: uniqueRemovals,
        hint: {
          name: t("teks_msg_1"),
          mainInfo: t("teks_msg_2", newpr + 1, newpc + 1),
          detail: t("teks_msg_3", newd, newr, newc),
        },
        applyVisuals: () => {
          highlightedDigit = null;
          highlightState = 0;

          boardState[newr][newc].cellColor = cellColorPalette[7]; // Color 8
          uniqueRemovals.forEach((el) =>
            boardState[el.r][el.c].candSlashes.set(el.num, markColorPalette[0]),
          ); // Color 1
        },
      };
      return findAll ? [res] : res;
    }
    return findAll ? [] : { change: false };
  },

  fullHouse: (board, pencils, findAll = false) => {
    const results = [];
    // 1. Scan Rows
    for (let r = 0; r < 9; r++) {
      let emptyCnt = 0;
      let emptyCol = -1;
      let solvedMask = 0;
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          emptyCnt++;
          if (emptyCnt > 1) break; // Optimization
          emptyCol = c;
        } else {
          solvedMask |= 1 << (board[r][c] - 1);
        }
      }
      // CHECK ADDED: && pencils[r][emptyCol].size === 1
      if (emptyCnt === 1 && pencils[r][emptyCol].size === 1) {
        const res = techniques._resolveFullHouse(
          r,
          emptyCol,
          solvedMask,
          t("teks_msg_4", r + 1),
        );
        if (!findAll) return res;
        results.push(res);
      }
    }

    // 2. Scan Columns
    for (let c = 0; c < 9; c++) {
      let emptyCnt = 0;
      let emptyRow = -1;
      let solvedMask = 0;
      for (let r = 0; r < 9; r++) {
        if (board[r][c] === 0) {
          emptyCnt++;
          if (emptyCnt > 1) break;
          emptyRow = r;
        } else {
          solvedMask |= 1 << (board[r][c] - 1);
        }
      }
      // CHECK ADDED: && pencils[emptyRow][c].size === 1
      if (emptyCnt === 1 && pencils[emptyRow][c].size === 1) {
        const res = techniques._resolveFullHouse(
          emptyRow,
          c,
          solvedMask,
          t("teks_msg_5", c + 1),
        );
        if (!findAll) return res;
        results.push(res);
      }
    }

    // 3. Scan Boxes
    for (let b = 0; b < 9; b++) {
      let emptyCnt = 0;
      let emptyCell = null;
      let solvedMask = 0;
      const rStart = Math.floor(b / 3) * 3;
      const cStart = (b % 3) * 3;

      for (let i = 0; i < 9; i++) {
        const r = rStart + Math.floor(i / 3);
        const c = cStart + (i % 3);
        if (board[r][c] === 0) {
          emptyCnt++;
          if (emptyCnt > 1) break;
          emptyCell = { r, c };
        } else {
          solvedMask |= 1 << (board[r][c] - 1);
        }
      }

      // CHECK ADDED: && pencils[emptyCell.r][emptyCell.c].size === 1
      if (emptyCnt === 1 && pencils[emptyCell.r][emptyCell.c].size === 1) {
        const res = techniques._resolveFullHouse(
          emptyCell.r,
          emptyCell.c,
          solvedMask,
          t("teks_msg_6", b + 1),
        );
        if (!findAll) return res;
        results.push(res);
      }
    }
    return findAll ? results : { change: false };
  },

  // Helper to calculate missing digit and format the return object
  _resolveFullHouse: (r, c, solvedMask, unitName) => {
    let missingNum = 0;
    // Find which bit is 0 in the mask (111111111)
    for (let d = 1; d <= 9; d++) {
      if (!((solvedMask >> (d - 1)) & 1)) {
        missingNum = d;
        break;
      }
    }
    const isBox = unitName.includes(t("teks_msg_7"));
    const position = isBox
      ? `b${techniques._getBoxIndex(r, c) + 1}p${techniques._getPointIndex(r, c) + 1}`
      : `r${r + 1}c${c + 1}`;
    const detail = t("teks_msg_8", missingNum, unitName, position);

    return {
      change: true,
      type: "place",
      r,
      c,
      num: missingNum,
      hint: {
        name: t("teks_msg_9"),
        mainInfo: unitName,
        detail,
      },
      applyVisuals: () => {
        highlightedDigit = missingNum;
        highlightState = 1;
        const type = unitName.substring(0, 3).toLowerCase();
        const idx = parseInt(unitName.match(/\d+/)[0]) - 1;
        techniques._getUnitCells(type, idx).forEach(([ur, uc]) => {
          boardState[ur][uc].cellColor = cellColorPalette[7]; // House cell color 8
        });
        boardState[r][c].pencilColors.set(missingNum, candidateColorPalette[3]);
      },
    };
  },

  nakedSingle: (board, pencils, findAll = false) => {
    const results = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0 && pencils[r][c].size === 1) {
          const num = pencils[r][c].values().next().value;
          const res = {
            change: true,
            type: "place",
            r,
            c,
            num,
            hint: {
              name: t("teks_msg_10"),
              mainInfo: t("teks_msg_11", r + 1, c + 1),
              detail: t("teks_msg_12", num, r + 1, c + 1),
            },
            applyVisuals: () => {
              highlightedDigit = null;
              highlightState = 0;
              boardState[r][c].cellColor = cellColorPalette[7]; // Cell color 8
              boardState[r][c].pencilColors.set(num, candidateColorPalette[3]);
            },
          };
          if (!findAll) return res;
          results.push(res);
        }
      }
    }
    return findAll ? results : { change: false };
  },

  hiddenSingle: (board, pencils, findAll = false) => {
    const results = [];
    // 1. Define types with the display name you want
    const unitTypes = [
      { name: "box", label: t("teks_msg_7") },
      { name: "row", label: t("teks_msg_14") },
      { name: "col", label: t("teks_msg_15") },
    ];

    // 2. Iterate through types, then indices (0-8)
    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        // Get the specific unit (e.g., Row 0)
        const unit = techniques._getUnitCells(name, i);

        for (let num = 1; num <= 9; num++) {
          const possibleCells = [];
          for (const [r, c] of unit) {
            if (board[r][c] === 0 && pencils[r][c].has(num)) {
              possibleCells.push([r, c]);
            }
          }

          if (possibleCells.length === 1) {
            const [r, c] = possibleCells[0];
            const isBox = label === t("teks_msg_7");
            const position = isBox
              ? `b${techniques._getBoxIndex(r, c) + 1}p${techniques._getPointIndex(r, c) + 1}`
              : `r${r + 1}c${c + 1}`;
            const unitLabel = t("teks_msg_17", label, i + 1);
            const detail = t("teks_msg_18", position, num, unitLabel);

            const res = {
              change: true,
              type: "place",
              r,
              c,
              num,
              hint: {
                name: t("teks_msg_19"),
                mainInfo: unitLabel,
                detail,
              },
              applyVisuals: () => {
                highlightedDigit = num;
                highlightState = 1;

                // Color the entire unit (house)
                unit.forEach(([ur, uc]) => {
                  boardState[ur][uc].cellColor = cellColorPalette[7]; // House color 8
                });

                // Highlight the specific target cell distinctly over the house
                boardState[r][c].cellColor = cellColorPalette[6]; // Target cell color 7

                // Highlight the placed candidate
                boardState[r][c].pencilColors.set(
                  num,
                  candidateColorPalette[3],
                );
              },
            };
            if (!findAll) return res;
            results.push(res);
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  lockedSubset: (board, pencils, size, findAll = false) => {
    // This technique finds subsets of candidates that are locked within the
    // intersection of a box and a line (row or column).
    // It's a combination of t("teks_msg_28") (eliminating from the line outside the box)
    // and "Naked Subset" (eliminating from the box outside the line).

    const results = [];
    // Iterate through each of the 9 boxes
    for (let b = 0; b < 9; b++) {
      const box_r_start = Math.floor(b / 3) * 3;
      const box_c_start = (b % 3) * 3;

      // Loop twice: once for rows (isRow = true), once for columns (isRow = false)
      for (const isRow of [true, false]) {
        for (let i = 0; i < 3; i++) {
          const line_idx = isRow ? box_r_start + i : box_c_start + i;

          // Find potential cells for a subset within this intersection
          const potential_cells = [];
          for (let j = 0; j < 3; j++) {
            const r = isRow ? line_idx : box_r_start + j;
            const c = isRow ? box_c_start + j : line_idx;

            if (
              board[r][c] === 0 &&
              pencils[r][c].size <= size &&
              pencils[r][c].size >= 1
            ) {
              potential_cells.push([r, c]);
            }
          }
          if (potential_cells.length < size) continue;

          // Generate combinations of 'size' cells from these potentials
          for (const combo of techniques.combinations(potential_cells, size)) {
            const union = new Set();
            combo.forEach(([r, c]) => {
              pencils[r][c].forEach((num) => union.add(num));
            });

            // If the union of candidates has the same size as the number of cells, we've found a subset
            if (union.size === size) {
              const removals = [];

              // A) Eliminate from other cells in the LINE (outside this box). This is a t("teks_msg_28") move.
              const box_limit = isRow ? box_c_start : box_r_start;
              for (let k = 0; k < 9; k++) {
                if (k >= box_limit && k < box_limit + 3) continue; // Skip cells inside the box

                const r_peer = isRow ? line_idx : k;
                const c_peer = isRow ? k : line_idx;

                if (board[r_peer][c_peer] === 0) {
                  for (const num of union) {
                    if (pencils[r_peer][c_peer].has(num)) {
                      removals.push({ r: r_peer, c: c_peer, num });
                    }
                  }
                }
              }

              // B) Eliminate from other cells in the BOX (outside this line). This is a "Naked Subset" move.
              for (let r_offset = 0; r_offset < 3; r_offset++) {
                for (let c_offset = 0; c_offset < 3; c_offset++) {
                  const r_peer = box_r_start + r_offset;
                  const c_peer = box_c_start + c_offset;

                  // Skip the intersection line itself
                  if (isRow && r_peer === line_idx) continue;
                  if (!isRow && c_peer === line_idx) continue;

                  if (board[r_peer][c_peer] === 0) {
                    for (const num of union) {
                      if (pencils[r_peer][c_peer].has(num)) {
                        removals.push({ r: r_peer, c: c_peer, num });
                      }
                    }
                  }
                }
              }

              if (removals.length > 0) {
                // Construct the union cells string (e.g., r2c456 or r78c1)
                const rows = [...new Set(combo.map(([r, c]) => r + 1))]
                  .sort()
                  .join("");
                const cols = [...new Set(combo.map(([r, c]) => c + 1))]
                  .sort()
                  .join("");
                const cellStr = `r${rows}c${cols}`;

                const lineType = isRow ? t("teks_msg_14") : t("teks_msg_15");

                const res = {
                  change: true,
                  type: "remove",
                  cells: removals,
                  hint: {
                    name: size === 2 ? t("teks_msg_22") : t("teks_msg_23"),
                    mainInfo: t("teks_msg_24", lineType, line_idx + 1, b + 1),
                    detail: t(
                      "teks_msg_25",
                      cellStr,
                      [...union].join(""),
                      lineType,
                      line_idx + 1,
                      b + 1,
                    ),
                  },
                  applyVisuals: () => {
                    highlightedDigit = null;
                    highlightState = 0;
                    combo.forEach(([cr, cc]) => {
                      boardState[cr][cc].cellColor = cellColorPalette[6]; // Subset cell color 7
                      union.forEach((cand) => {
                        if (pencils[cr][cc].has(cand)) {
                          boardState[cr][cc].pencilColors.set(
                            cand,
                            candidateColorPalette[4],
                          ); // Subset cand color 5
                        }
                      });
                    });
                    removals.forEach((el) =>
                      boardState[el.r][el.c].candSlashes.set(
                        el.num,
                        markColorPalette[0],
                      ),
                    ); // Color 1
                  },
                };
                if (!findAll) return res;
                results.push(res);
              }
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  intersection: (board, pencils, findAll = false) => {
    const results = [];
    for (const is_pointing of [true, false]) {
      // Pointing: outer loop = box (0-8), inner = row-or-col orientation
      // Claiming: outer loop = line index (0-8), inner = row-or-col orientation
      for (let primaryIdx = 0; primaryIdx < 9; primaryIdx++) {
        for (let num = 1; num <= 9; num++) {
          for (const isRow of [true, false]) {
            // ── Collect candidates in the "source" unit ──────────────────────
            let sourceCellsWithNum = [];

            if (is_pointing) {
              // Source = box[primaryIdx]; find cells that share a row or col
              const boxCells = techniques._getUnitCells("box", primaryIdx);
              for (const [r, c] of boxCells) {
                if (pencils[r][c].has(num)) sourceCellsWithNum.push([r, c]);
              }
            } else {
              // Source = row or col [primaryIdx]
              for (let peer = 0; peer < 9; peer++) {
                const r = isRow ? primaryIdx : peer;
                const c = isRow ? peer : primaryIdx;
                if (pencils[r][c].has(num)) sourceCellsWithNum.push([r, c]);
              }
            }

            if (sourceCellsWithNum.length < 2) continue;

            // ── Check confinement to one "secondary" unit ─────────────────────
            // Pointing: secondary = row or col  →  check all share same row/col index
            // Claiming: secondary = box         →  check all share same box index
            const secondaryIdxs = is_pointing
              ? new Set(sourceCellsWithNum.map(([r, c]) => (isRow ? r : c)))
              : new Set(
                  sourceCellsWithNum.map(
                    ([r, c]) => Math.floor(r / 3) * 3 + Math.floor(c / 3),
                  ),
                );

            if (secondaryIdxs.size !== 1) continue;
            const secondaryIdx = [...secondaryIdxs][0];

            // ── Collect removals from the "target" unit ───────────────────────
            // Pointing: eliminate from the row/col OUTSIDE the source box
            // Claiming: eliminate from the box OUTSIDE the source row/col
            const removals = [];

            if (is_pointing) {
              for (let peer = 0; peer < 9; peer++) {
                const r = isRow ? secondaryIdx : peer;
                const c = isRow ? peer : secondaryIdx;
                const cellBoxIdx = Math.floor(r / 3) * 3 + Math.floor(c / 3);
                if (cellBoxIdx !== primaryIdx && pencils[r][c].has(num)) {
                  removals.push({ r, c, num });
                }
              }
            } else {
              const boxCells = techniques._getUnitCells("box", secondaryIdx);
              for (const [r, c] of boxCells) {
                const isOutsideLine = isRow
                  ? r !== primaryIdx
                  : c !== primaryIdx;
                if (isOutsideLine && pencils[r][c].has(num)) {
                  removals.push({ r, c, num });
                }
              }
            }

            if (removals.length === 0) continue;

            // ── Build hint strings ────────────────────────────────────────────
            const lineName = isRow ? t("teks_msg_14") : t("teks_msg_15");

            const hintName = is_pointing ? t("teks_msg_28") : t("teks_msg_29");
            const mainInfo = is_pointing
              ? t("teks_msg_30", primaryIdx + 1, lineName, secondaryIdx + 1)
              : t("teks_msg_31", lineName, primaryIdx + 1, secondaryIdx + 1);

            let cellStr;
            if (is_pointing) {
              const points = [
                ...new Set(
                  sourceCellsWithNum.map(
                    ([r, c]) => Math.floor(r % 3) * 3 + Math.floor(c % 3) + 1,
                  ),
                ),
              ]
                .sort()
                .join("");
              cellStr = `b${primaryIdx + 1}p${points}`;
            } else {
              const rows = [...new Set(sourceCellsWithNum.map(([r]) => r + 1))]
                .sort()
                .join("");
              const cols = [
                ...new Set(sourceCellsWithNum.map(([, c]) => c + 1)),
              ]
                .sort()
                .join("");
              cellStr = `r${rows}c${cols}`;
            }

            const detail = is_pointing
              ? t(
                  "teks_msg_32",
                  num,
                  primaryIdx + 1,
                  cellStr,
                  lineName,
                  secondaryIdx + 1,
                )
              : t(
                  "teks_msg_33",
                  num,
                  lineName,
                  primaryIdx + 1,
                  cellStr,
                  secondaryIdx + 1,
                );

            // ── Capture loop variables for the closure ────────────────────────
            const _sourceCellsWithNum = sourceCellsWithNum;
            const _primaryIdx = primaryIdx;
            const _secondaryIdx = secondaryIdx;
            const _isRow = isRow;
            const _is_pointing = is_pointing;
            const _removals = removals;

            const res = {
              change: true,
              type: "remove",
              cells: removals,
              hint: { name: hintName, mainInfo, detail },
              applyVisuals: () => {
                highlightedDigit = num;
                highlightState = 1;

                const boxIdx = _is_pointing ? _primaryIdx : _secondaryIdx;
                const lineIdx = _is_pointing ? _secondaryIdx : _primaryIdx;

                const boxCells = techniques._getUnitCells("box", boxIdx);
                const lineCells = techniques._getUnitCells(
                  _isRow ? "row" : "col",
                  lineIdx,
                );

                // Pointing: line is Cell Color 8, box is Cell Color 7
                // Claiming: box  is Cell Color 8, line is Cell Color 7
                const [color8Cells, color7Cells] = _is_pointing
                  ? [lineCells, boxCells]
                  : [boxCells, lineCells];

                color7Cells.forEach(([cr, cc]) => {
                  window.addCellColor(cr, cc, cellColorPalette[6]);
                });

                color8Cells.forEach(([cr, cc]) => {
                  window.addCellColor(cr, cc, cellColorPalette[7]);
                });

                // Highlight the source candidates
                _sourceCellsWithNum.forEach(([cr, cc]) => {
                  boardState[cr][cc].pencilColors.set(
                    num,
                    candidateColorPalette[4],
                  );
                });

                // Mark eliminations
                _removals.forEach((el) =>
                  boardState[el.r][el.c].candSlashes.set(
                    el.num,
                    markColorPalette[0],
                  ),
                );
              },
            };
            if (!findAll) return res;
            results.push(res);
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  nakedSubset: (board, pencils, size, findAll = false) => {
    const results = [];

    const unitTypes = [
      { name: "box", label: t("teks_msg_7") },
      { name: "row", label: t("teks_msg_14") },
      { name: "col", label: t("teks_msg_15") },
    ];

    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        const unit = techniques._getUnitCells(name, i);
        const unitName = t("teks_msg_17", label, i + 1); // Now we have the proper name

        // const emptyCells = unit.filter(([r, c]) => board[r][c] === 0);
        // if (emptyCells.length < 2 * size) continue;

        const potentialCells = unit.filter(
          ([r, c]) =>
            board[r][c] === 0 &&
            pencils[r][c].size >= 1 &&
            pencils[r][c].size <= size,
        );

        if (potentialCells.length < size) continue;

        for (const cellGroup of techniques.combinations(potentialCells, size)) {
          const union = new Set();
          cellGroup.forEach(([r, c]) =>
            pencils[r][c].forEach((p) => union.add(p)),
          );

          if (union.size === size) {
            const removals = [];
            const cellGroupSet = new Set(cellGroup.map(JSON.stringify));

            // Find ALL units that share these cells (e.g., the Row AND the Box)
            const commonUnits = techniques._getCommonUnits(cellGroup);

            for (const cUnit of commonUnits) {
              for (const [r, c] of cUnit.cells) {
                if (
                  board[r][c] === 0 &&
                  !cellGroupSet.has(JSON.stringify([r, c]))
                ) {
                  for (const num of union) {
                    if (pencils[r][c].has(num)) {
                      // Prevent duplicate removals since a cell might be seen by multiple common units
                      if (
                        !removals.some(
                          (rem) =>
                            rem.r === r && rem.c === c && rem.num === num,
                        )
                      ) {
                        removals.push({ r, c, num });
                      }
                    }
                  }
                }
              }
            }

            if (removals.length > 0) {
              // --- Format cell string based on unit type ---
              let cellStr = "";
              if (name === "box") {
                const points = [
                  ...new Set(
                    cellGroup.map(
                      ([r, c]) => Math.floor(r % 3) * 3 + Math.floor(c % 3) + 1,
                    ),
                  ),
                ]
                  .sort()
                  .join("");
                cellStr = `b${i + 1}p${points}`;
              } else {
                const rows = [...new Set(cellGroup.map(([r, c]) => r + 1))]
                  .sort()
                  .join("");
                const cols = [...new Set(cellGroup.map(([r, c]) => c + 1))]
                  .sort()
                  .join("");
                cellStr = `r${rows}c${cols}`;
              }

              const res = {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: `${t("teks_naked")} ${
                    size === 2
                      ? t("teks_msg_38")
                      : size === 3
                        ? t("teks_msg_39")
                        : t("teks_msg_40")
                  }`,
                  mainInfo: `${unitName}`,
                  detail: t(
                    "teks_msg_41",
                    cellStr,
                    [...union].sort().join(""),
                    unitName,
                  ),
                },
                applyVisuals: () => {
                  highlightedDigit = null;
                  highlightState = 0;
                  cellGroup.forEach(([cr, cc]) => {
                    boardState[cr][cc].cellColor = cellColorPalette[6]; // Subset cell color 7
                    union.forEach((cand) => {
                      if (boardState[cr][cc].pencils.has(cand)) {
                        boardState[cr][cc].pencilColors.set(
                          cand,
                          candidateColorPalette[4],
                        ); // Subset cand color 5
                      }
                    });
                  });
                  removals.forEach((el) =>
                    boardState[el.r][el.c].candSlashes.set(
                      el.num,
                      markColorPalette[0],
                    ),
                  ); // Color 1
                },
              };
              if (!findAll) return res;
              results.push(res);
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  hiddenSubset: (board, pencils, size, findAll = false) => {
    const unitTypes = [
      { name: "box", label: t("teks_msg_7") },
      { name: "row", label: t("teks_msg_14") },
      { name: "col", label: t("teks_msg_15") },
    ];
    const results = [];

    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        const unit = techniques._getUnitCells(name, i);
        const unitName = t("teks_msg_17", label, i + 1); // Now we have the proper name

        const emptyCells = unit.filter(([r, c]) => board[r][c] === 0);
        // Fixed logic: Hidden subsets need at least size + 1 empty cells usually,
        // but keeping your original logic:
        // if (emptyCells.length < 2 * size + 1) continue;

        const candMap = new Map();
        for (const cell of emptyCells) {
          for (const num of pencils[cell[0]][cell[1]]) {
            if (!candMap.has(num)) candMap.set(num, []);
            candMap.get(num).push(cell);
          }
        }

        const availableCands = [...candMap.keys()];
        if (availableCands.length <= size) continue;

        for (const numGroup of techniques.combinations(availableCands, size)) {
          const cellUnion = new Set();
          numGroup.forEach((num) => {
            candMap
              .get(num)
              .forEach((cell) =>
                cellUnion.add(techniques._cellToId(cell[0], cell[1])),
              );
          });

          if (cellUnion.size === size) {
            const removals = [];
            const numGroupSet = new Set(numGroup);
            const cells = [...cellUnion].map((id) => techniques._idToCell(id));

            for (const [r, c] of cells) {
              for (const p of pencils[r][c]) {
                if (!numGroupSet.has(p)) {
                  removals.push({ r, c, num: p });
                }
              }
            }
            if (removals.length > 0) {
              // --- Format cell string based on unit type ---
              let cellStr = "";
              if (name === "box") {
                const points = [
                  ...new Set(
                    cells.map(
                      ([r, c]) => Math.floor(r % 3) * 3 + Math.floor(c % 3) + 1,
                    ),
                  ),
                ]
                  .sort()
                  .join("");
                cellStr = `b${i + 1}p${points}`;
              } else {
                const rows = [...new Set(cells.map(([r, c]) => r + 1))]
                  .sort()
                  .join("");
                const cols = [...new Set(cells.map(([r, c]) => c + 1))]
                  .sort()
                  .join("");
                cellStr = `r${rows}c${cols}`;
              }

              // Extract and sort the digits for the string
              const digitsStr = [...numGroup].sort().join("");

              const res = {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: `${t("teks_hidden")} ${
                    size === 2
                      ? t("teks_msg_38")
                      : size === 3
                        ? t("teks_msg_39")
                        : t("teks_msg_40")
                  }`,
                  mainInfo: `${unitName}`,
                  detail: t("teks_msg_46", digitsStr, unitName, cellStr),
                },
                applyVisuals: () => {
                  highlightedDigit = null;
                  highlightState = 0;
                  cells.forEach(([cr, cc]) => {
                    boardState[cr][cc].cellColor = cellColorPalette[6]; // Subset cell color 7
                    numGroupSet.forEach((cand) => {
                      if (boardState[cr][cc].pencils.has(cand)) {
                        boardState[cr][cc].pencilColors.set(
                          cand,
                          candidateColorPalette[4],
                        ); // Subset cand color 5
                      }
                    });
                  });
                  removals.forEach((el) =>
                    boardState[el.r][el.c].candSlashes.set(
                      el.num,
                      markColorPalette[0],
                    ),
                  ); // Color 1
                },
              };
              if (!findAll) return res;
              results.push(res);
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  fish: (board, pencils, size, findAll = false) => {
    const results = [];
    for (const isRowBased of [true, false]) {
      for (let num = 1; num <= 9; num++) {
        const candidatesInDim = [];
        for (let i = 0; i < 9; i++) {
          const indices = [];
          for (let j = 0; j < 9; j++) {
            const [r, c] = isRowBased ? [i, j] : [j, i];
            if (pencils[r][c].has(num)) indices.push(j);
          }
          if (indices.length >= 2 && indices.length <= size) {
            candidatesInDim.push([i, indices]);
          }
        }
        if (candidatesInDim.length < size) continue;

        for (const lines of techniques.combinations(candidatesInDim, size)) {
          const allSecondaryIndices = new Set();
          lines.forEach(([_, indices]) =>
            indices.forEach((idx) => allSecondaryIndices.add(idx)),
          );
          if (allSecondaryIndices.size === size) {
            const removals = [];
            const primaryLineIndices = new Set(lines.map(([i, _]) => i));
            for (const secIdx of allSecondaryIndices) {
              for (let primIdx = 0; primIdx < 9; primIdx++) {
                if (!primaryLineIndices.has(primIdx)) {
                  const [r, c] = isRowBased
                    ? [primIdx, secIdx]
                    : [secIdx, primIdx];
                  if (pencils[r][c].has(num)) removals.push({ r, c, num });
                }
              }
            }
            if (removals.length > 0) {
              // --- Build Base and Cover notation strings ---
              const basePrefix = isRowBased ? "r" : "c";
              const coverPrefix = isRowBased ? "c" : "r";

              const baseNums = [...primaryLineIndices]
                .map((i) => i + 1)
                .sort((a, b) => a - b)
                .join("");
              const coverNums = [...allSecondaryIndices]
                .map((i) => i + 1)
                .sort((a, b) => a - b)
                .join("");

              const baseStr = `${basePrefix}${baseNums}`;
              const coverStr = `${coverPrefix}${coverNums}`;

              const res = {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name:
                    size === 2
                      ? t("teks_msg_47")
                      : size === 3
                        ? t("teks_msg_47_1")
                        : t("teks_msg_47_2"),
                  mainInfo: t("teks_msg_48", num),
                  detail: t("teks_msg_162", num, baseStr, coverStr),
                },
                applyVisuals: () => {
                  highlightedDigit = num;
                  highlightState = 1;

                  // Color base cells over cover (Color 7)
                  primaryLineIndices.forEach((primIdx) => {
                    for (let p = 0; p < 9; p++) {
                      const [cr, cc] = isRowBased ? [primIdx, p] : [p, primIdx];
                      window.addCellColor(cr, cc, cellColorPalette[6]);

                      // FIX: Use boardState.pencils instead of local pencils
                      if (boardState[cr][cc].pencils.has(num)) {
                        boardState[cr][cc].pencilColors.set(
                          num,
                          candidateColorPalette[6],
                        ); // Candidate Color 7
                      }
                    }
                  });

                  // Color cover cells first (Color 8)
                  allSecondaryIndices.forEach((secIdx) => {
                    for (let p = 0; p < 9; p++) {
                      const [cr, cc] = isRowBased ? [p, secIdx] : [secIdx, p];
                      window.addCellColor(cr, cc, cellColorPalette[7]);
                    }
                  });

                  removals.forEach((el) =>
                    boardState[el.r][el.c].candSlashes.set(
                      el.num,
                      markColorPalette[0],
                    ),
                  ); // Color 1
                },
              };
              if (!findAll) return res;
              results.push(res);
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  finnedXWing: (board, pencils, findAll = false) => {
    if (!findAll) {
      let result = techniques._findFinnedFish(board, pencils, 2, true, false);
      if (result.change) return result;
      return techniques._findFinnedFish(board, pencils, 2, false, false);
    } else {
      const r1 = techniques._findFinnedFish(board, pencils, 2, true, true);
      const r2 = techniques._findFinnedFish(board, pencils, 2, false, true);
      return [...r1, ...r2];
    }
  },

  finnedSwordfish: (board, pencils, findAll = false) => {
    if (!findAll) {
      let result = techniques._findFinnedFish(board, pencils, 3, true, false);
      if (result.change) return result;
      return techniques._findFinnedFish(board, pencils, 3, false, false);
    } else {
      const r1 = techniques._findFinnedFish(board, pencils, 3, true, true);
      const r2 = techniques._findFinnedFish(board, pencils, 3, false, true);
      return [...r1, ...r2];
    }
  },

  finnedJellyfish: (board, pencils, findAll = false) => {
    if (!findAll) {
      let result = techniques._findFinnedFish(board, pencils, 4, true, false);
      if (result.change) return result;
      return techniques._findFinnedFish(board, pencils, 4, false, false);
    } else {
      const r1 = techniques._findFinnedFish(board, pencils, 4, true, true);
      const r2 = techniques._findFinnedFish(board, pencils, 4, false, true);
      return [...r1, ...r2];
    }
  },

  _findFinnedFish: (board, pencils, fishSize, isRowBased, findAll = false) => {
    const results = []; // Add this
    for (let num = 1; num <= 9; num++) {
      // Step 1: Find all lines that could be part of the pattern
      const potentialLines = [];
      for (let i = 0; i < 9; i++) {
        const candidateLocs = [];
        for (let j = 0; j < 9; j++) {
          const r = isRowBased ? i : j;
          const c = isRowBased ? j : i;
          if (pencils[r][c].has(num)) {
            candidateLocs.push(j);
          }
        }
        // A finned fish pattern requires lines with more than 1 candidate
        // We allow up to fishSize + 1/2 fins for this initial search
        if (candidateLocs.length >= 1 && candidateLocs.length <= fishSize + 2) {
          potentialLines.push({ line: i, locs: candidateLocs });
        }
      }

      if (potentialLines.length < fishSize) continue;

      // Step 2: Generate combinations of 'fishSize' base lines
      for (const baseLines of techniques.combinations(
        potentialLines,
        fishSize,
      )) {
        const allCoverIndicesSet = new Set();
        baseLines.forEach((line) =>
          line.locs.forEach((loc) => allCoverIndicesSet.add(loc)),
        );

        // Finned fish have fishSize + 1 or +2 cover locations (with fins in the same box)
        if (
          allCoverIndicesSet.size < fishSize + 1 ||
          allCoverIndicesSet.size > fishSize + 2
        ) {
          continue;
        }

        const allCoverIndices = [...allCoverIndicesSet];

        // Step 3: Iterate through all possible sets of 'fishSize' cover lines to be the "base"
        for (const coverBaseIndices of techniques.combinations(
          allCoverIndices,
          fishSize,
        )) {
          const coverBaseSet = new Set(coverBaseIndices);

          // Step 4: Identify fins (candidates in base lines but not in cover lines)
          const fins = [];
          for (const line of baseLines) {
            for (const loc of line.locs) {
              if (!coverBaseSet.has(loc)) {
                const r = isRowBased ? line.line : loc;
                const c = isRowBased ? loc : line.line;
                fins.push([r, c]);
              }
            }
          }

          if (fins.empty) continue;

          // Step 5: Check if all fins are in the same box
          const finBoxes = new Set(
            fins.map(([r, c]) => techniques._getBoxIndex(r, c)),
          );
          if (finBoxes.size !== 1) continue;

          // Step 6: Apply eliminations
          const finBoxIndex = finBoxes.values().next().value;
          const boxCells = techniques._getUnitCells("box", finBoxIndex);
          const removals = [];
          const baseLineIndices = new Set(baseLines.map((line) => line.line));
          const finSet = new Set(fins.map(JSON.stringify));

          for (const [r_target, c_target] of boxCells) {
            const base_idx = isRowBased ? r_target : c_target;
            const cover_idx = isRowBased ? c_target : r_target;

            // Elimination conditions:
            // 1. Must be in a cover line.
            // 2. Must NOT be in a base line.
            // 3. Must NOT be a fin itself.
            if (
              coverBaseSet.has(cover_idx) &&
              !baseLineIndices.has(base_idx) &&
              !finSet.has(JSON.stringify([r_target, c_target]))
            ) {
              if (pencils[r_target][c_target].has(num)) {
                removals.push({ r: r_target, c: c_target, num });
              }
            }
          }

          if (removals.length > 0) {
            // --- Format the Strings for the Hint ---
            const basePrefix = isRowBased ? "r" : "c";
            const coverPrefix = isRowBased ? "c" : "r";

            const baseNums = [...baseLineIndices]
              .map((i) => i + 1)
              .sort((a, b) => a - b)
              .join("");
            const coverNums = [...coverBaseSet]
              .map((i) => i + 1)
              .sort((a, b) => a - b)
              .join("");

            const baseStr = `${basePrefix}${baseNums}`;
            const coverStr = `${coverPrefix}${coverNums}`;

            // --- Format Fins using Box-Point (bp) Notation ---
            const finPoints = [
              ...new Set(
                fins.map(
                  ([r, c]) => Math.floor(r % 3) * 3 + Math.floor(c % 3) + 1,
                ),
              ),
            ]
              .sort((a, b) => a - b)
              .join("");
            const finStr = `b${finBoxIndex + 1}p${finPoints}`;

            const resultObj = {
              change: true,
              type: "remove",
              cells: removals,
              hint: {
                name: `${t("teks_finned")} ${
                  fishSize === 2
                    ? t("teks_msg_47")
                    : fishSize === 3
                      ? t("teks_msg_47_1")
                      : t("teks_msg_47_2")
                }`,
                mainInfo: t("teks_msg_48", num),
                detail: t("teks_msg_49", num, baseStr, coverStr, finStr),
              },
              applyVisuals: () => {
                highlightedDigit = num;
                highlightState = 1;
                baseLineIndices.forEach((primIdx) => {
                  for (let p = 0; p < 9; p++) {
                    const [cr, cc] = isRowBased ? [primIdx, p] : [p, primIdx];
                    window.addCellColor(cr, cc, cellColorPalette[6]); // Base 7

                    // FIX: Use boardState.pencils instead of local pencils
                    if (boardState[cr][cc].pencils.has(num)) {
                      boardState[cr][cc].pencilColors.set(
                        num,
                        candidateColorPalette[6],
                      ); // Candidate Color 7
                    }
                  }
                });
                coverBaseSet.forEach((secIdx) => {
                  for (let p = 0; p < 9; p++) {
                    const [cr, cc] = isRowBased ? [p, secIdx] : [secIdx, p];
                    window.addCellColor(cr, cc, cellColorPalette[7]); // Cover 8
                  }
                });
                fins.forEach(([fr, fc]) =>
                  window.addCellColor(fr, fc, cellColorPalette[5]),
                );
                removals.forEach((el) =>
                  boardState[el.r][el.c].candSlashes.set(
                    el.num,
                    markColorPalette[0],
                  ),
                ); // Color 1
              },
            };
            if (!findAll) return resultObj;
            results.push(resultObj);
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  xyWing: (board, pencils, findAll = false) => {
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          bivalueCells.push({ r, c, cands: [...pencils[r][c]].sort() });
        }
      }
    }

    if (bivalueCells.length < 3) return { change: false };
    const results = [];
    for (const pivot of bivalueCells) {
      const [x, y] = pivot.cands;
      const pincer1Candidates = bivalueCells.filter(
        (cell) =>
          (cell.r !== pivot.r || cell.c !== pivot.c) &&
          techniques._sees([cell.r, cell.c], [pivot.r, pivot.c]) &&
          cell.cands.includes(x) &&
          !cell.cands.includes(y),
      );
      const pincer2Candidates = bivalueCells.filter(
        (cell) =>
          (cell.r !== pivot.r || cell.c !== pivot.c) &&
          techniques._sees([cell.r, cell.c], [pivot.r, pivot.c]) &&
          cell.cands.includes(y) &&
          !cell.cands.includes(x),
      );

      for (const pincer1 of pincer1Candidates) {
        const z = pincer1.cands.find((c) => c !== x);
        if (z === undefined) continue;
        for (const pincer2 of pincer2Candidates) {
          if (
            pincer2.cands.includes(z) &&
            !techniques._sees([pincer1.r, pincer1.c], [pincer2.r, pincer2.c])
          ) {
            const removals = [];
            const commonSeers = techniques._commonVisibleCells(
              [pincer1.r, pincer1.c],
              [pincer2.r, pincer2.c],
            );
            for (const [r, c] of commonSeers) {
              if (pencils[r][c].has(z) && !(r === pivot.r && c === pivot.c)) {
                removals.push({ r, c, num: z });
              }
            }
            if (removals.length > 0) {
              const allCands = [x, y, z].sort().join("");

              const res = {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: t("teks_msg_50"),
                  mainInfo: t("teks_msg_51", pivot.r + 1, pivot.c + 1),
                  detail: t(
                    "teks_msg_52",
                    allCands,
                    pivot.r + 1,
                    pivot.c + 1,
                    pincer1.r + 1,
                    pincer1.c + 1,
                    pincer2.r + 1,
                    pincer2.c + 1,
                  ),
                },
                applyVisuals: () => {
                  highlightedDigit = null;
                  highlightState = 2;

                  // Color the cells
                  boardState[pivot.r][pivot.c].cellColor = cellColorPalette[6]; // Cell Color 7
                  boardState[pincer1.r][pincer1.c].cellColor =
                    cellColorPalette[7]; // Cell Color 8
                  boardState[pincer2.r][pincer2.c].cellColor =
                    cellColorPalette[7]; // Cell Color 8

                  // Elimination candidate (z) in wings -> Candidate Color 8
                  boardState[pincer1.r][pincer1.c].pencilColors.set(
                    z,
                    candidateColorPalette[7],
                  );
                  boardState[pincer2.r][pincer2.c].pencilColors.set(
                    z,
                    candidateColorPalette[7],
                  );

                  // First other digit (x) -> Candidate Color 5
                  boardState[pivot.r][pivot.c].pencilColors.set(
                    x,
                    candidateColorPalette[4],
                  );
                  boardState[pincer1.r][pincer1.c].pencilColors.set(
                    x,
                    candidateColorPalette[4],
                  );

                  // Second other digit (y) -> Candidate Color 6
                  boardState[pivot.r][pivot.c].pencilColors.set(
                    y,
                    candidateColorPalette[5],
                  );
                  boardState[pincer2.r][pincer2.c].pencilColors.set(
                    y,
                    candidateColorPalette[5],
                  );

                  removals.forEach((el) =>
                    boardState[el.r][el.c].candSlashes.set(
                      el.num,
                      markColorPalette[0],
                    ),
                  );
                },
              };
              if (!findAll) return res;
              results.push(res);
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  xyzWing: (board, pencils, findAll = false) => {
    let results = [];

    const trivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 3) {
          trivalueCells.push({ r, c, cands: new Set(pencils[r][c]) });
        }
      }
    }
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          bivalueCells.push({ r, c, cands: new Set(pencils[r][c]) });
        }
      }
    }

    for (const pivot of trivalueCells) {
      const wings = bivalueCells.filter(
        (cell) =>
          techniques._sees([cell.r, cell.c], [pivot.r, pivot.c]) &&
          [...cell.cands].every((cand) => pivot.cands.has(cand)),
      );
      if (wings.length < 2) continue;

      for (const wingCombo of techniques.combinations(wings, 2)) {
        const [wing1, wing2] = wingCombo;

        if (techniques._sees([wing1.r, wing1.c], [wing2.r, wing2.c])) {
          continue;
        }

        const intersection = new Set(
          [...wing1.cands].filter((c) => wing2.cands.has(c)),
        );
        if (intersection.size === 1) {
          const z = intersection.values().next().value;
          const removals = [];
          for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
              if (
                (r === pivot.r && c === pivot.c) ||
                (r === wing1.r && c === wing1.c) ||
                (r === wing2.r && c === wing2.c)
              ) {
                continue;
              }

              if (
                pencils[r][c].has(z) &&
                techniques._sees([r, c], [pivot.r, pivot.c]) &&
                techniques._sees([r, c], [wing1.r, wing1.c]) &&
                techniques._sees([r, c], [wing2.r, wing2.c])
              ) {
                removals.push({ r, c, num: z });
              }
            }
          }
          if (removals.length > 0) {
            const pivotCands = [...pivot.cands].sort().join("");
            const resultObj = {
              change: true,
              type: "remove",
              cells: removals,
              hint: {
                name: t("teks_msg_53"),
                mainInfo: t("teks_msg_51", pivot.r + 1, pivot.c + 1),
                detail: t(
                  "teks_msg_52",
                  pivotCands,
                  pivot.r + 1,
                  pivot.c + 1,
                  wing1.r + 1,
                  wing1.c + 1,
                  wing2.r + 1,
                  wing2.c + 1,
                ),
              },
              applyVisuals: () => {
                highlightedDigit = null;
                highlightState = 2;

                // Color the cells
                boardState[pivot.r][pivot.c].cellColor = cellColorPalette[6]; // Cell Color 7
                boardState[wing1.r][wing1.c].cellColor = cellColorPalette[7]; // Cell Color 8
                boardState[wing2.r][wing2.c].cellColor = cellColorPalette[7]; // Cell Color 8

                // Find the other two digits distinct from 'z'
                const x = [...wing1.cands].find((c) => c !== z);
                const y = [...wing2.cands].find((c) => c !== z);

                // Elimination candidate (z) in pivot and wings -> Candidate Color 8
                boardState[pivot.r][pivot.c].pencilColors.set(
                  z,
                  candidateColorPalette[7],
                );
                boardState[wing1.r][wing1.c].pencilColors.set(
                  z,
                  candidateColorPalette[7],
                );
                boardState[wing2.r][wing2.c].pencilColors.set(
                  z,
                  candidateColorPalette[7],
                );

                // First other digit (x) -> Candidate Color 5
                if (x !== undefined) {
                  boardState[pivot.r][pivot.c].pencilColors.set(
                    x,
                    candidateColorPalette[4],
                  );
                  boardState[wing1.r][wing1.c].pencilColors.set(
                    x,
                    candidateColorPalette[4],
                  );
                }

                // Second other digit (y) -> Candidate Color 6
                if (y !== undefined) {
                  boardState[pivot.r][pivot.c].pencilColors.set(
                    y,
                    candidateColorPalette[5],
                  );
                  boardState[wing2.r][wing2.c].pencilColors.set(
                    y,
                    candidateColorPalette[5],
                  );
                }

                removals.forEach((el) =>
                  boardState[el.r][el.c].candSlashes.set(
                    el.num,
                    markColorPalette[0],
                  ),
                );
              },
            };
            if (!findAll) return resultObj;
            results.push(resultObj);
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  // --- Unified Helper for W-Wing & Grouped W-Wing ---
  _wWingCore: (board, pencils, isGrouped, findAll = false) => {
    const results = [];
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          bivalueCells.push({ r, c, cands: new Set(pencils[r][c]) });
        }
      }
    }
    if (bivalueCells.length < 2) return findAll ? results : { change: false };

    for (const pair of techniques.combinations(bivalueCells, 2)) {
      const [cell1, cell2] = pair;
      if (cell1.cands.size !== 2 || cell2.cands.size !== 2) continue;

      const cands1 = [...cell1.cands].sort((a, b) => a - b);
      const cands2 = [...cell2.cands].sort((a, b) => a - b);
      if (cands1[0] !== cands2[0] || cands1[1] !== cands2[1]) continue;
      if (techniques._sees([cell1.r, cell1.c], [cell2.r, cell2.c])) continue;

      const [x, y] = cands1;

      // Test both possible linking digits
      for (const linkDigit of [x, y]) {
        const elimDigit = linkDigit === x ? y : x;

        // Check all 27 units for a (grouped) strong link
        for (let u = 0; u < 27; u++) {
          let unitType, unitIndex, unit;
          if (u < 9) {
            unitType = "row";
            unitIndex = u;
          } else if (u < 18) {
            unitType = "col";
            unitIndex = u - 9;
          } else {
            unitType = "box";
            unitIndex = u - 18;
          }
          unit = techniques._getUnitCells(unitType, unitIndex);

          // The linking unit must not contain either of the base cells
          if (
            unit.some(
              ([r, c]) =>
                (r === cell1.r && c === cell1.c) ||
                (r === cell2.r && c === cell2.c),
            )
          ) {
            continue;
          }

          const x_cells_in_unit = unit.filter(([r, c]) =>
            pencils[r][c].has(linkDigit),
          );
          if (x_cells_in_unit.length === 0) continue;

          // If not grouped, we strictly require exactly 2 candidates forming the link
          if (!isGrouped && x_cells_in_unit.length !== 2) continue;
          const group1 = [];
          const group2 = [];
          let isValid = true;

          for (const [r, c] of x_cells_in_unit) {
            const sees1 = techniques._sees([r, c], [cell1.r, cell1.c]);
            const sees2 = techniques._sees([r, c], [cell2.r, cell2.c]);

            if (!isGrouped) {
              // Standard W-Wing: Link cells must see EXACTLY ONE of the wings
              if (sees1 === sees2) {
                isValid = false;
                break;
              }
              if (sees1) group1.push([r, c]);
              if (sees2) group2.push([r, c]);
            } else {
              // Grouped W-Wing: Link cells must see AT LEAST ONE wing
              if (!sees1 && !sees2) {
                isValid = false;
                break;
              }
              if (sees1) group1.push([r, c]);
              if (sees2) group2.push([r, c]);
            }
          }

          // Both groups must be populated with at least one connecting cell
          if (!isValid || group1.length === 0 || group2.length === 0) continue;

          const removals = [];
          const commonPeers = techniques._commonVisibleCells(
            [cell1.r, cell1.c],
            [cell2.r, cell2.c],
          );
          for (const [r, c] of commonPeers) {
            if (pencils[r][c].has(elimDigit)) {
              removals.push({ r, c, num: elimDigit });
            }
          }

          if (removals.length > 0) {
            const formatGroup = (cells, uType, uIdx) => {
              if (uType === "box") {
                const pts = [
                  ...new Set(
                    cells.map(
                      ([r, c]) => Math.floor(r % 3) * 3 + Math.floor(c % 3) + 1,
                    ),
                  ),
                ]
                  .sort((a, b) => a - b)
                  .join("");
                return `b${uIdx + 1}p${pts}`;
              } else {
                const rs = [...new Set(cells.map(([r, c]) => r + 1))]
                  .sort((a, b) => a - b)
                  .join("");
                const cs = [...new Set(cells.map(([r, c]) => c + 1))]
                  .sort((a, b) => a - b)
                  .join("");
                return `r${rs}c${cs}`;
              }
            };

            const linkStr1 = formatGroup(group1, unitType, unitIndex);
            const linkStr2 = formatGroup(group2, unitType, unitIndex);
            const strongLinkDetail = `(${linkDigit})(${linkStr1}=${linkStr2})`;

            const res = {
              change: true,
              type: "remove",
              cells: removals,
              hint: {
                name: isGrouped ? t("teks_msg_56") : t("teks_msg_57"),
                mainInfo: t("teks_msg_58", elimDigit, linkDigit),
                detail: t(
                  "teks_msg_59",
                  elimDigit,
                  linkDigit,
                  cell1.r + 1,
                  cell1.c + 1,
                  cell2.r + 1,
                  cell2.c + 1,
                  unitType.slice(0, 1),
                  unitIndex + 1,
                  strongLinkDetail,
                ),
              },
              applyVisuals: () => {
                highlightedDigit = null;
                highlightState = 2;

                boardState[cell1.r][cell1.c].cellColor = cellColorPalette[6]; // Wing color 7
                boardState[cell2.r][cell2.c].cellColor = cellColorPalette[6]; // Wing color 7

                // Covered digit on wing cells (Candidate Color 6)
                boardState[cell1.r][cell1.c].pencilColors.set(
                  linkDigit,
                  candidateColorPalette[5],
                );
                boardState[cell2.r][cell2.c].pencilColors.set(
                  linkDigit,
                  candidateColorPalette[5],
                );

                // Elimination digit on wing cells (Candidate Color 8)
                boardState[cell1.r][cell1.c].pencilColors.set(
                  elimDigit,
                  candidateColorPalette[7],
                );
                boardState[cell2.r][cell2.c].pencilColors.set(
                  elimDigit,
                  candidateColorPalette[7],
                );

                [...group1, ...group2].forEach(([r, c]) => {
                  boardState[r][c].cellColor = cellColorPalette[7]; // House cell color 8
                  boardState[r][c].pencilColors.set(
                    linkDigit,
                    candidateColorPalette[4],
                  ); // House cand color 5
                });

                removals.forEach((el) =>
                  boardState[el.r][el.c].candSlashes.set(
                    el.num,
                    markColorPalette[0],
                  ),
                );
              },
            };

            if (!findAll) return res;
            results.push(res);
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  wWing: (board, pencils, findAll = false) => {
    return techniques._wWingCore(board, pencils, false, findAll);
  },

  groupedWWing: (board, pencils, findAll = false) => {
    return techniques._wWingCore(board, pencils, true, findAll);
  },

  remotePair: (board, pencils, findAll = false) => {
    const results = [];
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          const cands = [...pencils[r][c]].sort().join("");
          bivalueCells.push({ r, c, cands });
        }
      }
    }

    const pairGroups = new Map();
    for (const cell of bivalueCells) {
      if (!pairGroups.has(cell.cands)) {
        pairGroups.set(cell.cands, []);
      }
      pairGroups.get(cell.cands).push([cell.r, cell.c]);
    }

    for (const [pairStr, cells] of pairGroups.entries()) {
      if (cells.length < 4) continue;
      const pair = pairStr.split("").map(Number);
      const adj = new Map();
      cells.forEach((cell) => adj.set(JSON.stringify(cell), []));

      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          if (techniques._sees(cells[i], cells[j])) {
            adj.get(JSON.stringify(cells[i])).push(cells[j]);
            adj.get(JSON.stringify(cells[j])).push(cells[i]);
          }
        }
      }

      // AFTER
      const seenChains = new Set(); // deduplicate bidirectional chains across all startNodes

      for (const startNode of cells) {
        const queue = [[startNode, [startNode]]]; // [node, path]
        const visitedPaths = new Set();
        visitedPaths.add(JSON.stringify([startNode]));

        while (queue.length > 0) {
          const [current, path] = queue.shift();

          if (path.length >= 4 && path.length % 2 === 0) {
            const end1 = path[0];
            const end2 = path[path.length - 1];
            const commonSeers = techniques._commonVisibleCells(end1, end2);
            const removals = [];

            for (const [r, c] of commonSeers) {
              if (!path.some((p) => p[0] === r && p[1] === c)) {
                if (pencils[r][c].has(pair[0]))
                  removals.push({ r, c, num: pair[0] });
                if (pencils[r][c].has(pair[1]))
                  removals.push({ r, c, num: pair[1] });
              }
            }
            if (removals.length > 0) {
              // Canonicalize: always represent the chain with the lexicographically
              // smaller endpoint first, so A→…→B and B→…→A map to the same key.
              const nodeKey = ([r, c]) => `${r},${c}`;
              const firstKey = nodeKey(path[0]);
              const lastKey = nodeKey(path[path.length - 1]);
              const chainKey =
                firstKey < lastKey
                  ? `${firstKey}|${lastKey}|${path.length}`
                  : `${lastKey}|${firstKey}|${path.length}`;

              if (findAll && seenChains.has(chainKey)) continue; // skip the reverse duplicate
              seenChains.add(chainKey);

              const pathStr = path
                .map(([r, c]) => `r${r + 1}c${c + 1}`)
                .join("-");
              const res = {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: t("teks_msg_60"),
                  mainInfo: t("teks_msg_61", pair[0], pair[1]),
                  detail: t("teks_msg_62", pair[0], pair[1], pathStr),
                },
                applyVisuals: () => {
                  highlightedDigit = null;
                  highlightState = 2;
                  path.forEach((node, idx) => {
                    const r = node[0];
                    const c = node[1];
                    const isEven = idx % 2 === 0;
                    // Alternate Cell Color 7 and 8
                    boardState[r][c].cellColor =
                      cellColorPalette[isEven ? 6 : 7];
                    // Opposite alternate Candidate Color 5 and 6
                    boardState[r][c].pencilColors.set(
                      pair[0],
                      candidateColorPalette[isEven ? 4 : 5],
                    );
                    boardState[r][c].pencilColors.set(
                      pair[1],
                      candidateColorPalette[isEven ? 5 : 4],
                    );
                  });
                  removals.forEach((el) =>
                    boardState[el.r][el.c].candSlashes.set(
                      el.num,
                      markColorPalette[0],
                    ),
                  );
                },
              };
              if (!findAll) return res;
              results.push(res);
            }
          }

          const currentStr = JSON.stringify(current);
          for (const neighbor of adj.get(currentStr)) {
            if (
              !path.some((p) => p[0] === neighbor[0] && p[1] === neighbor[1])
            ) {
              const newPath = [...path, neighbor];
              const newPathStr = JSON.stringify(
                newPath.map((p) => p.join(",")).sort(),
              ); // Path invariant to direction
              if (!visitedPaths.has(newPathStr)) {
                queue.push([neighbor, newPath]);
                visitedPaths.add(newPathStr);
              }
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  skyscraper: (board, pencils, findAll = false) => {
    const skyscraperLogic = (isRowBased) => {
      let results = [];

      for (let num = 1; num <= 9; num++) {
        const strongLinks = [];
        for (let i = 0; i < 9; i++) {
          const candidateLocs = [];
          for (let j = 0; j < 9; j++) {
            const r = isRowBased ? i : j;
            const c = isRowBased ? j : i;
            if (pencils[r][c].has(num)) candidateLocs.push(j);
          }
          if (candidateLocs.length === 2) {
            if (
              Math.floor(candidateLocs[0] / 3) !==
              Math.floor(candidateLocs[1] / 3)
            ) {
              strongLinks.push({ line: i, locs: candidateLocs });
            }
          }
        }
        if (strongLinks.length < 2) continue;

        for (const linkPair of techniques.combinations(strongLinks, 2)) {
          const [link1, link2] = linkPair;

          const sharedLocs = new Set(link1.locs);
          const baseLoc = link2.locs.find((loc) => sharedLocs.has(loc));

          if (baseLoc === undefined) continue;

          const peak1Loc = link1.locs.find((loc) => loc !== baseLoc);
          const peak2Loc = link2.locs.find((loc) => loc !== baseLoc);

          const p1 = isRowBased
            ? [link1.line, peak1Loc]
            : [peak1Loc, link1.line];
          const p2 = isRowBased
            ? [link2.line, peak2Loc]
            : [peak2Loc, link2.line];

          if (peak1Loc === peak2Loc) {
            continue;
          }

          const removals = [];
          for (const [r, c] of techniques._commonVisibleCells(p1, p2)) {
            if (pencils[r][c].has(num)) {
              removals.push({ r, c, num });
            }
          }
          if (removals.length > 0) {
            // --- Format the Chain String ---
            let link1Str = "";
            let link2Str = "";
            if (isRowBased) {
              link1Str = `r${link1.line + 1}c${peak1Loc + 1}=r${link1.line + 1}c${baseLoc + 1}`;
              link2Str = `r${link2.line + 1}c${baseLoc + 1}=r${link2.line + 1}c${peak2Loc + 1}`;
            } else {
              link1Str = `r${peak1Loc + 1}c${link1.line + 1}=r${baseLoc + 1}c${link1.line + 1}`;
              link2Str = `r${baseLoc + 1}c${link2.line + 1}=r${peak2Loc + 1}c${link2.line + 1}`;
            }

            // Reconstruct the two base coordinate nodes for the visual representation
            const base1 = isRowBased
              ? [link1.line, baseLoc]
              : [baseLoc, link1.line];
            const base2 = isRowBased
              ? [link2.line, baseLoc]
              : [baseLoc, link2.line];

            const resultObj = {
              change: true,
              type: "remove",
              cells: removals,
              hint: {
                name: t("teks_msg_63"),
                mainInfo: t("teks_msg_48", num),
                detail: `(${num})(${link1Str})-(${link2Str})`,
              },
              applyVisuals: () => {
                highlightedDigit = num;
                highlightState = 1;

                const visualNodes = [
                  { cells: [p1] },
                  { cells: [base1] },
                  { cells: [base2] },
                  { cells: [p2] },
                ];

                visualNodes.forEach((node, idx) => {
                  node.cells.forEach(([cr, cc]) => {
                    const colorIdx = idx % 2 === 0 ? 5 : 4;
                    boardState[cr][cc].pencilColors.set(
                      num,
                      candidateColorPalette[colorIdx],
                    );
                  });
                });
                removals.forEach((el) =>
                  boardState[el.r][el.c].candSlashes.set(
                    el.num,
                    markColorPalette[0],
                  ),
                );

                for (let i = 0; i < visualNodes.length - 1; i++) {
                  const u = visualNodes[i].cells[0];
                  const v = visualNodes[i + 1].cells[0];
                  drawnLines.push({
                    r1: u[0],
                    c1: u[1],
                    n1: num,
                    r2: v[0],
                    c2: v[1],
                    n2: num,
                    color: lineColorPalette[0],
                    style: i % 2 === 0 ? "solid" : "dash",
                  });
                }
              },
            };
            if (!findAll) return { change: true, res: resultObj }; // Note the wrapper
            results.push(resultObj);
          }
        }
      }
      return findAll ? results : { change: false };
    };

    // 5. Update the execution block
    if (!findAll) {
      let result = skyscraperLogic(true);
      if (result.change) return result.res;
      result = skyscraperLogic(false);
      return result.change ? result.res : { change: false };
    } else {
      const r1 = skyscraperLogic(true);
      const r2 = skyscraperLogic(false);
      return [...r1, ...r2]; // FIXED: Returns the array directly
    }
  },

  twoStringKite: (board, pencils, findAll = false) => {
    let results = [];
    for (let num = 1; num <= 9; num++) {
      const rowLinks = [];
      for (let r = 0; r < 9; r++) {
        const locs = [];
        for (let c = 0; c < 9; c++) if (pencils[r][c].has(num)) locs.push(c);
        if (locs.length === 2) rowLinks.push({ r, locs });
      }
      const colLinks = [];
      for (let c = 0; c < 9; c++) {
        const locs = [];
        for (let r = 0; r < 9; r++) if (pencils[r][c].has(num)) locs.push(r);
        if (locs.length === 2) colLinks.push({ c, locs });
      }
      if (rowLinks.length === 0 || colLinks.length === 0) continue;

      for (const rLink of rowLinks) {
        for (const cLink of colLinks) {
          const r_base = rLink.r;
          const [c1, c2] = rLink.locs;
          const c_base = cLink.c;
          const [rA, rB] = cLink.locs;

          if (
            r_base === rA ||
            r_base === rB ||
            c_base === c1 ||
            c_base === c2
          ) {
            continue;
          }

          const rowLinkCells = [
            [rLink.r, rLink.locs[0]],
            [rLink.r, rLink.locs[1]],
          ];
          const colLinkCells = [
            [cLink.locs[0], cLink.c],
            [cLink.locs[1], cLink.c],
          ];

          for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
              if (
                techniques._getBoxIndex(
                  rowLinkCells[i][0],
                  rowLinkCells[i][1],
                ) ===
                techniques._getBoxIndex(colLinkCells[j][0], colLinkCells[j][1])
              ) {
                const p1 = rowLinkCells[1 - i]; // Outside row cell
                const p2 = colLinkCells[1 - j]; // Outside col cell
                const pBox1 = rowLinkCells[i]; // Box intersection cell 1
                const pBox2 = colLinkCells[j]; // Box intersection cell 2

                if (p1[0] === p2[0] && p1[1] === p2[1]) continue;

                const removals = [];
                for (const [r, c] of techniques._commonVisibleCells(p1, p2)) {
                  if (pencils[r][c].has(num)) {
                    removals.push({ r, c, num });
                  }
                }
                if (removals.length > 0) {
                  // --- Format the Chain String ---
                  const link1Str = `r${p1[0] + 1}c${p1[1] + 1}=r${pBox1[0] + 1}c${pBox1[1] + 1}`;
                  const link2Str = `r${pBox2[0] + 1}c${pBox2[1] + 1}=r${p2[0] + 1}c${p2[1] + 1}`;

                  const resultObj = {
                    change: true,
                    type: "remove",
                    cells: removals,
                    hint: {
                      name: t("teks_msg_65"),
                      mainInfo: t("teks_msg_48", num),
                      detail: `(${num})(${link1Str})-(${link2Str})`,
                    },
                    applyVisuals: () => {
                      highlightedDigit = num;
                      highlightState = 1;
                      const visualNodes = [
                        { cells: [p1] },
                        { cells: [pBox1] },
                        { cells: [pBox2] },
                        { cells: [p2] },
                      ];

                      visualNodes.forEach((node, idx) => {
                        node.cells.forEach(([cr, cc]) => {
                          const colorIdx = idx % 2 === 0 ? 5 : 4;
                          boardState[cr][cc].pencilColors.set(
                            num,
                            candidateColorPalette[colorIdx],
                          );
                        });
                      });
                      removals.forEach((el) =>
                        boardState[el.r][el.c].candSlashes.set(
                          el.num,
                          markColorPalette[0],
                        ),
                      );

                      for (let i = 0; i < visualNodes.length - 1; i++) {
                        const u = visualNodes[i].cells[0];
                        const v = visualNodes[i + 1].cells[0];
                        drawnLines.push({
                          r1: u[0],
                          c1: u[1],
                          n1: num,
                          r2: v[0],
                          c2: v[1],
                          n2: num,
                          color: lineColorPalette[0],
                          style: i % 2 === 0 ? "solid" : "dash",
                        });
                      }
                    },
                  };
                  if (!findAll) return resultObj; // Note the wrapper
                  results.push(resultObj);
                }
              }
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  crane: (board, pencils, findAll = false) => {
    const turbotLogic = (isRowBased) => {
      let results = [];
      for (let num = 1; num <= 9; num++) {
        for (let b = 0; b < 9; b++) {
          const boxCells = techniques._getUnitCells("box", b);
          const boxLocs = boxCells.filter(([r, c]) => pencils[r][c].has(num));

          if (boxLocs.length === 2) {
            const [pA_init, pB_init] = boxLocs;
            if (pA_init[0] === pB_init[0] || pA_init[1] === pB_init[1])
              continue;

            for (const startNode of [pA_init, pB_init]) {
              const pA = startNode === pA_init ? pB_init : pA_init;
              const pB = startNode;

              const weakLinkLine = isRowBased
                ? techniques._getUnitCells("col", pB[1])
                : techniques._getUnitCells("row", pB[0]);
              for (const pC of weakLinkLine) {
                if (
                  !pencils[pC[0]][pC[1]].has(num) ||
                  techniques._getBoxIndex(pC[0], pC[1]) === b
                )
                  continue;

                const strongLinkLine = isRowBased
                  ? techniques._getUnitCells("row", pC[0])
                  : techniques._getUnitCells("col", pC[1]);
                const strongLinkLocs = strongLinkLine.filter(([r, c]) =>
                  pencils[r][c].has(num),
                );

                if (strongLinkLocs.length === 2) {
                  const pD = strongLinkLocs.find(
                    (cell) => cell[0] !== pC[0] || cell[1] !== pC[1],
                  );
                  if (!pD) continue;

                  const removals = [];
                  for (const [r, c] of techniques._commonVisibleCells(pA, pD)) {
                    if (
                      pencils[r][c].has(num) &&
                      !(r === pA[0] && c === pA[1]) &&
                      !(r === pD[0] && c === pD[1])
                    ) {
                      removals.push({ r, c, num });
                    }
                  }
                  if (removals.length > 0) {
                    // --- Format the Chain String (Mix of bp and rc) ---
                    const p1BoxIndex =
                      Math.floor(pA[0] % 3) * 3 + Math.floor(pA[1] % 3) + 1;
                    const p2BoxIndex =
                      Math.floor(pB[0] % 3) * 3 + Math.floor(pB[1] % 3) + 1;
                    const link1Str = `b${b + 1}p${p1BoxIndex}=b${b + 1}p${p2BoxIndex}`;
                    const link2Str = `r${pC[0] + 1}c${pC[1] + 1}=r${pD[0] + 1}c${pD[1] + 1}`;

                    const resultObj = {
                      change: true,
                      type: "remove",
                      cells: removals,
                      hint: {
                        name: t("teks_msg_67"),
                        mainInfo: t("teks_msg_48", num),
                        detail: `(${num})(${link1Str})-(${link2Str})`,
                      },
                      applyVisuals: () => {
                        highlightedDigit = num;
                        highlightState = 1;
                        const visualNodes = [
                          { cells: [pA] },
                          { cells: [pB] },
                          { cells: [pC] },
                          { cells: [pD] },
                        ];

                        visualNodes.forEach((node, idx) => {
                          node.cells.forEach(([cr, cc]) => {
                            const colorIdx = idx % 2 === 0 ? 5 : 4;
                            boardState[cr][cc].pencilColors.set(
                              num,
                              candidateColorPalette[colorIdx],
                            );
                          });
                        });
                        removals.forEach((el) =>
                          boardState[el.r][el.c].candSlashes.set(
                            el.num,
                            markColorPalette[0],
                          ),
                        );

                        for (let i = 0; i < visualNodes.length - 1; i++) {
                          const u = visualNodes[i].cells[0];
                          const v = visualNodes[i + 1].cells[0];
                          drawnLines.push({
                            r1: u[0],
                            c1: u[1],
                            n1: num,
                            r2: v[0],
                            c2: v[1],
                            n2: num,
                            color: lineColorPalette[0],
                            style: i % 2 === 0 ? "solid" : "dash",
                          });
                        }
                      },
                    };
                    if (!findAll) return { change: true, res: resultObj }; // Note the wrapper
                    results.push(resultObj);
                  }
                }
              }
            }
          }
        }
      }
      return findAll ? results : { change: false };
    };

    // 5. Update the execution block
    if (!findAll) {
      let result = turbotLogic(true);
      if (result.change) return result.res;
      result = turbotLogic(false);
      return result.change ? result.res : { change: false };
    } else {
      const r1 = turbotLogic(true);
      const r2 = turbotLogic(false);
      return [...r1, ...r2]; // FIXED: Returns the array directly
    }
  },

  groupedKite: (board, pencils, findAll = false) => {
    let results = [];
    for (let num = 1; num <= 9; num++) {
      for (let b = 0; b < 9; b++) {
        const boxCells = techniques._getUnitCells("box", b);
        const box_n_cells = boxCells.filter(([r, c]) => pencils[r][c].has(num));
        const box_rows = new Set(box_n_cells.map((c) => c[0]));
        const box_cols = new Set(box_n_cells.map((c) => c[1]));

        for (const r1 of box_rows) {
          const r1_outside_locs = [];
          for (let c = 0; c < 9; c++) {
            if (Math.floor(c / 3) !== b % 3 && pencils[r1][c].has(num))
              r1_outside_locs.push(c);
          }
          if (r1_outside_locs.length !== 1) continue;
          const c2 = r1_outside_locs[0];

          for (const c1 of box_cols) {
            if (pencils[r1][c1].has(num)) continue;

            const c1_outside_locs = [];
            for (let r = 0; r < 9; r++) {
              if (
                Math.floor(r / 3) !== Math.floor(b / 3) &&
                pencils[r][c1].has(num)
              )
                c1_outside_locs.push(r);
            }
            if (c1_outside_locs.length !== 1) continue;
            const r2 = c1_outside_locs[0];

            // Check group condition
            const group = box_n_cells.filter(([r, c]) => r === r1 || c === c1);

            if (pencils[r2][c2].has(num)) {
              // --- Build Grouped bXpY logic ---
              const rowGroupCols = [
                ...new Set(
                  box_n_cells
                    .filter(([r, c]) => r === r1)
                    .map(([r, c]) => c + 1),
                ),
              ]
                .sort((a, b) => a - b)
                .join("");
              const colGroupRows = [
                ...new Set(
                  box_n_cells
                    .filter(([r, c]) => c === c1)
                    .map(([r, c]) => r + 1),
                ),
              ]
                .sort((a, b) => a - b)
                .join("");

              const link1Str = `r${r1 + 1}c${c2 + 1}=r${r1 + 1}c${rowGroupCols}`;
              const link2Str = `r${colGroupRows}c${c1 + 1}=r${r2 + 1}c${c1 + 1}`;

              const resultObj = {
                change: true,
                type: "remove",
                cells: [{ r: r2, c: c2, num }],
                hint: {
                  name: t("teks_msg_69"),
                  mainInfo: t("teks_msg_48", num),
                  detail: `(${num})(${link1Str})-(${link2Str})`,
                },
                applyVisuals: () => {
                  highlightedDigit = num;
                  highlightState = 1;

                  const group1 = box_n_cells.filter(([r, c]) => r === r1);
                  const group2 = box_n_cells.filter(([r, c]) => c === c1);
                  const visualNodes = [
                    { cells: [[r1, c2]] },
                    { cells: group1 },
                    { cells: group2 },
                    { cells: [[r2, c1]] },
                  ];

                  visualNodes.forEach((node, idx) => {
                    node.cells.forEach(([cr, cc]) => {
                      const colorIdx = idx % 2 === 0 ? 5 : 4;
                      boardState[cr][cc].pencilColors.set(
                        num,
                        candidateColorPalette[colorIdx],
                      );
                    });
                  });
                  boardState[r2][c2].candSlashes.set(num, markColorPalette[0]); // Removal

                  const drawGroup = (node, idx) => {
                    if (node.cells.length > 1) {
                      const colorIdx = idx % 2 === 0 ? 5 : 4; // Dynamically match candidate color
                      for (let i = 0; i < node.cells.length - 1; i++) {
                        drawnLines.push({
                          r1: node.cells[i][0],
                          c1: node.cells[i][1],
                          n1: num,
                          r2: node.cells[i + 1][0],
                          c2: node.cells[i + 1][1],
                          n2: num,
                          color: lineColorPalette[colorIdx],
                          style: "solid",
                        });
                      }
                    }
                  };
                  const getClosestCells = (nodeA, nodeB) => {
                    let minD = Infinity;
                    let bestA = nodeA.cells[0];
                    let bestB = nodeB.cells[0];
                    for (const a of nodeA.cells)
                      for (const b of nodeB.cells) {
                        const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
                        if (d < minD) {
                          minD = d;
                          bestA = a;
                          bestB = b;
                        }
                      }
                    return [bestA, bestB];
                  };
                  for (let i = 0; i < visualNodes.length - 1; i++) {
                    const u = visualNodes[i];
                    const v = visualNodes[i + 1];
                    if (i === 0) drawGroup(u, 0);
                    drawGroup(v, i + 1);
                    const [cA, cB] = getClosestCells(u, v);
                    drawnLines.push({
                      r1: cA[0],
                      c1: cA[1],
                      n1: num,
                      r2: cB[0],
                      c2: cB[1],
                      n2: num,
                      color: lineColorPalette[0],
                      style: i % 2 === 0 ? "solid" : "dash",
                    });
                  }
                },
              };
              if (!findAll) return resultObj; // Note the wrapper
              results.push(resultObj);
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  emptyRectangle: (board, pencils, findAll = false) => {
    const logic = (isRowVersion) => {
      let results = [];
      for (let num = 1; num <= 9; num++) {
        for (let b = 0; b < 9; b++) {
          const boxCells = techniques._getUnitCells("box", b);
          const box_n_cells = boxCells.filter(([r, c]) =>
            pencils[r][c].has(num),
          );
          if (box_n_cells.length < 2) continue;

          const rows = new Set(box_n_cells.map((c) => c[0]));
          const cols = new Set(box_n_cells.map((c) => c[1]));

          if (rows.size === 1 || cols.size === 1) continue;

          for (const r1 of rows) {
            for (const c1 of cols) {
              const coversAll = box_n_cells.every(
                ([r, c]) => r === r1 || c === c1,
              );
              if (!coversAll) continue;

              // --- MERGED LOGIC ---
              for (let idx2 = 0; idx2 < 9; idx2++) {
                const unit1 = isRowVersion ? r1 : c1;
                if (Math.floor(idx2 / 3) === Math.floor(unit1 / 3)) continue;

                // Base of the strong link outside the box
                const br = isRowVersion ? idx2 : r1;
                const bc = isRowVersion ? c1 : idx2;
                if (!pencils[br][bc].has(num)) continue;

                // Scan the row (idx2 = r2) or column (idx2 = c2)
                const locs = [];
                for (let i = 0; i < 9; i++) {
                  const tr = isRowVersion ? idx2 : i;
                  const tc = isRowVersion ? i : idx2;
                  if (pencils[tr][tc].has(num))
                    locs.push(isRowVersion ? tc : tr);
                }

                const expectedBaseLoc = isRowVersion ? c1 : r1;
                if (locs.length === 2 && locs.includes(expectedBaseLoc)) {
                  const targetLoc = locs.find((l) => l !== expectedBaseLoc);
                  if (
                    Math.floor(targetLoc / 3) ===
                    Math.floor(expectedBaseLoc / 3)
                  )
                    continue;

                  // Resolve absolute r2, c2 coordinates
                  const r2 = isRowVersion ? idx2 : targetLoc;
                  const c2 = isRowVersion ? targetLoc : idx2;

                  // Resolve absolute elimination cell
                  const elimR = isRowVersion ? r1 : r2;
                  const elimC = isRowVersion ? c2 : c1;

                  if (pencils[elimR][elimC].has(num)) {
                    // --- Build Grouped bXpY logic ---
                    const groupCells = box_n_cells.filter(([r, c]) =>
                      isRowVersion ? r === r1 : c === c1,
                    );
                    const baseCells = box_n_cells.filter(([r, c]) =>
                      isRowVersion ? c === c1 : r === r1,
                    );

                    const pGroup = [
                      ...new Set(
                        groupCells.map(
                          ([r, c]) =>
                            Math.floor(r % 3) * 3 + Math.floor(c % 3) + 1,
                        ),
                      ),
                    ]
                      .sort()
                      .join("");
                    const pBase = [
                      ...new Set(
                        baseCells.map(
                          ([r, c]) =>
                            Math.floor(r % 3) * 3 + Math.floor(c % 3) + 1,
                        ),
                      ),
                    ]
                      .sort()
                      .join("");

                    const link1Str = `b${b + 1}p${pGroup}=b${b + 1}p${pBase}`;
                    const link2Str = isRowVersion
                      ? `r${r2 + 1}c${c1 + 1}=r${r2 + 1}c${c2 + 1}`
                      : `r${r1 + 1}c${c2 + 1}=r${r2 + 1}c${c2 + 1}`;

                    const resultObj = {
                      change: true,
                      type: "remove",
                      cells: [{ r: elimR, c: elimC, num }],
                      hint: {
                        name: t("teks_msg_71"),
                        mainInfo: t("teks_msg_48", num),
                        detail: `(${num})(${link1Str})-(${link2Str})`,
                      },
                      applyVisuals: () => {
                        highlightedDigit = num;
                        highlightState = 1;

                        const visualNodes = [
                          { cells: groupCells },
                          { cells: baseCells },
                          { cells: isRowVersion ? [[r2, c1]] : [[r1, c2]] },
                          { cells: [[r2, c2]] },
                        ];

                        visualNodes.forEach((node, idx) => {
                          node.cells.forEach(([cr, cc]) => {
                            const colorIdx = idx % 2 === 0 ? 5 : 4;
                            boardState[cr][cc].pencilColors.set(
                              num,
                              candidateColorPalette[colorIdx],
                            );
                          });
                        });
                        boardState[elimR][elimC].candSlashes.set(
                          num,
                          markColorPalette[0],
                        ); // Removal

                        const drawGroup = (node, idx) => {
                          if (node.cells.length > 1) {
                            const colorIdx = idx % 2 === 0 ? 5 : 4; // Dynamically match candidate color
                            for (let i = 0; i < node.cells.length - 1; i++) {
                              drawnLines.push({
                                r1: node.cells[i][0],
                                c1: node.cells[i][1],
                                n1: num,
                                r2: node.cells[i + 1][0],
                                c2: node.cells[i + 1][1],
                                n2: num,
                                color: lineColorPalette[colorIdx],
                                style: "solid",
                              });
                            }
                          }
                        };

                        const getClosestCells = (nodeA, nodeB) => {
                          let minD = Infinity;
                          let bestA = nodeA.cells[0];
                          let bestB = nodeB.cells[0];
                          for (const a of nodeA.cells)
                            for (const b of nodeB.cells) {
                              const d =
                                Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
                              if (d < minD) {
                                minD = d;
                                bestA = a;
                                bestB = b;
                              }
                            }
                          return [bestA, bestB];
                        };

                        for (let i = 0; i < visualNodes.length - 1; i++) {
                          const u = visualNodes[i];
                          const v = visualNodes[i + 1];
                          if (i === 0) drawGroup(u, 0);
                          drawGroup(v, i + 1);
                          const [cA, cB] = getClosestCells(u, v);
                          drawnLines.push({
                            r1: cA[0],
                            c1: cA[1],
                            n1: num,
                            r2: cB[0],
                            c2: cB[1],
                            n2: num,
                            color: lineColorPalette[0],
                            style: i % 2 === 0 ? "solid" : "dash",
                          });
                        }
                      },
                    };
                    if (!findAll) return { change: true, res: resultObj }; // Note the wrapper
                    results.push(resultObj);
                  }
                }
              }
            }
          }
        }
      }
      return findAll ? results : { change: false };
    };

    if (!findAll) {
      let result = logic(true);
      if (result.change) return result.res;
      result = logic(false);
      return result.change ? result.res : { change: false };
    } else {
      const r1 = logic(true);
      const r2 = logic(false);
      return [...r1, ...r2]; // FIXED: Returns the array directly
    }
  },

  bugPlusOne: (board, pencils, findAll = false) => {
    const unsolvedCells = [];
    const bivalueCells = [];
    const trivalueCells = [];

    // Step 1 & 2: Categorize all unsolved cells
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          unsolvedCells.push({ r, c });
          const count = pencils[r][c].size;
          if (count === 2) bivalueCells.push({ r, c });
          else if (count === 3) trivalueCells.push({ r, c });
        }
      }
    }

    // Step 3: Check if the board is in a BUG+1 state
    if (
      trivalueCells.length === 1 &&
      bivalueCells.length === unsolvedCells.length - 1
    ) {
      const { r: r_plus1, c: c_plus1 } = trivalueCells[0];
      const cands = [...pencils[r_plus1][c_plus1]];

      // Step 4: Test each of the 3 candidates in the "+1" cell
      for (const num of cands) {
        // Count occurrences of candidate 'num' in the cell's units
        let rowCount = 0;
        for (let c = 0; c < 9; c++) {
          if (board[r_plus1][c] === 0 && pencils[r_plus1][c].has(num))
            rowCount++;
        }

        let colCount = 0;
        for (let r = 0; r < 9; r++) {
          if (board[r][c_plus1] === 0 && pencils[r][c_plus1].has(num))
            colCount++;
        }

        let boxCount = 0;
        const boxRowStart = Math.floor(r_plus1 / 3) * 3;
        const boxColStart = Math.floor(c_plus1 / 3) * 3;
        for (let ro = 0; ro < 3; ro++) {
          for (let co = 0; co < 3; co++) {
            const r = boxRowStart + ro;
            const c = boxColStart + co;
            if (board[r][c] === 0 && pencils[r][c].has(num)) boxCount++;
          }
        }

        if (rowCount % 2 !== 0 && colCount % 2 !== 0 && boxCount % 2 !== 0) {
          // Identify the candidates to remove (everything that isn't 'num')
          const removals = cands
            .filter((n) => n !== num)
            .map((n) => ({
              r: r_plus1,
              c: c_plus1,
              num: n,
            }));

          return {
            change: true,
            type: "remove",
            cells: removals,
            hint: {
              name: t("teks_msg_73"),
              mainInfo: t("teks_msg_74", r_plus1 + 1, c_plus1 + 1),
              detail: t("teks_msg_75", num, r_plus1 + 1, c_plus1 + 1),
            },
            applyVisuals: () => {
              highlightedDigit = null;
              highlightState = 2; // Highlight bivalue cells

              // Color trivalue cell and its target candidate
              boardState[r_plus1][c_plus1].cellColor = cellColorPalette[7]; // Color 8
              boardState[r_plus1][c_plus1].pencilColors.set(
                num,
                candidateColorPalette[3],
              ); // Color 4

              // Removable candidates in color 1
              removals.forEach((el) =>
                boardState[el.r][el.c].candSlashes.set(
                  el.num,
                  markColorPalette[0],
                ),
              );
            },
          };
        }
      }
    }

    return { change: false };
  },

  _findCommonPeers: (cells, rectCells, board, pencils) => {
    // returns array of [r,c] that see every cell in `cells`
    // exclude any cells that are inside rectCells (or equal to any in cells),
    // and only include unsolved cells (board[r][c] === 0)
    const isSame = (a, b) => a[0] === b[0] && a[1] === b[1];
    const inRect = (r, c) =>
      rectCells.some((rc) => rc[0] === r && rc[1] === c) ||
      cells.some((rc) => rc[0] === r && rc[1] === c);
    const peers = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue; // only unsolved
        if (inRect(r, c)) continue;
        let seesAll = true;
        for (const cell of cells) {
          if (!techniques._sees([r, c], cell)) {
            seesAll = false;
            break;
          }
        }
        if (seesAll) peers.push([r, c]);
      }
    }
    return peers;
  },

  uniqueRectangle: (board, pencils, findAll = false) => {
    let results = [];
    const rects = techniques._findHiddenRectangles(pencils);
    if (!rects || rects.length === 0) return { change: false };

    const isExactPair = (r, c, d1, d2) =>
      pencils[r][c].size === 2 &&
      pencils[r][c].has(d1) &&
      pencils[r][c].has(d2);

    const formatRC = (cells) => {
      if (!cells || cells.length === 0) return "";
      const norm = cells.map((c) => [
        c.r !== undefined ? c.r : c[0],
        c.c !== undefined ? c.c : c[1],
      ]);
      if (norm.length === 1) return `r${norm[0][0] + 1}c${norm[0][1] + 1}`;
      if (norm.every((c) => c[0] === norm[0][0])) {
        return `r${norm[0][0] + 1}c${norm
          .map((c) => c[1] + 1)
          .sort((a, b) => a - b)
          .join("")}`;
      }
      if (norm.every((c) => c[1] === norm[0][1])) {
        return `r${norm
          .map((c) => c[0] + 1)
          .sort((a, b) => a - b)
          .join("")}c${norm[0][1] + 1}`;
      }
      return norm.map((c) => `r${c[0] + 1}c${c[1] + 1}`).join(",");
    };

    const formatBP = (cells, boxIdx) => {
      if (!cells || cells.length === 0) return "";
      const norm = cells.map((c) => [
        c.r !== undefined ? c.r : c[0],
        c.c !== undefined ? c.c : c[1],
      ]);
      const points = norm
        .map((c) => (c[0] % 3) * 3 + (c[1] % 3) + 1)
        .sort((a, b) => a - b)
        .join("");
      return `b${boxIdx + 1}p${points}`;
    };

    const getGuardiansStr = (extraCells, d1, d2) => {
      return extraCells
        .map(([r, c]) => {
          const extras = Array.from(pencils[r][c])
            .filter((d) => d !== d1 && d !== d2)
            .sort((a, b) => a - b)
            .join("");
          return `(${extras})r${r + 1}c${c + 1}`;
        })
        .join(",");
    };

    const getBasePosStr = (urCells) => {
      const rows = Array.from(new Set(urCells.map((c) => c[0] + 1)))
        .sort((a, b) => a - b)
        .join("");
      const cols = Array.from(new Set(urCells.map((c) => c[1] + 1)))
        .sort((a, b) => a - b)
        .join("");
      return `r${rows}c${cols}`;
    };

    const getURVisuals = (type, cells, d1, d2, removals, extraData = {}) => {
      return () => {
        highlightState = type === 4 || type === 6 ? 1 : 0;
        highlightedDigit =
          type === 4 || type === 6 ? extraData.restrictedDigit : null;

        cells.forEach(([cr, cc]) => {
          boardState[cr][cc].cellColor = cellColorPalette[7];
          if (boardState[cr][cc].pencils.has(d1))
            boardState[cr][cc].pencilColors.set(d1, candidateColorPalette[7]);
          if (boardState[cr][cc].pencils.has(d2))
            boardState[cr][cc].pencilColors.set(d2, candidateColorPalette[7]);
          boardState[cr][cc].pencils.forEach((cand) => {
            if (cand !== d1 && cand !== d2)
              boardState[cr][cc].pencilColors.set(
                cand,
                candidateColorPalette[3],
              );
          });
        });

        if (type === 3) {
          extraData.subsetCells.forEach(([cr, cc]) => {
            boardState[cr][cc].cellColor = cellColorPalette[6];
            boardState[cr][cc].pencils.forEach((cand) => {
              if (extraData.subsetCands.has(cand))
                boardState[cr][cc].pencilColors.set(
                  cand,
                  candidateColorPalette[4],
                );
            });
          });
        }

        if (type === 4) {
          drawnLines.push({
            r1: extraData.e1[0],
            c1: extraData.e1[1],
            n1: extraData.restrictedDigit,
            r2: extraData.e2[0],
            c2: extraData.e2[1],
            n2: extraData.restrictedDigit,
            color: lineColorPalette[0],
            style: "solid",
          });
        }

        if (type === 6) {
          const u = extraData.restrictedDigit;
          const rows = [...new Set(cells.map((c) => c[0]))];
          const cols = [...new Set(cells.map((c) => c[1]))];
          drawnLines.push({
            r1: rows[0],
            c1: cols[0],
            n1: u,
            r2: rows[0],
            c2: cols[1],
            n2: u,
            color: lineColorPalette[0],
            style: "solid",
          });
          drawnLines.push({
            r1: rows[1],
            c1: cols[0],
            n1: u,
            r2: rows[1],
            c2: cols[1],
            n2: u,
            color: lineColorPalette[0],
            style: "solid",
          });
        }

        removals.forEach((el) =>
          boardState[el.r][el.c].candSlashes.set(el.num, markColorPalette[0]),
        );
      };
    };

    const getURXyWingVisuals = (
      cells,
      d1,
      d2,
      wings,
      pivotDigit,
      extraDigits,
      removals,
    ) => {
      return () => {
        highlightState = 0;
        highlightedDigit = null;

        cells.forEach(([r, c]) => {
          boardState[r][c].cellColor = cellColorPalette[7];
          boardState[r][c].pencils.forEach((digit) => {
            boardState[r][c].pencilColors.set(
              digit,
              digit === d1 || digit === d2
                ? candidateColorPalette[7]
                : digit === extraDigits[1]
                  ? candidateColorPalette[5]
                  : candidateColorPalette[4],
            );
          });
        });

        wings.forEach(([r, c], index) => {
          boardState[r][c].cellColor = cellColorPalette[6];
          boardState[r][c].pencils.forEach((digit) => {
            boardState[r][c].pencilColors.set(
              digit,
              digit === pivotDigit
                ? candidateColorPalette[6]
                : index === 0
                  ? candidateColorPalette[4]
                  : candidateColorPalette[5],
            );
          });
        });

        removals.forEach(({ r, c, num }) => {
          boardState[r][c].candSlashes.set(num, markColorPalette[0]);
        });
      };
    };

    for (const rect of rects) {
      const { cells, digits } = rect;
      const [d1, d2] = digits;

      const basePosStr = getBasePosStr(cells);

      const extraCells = cells.filter(([r, c]) => !isExactPair(r, c, d1, d2));

      // --- Type 1: One extra cell ---
      if (extraCells.length === 1) {
        const [r, c] = extraCells[0];
        const removals = [];
        if (pencils[r][c].has(d1)) removals.push({ r, c, num: d1 });
        if (pencils[r][c].has(d2)) removals.push({ r, c, num: d2 });
        if (removals.length > 0) {
          const resultObj = {
            change: true,
            type: "remove",
            cells: _getUniqueRemovals(removals),
            hint: {
              name: t("teks_msg_76"),
              mainInfo: t("teks_msg_77", d1, d2),
              detail: t(
                "teks_msg_78",
                d1,
                d2,
                basePosStr,
                getGuardiansStr(extraCells, d1, d2),
              ),
            },
            applyVisuals: getURVisuals(
              1,
              cells,
              d1,
              d2,
              _getUniqueRemovals(removals),
            ),
          };
          if (!findAll) return resultObj;
          results.push(resultObj);
          // continue;
        }
      }

      // --- Types 2 & 5: Common guardian digit ---
      // Type 2 requires every guardian of that digit to be in one house.
      // The same common-guardian deduction without that shared house is Type 5.
      if (extraCells.length === 2 || extraCells.length === 3) {
        const extrasMasks = extraCells.map(([r, c]) =>
          Array.from(pencils[r][c]).filter((x) => x !== d1 && x !== d2),
        );
        let allHaveOneExtra = extrasMasks.every((arr) => arr.length === 1);
        if (allHaveOneExtra && extrasMasks.length > 0) {
          const commonExtraDigit = extrasMasks[0][0];
          let allAreSame = extrasMasks.every(
            (arr) => arr[0] === commonExtraDigit,
          );
          if (allAreSame) {
            const [firstR, firstC] = extraCells[0];
            const guardiansShareHouse =
              extraCells.every(([r]) => r === firstR) ||
              extraCells.every(([, c]) => c === firstC) ||
              extraCells.every(
                ([r, c]) =>
                  techniques._getBoxIndex(r, c) ===
                  techniques._getBoxIndex(firstR, firstC),
              );
            const peers = techniques._findCommonPeers(
              extraCells,
              cells,
              board,
              pencils,
            );
            const removals = [];
            for (const [r, c] of peers) {
              if (pencils[r][c].has(commonExtraDigit)) {
                removals.push({ r, c, num: commonExtraDigit });
              }
            }
            if (removals.length > 0) {
              const resultObj = {
                change: true,
                type: "remove",
                cells: _getUniqueRemovals(removals),
                hint: {
                  name: guardiansShareHouse
                    ? t("teks_msg_79")
                    : t("teks_msg_80"),
                  mainInfo: t("teks_msg_77", d1, d2),
                  detail: t(
                    "teks_msg_78",
                    d1,
                    d2,
                    basePosStr,
                    getGuardiansStr(extraCells, d1, d2),
                  ),
                },
                applyVisuals: getURVisuals(
                  guardiansShareHouse ? 2 : 5,
                  cells,
                  d1,
                  d2,
                  _getUniqueRemovals(removals),
                ),
              };

              if (!findAll) return resultObj;
              results.push(resultObj);
              // continue;
            }
          }
        }
      }

      // --- Types 3, 4, 6: Require exactly two extra cells ---
      if (extraCells.length === 2) {
        const [e1, e2] = extraCells;
        const [e1r, e1c] = e1;
        const [e2r, e2c] = e2;

        // --- Type 3: Virtual Naked Subset ---
        const virtualSet = new Set();
        for (const d of pencils[e1r][e1c])
          if (d !== d1 && d !== d2) virtualSet.add(d);
        for (const d of pencils[e2r][e2c])
          if (d !== d1 && d !== d2) virtualSet.add(d);

        if (virtualSet.size > 0) {
          const processUnit = (unitCellsRaw) => {
            const unitCells = unitCellsRaw.filter(
              ([r, c]) =>
                !cells.some((rc) => rc[0] === r && rc[1] === c) &&
                board[r][c] === 0,
            );
            if (unitCells.length < 1) return null;
            for (let k = 1; k < unitCells.length; k++) {
              for (const chosen of techniques.combinations(unitCells, k)) {
                const union = new Set(virtualSet);
                chosen.forEach(([r, c]) =>
                  pencils[r][c].forEach((p) => union.add(p)),
                );
                if (union.size === k + 1) {
                  const chosenSet = new Set(chosen.map(JSON.stringify));
                  const removals = [];
                  for (const [r, c] of unitCells) {
                    if (chosenSet.has(JSON.stringify([r, c]))) continue;
                    for (const d of union) {
                      if (pencils[r][c].has(d)) removals.push({ r, c, num: d });
                    }
                  }
                  if (removals.length > 0)
                    return {
                      removals: _getUniqueRemovals(removals),
                      chosen,
                      union,
                    };
                }
              }
            }
            return null;
          };

          const sharedUnits = [];
          if (e1r === e2r)
            sharedUnits.push({
              type: "row",
              idx: e1r,
              cells: techniques._getUnitCells("row", e1r),
            });
          if (e1c === e2c)
            sharedUnits.push({
              type: "col",
              idx: e1c,
              cells: techniques._getUnitCells("col", e1c),
            });
          if (
            techniques._getBoxIndex(e1r, e1c) ===
            techniques._getBoxIndex(e2r, e2c)
          ) {
            const bIdx = techniques._getBoxIndex(e1r, e1c);
            sharedUnits.push({
              type: "box",
              idx: bIdx,
              cells: techniques._getUnitCells("box", bIdx),
            });
          }

          for (const unit of sharedUnits) {
            const res = processUnit(unit.cells);
            if (res) {
              const subsetStr =
                unit.type === "box"
                  ? formatBP(res.chosen, unit.idx)
                  : formatRC(res.chosen);
              const resultObj = {
                change: true,
                type: "remove",
                cells: res.removals,
                hint: {
                  name: t("teks_msg_83"),
                  mainInfo: t("teks_msg_77", d1, d2),
                  detail: t(
                    "teks_msg_85",
                    d1,
                    d2,
                    basePosStr,
                    getGuardiansStr(extraCells, d1, d2),
                    subsetStr,
                  ),
                },
                applyVisuals: getURVisuals(
                  3,
                  cells,
                  d1,
                  d2,
                  _getUniqueRemovals(res.removals),
                  { subsetCells: res.chosen, subsetCands: res.union },
                ), // Changed union to res.unions
              };
              if (!findAll) return resultObj;
              results.push(resultObj);
              // continue;
            }
          }
        }

        // --- Type 4: Aligned extra cells with a restricted digit ---
        if (e1r === e2r || e1c === e2c) {
          for (const u of [d1, d2]) {
            const v = u === d1 ? d2 : d1;
            let isRestricted = false;
            if (e1r === e2r) {
              let u_found_elsewhere = false;
              for (let c = 0; c < 9; ++c) {
                if (
                  !cells.some((rc) => rc[0] === e1r && rc[1] === c) &&
                  pencils[e1r][c].has(u)
                ) {
                  u_found_elsewhere = true;
                  break;
                }
              }
              if (!u_found_elsewhere) isRestricted = true;
            } else {
              let u_found_elsewhere = false;
              for (let r = 0; r < 9; ++r) {
                if (
                  !cells.some((rc) => rc[0] === r && rc[1] === e1c) &&
                  pencils[r][e1c].has(u)
                ) {
                  u_found_elsewhere = true;
                  break;
                }
              }
              if (!u_found_elsewhere) isRestricted = true;
            }

            if (isRestricted) {
              const removals = [];
              if (pencils[e1r][e1c].has(v))
                removals.push({ r: e1r, c: e1c, num: v });
              if (pencils[e2r][e2c].has(v))
                removals.push({ r: e2r, c: e2c, num: v });
              if (removals.length > 0) {
                const lineStr =
                  e1r === e2r
                    ? t("teks_msg_86", e1r + 1)
                    : t("teks_msg_87", e1c + 1);
                const resultObj = {
                  change: true,
                  type: "remove",
                  cells: _getUniqueRemovals(removals),
                  hint: {
                    name: t("teks_msg_88"),
                    mainInfo: t("teks_msg_77", d1, d2),
                    detail: t(
                      "teks_msg_90",
                      d1,
                      d2,
                      basePosStr,
                      getGuardiansStr(extraCells, d1, d2),
                      u,
                      lineStr,
                    ),
                  },
                  applyVisuals: getURVisuals(
                    4,
                    cells,
                    d1,
                    d2,
                    _getUniqueRemovals(removals),
                    { restrictedDigit: u, e1: [e1r, e1c], e2: [e2r, e2c] },
                  ),
                };
                if (!findAll) return resultObj;
                results.push(resultObj);
                // continue;
              }
            }
          }
        }

        // --- Type 6: Diagonal extra cells with restricted rows ---
        if (e1r !== e2r && e1c !== e2c) {
          for (const u of [d1, d2]) {
            let u_found_in_rows = false;
            for (const row of [cells[0][0], cells[2][0]]) {
              for (let c = 0; c < 9; ++c) {
                if (
                  !cells.some((rc) => rc[0] === row && rc[1] === c) &&
                  pencils[row][c].has(u)
                ) {
                  u_found_in_rows = true;
                  break;
                }
              }
              if (u_found_in_rows) break;
            }

            if (!u_found_in_rows) {
              const removals = [];
              if (pencils[e1r][e1c].has(u))
                removals.push({ r: e1r, c: e1c, num: u });
              if (pencils[e2r][e2c].has(u))
                removals.push({ r: e2r, c: e2c, num: u });
              if (removals.length > 0) {
                const resultObj = {
                  change: true,
                  type: "remove",
                  cells: _getUniqueRemovals(removals),
                  hint: {
                    name: t("teks_msg_91"),
                    mainInfo: t("teks_msg_77", d1, d2),
                    detail: t(
                      "teks_msg_93",
                      d1,
                      d2,
                      basePosStr,
                      getGuardiansStr(extraCells, d1, d2),
                      u,
                    ),
                  },
                  applyVisuals: getURVisuals(
                    6,
                    cells,
                    d1,
                    d2,
                    _getUniqueRemovals(removals),
                    { restrictedDigit: u },
                  ),
                };
                if (!findAll) return resultObj;
                results.push(resultObj);

                // continue;
              }
            }
          }
        }
      }
    }

    const xyWingProofs = techniques._findUniqueRectangleXyWings(
      board,
      pencils,
      rects,
    );
    for (const proof of xyWingProofs) {
      const removals = proof.removals.map(({ r, c, num }) => ({ r, c, num }));
      const resultObj = {
        change: true,
        type: "remove",
        cells: removals,
        hint: {
          name: t("teks_msg_307"),
          mainInfo: t("teks_msg_77", proof.d1, proof.d2),
          detail: t(
            "teks_msg_308",
            proof.d1,
            proof.d2,
            getBasePosStr(proof.cells),
            getGuardiansStr(proof.petals, proof.d1, proof.d2),
            proof.branches[0][0] + 1,
            proof.branches[0][1] + 1,
            proof.branches[1][0] + 1,
            proof.branches[1][1] + 1,
            proof.pivotDigit,
          ),
        },
        applyVisuals: getURXyWingVisuals(
          proof.cells,
          proof.d1,
          proof.d2,
          proof.branches,
          proof.pivotDigit,
          proof.extraDigits,
          removals,
        ),
      };
      if (!findAll) return resultObj;
      results.push(resultObj);
    }

    return findAll ? results : { change: false };
  },

  hiddenRectangle: (board, pencils, findAll = false) => {
    const results = [];
    const rectangles = techniques._findHiddenRectangles(pencils);
    if (rectangles.length === 0) return { change: false };

    const getBasePosStr = (cells) => {
      // Group columns by row
      const rowGroups = {};
      for (const [r, c] of cells) {
        if (!rowGroups[r]) rowGroups[r] = [];
        rowGroups[r].push(c);
      }

      // Sort the rows numerically to keep it organized
      const sortedRows = Object.keys(rowGroups)
        .map(Number)
        .sort((a, b) => a - b);

      // Build the rXcYZ strings
      const parts = sortedRows.map((r) => {
        const colsStr = rowGroups[r]
          .map((c) => c + 1)
          .sort((a, b) => a - b)
          .join("");
        return `r${r + 1}c${colsStr}`;
      });

      return parts.join(",");
    };

    const getGuardiansStr = (extraCells, d1, d2, pencils) => {
      return extraCells
        .map(([r, c]) => {
          const extras = Array.from(pencils[r][c])
            .filter((d) => d !== d1 && d !== d2)
            .sort((a, b) => a - b)
            .join("");
          return `(${extras})r${r + 1}c${c + 1}`;
        })
        .join(",");
    };

    const getBivalueStr = (bivalueCells) => {
      return bivalueCells.map(([r, c]) => `r${r + 1}c${c + 1}`).join(",");
    };

    for (const rect of rectangles) {
      const { cells, digits } = rect;
      const [d1, d2] = digits;

      const extraCells = [];
      const bivalueCells = [];

      for (const [r, c] of cells) {
        const cands = pencils[r][c];
        const hasExtra = [...cands].some((cand) => cand !== d1 && cand !== d2);

        if (hasExtra) {
          extraCells.push([r, c]);
        } else {
          bivalueCells.push([r, c]);
        }
      }

      // Hidden Rectangle elimination is checked ONLY
      // for the 2-extra-cell and 3-extra-cell cases.
      if (extraCells.length !== 2 && extraCells.length !== 3) continue;
      if (bivalueCells.length === 0) continue;

      const removals = [];
      const strongLinks = [];
      const visualLinks = [];
      const visualLinkKeys = new Set();

      const addRemoval = (r, c, num) => {
        if (
          pencils[r][c] &&
          pencils[r][c].has(num) &&
          !removals.some((el) => el.r === r && el.c === c && el.num === num)
        ) {
          removals.push({ r, c, num });
        }
      };

      const addVisualLink = (d, type, idx, p1, p2) => {
        const a = Math.min(p1, p2);
        const b = Math.max(p1, p2);
        const key = `${d}:${type}:${idx}:${a}:${b}`;

        if (visualLinkKeys.has(key)) return;
        visualLinkKeys.add(key);

        if (type === "row") {
          visualLinks.push({
            r1: idx,
            c1: p1,
            n1: d,
            r2: idx,
            c2: p2,
            n2: d,
            color: lineColorPalette[0],
            style: "solid",
          });
        } else {
          visualLinks.push({
            r1: p1,
            c1: idx,
            n1: d,
            r2: p2,
            c2: idx,
            n2: d,
            color: lineColorPalette[0],
            style: "solid",
          });
        }
      };

      for (const [fr, fc] of bivalueCells) {
        // Unique diagonally opposite corner of this rectangle
        const opposite = cells.find(([r, c]) => r !== fr && c !== fc);

        if (!opposite) continue;

        const [or, oc] = opposite;

        // Test each UR digit as the bilocated digit.
        for (const linkDigit of [d1, d2]) {
          const elimDigit = linkDigit === d1 ? d2 : d1;

          // The opposite corner must actually contain the candidate
          // that would be eliminated.
          if (!pencils[or][oc].has(elimDigit)) continue;

          const rowBilocation = techniques._isStrongLink(
            pencils,
            linkDigit,
            "row",
            or,
            fc,
            oc,
          );

          if (!rowBilocation) continue;
          const colBilocation = techniques._isStrongLink(
            pencils,
            linkDigit,
            "col",
            oc,
            fr,
            or,
          );

          if (!colBilocation) continue;

          // That's the entire Hidden Rectangle elimination.
          addRemoval(or, oc, elimDigit);

          strongLinks.push(
            `(${linkDigit})r${or + 1}`,
            `(${linkDigit})c${oc + 1}`,
          );

          // Preserve the existing visual strong-link structure.
          addVisualLink(linkDigit, "row", or, fc, oc);
          addVisualLink(linkDigit, "col", oc, fr, or);
        }
      }

      if (removals.length > 0) {
        const uniqueRemovals = _getUniqueRemovals(removals);

        if (uniqueRemovals.length > 0) {
          const basePosStr = getBasePosStr(cells);
          const guardiansStr = getGuardiansStr(extraCells, d1, d2, pencils);
          const bivalueStr = getBivalueStr(bivalueCells);
          const uniqueLinks = Array.from(new Set(strongLinks)).join(",");

          const resultObj = {
            change: true,
            type: "remove",
            cells: uniqueRemovals,

            // Existing hint structure preserved
            hint: {
              name: t("teks_msg_94"),
              mainInfo: t("teks_msg_77", d1, d2),
              detail: t(
                "teks_msg_96",
                d1,
                d2,
                basePosStr,
                guardiansStr,
                bivalueStr,
                uniqueLinks,
              ),
            },

            // Existing applyVisuals structure preserved
            applyVisuals: () => {
              highlightState = 0;
              highlightedDigit = null;

              cells.forEach(([cr, cc]) => {
                boardState[cr][cc].cellColor = cellColorPalette[7];

                if (boardState[cr][cc].pencils.has(d1)) {
                  boardState[cr][cc].pencilColors.set(
                    d1,
                    candidateColorPalette[7],
                  );
                }

                if (boardState[cr][cc].pencils.has(d2)) {
                  boardState[cr][cc].pencilColors.set(
                    d2,
                    candidateColorPalette[7],
                  );
                }

                boardState[cr][cc].pencils.forEach((cand) => {
                  if (cand !== d1 && cand !== d2) {
                    boardState[cr][cc].pencilColors.set(
                      cand,
                      candidateColorPalette[3],
                    );
                  }
                });
              });

              visualLinks.forEach((link) => drawnLines.push(link));

              uniqueRemovals.forEach((el) =>
                boardState[el.r][el.c].candSlashes.set(
                  el.num,
                  markColorPalette[0],
                ),
              );
            },
          };

          if (!findAll) return resultObj;
          results.push(resultObj);
        }
      }
    }

    return findAll ? results : { change: false };
  },

  _findHiddenRectangles: (pencils) => {
    const rects = [];
    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        for (let r1 = 0; r1 < 8; r1++) {
          for (let r2 = r1 + 1; r2 < 9; r2++) {
            const cols = [];
            for (let c = 0; c < 9; c++) {
              const r1_has = pencils[r1][c].has(d1) || pencils[r1][c].has(d2);
              const r2_has = pencils[r2][c].has(d1) || pencils[r2][c].has(d2);
              if (r1_has && r2_has) {
                cols.push(c);
              }
            }
            if (cols.length < 2) continue;

            for (const colPair of techniques.combinations(cols, 2)) {
              const [c1, c2] = colPair;
              if (
                !(
                  (Math.floor(r1 / 3) === Math.floor(r2 / 3)) !==
                  (Math.floor(c1 / 3) === Math.floor(c2 / 3))
                )
              )
                continue;

              // --- START: REVISED RESTRICTION (PER USER FEEDBACK) ---
              // Check that d1 & d2 are present across the HR cells in each of the four houses.
              const r1_cands = new Set([
                ...pencils[r1][c1],
                ...pencils[r1][c2],
              ]);
              if (!r1_cands.has(d1) || !r1_cands.has(d2)) continue;

              const r2_cands = new Set([
                ...pencils[r2][c1],
                ...pencils[r2][c2],
              ]);
              if (!r2_cands.has(d1) || !r2_cands.has(d2)) continue;

              const c1_cands = new Set([
                ...pencils[r1][c1],
                ...pencils[r2][c1],
              ]);
              if (!c1_cands.has(d1) || !c1_cands.has(d2)) continue;

              const c2_cands = new Set([
                ...pencils[r1][c2],
                ...pencils[r2][c2],
              ]);
              if (!c2_cands.has(d1) || !c2_cands.has(d2)) continue;
              // --- END: REVISED RESTRICTION ---

              const currentCells = [
                [r1, c1],
                [r1, c2],
                [r2, c1],
                [r2, c2],
              ];

              const hasBivalueFloor = currentCells.some(([r, c]) => {
                const cands = pencils[r][c];
                return cands.size === 2 && cands.has(d1) && cands.has(d2);
              });
              if (!hasBivalueFloor) {
                continue;
              }

              rects.push({
                cells: currentCells,
                digits: [d1, d2],
              });
            }
          }
        }
      }
    }
    return rects;
  },

  _findUniqueRectangleXyWings: (board, pencils, rectangles = null) => {
    const rects = rectangles || techniques._findHiddenRectangles(pencils) || [];
    if (rects.length === 0) return [];

    const candidateMasks = new Uint16Array(81);
    const candidateCells = Array(10).fill(0n);
    const bivalueCells = Array.from({ length: 10 }, () => []);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const id = r * 9 + c;
        const mask = BITS.setToMask(pencils[r][c]);
        candidateMasks[id] = mask;
        for (const digit of pencils[r][c]) {
          candidateCells[digit] |= CELL_MASK[id];
          if (pencils[r][c].size === 2) bivalueCells[digit].push(id);
        }
      }
    }

    const crossGroupPairIndex = (first, second) => {
      let index = 0;
      for (let a = 0; a < 9; a++) {
        for (let b = a + 1; b < 9; b++) {
          if (Math.floor(a / 3) === Math.floor(b / 3)) continue;
          if (a === first && b === second) return index;
          index++;
        }
      }
      return -1;
    };

    const withinGroupPairIndex = (first, second) => {
      const a = first % 3;
      const b = second % 3;
      if (a === 0) return b - 1;
      return 2;
    };

    const patternIndex = (cells) => {
      const r1 = cells[0][0];
      const r2 = cells[2][0];
      const c1 = cells[0][1];
      const c2 = cells[1][1];
      if (Math.floor(r1 / 3) === Math.floor(r2 / 3)) {
        return (
          Math.floor(r1 / 3) * 81 +
          withinGroupPairIndex(r1, r2) * 27 +
          crossGroupPairIndex(c1, c2)
        );
      }
      return (
        243 +
        Math.floor(c1 / 3) * 81 +
        withinGroupPairIndex(c1, c2) * 27 +
        crossGroupPairIndex(r1, r2)
      );
    };

    const cornerPairs = [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ];
    const foundByPattern = new Map();

    for (const rect of rects) {
      const index = patternIndex(rect.cells);
      if (foundByPattern.has(index)) continue;

      const ids = rect.cells.map(([r, c]) => r * 9 + c);
      const [d1, d2] = rect.digits;
      const baseMask = (1 << (d1 - 1)) | (1 << (d2 - 1));
      const canMakeDeadlyPattern =
        (Boolean(
          candidateMasks[ids[0]] & candidateMasks[ids[3]] & (1 << (d1 - 1)),
        ) &&
          Boolean(
            candidateMasks[ids[1]] & candidateMasks[ids[2]] & (1 << (d2 - 1)),
          )) ||
        (Boolean(
          candidateMasks[ids[1]] & candidateMasks[ids[2]] & (1 << (d1 - 1)),
        ) &&
          Boolean(
            candidateMasks[ids[0]] & candidateMasks[ids[3]] & (1 << (d2 - 1)),
          ));
      if (!canMakeDeadlyPattern) continue;

      for (const [cornerIndex1, cornerIndex2] of cornerPairs) {
        const cornerMask =
          candidateMasks[ids[cornerIndex1]] | candidateMasks[ids[cornerIndex2]];
        if (cornerMask !== baseMask) continue;

        const petalIndices = [0, 1, 2, 3].filter(
          (value) => value !== cornerIndex1 && value !== cornerIndex2,
        );
        const petalMask1 = candidateMasks[ids[petalIndices[0]]];
        const petalMask2 = candidateMasks[ids[petalIndices[1]]];
        if (
          (petalMask1 & petalMask2 & baseMask) === 0 ||
          ((petalMask1 | petalMask2) & baseMask) !== baseMask
        ) {
          continue;
        }

        const extraMask = (petalMask1 | petalMask2) & ~baseMask;
        if (BITS.popcount(extraMask) !== 2) continue;
        const [extraDigit1, extraDigit2] = BITS.maskToDigits(extraMask);

        const sourceMask1 = ids.reduce(
          (mask, id) =>
            candidateMasks[id] & (1 << (extraDigit1 - 1))
              ? mask | CELL_MASK[id]
              : mask,
          0n,
        );
        const sourceMask2 = ids.reduce(
          (mask, id) =>
            candidateMasks[id] & (1 << (extraDigit2 - 1))
              ? mask | CELL_MASK[id]
              : mask,
          0n,
        );
        const branchGroup1 = bivalueCells[extraDigit1].filter(
          (id) => (sourceMask1 & ~PEER_MAP[id]) === 0n,
        );
        const branchGroup2 = bivalueCells[extraDigit2].filter(
          (id) => (sourceMask2 & ~PEER_MAP[id]) === 0n,
        );

        let proof = null;
        for (const branch1 of branchGroup1) {
          const pivotMask = candidateMasks[branch1] & ~(1 << (extraDigit1 - 1));
          if (BITS.popcount(pivotMask) !== 1) continue;
          const [pivotDigit] = BITS.maskToDigits(pivotMask);
          const requiredBranch2Mask =
            (1 << (extraDigit2 - 1)) | (1 << (pivotDigit - 1));

          for (const branch2 of branchGroup2) {
            if (
              branch1 === branch2 ||
              candidateMasks[branch2] !== requiredBranch2Mask
            ) {
              continue;
            }

            const eliminationMask =
              PEER_MAP[branch1] &
              PEER_MAP[branch2] &
              candidateCells[pivotDigit];
            if (eliminationMask === 0n) continue;

            const removals = [];
            for (let id = 0; id < 81; id++) {
              if ((eliminationMask & CELL_MASK[id]) === 0n) continue;
              removals.push({
                r: Math.floor(id / 9),
                c: id % 9,
                num: pivotDigit,
              });
            }
            proof = {
              patternIndex: index,
              cells: rect.cells.map(([r, c]) => [r, c]),
              d1,
              d2,
              petals: petalIndices.map((value) => [...rect.cells[value]]),
              branches: [
                [Math.floor(branch1 / 9), branch1 % 9],
                [Math.floor(branch2 / 9), branch2 % 9],
              ],
              pivotDigit,
              extraDigits: [extraDigit1, extraDigit2],
              removals,
            };
            break;
          }
          if (proof) break;
        }
        if (proof) {
          foundByPattern.set(index, proof);
          break;
        }
      }
    }

    return [...foundByPattern.values()].sort(
      (left, right) => left.patternIndex - right.patternIndex,
    );
  },

  avoidableRectangle: (board, pencils, findAll = false) => {
    const results = [];
    const seenResults = new Set();
    const hasInitialString =
      typeof initialPuzzleString === "string" &&
      initialPuzzleString.length >= 81;

    const hasGivenGrid =
      typeof boardState !== "undefined" &&
      Array.isArray(boardState) &&
      boardState.length === 9;

    if (!hasInitialString && !hasGivenGrid) {
      return findAll ? [] : { change: false };
    }

    const isInitialGiven = (r, c) => {
      if (hasInitialString) {
        const ch = initialPuzzleString[r * 9 + c];
        return ch >= "1" && ch <= "9";
      }

      return !!(boardState[r] && boardState[r][c] && boardState[r][c].isGiven);
    };

    const isUserFilled = (r, c) => board[r][c] !== 0 && !isInitialGiven(r, c);
    const isUnfilled = (r, c) => board[r][c] === 0 && !isInitialGiven(r, c);
    const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];
    const cellKey = ([r, c]) => `${r},${c}`;
    const formatRC = (cells) => {
      if (!cells || cells.length === 0) return "";

      const norm = cells.map((c) => [
        c.r !== undefined ? c.r : c[0],
        c.c !== undefined ? c.c : c[1],
      ]);

      if (norm.length === 1) {
        return `r${norm[0][0] + 1}c${norm[0][1] + 1}`;
      }

      if (norm.every((c) => c[0] === norm[0][0])) {
        return `r${norm[0][0] + 1}c${norm
          .map((c) => c[1] + 1)
          .sort((a, b) => a - b)
          .join("")}`;
      }

      if (norm.every((c) => c[1] === norm[0][1])) {
        return `r${norm
          .map((c) => c[0] + 1)
          .sort((a, b) => a - b)
          .join("")}c${norm[0][1] + 1}`;
      }

      return norm.map((c) => `r${c[0] + 1}c${c[1] + 1}`).join(",");
    };

    const formatBP = (cells, boxIdx) => {
      if (!cells || cells.length === 0) return "";

      const points = cells
        .map(([r, c]) => (r % 3) * 3 + (c % 3) + 1)
        .sort((a, b) => a - b)
        .join("");

      return `b${boxIdx + 1}p${points}`;
    };

    const getBasePosStr = (cells) => {
      const rows = [...new Set(cells.map(([r]) => r + 1))]
        .sort((a, b) => a - b)
        .join("");

      const cols = [...new Set(cells.map(([, c]) => c + 1))]
        .sort((a, b) => a - b)
        .join("");

      return `r${rows}c${cols}`;
    };

    const getFilledStr = (filledCells) =>
      filledCells
        .map(([r, c]) => `(${board[r][c]})r${r + 1}c${c + 1}`)
        .join(",");

    const getUnfilledStr = (rectCells) =>
      rectCells
        .filter(([r, c]) => board[r][c] === 0)
        .map(([r, c]) => {
          const cands = [...pencils[r][c]].sort((a, b) => a - b).join("");
          return `(${cands})r${r + 1}c${c + 1}`;
        })
        .join(",");

    const setEquals = (r, c, digits) => {
      const want = [...new Set(digits)];

      if (board[r][c] !== 0) return false;
      if (want.length !== digits.length) return false;
      if (pencils[r][c].size !== want.length) return false;
      return want.every((d) => pencils[r][c].has(d));
    };

    const getSameBivaluePair = (a, b) => {
      const [ar, ac] = a;
      const [br, bc] = b;

      if (
        board[ar][ac] !== 0 ||
        board[br][bc] !== 0 ||
        pencils[ar][ac].size !== 2 ||
        pencils[br][bc].size !== 2
      ) {
        return null;
      }
      const p1 = [...pencils[ar][ac]].sort((x, y) => x - y);
      const p2 = [...pencils[br][bc]].sort((x, y) => x - y);
      if (p1[0] === p2[0] && p1[1] === p2[1]) {
        return p1;
      }

      return null;
    };

    const getOppositeCorner = (cells, cell) =>
      cells.find(([r, c]) => r !== cell[0] && c !== cell[1]);

    const getOppositeLineMates = (cells, f1, f2) => {
      if (f1[0] === f2[0]) {
        const otherRowCell = cells.find(([r]) => r !== f1[0]);
        if (!otherRowCell) return null;
        const otherRow = otherRowCell[0];

        return [
          [otherRow, f1[1]],
          [otherRow, f2[1]],
        ];
      }

      if (f1[1] === f2[1]) {
        const otherColCell = cells.find(([, c]) => c !== f1[1]);
        if (!otherColCell) return null;
        const otherCol = otherColCell[1];

        return [
          [f1[0], otherCol],
          [f2[0], otherCol],
        ];
      }

      return null;
    };

    const getSharedUnits = (a, b) => {
      const units = [];

      if (a[0] === b[0]) {
        units.push({
          type: "row",
          idx: a[0],
          cells: techniques._getUnitCells("row", a[0]),
        });
      }

      if (a[1] === b[1]) {
        units.push({
          type: "col",
          idx: a[1],
          cells: techniques._getUnitCells("col", a[1]),
        });
      }
      const boxA = techniques._getBoxIndex(a[0], a[1]);
      const boxB = techniques._getBoxIndex(b[0], b[1]);
      if (boxA === boxB) {
        units.push({
          type: "box",
          idx: boxA,
          cells: techniques._getUnitCells("box", boxA),
        });
      }

      return units;
    };

    const getCommonPeerRemovals = (patternCells, rectCells, digit) => {
      const removals = [];

      const peers = techniques._findCommonPeers(
        patternCells,
        rectCells,
        board,
        pencils,
      );

      for (const [r, c] of peers) {
        if (pencils[r][c].has(digit)) {
          removals.push({
            r,
            c,
            num: digit,
          });
        }
      }

      return _getUniqueRemovals(removals);
    };

    const makeResult = (
      nameKey,
      d1,
      d2,
      rectCells,
      filledCells,
      removals,
      extraData = {},
    ) => {
      const uniqueRemovals = _getUniqueRemovals(removals);
      const basePosStr = getBasePosStr(rectCells);
      const filledStr = getFilledStr(filledCells);
      const unfilledStr = getUnfilledStr(rectCells);
      let detail;

      if (extraData.subsetCells && extraData.subsetCands) {
        const subsetStr =
          extraData.unitType === "box"
            ? formatBP(extraData.subsetCells, extraData.unitIdx)
            : formatRC(extraData.subsetCells);

        detail = t(
          "teks_msg_300",
          d1,
          d2,
          basePosStr,
          filledStr,
          unfilledStr,
          subsetStr,
        );
      } else if (extraData.strongLinks) {
        detail = t(
          "teks_msg_301",
          d1,
          d2,
          basePosStr,
          filledStr,
          unfilledStr,
          extraData.strongLinks.join(","),
        );
      } else {
        detail = t("teks_msg_299", d1, d2, basePosStr, filledStr, unfilledStr);
      }

      return {
        change: true,
        type: "remove",
        cells: uniqueRemovals,

        hint: {
          name: t(nameKey),
          mainInfo: t("teks_msg_298", d1, d2),
          detail,
        },

        applyVisuals: () => {
          highlightState = 0;
          highlightedDigit = null;
          rectCells.forEach(([cr, cc]) => {
            boardState[cr][cc].cellColor = cellColorPalette[7];

            if (boardState[cr][cc].value === 0) {
              boardState[cr][cc].pencils.forEach((cand) => {
                boardState[cr][cc].pencilColors.set(
                  cand,
                  cand === d1 || cand === d2
                    ? candidateColorPalette[7]
                    : candidateColorPalette[3],
                );
              });
            }
          });
          filledCells.forEach(([cr, cc]) => {
            boardState[cr][cc].cellColor = cellColorPalette[6];
          });
          if (extraData.subsetCells && extraData.subsetCands) {
            extraData.subsetCells.forEach(([cr, cc]) => {
              boardState[cr][cc].cellColor = cellColorPalette[6];

              boardState[cr][cc].pencils.forEach((cand) => {
                if (extraData.subsetCands.has(cand)) {
                  boardState[cr][cc].pencilColors.set(
                    cand,
                    candidateColorPalette[4],
                  );
                }
              });
            });
          }
          if (extraData.visualLinks) {
            extraData.visualLinks.forEach((link) => drawnLines.push(link));
          }
          uniqueRemovals.forEach((el) => {
            boardState[el.r][el.c].candSlashes.set(el.num, markColorPalette[0]);
          });
        },
      };
    };
    const addResult = (resultObj, nameKey) => {
      const removalKey = resultObj.cells
        .map((el) => `${el.r},${el.c},${el.num}`)
        .sort()
        .join(";");
      const key = `${nameKey}|${removalKey}`;
      if (seenResults.has(key)) {
        return null;
      }
      seenResults.add(key);
      if (findAll) {
        results.push(resultObj);
        return null;
      }
      return resultObj;
    };
    const processVirtualSubset = (unit, rectCells, virtualCands) => {
      const rectSet = new Set(rectCells.map(cellKey));
      const outsideCells = unit.cells.filter(
        ([r, c]) => board[r][c] === 0 && !rectSet.has(`${r},${c}`),
      );
      if (outsideCells.length < 2) {
        return null;
      }
      for (let k = 1; k < outsideCells.length; k++) {
        for (const chosen of techniques.combinations(outsideCells, k)) {
          const union = new Set(virtualCands);
          chosen.forEach(([r, c]) => {
            pencils[r][c].forEach((cand) => union.add(cand));
          });
          if (union.size !== k + 1) {
            continue;
          }
          const chosenSet = new Set(chosen.map(cellKey));
          const removals = [];
          for (const [r, c] of outsideCells) {
            if (chosenSet.has(`${r},${c}`)) {
              continue;
            }
            for (const d of union) {
              if (pencils[r][c].has(d)) {
                removals.push({
                  r,
                  c,
                  num: d,
                });
              }
            }
          }
          if (removals.length > 0) {
            return {
              removals: _getUniqueRemovals(removals),
              chosen,
              union,
            };
          }
        }
      }

      return null;
    };
    const rectangles = techniques._findAvoidableRectangles();
    for (const rect of rectangles) {
      const cells = rect.cells;
      if (cells.some(([r, c]) => isInitialGiven(r, c))) {
        continue;
      }
      const filledCells = cells.filter(([r, c]) => isUserFilled(r, c));
      const unfilledCells = cells.filter(([r, c]) => isUnfilled(r, c));
      if (filledCells.length === 3 && unfilledCells.length === 1) {
        const target = unfilledCells[0];
        const opposite = getOppositeCorner(cells, target);
        if (opposite) {
          const sideFilled = filledCells.filter(
            (cell) => !sameCell(cell, opposite),
          );
          if (sideFilled.length === 2) {
            const d1 = board[opposite[0]][opposite[1]];
            const d2 = board[sideFilled[0][0]][sideFilled[0][1]];
            if (
              d1 !== 0 &&
              d2 !== 0 &&
              d1 !== d2 &&
              board[sideFilled[1][0]][sideFilled[1][1]] === d2 &&
              pencils[target[0]][target[1]].has(d1)
            ) {
              const resultObj = makeResult(
                "teks_msg_293",
                d1,
                d2,
                cells,
                filledCells,
                [
                  {
                    r: target[0],
                    c: target[1],
                    num: d1,
                  },
                ],
              );
              const immediate = addResult(resultObj, "teks_msg_293");
              if (immediate) {
                return immediate;
              }
            }
          }
        }
      }
      if (filledCells.length === 2 && unfilledCells.length === 2) {
        const f1 = filledCells[0];
        const f2 = filledCells[1];
        const aligned = f1[0] === f2[0] || f1[1] === f2[1];
        if (aligned) {
          const mates = getOppositeLineMates(cells, f1, f2);
          if (mates) {
            const [u1, u2] = mates;
            if (
              unfilledCells.some((c) => sameCell(c, u1)) &&
              unfilledCells.some((c) => sameCell(c, u2))
            ) {
              const d1 = board[f1[0]][f1[1]];
              const d2 = board[f2[0]][f2[1]];
              if (d1 !== 0 && d2 !== 0 && d1 !== d2) {
                if (
                  pencils[u1[0]][u1[1]].size === 2 &&
                  pencils[u2[0]][u2[1]].size === 2 &&
                  pencils[u1[0]][u1[1]].has(d2) &&
                  pencils[u2[0]][u2[1]].has(d1)
                ) {
                  const extra1 = [...pencils[u1[0]][u1[1]]].filter(
                    (d) => d !== d2,
                  );
                  const extra2 = [...pencils[u2[0]][u2[1]]].filter(
                    (d) => d !== d1,
                  );
                  if (
                    extra1.length === 1 &&
                    extra2.length === 1 &&
                    extra1[0] === extra2[0]
                  ) {
                    const g = extra1[0];
                    if (g !== d1 && g !== d2) {
                      const removals = getCommonPeerRemovals(
                        [u1, u2],
                        cells,
                        g,
                      );
                      if (removals.length > 0) {
                        const resultObj = makeResult(
                          "teks_msg_294",
                          d1,
                          d2,
                          cells,
                          filledCells,
                          removals,
                        );
                        const immediate = addResult(resultObj, "teks_msg_294");
                        if (immediate) {
                          return immediate;
                        }
                      }
                    }
                  }
                }
                if (
                  pencils[u1[0]][u1[1]].has(d2) &&
                  pencils[u2[0]][u2[1]].has(d1)
                ) {
                  const extras1 = [...pencils[u1[0]][u1[1]]].filter(
                    (d) => d !== d2,
                  );
                  const extras2 = [...pencils[u2[0]][u2[1]]].filter(
                    (d) => d !== d1,
                  );
                  if (extras1.length > 0 && extras2.length > 0) {
                    const virtualCands = new Set([...extras1, ...extras2]);
                    for (const unit of getSharedUnits(u1, u2)) {
                      const subsetRes = processVirtualSubset(
                        unit,
                        cells,
                        virtualCands,
                      );
                      if (!subsetRes) {
                        continue;
                      }
                      const resultObj = makeResult(
                        "teks_msg_295",
                        d1,
                        d2,
                        cells,
                        filledCells,
                        subsetRes.removals,
                        {
                          subsetCells: subsetRes.chosen,
                          subsetCands: subsetRes.union,
                          unitType: unit.type,
                          unitIdx: unit.idx,
                        },
                      );
                      const immediate = addResult(resultObj, "teks_msg_295");
                      if (immediate) {
                        return immediate;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (filledCells.length === 2 && unfilledCells.length === 2) {
        const f1 = filledCells[0];
        const f2 = filledCells[1];
        const diagonal = f1[0] !== f2[0] && f1[1] !== f2[1];
        if (diagonal && board[f1[0]][f1[1]] === board[f2[0]][f2[1]]) {
          const d1 = board[f1[0]][f1[1]];
          const pair = getSameBivaluePair(unfilledCells[0], unfilledCells[1]);
          if (d1 !== 0 && pair) {
            for (let i = 0; i < 2; i++) {
              const d2 = pair[i];
              const g = pair[1 - i];
              if (d2 === d1 || g === d1 || d2 === g) {
                continue;
              }
              const removals = getCommonPeerRemovals(unfilledCells, cells, g);
              if (removals.length > 0) {
                const resultObj = makeResult(
                  "teks_msg_296",
                  d1,
                  d2,
                  cells,
                  filledCells,
                  removals,
                );

                const immediate = addResult(resultObj, "teks_msg_296");

                if (immediate) {
                  return immediate;
                }
              }
            }
          }
        }
      }
      if (filledCells.length === 1 && unfilledCells.length === 3) {
        const filled = filledCells[0];
        const opposite = getOppositeCorner(cells, filled);
        if (opposite && board[opposite[0]][opposite[1]] === 0) {
          const sideCells = unfilledCells.filter(
            (cell) => !sameCell(cell, opposite),
          );
          if (sideCells.length === 2) {
            const d1 = board[filled[0]][filled[1]];
            const pair = getSameBivaluePair(sideCells[0], sideCells[1]);
            if (d1 !== 0 && pair) {
              for (let i = 0; i < 2; i++) {
                const d2 = pair[i];
                const g = pair[1 - i];
                if (d2 === d1 || g === d1 || d2 === g) {
                  continue;
                }
                let peerBasis = null;
                if (setEquals(opposite[0], opposite[1], [d1, d2])) {
                  peerBasis = sideCells;
                } else if (
                  setEquals(opposite[0], opposite[1], [d1, d2, g]) ||
                  setEquals(opposite[0], opposite[1], [d1, g])
                ) {
                  peerBasis = unfilledCells;
                }
                if (!peerBasis) {
                  continue;
                }
                const removals = getCommonPeerRemovals(peerBasis, cells, g);
                if (removals.length > 0) {
                  const resultObj = makeResult(
                    "teks_msg_296",
                    d1,
                    d2,
                    cells,
                    filledCells,
                    removals,
                  );
                  const immediate = addResult(resultObj, "teks_msg_296");
                  if (immediate) {
                    return immediate;
                  }
                }
              }
            }
          }
        }
      }

      if (filledCells.length === 1 && unfilledCells.length === 3) {
        const filled = filledCells[0];

        const opposite = getOppositeCorner(cells, filled);

        if (opposite && board[opposite[0]][opposite[1]] === 0) {
          const [fr, fc] = filled;
          const [or, oc] = opposite;
          const rowMate = [or, fc];
          const colMate = [fr, oc];

          if (
            board[rowMate[0]][rowMate[1]] === 0 &&
            board[colMate[0]][colMate[1]] === 0
          ) {
            const d1 = board[fr][fc];
            const possibleD2 = [...pencils[rowMate[0]][rowMate[1]]].filter(
              (d) =>
                d !== d1 &&
                pencils[colMate[0]][colMate[1]].has(d) &&
                pencils[or][oc].has(d),
            );
            if (pencils[or][oc].has(d1)) {
              for (const d2 of possibleD2) {
                for (const linkDigit of [d1, d2]) {
                  const elimDigit = linkDigit === d1 ? d2 : d1;

                  if (!pencils[or][oc].has(elimDigit)) {
                    continue;
                  }
                  const rowBilocation = techniques._isStrongLink(
                    pencils,
                    linkDigit,
                    "row",
                    or,
                    fc,
                    oc,
                  );

                  if (!rowBilocation) {
                    continue;
                  }
                  const colBilocation = techniques._isStrongLink(
                    pencils,
                    linkDigit,
                    "col",
                    oc,
                    fr,
                    or,
                  );

                  if (!colBilocation) {
                    continue;
                  }

                  const strongLinks = [
                    `(${linkDigit})r${or + 1}`,
                    `(${linkDigit})c${oc + 1}`,
                  ];

                  const visualLinks = [
                    {
                      r1: or,
                      c1: fc,
                      n1: linkDigit,
                      r2: or,
                      c2: oc,
                      n2: linkDigit,
                      color: lineColorPalette[0],
                      style: "solid",
                    },
                    {
                      r1: fr,
                      c1: oc,
                      n1: linkDigit,
                      r2: or,
                      c2: oc,
                      n2: linkDigit,
                      color: lineColorPalette[0],
                      style: "solid",
                    },
                  ];

                  const resultObj = makeResult(
                    "teks_msg_297",
                    d1,
                    d2,
                    cells,
                    filledCells,
                    [
                      {
                        r: or,
                        c: oc,
                        num: elimDigit,
                      },
                    ],
                    {
                      strongLinks,
                      visualLinks,
                    },
                  );

                  const immediate = addResult(resultObj, "teks_msg_297");

                  if (immediate) {
                    return immediate;
                  }
                }
              }
            }
          }
        }
      }
    }

    return findAll ? results : { change: false };
  },

  _findAvoidableRectangles: () => {
    const rectangles = [];

    for (let r1 = 0; r1 < 8; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        for (let c1 = 0; c1 < 8; c1++) {
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            const rowsSameBand = Math.floor(r1 / 3) === Math.floor(r2 / 3);
            const colsSameStack = Math.floor(c1 / 3) === Math.floor(c2 / 3);
            if (rowsSameBand === colsSameStack) {
              continue;
            }

            rectangles.push({
              cells: [
                [r1, c1],
                [r1, c2],
                [r2, c1],
                [r2, c2],
              ],
            });
          }
        }
      }
    }
    return rectangles;
  },

  _isStrongLink: (pencils, num, unitType, unitIndex, loc1, loc2) => {
    const unitCells = techniques._getUnitCells(unitType, unitIndex);
    const candidateLocs = [];
    for (const [r, c] of unitCells) {
      if (pencils[r][c].has(num)) {
        candidateLocs.push(unitType === "row" ? c : r);
      }
    }
    return (
      candidateLocs.length === 2 &&
      candidateLocs.includes(loc1) &&
      candidateLocs.includes(loc2)
    );
  },

  _checkAndAddER: (pairs, pencils, er_list, is_nx2, found) => {
    const pairMasks = [];
    const digitFrequency = new Uint8Array(10);
    const bitCount = (mask) => {
      let count = 0;
      while (mask) {
        mask &= mask - 1;
        count++;
      }
      return count;
    };

    for (const [[r1, c1], [r2, c2]] of pairs) {
      // Prevent using solved cells (naked singles) which can cause false positives with union
      if (pencils[r1][c1].size < 2 || pencils[r2][c2].size < 2) return;

      let mask = 0;

      // FIX: Use UNION instead of INTERSECTION to allow incomplete EUR base cells
      for (const digit of pencils[r1][c1]) mask |= 1 << digit;
      for (const digit of pencils[r2][c2]) mask |= 1 << digit;

      if (bitCount(mask) < 2) return;
      pairMasks.push(mask);

      for (let digit = 1; digit <= 9; digit++) {
        if (mask & (1 << digit)) digitFrequency[digit]++;
      }
    }

    // A deadly digit must be supported by at least two corresponding pairs.
    const eligibleDigits = [];
    for (let digit = 1; digit <= 9; digit++) {
      if (digitFrequency[digit] >= 2) eligibleDigits.push(digit);
    }
    if (eligibleDigits.length < pairs.length) return;

    const cells = pairs.flat();
    for (const digits of techniques.combinations(
      eligibleDigits,
      pairs.length,
    )) {
      let coreMask = 0;
      for (const digit of digits) coreMask |= 1 << digit;

      // The union of each pair must contain at least 2 core digits
      if (pairMasks.some((mask) => bitCount(mask & coreMask) < 2)) continue;

      const key = `${digits.join("")}:${cells
        .map(([r, c]) => r * 9 + c)
        .sort((a, b) => a - b)
        .join(",")}`;
      if (found.has(key)) continue;
      found.add(key);
      er_list.push({ cells, digits, is_nx2 });
    }
  },

  _findExtendedRectangles: function (pencils) {
    const rectangles = [];
    const found = new Set();
    const indexes = [0, 1, 2, 3, 4, 5, 6, 7, 8];

    for (let r1 = 0; r1 < 8; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        const columnSets = [];
        if (Math.floor(r1 / 3) === Math.floor(r2 / 3)) {
          for (let size = 3; size <= 7; size++) {
            columnSets.push(...techniques.combinations(indexes, size));
          }
        } else {
          for (let stack = 0; stack < 3; stack++) {
            columnSets.push([stack * 3, stack * 3 + 1, stack * 3 + 2]);
          }
        }
        for (const cols of columnSets) {
          const pairs = cols.map((c) => [
            [r1, c],
            [r2, c],
          ]);
          techniques._checkAndAddER(pairs, pencils, rectangles, false, found);
        }
      }
    }

    for (let c1 = 0; c1 < 8; c1++) {
      for (let c2 = c1 + 1; c2 < 9; c2++) {
        const rowSets = [];
        if (Math.floor(c1 / 3) === Math.floor(c2 / 3)) {
          for (let size = 3; size <= 7; size++) {
            rowSets.push(...techniques.combinations(indexes, size));
          }
        } else {
          for (let band = 0; band < 3; band++) {
            rowSets.push([band * 3, band * 3 + 1, band * 3 + 2]);
          }
        }
        for (const rows of rowSets) {
          const pairs = rows.map((r) => [
            [r, c1],
            [r, c2],
          ]);
          techniques._checkAndAddER(pairs, pencils, rectangles, true, found);
        }
      }
    }
    return rectangles;
  },

  extendedRectangle: (board, pencils, findAll = false) => {
    const results = [];
    const ers = techniques._findExtendedRectangles(pencils);
    if (ers.length === 0) return { change: false };

    const formatRC = (cells) => {
      if (!cells || cells.length === 0) return "";
      const norm = cells.map((c) => [
        c.r !== undefined ? c.r : c[0],
        c.c !== undefined ? c.c : c[1],
      ]);
      if (norm.length === 1) return `r${norm[0][0] + 1}c${norm[0][1] + 1}`;
      if (norm.every((c) => c[0] === norm[0][0])) {
        return `r${norm[0][0] + 1}c${norm
          .map((c) => c[1] + 1)
          .sort((a, b) => a - b)
          .join("")}`;
      }
      if (norm.every((c) => c[1] === norm[0][1])) {
        return `r${norm
          .map((c) => c[0] + 1)
          .sort((a, b) => a - b)
          .join("")}c${norm[0][1] + 1}`;
      }
      return norm.map((c) => `r${c[0] + 1}c${c[1] + 1}`).join(",");
    };

    const formatBP = (cells, boxIdx) => {
      if (!cells || cells.length === 0) return "";
      const norm = cells.map((c) => [
        c.r !== undefined ? c.r : c[0],
        c.c !== undefined ? c.c : c[1],
      ]);
      const points = norm
        .map((c) => (c[0] % 3) * 3 + (c[1] % 3) + 1)
        .sort((a, b) => a - b)
        .join("");
      return `b${boxIdx + 1}p${points}`;
    };

    const getBasePosStr = (cells) => {
      const rows = Array.from(new Set(cells.map((c) => c[0] + 1)))
        .sort((a, b) => a - b)
        .join("");
      const cols = Array.from(new Set(cells.map((c) => c[1] + 1)))
        .sort((a, b) => a - b)
        .join("");
      return `r${rows}c${cols}`;
    };

    const getGuardiansStr = (extraCells, core_digits, pencils) => {
      return extraCells
        .map(([r, c]) => {
          const extras = Array.from(pencils[r][c])
            .filter((d) => !core_digits.has(d))
            .sort((a, b) => a - b)
            .join("");
          return `(${extras})r${r + 1}c${c + 1}`;
        })
        .join(",");
    };

    const getEURVisuals = (type, cells, digits, removals, extraData = {}) => {
      return () => {
        highlightState = type === 4 || type === 6 ? 1 : 0;
        highlightedDigit =
          type === 4 || type === 6 ? extraData.restrictedDigit : null;

        const core_digits = new Set(digits);
        cells.forEach(([cr, cc]) => {
          boardState[cr][cc].cellColor = cellColorPalette[7];
          boardState[cr][cc].pencils.forEach((cand) => {
            if (core_digits.has(cand))
              boardState[cr][cc].pencilColors.set(
                cand,
                candidateColorPalette[7],
              );
            else
              boardState[cr][cc].pencilColors.set(
                cand,
                candidateColorPalette[3],
              );
          });
        });

        if (type === 3) {
          extraData.subsetCells.forEach(([cr, cc]) => {
            boardState[cr][cc].cellColor = cellColorPalette[6];
            boardState[cr][cc].pencils.forEach((cand) => {
              if (extraData.subsetCands.has(cand))
                boardState[cr][cc].pencilColors.set(
                  cand,
                  candidateColorPalette[4],
                );
            });
          });
        }

        if (type === 4) {
          drawnLines.push({
            r1: extraData.e1[0],
            c1: extraData.e1[1],
            n1: extraData.restrictedDigit,
            r2: extraData.e2[0],
            c2: extraData.e2[1],
            n2: extraData.restrictedDigit,
            color: lineColorPalette[0],
            style: "solid",
          });
        }

        if (type === 6) {
          const u = extraData.restrictedDigit;
          const [e1r, e1c] = extraData.e1;
          const [e2r, e2c] = extraData.e2;
          if (extraData.is_nx2) {
            drawnLines.push({
              r1: e1r,
              c1: e1c,
              n1: u,
              r2: e2r,
              c2: e1c,
              n2: u,
              color: lineColorPalette[0],
              style: "solid",
            });
            drawnLines.push({
              r1: e1r,
              c1: e2c,
              n1: u,
              r2: e2r,
              c2: e2c,
              n2: u,
              color: lineColorPalette[0],
              style: "solid",
            });
          } else {
            drawnLines.push({
              r1: e1r,
              c1: e1c,
              n1: u,
              r2: e1r,
              c2: e2c,
              n2: u,
              color: lineColorPalette[0],
              style: "solid",
            });
            drawnLines.push({
              r1: e2r,
              c1: e1c,
              n1: u,
              r2: e2r,
              c2: e2c,
              n2: u,
              color: lineColorPalette[0],
              style: "solid",
            });
          }
        }

        removals.forEach((el) =>
          boardState[el.r][el.c].candSlashes.set(el.num, markColorPalette[0]),
        );
      };
    };

    for (const er of ers) {
      const { cells, digits, is_nx2 } = er;
      const core_digits = new Set(digits);
      const removals = [];

      const extra_cells = cells.filter(([r, c]) =>
        [...pencils[r][c]].some((cand) => !core_digits.has(cand)),
      );

      const baseDigitsStr = digits.sort().join("");
      const detailPrefix = t(
        "teks_msg_97",
        baseDigitsStr,
        getBasePosStr(cells),
        getGuardiansStr(extra_cells, core_digits, pencils),
      );

      // --- Type 1 ---
      if (extra_cells.length === 1) {
        const [r, c] = extra_cells[0];
        digits.forEach((d) => {
          if (pencils[r][c].has(d)) removals.push({ r, c, num: d });
        });
        if (removals.length > 0) {
          const resultObj = {
            change: true,
            type: "remove",
            cells: _getUniqueRemovals(removals),
            hint: {
              name: t("teks_msg_98"),
              mainInfo: t("teks_msg_99", baseDigitsStr),
              detail: detailPrefix,
            },
            applyVisuals: getEURVisuals(
              1,
              cells,
              digits,
              _getUniqueRemovals(removals),
            ),
          };
          if (!findAll) return resultObj;
          results.push(resultObj);
          continue;
        }
      }

      // --- Types 2 & 5: Common guardian digit ---
      // Type 2 requires every guardian of that digit to be in one house.
      // The same common-guardian deduction without that shared house is Type 5.
      if (extra_cells.length >= 2) {
        let common_extra_cand = -1;
        let isCommonGuardian = true;
        for (const [r, c] of extra_cells) {
          const extras = [...pencils[r][c]].filter(
            (cand) => !core_digits.has(cand),
          );
          if (extras.length !== 1) {
            isCommonGuardian = false;
            break;
          }
          if (common_extra_cand === -1) common_extra_cand = extras[0];
          else if (common_extra_cand !== extras[0]) {
            isCommonGuardian = false;
            break;
          }
        }
        if (isCommonGuardian) {
          const [firstR, firstC] = extra_cells[0];
          const guardiansShareHouse =
            extra_cells.every(([r]) => r === firstR) ||
            extra_cells.every(([, c]) => c === firstC) ||
            extra_cells.every(
              ([r, c]) =>
                techniques._getBoxIndex(r, c) ===
                techniques._getBoxIndex(firstR, firstC),
            );
          const peers = techniques._findCommonPeers(
            extra_cells,
            cells,
            board,
            pencils,
          );
          for (const [r, c] of peers) {
            if (pencils[r][c].has(common_extra_cand)) {
              removals.push({ r, c, num: common_extra_cand });
            }
          }
          if (removals.length > 0) {
            const resultObj = {
              change: true,
              type: "remove",
              cells: _getUniqueRemovals(removals),
              hint: {
                name: guardiansShareHouse
                  ? t("teks_msg_100")
                  : t("teks_msg_101"),
                mainInfo: t("teks_msg_99", baseDigitsStr),
                detail: detailPrefix,
              },
              applyVisuals: getEURVisuals(
                guardiansShareHouse ? 2 : 5,
                cells,
                digits,
                _getUniqueRemovals(removals),
              ),
            };
            if (!findAll) return resultObj;
            results.push(resultObj);
            continue;
          }
        }
      }

      // --- Type 3 (ER + Naked Subset) ---
      if (extra_cells.length === 2 || extra_cells.length === 3) {
        const sharedUnits = [];
        const r_set = new Set(extra_cells.map((c) => c[0]));
        const c_set = new Set(extra_cells.map((c) => c[1]));
        const b_set = new Set(
          extra_cells.map(([r, c]) => techniques._getBoxIndex(r, c)),
        );

        if (r_set.size === 1) {
          const idx = r_set.values().next().value;
          sharedUnits.push({
            type: "row",
            idx,
            cells: techniques._getUnitCells("row", idx),
          });
        }
        if (c_set.size === 1) {
          const idx = c_set.values().next().value;
          sharedUnits.push({
            type: "col",
            idx,
            cells: techniques._getUnitCells("col", idx),
          });
        }
        if (b_set.size === 1) {
          const idx = b_set.values().next().value;
          sharedUnits.push({
            type: "box",
            idx,
            cells: techniques._getUnitCells("box", idx),
          });
        }

        if (sharedUnits.length > 0) {
          const virtual_cands = new Set();
          extra_cells.forEach(([r, c]) => {
            pencils[r][c].forEach((cand) => {
              if (!core_digits.has(cand)) virtual_cands.add(cand);
            });
          });

          const processUnit = (unitCellsRaw) => {
            const erCellsSet = new Set(cells.map(JSON.stringify));
            const unitCells = unitCellsRaw.filter(
              ([r, c]) =>
                !erCellsSet.has(JSON.stringify([r, c])) && board[r][c] === 0,
            );
            if (unitCells.length < 1) return null;

            for (let k = 1; k <= unitCells.length; k++) {
              for (const chosen of techniques.combinations(unitCells, k)) {
                const union = new Set(virtual_cands);
                chosen.forEach(([r, c]) =>
                  pencils[r][c].forEach((p) => union.add(p)),
                );

                if (union.size === k + 1) {
                  const local_removals = [];
                  const chosenSet = new Set(chosen.map(JSON.stringify));
                  for (const [r, c] of unitCells) {
                    if (chosenSet.has(JSON.stringify([r, c]))) continue;
                    for (const d of union) {
                      if (pencils[r][c].has(d))
                        local_removals.push({ r, c, num: d });
                    }
                  }
                  if (local_removals.length > 0)
                    return { removals: local_removals, chosen, union };
                }
              }
            }
            return null;
          };

          for (const unit of sharedUnits) {
            const res = processUnit(unit.cells);
            if (res) {
              const subsetStr =
                unit.type === "box"
                  ? formatBP(res.chosen, unit.idx)
                  : formatRC(res.chosen);
              const resultObj = {
                change: true,
                type: "remove",
                cells: _getUniqueRemovals(res.removals),
                hint: {
                  name: t("teks_msg_102"),
                  mainInfo: t("teks_msg_99", baseDigitsStr),
                  detail: t("teks_msg_104", detailPrefix, subsetStr),
                },
                applyVisuals: getEURVisuals(
                  3,
                  cells,
                  digits,
                  _getUniqueRemovals(res.removals),
                  { subsetCells: res.chosen, subsetCands: res.union },
                ),
              };
              if (!findAll) return resultObj;
              results.push(resultObj);
              continue;
            }
          }
        }
      }

      // --- Types 4 & 6 ---
      if (extra_cells.length === 2) {
        const [e1r, e1c] = extra_cells[0];
        const [e2r, e2c] = extra_cells[1];

        // Type 4: Extras see each other
        if (techniques._sees([e1r, e1c], [e2r, e2c])) {
          let unitType, unitIndex, loc1, loc2;
          if (e1r === e2r) {
            unitType = "row";
            unitIndex = e1r;
            loc1 = e1c;
            loc2 = e2c;
          } else if (e1c === e2c) {
            unitType = "col";
            unitIndex = e1c;
            loc1 = e1r;
            loc2 = e2r;
          } else {
            unitType = "box";
            unitIndex = techniques._getBoxIndex(e1r, e1c);
          }

          for (const d of digits) {
            if (!pencils[e1r][e1c].has(d) || !pencils[e2r][e2c].has(d))
              continue;

            let is_strong_link = false;
            if (unitType !== "box") {
              is_strong_link = techniques._isStrongLink(
                pencils,
                d,
                unitType,
                unitIndex,
                loc1,
                loc2,
              );
            } else {
              const boxCells = techniques._getUnitCells("box", unitIndex);
              const candLocs = boxCells.filter(([r, c]) =>
                pencils[r][c].has(d),
              );
              if (
                candLocs.length === 2 &&
                candLocs.some(([r, c]) => r === e1r && c === e1c) &&
                candLocs.some(([r, c]) => r === e2r && c === e2c)
              ) {
                is_strong_link = true;
              }
            }

            if (is_strong_link) {
              const v_cands = digits.filter((cand) => cand !== d);
              v_cands.forEach((v) => {
                if (pencils[e1r][e1c].has(v))
                  removals.push({ r: e1r, c: e1c, num: v });
                if (pencils[e2r][e2c].has(v))
                  removals.push({ r: e2r, c: e2c, num: v });
              });
              if (removals.length > 0) {
                // Use formatRC to automatically compress the two extra cells
                const restrictedCellsStr = formatRC([
                  [e1r, e1c],
                  [e2r, e2c],
                ]);

                const resultObj = {
                  change: true,
                  type: "remove",
                  cells: _getUniqueRemovals(removals),
                  hint: {
                    name: t("teks_msg_105"),
                    mainInfo: t("teks_msg_99", baseDigitsStr),
                    detail: t(
                      "teks_msg_107",
                      detailPrefix,
                      d,
                      restrictedCellsStr,
                    ),
                  },
                  applyVisuals: getEURVisuals(
                    4,
                    cells,
                    digits,
                    _getUniqueRemovals(removals),
                    { restrictedDigit: d, e1: [e1r, e1c], e2: [e2r, e2c] },
                  ),
                };
                if (!findAll) return resultObj;
                results.push(resultObj);
                continue;
              }
            }
          }
        }
        // Type 6: Extras do not see each other
        else {
          for (const d of digits) {
            if (!pencils[e1r][e1c].has(d) || !pencils[e2r][e2c].has(d))
              continue;

            let is_restricted = false;
            if (!is_nx2) {
              // Row-pair ER, check rows for X-Wing
              const r1_locs = techniques
                ._getUnitCells("row", e1r)
                .filter(([_r, _c]) => pencils[_r][_c].has(d));
              const r2_locs = techniques
                ._getUnitCells("row", e2r)
                .filter(([_r, _c]) => pencils[_r][_c].has(d));
              if (
                r1_locs.length === 2 &&
                r2_locs.length === 2 &&
                r1_locs.some(([_, c]) => c === e1c) &&
                r1_locs.some(([_, c]) => c === e2c) &&
                r2_locs.some(([_, c]) => c === e1c) &&
                r2_locs.some(([_, c]) => c === e2c)
              ) {
                is_restricted = true;
              }
            } else {
              // Column-pair ER, check cols for X-Wing
              const c1_locs = techniques
                ._getUnitCells("col", e1c)
                .filter(([_r, _c]) => pencils[_r][_c].has(d));
              const c2_locs = techniques
                ._getUnitCells("col", e2c)
                .filter(([_r, _c]) => pencils[_r][_c].has(d));
              if (
                c1_locs.length === 2 &&
                c2_locs.length === 2 &&
                c1_locs.some(([r, _]) => r === e1r) &&
                c1_locs.some(([r, _]) => r === e2r) &&
                c2_locs.some(([r, _]) => r === e1r) &&
                c2_locs.some(([r, _]) => r === e2r)
              ) {
                is_restricted = true;
              }
            }

            if (is_restricted) {
              if (pencils[e1r][e1c].has(d))
                removals.push({ r: e1r, c: e1c, num: d });
              if (pencils[e2r][e2c].has(d))
                removals.push({ r: e2r, c: e2c, num: d });
              if (removals.length > 0) {
                const resultObj = {
                  change: true,
                  type: "remove",
                  cells: _getUniqueRemovals(removals),
                  hint: {
                    name: t("teks_msg_108"),
                    mainInfo: t("teks_msg_99", baseDigitsStr),
                    detail: t("teks_msg_110", detailPrefix, d),
                  },
                  applyVisuals: getEURVisuals(
                    6,
                    cells,
                    digits,
                    _getUniqueRemovals(removals),
                    {
                      restrictedDigit: d,
                      is_nx2,
                      e1: [e1r, e1c],
                      e2: [e2r, e2c],
                    },
                  ),
                };
                if (!findAll) return resultObj;
                results.push(resultObj);
                continue;
              }
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  _findUniqueLoops: function (pencils) {
    const bivalue_cells_by_pair = new Map();

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cands = pencils[r][c];
        if (cands.size === 2) {
          const [d1, d2] = [...cands].sort((a, b) => a - b);
          const pair_key = `${d1},${d2}`;
          const id = r * 9 + c;

          if (!bivalue_cells_by_pair.has(pair_key)) {
            bivalue_cells_by_pair.set(pair_key, new Set());
          }
          bivalue_cells_by_pair.get(pair_key).add(id);
        }
      }
    }

    const loops = [];
    const found = new Set();
    const maxLoopLength = 18;
    const maxResults = 1023;

    for (const [
      pair_key,
      bivalue_set_for_pair,
    ] of bivalue_cells_by_pair.entries()) {
      if (bivalue_set_for_pair.size < 2) continue;

      const [d1, d2] = pair_key.split(",").map(Number);
      const cell_list = [];
      const guardian_set_for_pair = new Set();

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cands = pencils[r][c];
          const hasD1 = cands.has(d1);
          const hasD2 = cands.has(d2);
          if (!hasD1 && !hasD2) continue;

          const hasExtra = [...cands].some(
            (digit) => digit !== d1 && digit !== d2,
          );
          if (!hasD1 || !hasD2) {
            if (!hasExtra) continue;
            guardian_set_for_pair.add(r * 9 + c);
          } else if (hasExtra) {
            guardian_set_for_pair.add(r * 9 + c);
          }
          cell_list.push(r * 9 + c);
        }
      }
      if (cell_list.length < 6) continue;

      const neighbors = new Map();
      for (const id of cell_list) {
        const cell = [Math.floor(id / 9), id % 9];
        neighbors.set(
          id,
          cell_list.filter(
            (other) =>
              other !== id &&
              techniques._sees(cell, [Math.floor(other / 9), other % 9]),
          ),
        );
      }

      for (const start of bivalue_set_for_pair) {
        if (!neighbors.has(start)) continue;
        const path = [start];
        const used = new Set(path);
        let guardianCount = 0;
        const houseCounts = new Uint8Array(27);
        const houseParityMasks = new Uint8Array(27);
        const getHouses = (id) => {
          const r = Math.floor(id / 9);
          const c = id % 9;
          return [r, 9 + c, 18 + techniques._getBoxIndex(r, c)];
        };
        for (const house of getHouses(start)) {
          houseCounts[house] = 1;
          houseParityMasks[house] = 1;
        }

        const search = (current) => {
          for (const next of neighbors.get(current)) {
            if (next === start) continue;
            if (used.has(next) || path.length >= maxLoopLength) continue;
            if (bivalue_set_for_pair.has(next) && next < start) continue;
            const isGuardian = guardian_set_for_pair.has(next);
            if (isGuardian && guardianCount >= 4) continue;
            const parity = path.length & 1;
            const parityBit = 1 << parity;
            const nextHouses = getHouses(next);
            if (
              nextHouses.some(
                (house) =>
                  houseCounts[house] >= 2 ||
                  (houseParityMasks[house] & parityBit) !== 0,
              )
            )
              continue;

            path.push(next);
            used.add(next);
            if (isGuardian) guardianCount++;
            for (const house of nextHouses) {
              houseCounts[house]++;
              houseParityMasks[house] |= parityBit;
            }

            let stop = false;
            const isDeadlyBody = houseCounts.every(
              (count) => count === 0 || count === 2,
            );
            if (
              path.length >= 6 &&
              path.length % 2 === 0 &&
              isDeadlyBody &&
              techniques._sees(
                [Math.floor(next / 9), next % 9],
                [Math.floor(start / 9), start % 9],
              )
            ) {
              const key = `${pair_key}:${[...path]
                .sort((a, b) => a - b)
                .join(",")}`;
              if (!found.has(key)) {
                const bivalueCount = path.filter((id) =>
                  bivalue_set_for_pair.has(id),
                ).length;
                if (bivalueCount >= 2) {
                  found.add(key);
                  loops.push({
                    cells: path.map((id) => [Math.floor(id / 9), id % 9]),
                    digits: [d1, d2],
                  });
                  stop = loops.length >= maxResults;
                }
              }
            }

            if (!stop && path.length < maxLoopLength) stop = search(next);
            for (const house of nextHouses) {
              houseCounts[house]--;
              houseParityMasks[house] &= ~parityBit;
            }
            used.delete(next);
            path.pop();
            if (isGuardian) guardianCount--;
            if (stop) return true;
          }
          return false;
        };

        if (search(start) || loops.length >= maxResults) break;
      }
      if (loops.length >= maxResults) break;
    }
    return loops;
  },
  uniqueLoop: (board, pencils, findAll = false) => {
    const results = [];
    const loops = techniques._findUniqueLoops(pencils);
    if (loops.length === 0) return { change: false };

    const formatRC = (cells) => {
      if (!cells || cells.length === 0) return "";
      const norm = cells.map((c) => [
        c.r !== undefined ? c.r : c[0],
        c.c !== undefined ? c.c : c[1],
      ]);
      if (norm.length === 1) return `r${norm[0][0] + 1}c${norm[0][1] + 1}`;
      if (norm.every((c) => c[0] === norm[0][0])) {
        return `r${norm[0][0] + 1}c${norm
          .map((c) => c[1] + 1)
          .sort((a, b) => a - b)
          .join("")}`;
      }
      if (norm.every((c) => c[1] === norm[0][1])) {
        return `r${norm
          .map((c) => c[0] + 1)
          .sort((a, b) => a - b)
          .join("")}c${norm[0][1] + 1}`;
      }
      return norm.map((c) => `r${c[0] + 1}c${c[1] + 1}`).join(",");
    };

    const formatBP = (cells, boxIdx) => {
      if (!cells || cells.length === 0) return "";
      const norm = cells.map((c) => [
        c.r !== undefined ? c.r : c[0],
        c.c !== undefined ? c.c : c[1],
      ]);
      const points = norm
        .map((c) => (c[0] % 3) * 3 + (c[1] % 3) + 1)
        .sort((a, b) => a - b)
        .join("");
      return `b${boxIdx + 1}p${points}`;
    };

    const getBasePosStr = (cells) => {
      const rows = Array.from(new Set(cells.map((c) => c[0] + 1)))
        .sort((a, b) => a - b)
        .join("");
      const cols = Array.from(new Set(cells.map((c) => c[1] + 1)))
        .sort((a, b) => a - b)
        .join("");
      return `r${rows}c${cols}`;
    };

    const getGuardiansStr = (extraCells, d_set, pencils) => {
      return extraCells
        .map(([r, c]) => {
          const extras = Array.from(pencils[r][c])
            .filter((d) => !d_set.has(d))
            .sort((a, b) => a - b)
            .join("");
          return `(${extras})r${r + 1}c${c + 1}`;
        })
        .join(",");
    };

    const getULVisuals = (type, cells, digits, removals, extraData = {}) => {
      return () => {
        highlightState = type === 4 || type === 6 ? 1 : 0;
        highlightedDigit =
          type === 4 || type === 6 ? extraData.restrictedDigit : null;

        const core_digits = new Set(digits);
        cells.forEach(([cr, cc]) => {
          boardState[cr][cc].cellColor = cellColorPalette[7];
          boardState[cr][cc].pencils.forEach((cand) => {
            if (core_digits.has(cand))
              boardState[cr][cc].pencilColors.set(
                cand,
                candidateColorPalette[7],
              );
            else
              boardState[cr][cc].pencilColors.set(
                cand,
                candidateColorPalette[3],
              );
          });
        });

        if (type === 3) {
          extraData.subsetCells.forEach(([cr, cc]) => {
            boardState[cr][cc].cellColor = cellColorPalette[6];
            boardState[cr][cc].pencils.forEach((cand) => {
              if (extraData.subsetCands.has(cand))
                boardState[cr][cc].pencilColors.set(
                  cand,
                  candidateColorPalette[4],
                );
            });
          });
        }

        if (type === 4) {
          drawnLines.push({
            r1: extraData.e1[0],
            c1: extraData.e1[1],
            n1: extraData.restrictedDigit,
            r2: extraData.e2[0],
            c2: extraData.e2[1],
            n2: extraData.restrictedDigit,
            color: lineColorPalette[0],
            style: "solid",
          });
        }

        if (type === 6) {
          const u = extraData.restrictedDigit;
          const rows = [...new Set(cells.map((c) => c[0]))];
          rows.forEach((r) => {
            const req_locs = cells
              .filter((cell) => cell[0] === r)
              .map((cell) => cell[1])
              .sort((a, b) => a - b);
            if (req_locs.length === 2) {
              drawnLines.push({
                r1: r,
                c1: req_locs[0],
                n1: u,
                r2: r,
                c2: req_locs[1],
                n2: u,
                color: lineColorPalette[0],
                style: "solid",
              });
            }
          });
        }

        removals.forEach((el) =>
          boardState[el.r][el.c].candSlashes.set(el.num, markColorPalette[0]),
        );
      };
    };

    for (const ul of loops) {
      const { cells, digits } = ul;
      const [d1, d2] = digits;
      const d_set = new Set(digits);
      let removals = [];

      const extra_cells = cells.filter(
        ([r, c]) =>
          pencils[r][c].size !== 2 ||
          ![...pencils[r][c]].every((d) => d_set.has(d)),
      );

      const baseDigitsStr = `${d1}${d2}`;
      const detailPrefix = t(
        "teks_msg_111",
        baseDigitsStr,
        getBasePosStr(cells),
        getGuardiansStr(extra_cells, d_set, pencils),
      );

      // --- Type 1 ---
      if (extra_cells.length === 1) {
        const [r, c] = extra_cells[0];
        if (pencils[r][c].has(d1)) removals.push({ r, c, num: d1 });
        if (pencils[r][c].has(d2)) removals.push({ r, c, num: d2 });
        if (removals.length > 0) {
          const resultObj = {
            change: true,
            type: "remove",
            cells: _getUniqueRemovals(removals),
            hint: {
              name: t("teks_msg_112"),
              mainInfo: t("teks_msg_113", baseDigitsStr),
              detail: detailPrefix,
            },
            applyVisuals: getULVisuals(
              1,
              cells,
              digits,
              _getUniqueRemovals(removals),
            ),
          };
          if (!findAll) return resultObj;
          results.push(resultObj);
          continue;
        }
      }

      // --- Types 2 & 5: Common guardian digit ---
      // Type 2 requires every guardian of that digit to be in one house.
      // The same common-guardian deduction without that shared house is Type 5.
      if (extra_cells.length >= 2 && extra_cells.length <= 4) {
        let common_extra_cand = -1;
        let isCommonGuardian = true;
        for (const [r, c] of extra_cells) {
          const extras = [...pencils[r][c]].filter((cand) => !d_set.has(cand));
          if (extras.length !== 1) {
            isCommonGuardian = false;
            break;
          }
          if (common_extra_cand === -1) common_extra_cand = extras[0];
          else if (common_extra_cand !== extras[0]) {
            isCommonGuardian = false;
            break;
          }
        }
        if (isCommonGuardian) {
          const [firstR, firstC] = extra_cells[0];
          const guardiansShareHouse =
            extra_cells.every(([r]) => r === firstR) ||
            extra_cells.every(([, c]) => c === firstC) ||
            extra_cells.every(
              ([r, c]) =>
                techniques._getBoxIndex(r, c) ===
                techniques._getBoxIndex(firstR, firstC),
            );
          const peers = techniques._findCommonPeers(
            extra_cells,
            cells,
            board,
            pencils,
          );
          for (const [r, c] of peers) {
            if (pencils[r][c].has(common_extra_cand)) {
              removals.push({ r, c, num: common_extra_cand });
            }
          }
          if (removals.length > 0) {
            const resultObj = {
              change: true,
              type: "remove",
              cells: _getUniqueRemovals(removals),
              hint: {
                name: guardiansShareHouse
                  ? t("teks_msg_114")
                  : t("teks_msg_115"),
                mainInfo: t("teks_msg_113", baseDigitsStr),
                detail: detailPrefix,
              },
              applyVisuals: getULVisuals(
                guardiansShareHouse ? 2 : 5,
                cells,
                digits,
                _getUniqueRemovals(removals),
              ),
            };
            if (!findAll) return resultObj;
            results.push(resultObj);
            continue;
          }
        }
      }

      // --- Types 3 & 4 ---
      if (extra_cells.length === 2) {
        const [e1r, e1c] = extra_cells[0];
        const [e2r, e2c] = extra_cells[1];

        // --- Type 3 (Loop + Naked Subset) ---
        const sharedUnits = [];
        if (e1r === e2r)
          sharedUnits.push({
            type: "row",
            idx: e1r,
            cells: techniques._getUnitCells("row", e1r),
          });
        if (e1c === e2c)
          sharedUnits.push({
            type: "col",
            idx: e1c,
            cells: techniques._getUnitCells("col", e1c),
          });
        const bIdx1 = techniques._getBoxIndex(e1r, e1c);
        const bIdx2 = techniques._getBoxIndex(e2r, e2c);
        if (bIdx1 === bIdx2) {
          sharedUnits.push({
            type: "box",
            idx: bIdx1,
            cells: techniques._getUnitCells("box", bIdx1),
          });
        }

        if (sharedUnits.length > 0) {
          const virtual_cands = new Set();
          [...pencils[e1r][e1c], ...pencils[e2r][e2c]].forEach((cand) => {
            if (!d_set.has(cand)) virtual_cands.add(cand);
          });

          const processUnit = (unitCellsRaw) => {
            const ulCellsSet = new Set(cells.map(JSON.stringify));
            const unitCells = unitCellsRaw.filter(
              ([r, c]) =>
                !ulCellsSet.has(JSON.stringify([r, c])) && board[r][c] === 0,
            );
            if (unitCells.length < 1) return null;

            for (let k = 1; k < unitCells.length; k++) {
              for (const chosen of techniques.combinations(unitCells, k)) {
                const union = new Set(virtual_cands);
                chosen.forEach(([r, c]) =>
                  pencils[r][c].forEach((p) => union.add(p)),
                );

                if (union.size === k + 1) {
                  const local_removals = [];
                  const chosenSet = new Set(chosen.map(JSON.stringify));
                  for (const [r, c] of unitCells) {
                    if (chosenSet.has(JSON.stringify([r, c]))) continue;
                    for (const d of union) {
                      if (pencils[r][c].has(d))
                        local_removals.push({ r, c, num: d });
                    }
                  }
                  if (local_removals.length > 0)
                    return { removals: local_removals, chosen, union };
                }
              }
            }
            return null;
          };

          for (const unit of sharedUnits) {
            const res = processUnit(unit.cells);
            if (res) {
              const subsetStr =
                unit.type === "box"
                  ? formatBP(res.chosen, unit.idx)
                  : formatRC(res.chosen);
              const resultObj = {
                change: true,
                type: "remove",
                cells: _getUniqueRemovals(res.removals),
                hint: {
                  name: t("teks_msg_117"),
                  mainInfo: t("teks_msg_113", baseDigitsStr),
                  detail: t("teks_msg_104", detailPrefix, subsetStr),
                },
                applyVisuals: getULVisuals(
                  3,
                  cells,
                  digits,
                  _getUniqueRemovals(res.removals),
                  { subsetCells: res.chosen, subsetCands: res.union },
                ),
              };
              if (!findAll) return resultObj;
              results.push(resultObj);
              continue;
            }
          }
        }

        // --- Type 4 ---
        if (techniques._sees([e1r, e1c], [e2r, e2c])) {
          let unitType, unitIndex, loc1, loc2;
          if (e1r === e2r) {
            unitType = "row";
            unitIndex = e1r;
            loc1 = e1c;
            loc2 = e2c;
          } else if (e1c === e2c) {
            unitType = "col";
            unitIndex = e1c;
            loc1 = e1r;
            loc2 = e2r;
          } else {
            unitType = "box";
            unitIndex = techniques._getBoxIndex(e1r, e1c);
          }

          for (const d of digits) {
            const other_d = d === d1 ? d2 : d1;
            let is_strong_link = false;
            if (unitType !== "box") {
              is_strong_link = techniques._isStrongLink(
                pencils,
                d,
                unitType,
                unitIndex,
                loc1,
                loc2,
              );
            } else {
              const boxCells = techniques._getUnitCells("box", unitIndex);
              const candLocs = boxCells.filter(([r, c]) =>
                pencils[r][c].has(d),
              );
              if (
                candLocs.length === 2 &&
                candLocs.some(([r, c]) => r === e1r && c === e1c) &&
                candLocs.some(([r, c]) => r === e2r && c === e2c)
              ) {
                is_strong_link = true;
              }
            }
            if (is_strong_link) {
              if (pencils[e1r][e1c].has(other_d))
                removals.push({ r: e1r, c: e1c, num: other_d });
              if (pencils[e2r][e2c].has(other_d))
                removals.push({ r: e2r, c: e2c, num: other_d });
              if (removals.length > 0) {
                const restrictedCellsStr = formatRC([
                  [e1r, e1c],
                  [e2r, e2c],
                ]);
                const resultObj = {
                  change: true,
                  type: "remove",
                  cells: _getUniqueRemovals(removals),
                  hint: {
                    name: t("teks_msg_120"),
                    mainInfo: t("teks_msg_113", baseDigitsStr),
                    detail: t(
                      "teks_msg_107",
                      detailPrefix,
                      d,
                      restrictedCellsStr,
                    ),
                  },
                  applyVisuals: getULVisuals(
                    4,
                    cells,
                    digits,
                    _getUniqueRemovals(removals),
                    {
                      restrictedDigit: d,
                      e1: [e1r, e1c],
                      e2: [e2r, e2c],
                    },
                  ),
                };
                if (!findAll) return resultObj;
                results.push(resultObj);
                continue;
              }
            }
          }
        }
      }

      // --- Type 6 ---
      if (extra_cells.length > 1) {
        // A restricted base digit can occupy either parity of the loop, but
        // not a mixture of both.  Therefore Type 6 only applies when every
        // guardian belongs to the same parity of the loop order.  Whether
        // guardians see one another is unrelated to this deduction.
        const guardianIds = new Set(
          extra_cells.map(([r, c]) => techniques._cellToId(r, c)),
        );
        const guardianParities = new Set();
        cells.forEach(([r, c], index) => {
          if (guardianIds.has(techniques._cellToId(r, c))) {
            guardianParities.add(index & 1);
          }
        });

        if (guardianParities.size === 1) {
          // Group the loop cells by every house they occupy.  The loop
          // finder guarantees two loop cells per occupied house; checking
          // that explicitly here keeps the restriction test self-contained.
          const loopHouses = new Map();
          const addToHouse = (type, index, cell) => {
            const key = `${type}:${index}`;
            if (!loopHouses.has(key)) {
              loopHouses.set(key, { type, index, cellIds: new Set() });
            }
            loopHouses
              .get(key)
              .cellIds.add(techniques._cellToId(cell[0], cell[1]));
          };
          cells.forEach((cell) => {
            const [r, c] = cell;
            addToHouse("row", r, cell);
            addToHouse("col", c, cell);
            addToHouse("box", techniques._getBoxIndex(r, c), cell);
          });

          for (const u of digits) {
            // The base digit must be restricted to the two loop cells in
            // every row, column, and box used by the loop.  This establishes
            // the two alternating placements of that digit around the loop.
            const isRestrictedInAllLoopHouses = [...loopHouses.values()].every(
              ({ type, index, cellIds }) => {
                if (cellIds.size !== 2) return false;
                const candidateIds = new Set(
                  techniques
                    ._getUnitCells(type, index)
                    .filter(([r, c]) => pencils[r][c].has(u))
                    .map(([r, c]) => techniques._cellToId(r, c)),
                );
                return (
                  candidateIds.size === cellIds.size &&
                  [...cellIds].every((id) => candidateIds.has(id))
                );
              },
            );
            if (!isRestrictedInAllLoopHouses) continue;

            const type6Removals = extra_cells
              .filter(([r, c]) => pencils[r][c].has(u))
              .map(([r, c]) => ({ r, c, num: u }));
            if (type6Removals.length === 0) continue;

            const uniqueRemovals = _getUniqueRemovals(type6Removals);
            const resultObj = {
              change: true,
              type: "remove",
              cells: uniqueRemovals,
              hint: {
                name: t("teks_msg_121"),
                mainInfo: t("teks_msg_113", baseDigitsStr),
                detail: t("teks_msg_122", detailPrefix, u),
              },
              applyVisuals: getULVisuals(6, cells, digits, uniqueRemovals, {
                restrictedDigit: u,
              }),
            };
            if (!findAll) return resultObj;
            results.push(resultObj);
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  uniquenessExternalTest: (board, pencils, findAll = false) => {
    const results = [];
    const emitted = new Set();
    const cellKey = (r, c) => r + "," + c;
    const cellId = (r, c) => r * 9 + c;
    const idToCell = (id) => [Math.floor(id / 9), id % 9];
    const uniqueCells = (cells) =>
      [...new Set(cells.map(([r, c]) => cellId(r, c)))]
        .sort((a, b) => a - b)
        .map(idToCell);
    const formatBody = (cells) => {
      const rows = [...new Set(cells.map(([r]) => r + 1))].sort(
        (a, b) => a - b,
      );
      const cols = [...new Set(cells.map(([, c]) => c + 1))].sort(
        (a, b) => a - b,
      );
      return "r" + rows.join("") + "c" + cols.join("");
    };
    const formatGuardians = (cells, d1, d2) => {
      const byDigits = new Map();
      uniqueCells(cells).forEach(([r, c]) => {
        let digits = "";
        if (pencils[r][c].has(d1)) digits += d1;
        if (pencils[r][c].has(d2)) digits += d2;
        if (!byDigits.has(digits)) byDigits.set(digits, new Map());
        const byRow = byDigits.get(digits);
        if (!byRow.has(r)) byRow.set(r, []);
        byRow.get(r).push(c + 1);
      });
      return [...byDigits]
        .map(
          ([digits, byRow]) =>
            "(" +
            digits +
            ")" +
            [...byRow]
              .map(([r, cols]) => "r" + (r + 1) + "c" + cols.join(""))
              .join(","),
        )
        .join(",");
    };

    const makeVisuals =
      (body, d1, d2, guardians, removals, extra = {}) =>
      () => {
        highlightedDigit = null;
        highlightState = 0;
        body.forEach(([r, c]) => {
          boardState[r][c].cellColor = cellColorPalette[7];
          [d1, d2].forEach((digit) => {
            if (boardState[r][c].pencils.has(digit)) {
              boardState[r][c].pencilColors.set(
                digit,
                candidateColorPalette[7],
              );
            }
          });
        });
        uniqueCells(guardians).forEach(([r, c]) => {
          boardState[r][c].cellColor = cellColorPalette[6];
          [d1, d2].forEach((digit) => {
            if (boardState[r][c].pencils.has(digit)) {
              boardState[r][c].pencilColors.set(
                digit,
                candidateColorPalette[6],
              );
            }
          });
        });
        (extra.subsetCells || []).forEach(([r, c]) => {
          boardState[r][c].cellColor = cellColorPalette[5];
          (extra.subsetDigits || []).forEach((digit) => {
            if (boardState[r][c].pencils.has(digit)) {
              boardState[r][c].pencilColors.set(
                digit,
                candidateColorPalette[5],
              );
            }
          });
        });
        (extra.wings || []).forEach(([r, c]) => {
          boardState[r][c].cellColor = cellColorPalette[4];
          boardState[r][c].pencils.forEach((digit) =>
            boardState[r][c].pencilColors.set(digit, candidateColorPalette[4]),
          );
        });
        removals.forEach(({ r, c, num }) =>
          boardState[r][c].candSlashes.set(num, markColorPalette[0]),
        );
      };

    const publish = (
      nameKey,
      body,
      d1,
      d2,
      guardians,
      removals,
      detail,
      extra,
    ) => {
      const cells = _getUniqueRemovals(removals);
      if (cells.length === 0) return null;
      const removalKey = cells
        .map(({ r, c, num }) => r + ":" + c + ":" + num)
        .sort()
        .join("|");
      const key =
        nameKey +
        ":" +
        d1 +
        ":" +
        d2 +
        ":" +
        body.map(([r, c]) => cellId(r, c)).join(",") +
        ":" +
        removalKey;
      if (emitted.has(key)) return null;
      emitted.add(key);
      const result = {
        change: true,
        type: "remove",
        cells,
        hint: {
          name: t(nameKey),
          mainInfo: t("teks_msg_204", "" + d1 + d2),
          detail,
        },
        applyVisuals: makeVisuals(body, d1, d2, guardians, cells, extra),
      };
      if (!findAll) return result;
      results.push(result);
      return null;
    };

    const bodies = [];
    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        for (let r1 = 0; r1 < 8; r1++) {
          for (let r2 = r1 + 1; r2 < 9; r2++) {
            const cols = [];
            for (let c = 0; c < 9; c++) {
              if (
                board[r1][c] === 0 &&
                board[r2][c] === 0 &&
                pencils[r1][c].has(d1) &&
                pencils[r1][c].has(d2) &&
                pencils[r2][c].has(d1) &&
                pencils[r2][c].has(d2)
              ) {
                cols.push(c);
              }
            }
            for (const [c1, c2] of techniques.combinations(cols, 2)) {
              const sameBand = Math.floor(r1 / 3) === Math.floor(r2 / 3);
              const sameStack = Math.floor(c1 / 3) === Math.floor(c2 / 3);
              if (sameBand === sameStack) continue;
              bodies.push({
                d1,
                d2,
                cells: [
                  [r1, c1],
                  [r1, c2],
                  [r2, c1],
                  [r2, c2],
                ],
              });
            }
          }
        }
      }
    }

    const unsolved = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) unsolved.push([r, c]);
      }
    }
    const seesEvery = (r, c, cells) =>
      cells.every(([gr, gc]) => techniques._sees([r, c], [gr, gc]));

    for (const { d1, d2, cells: body } of bodies) {
      const bodySet = new Set(body.map(([r, c]) => cellKey(r, c)));
      const families = [
        {
          type: "row",
          indices: [...new Set(body.map(([r]) => r))].sort((a, b) => a - b),
        },
        {
          type: "col",
          indices: [...new Set(body.map(([, c]) => c))].sort((a, b) => a - b),
        },
        {
          type: "box",
          indices: [
            ...new Set(body.map(([r, c]) => techniques._getBoxIndex(r, c))),
          ].sort((a, b) => a - b),
        },
      ];

      for (const family of families) {
        const hasPlacedDeadlyDigit = family.indices.some((index) =>
          techniques
            ._getUnitCells(family.type, index)
            .some(([r, c]) => board[r][c] === d1 || board[r][c] === d2),
        );
        if (hasPlacedDeadlyDigit) continue;

        const allIds = new Set();
        const byDigitIds = new Map([
          [d1, new Set()],
          [d2, new Set()],
        ]);
        const houses = [];
        family.indices.forEach((index) => {
          const local = [];
          techniques._getUnitCells(family.type, index).forEach(([r, c]) => {
            if (board[r][c] !== 0 || bodySet.has(cellKey(r, c))) return;
            const hasD1 = pencils[r][c].has(d1);
            const hasD2 = pencils[r][c].has(d2);
            if (!hasD1 && !hasD2) return;
            const id = cellId(r, c);
            allIds.add(id);
            local.push([r, c]);
            if (hasD1) byDigitIds.get(d1).add(id);
            if (hasD2) byDigitIds.get(d2).add(id);
          });
          houses.push({ index, cells: local });
        });
        if (allIds.size === 0) continue;

        const guardians = [...allIds].sort((a, b) => a - b).map(idToCell);
        const guardianByDigit = new Map(
          [d1, d2].map((digit) => [
            digit,
            [...byDigitIds.get(digit)].sort((a, b) => a - b).map(idToCell),
          ]),
        );
        const detail = t(
          "teks_msg_205",
          "" + d1 + d2,
          formatBody(body),
          formatGuardians(guardians, d1, d2),
        );

        // Type 1: the only external guardian cell must retain d1 or d2.
        if (guardians.length === 1) {
          const [r, c] = guardians[0];
          const removals = [...pencils[r][c]]
            .filter((digit) => digit !== d1 && digit !== d2)
            .map((num) => ({ r, c, num }));
          const result = publish(
            "teks_msg_199",
            body,
            d1,
            d2,
            guardians,
            removals,
            detail,
          );
          if (result) return result;
        }

        // Type 2/4: one deadly digit has no guardians.  A candidate of the
        // other digit that sees every guardian would make them all false.
        for (const [targetDigit, absentDigit] of [
          [d1, d2],
          [d2, d1],
        ]) {
          const targetGuardians = guardianByDigit.get(targetDigit);
          if (
            targetGuardians.length === 0 ||
            guardianByDigit.get(absentDigit).length !== 0
          ) {
            continue;
          }
          const guardianSet = new Set(
            targetGuardians.map(([r, c]) => cellKey(r, c)),
          );
          const removals = [];
          unsolved.forEach(([r, c]) => {
            if (
              !guardianSet.has(cellKey(r, c)) &&
              pencils[r][c].has(targetDigit) &&
              seesEvery(r, c, targetGuardians)
            ) {
              removals.push({ r, c, num: targetDigit });
            }
          });
          const result = publish(
            "teks_msg_200",
            body,
            d1,
            d2,
            targetGuardians,
            removals,
            detail,
          );
          if (result) return result;
        }

        // The cover must fit in one house for the Type 3/3H capacity proof.
        if (guardians.length > 4) continue;
        const carrier = houses.find(({ cells }) => {
          const local = new Set(cells.map(([r, c]) => cellKey(r, c)));
          return guardians.every(([r, c]) => local.has(cellKey(r, c)));
        });
        if (!carrier) continue;

        const houseCells = techniques._getUnitCells(family.type, carrier.index);
        const guardianSet = new Set(guardians.map(([r, c]) => cellKey(r, c)));
        const available = houseCells.filter(
          ([r, c]) =>
            board[r][c] === 0 &&
            !bodySet.has(cellKey(r, c)) &&
            !guardianSet.has(cellKey(r, c)),
        );

        // Type 3: a real naked subset built from guardians and up to three
        // additional cells.  Cardinality is checked directly before removal.
        const maxSelected = Math.min(4 - guardians.length, available.length);
        for (let count = 0; count <= maxSelected; count++) {
          for (const selected of techniques.combinations(available, count)) {
            const subsetCells = [...guardians, ...selected];
            const subsetDigits = new Set();
            subsetCells.forEach(([r, c]) =>
              pencils[r][c].forEach((digit) => subsetDigits.add(digit)),
            );
            if (
              subsetDigits.size < 2 ||
              subsetDigits.size !== subsetCells.length
            ) {
              continue;
            }
            const subsetSet = new Set(
              subsetCells.map(([r, c]) => cellKey(r, c)),
            );
            const removals = [];
            houseCells.forEach(([r, c]) => {
              if (bodySet.has(cellKey(r, c)) || subsetSet.has(cellKey(r, c)))
                return;
              subsetDigits.forEach((num) => {
                if (pencils[r][c].has(num)) removals.push({ r, c, num });
              });
            });
            const result = publish(
              "teks_msg_201",
              body,
              d1,
              d2,
              guardians,
              removals,
              detail,
              { subsetCells, subsetDigits },
            );
            if (result) return result;
          }
        }

        // Type 3H: the dual hidden-subset capacity check.
        for (let count = Math.max(2, guardians.length); count <= 4; count++) {
          for (const digits of techniques.combinations(
            [1, 2, 3, 4, 5, 6, 7, 8, 9],
            count,
          )) {
            const subsetDigits = new Set(digits);
            const positions = houseCells.filter(
              ([r, c]) =>
                board[r][c] === 0 &&
                digits.some((digit) => pencils[r][c].has(digit)),
            );
            if (
              !digits.every((digit) =>
                houseCells.some(
                  ([r, c]) => board[r][c] === 0 && pencils[r][c].has(digit),
                ),
              )
            ) {
              continue;
            }
            if (positions.length !== count) continue;
            const positionSet = new Set(
              positions.map(([r, c]) => cellKey(r, c)),
            );
            if (![...guardianSet].every((key) => positionSet.has(key)))
              continue;
            const removals = [];
            positions.forEach(([r, c]) => {
              pencils[r][c].forEach((num) => {
                if (!subsetDigits.has(num)) removals.push({ r, c, num });
              });
            });
            const result = publish(
              "teks_msg_202",
              body,
              d1,
              d2,
              guardians,
              removals,
              detail,
              { subsetCells: positions, subsetDigits },
            );
            if (result) return result;
          }
        }

        // External XY-Wing: d1/z and d2/z bivalue wings see their guardian
        // groups.  At least one guardian is true, so one wing must be z.
        const guardians1 = guardianByDigit.get(d1);
        const guardians2 = guardianByDigit.get(d2);
        if (guardians1.length === 0 || guardians2.length === 0) continue;
        const bivalue = unsolved.filter(
          ([r, c]) => pencils[r][c].size === 2 && !bodySet.has(cellKey(r, c)),
        );
        for (const wingA of bivalue) {
          const [ar, ac] = wingA;
          if (!pencils[ar][ac].has(d1) || !seesEvery(ar, ac, guardians1))
            continue;
          const z = [...pencils[ar][ac]].find((digit) => digit !== d1);
          if (z === d2) continue;
          for (const wingB of bivalue) {
            const [br, bc] = wingB;
            if (
              (ar === br && ac === bc) ||
              !pencils[br][bc].has(d2) ||
              !pencils[br][bc].has(z) ||
              !seesEvery(br, bc, guardians2)
            ) {
              continue;
            }
            const removals = [];
            unsolved.forEach(([r, c]) => {
              if (
                (r === ar && c === ac) ||
                (r === br && c === bc) ||
                !pencils[r][c].has(z)
              ) {
                return;
              }
              if (
                techniques._sees([r, c], wingA) &&
                techniques._sees([r, c], wingB)
              ) {
                removals.push({ r, c, num: z });
              }
            });
            const result = publish(
              "teks_msg_203",
              body,
              d1,
              d2,
              guardians,
              removals,
              detail,
              { wings: [wingA, wingB] },
            );
            if (result) return result;
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  // --- Unified Helper for Almost Locked Pair & Triple ---
  _almostLockedSets: (board, pencils, size, findAll = false) => {
    const results = [];
    const numBaseCells = size - 1;

    // --- Format Helpers for Hints ---
    const formatRC = (cells) => {
      if (!cells || cells.length === 0) return "";
      const norm = cells.map((c) => [
        c.r !== undefined ? c.r : c[0],
        c.c !== undefined ? c.c : c[1],
      ]);
      if (norm.length === 1) return `r${norm[0][0] + 1}c${norm[0][1] + 1}`;
      if (norm.every((c) => c[0] === norm[0][0])) {
        return `r${norm[0][0] + 1}c${norm
          .map((c) => c[1] + 1)
          .sort()
          .join("")}`;
      }
      if (norm.every((c) => c[1] === norm[0][1])) {
        return `r${norm
          .map((c) => c[0] + 1)
          .sort()
          .join("")}c${norm[0][1] + 1}`;
      }
      return norm.map((c) => `r${c[0] + 1}c${c[1] + 1}`).join(",");
    };

    const formatBP = (cells, boxIdx) => {
      if (!cells || cells.length === 0) return "";
      const norm = cells.map((c) => [
        c.r !== undefined ? c.r : c[0],
        c.c !== undefined ? c.c : c[1],
      ]);
      const points = norm
        .map((c) => (c[0] % 3) * 3 + (c[1] % 3) + 1)
        .sort((a, b) => a - b)
        .join("");
      return `b${boxIdx + 1}p${points}`;
    };

    // Helper: Remove all candidates EXCEPT those in V from a list of cells
    const cleanExtraCells = (cellsToClean, V) => {
      const removals = [];
      for (const { r, c } of cellsToClean) {
        for (const cand of pencils[r][c]) {
          if (!V.has(cand)) {
            removals.push({ r, c, num: cand });
          }
        }
      }
      return removals;
    };

    // Helper: Remove candidates in V from a list of cells, ignoring specific cells
    const removeCandidates = (cellsToRemove, V, ignoreSet) => {
      const removals = [];
      for (const [r, c] of cellsToRemove) {
        if (ignoreSet.has(`${r},${c}`)) continue;
        for (const v of V) {
          if (pencils[r][c].has(v)) {
            removals.push({ r, c, num: v });
          }
        }
      }
      return removals;
    };

    // Iterate 6 Chutes: 0-2 (Rows), 3-5 (Cols)
    for (let chute = 0; chute < 6; chute++) {
      const isRow = chute < 3;
      const bandIdx = chute % 3;
      const chuteLines = [bandIdx * 3, bandIdx * 3 + 1, bandIdx * 3 + 2];
      const chuteBoxes = [];
      for (let i = 0; i < 3; i++) {
        chuteBoxes.push(isRow ? bandIdx * 3 + i : i * 3 + bandIdx);
      }

      // Merge Line-to-Box and Box-to-Line using a boolean
      for (const isLineToBox of [true, false]) {
        const baseUnits = isLineToBox ? chuteLines : chuteBoxes;
        const targetUnits = isLineToBox ? chuteBoxes : chuteLines;
        const baseType = isLineToBox ? (isRow ? "row" : "col") : "box";
        const targetType = isLineToBox ? "box" : isRow ? "row" : "col";

        for (const baseIdx of baseUnits) {
          const baseCellsAll = techniques._getUnitCells(baseType, baseIdx);
          const emptyBaseCells = baseCellsAll.filter(
            ([r, c]) => board[r][c] === 0,
          );

          // Need exactly size-1 base cells to form the pattern
          if (emptyBaseCells.length < numBaseCells) continue;

          // Select combinations from base unit
          for (const baseCells of techniques.combinations(
            emptyBaseCells,
            numBaseCells,
          )) {
            const V = new Set();
            baseCells.forEach(([r, c]) => {
              for (const v of pencils[r][c]) V.add(v);
            });

            // Condition: Candidates union is exactly 'size'
            if (V.size !== size) continue;

            const baseTargetIndices = new Set();
            baseCells.forEach(([r, c]) => {
              if (targetType === "box")
                baseTargetIndices.add(techniques._getBoxIndex(r, c));
              else baseTargetIndices.add(isRow ? r : c);
            });

            for (const targetIdx of targetUnits) {
              if (baseTargetIndices.has(targetIdx)) continue; // Skip if any base cell is in the target unit

              const targetCells = techniques._getUnitCells(
                targetType,
                targetIdx,
              );

              // Refinement: Target unit must not contain concrete digits from V
              let hasConcrete = false;
              for (const [tr, tc] of targetCells) {
                if (V.has(board[tr][tc])) {
                  hasConcrete = true;
                  break;
                }
              }
              if (hasConcrete) continue;

              const inIntersection = [];
              const outsideIntersection = [];

              for (const [tr, tc] of targetCells) {
                if (board[tr][tc] !== 0) continue;

                let hasV = false;
                for (const v of V) {
                  if (pencils[tr][tc].has(v)) {
                    hasV = true;
                    break;
                  }
                }
                if (!hasV) continue;

                let isIntersect = false;
                if (baseType === "box") {
                  isIntersect = techniques._getBoxIndex(tr, tc) === baseIdx;
                } else {
                  isIntersect = (isRow ? tr : tc) === baseIdx;
                }

                if (isIntersect) {
                  inIntersection.push({ r: tr, c: tc });
                } else {
                  outsideIntersection.push({ r: tr, c: tc });
                }
              }

              // Condition: Candidates appear in intersection, AND exactly size-1 cells outside intersection.
              if (
                inIntersection.length > 0 &&
                outsideIntersection.length === numBaseCells
              ) {
                const elims = [];

                // Elimination 1: Remove OTHER candidates from the extra cells outside the intersection
                elims.push(...cleanExtraCells(outsideIntersection, V));

                // Elimination 2: Remove V candidates from the Base Unit
                // (excluding the base cells themselves and the target unit intersection)
                const ignoreSet = new Set();
                baseCells.forEach(([r, c]) => ignoreSet.add(`${r},${c}`));
                inIntersection.forEach(({ r, c }) =>
                  ignoreSet.add(`${r},${c}`),
                );

                elims.push(...removeCandidates(emptyBaseCells, V, ignoreSet));

                if (elims.length > 0) {
                  const uniqueElims = [];
                  const seen = new Set();
                  for (let i = 0; i < elims.length; i++) {
                    const el = elims[i];
                    // Create a unique 12-bit integer key for r, c, num
                    const key = (el.r << 8) | (el.c << 4) | el.num;
                    if (!seen.has(key)) {
                      seen.add(key);
                      uniqueElims.push(el);
                    }
                  }

                  const digitsStr = Array.from(V)
                    .sort((a, b) => a - b)
                    .join("");
                  const alsStr =
                    baseType === "box"
                      ? formatBP(baseCells, baseIdx)
                      : formatRC(baseCells);
                  const intStr = formatRC(inIntersection);
                  const outStr =
                    targetType === "box"
                      ? formatBP(outsideIntersection, targetIdx)
                      : formatRC(outsideIntersection);

                  const techName =
                    size === 2 ? t("teks_msg_123") : t("teks_msg_124");
                  const mainInfo = t(
                    "teks_msg_125",
                    isRow ? t("teks_msg_14") : t("teks_msg_15"),
                    isLineToBox ? baseIdx + 1 : targetIdx + 1,
                    isLineToBox ? targetIdx + 1 : baseIdx + 1,
                  );

                  const resultObj = {
                    change: true,
                    type: "remove",
                    cells: uniqueElims,
                    hint: {
                      name: techName,
                      mainInfo: mainInfo,
                      detail: t(
                        "teks_msg_126",
                        digitsStr,
                        alsStr,
                        intStr,
                        outStr,
                      ),
                    },
                    applyVisuals: () => {
                      highlightedDigit = null;
                      highlightState = 0;
                      const digits = [...V];

                      baseCells.forEach(([cr, cc]) => {
                        window.addCellColor(cr, cc, cellColorPalette[6]);
                        digits.forEach((d) => {
                          if (boardState[cr][cc].pencils.has(d))
                            boardState[cr][cc].pencilColors.set(
                              d,
                              candidateColorPalette[4],
                            );
                        });
                      });

                      inIntersection.forEach(({ r: cr, c: cc }) => {
                        window.addCellColor(cr, cc, cellColorPalette[6]);
                        window.addCellColor(cr, cc, cellColorPalette[7]);
                        digits.forEach((d) => {
                          if (boardState[cr][cc].pencils.has(d))
                            boardState[cr][cc].pencilColors.set(
                              d,
                              candidateColorPalette[4],
                            );
                        });
                      });

                      outsideIntersection.forEach(({ r: cr, c: cc }) => {
                        window.addCellColor(cr, cc, cellColorPalette[7]);
                        digits.forEach((d) => {
                          if (boardState[cr][cc].pencils.has(d))
                            boardState[cr][cc].pencilColors.set(
                              d,
                              candidateColorPalette[4],
                            );
                        });
                      });

                      uniqueElims.forEach((el) =>
                        boardState[el.r][el.c].candSlashes.set(
                          el.num,
                          markColorPalette[0],
                        ),
                      );
                    },
                  };
                  if (!findAll) return resultObj;
                  results.push(resultObj);
                }
              }
            }
          }
        }
      }
    }

    return findAll ? results : { change: false };
  },

  almostLockedPair: (board, pencils, findAll = false) => {
    return techniques._almostLockedSets(board, pencils, 2, findAll);
  },

  almostLockedTriple: (board, pencils, findAll = false) => {
    return techniques._almostLockedSets(board, pencils, 3, findAll);
  },

  sueDeCoq: (board, pencils, findAll = false) => {
    const results = [];
    const bitFor = (d) => 1 << (d - 1);
    const maskFromSet = (s) => {
      let m = 0;
      for (const v of s) m |= bitFor(v);
      return m;
    };
    const bitCount = (m) => {
      let cnt = 0;
      while (m) {
        m &= m - 1;
        cnt++;
      }
      return cnt;
    };

    const combinations = (arr, k) => {
      const res = [];
      const comb = Array(k);
      const dfs = (start, depth) => {
        if (depth === k) {
          res.push(comb.slice());
          return;
        }
        for (let i = start; i <= arr.length - (k - depth); i++) {
          comb[depth] = arr[i];
          dfs(i + 1, depth + 1);
        }
      };
      if (k <= arr.length) dfs(0, 0);
      return res;
    };

    // Modified to track 'extra' candidates and allow up to maxExtra (2 for AALS)
    const findAlses = (cells, minSize = 1, maxSize = 8, maxExtra = 2) => {
      const alses = [];
      if (!cells || !cells.length) return alses;
      for (let size = minSize; size <= cells.length; size++) {
        if (size > maxSize) continue;
        for (const combo of combinations(cells, size)) {
          let unionMask = 0;
          for (const [r, c] of combo) unionMask |= maskFromSet(pencils[r][c]);
          const extra = bitCount(unionMask) - size;

          // extra === 1 is ALS, extra === 2 is AALS
          if (extra >= 1 && extra <= maxExtra) {
            const posSet = new Set(combo.map(([r, c]) => `${r},${c}`));
            alses.push({ positions: posSet, mask: unionMask, extra });
          }
        }
      }
      return alses;
    };

    // --- String Formatting Helpers for Hint Detail ---
    const maskToDigitsStr = (mask) => {
      let str = "";
      for (let d = 1; d <= 9; d++) {
        if (mask & bitFor(d)) str += d;
      }
      return str;
    };

    const parsePosSet = (posSet) => {
      return Array.from(posSet).map((str) => {
        const parts = str.split(",");
        return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
      });
    };

    const formatRC = (cells) => {
      if (!cells || cells.length === 0) return "";
      // Check if they all share the same row
      if (cells.every((c) => c[0] === cells[0][0])) {
        const cols = cells
          .map((c) => c[1] + 1)
          .sort()
          .join("");
        return `r${cells[0][0] + 1}c${cols}`;
      }
      // Check if they all share the same col
      if (cells.every((c) => c[1] === cells[0][1])) {
        const rows = cells
          .map((c) => c[0] + 1)
          .sort()
          .join("");
        return `r${rows}c${cells[0][1] + 1}`;
      }
      // Fallback if they are disjoint (shouldn't happen for valid SdC lines, but safe to have)
      return cells.map((c) => `r${c[0] + 1}c${c[1] + 1}`).join(",");
    };

    const formatBP = (cells, boxNum) => {
      if (!cells || cells.length === 0) return "";
      const points = cells
        .map((c) => (c[0] % 3) * 3 + (c[1] % 3) + 1)
        .sort((a, b) => a - b)
        .join("");
      return `b${boxNum}p${points}`;
    };

    const recordRemovalsFromMask = (elimArr, cellList, positionsSet, mask) => {
      for (const [r, c] of cellList) {
        if (positionsSet.has(`${r},${c}`)) continue;
        for (let d = 1; d <= 9; d++) {
          const bit = bitFor(d);
          if ((mask & bit) !== 0 && pencils[r][c].has(d)) {
            elimArr.push({ r, c, num: d });
          }
        }
      }
    };

    // ---------- Main loop ----------
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3;
      const bc = (b % 3) * 3;
      const boxNum = b + 1; // Simplifies mathematical box calculation

      for (let i = 0; i < 3; i++) {
        // Run once for Row (true), once for Col (false)
        for (const isRow of [true, false]) {
          const lineIdx = isRow ? br + i : bc + i;

          const C_full = [];
          for (let j = 0; j < 3; j++) {
            const rr = isRow ? lineIdx : br + j;
            const cc = isRow ? bc + j : lineIdx;
            if (board[rr][cc] === 0) C_full.push([rr, cc]);
          }
          if (C_full.length < 2) continue;

          // All empty cells in the line and box
          const allLineCells = [];
          for (let idx = 0; idx < 9; idx++) {
            const rr = isRow ? lineIdx : idx;
            const cc = isRow ? idx : lineIdx;
            if (board[rr][cc] === 0) allLineCells.push([rr, cc]);
          }

          const allBoxCells = [];
          for (let rr = br; rr < br + 3; rr++) {
            for (let cc = bc; cc < bc + 3; cc++) {
              if (board[rr][cc] === 0) allBoxCells.push([rr, cc]);
            }
          }

          // --- Try all 2+ cell combinations of intersection C ---
          for (let k = 2; k <= C_full.length; k++) {
            for (const C of combinations(C_full, k)) {
              const usedC = new Set(C.map(([r, c]) => `${r},${c}`));

              // Build pools excluding used C
              const line_pool = allLineCells.filter(
                ([r, c]) => !usedC.has(`${r},${c}`),
              );
              const box_pool = allBoxCells.filter(
                ([r, c]) => !usedC.has(`${r},${c}`),
              );

              let V_mask = 0;
              for (const [r, c] of C) V_mask |= maskFromSet(pencils[r][c]);
              if (bitCount(V_mask) < C.length + 2) continue;

              // maxExtra = 2 allows standard ALSes and AALSes
              const line_alses = findAlses(line_pool, 1, 8, 2);
              const box_alses = findAlses(box_pool, 1, 8, 2);
              if (!line_alses.length || !box_alses.length) continue;

              for (const A of line_alses) {
                for (const B of box_alses) {
                  // If we only want to allow at most ONE AALS, the sum of extra candidates cannot exceed 3.
                  // (1+1 = 2 -> Standard SdC | 1+2 / 2+1 = 3 -> SdC with one AALS)
                  const totalExtra = A.extra + B.extra;
                  if (totalExtra > 3) continue;

                  // Disjointness check
                  let overlap = false;
                  for (const p of A.positions) {
                    if (B.positions.has(p)) {
                      overlap = true;
                      break;
                    }
                  }
                  if (overlap) continue;

                  const D_mask = A.mask;
                  const E_mask = B.mask;
                  const remaining_V = V_mask & ~(D_mask | E_mask);
                  const overlapMask = D_mask & E_mask;

                  // dynamically checking against C.length - totalExtra
                  // (evaluates to C.length - 2 for standard, C.length - 3 for AALS)
                  if (bitCount(remaining_V) === C.length - totalExtra) {
                    const eliminations = [];
                    recordRemovalsFromMask(
                      eliminations,
                      line_pool,
                      A.positions,
                      D_mask,
                    );
                    recordRemovalsFromMask(
                      eliminations,
                      box_pool,
                      B.positions,
                      E_mask,
                    );
                    if (remaining_V > 0) {
                      recordRemovalsFromMask(
                        eliminations,
                        line_pool,
                        A.positions,
                        remaining_V,
                      );
                      recordRemovalsFromMask(
                        eliminations,
                        box_pool,
                        new Set(),
                        remaining_V,
                      );
                    }
                    if (overlapMask > 0) {
                      recordRemovalsFromMask(
                        eliminations,
                        C_full,
                        B.positions,
                        overlapMask,
                      );
                    }
                    if (eliminations.length > 0) {
                      const hintName = t("teks_msg_127");
                      const lineName = isRow
                        ? t("teks_msg_14")
                        : t("teks_msg_15");

                      // Build Hint Detail
                      const aCells = parsePosSet(A.positions);
                      const bCells = parsePosSet(B.positions);

                      const strA = formatRC(aCells);
                      const strB = formatBP(bCells, boxNum);
                      const strC = formatRC(C);

                      const totalMask = A.mask | B.mask | V_mask;
                      const strDigits = maskToDigitsStr(totalMask);

                      let detailStr = t(
                        "teks_msg_130",
                        strC,
                        strA,
                        strB,
                        strDigits,
                      );

                      if (overlapMask > 0) {
                        detailStr += t(
                          "teks_msg_131",
                          maskToDigitsStr(overlapMask),
                        );
                      }

                      const resultObj = {
                        change: true,
                        type: "remove",
                        cells: eliminations,
                        hint: {
                          name: hintName,
                          mainInfo: t(
                            "teks_msg_132",
                            lineName,
                            lineIdx + 1,
                            boxNum,
                          ),
                          detail: detailStr,
                        },
                        applyVisuals: () => {
                          highlightedDigit = null;
                          highlightState = 0;

                          // 1. Color pattern cells using multi-coloring
                          // Line cells (Intersection + Off-intersection line)
                          C.forEach(([r, c]) =>
                            window.addCellColor(r, c, cellColorPalette[7]),
                          );
                          aCells.forEach(([r, c]) =>
                            window.addCellColor(r, c, cellColorPalette[7]),
                          );

                          // Box cells (Intersection + Off-intersection box)
                          C.forEach(([r, c]) =>
                            window.addCellColor(r, c, cellColorPalette[6]),
                          );
                          bCells.forEach(([r, c]) =>
                            window.addCellColor(r, c, cellColorPalette[6]),
                          );

                          // 2. Identify candidate digit subsets
                          const lineOnlyMask = A.mask & ~overlapMask;
                          const boxOnlyMask = B.mask & ~overlapMask;
                          const intOnlyMask = V_mask & ~(A.mask | B.mask);

                          const overlapDigits =
                            techniques._bits.maskToDigits(overlapMask);
                          const lineOnlyDigits =
                            techniques._bits.maskToDigits(lineOnlyMask);
                          const boxOnlyDigits =
                            techniques._bits.maskToDigits(boxOnlyMask);
                          const intOnlyDigits =
                            techniques._bits.maskToDigits(intOnlyMask);

                          const allPatternCells = [...C, ...aCells, ...bCells];

                          const colorCellCands = (
                            cells,
                            digits,
                            colorIndex,
                          ) => {
                            cells.forEach(([r, c]) => {
                              digits.forEach((d) => {
                                if (boardState[r][c].pencils.has(d)) {
                                  boardState[r][c].pencilColors.set(
                                    d,
                                    candidateColorPalette[colorIndex],
                                  );
                                }
                              });
                            });
                          };

                          // 3. Color candidates within pattern
                          // Both line and box off-intersection (Candidate Color 3)
                          colorCellCands(allPatternCells, overlapDigits, 2);
                          // Only in line off-intersection (Candidate Color 7)
                          colorCellCands(allPatternCells, lineOnlyDigits, 6);
                          // Only in box off-intersection (Candidate Color 5)
                          colorCellCands(allPatternCells, boxOnlyDigits, 4);
                          // Only in intersection (Candidate Color 6)
                          colorCellCands(allPatternCells, intOnlyDigits, 5);

                          // 4. Color Eliminations (Candidate Color 1)
                          eliminations.forEach((el) =>
                            boardState[el.r][el.c].candSlashes.set(
                              el.num,
                              markColorPalette[0],
                            ),
                          );
                        },
                      };
                      if (!findAll) return resultObj;
                      results.push(resultObj);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return findAll ? results : { change: false };
  },

  firework: (board, pencils, findAll = false) => {
    const resTriple = techniques.fireworkTriple(board, pencils, findAll);
    if (findAll) {
      const resQuad = techniques.fireworkQuadruple(board, pencils, true);
      return resTriple.concat(resQuad);
    } else {
      if (resTriple.change) return resTriple;
      return techniques.fireworkQuadruple(board, pencils, false);
    }
  },

  fireworkQuadruple: (board, pencils, findAll = false) => {
    const results = [];
    const bitFor = (d) => 1 << (d - 1);
    const maskFromSet = (s) => {
      let m = 0;
      for (const v of s) m |= bitFor(v);
      return m;
    };
    const bitCount = (m) => {
      let c = 0;
      while (m) {
        m &= m - 1;
        c++;
      }
      return c;
    };
    const maskToDigits = (mask) => {
      const out = [];
      for (let d = 1; d <= 9; d++) if (mask & bitFor(d)) out.push(d);
      return out;
    };
    const boxIndex = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

    const eliminations = [];

    const restrictMask = (r, c, mask) => {
      const before = maskFromSet(pencils[r][c]);
      const after = before & mask;
      if (after !== before) {
        for (let d = 1; d <= 9; d++) {
          const bit = bitFor(d);
          if (before & bit && !(after & bit))
            eliminations.push({ r, c, num: d });
        }
      }
    };

    const removeMask = (r, c, mask) => {
      const before = maskFromSet(pencils[r][c]);
      const after = before & ~mask;
      if (after !== before && before & mask) {
        for (let d = 1; d <= 9; d++) {
          const bit = bitFor(d);
          if (mask & bit && before & bit) eliminations.push({ r, c, num: d });
        }
      }
    };

    const getFireworkDigits = (c1, c2, pivot) => {
      const pivotBox = boxIndex(pivot[0], pivot[1]);
      const excluded1 = [];
      const isRow = c1[0] === pivot[0];
      if (isRow) {
        for (let c = 0; c < 9; c++) {
          if (boxIndex(pivot[0], c) !== pivotBox && c !== c1[1])
            excluded1.push([pivot[0], c]);
        }
      } else {
        for (let r = 0; r < 9; r++) {
          if (boxIndex(r, pivot[1]) !== pivotBox && r !== c1[0])
            excluded1.push([r, pivot[1]]);
        }
      }

      const excluded2 = [];
      const isRow2 = c2[0] === pivot[0];
      if (isRow2) {
        for (let c = 0; c < 9; c++) {
          if (boxIndex(pivot[0], c) !== pivotBox && c !== c2[1])
            excluded2.push([pivot[0], c]);
        }
      } else {
        for (let r = 0; r < 9; r++) {
          if (boxIndex(r, pivot[1]) !== pivotBox && r !== c2[0])
            excluded2.push([r, pivot[1]]);
        }
      }

      let finalMask = 0;
      let availableMask =
        maskFromSet(pencils[c1[0]][c1[1]]) |
        maskFromSet(pencils[c2[0]][c2[1]]) |
        maskFromSet(pencils[pivot[0]][pivot[1]]);
      for (let d = 1; d <= 9; d++) {
        if ((availableMask & bitFor(d)) === 0) continue;

        let ok = true;
        for (const [r, c] of excluded1) {
          if (
            board[r][c] === d ||
            (board[r][c] === 0 && pencils[r][c].has(d))
          ) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        for (const [r, c] of excluded2) {
          if (
            board[r][c] === d ||
            (board[r][c] === 0 && pencils[r][c].has(d))
          ) {
            ok = false;
            break;
          }
        }
        if (ok) {
          finalMask |= bitFor(d);
        }
      }
      return finalMask;
    };

    for (let r1 = 0; r1 < 9; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        if (Math.floor(r1 / 3) === Math.floor(r2 / 3)) continue;
        for (let c1 = 0; c1 < 9; c1++) {
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            if (Math.floor(c1 / 3) === Math.floor(c2 / 3)) continue;

            if (
              board[r1][c1] !== 0 ||
              board[r1][c2] !== 0 ||
              board[r2][c1] !== 0 ||
              board[r2][c2] !== 0
            )
              continue;

            const map = [
              [r1, c1],
              [r1, c2],
              [r2, c1],
              [r2, c2],
            ];
            let unionMask = 0;
            for (const [r, c] of map) unionMask |= maskFromSet(pencils[r][c]);

            if (bitCount(unionMask) < 4) continue;

            const allDigits = maskToDigits(unionMask);
            for (const digits of techniques.combinations(allDigits, 4)) {
              const cases = [
                [
                  [digits[0], digits[1]],
                  [digits[2], digits[3]],
                ],
                [
                  [digits[0], digits[2]],
                  [digits[1], digits[3]],
                ],
                [
                  [digits[0], digits[3]],
                  [digits[1], digits[2]],
                ],
                [
                  [digits[1], digits[2]],
                  [digits[0], digits[3]],
                ],
                [
                  [digits[1], digits[3]],
                  [digits[0], digits[2]],
                ],
                [
                  [digits[2], digits[3]],
                  [digits[0], digits[1]],
                ],
              ];

              const pivotPairs = [
                [map[0], map[3]],
                [map[1], map[2]],
              ];

              for (const [pivot1, pivot2] of pivotPairs) {
                const other1 = pivot1 === map[0] ? map[1] : map[0];
                const other2 = pivot1 === map[0] ? map[2] : map[3];

                for (const [[d1, d2], [d3, d4]] of cases) {
                  const pair1Mask = bitFor(d1) | bitFor(d2);
                  const pair2Mask = bitFor(d3) | bitFor(d4);

                  const satisfied1 = getFireworkDigits(other1, other2, pivot1);
                  const satisfied2 = getFireworkDigits(other1, other2, pivot2);

                  if (
                    (satisfied1 & pair1Mask) !== pair1Mask ||
                    (satisfied2 & pair2Mask) !== pair2Mask
                  ) {
                    continue;
                  }

                  eliminations.length = 0;
                  const fourDigitsMask = pair1Mask | pair2Mask;

                  restrictMask(pivot1[0], pivot1[1], pair1Mask);
                  restrictMask(pivot2[0], pivot2[1], pair2Mask);
                  restrictMask(other1[0], other1[1], fourDigitsMask);
                  restrictMask(other2[0], other2[1], fourDigitsMask);

                  const p1BlockR = Math.floor(pivot1[0] / 3) * 3;
                  const p1BlockC = Math.floor(pivot1[1] / 3) * 3;
                  for (let r = p1BlockR; r < p1BlockR + 3; r++) {
                    for (let c = p1BlockC; c < p1BlockC + 3; c++) {
                      if (
                        r !== pivot1[0] &&
                        c !== pivot1[1] &&
                        board[r][c] === 0
                      ) {
                        removeMask(r, c, pair1Mask);
                      }
                    }
                  }

                  const p2BlockR = Math.floor(pivot2[0] / 3) * 3;
                  const p2BlockC = Math.floor(pivot2[1] / 3) * 3;
                  for (let r = p2BlockR; r < p2BlockR + 3; r++) {
                    for (let c = p2BlockC; c < p2BlockC + 3; c++) {
                      if (
                        r !== pivot2[0] &&
                        c !== pivot2[1] &&
                        board[r][c] === 0
                      ) {
                        removeMask(r, c, pair2Mask);
                      }
                    }
                  }

                  if (eliminations.length > 0) {
                    const res = {
                      change: true,
                      type: "remove",
                      cells: [...eliminations],
                      hint: {
                        name: t("teks_msg_133_2"),
                        mainInfo: t(
                          "teks_msg_134_2",
                          maskToDigits(pair1Mask).join(""),
                          maskToDigits(pair2Mask).join(""),
                        ),
                        detail: t(
                          "teks_msg_135_2",
                          maskToDigits(pair1Mask).join(""),
                          pivot1[0] + 1,
                          pivot1[1] + 1,
                          boxIndex(pivot1[0], pivot1[1]) + 1,
                          maskToDigits(pair2Mask).join(""),
                          pivot2[0] + 1,
                          pivot2[1] + 1,
                          boxIndex(pivot2[0], pivot2[1]) + 1,
                        ),
                      },
                      applyVisuals: () => {
                        highlightedDigit = null;
                        highlightState = 0;

                        const paintCand = (r, c, mask, color) => {
                          let hasPairCandidate = false;
                          for (let d = 1; d <= 9; d++) {
                            if (
                              mask & bitFor(d) &&
                              boardState[r][c].pencils.has(d)
                            ) {
                              hasPairCandidate = true;
                              boardState[r][c].pencilColors.set(d, color);
                            }
                          }
                          return hasPairCandidate;
                        };

                        const paintPairLines = (pivot, mask, colorIndex) => {
                          for (let r = 0; r < 9; r++) {
                            for (let c = 0; c < 9; c++) {
                              if (r !== pivot[0] && c !== pivot[1]) continue;
                              if (
                                paintCand(
                                  r,
                                  c,
                                  mask,
                                  candidateColorPalette[colorIndex],
                                )
                              ) {
                                window.addCellColor(
                                  r,
                                  c,
                                  cellColorPalette[colorIndex],
                                );
                              }
                            }
                          }
                        };

                        // Highlight every occurrence of each pair along the
                        // row and column of its Firework pivot. Shared cells
                        // retain both colors.
                        paintPairLines(pivot1, pair1Mask, 5);
                        paintPairLines(pivot2, pair2Mask, 6);

                        res.cells.forEach((el) => {
                          boardState[el.r][el.c].candSlashes.set(
                            el.num,
                            markColorPalette[0],
                          );
                        });
                      },
                    };
                    if (!findAll) return res;
                    results.push(res);
                  }
                }
              }
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  fireworkTriple: (board, pencils, findAll = false) => {
    const results = [];
    const bitFor = (d) => 1 << (d - 1);
    const maskFromSet = (s) => {
      let m = 0;
      for (const v of s) m |= bitFor(v);
      return m;
    };
    const bitCount = (m) => {
      let c = 0;
      while (m) {
        m &= m - 1;
        c++;
      }
      return c;
    };
    const maskToDigits = (mask) => {
      const out = [];
      for (let d = 1; d <= 9; d++) if (mask & bitFor(d)) out.push(d);
      return out;
    };
    const boxIndex = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const boxStart = (b) => [Math.floor(b / 3) * 3, (b % 3) * 3];

    const eliminations = [];

    // Helper: record elimination
    const restrictMask = (r, c, mask) => {
      const before = maskFromSet(pencils[r][c]);
      const after = before & mask;
      if (after !== before) {
        for (let d = 1; d <= 9; d++) {
          const bit = bitFor(d);
          if (before & bit && !(after & bit))
            eliminations.push({ r, c, num: d });
        }
      }
    };

    const removeMask = (r, c, mask) => {
      const before = maskFromSet(pencils[r][c]);
      const after = before & ~mask;
      if (after !== before && before & mask) {
        for (let d = 1; d <= 9; d++) {
          const bit = bitFor(d);
          if (mask & bit && before & bit) eliminations.push({ r, c, num: d });
        }
      }
    };
    for (let rIdx = 0; rIdx < 9; rIdx++) {
      const rowCells = [];
      for (let c = 0; c < 9; c++)
        if (board[rIdx][c] === 0) rowCells.push([rIdx, c]);
      if (rowCells.length < 4) continue;

      const boxesInRow = Array.from({ length: 9 }, () => []);
      for (const [r, c] of rowCells) boxesInRow[boxIndex(r, c)].push([r, c]);

      for (let boxIdx = 0; boxIdx < 9; boxIdx++) {
        const boxCells = boxesInRow[boxIdx];
        if (boxCells.length < 3) continue;

        const extraRowCells = rowCells.filter(
          ([r, c]) => !boxCells.some(([br, bc]) => br === r && bc === c),
        );
        if (extraRowCells.length === 0) continue;

        const bsz = boxCells.length;
        for (let i = 0; i < bsz; i++)
          for (let j = i + 1; j < bsz; j++)
            for (let k = j + 1; k < bsz; k++) {
              const boxTrip = [boxCells[i], boxCells[j], boxCells[k]];
              for (const rowExtra of extraRowCells) {
                const rowAhsCells = [...boxTrip, rowExtra];

                let unionMask = 0;
                for (const [r, c] of rowAhsCells)
                  unionMask |= maskFromSet(pencils[r][c]);
                if (bitCount(unionMask) < 3) continue;

                const digits = maskToDigits(unionMask);
                if (digits.length < 3) continue;

                for (let a = 0; a < digits.length; a++)
                  for (let b = a + 1; b < digits.length; b++)
                    for (let c = b + 1; c < digits.length; c++) {
                      const candMask =
                        bitFor(digits[a]) |
                        bitFor(digits[b]) |
                        bitFor(digits[c]);

                      // Row AHS check
                      let isRowAhs = true;
                      for (const [r, c] of rowCells) {
                        const inAhs = rowAhsCells.some(
                          ([rr, cc]) => rr === r && cc === c,
                        );
                        if (!inAhs && maskFromSet(pencils[r][c]) & candMask) {
                          isRowAhs = false;
                          break;
                        }
                      }
                      if (!isRowAhs) continue;

                      for (let bit = candMask; bit; bit &= bit - 1) {
                        const vbit = bit & -bit;
                        const found = rowAhsCells.some(
                          ([r, c]) => maskFromSet(pencils[r][c]) & vbit,
                        );
                        if (!found) {
                          isRowAhs = false;
                          break;
                        }
                      }
                      if (!isRowAhs) continue;

                      for (const [r, c] of rowAhsCells)
                        if ((maskFromSet(pencils[r][c]) & candMask) === 0) {
                          isRowAhs = false;
                          break;
                        }
                      if (!isRowAhs) continue;

                      const extraRowCol = rowExtra[1];
                      const boxColStart = (boxIdx % 3) * 3;
                      for (
                        let cIdx = boxColStart;
                        cIdx < boxColStart + 3;
                        cIdx++
                      ) {
                        const colCells = [];
                        for (let rr = 0; rr < 9; rr++)
                          if (board[rr][cIdx] === 0) colCells.push([rr, cIdx]);
                        if (colCells.length < 4) continue;

                        const boxColInt = colCells.filter(
                          ([rr, cc]) => boxIndex(rr, cc) === boxIdx,
                        );
                        if (boxColInt.length < 3) continue;

                        const extraColCells = colCells.filter(
                          ([rr, cc]) =>
                            !boxColInt.some(
                              ([br, bc]) => br === rr && bc === cc,
                            ),
                        );
                        if (!extraColCells.length) continue;

                        for (let ii = 0; ii < boxColInt.length; ii++)
                          for (let jj = ii + 1; jj < boxColInt.length; jj++)
                            for (let kk = jj + 1; kk < boxColInt.length; kk++) {
                              const colTrip = [
                                boxColInt[ii],
                                boxColInt[jj],
                                boxColInt[kk],
                              ];
                              for (const colExtra of extraColCells) {
                                const colAhsCells = [...colTrip, colExtra];

                                let isColAhs = true;
                                for (const [r, c] of colCells) {
                                  const inAhs = colAhsCells.some(
                                    ([rr, cc]) => rr === r && cc === c,
                                  );
                                  if (
                                    !inAhs &&
                                    maskFromSet(pencils[r][c]) & candMask
                                  ) {
                                    isColAhs = false;
                                    break;
                                  }
                                }
                                if (!isColAhs) continue;

                                for (let bit = candMask; bit; bit &= bit - 1) {
                                  const vbit = bit & -bit;
                                  const found = colAhsCells.some(
                                    ([r, c]) =>
                                      maskFromSet(pencils[r][c]) & vbit,
                                  );
                                  if (!found) {
                                    isColAhs = false;
                                    break;
                                  }
                                }
                                if (!isColAhs) continue;

                                for (const [r, c] of colAhsCells)
                                  if (
                                    (maskFromSet(pencils[r][c]) & candMask) ===
                                    0
                                  ) {
                                    isColAhs = false;
                                    break;
                                  }
                                if (!isColAhs) continue;

                                // Found row & col AHS match: Firework pattern
                                const [extraRowR, extraRowC] = rowExtra;
                                const [extraColR, extraColC] = colExtra;
                                let intersect = null,
                                  nonjunction = null;

                                if (boxIndex(extraColR, extraRowC) === boxIdx) {
                                  intersect = [extraColR, extraRowC];
                                  nonjunction = [extraRowR, extraColC];
                                } else if (
                                  boxIndex(extraRowR, extraColC) === boxIdx
                                ) {
                                  intersect = [extraRowR, extraColC];
                                  nonjunction = [extraColR, extraRowC];
                                } else continue;

                                restrictMask(extraRowR, extraRowC, candMask);
                                restrictMask(extraColR, extraColC, candMask);
                                restrictMask(
                                  intersect[0],
                                  intersect[1],
                                  candMask,
                                );

                                const [br, bc] = boxStart(boxIdx);
                                for (let rr = br; rr < br + 3; rr++) {
                                  if (rr === rIdx) continue;
                                  for (let cc = bc; cc < bc + 3; cc++) {
                                    if (cc === cIdx) continue;
                                    removeMask(rr, cc, candMask);
                                  }
                                }

                                if (eliminations.length) {
                                  const ahsDigitArr = maskToDigits(candMask);
                                  const ahsDigits = ahsDigitArr.join("");

                                  const resultObj = {
                                    change: true,
                                    type: "remove",
                                    cells: eliminations,
                                    hint: {
                                      name: t("teks_msg_133"),
                                      mainInfo: t("teks_msg_134", ahsDigits),
                                      detail: t(
                                        "teks_msg_135",
                                        ahsDigits,
                                        intersect[0] + 1,
                                        intersect[1] + 1,
                                        boxIdx + 1,
                                      ),
                                    },
                                    applyVisuals: () => {
                                      highlightedDigit = null;
                                      highlightState = 0;

                                      // Every AHS cell uses Cell Color 6.
                                      const ahsCells = new Map();
                                      [...rowAhsCells, ...colAhsCells].forEach(
                                        ([r, c]) =>
                                          ahsCells.set(`${r},${c}`, [r, c]),
                                      );
                                      ahsCells.forEach(([r, c]) => {
                                        window.addCellColor(
                                          r,
                                          c,
                                          cellColorPalette[5],
                                        );
                                        ahsDigitArr.forEach((d) => {
                                          if (boardState[r][c].pencils.has(d)) {
                                            boardState[r][c].pencilColors.set(
                                              d,
                                              candidateColorPalette[5],
                                            ); // AHS candidate Color 6
                                          }
                                        });
                                      });

                                      // Color Eliminations (Candidate Color 1)
                                      eliminations.forEach((el) => {
                                        boardState[el.r][el.c].candSlashes.set(
                                          el.num,
                                          markColorPalette[0],
                                        );
                                      });
                                    },
                                  };
                                  if (!findAll) return resultObj;
                                  results.push(resultObj);
                                }
                              }
                            }
                      }
                    }
              }
            }
      }
    }

    return findAll ? results : { change: false };
  },

  // --- AIC Logic ---

  /**
   * Constructs the base 9x81 bitset representing all current pencil marks
   */
  buildCandidateBitsets: (board, pencils) => {
    // 9 arrays, each with 3 integers (representing 27 bits each)
    const candidateBitsets = Array.from({ length: 9 }, () => [0, 0, 0]);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          // If it's an unsolved cell
          const id = r * 9 + c;
          const part = Math.floor(id / 27);
          const bit = id % 27;

          for (const d of pencils[r][c]) {
            candidateBitsets[d - 1][part] |= 1 << bit;
          }
        }
      }
    }

    return candidateBitsets;
  },

  /**
   * Generates the basic "one cell, one digit" nodes straight from the bitset
   */
  generateBasicNodesFromBitsets: (candidateBitsets) => {
    const nodes = [];

    for (let d = 1; d <= 9; d++) {
      const bitset = candidateBitsets[d - 1]; // The three 27-bit parts for this digit

      for (let part = 0; part < 3; part++) {
        let mask = bitset[part];
        let bitPos = 0;

        // Iterate through the set bits using shifting
        while (mask > 0) {
          if ((mask & 1) !== 0) {
            const id = part * 27 + bitPos;

            // Generate a basic node: single cell, single digit
            // Because we pass arrays with a length of 1, both processes trigger in the constructor.
            nodes.push(new AICNode([id], [d]));
          }
          mask >>>= 1; // Zero-fill right shift to safely proceed to the next bit
          bitPos++;
        }
      }
    }

    return nodes;
  },

  /**
   * Checks if bitset1 is completely covered by (is a subset of) bitset2.
   */
  isBitsetSubset: (bitset1, bitset2) => {
    for (let d = 0; d < 9; d++) {
      for (let p = 0; p < 3; p++) {
        if ((bitset1[d][p] & bitset2[d][p]) !== bitset1[d][p]) {
          return false;
        }
      }
    }
    return true;
  },

  /**
   * Returns the intersection (bitwise AND) of two bitsets.
   * Returns both a boolean (if any overlap exists) and the resulting bitset.
   */
  getBitsetIntersection: (bitset1, bitset2) => {
    const intersection = Array.from({ length: 9 }, () => [0, 0, 0]);
    let hasOverlap = false;

    for (let d = 0; d < 9; d++) {
      for (let p = 0; p < 3; p++) {
        intersection[d][p] = bitset1[d][p] & bitset2[d][p];
        if (intersection[d][p] !== 0) {
          hasOverlap = true;
        }
      }
    }
    return { hasOverlap, intersection };
  },

  // Updated to use UNIT_BITSETS
  buildBilocationOrMap: (nodes) => {
    const orMap = new Map();
    nodes.forEach((n) => orMap.set(n, new Set()));

    for (let d = 1; d <= 9; d++) {
      const dNodes = nodes.filter(
        (n) => n.digits.includes(d) && n.cells.length === 1,
      );

      for (let u = 0; u < 27; u++) {
        const parts = UNIT_BITSETS[u];
        const unitNodes = [];

        for (let i = 0; i < dNodes.length; i++) {
          const id = dNodes[i].cells[0];
          const p = Math.floor(id / 27);
          const b = id % 27;
          if ((parts[p] & (1 << b)) !== 0) {
            unitNodes.push(dNodes[i]);
          }
        }

        if (unitNodes.length === 2) {
          orMap.get(unitNodes[0]).add(unitNodes[1]);
          orMap.get(unitNodes[1]).add(unitNodes[0]);
        }
      }
    }
    return orMap;
  },

  buildGroupedOrMap: (pencils, getNode, groupedLinkRegistry) => {
    const orMap = new Map();
    const addLink = (cellsA, cellsB, digit, gateType) => {
      const nodeA = getNode(cellsA, digit);
      const nodeB = getNode(cellsB, digit);
      if (nodeA !== nodeB) {
        if (!orMap.has(nodeA)) orMap.set(nodeA, new Set());
        if (!orMap.has(nodeB)) orMap.set(nodeB, new Set());
        orMap.get(nodeA).add(nodeB);
        orMap.get(nodeB).add(nodeA);
        if (groupedLinkRegistry) {
          if (!groupedLinkRegistry.has(nodeA))
            groupedLinkRegistry.set(nodeA, new Map());
          if (!groupedLinkRegistry.has(nodeB))
            groupedLinkRegistry.set(nodeB, new Map());
          groupedLinkRegistry.get(nodeA).set(nodeB, gateType);
          groupedLinkRegistry.get(nodeB).set(nodeA, gateType);
        }
      }
    };

    for (let d = 1; d <= 9; d++) {
      for (let u = 0; u < 27; u++) {
        const presence = [];
        for (let i = 0; i < 81; i++) {
          const p = Math.floor(i / 27);
          const b = i % 27;
          if ((UNIT_BITSETS[u][p] & (1 << b)) !== 0) {
            const r = Math.floor(i / 9);
            const c = i % 9;
            if (pencils[r][c] && pencils[r][c].has(d)) {
              presence.push(i);
            }
          }
        }

        if (presence.length <= 2) continue; // Pure Bilocation handles this

        if (u < 18) {
          // Line (Row or Col) -> Check Box Intersections
          const boxMap = new Map();
          presence.forEach((id) => {
            const bId =
              Math.floor(Math.floor(id / 9) / 3) * 3 + Math.floor((id % 9) / 3);
            if (!boxMap.has(bId)) boxMap.set(bId, []);
            boxMap.get(bId).push(id);
          });

          if (boxMap.size === 2) {
            const groups = Array.from(boxMap.values());
            addLink(groups[0], groups[1], d);
          }
        } else {
          // Box -> Check Line Intersections
          const rowMap = new Map();
          const colMap = new Map();
          presence.forEach((id) => {
            const r = Math.floor(id / 9);
            const c = id % 9;
            if (!rowMap.has(r)) rowMap.set(r, []);
            rowMap.get(r).push(id);
            if (!colMap.has(c)) colMap.set(c, []);
            colMap.get(c).push(id);
          });

          if (rowMap.size === 2) {
            const groups = Array.from(rowMap.values());
            addLink(groups[0], groups[1], d);
          }
          if (colMap.size === 2) {
            const groups = Array.from(colMap.values());
            addLink(groups[0], groups[1], d);
          }
          if (rowMap.size >= 2 && colMap.size >= 2) {
            // 1 Row + 1 Col (5 cell overlap case)
            let foundCross = false;
            for (const r of rowMap.keys()) {
              if (foundCross) break;
              for (const c of colMap.keys()) {
                const covered = presence.every(
                  (id) => Math.floor(id / 9) === r || id % 9 === c,
                );
                if (covered) {
                  const groupA = presence.filter(
                    (id) => Math.floor(id / 9) === r,
                  );
                  const groupB = presence.filter((id) => id % 9 === c);
                  if (groupA.length > 0 && groupB.length > 0) {
                    addLink(groupA, groupB, d);
                    foundCross = true;
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }

    return orMap;
  },

  /**
   * Constructs Bivalue OR Map (Same cell, exactly 2 digits)
   */
  buildBivalueOrMap: (nodes) => {
    const orMap = new Map();
    nodes.forEach((n) => orMap.set(n, new Set()));

    const cellMap = new Map();
    for (const node of nodes) {
      const cId = node.cells[0];
      if (!cellMap.has(cId)) cellMap.set(cId, []);
      cellMap.get(cId).push(node);
    }

    for (const [_, cellNodes] of cellMap.entries()) {
      if (cellNodes.length === 2) {
        // Bivalue!
        orMap.get(cellNodes[0]).add(cellNodes[1]);
        orMap.get(cellNodes[1]).add(cellNodes[0]);
      }
    }
    return orMap;
  },

  buildAlsOrMap: (board, pencils, getNode, alsLinkRegistry, options = {}) => {
    const normalizedOptions =
      options && typeof options === "object" ? options : {};

    // ALS sizes that must not be removed by subset reduction.
    const preserveAlsSizes = new Set(normalizedOptions.preserveAlsSizes || []);

    // When several ALSs generate the same node pair, prefer this size.
    const preferredAlsSize = normalizedOptions.preferredAlsSize ?? null;
    const preferSmallestAls = normalizedOptions.preferSmallestAls === true;
    const requireAlsCellSubsetForDominance =
      normalizedOptions.requireAlsCellSubsetForDominance === true;

    const alses = techniques._collectAllALS(board, pencils);
    const candidateLinks = [];

    const hasNandCandidates = (node) => {
      const d = node.digits[0];

      for (let p = 0; p < 3; p++) {
        let mask = node.NandBitset[d - 1][p];
        let bitPos = 0;

        while (mask > 0) {
          if (mask & 1) {
            const id = p * 27 + bitPos;
            const r = Math.floor(id / 9);
            const c = id % 9;

            if (pencils[r][c] && pencils[r][c].has(d)) {
              return true;
            }
          }

          mask >>>= 1;
          bitPos++;
        }
      }

      return false;
    };

    for (const als of alses) {
      const digits = Object.keys(als.candMap).map(Number);

      for (let i = 0; i < digits.length; i++) {
        for (let j = i + 1; j < digits.length; j++) {
          const d1 = digits[i];
          const d2 = digits[j];

          const cells1 = als.candMap[d1].map(([r, c]) => r * 9 + c);
          const cells2 = als.candMap[d2].map(([r, c]) => r * 9 + c);

          const node1 = getNode(cells1, d1);
          const node2 = getNode(cells2, d2);

          if (!hasNandCandidates(node1) || !hasNandCandidates(node2)) {
            continue;
          }

          candidateLinks.push({
            nodeA: node1,
            nodeB: node2,
            als,
          });
        }
      }
    }

    const isSubset = (subNode, superNode) => {
      if (subNode.digits[0] !== superNode.digits[0]) {
        return false;
      }

      return subNode.cells.every((id) => superNode.cells.includes(id));
    };

    // Subset-reduction stage. isSubset() only holds between nodes of the
    // same digit, so a link can only be dominated by one carrying the same
    // unordered digit pair - bucket by that pair instead of scanning all.
    const finalLinks = [];
    const linksByDigitPair = new Map();
    for (const link of candidateLinks) {
      const left = link.nodeA.digits[0];
      const right = link.nodeB.digits[0];
      const pairKey = left < right ? left * 10 + right : right * 10 + left;
      let bucket = linksByDigitPair.get(pairKey);
      if (!bucket) {
        bucket = [];
        linksByDigitPair.set(pairKey, bucket);
      }
      bucket.push(link);
    }

    for (let i = 0; i < candidateLinks.length; i++) {
      const candidate = candidateLinks[i];
      const { nodeA, nodeB, als } = candidate;

      /*
       * WXYZ-Wing requires the actual three-cell ALS provenance.
       * Keep requested ALS sizes even when another ALS supplies a
       * smaller equivalent OR-link representation.
       */
      if (preserveAlsSizes.has(als.cells.length)) {
        finalLinks.push(candidate);
        continue;
      }

      let isDominated = false;

      const digitLeft = nodeA.digits[0];
      const digitRight = nodeB.digits[0];
      const peers =
        linksByDigitPair.get(
          digitLeft < digitRight
            ? digitLeft * 10 + digitRight
            : digitRight * 10 + digitLeft,
        ) || [];

      for (let j = 0; j < peers.length; j++) {
        const other = peers[j];
        if (other === candidate) continue;

        const directlyDominated =
          isSubset(other.nodeA, nodeA) && isSubset(other.nodeB, nodeB);

        const reverseDominated =
          isSubset(other.nodeA, nodeB) && isSubset(other.nodeB, nodeA);

        if (!directlyDominated && !reverseDominated) continue;

        const differentNodeSizes =
          other.nodeA.cells.length !== nodeA.cells.length ||
          other.nodeB.cells.length !== nodeB.cells.length;
        if (!differentNodeSizes) continue;

        const otherAlsCellsAreSubset =
          !requireAlsCellSubsetForDominance ||
          other.als.cells.every(([r, c]) =>
            als.cells.some(
              ([alsRow, alsColumn]) => alsRow === r && alsColumn === c,
            ),
          );

        if (otherAlsCellsAreSubset) {
          isDominated = true;
          break;
        }
      }

      if (!isDominated) {
        finalLinks.push(candidate);
      }
    }

    const alsMap = new Map();

    /*
     * Register an ALS for a node pair.
     *
     * In the generic map this retains the previous last-write behavior.
     * In the WXYZ-specific map, a three-cell ALS takes priority over
     * an equivalent larger ALS.
     */
    const registerAls = (nodeA, nodeB, als) => {
      if (!alsLinkRegistry.has(nodeA)) {
        alsLinkRegistry.set(nodeA, new Map());
      }

      const pairMap = alsLinkRegistry.get(nodeA);
      const existing = pairMap.get(nodeB);

      if (!existing) {
        pairMap.set(nodeB, als);
        return;
      }

      if (preferSmallestAls) {
        if (als.cells.length < existing.cells.length) pairMap.set(nodeB, als);
        return;
      }

      if (preferredAlsSize !== null) {
        const existingIsPreferred = existing.cells.length === preferredAlsSize;
        const newIsPreferred = als.cells.length === preferredAlsSize;

        if (newIsPreferred && !existingIsPreferred) {
          pairMap.set(nodeB, als);
          return;
        }

        if (existingIsPreferred && !newIsPreferred) {
          return;
        }
      }

      // Original behavior when no ALS size has priority.
      pairMap.set(nodeB, als);
    };

    for (const { nodeA, nodeB, als } of finalLinks) {
      // One-cell ALS links are represented by BivalueOrMap.
      if (als.cells.length <= 1) continue;

      if (!alsMap.has(nodeA)) alsMap.set(nodeA, new Set());
      if (!alsMap.has(nodeB)) alsMap.set(nodeB, new Set());

      alsMap.get(nodeA).add(nodeB);
      alsMap.get(nodeB).add(nodeA);

      if (alsLinkRegistry) {
        registerAls(nodeA, nodeB, als);
        registerAls(nodeB, nodeA, als);
      }
    }

    return alsMap;
  },

  buildFishOrMap: (board, pencils, getNode, fishLinkRegistry) => {
    const orMap = new Map();

    // Optimized combination generator using backtracking (less garbage collection)
    const getCombinations = (arr, size) => {
      const result = [];
      const combo = [];
      const f = (start) => {
        if (combo.length === size) {
          result.push([...combo]);
          return;
        }
        for (let i = start; i < arr.length; i++) {
          combo.push(arr[i]);
          f(i + 1);
          combo.pop(); // Backtrack
        }
      };
      f(0);
      return result;
    };

    const hasNandCandidates = (node) => {
      const d = node.digits[0];
      for (let p = 0; p < 3; p++) {
        let mask = node.NandBitset[d - 1][p];
        let bitPos = 0;
        while (mask > 0) {
          if (mask & 1) {
            const id = p * 27 + bitPos;
            const r = Math.floor(id / 9);
            const c = id % 9;
            if (pencils[r][c] && pencils[r][c].has(d)) return true;
          }
          mask >>>= 1;
          bitPos++;
        }
      }
      return false;
    };

    const addLink = (nodeA, nodeB, fish) => {
      if (nodeA === nodeB) return;
      if (!orMap.has(nodeA)) orMap.set(nodeA, new Set());
      if (!orMap.has(nodeB)) orMap.set(nodeB, new Set());
      orMap.get(nodeA).add(nodeB);
      orMap.get(nodeB).add(nodeA);

      if (fishLinkRegistry) {
        if (!fishLinkRegistry.has(nodeA))
          fishLinkRegistry.set(nodeA, new Map());
        if (!fishLinkRegistry.has(nodeB))
          fishLinkRegistry.set(nodeB, new Map());
        fishLinkRegistry.get(nodeA).set(nodeB, fish);
        fishLinkRegistry.get(nodeB).set(nodeA, fish);
      }
    };

    const getUnitName = (isRow, indices) => {
      const label = isRow ? "r" : "c";
      return (
        label +
        indices
          .map((i) => i + 1)
          .sort((a, b) => a - b)
          .join("")
      );
    };

    // Precompute placed counts
    const placedCounts = Array(10).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) placedCounts[board[r][c]]++;
      }
    }

    for (let d = 1; d <= 9; d++) {
      if (9 - placedCounts[d] < 4) continue; // Early prune: Min fish size 2 needs 4 open slots

      // Group candidate cell IDs by row and column for digit d
      const rowCells = Array.from({ length: 9 }, () => []);
      const colCells = Array.from({ length: 9 }, () => []);

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (pencils[r][c] && pencils[r][c].has(d)) {
            const id = r * 9 + c;
            rowCells[r].push(id);
            colCells[c].push(id);
          }
        }
      }

      for (let n = 2; n <= 4; n++) {
        if (9 - placedCounts[d] < 2 * n) continue;

        // Base Types: 0 = Rows, 1 = Cols
        for (let baseType = 0; baseType <= 1; baseType++) {
          const isBaseRow = baseType === 0;
          const baseHouses = isBaseRow ? rowCells : colCells;

          // Pre-collect ONLY houses that actually contain candidate d
          const validBaseHouses = [];
          for (let i = 0; i < 9; i++) {
            if (baseHouses[i].length > 0) validBaseHouses.push(i);
          }

          if (validBaseHouses.length < n) continue;
          const baseCombos = getCombinations(validBaseHouses, n);

          for (const bases of baseCombos) {
            // Skip if all base units are in the same chute
            const firstChute = Math.floor(bases[0] / 3);
            const spansSingleChute = bases.every(
              (b) => Math.floor(b / 3) === firstChute,
            );
            if (spansSingleChute) continue;

            const baseCells = [];
            for (const b of bases) {
              baseCells.push(...baseHouses[b]);
            }

            // Find unique cover units intersected by these base cells
            const occupiedCovers = new Set();
            for (const id of baseCells) {
              const coverIdx = isBaseRow ? id % 9 : Math.floor(id / 9);
              occupiedCovers.add(coverIdx);
            }

            // If base cells span fewer cover houses than n, it can't form an size-n finned fish
            if (occupiedCovers.size < n) continue;

            // Generate cover combinations ONLY from occupied cover houses
            const coverCombos = getCombinations(Array.from(occupiedCovers), n);

            for (const covers of coverCombos) {
              const coverSet = new Set(covers);
              const fins = [];

              // Map to group body parts on a single pass
              const bodyPartsByCover = new Map();
              for (const cv of covers) {
                bodyPartsByCover.set(cv, []);
              }

              // Distribute base cells into body parts or fins
              for (const id of baseCells) {
                const coverIdx = isBaseRow ? id % 9 : Math.floor(id / 9);
                if (coverSet.has(coverIdx)) {
                  bodyPartsByCover.get(coverIdx).push(id);
                } else {
                  fins.push(id);
                }
              }

              // Finned fish constraint check
              if (fins.length === 0 || fins.length > 4) continue;

              // Extract fish body cells from grouped parts
              const fishBody = [];
              for (const part of bodyPartsByCover.values()) {
                fishBody.push(...part);
              }

              const basesStr = getUnitName(isBaseRow, bases);
              const coversStr = getUnitName(!isBaseRow, covers);

              // --- Rank-1 check: do all fins share a common house? ---
              let isRank1 = false;
              if (fins.length > 0) {
                // Check row
                const finRows = new Set(fins.map((id) => Math.floor(id / 9)));
                const finCols = new Set(fins.map((id) => id % 9));
                const finBoxes = new Set(
                  fins.map(
                    (id) =>
                      Math.floor(Math.floor(id / 9) / 3) * 3 +
                      Math.floor((id % 9) / 3),
                  ),
                );
                isRank1 =
                  finRows.size === 1 ||
                  finCols.size === 1 ||
                  finBoxes.size === 1;
              }

              // Build all valid cover-body nodes for this fish configuration
              const coverBodyNodes = [];
              for (const cv of covers) {
                const bodyPart = bodyPartsByCover.get(cv);
                if (bodyPart.length > 0) {
                  coverBodyNodes.push(getNode(bodyPart, d));
                }
              }

              const fishObj = {
                d,
                basesStr,
                coversStr,
                allCells: [...fins, ...fishBody],
                isRank1,
                coverBodyNodes, // All body-part nodes indexed by cover (for XOR ring elim)
              };

              const finNode = getNode(fins, d);
              if (!hasNandCandidates(finNode)) continue;

              // Process each cover unit's body parts (only link covers with valid NAND candidates)
              for (const bodyNode of coverBodyNodes) {
                if (hasNandCandidates(bodyNode)) {
                  addLink(finNode, bodyNode, fishObj);
                }
              }
            }
          }
        }
      }
    }
    return orMap;
  },

  /**
   * Merges maps for the generic AIC (combining Bilocation and Bivalue)
   */
  mergeOrMaps: (map1, map2) => {
    const merged = new Map();

    // 1. Copy all keys and sets from map1
    if (map1) {
      for (const [node, set1] of map1.entries()) {
        merged.set(node, new Set(set1));
      }
    }

    // 2. Merge in keys and sets from map2
    if (map2) {
      for (const [node, set2] of map2.entries()) {
        if (!merged.has(node)) {
          merged.set(node, new Set(set2));
        } else {
          const existingSet = merged.get(node);
          for (const val of set2) {
            existingSet.add(val);
          }
        }
      }
    }

    return merged;
  },

  // --- Global Cache for AIC Graph ---
  _aicCache: {
    signature: null,
    AllNodes: [],
    NodeCache: new Map(),
    BivalueOrMap: new Map(),
    BilocationOrMap: new Map(),
    GroupedOrMap: new Map(),
    AlsMap: new Map(),
    AlsPolicyCache: new Map(),
    FishMap: new Map(),
    GroupedLinkRegistry: new Map(),
    AlsLinkRegistry: new Map(),
    FishLinkRegistry: new Map(),
    BlossomSearchCache: null,
    AlmostAicGraph: null,
  },

  _getTemplating: (board, pencils, num) => {
    if (!techniques._templatingCache) techniques._templatingCache = {};
    if (techniques._templatingCache[num])
      return techniques._templatingCache[num];

    let cb = [0, 0, 0];
    const cellsWithNum = [];
    let allNumMask = 0n;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0 && pencils[r][c].has(num)) {
          const id = r * 9 + c;
          cellsWithNum.push(id);
          cb[Math.floor(id / 27)] |= 1 << (id % 27);
          allNumMask |= CELL_MASK[id];
        }
      }
    }

    const units = Array.from({ length: 27 }, () => []);

    for (let i = 0; i < 27; i++) {
      const inter = [
        cb[0] & UNIT_BITSETS[i][0],
        cb[1] & UNIT_BITSETS[i][1],
        cb[2] & UNIT_BITSETS[i][2],
      ];
      const res = [];
      for (let p = 0; p < 3; p++) {
        let m = inter[p];
        let bit = 0;
        while (m > 0) {
          if (m & 1) res.push(p * 27 + bit);
          m >>= 1;
          bit++;
        }
      }
      units[i] = res;
    }

    techniques._templatingCache[num] = {
      cb,
      cellsWithNum,
      allNumMask,
      units,
    };

    return techniques._templatingCache[num];
  },

  _solvedBoardCache: { signature: null, board: null },
  _sharedAICCache: { signature: null, cache: null },

  /**
   * Signature of the current position, covering placed digits and pencilmarks.
   * Used to decide whether a cached node/link graph is still valid.
   */
  _positionSignature: (board, pencils) => {
    let signature = "";
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) {
          signature += board[r][c];
          continue;
        }
        let mask = 0;
        for (const digit of pencils[r][c]) mask |= 1 << digit;
        signature += "." + mask.toString(36);
      }
    }
    return signature;
  },

  /**
   * Restores the node/link graph built for this exact position, so that the
   * three blossom variants (and any later call on the same position) share
   * one build instead of repeating it.
   */
  _useSharedAICCache: (board, pencils) => {
    const signature = techniques._positionSignature(board, pencils);
    const shared = techniques._sharedAICCache;
    if (shared.signature === signature && shared.cache) {
      techniques._aicCache = shared.cache;
      return;
    }
    shared.signature = signature;
    shared.cache = techniques._aicCache;
  },

  /**
   * Solves the given board with a bitmask solver and caches the result by
   * board signature, so repeated technique calls on the same position solve
   * only once.
   */
  _getSolvedBoard: (board) => {
    const signature = board.map((row) => row.join("")).join("");
    const cache = techniques._solvedBoardCache;
    if (cache.signature === signature) return cache.board;

    const grid = new Int8Array(81);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) grid[r * 9 + c] = board[r][c];
    }
    const rowMasks = new Int32Array(9);
    const colMasks = new Int32Array(9);
    const boxMasks = new Int32Array(9);
    const boxOf = (id) =>
      Math.floor(Math.floor(id / 9) / 3) * 3 + Math.floor((id % 9) / 3);
    for (let id = 0; id < 81; id++) {
      const digit = grid[id];
      if (!digit) continue;
      const bit = 1 << digit;
      rowMasks[Math.floor(id / 9)] |= bit;
      colMasks[id % 9] |= bit;
      boxMasks[boxOf(id)] |= bit;
    }

    const allDigits = 0x3fe;
    const fill = () => {
      let bestId = -1;
      let bestMask = 0;
      let bestCount = 10;
      for (let id = 0; id < 81; id++) {
        if (grid[id]) continue;
        const mask =
          allDigits &
          ~(
            rowMasks[Math.floor(id / 9)] |
            colMasks[id % 9] |
            boxMasks[boxOf(id)]
          );
        let count = 0;
        let bits = mask;
        while (bits !== 0) {
          bits &= bits - 1;
          count++;
        }
        if (count === 0) return false;
        if (count < bestCount) {
          bestCount = count;
          bestId = id;
          bestMask = mask;
          if (count === 1) break;
        }
      }
      if (bestId < 0) return true;

      const row = Math.floor(bestId / 9);
      const col = bestId % 9;
      const box = boxOf(bestId);
      let bits = bestMask;
      while (bits !== 0) {
        const low = bits & -bits;
        grid[bestId] = 31 - Math.clz32(low);
        rowMasks[row] |= low;
        colMasks[col] |= low;
        boxMasks[box] |= low;
        if (fill()) return true;
        grid[bestId] = 0;
        rowMasks[row] &= ~low;
        colMasks[col] &= ~low;
        boxMasks[box] &= ~low;
        bits &= bits - 1;
      }
      return false;
    };

    cache.signature = signature;
    cache.board = fill()
      ? Array.from({ length: 9 }, (_, r) =>
          Array.from({ length: 9 }, (_, c) => grid[r * 9 + c]),
        )
      : null;
    return cache.board;
  },

  _resetAICCache: () => {
    techniques._templatingCache = null;
    techniques._aicCache = {
      signature: null,

      AllNodes: [],
      NodeCache: new Map(),
      BivalueOrMap: new Map(),
      BilocationOrMap: new Map(),
      GroupedOrMap: new Map(),
      AlsMap: new Map(),
      AlsPolicyCache: new Map(),
      FishMap: new Map(),
      GroupedLinkRegistry: new Map(),
      AlsLinkRegistry: new Map(),
      FishLinkRegistry: new Map(),
      BlossomSearchCache: null,
      AlmostAicGraph: null,
    };
  },

  _addLink: (map, u, v) => {
    if (!map.has(u.key)) map.set(u.key, []);
    map.get(u.key).push(v);
  },

  // --- Map Merger Helper ---
  _mergeMaps: (...maps) => {
    const result = new Map();
    for (const m of maps) {
      for (const [key, neighbors] of m) {
        if (!result.has(key)) result.set(key, []);
        const target = result.get(key);
        // Avoid duplicates if necessary, though simpler to just push
        for (const n of neighbors) target.push(n);
      }
    }
    return result;
  },

  _findAic: (board, pencils, config, findAll = false) => {
    const results = [];
    const {
      singleDigit,
      bivalueOnly,
      useGrouped,
      useAlsXZ,
      useAls,
      useFish,
      maxCycle,
      nameOverride,
      pathFilter,
      useAlsOnly = false,
      endSameDigits = false,
      allowedOrLinkTypes = null,
      preserveAlsSizes = null,
      preferredAlsSize = null,
    } = config;
    const techniqueName = nameOverride || t("teks_msg_136");

    let cache = techniques._aicCache;

    let AlsOnly = useAlsXZ || useAlsOnly;
    let SameDigits = bivalueOnly || useAlsXZ || endSameDigits;

    // 1. Initialize & Cache Base Nodes
    if (cache.AllNodes.length === 0) {
      const candidateBitsets = techniques.buildCandidateBitsets(board, pencils);
      const baseNodes =
        techniques.generateBasicNodesFromBitsets(candidateBitsets);
      baseNodes.forEach((n) => {
        const key = `${n.digits.join(",")}_${n.cells
          .slice()
          .sort((a, b) => a - b)
          .join(",")}`;
        cache.NodeCache.set(key, n);
        cache.AllNodes.push(n);
      });
    }

    const allNodes = cache.AllNodes;
    const nodeCache = cache.NodeCache;

    let aicOrMap = new Map();
    allNodes.forEach((n) => aicOrMap.set(n, new Set()));

    const getNode = (cells, digits) => {
      const dArr = Array.isArray(digits) ? digits : [digits];
      const key = `${dArr.join(",")}_${cells
        .slice()
        .sort((a, b) => a - b)
        .join(",")}`;
      if (nodeCache.has(key)) return nodeCache.get(key);

      const newNode = new AICNode(cells, dArr);
      nodeCache.set(key, newNode);
      allNodes.push(newNode);
      aicOrMap.set(newNode, new Set()); // Important: Register immediately
      return newNode;
    };

    // 2. Map Generation & Cache Hydration
    if (singleDigit || (!singleDigit && !bivalueOnly && !AlsOnly)) {
      if (cache.BilocationOrMap.size === 0) {
        cache.BilocationOrMap = techniques.buildBilocationOrMap(allNodes);
      }
      aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.BilocationOrMap);
    }

    if (bivalueOnly || (!singleDigit && !bivalueOnly)) {
      if (cache.BivalueOrMap.size === 0) {
        cache.BivalueOrMap = techniques.buildBivalueOrMap(allNodes);
      }
      aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.BivalueOrMap);
    }

    if (useGrouped) {
      if (cache.GroupedOrMap.size === 0) {
        cache.GroupedOrMap = techniques.buildGroupedOrMap(
          pencils,
          (cells, d) => getNode(cells, [d]),
          cache.GroupedLinkRegistry,
        );
      }
      aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.GroupedOrMap);
    }
    let activeAlsLinkRegistry = cache.AlsLinkRegistry;
    const activeGroupedLinkRegistry = cache.GroupedLinkRegistry;

    if (useAls) {
      const normalizedPreserveSizes = Array.isArray(preserveAlsSizes)
        ? [...new Set(preserveAlsSizes)].sort((a, b) => a - b)
        : [];

      const usesTechniqueAlsPolicy =
        normalizedPreserveSizes.length > 0 || preferredAlsSize !== null;

      if (usesTechniqueAlsPolicy) {
        const policyKey =
          `${normalizedPreserveSizes.join(",")}|` +
          `${preferredAlsSize ?? "none"}`;

        let policyEntry = cache.AlsPolicyCache.get(policyKey);

        if (!policyEntry) {
          const registry = new Map();

          const map = techniques.buildAlsOrMap(
            board,
            pencils,
            (cells, d) => getNode(cells, [d]),
            registry,
            {
              preserveAlsSizes: normalizedPreserveSizes,
              preferredAlsSize,
            },
          );

          policyEntry = {
            map,
            registry,
          };

          cache.AlsPolicyCache.set(policyKey, policyEntry);
        }

        activeAlsLinkRegistry = policyEntry.registry;

        aicOrMap = techniques.mergeOrMaps(aicOrMap, policyEntry.map);
      } else {
        // Existing generic optimized ALS map.
        if (cache.AlsMap.size === 0) {
          cache.AlsMap = techniques.buildAlsOrMap(
            board,
            pencils,
            (cells, d) => getNode(cells, [d]),
            cache.AlsLinkRegistry,
          );
        }

        aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.AlsMap);
      }
    }

    let activeFishLinkRegistry = cache.FishLinkRegistry;
    if (useFish) {
      if (cache.FishMap.size === 0) {
        cache.FishMap = techniques.buildFishOrMap(
          board,
          pencils,
          (cells, d) => getNode(cells, [d]),
          cache.FishLinkRegistry,
        );
      }
      aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.FishMap);
    }

    const getAlsForLink = (u, v) =>
      activeAlsLinkRegistry.get(u)?.get(v) || null;

    const getOrLinkType = (u, v) => {
      // Multi-cell intra-ALS link.
      if (getAlsForLink(u, v)) {
        return "als";
      }

      // One-cell ALS: two candidates in the same bivalue cell.
      if (
        u.cells.length === 1 &&
        v.cells.length === 1 &&
        u.cells[0] === v.cells[0] &&
        u.digits[0] !== v.digits[0]
      ) {
        return "bivalue";
      }

      // Bilocation or grouped single-digit intra-region link.
      if (
        u.digits.length === 1 &&
        v.digits.length === 1 &&
        u.digits[0] === v.digits[0]
      ) {
        return "region";
      }

      return "other";
    };

    if (allowedOrLinkTypes) {
      const allowed = new Set(allowedOrLinkTypes);
      const filteredOrMap = new Map();

      allNodes.forEach((node) => filteredOrMap.set(node, new Set()));

      for (const [u, neighbors] of aicOrMap) {
        if (!filteredOrMap.has(u)) {
          filteredOrMap.set(u, new Set());
        }

        for (const v of neighbors) {
          if (allowed.has(getOrLinkType(u, v))) {
            filteredOrMap.get(u).add(v);
          }
        }
      }

      aicOrMap = filteredOrMap;
    }

    const baseOrMap = new Map();
    allNodes.forEach((n) => baseOrMap.set(n, new Set(aicOrMap.get(n))));

    const acceptsConfiguredPath = (path, kind) =>
      !pathFilter ||
      pathFilter(path, cache, {
        kind,
        isRing: kind === "ring",
        getOrLinkType,
        getAlsForLink,
      });

    const interestedNodes = allNodes.filter(
      (n) => aicOrMap.has(n) && aicOrMap.get(n).size > 0,
    );

    interestedNodes.forEach((node, idx) => {
      node.index = idx;

      node.OrNodes = new Set(aicOrMap.get(node));
      node.OrNandNodes = new Set();
      node.NandNodes = new Set();

      node.OrFrontier = new Set(node.OrNodes);
      node.OrNandFrontier = new Set();
    });

    // Index nodes so NAND construction does not scan every node pair.
    const nodesByDigit = Array.from({ length: 10 }, () => []);
    const singleCellNodesByCell = Array.from({ length: 81 }, () => []);

    for (const n of interestedNodes) {
      if (n.digits.length !== 1) continue;

      const d = n.digits[0];
      nodesByDigit[d].push(n);

      if (n.cells.length === 1) {
        singleCellNodesByCell[n.cells[0]].push(n);
      }
    }

    for (const A of interestedNodes) {
      if (A.digits.length !== 1) continue;

      const aDigit = A.digits[0];

      // Same-digit weak links: peers/common-peers/grouped-node visibility.
      for (const B of nodesByDigit[aDigit]) {
        if (A === B) continue;

        if (techniques.isBitsetSubset(B.NodeBitset, A.NandBitset)) {
          A.NandNodes.add(B);
        }
      }

      if (!singleDigit && !bivalueOnly && A.cells.length === 1) {
        const sameCellNodes = singleCellNodesByCell[A.cells[0]];

        for (const B of sameCellNodes) {
          if (A !== B && B.digits[0] !== aDigit) {
            A.NandNodes.add(B);
          }
        }
      }
    }

    let maxCycles = maxCycle;

    // cycle 0 => 4 nodes
    // cycle 1 => 8 nodes
    // cycle 2 => 16 nodes
    const getMaxPathLenForCycle = (cycle) => {
      return 1 << (cycle + 2);
    };

    const stringifiedFoundRemovals = new Set();
    const deadRings = new Set();

    const canonicalRemovalPack = (removals) => {
      const seen = new Uint8Array(4096);
      const unique = [];

      for (const el of removals) {
        const key = (el.r << 8) | (el.c << 4) | el.num;

        if (seen[key] === 0) {
          seen[key] = 1;
          unique.push(el);
        }
      }

      unique.sort((a, b) => a.r - b.r || a.c - b.c || a.num - b.num);

      let key = "";
      for (const el of unique) {
        key += `${el.r}${el.c}${el.num};`;
      }

      return { removals: unique, key };
    };

    const extractRemovals = (maskArray) => {
      const removals = [];
      for (let d = 0; d < 9; d++) {
        for (let p = 0; p < 3; p++) {
          let mask = maskArray[d][p];
          let bitPos = 0;
          while (mask > 0) {
            if ((mask & 1) !== 0) {
              const id = p * 27 + bitPos;
              const r = Math.floor(id / 9);
              const c = id % 9;
              const num = d + 1;
              if (pencils[r][c] && pencils[r][c].has(num)) {
                if (
                  !removals.some(
                    (rem) => rem.r === r && rem.c === c && rem.num === num,
                  )
                ) {
                  removals.push({ r, c, num });
                }
              }
            }
            mask >>>= 1;
            bitPos++;
          }
        }
      }
      return removals;
    };

    const findAICPath = (startNode, endNode, maxNodes, kind = "chain") => {
      // A path is reconstructed only when an endpoint is reached.
      const EMPTY_NEIGHBORS = new Set();

      const states = [
        {
          node: startNode,
          isNextOr: true,
          parent: -1,
          depth: 1,
        },
      ];

      let head = 0;

      const reconstructPath = (stateIndex) => {
        const path = [];

        while (stateIndex !== -1) {
          const state = states[stateIndex];
          path.push(state.node);
          stateIndex = state.parent;
        }

        path.reverse();
        return path;
      };

      const ancestorContains = (stateIndex, targetNode) => {
        while (stateIndex !== -1) {
          const state = states[stateIndex];

          if (state.node === targetNode) {
            return true;
          }

          stateIndex = state.parent;
        }

        return false;
      };

      const bestDepth = pathFilter
        ? null
        : new Map([[`${startNode.index}:1`, 1]]);

      while (head < states.length) {
        const stateIndex = head++;
        const state = states[stateIndex];

        const { node, isNextOr, depth } = state;

        if (node === endNode && depth > 1) {
          // A valid chain ends immediately after an OR link.
          if (!isNextOr) {
            const path = reconstructPath(stateIndex);

            if (acceptsConfiguredPath(path, kind)) {
              return path;
            }
          }

          continue;
        }

        if (depth >= maxNodes) {
          continue;
        }

        const nextNodes = isNextOr
          ? baseOrMap.get(node) || EMPTY_NEIGHBORS
          : node.NandNodes || EMPTY_NEIGHBORS;

        const nextIsOr = !isNextOr;
        const nextDepth = depth + 1;

        for (const nxt of nextNodes) {
          // Repeating a node is forbidden except when closing a ring back
          // onto its starting node.
          const closesRing = startNode === endNode && nxt === endNode;

          if (ancestorContains(stateIndex, nxt) && !closesRing) {
            continue;
          }

          // The destination is checked before dominance pruning so a ring can
          // return to its starting node.
          if (bestDepth && nxt !== endNode) {
            const stateKey = `${nxt.index}:${nextIsOr ? 1 : 0}`;
            const previousDepth = bestDepth.get(stateKey);

            if (previousDepth !== undefined && previousDepth <= nextDepth) {
              continue;
            }

            bestDepth.set(stateKey, nextDepth);
          }

          states.push({
            node: nxt,
            isNextOr: nextIsOr,
            parent: stateIndex,
            depth: nextDepth,
          });
        }
      }

      return null;
    };

    const getLoc = (cells, preferBox = false) => {
      if (cells.length === 0) return "";

      if (cells.length === 1) {
        const r = Math.floor(cells[0] / 9);
        const c = cells[0] % 9;
        if (preferBox) {
          const b = Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1;
          const p = (r % 3) * 3 + (c % 3) + 1;
          return `b${b}p${p}`;
        }
        return `r${r + 1}c${c + 1}`;
      }

      const rows = [...new Set(cells.map((id) => Math.floor(id / 9) + 1))].sort(
        (a, b) => a - b,
      );
      const cols = [...new Set(cells.map((id) => (id % 9) + 1))].sort(
        (a, b) => a - b,
      );
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
          .map((id) => {
            const r = Math.floor(id / 9) % 3;
            const c = (id % 9) % 3;
            return r * 3 + c + 1;
          })
          .sort((a, b) => a - b);
        return `b${boxes[0]}p${points.join("")}`;
      }

      if (rows.length === 1) return `r${rows[0]}c${cols.join("")}`;
      if (cols.length === 1) return `r${rows.join("")}c${cols[0]}`;

      return [...cells]
        .sort((a, b) => a - b)
        .map((id) => {
          const r = Math.floor(id / 9) + 1;
          const c = (id % 9) + 1;
          return `r${r}c${c}`;
        })
        .join("");
    };

    const getCompactFinLoc = (cells) => {
      if (cells.length <= 1) return getLoc(cells);

      const uniqueCells = [...new Set(cells)];
      const rows = new Set(uniqueCells.map((id) => Math.floor(id / 9)));
      const cols = new Set(uniqueCells.map((id) => id % 9));

      if (rows.size === 1 || cols.size === 1) return getLoc(uniqueCells);

      // Use the direction that produces fewer groups. Keep group order based
      // on the fish-node cell order so Eureka notation follows the fin order.
      const groupByRow = rows.size <= cols.size;
      const groups = new Map();

      for (const id of uniqueCells) {
        const r = Math.floor(id / 9);
        const c = id % 9;
        const key = groupByRow ? r : c;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(groupByRow ? c : r);
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
    };

    const buildCompactEureka = (path, isRing) => {
      let str = "";
      let lastDigit = null;

      for (let i = 0; i < path.length; i += 2) {
        const u = path[i];
        const v = path[(i + 1) % path.length];

        let orGateStr = "";
        const als = useAls ? activeAlsLinkRegistry.get(u)?.get(v) : null;
        const fish = useFish ? activeFishLinkRegistry.get(u)?.get(v) : null;

        if (als) {
          const alsIds = als.cells.map((c) => c[0] * 9 + c[1]);
          const preferBox =
            als.unitName && als.unitName.includes(t("teks_msg_7"));
          orGateStr = `(${u.digits[0]}=${v.digits[0]})${getLoc(alsIds, preferBox)}`;
          lastDigit = v.digits[0];
        } else if (fish) {
          orGateStr = `(${fish.d})(${getCompactFinLoc(u.cells)}=${getCompactFinLoc(v.cells)})(${fish.basesStr}\\${fish.coversStr})`;
          lastDigit = fish.d;
        } else if (
          u.digits[0] !== v.digits[0] &&
          u.cells.length === 1 &&
          v.cells.length === 1 &&
          u.cells[0] === v.cells[0]
        ) {
          orGateStr = `(${u.digits[0]}=${v.digits[0]})${getLoc(u.cells)}`;
          lastDigit = v.digits[0];
        } else {
          const d = u.digits[0];
          const prefix = lastDigit === d ? "" : `(${d})`;
          const gateType = activeGroupedLinkRegistry?.get(u)?.get(v);
          const preferBoxGate = gateType === "box";
          orGateStr = `${prefix}${getLoc(u.cells, preferBoxGate)}=${getLoc(v.cells, preferBoxGate)}`;
          lastDigit = d;
        }

        if (i === 0) str += orGateStr;
        else str += "-" + orGateStr;
      }

      if (isRing) str += "-";
      return str;
    };

    const buildResult = (
      removals,
      name,
      path,
      isRing = false,
      placement = null,
    ) => {
      const eurekaStr = buildCompactEureka(path, isRing);

      const usedAlses = [];
      const usedFishes = [];

      const fishNodes = new Set();

      const fullVisualChain = isRing ? [...path, path[0]] : path;

      for (let i = 0; i < fullVisualChain.length - 1; i += 2) {
        const u = fullVisualChain[i];
        const v = fullVisualChain[i + 1];

        const als = useAls ? activeAlsLinkRegistry.get(u)?.get(v) : null;

        const fish = useFish ? activeFishLinkRegistry.get(u)?.get(v) : null;

        if (als) {
          usedAlses.push(als.cells);
        } else if (fish) {
          usedFishes.push(fish);
          fishNodes.add(u);
          fishNodes.add(v);
        }
      }

      return {
        change: true,
        type: "remove",
        cells: removals,
        placement,
        hint: {
          name: name,
          mainInfo: t("teks_msg_138", eurekaStr.split("-")[0]),
          detail: `[${path.length}] ${eurekaStr}`,
        },
        applyVisuals: () => {
          if (singleDigit) {
            highlightedDigit = path[0].digits[0];
            highlightState = 1;
          } else if (bivalueOnly) {
            highlightedDigit = null;
            highlightState = 2;
          } else {
            highlightedDigit = null;
            highlightState = 0;
          }

          path.forEach((node, idx) => {
            if (fishNodes.has(node)) return;

            node.cells.forEach((id) => {
              const cr = Math.floor(id / 9);
              const cc = id % 9;
              const colorIdx = idx % 2 === 0 ? 5 : 4;
              node.digits.forEach((d) => {
                if (boardState[cr][cc].pencils.has(d)) {
                  boardState[cr][cc].pencilColors.set(
                    d,
                    candidateColorPalette[colorIdx],
                  );
                }
              });
            });
          });

          removals.forEach((el) => {
            boardState[el.r][el.c].candSlashes.set(el.num, markColorPalette[0]);
          });

          let colorCodes = [6, 7, 2, 3, 4, 1, 8];
          let colorCount = -1;

          if (useAls && usedAlses.length > 0) {
            usedAlses.forEach((cells, idx) => {
              colorCount++;
              const colorCode = colorCodes[colorCount % 8];
              cells.forEach(([r, c]) => {
                if (window.addCellColor)
                  window.addCellColor(r, c, cellColorPalette[colorCode]);
                else boardState[r][c].cellColor = cellColorPalette[colorCode];
              });
            });
          }

          if (useFish && usedFishes.length > 0) {
            // A fish only circles its own candidates: no cell tint and no
            // internal lines, so the chain drawn on top stays readable.
            usedFishes.forEach((fish) => {
              colorCount++;
              const fishColor = colorCodes[colorCount % colorCodes.length];

              fish.allCells.forEach((id) => {
                const r = Math.floor(id / 9);
                const c = id % 9;
                if (!boardState[r][c].pencils.has(fish.d)) return;
                if (window.addCandidateCircle)
                  window.addCandidateCircle(
                    r,
                    c,
                    fish.d,
                    markColorPalette[fishColor],
                  );
                else
                  boardState[r][c].candCircles.set(
                    fish.d,
                    markColorPalette[fishColor],
                  );
              });
            });
          }

          const getClosestCells = (nodeA, nodeB) => {
            let minD = Infinity;
            let bestA = nodeA.cells[0],
              bestB = nodeB.cells[0];
            for (const a of nodeA.cells) {
              const ar = Math.floor(a / 9),
                ac = a % 9;
              for (const b of nodeB.cells) {
                const br = Math.floor(b / 9),
                  bc = b % 9;
                const d = Math.abs(ar - br) + Math.abs(ac - bc);
                if (d < minD) {
                  minD = d;
                  bestA = a;
                  bestB = b;
                }
              }
            }
            return [
              [Math.floor(bestA / 9), bestA % 9],
              [Math.floor(bestB / 9), bestB % 9],
            ];
          };

          const drawGroup = (node, idx) => {
            if (fishNodes.has(node)) return; // Circled instead
            if (node.cells.length > 1) {
              const colorIdx = idx % 2 === 0 ? 5 : 4;
              for (let i = 0; i < node.cells.length - 1; i++) {
                const r1 = Math.floor(node.cells[i] / 9),
                  c1 = node.cells[i] % 9;
                const r2 = Math.floor(node.cells[i + 1] / 9),
                  c2 = node.cells[i + 1] % 9;
                drawnLines.push({
                  r1,
                  c1,
                  n1: node.digits[0],
                  r2,
                  c2,
                  n2: node.digits[0],
                  color: lineColorPalette[colorIdx],
                  style: "solid",
                });
              }
            }
          };

          for (let i = 0; i < fullVisualChain.length - 1; i++) {
            const u = fullVisualChain[i];
            const v = fullVisualChain[i + 1];

            if (i === 0) drawGroup(u, 0);
            if (i < path.length) drawGroup(v, (i + 1) % path.length);

            let skipLine = false;
            // Fish OR links sit on the even steps; the circles already show them.
            if (useFish && i % 2 === 0 && activeFishLinkRegistry.get(u)?.get(v))
              skipLine = true;

            if (!skipLine) {
              const [cA, cB] = getClosestCells(u, v);
              drawnLines.push({
                r1: cA[0],
                c1: cA[1],
                n1: u.digits[0],
                r2: cB[0],
                c2: cB[1],
                n2: v.digits[0],
                color: lineColorPalette[0],
                style: i % 2 === 0 ? "solid" : "dash",
              });
            }
          }
        },
      };
    };

    for (let cycle = 0; cycle < maxCycles; cycle++) {
      let anyExpansion = false;

      // Expand NAND links only from newly discovered OR nodes.
      for (const A of interestedNodes) {
        const nextFrontier = new Set();

        for (const B of A.OrFrontier) {
          for (const C of B.NandNodes) {
            if (!A.OrNandNodes.has(C)) {
              A.OrNandNodes.add(C);
              nextFrontier.add(C);
              anyExpansion = true;
            }
          }
        }

        A.OrNandFrontier = nextFrontier;
      }

      // Expand OR links only from newly discovered OR-NAND nodes.
      for (const A of interestedNodes) {
        const nextFrontier = new Set();

        for (const C of A.OrNandFrontier) {
          for (const D of C.OrNodes) {
            if (!A.OrNodes.has(D)) {
              A.OrNodes.add(D);
              nextFrontier.add(D);
              anyExpansion = true;
            }
          }
        }

        A.OrFrontier = nextFrontier;
      }

      if (!anyExpansion) {
        break;
      }

      if (
        techniqueName === t("teks_msg_181") ||
        techniqueName === t("teks_msg_182")
      ) {
        if (cycle !== 1) continue;
      }

      let maxPathLen = getMaxPathLenForCycle(cycle);

      // Priority 1: AIC Ring
      for (const A of interestedNodes) {
        for (const D of A.OrNodes) {
          if (D.index <= A.index || !A.NandNodes.has(D)) continue;
          if (SameDigits && A.digits[0] !== D.digits[0]) continue;
          if (deadRings.has(`${A.index}_${D.index}`)) continue;

          const path = findAICPath(A, D, maxPathLen, "ring");

          if (path) {
            let ringRemovals = [];
            for (let i = 1; i < path.length - 1; i += 2) {
              const { hasOverlap, intersection } =
                techniques.getBitsetIntersection(
                  path[i].NandBitset,
                  path[i + 1].NandBitset,
                );
              if (hasOverlap)
                ringRemovals.push(...extractRemovals(intersection));
            }
            const { hasOverlap, intersection } =
              techniques.getBitsetIntersection(
                path[path.length - 1].NandBitset,
                path[0].NandBitset,
              );
            if (hasOverlap) ringRemovals.push(...extractRemovals(intersection));

            if (useAls) {
              for (let i = 0; i < path.length; i += 2) {
                const u = path[i];
                const v = path[(i + 1) % path.length];

                if (u.digits[0] !== v.digits[0]) {
                  const als = activeAlsLinkRegistry.get(u)?.get(v);
                  if (als) {
                    const d1 = u.digits[0];
                    const d2 = v.digits[0];
                    const otherDigits = Object.keys(als.candMap)
                      .map(Number)
                      .filter((d) => d !== d1 && d !== d2);
                    const alsCellIds = new Set(
                      als.cells.map((c) => c[0] * 9 + c[1]),
                    );

                    for (const z of otherDigits) {
                      const cellsZ = als.candMap[z].map(([r, c]) => r * 9 + c);
                      const nodeZ = getNode(cellsZ, z);

                      for (let p = 0; p < 3; p++) {
                        let mask = nodeZ.NandBitset[z - 1][p];
                        let bitPos = 0;
                        while (mask > 0) {
                          if ((mask & 1) !== 0) {
                            const id = p * 27 + bitPos;
                            const r = Math.floor(id / 9);
                            const c = id % 9;
                            if (
                              pencils[r][c] &&
                              pencils[r][c].has(z) &&
                              !alsCellIds.has(id)
                            ) {
                              ringRemovals.push({ r, c, num: z });
                            }
                          }
                          mask >>>= 1;
                          bitPos++;
                        }
                      }
                    }
                  }
                }
              }
            }

            if (useFish) {
              // Collect all fish OR-gate node pairs in this ring
              const ringFishCoverNodesInRing = new Set(); // body/fin nodes that ARE in ring OR gates
              const ringFishObjs = []; // { fish, linkedNodes: Set<node> } per fish used in ring

              // fullVisualChain is path + path[0] for ring, but here we build from `path`
              for (let i = 0; i < path.length; i += 2) {
                const u = path[i];
                const v = path[(i + 1) % path.length];
                const fish = activeFishLinkRegistry.get(u)?.get(v);
                if (fish && fish.isRank1) {
                  ringFishCoverNodesInRing.add(u);
                  ringFishCoverNodesInRing.add(v);
                  ringFishObjs.push({ fish, linkedNodes: new Set([u, v]) });
                }
              }

              for (const { fish, linkedNodes } of ringFishObjs) {
                // For each cover-body node of this fish NOT in the ring's OR gate:
                for (const coverNode of fish.coverBodyNodes) {
                  if (linkedNodes.has(coverNode)) continue; // This cover participates in the ring link — skip
                  // XOR forces exactly one cell in coverNode to be true for digit d,
                  // so eliminate d from all cells that see ALL cells of coverNode (i.e., apply NandBitset).
                  const d = fish.d;
                  for (let p = 0; p < 3; p++) {
                    let mask = coverNode.NandBitset[d - 1][p];
                    let bitPos = 0;
                    while (mask > 0) {
                      if ((mask & 1) !== 0) {
                        const id = p * 27 + bitPos;
                        const r = Math.floor(id / 9);
                        const c = id % 9;
                        if (pencils[r][c] && pencils[r][c].has(d)) {
                          ringRemovals.push({ r, c, num: d });
                        }
                      }
                      mask >>>= 1;
                      bitPos++;
                    }
                  }
                }
              }
            }

            if (ringRemovals.length > 0) {
              const { removals: uniqueRingRemovals, key: removalsKey } =
                canonicalRemovalPack(ringRemovals);

              if (!stringifiedFoundRemovals.has(removalsKey)) {
                stringifiedFoundRemovals.add(removalsKey);

                const chainStr = t("teks_msg_chain_term");
                const aicStr = t("teks_msg_aic_term");
                const ringName =
                  techniqueName === t("teks_msg_136")
                    ? t("teks_msg_aic_ring")
                    : techniqueName.includes(aicStr)
                      ? techniqueName + t("teks_msg_ring_suffix")
                      : techniqueName.includes(chainStr)
                        ? techniqueName.replace(
                            chainStr,
                            t("teks_msg_ring_term"),
                          )
                        : useAlsXZ || techniqueName === t("teks_msg_182")
                          ? t("teks_msg_doubly_linked") + techniqueName
                          : techniqueName === t("teks_msg_181")
                            ? t("teks_msg_triply_linked") + techniqueName
                            : techniqueName + t("teks_msg_ring_suffix");

                const res = buildResult(
                  uniqueRingRemovals,
                  ringName,
                  path,
                  true,
                );

                if (!findAll) return res;
                results.push(res);
              }
            } else {
              deadRings.add(`${A.index}_${D.index}`);
            }
          }
        }
      }
      if (results.length > 0 && !findAll) return results[0];

      if (techniqueName === t("teks_msg_182")) maxPathLen = 6;

      // Priority 2: DN Loop
      if (!bivalueOnly && !useAlsXZ) {
        for (const A of interestedNodes) {
          for (const D of A.OrNodes) {
            if (D.index < A.index) continue;
            if (SameDigits && A.digits[0] !== D.digits[0]) continue;
            // Strict equality (original): A and D are the same node
            const isEqual = D.index === A.index;

            const aSubsetOfD =
              !isEqual && techniques.isBitsetSubset(A.NodeBitset, D.NodeBitset);

            const dSubsetOfA =
              !isEqual &&
              !aSubsetOfD &&
              techniques.isBitsetSubset(D.NodeBitset, A.NodeBitset);

            if (!isEqual && !aSubsetOfD && !dSubsetOfA) continue;

            // Choose which end's NandBitset to eliminate from:
            const trueNode = aSubsetOfD ? D : A;
            const removalBitset = trueNode.NandBitset;
            let dnRemovals = extractRemovals(removalBitset);

            // A basic node proven true is a placement. In the subset cases the
            // proven node is always the superset, so it is never basic there.
            const dnPlacement =
              isEqual && trueNode.isSingleCell && trueNode.isSingleDigit
                ? {
                    r: Math.floor(trueNode.cells[0] / 9),
                    c: trueNode.cells[0] % 9,
                    num: trueNode.digits[0],
                  }
                : null;

            if (dnRemovals.length > 0) {
              const removalsKey = JSON.stringify(
                dnRemovals.sort(
                  (a, b) => a.r - b.r || a.c - b.c || a.num - b.num,
                ),
              );

              if (!stringifiedFoundRemovals.has(removalsKey)) {
                const path = findAICPath(A, D, maxPathLen, "dnLoop");

                if (!path) continue;

                stringifiedFoundRemovals.add(removalsKey);

                const chainStr = t("teks_msg_chain_term");
                const aicStr = t("teks_msg_aic_term");
                const DNLName =
                  techniqueName === t("teks_msg_136")
                    ? t("teks_msg_140")
                    : techniqueName.includes(aicStr)
                      ? techniqueName.replace(aicStr, t("teks_msg_dnloop_term"))
                      : techniqueName.includes(chainStr)
                        ? techniqueName.replace(
                            chainStr,
                            t("teks_msg_dnloop_term"),
                          )
                        : techniqueName;

                const res = buildResult(
                  dnRemovals,
                  DNLName,
                  path,
                  false,
                  dnPlacement,
                );

                if (!findAll) return res;
                results.push(res);
              }
            }
          }
        }

        if (results.length > 0 && !findAll) return results[0];
      }

      // Priority 3: Standard AIC
      for (const A of interestedNodes) {
        for (const D of A.OrNodes) {
          if (D.index <= A.index) continue;
          if (deadRings.has(`${A.index}_${D.index}`)) continue;
          if (SameDigits && A.digits[0] !== D.digits[0]) continue;

          const { hasOverlap, intersection } = techniques.getBitsetIntersection(
            A.NandBitset,
            D.NandBitset,
          );
          if (hasOverlap) {
            const aicRemovals = extractRemovals(intersection);

            if (aicRemovals.length > 0) {
              const removalsKey = JSON.stringify(
                aicRemovals.sort(
                  (a, b) => a.r - b.r || a.c - b.c || a.num - b.num,
                ),
              );

              if (!stringifiedFoundRemovals.has(removalsKey)) {
                const path = findAICPath(A, D, maxPathLen, "chain");

                if (!path) continue;

                stringifiedFoundRemovals.add(removalsKey);

                const res = buildResult(
                  aicRemovals,
                  techniqueName,
                  path,
                  false,
                );

                if (!findAll) return res;
                results.push(res);
              }
            }
          }
        }
      }
      if (results.length > 0 && !findAll) return results[0];
    }

    return findAll ? results : { change: false };
  },

  // --- Technique Wrappers ---

  xChain: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: true,
        bivalueOnly: false,
        useGrouped: false,
        useAls: false,
        maxCycle: 2,
        nameOverride: t("teks_msg_141"),
      },
      findAll,
    );
  },

  groupedXChain: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: true,
        bivalueOnly: false,
        useGrouped: true,
        useAls: false,
        maxCycle: 2,
        nameOverride: t("teks_msg_142"),
      },
      findAll,
    );
  },

  xyChain: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: true,
        useGrouped: false,
        useAls: false,
        maxCycle: 3,
        nameOverride: t("teks_msg_143"),
      },
      findAll,
    );
  },

  alternatingInferenceChain: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: false,
        useAls: false,
        maxCycle: 3,
      },
      findAll,
    );
  },

  groupedAIC: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: true,
        useAls: false,
        maxCycle: 3,
        nameOverride: t("teks_msg_144"),
      },
      findAll,
    );
  },

  wxyzWing: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: false,
        useAlsXZ: true,
        useAls: true,

        // Exactly two OR gates: four AIC nodes.
        maxCycle: 1,

        nameOverride: t("teks_msg_145"),

        /*
         * Preserve the three-cell ALS representation even when a
         * larger ALS has an equivalent/dominating intra-ALS OR link.
         */
        preserveAlsSizes: [3],

        /*
         * If the exact same node pair is produced by a three-cell ALS
         * and by a larger ALS, register the three-cell ALS.
         */
        preferredAlsSize: 3,

        // WXYZ consists only of one bivalue OR gate and one ALS OR gate.
        allowedOrLinkTypes: ["als", "bivalue"],

        pathFilter: (path, cache, { getOrLinkType, getAlsForLink }) => {
          if (path.length !== 4) {
            return false;
          }

          const isBivalue = (nodeA, nodeB) =>
            getOrLinkType(nodeA, nodeB) === "bivalue";

          const isThreeCellAls = (nodeA, nodeB) => {
            const als = getAlsForLink(nodeA, nodeB);

            return (
              getOrLinkType(nodeA, nodeB) === "als" && als?.cells.length === 3
            );
          };

          const firstIsBivalue = isBivalue(path[0], path[1]);
          const firstIsAls3 = isThreeCellAls(path[0], path[1]);

          const secondIsBivalue = isBivalue(path[2], path[3]);
          const secondIsAls3 = isThreeCellAls(path[2], path[3]);

          /*
           * Exactly one one-cell ALS/bivalue link and one
           * three-cell ALS link.
           */
          return (
            (firstIsBivalue && secondIsAls3) || (secondIsBivalue && firstIsAls3)
          );
        },
      },
      findAll,
    );
  },

  alsXZ: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: false,
        useAlsXZ: true,
        useAls: true,
        maxCycle: 1,
        nameOverride: t("teks_msg_146"),
      },
      findAll,
    );
  },

  alsXYWing: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: false,
        useAls: true,
        useAlsOnly: true,
        endSameDigits: true,
        maxCycle: 2,
        nameOverride: t("teks_msg_181"),
        allowedOrLinkTypes: ["als", "bivalue"],

        pathFilter: (path, cache, { kind, getOrLinkType }) => {
          if (path.length !== 6) return false;

          for (let i = 0; i < path.length; i += 2) {
            const type = getOrLinkType(path[i], path[i + 1]);

            if (type !== "als" && type !== "bivalue") {
              return false;
            }
          }

          return true;
        },
      },
      findAll,
    );
  },

  alsWWing: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: true,
        useAls: true,
        endSameDigits: true,
        maxCycle: 2,
        nameOverride: t("teks_msg_182"),
        allowedOrLinkTypes: ["als", "bivalue", "region"],

        pathFilter: (path, cache, { kind, getOrLinkType }) => {
          const isIntraAls = (type) => type === "als" || type === "bivalue";

          const orTypes = [];

          for (let i = 0; i < path.length; i += 2) {
            orTypes.push(getOrLinkType(path[i], path[i + 1]));
          }

          if (path.length === 6) {
            return (
              isIntraAls(orTypes[0]) &&
              orTypes[1] === "region" &&
              isIntraAls(orTypes[2])
            );
          } else if (kind === "ring" && path.length === 8) {
            const phase0 = orTypes.every((type, index) =>
              index % 2 === 0 ? isIntraAls(type) : type === "region",
            );

            return phase0;
          }

          return false;
        },
      },
      findAll,
    );
  },

  alsAic: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: true,
        useAls: true,
        maxCycle: 3,
        nameOverride: t("teks_msg_147"),
      },
      findAll,
    );
  },

  complexAic: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: true,
        useAls: true,
        useFish: true,
        maxCycle: 3,
        nameOverride: t("teks_msg_148"),
      },
      findAll,
    );
  },

  // --- BITWISE HELPERS ---
  _bits: {
    popcount: (n) => {
      // Handle BigInt (used for 81-cell position masks)
      if (typeof n === "bigint") {
        let count = 0;
        while (n !== 0n) {
          n &= n - 1n; // Brian Kernighan's algorithm: clears the least significant bit set
          count++;
        }
        return count;
      }

      // Handle Number (used for 9-digit candidate masks)
      // SWAR algorithm for 32-bit integers
      n = n - ((n >> 1) & 0x55555555);
      n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
      return (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
    },
    maskToDigits: (n) => {
      const res = [];
      // Assumes n is a Number (candidate mask)
      for (let i = 1; i <= 9; i++) if ((n >> (i - 1)) & 1) res.push(i);
      return res;
    },
    maskFromSet: (set) => {
      let m = 0;
      for (const d of set) m |= 1 << (d - 1);
      return m;
    },
  },

  // --- ALS COLLECTION ENGINE ---
  _calculateALSHash: (cells) => {
    if (cells.length === 0) return 0;

    // Sort to ensure consistency, though inputs are usually sorted by unit generation
    // We strictly follow the C++ priority: Row > Col > Box

    // Check Row
    const r0 = cells[0][0];
    const isRow = cells.every((c) => c[0] === r0);
    if (isRow) {
      let mask = 0;
      for (const [r, c] of cells) mask |= 1 << c;
      // Type 00 (Row) | Unit Index | Cell Mask
      return (0 << 13) | (r0 << 9) | mask;
    }

    // Check Col
    const c0 = cells[0][1];
    const isCol = cells.every((c) => c[1] === c0);
    if (isCol) {
      let mask = 0;
      for (const [r, c] of cells) mask |= 1 << r;
      // Type 01 (Col) | Unit Index | Cell Mask
      return (1 << 13) | (c0 << 9) | mask;
    }

    // Assume Box (valid ALSs must belong to *some* unit)
    const b0 = techniques._getBoxIndex(cells[0][0], cells[0][1]);
    let mask = 0;
    for (const [r, c] of cells) {
      const boxCellIdx = (r % 3) * 3 + (c % 3);
      mask |= 1 << boxCellIdx;
    }
    // Type 10 (Box) | Unit Index | Cell Mask
    return (2 << 13) | (b0 << 9) | mask;
  },

  _collectAllALS: (board, pencils, minSize = 1, maxSize = 8) => {
    const uniqueALS = new Map();
    const unitTypes = [
      { name: "box", label: t("teks_msg_7") },
      { name: "row", label: t("teks_msg_14") },
      { name: "col", label: t("teks_msg_15") },
    ];

    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        const unitCells = techniques._getUnitCells(name, i);
        const emptyCells = unitCells.filter(([r, c]) => board[r][c] === 0);
        const n = emptyCells.length;
        if (n === 0) continue;

        const effectiveMaxSize = Math.min(maxSize, n - 1);
        const nakedSubsets = [];

        for (let mask = 1; mask < 1 << n; mask++) {
          const size = techniques._bits.popcount(mask);
          if (size > 1 && size < n) {
            let candMask = 0;
            for (let bit = 0; bit < n; bit++) {
              if (mask & (1 << bit)) {
                const [r, c] = emptyCells[bit];
                candMask |= techniques._bits.maskFromSet(pencils[r][c]);
              }
            }
            if (techniques._bits.popcount(candMask) === size) {
              nakedSubsets.push(mask);
            }
          }
        }

        const tainted = new Set();
        for (const ns of nakedSubsets) {
          let sup = ns;
          const limit = 1 << n;
          while (sup < limit) {
            tainted.add(sup);
            sup = (sup + 1) | ns;
          }
        }

        for (let mask = 1; mask < 1 << n; mask++) {
          const k = techniques._bits.popcount(mask);
          if (k < minSize || k > effectiveMaxSize) continue;
          if (tainted.has(mask)) continue;

          if (name !== "box" && k > 1) {
            let firstBox = -1;
            let confined = true;
            for (let bit = 0; bit < n; bit++) {
              if (mask & (1 << bit)) {
                const [r, c] = emptyCells[bit];
                const b = techniques._getBoxIndex(r, c);
                if (firstBox === -1) firstBox = b;
                else if (firstBox !== b) {
                  confined = false;
                  break;
                }
              }
            }
            if (confined) continue;
          }

          let currentMask = 0;
          for (let bit = 0; bit < n; bit++) {
            if (mask & (1 << bit)) {
              const [r, c] = emptyCells[bit];
              currentMask |= techniques._bits.maskFromSet(pencils[r][c]);
            }
          }

          if (techniques._bits.popcount(currentMask) === k + 1) {
            const currentCells = [];
            for (let bit = 0; bit < n; bit++) {
              if (mask & (1 << bit)) currentCells.push(emptyCells[bit]);
            }

            // Updated to 3x27 bitsets format
            const positions = [0, 0, 0];
            const candidatePositions = Array.from({ length: 9 }, () => [
              0, 0, 0,
            ]);
            const candMap = {};

            for (const [r, c] of currentCells) {
              const id = r * 9 + c;
              const part = Math.floor(id / 27);
              const bitPos = id % 27;

              positions[part] |= 1 << bitPos;

              for (const d of pencils[r][c]) {
                candidatePositions[d - 1][part] |= 1 << bitPos;
                if (!candMap[d]) candMap[d] = [];
                candMap[d].push([r, c]);
              }
            }

            const hash = techniques._calculateALSHash(currentCells);
            if (!uniqueALS.has(hash)) {
              uniqueALS.set(hash, {
                cells: currentCells,
                candidates: currentMask,
                mask: currentMask,
                size: k,
                candMap: candMap,
                unitType: name,
                unitIndex: i,
                unitName: t("teks_msg_17", label, i + 1),
                hash: hash,
                positions: positions,
                candidatePositions: candidatePositions,
              });
            }
          }
        }
      }
    }

    alses = Array.from(uniqueALS.values()).sort((a, b) => a.hash - b.hash);
    return alses;
  },

  _deathBlossomCore: (
    board,
    pencils,
    isRegion,
    findAll = false,
    focusKind = null,
  ) => {
    const results = [];
    techniques._useSharedAICCache(board, pencils);
    const cache = techniques._aicCache;
    const isAals = focusKind === "aals";
    const isCell = !isRegion && !isAals;

    // Ensure base nodes are generated
    if (cache.AllNodes.length === 0) {
      const candidateBitsets = techniques.buildCandidateBitsets(board, pencils);
      const baseNodes =
        techniques.generateBasicNodesFromBitsets(candidateBitsets);
      baseNodes.forEach((n) => {
        const key = `${n.digits.join(",")}_${n.cells
          .slice()
          .sort((a, b) => a - b)
          .join(",")}`;
        cache.NodeCache.set(key, n);
        cache.AllNodes.push(n);
      });
    }

    const allNodes = cache.AllNodes;
    const nodeCache = cache.NodeCache;

    const getNode = (cells, digits) => {
      const dArr = Array.isArray(digits) ? digits : [digits];
      const key = `${dArr.join(",")}_${cells
        .slice()
        .sort((a, b) => a - b)
        .join(",")}`;
      if (nodeCache.has(key)) return nodeCache.get(key);
      const newNode = new AICNode(cells, dArr);
      nodeCache.set(key, newNode);
      allNodes.push(newNode);
      return newNode;
    };

    // 1. Prepare OR Gate Maps (Only Bivalue and ALS)
    let orMap = new Map();

    if (cache.BivalueOrMap.size === 0) {
      cache.BivalueOrMap = techniques.buildBivalueOrMap(allNodes);
    }
    orMap = techniques.mergeOrMaps(orMap, cache.BivalueOrMap);

    let alsLinkRegistry = cache.AlsLinkRegistry;
    if (cache.AlsMap.size === 0) {
      cache.AlsMap = techniques.buildAlsOrMap(
        board,
        pencils,
        getNode,
        alsLinkRegistry,
        false,
      );
    }
    orMap = techniques.mergeOrMaps(orMap, cache.AlsMap);

    // Helper for location string
    const getLoc = (cells, preferBox = false) => {
      if (cells.length === 0) return "";
      if (cells.length === 1) {
        const r = Math.floor(cells[0] / 9);
        const c = cells[0] % 9;
        if (preferBox) {
          const b = Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1;
          const p = (r % 3) * 3 + (c % 3) + 1;
          return `b${b}p${p}`;
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
      const cols = [...new Set(cells.map((id) => (id % 9) + 1))].sort(
        (a, b) => a - b,
      );
      if (rows.length === 1) return `r${rows[0]}c${cols.join("")}`;
      if (cols.length === 1) return `r${rows.join("")}c${cols[0]}`;
      return [...cells]
        .sort((a, b) => a - b)
        .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
        .join("");
    };

    // 2. Collect and sort potential stems (3 to 6 candidates)
    const potentialStems = [];

    if (isCell) {
      // Cell Death Blossom
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const size = pencils[r][c].size;
          if (size >= 3 && size <= 6) {
            potentialStems.push({
              size,
              r,
              c,
              cellId: r * 9 + c,
              startDigits: Array.from(pencils[r][c]).sort((a, b) => a - b),
            });
          }
        }
      }
    } else if (isRegion) {
      // Region Death Blossom
      for (let d = 1; d <= 9; d++) {
        // Rows
        for (let r = 0; r < 9; r++) {
          const cells = [];
          for (let c = 0; c < 9; c++)
            if (pencils[r][c].has(d)) cells.push(r * 9 + c);
          if (cells.length >= 3 && cells.length <= 6)
            potentialStems.push({
              size: cells.length,
              digit: d,
              cells,
              houseName: t("teks_msg_153", r + 1),
            });
        }
        // Cols
        for (let c = 0; c < 9; c++) {
          const cells = [];
          for (let r = 0; r < 9; r++)
            if (pencils[r][c].has(d)) cells.push(r * 9 + c);
          if (cells.length >= 3 && cells.length <= 6)
            potentialStems.push({
              size: cells.length,
              digit: d,
              cells,
              houseName: t("teks_msg_154", c + 1),
            });
        }
        // Boxes
        for (let b = 0; b < 9; b++) {
          const cells = [];
          const br = Math.floor(b / 3) * 3;
          const bc = (b % 3) * 3;
          for (let i = 0; i < 9; i++) {
            const r = br + Math.floor(i / 3);
            const c = bc + (i % 3);
            if (pencils[r][c].has(d)) cells.push(r * 9 + c);
          }
          if (cells.length >= 3 && cells.length <= 6)
            potentialStems.push({
              size: cells.length,
              digit: d,
              cells,
              houseName: t("teks_msg_155", b + 1),
            });
        }
      }
    } else {
      // AALS Death Blossom
      const seenAals = new Set();
      const unitLabel = (unit) =>
        unit < 9
          ? t("teks_msg_153", unit + 1)
          : unit < 18
            ? t("teks_msg_154", unit - 8)
            : t("teks_msg_155", unit - 17);

      for (let unit = 0; unit < 27; unit++) {
        const eligibleCells = [];
        for (let id = 0; id < 81; id++) {
          const part = Math.floor(id / 27);
          const bit = id % 27;
          if ((UNIT_BITSETS[unit][part] & (1 << bit)) === 0) continue;
          const r = Math.floor(id / 9);
          const c = id % 9;
          if (board[r][c] === 0 && pencils[r][c].size > 0) {
            eligibleCells.push(id);
          }
        }

        const addAalsStems = (cells) => {
          let mask = 0;
          const cellsByDigit = Array.from({ length: 10 }, () => []);
          for (const id of cells) {
            const r = Math.floor(id / 9);
            const c = id % 9;
            for (const digit of pencils[r][c]) {
              mask |= 1 << digit;
              cellsByDigit[digit].push(id);
            }
          }
          if (techniques._bits.popcount(mask) !== cells.length + 2) return;

          const aalsKey = [...cells].sort((a, b) => a - b).join(",");
          if (seenAals.has(aalsKey)) return;
          seenAals.add(aalsKey);

          const digits = [];
          for (let digit = 1; digit <= 9; digit++) {
            if (mask & (1 << digit)) digits.push(digit);
          }
          for (let first = 0; first < digits.length - 2; first++) {
            for (let second = first + 1; second < digits.length - 1; second++) {
              for (let third = second + 1; third < digits.length; third++) {
                const startDigits = [
                  digits[first],
                  digits[second],
                  digits[third],
                ];
                const startCandidates = startDigits.flatMap((digit) =>
                  cellsByDigit[digit].map((id) => ({ id, digit })),
                );
                if (startCandidates.length < 3 || startCandidates.length > 5) {
                  continue;
                }

                potentialStems.push({
                  size: startCandidates.length,
                  kind: "aals",
                  unit,
                  cells: [...cells],
                  houseName: unitLabel(unit),
                  startDigits,
                  startCandidates,
                  startCandidateKeys: new Set(
                    startCandidates.map(({ id, digit }) => `${id}:${digit}`),
                  ),
                });
              }
            }
          }
        };

        const chooseCells = (start, size, cells) => {
          if (cells.length === size) {
            addAalsStems(cells);
            return;
          }
          const needed = size - cells.length;
          for (
            let index = start;
            index <= eligibleCells.length - needed;
            index++
          ) {
            cells.push(eligibleCells[index]);
            chooseCells(index + 1, size, cells);
            cells.pop();
          }
        };

        for (let size = 2; size <= Math.min(7, eligibleCells.length); size++) {
          chooseCells(0, size, []);
        }
      }
    }

    // Sort stems so cells/regions with fewer candidates are processed first
    potentialStems.sort((a, b) => a.size - b.size);

    // 3. Iterate through sorted stem cells/regions
    for (const stem of potentialStems) {
      const startNodes = isCell
        ? stem.startDigits.map((d) => getNode([stem.cellId], [d]))
        : isRegion
          ? stem.cells.map((cId) => getNode([cId], [stem.digit]))
          : stem.startCandidates.map(({ id, digit }) => getNode([id], [digit]));

      const reachMap = new Map();

      // 4. Collect NandNodes and NandOrNodes
      for (const s of startNodes) {
        const reachable = [{ node: s, path: [s] }];

        // Evaluate NandNodes via NandBitset
        const nandNodes = allNodes.filter((n) => {
          if (n === s) return false;

          // Preserve the existing Cell/Region exclusion for a different
          // candidate in the same start cell.
          if (!isAals && n.cells.length === 1 && n.cells[0] === s.cells[0]) {
            return false;
          }

          // Exclude the digit from the different cell of the stem house (Applies to Region only)
          if (
            isRegion &&
            n.digits.length === 1 &&
            n.digits[0] === stem.digit &&
            n.cells.length === 1 &&
            stem.cells.includes(n.cells[0])
          )
            return false;

          // AALS start candidates belong to the same OR gate, so a branch
          // cannot use another start candidate as its first NAND node.
          if (
            isAals &&
            n.cells.length === 1 &&
            stem.startCandidateKeys.has(`${n.cells[0]}:${n.digits[0]}`)
          ) {
            return false;
          }

          return techniques.isBitsetSubset(n.NodeBitset, s.NandBitset);
        });

        for (const n of nandNodes) {
          if (orMap.has(n)) {
            // Evaluate OR nodes of NandNodes -> NandOrNodes
            for (const o of orMap.get(n)) {
              reachable.push({ node: o, path: [s, n, o] });
            }
          }
        }
        reachMap.set(s, reachable);
      }

      const branchMasks = startNodes.map((s) => {
        const mask = Array.from({ length: 9 }, () => [0, 0, 0]);
        for (const { node } of reachMap.get(s)) {
          for (let d = 0; d < 9; d++) {
            for (let p = 0; p < 3; p++) {
              mask[d][p] |= node.NandBitset[d][p]; // Union of branch eliminations
            }
          }
        }
        return mask;
      });

      const commonMask = Array.from({ length: 9 }, () => [0, 0, 0]);
      for (let d = 0; d < 9; d++) {
        for (let p = 0; p < 3; p++) {
          let res = branchMasks[0][d][p];
          for (let i = 1; i < branchMasks.length; i++) {
            res &= branchMasks[i][d][p]; // Intersection of all branches
          }
          commonMask[d][p] = res;
        }
      }

      // 6. Extract eliminations
      const maskToElims = (mask) => {
        const found = [];
        for (let d = 0; d < 9; d++) {
          for (let p = 0; p < 3; p++) {
            let m = mask[d][p];
            let bitPos = 0;
            while (m > 0) {
              if (m & 1) {
                const id = p * 27 + bitPos;
                const er = Math.floor(id / 9);
                const ec = id % 9;
                const num = d + 1;

                // Ensure it's not the stem itself
                let isStemCandidate = false;
                if (isCell) {
                  if (er === stem.r && ec === stem.c) isStemCandidate = true;
                } else if (isRegion) {
                  if (num === stem.digit && stem.cells.includes(id))
                    isStemCandidate = true;
                } else if (stem.startCandidateKeys.has(`${id}:${num}`)) {
                  isStemCandidate = true;
                }

                if (
                  pencils[er][ec] &&
                  pencils[er][ec].has(num) &&
                  !isStemCandidate
                ) {
                  found.push({ r: er, c: ec, num });
                }
              }
              m >>>= 1;
              bitPos++;
            }
          }
        }
        return found;
      };

      const reachableElims = maskToElims(commonMask);

      // A branch concludes with the last node of its chain, so the chains
      // prove exactly the candidates those conclusions all see.
      const provenElims = (paths) => {
        const last = paths.map((path) => path[path.length - 1]);
        const mask = Array.from({ length: 9 }, () => [0, 0, 0]);

        for (let d = 0; d < 9; d++) {
          for (let p = 0; p < 3; p++) {
            let bits = last[0].NandBitset[d][p];
            for (let i = 1; i < last.length; i++) {
              bits &= last[i].NandBitset[d][p];
            }
            mask[d][p] = bits;
          }
        }

        // A branch that asserts a candidate cannot also be shown removing
        // it, so those candidates are left to another blossom.
        const asserted = new Set();
        for (const path of paths) {
          for (let i = 0; i < path.length; i += 2) {
            for (const id of path[i].cells) {
              asserted.add(`${id}:${path[i].digits[0]}`);
            }
          }
        }

        return maskToElims(mask).filter(
          (el) => !asserted.has(`${el.r * 9 + el.c}:${el.num}`),
        );
      };

      let chosenPaths = null;
      let elims = null;

      for (const target of reachableElims) {
        const targetDigit = target.num;
        const targetId = target.r * 9 + target.c;
        const targetPart = Math.floor(targetId / 27);
        const targetBit = targetId % 27;

        const paths = [];
        for (const s of startNodes) {
          const reachList = reachMap.get(s);
          const validReach = reachList.find((rObj) => {
            return (
              (rObj.node.NandBitset[targetDigit - 1][targetPart] &
                (1 << targetBit)) !==
              0
            );
          });
          if (validReach) paths.push(validReach.path);
        }

        // Every stem candidate has to contribute a branch.
        if (paths.length !== startNodes.length) continue;

        const proven = provenElims(paths);
        if (proven.length === 0) continue;

        chosenPaths = paths;
        elims = proven;
        break;
      }

      if (chosenPaths) {
        const chainStrs = chosenPaths.map((path) => {
          const startNode = path[0];
          let str = `(${startNode.digits[0]})r${Math.floor(startNode.cells[0] / 9) + 1}c${(startNode.cells[0] % 9) + 1}`;
          if (path.length === 3) {
            const n = path[1];
            const o = path[2];
            const als = alsLinkRegistry.get(n)?.get(o);

            if (als) {
              const preferBox =
                als.unitName && als.unitName.includes(t("teks_msg_7"));
              const alsLoc = getLoc(
                als.cells.map((ac) => ac[0] * 9 + ac[1]),
                preferBox,
              );
              str += `-(${n.digits[0]}=${o.digits[0]})${alsLoc}`;
            } else {
              str += `-(${n.digits[0]}=${o.digits[0]})${getLoc(n.cells)}`;
            }
          }
          return str;
        });

        const blossomName = isAals
          ? t("teks_msg_197")
          : isRegion
            ? t("teks_msg_165")
            : t("teks_msg_164");
        const mainInfoStr = isAals
          ? t("teks_msg_198", stem.startDigits.join(""), stem.houseName)
          : isRegion
            ? t("teks_msg_157", stem.digit, stem.houseName)
            : t("teks_msg_158", stem.r + 1, stem.c + 1);

        const resultObj = {
          change: true,
          type: "remove",
          cells: elims,
          hint: {
            name: blossomName,
            mainInfo: mainInfoStr,
            detail: chainStrs.join(", "),
          },
          applyVisuals: () => {
            highlightedDigit = null;
            highlightState = 0;

            // AALS gets a dedicated cyan cell color before branch colors are
            // layered on top, keeping the stem visibly distinct from chains.
            if (isAals) {
              stem.cells.forEach((id) => {
                const r = Math.floor(id / 9);
                const c = id % 9;
                if (window.addCellColor) {
                  window.addCellColor(r, c, cellColorPalette[5]);
                } else {
                  boardState[r][c].cellColor = cellColorPalette[5];
                }
              });
            }

            chosenPaths.forEach((path, branchIdx) => {
              const branchColor = [6, 7, 2, 3, 4, 8][branchIdx % 6]; // Unique color per stem candidate chain

              if (path.length === 3) {
                const u = path[0]; // Stem candidate
                const v = path[1]; // NAND node
                const w = path[2]; // OR node

                // 1. Color stem cell candidate matching the branch color
                if (isCell) {
                  boardState[stem.r][stem.c].pencilColors.set(
                    u.digits[0],
                    candidateColorPalette[branchColor],
                  );
                } else {
                  const ur = Math.floor(u.cells[0] / 9),
                    uc = u.cells[0] % 9;
                  boardState[ur][uc].pencilColors.set(
                    isRegion ? stem.digit : u.digits[0],
                    candidateColorPalette[branchColor],
                  );
                }

                // 2. Color bivalue cell or ALS cell matching the branch color
                const als = alsLinkRegistry.get(v)?.get(w);
                if (als) {
                  als.cells.forEach(([ar, ac]) => {
                    if (window.addCellColor)
                      window.addCellColor(
                        ar,
                        ac,
                        cellColorPalette[branchColor],
                      );
                    else
                      boardState[ar][ac].cellColor =
                        cellColorPalette[branchColor];
                  });
                } else {
                  v.cells.forEach((id) => {
                    const vr = Math.floor(id / 9),
                      vc = id % 9;
                    if (window.addCellColor)
                      window.addCellColor(
                        vr,
                        vc,
                        cellColorPalette[branchColor],
                      );
                    else
                      boardState[vr][vc].cellColor =
                        cellColorPalette[branchColor];
                  });
                }

                // 3. Highlight candidates for the branch nodes
                [v, w].forEach((node) => {
                  node.cells.forEach((id) => {
                    const nr = Math.floor(id / 9),
                      nc = id % 9;
                    if (boardState[nr][nc].pencils.has(node.digits[0])) {
                      if (window.addCandidateColor)
                        window.addCandidateColor(
                          nr,
                          nc,
                          node.digits[0],
                          candidateColorPalette[branchColor],
                        );
                      else
                        boardState[nr][nc].pencilColors.set(
                          node.digits[0],
                          candidateColorPalette[branchColor],
                        );
                    }
                  });
                });

                // 4. NAND gate (Dash line)
                drawnLines.push({
                  r1: Math.floor(u.cells[0] / 9),
                  c1: u.cells[0] % 9,
                  n1: u.digits[0],
                  r2: Math.floor(v.cells[0] / 9),
                  c2: v.cells[0] % 9,
                  n2: v.digits[0],
                  color: lineColorPalette[1],
                  style: "dash",
                });

                // 5. OR gate (Solid Red line)
                drawnLines.push({
                  r1: Math.floor(v.cells[0] / 9),
                  c1: v.cells[0] % 9,
                  n1: v.digits[0],
                  r2: Math.floor(w.cells[0] / 9),
                  c2: w.cells[0] % 9,
                  n2: w.digits[0],
                  color: lineColorPalette[0],
                  style: "solid",
                });

                // 6. Note grouped node in ALS as solid line following the node color
                const drawGroupedNode = (node) => {
                  if (node.cells.length > 1) {
                    for (let i = 0; i < node.cells.length - 1; i++) {
                      drawnLines.push({
                        r1: Math.floor(node.cells[i] / 9),
                        c1: node.cells[i] % 9,
                        n1: node.digits[0],
                        r2: Math.floor(node.cells[i + 1] / 9),
                        c2: node.cells[i + 1] % 9,
                        n2: node.digits[0],
                        color: lineColorPalette[branchColor],
                        style: "solid",
                      });
                    }
                  }
                };
                drawGroupedNode(v);
                drawGroupedNode(w);
              }
            });

            // Eliminations
            elims.forEach((el) => {
              boardState[el.r][el.c].candSlashes.set(
                el.num,
                markColorPalette[0],
              );
            });
          },
        };

        if (!findAll) return resultObj;
        results.push(resultObj);
      }
    }

    return findAll ? results : { change: false };
  },

  deathBlossom: (board, pencils, findAll = false) => {
    if (findAll) {
      return [
        ...techniques.cellDeathBlossom(board, pencils, true),
        ...techniques.regionDeathBlossom(board, pencils, true),
        ...techniques.aalsDeathBlossom(board, pencils, true),
      ];
    }
    const cell = techniques.cellDeathBlossom(board, pencils, false);
    if (cell.change) return cell;
    const region = techniques.regionDeathBlossom(board, pencils, false);
    if (region.change) return region;
    return techniques.aalsDeathBlossom(board, pencils, false);
  },

  cellDeathBlossom: (board, pencils, findAll = false) => {
    return techniques._deathBlossomCore(board, pencils, false, findAll);
  },

  regionDeathBlossom: (board, pencils, findAll = false) => {
    return techniques._deathBlossomCore(board, pencils, true, findAll);
  },

  aalsDeathBlossom: (board, pencils, findAll = false) => {
    return techniques._deathBlossomCore(board, pencils, false, findAll, "aals");
  },

  // --- Almost AIC ---
  _almostAicMaxBranchNodes: 16,
  _buildAlmostAicGraph: (board, pencils) => {
    techniques._useSharedAICCache(board, pencils);
    const cache = techniques._aicCache;

    if (cache.AllNodes.length === 0) {
      const candidateBitsets = techniques.buildCandidateBitsets(board, pencils);
      const baseNodes =
        techniques.generateBasicNodesFromBitsets(candidateBitsets);
      baseNodes.forEach((n) => {
        const key = `${n.digits.join(",")}_${n.cells
          .slice()
          .sort((a, b) => a - b)
          .join(",")}`;
        cache.NodeCache.set(key, n);
        cache.AllNodes.push(n);
      });
    }

    const allNodes = cache.AllNodes;
    const nodeCache = cache.NodeCache;

    const getNode = (cells, digits) => {
      const dArr = Array.isArray(digits) ? digits : [digits];
      const key = `${dArr.join(",")}_${cells
        .slice()
        .sort((a, b) => a - b)
        .join(",")}`;
      if (nodeCache.has(key)) return nodeCache.get(key);
      const newNode = new AICNode(cells, dArr);
      nodeCache.set(key, newNode);
      allNodes.push(newNode);
      return newNode;
    };

    if (
      cache.AlmostAicGraph &&
      cache.AlmostAicGraph.nodeCount === allNodes.length
    ) {
      return cache.AlmostAicGraph;
    }

    // 1. Every OR gate the AIC core knows how to build.
    let orMap = new Map();
    allNodes.forEach((n) => orMap.set(n, new Set()));

    if (cache.BilocationOrMap.size === 0) {
      cache.BilocationOrMap = techniques.buildBilocationOrMap(allNodes);
    }
    orMap = techniques.mergeOrMaps(orMap, cache.BilocationOrMap);

    if (cache.BivalueOrMap.size === 0) {
      cache.BivalueOrMap = techniques.buildBivalueOrMap(allNodes);
    }
    orMap = techniques.mergeOrMaps(orMap, cache.BivalueOrMap);

    if (cache.GroupedOrMap.size === 0) {
      cache.GroupedOrMap = techniques.buildGroupedOrMap(
        pencils,
        (cells, d) => getNode(cells, [d]),
        cache.GroupedLinkRegistry,
      );
    }
    orMap = techniques.mergeOrMaps(orMap, cache.GroupedOrMap);

    if (cache.AlsMap.size === 0) {
      cache.AlsMap = techniques.buildAlsOrMap(
        board,
        pencils,
        (cells, d) => getNode(cells, [d]),
        cache.AlsLinkRegistry,
      );
    }
    orMap = techniques.mergeOrMaps(orMap, cache.AlsMap);

    if (cache.FishMap.size === 0) {
      cache.FishMap = techniques.buildFishOrMap(
        board,
        pencils,
        (cells, d) => getNode(cells, [d]),
        cache.FishLinkRegistry,
      );
    }
    orMap = techniques.mergeOrMaps(orMap, cache.FishMap);

    // 2. Flatten to index based adjacency so a branch walk stays cheap.
    const nodes = [];
    for (const node of allNodes) {
      const neighbors = orMap.get(node);
      if (
        (neighbors && neighbors.size > 0) ||
        (node.isSingleCell && node.isSingleDigit)
      ) {
        nodes.push(node);
      }
    }

    const nodeIndex = new Map();
    nodes.forEach((node, index) => nodeIndex.set(node, index));

    const orAdj = nodes.map((node) => {
      const list = [];
      const neighbors = orMap.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const index = nodeIndex.get(neighbor);
          if (index !== undefined) list.push(index);
        }
      }
      return Int32Array.from(list);
    });

    const nodesByDigit = Array.from({ length: 10 }, () => []);
    const singleCellNodes = Array.from({ length: 81 }, () => []);

    for (const node of nodes) {
      if (node.digits.length !== 1) continue;
      nodesByDigit[node.digits[0]].push(node);
      if (node.cells.length === 1) singleCellNodes[node.cells[0]].push(node);
    }

    const nandAdj = nodes.map((node) => {
      if (node.digits.length !== 1) return Int32Array.from([]);

      const digit = node.digits[0];
      const targets = new Set();

      for (const other of nodesByDigit[digit]) {
        if (
          other !== node &&
          techniques.isBitsetSubset(other.NodeBitset, node.NandBitset)
        ) {
          targets.add(nodeIndex.get(other));
        }
      }

      if (node.cells.length === 1) {
        for (const other of singleCellNodes[node.cells[0]]) {
          if (other !== node && other.digits[0] !== digit) {
            targets.add(nodeIndex.get(other));
          }
        }
      }

      return Int32Array.from(targets);
    });

    const graph = {
      nodeCount: allNodes.length,
      nodes,
      nodeIndex,
      orAdj,
      nandAdj,
      getNode,
      alsLinkRegistry: cache.AlsLinkRegistry,
      groupedLinkRegistry: cache.GroupedLinkRegistry,
      fishLinkRegistry: cache.FishLinkRegistry,
      walkCache: new Map(),
      maskCache: new Map(),
    };

    cache.AlmostAicGraph = graph;
    return graph;
  },

  /**
   * Propagates one branch: the start node is assumed TRUE, so the walk leaves
   * it through a weak link and then alternates. Nodes reached through an OR
   * gate are TRUE and are the ones a branch may conclude with.
   */
  _almostAicWalk: (graph, startNode) => {
    const cached = graph.walkCache.get(startNode);
    if (cached) return cached;

    const { nodes, nodeIndex, orAdj, nandAdj } = graph;
    const startIndex = nodeIndex.get(startNode);
    const size = nodes.length;
    const maxNodes = techniques._almostAicMaxBranchNodes;

    // parity 0: node is TRUE  (arrived through an OR gate, leaves weakly)
    // parity 1: node is FALSE (arrived through a weak link, leaves strongly)
    const capacity = 2 * size + 1;
    const stateNode = new Int32Array(capacity);
    const stateParent = new Int32Array(capacity);
    const stateParity = new Uint8Array(capacity);
    const stateDepth = new Int16Array(capacity);
    const bestDepth = new Int16Array(2 * size);
    const trueState = new Int32Array(size).fill(-1);
    const reachOrder = [];

    stateNode[0] = startIndex;
    stateParent[0] = -1;
    stateParity[0] = 0;
    stateDepth[0] = 1;
    bestDepth[startIndex * 2] = 1;
    trueState[startIndex] = 0;
    reachOrder.push(startIndex);

    let count = 1;
    let head = 0;

    while (head < count) {
      const current = head++;
      const depth = stateDepth[current];
      if (depth >= maxNodes) continue;

      const parity = stateParity[current];
      const source = stateNode[current];
      const neighbors = parity === 0 ? nandAdj[source] : orAdj[source];
      const nextParity = parity === 0 ? 1 : 0;
      const nextDepth = depth + 1;

      for (let i = 0; i < neighbors.length; i++) {
        const next = neighbors[i];
        const key = next * 2 + nextParity;
        const previous = bestDepth[key];
        if (previous !== 0 && previous <= nextDepth) continue;

        // A chain may never reuse a node.
        let ancestor = current;
        let repeated = false;
        while (ancestor !== -1) {
          if (stateNode[ancestor] === next) {
            repeated = true;
            break;
          }
          ancestor = stateParent[ancestor];
        }
        if (repeated) continue;

        bestDepth[key] = nextDepth;
        const pushed = count++;
        stateNode[pushed] = next;
        stateParent[pushed] = current;
        stateParity[pushed] = nextParity;
        stateDepth[pushed] = nextDepth;

        if (nextParity === 0 && trueState[next] === -1) {
          trueState[next] = pushed;
          reachOrder.push(next);
        }
      }
    }

    // Union of what every TRUE node of the branch removes.
    const mask = Array.from({ length: 9 }, () => [0, 0, 0]);
    for (const index of reachOrder) {
      const nand = nodes[index].NandBitset;
      for (let d = 0; d < 9; d++) {
        mask[d][0] |= nand[d][0];
        mask[d][1] |= nand[d][1];
        mask[d][2] |= nand[d][2];
      }
    }

    const walk = { stateNode, stateParent, trueState, reachOrder, mask };

    if (graph.walkCache.size >= 96) {
      const oldest = graph.walkCache.keys().next().value;
      graph.walkCache.delete(oldest);
    }
    graph.walkCache.set(startNode, walk);
    graph.maskCache.set(startNode, mask);

    return walk;
  },

  _almostAicMask: (graph, startNode) => {
    const cached = graph.maskCache.get(startNode);
    if (cached) return cached;
    return techniques._almostAicWalk(graph, startNode).mask;
  },

  _almostAicPath: (graph, walk, nodeIndex) => {
    const state = walk.trueState[nodeIndex];
    if (state === -1) return null;

    const path = [];
    let current = state;
    while (current !== -1) {
      path.push(graph.nodes[walk.stateNode[current]]);
      current = walk.stateParent[current];
    }
    path.reverse();
    return path;
  },

  _almostAicCore: (
    board,
    pencils,
    isRegion,
    findAll = false,
    focusKind = null,
    seenEliminations = null,
  ) => {
    const results = [];
    const recordedEliminations = findAll
      ? (seenEliminations ?? new Set())
      : null;
    const isAals = focusKind === "aals";
    const isCell = !isRegion && !isAals;

    const graph = techniques._buildAlmostAicGraph(board, pencils);
    const getNode = graph.getNode;
    const alsLinkRegistry = graph.alsLinkRegistry;
    const groupedLinkRegistry = graph.groupedLinkRegistry;
    const fishLinkRegistry = graph.fishLinkRegistry;

    const getLoc = (cells, preferBox = false) => {
      if (cells.length === 0) return "";
      if (cells.length === 1) {
        const r = Math.floor(cells[0] / 9);
        const c = cells[0] % 9;
        if (preferBox) {
          const b = Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1;
          const p = (r % 3) * 3 + (c % 3) + 1;
          return `b${b}p${p}`;
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
      const cols = [...new Set(cells.map((id) => (id % 9) + 1))].sort(
        (a, b) => a - b,
      );
      if (rows.length === 1) return `r${rows[0]}c${cols.join("")}`;
      if (cols.length === 1) return `r${rows.join("")}c${cols[0]}`;
      return [...cells]
        .sort((a, b) => a - b)
        .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
        .join("");
    };

    const getCompactFinLoc = (cells) => {
      if (cells.length <= 1) return getLoc(cells);

      const uniqueCells = [...new Set(cells)];
      const rows = new Set(uniqueCells.map((id) => Math.floor(id / 9)));
      const cols = new Set(uniqueCells.map((id) => id % 9));
      if (rows.size === 1 || cols.size === 1) return getLoc(uniqueCells);

      const groupByRow = rows.size <= cols.size;
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
    };

    // One Eureka term per strong link, following the AIC core formatting.
    const strongTerm = (u, v, lastDigit) => {
      const als = alsLinkRegistry.get(u)?.get(v);
      if (als) {
        const alsIds = als.cells.map((cell) => cell[0] * 9 + cell[1]);
        const preferBox =
          als.unitName && als.unitName.includes(t("teks_msg_7"));
        return {
          text: `(${u.digits[0]}=${v.digits[0]})${getLoc(alsIds, preferBox)}`,
          digit: v.digits[0],
        };
      }

      const fish = fishLinkRegistry.get(u)?.get(v);
      if (fish) {
        return {
          text: `(${fish.d})(${getCompactFinLoc(u.cells)}=${getCompactFinLoc(
            v.cells,
          )})(${fish.basesStr}\\${fish.coversStr})`,
          digit: fish.d,
        };
      }

      if (
        u.digits[0] !== v.digits[0] &&
        u.cells.length === 1 &&
        v.cells.length === 1 &&
        u.cells[0] === v.cells[0]
      ) {
        return {
          text: `(${u.digits[0]}=${v.digits[0]})${getLoc(u.cells)}`,
          digit: v.digits[0],
        };
      }

      const digit = u.digits[0];
      const prefix = lastDigit === digit ? "" : `(${digit})`;
      const preferBoxGate = groupedLinkRegistry.get(u)?.get(v) === "box";
      return {
        text: `${prefix}${getLoc(u.cells, preferBoxGate)}=${getLoc(
          v.cells,
          preferBoxGate,
        )}`,
        digit,
      };
    };

    const getClosestCells = (nodeA, nodeB) => {
      let minDistance = Infinity;
      let bestA = nodeA.cells[0];
      let bestB = nodeB.cells[0];
      for (const a of nodeA.cells) {
        for (const b of nodeB.cells) {
          const distance =
            Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) +
            Math.abs((a % 9) - (b % 9));
          if (distance < minDistance) {
            minDistance = distance;
            bestA = a;
            bestB = b;
          }
        }
      }
      return [
        [Math.floor(bestA / 9), bestA % 9],
        [Math.floor(bestB / 9), bestB % 9],
      ];
    };

    // 1. Collect stems. Death Blossom allows up to six branches; Almost AIC
    // stops at four because each branch reaches far further.
    const potentialStems = [];

    if (isCell) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const size = pencils[r][c].size;
          if (size >= 3 && size <= 4) {
            potentialStems.push({
              size,
              r,
              c,
              cellId: r * 9 + c,
              startDigits: Array.from(pencils[r][c]).sort((a, b) => a - b),
            });
          }
        }
      }
    } else if (isRegion) {
      for (let d = 1; d <= 9; d++) {
        for (let r = 0; r < 9; r++) {
          const cells = [];
          for (let c = 0; c < 9; c++)
            if (pencils[r][c].has(d)) cells.push(r * 9 + c);
          if (cells.length >= 3 && cells.length <= 4)
            potentialStems.push({
              size: cells.length,
              digit: d,
              cells,
              houseName: t("teks_msg_153", r + 1),
            });
        }
        for (let c = 0; c < 9; c++) {
          const cells = [];
          for (let r = 0; r < 9; r++)
            if (pencils[r][c].has(d)) cells.push(r * 9 + c);
          if (cells.length >= 3 && cells.length <= 4)
            potentialStems.push({
              size: cells.length,
              digit: d,
              cells,
              houseName: t("teks_msg_154", c + 1),
            });
        }
        for (let b = 0; b < 9; b++) {
          const cells = [];
          const br = Math.floor(b / 3) * 3;
          const bc = (b % 3) * 3;
          for (let i = 0; i < 9; i++) {
            const r = br + Math.floor(i / 3);
            const c = bc + (i % 3);
            if (pencils[r][c].has(d)) cells.push(r * 9 + c);
          }
          if (cells.length >= 3 && cells.length <= 4)
            potentialStems.push({
              size: cells.length,
              digit: d,
              cells,
              houseName: t("teks_msg_155", b + 1),
            });
        }
      }
    } else {
      const seenAals = new Set();
      const unitLabel = (unit) =>
        unit < 9
          ? t("teks_msg_153", unit + 1)
          : unit < 18
            ? t("teks_msg_154", unit - 8)
            : t("teks_msg_155", unit - 17);

      for (let unit = 0; unit < 27; unit++) {
        const eligibleCells = [];
        for (let id = 0; id < 81; id++) {
          const part = Math.floor(id / 27);
          const bit = id % 27;
          if ((UNIT_BITSETS[unit][part] & (1 << bit)) === 0) continue;
          const r = Math.floor(id / 9);
          const c = id % 9;
          if (board[r][c] === 0 && pencils[r][c].size > 0) {
            eligibleCells.push(id);
          }
        }

        const addAalsStems = (cells) => {
          let mask = 0;
          const cellsByDigit = Array.from({ length: 10 }, () => []);
          for (const id of cells) {
            const r = Math.floor(id / 9);
            const c = id % 9;
            for (const digit of pencils[r][c]) {
              mask |= 1 << digit;
              cellsByDigit[digit].push(id);
            }
          }
          if (techniques._bits.popcount(mask) !== cells.length + 2) return;

          const aalsKey = [...cells].sort((a, b) => a - b).join(",");
          if (seenAals.has(aalsKey)) return;
          seenAals.add(aalsKey);

          const digits = [];
          for (let digit = 1; digit <= 9; digit++) {
            if (mask & (1 << digit)) digits.push(digit);
          }
          for (let first = 0; first < digits.length - 2; first++) {
            for (let second = first + 1; second < digits.length - 1; second++) {
              for (let third = second + 1; third < digits.length; third++) {
                const startDigits = [
                  digits[first],
                  digits[second],
                  digits[third],
                ];
                const startCandidates = startDigits.flatMap((digit) =>
                  cellsByDigit[digit].map((id) => ({ id, digit })),
                );
                if (startCandidates.length < 3 || startCandidates.length > 4) {
                  continue;
                }

                potentialStems.push({
                  size: startCandidates.length,
                  kind: "aals",
                  unit,
                  cells: [...cells],
                  houseName: unitLabel(unit),
                  startDigits,
                  startCandidates,
                  startCandidateKeys: new Set(
                    startCandidates.map(({ id, digit }) => `${id}:${digit}`),
                  ),
                });
              }
            }
          }
        };

        const chooseCells = (start, size, cells) => {
          if (cells.length === size) {
            addAalsStems(cells);
            return;
          }
          const needed = size - cells.length;
          for (
            let index = start;
            index <= eligibleCells.length - needed;
            index++
          ) {
            cells.push(eligibleCells[index]);
            chooseCells(index + 1, size, cells);
            cells.pop();
          }
        };

        for (let size = 2; size <= Math.min(7, eligibleCells.length); size++) {
          chooseCells(0, size, []);
        }
      }
    }

    potentialStems.sort((a, b) => a.size - b.size);

    // 2. Every stem candidate grows one branch; an elimination has to survive
    // all of them, exactly as in Death Blossom.
    for (const stem of potentialStems) {
      const startNodes = isCell
        ? stem.startDigits.map((d) => getNode([stem.cellId], [d]))
        : isRegion
          ? stem.cells.map((cId) => getNode([cId], [stem.digit]))
          : stem.startCandidates.map(({ id, digit }) => getNode([id], [digit]));

      if (startNodes.some((node) => !graph.nodeIndex.has(node))) continue;

      const stemCellSet = isRegion ? new Set(stem.cells) : null;
      const branchMasks = startNodes.map((node) =>
        techniques._almostAicMask(graph, node),
      );

      const commonMask = Array.from({ length: 9 }, () => [0, 0, 0]);
      let hasCommon = false;
      for (let d = 0; d < 9; d++) {
        for (let p = 0; p < 3; p++) {
          let bits = branchMasks[0][d][p];
          for (let i = 1; i < branchMasks.length; i++) {
            bits &= branchMasks[i][d][p];
          }
          commonMask[d][p] = bits;
          if (bits !== 0) hasCommon = true;
        }
      }
      if (!hasCommon) continue;

      const maskToElims = (mask) => {
        const found = [];
        for (let d = 0; d < 9; d++) {
          for (let p = 0; p < 3; p++) {
            let bits = mask[d][p];
            let bitPos = 0;
            while (bits > 0) {
              if (bits & 1) {
                const id = p * 27 + bitPos;
                const er = Math.floor(id / 9);
                const ec = id % 9;
                const num = d + 1;

                let isStemCandidate = false;
                if (isCell) {
                  if (er === stem.r && ec === stem.c) isStemCandidate = true;
                } else if (isRegion) {
                  if (num === stem.digit && stemCellSet.has(id))
                    isStemCandidate = true;
                } else if (stem.startCandidateKeys.has(`${id}:${num}`)) {
                  isStemCandidate = true;
                }

                if (
                  pencils[er][ec] &&
                  pencils[er][ec].has(num) &&
                  !isStemCandidate
                ) {
                  found.push({ r: er, c: ec, num });
                }
              }
              bits >>>= 1;
              bitPos++;
            }
          }
        }
        return found;
      };

      // Candidates the blossom as a whole can reach. They are only the pool
      // of targets to try; what gets reported is what the written chain
      // proves on its own.
      const reachableElims = maskToElims(commonMask);

      if (reachableElims.length === 0) continue;

      // 3. Rebuild the branches as writable chains. A branch may not run
      // through the stem itself, otherwise the single-chain notation would
      // contradict its own OR gate.
      const isStemNode = (node) => {
        if (node.cells.length !== 1) return false;
        if (isCell) return node.cells[0] === stem.cellId;
        if (isRegion)
          return (
            node.digits[0] === stem.digit && stemCellSet.has(node.cells[0])
          );
        return stem.startCandidateKeys.has(
          `${node.cells[0]}:${node.digits[0]}`,
        );
      };

      const cleanPathsFor = (startNode, digit, part, bit) => {
        const walk = techniques._almostAicWalk(graph, startNode);
        const paths = [];
        for (const index of walk.reachOrder) {
          const node = graph.nodes[index];
          if ((node.NandBitset[digit - 1][part] & (1 << bit)) === 0) continue;
          const path = techniques._almostAicPath(graph, walk, index);
          if (!path) continue;
          if (path.some((entry, position) => position > 0 && isStemNode(entry)))
            continue;
          paths.push(path);
          if (paths.length >= 6) break;
        }
        return paths;
      };

      const pickDisjoint = (listA, listB) => {
        for (const a of listA) {
          const usedA = new Set(a);
          for (const b of listB) {
            if (b.every((node) => !usedA.has(node))) return [a, b];
          }
        }
        return null;
      };

      // The result reports exactly what the chosen branch endpoints see in
      // common, so the written chain proves every candidate it removes.
      const provenElims = (paths) => {
        const mask = Array.from({ length: 9 }, () => [0, 0, 0]);
        const last = paths.map((path) => path[path.length - 1]);

        for (let d = 0; d < 9; d++) {
          for (let p = 0; p < 3; p++) {
            let bits = last[0].NandBitset[d][p];
            for (let i = 1; i < last.length; i++) {
              bits &= last[i].NandBitset[d][p];
            }
            mask[d][p] = bits;
          }
        }

        // A branch that asserts a candidate cannot also be shown removing
        // it, so those candidates are left to another chain.
        const asserted = new Set();
        for (const path of paths) {
          for (let i = 0; i < path.length; i += 2) {
            for (const id of path[i].cells) {
              asserted.add(`${id}:${path[i].digits[0]}`);
            }
          }
        }

        return maskToElims(mask).filter(
          (el) => !asserted.has(`${el.r * 9 + el.c}:${el.num}`),
        );
      };

      let chosenPaths = null;
      let elims = null;

      for (const candidate of reachableElims) {
        const id = candidate.r * 9 + candidate.c;
        const part = Math.floor(id / 27);
        const bit = id % 27;
        const lists = startNodes.map((node) =>
          cleanPathsFor(node, candidate.num, part, bit),
        );
        if (lists.some((list) => list.length === 0)) continue;

        const firstPair = pickDisjoint(lists[0], lists[1]);
        if (!firstPair) continue;

        let paths;
        if (startNodes.length === 3) {
          paths = [firstPair[0], firstPair[1], lists[2][0]];
        } else {
          const secondPair = pickDisjoint(lists[2], lists[3]);
          if (!secondPair) continue;
          paths = [firstPair[0], firstPair[1], secondPair[0], secondPair[1]];
        }

        const proven = provenElims(paths);
        if (proven.length === 0) continue;

        chosenPaths = paths;
        elims = proven;
        break;
      }

      if (!chosenPaths) continue;

      if (findAll) {
        elims = elims.filter((el) => {
          const key = `${el.r}:${el.c}:${el.num}`;
          if (recordedEliminations.has(key)) return false;
          recordedEliminations.add(key);
          return true;
        });
        if (elims.length === 0) continue;
      }

      // 4. Eureka notation: one single chain built out of two almost AICs
      // (three branches leave the last one as a plain AIC tail).
      const stemDigitsUnique =
        new Set(startNodes.map((node) => node.digits[0])).size ===
        startNodes.length;

      const stemGate = (left, right) => {
        if (isCell) {
          const leftDigits = left
            .map((node) => node.digits[0])
            .sort((a, b) => a - b)
            .join("");
          const rightDigits = right
            .map((node) => node.digits[0])
            .sort((a, b) => a - b)
            .join("");
          return `(${leftDigits}=${rightDigits})${getLoc([stem.cellId])}`;
        }

        if (isRegion) {
          return `(${stem.digit})${getLoc(
            left.flatMap((node) => node.cells),
          )}=${getLoc(right.flatMap((node) => node.cells))}`;
        }

        const alsLoc = getLoc(stem.cells, stem.unit >= 18);
        if (stemDigitsUnique) {
          const leftDigits = left
            .map((node) => node.digits[0])
            .sort((a, b) => a - b)
            .join("");
          const rightDigits = right
            .map((node) => node.digits[0])
            .sort((a, b) => a - b)
            .join("");
          return `(${leftDigits}=${rightDigits})${alsLoc}`;
        }

        const describe = (list) =>
          list
            .map((node) => `${node.digits[0]}${getLoc(node.cells)}`)
            .join(",");
        return `(${describe(left)}=${describe(right)})${alsLoc}`;
      };

      const emit = (state, u, v) => {
        const term = strongTerm(u, v, state.lastDigit);
        state.lastDigit = term.digit;
        return term.text;
      };

      const reverseTerms = (path, state) => {
        const terms = [];
        for (let i = path.length - 1; i >= 2; i -= 2) {
          terms.push(emit(state, path[i], path[i - 1]));
        }
        return terms;
      };

      const forwardTerms = (path, state) => {
        const terms = [];
        for (let i = 1; i + 1 < path.length; i += 2) {
          terms.push(emit(state, path[i], path[i + 1]));
        }
        return terms;
      };

      const almostBracket = (indexA, indexB) => {
        const state = { lastDigit: null };
        const terms = reverseTerms(chosenPaths[indexA], state);
        terms.push(stemGate([startNodes[indexA]], [startNodes[indexB]]));
        state.lastDigit = startNodes[indexB].digits[0];
        terms.push(...forwardTerms(chosenPaths[indexB], state));
        return `[${terms.join("-")}]`;
      };

      let eurekaStr;
      if (startNodes.length === 3) {
        const state = { lastDigit: startNodes[2].digits[0] };
        const tail = [stemGate(startNodes.slice(0, 2), [startNodes[2]])];
        tail.push(...forwardTerms(chosenPaths[2], state));
        eurekaStr = `${almostBracket(0, 1)} + ${tail.join("-")}`;
      } else {
        eurekaStr = [
          almostBracket(0, 1),
          stemGate(startNodes.slice(0, 2), startNodes.slice(2)),
          almostBracket(2, 3),
        ].join(" + ");
      }

      // 5. Structures the chains leaned on, for the AIC style visuals.
      const usedAlses = [];
      const usedFishes = [];
      const fishNodes = new Set();
      const seenAlsKeys = new Set();
      const seenFishKeys = new Set();

      for (const path of chosenPaths) {
        for (let i = 1; i + 1 < path.length; i += 2) {
          const u = path[i];
          const v = path[i + 1];

          const als = alsLinkRegistry.get(u)?.get(v);
          if (als) {
            const key = als.cells
              .map((cell) => cell[0] * 9 + cell[1])
              .sort((a, b) => a - b)
              .join(",");
            if (!seenAlsKeys.has(key)) {
              seenAlsKeys.add(key);
              usedAlses.push(als.cells);
            }
            continue;
          }

          const fish = fishLinkRegistry.get(u)?.get(v);
          if (fish) {
            const key = `${fish.d}:${fish.basesStr}\\${fish.coversStr}`;
            if (!seenFishKeys.has(key)) {
              seenFishKeys.add(key);
              usedFishes.push(fish);
            }
            fishNodes.add(u);
            fishNodes.add(v);
          }
        }
      }

      const techniqueName = isAals
        ? t("teks_msg_313")
        : isRegion
          ? t("teks_msg_312")
          : t("teks_msg_311");
      const mainInfoStr = isAals
        ? t("teks_msg_198", stem.startDigits.join(""), stem.houseName)
        : isRegion
          ? t("teks_msg_157", stem.digit, stem.houseName)
          : t("teks_msg_158", stem.r + 1, stem.c + 1);

      const resultObj = {
        change: true,
        type: "remove",
        cells: elims,
        hint: {
          name: techniqueName,
          mainInfo: mainInfoStr,
          detail: eurekaStr,
        },
        applyVisuals: () => {
          highlightedDigit = null;
          highlightState = 0;

          if (isAals) {
            stem.cells.forEach((id) => {
              const r = Math.floor(id / 9);
              const c = id % 9;
              if (window.addCellColor) {
                window.addCellColor(r, c, cellColorPalette[5]);
              } else {
                boardState[r][c].cellColor = cellColorPalette[5];
              }
            });
          }

          const colorCodes = [6, 7, 2, 3, 4, 1, 8];
          let colorCount = -1;

          usedAlses.forEach((cells) => {
            colorCount++;
            const colorCode = colorCodes[colorCount % colorCodes.length];
            cells.forEach(([r, c]) => {
              if (window.addCellColor) {
                window.addCellColor(r, c, cellColorPalette[colorCode]);
              } else {
                boardState[r][c].cellColor = cellColorPalette[colorCode];
              }
            });
          });

          usedFishes.forEach((fish) => {
            colorCount++;
            const colorCode = colorCodes[colorCount % colorCodes.length];
            fish.allCells.forEach((id) => {
              const r = Math.floor(id / 9);
              const c = id % 9;
              if (!boardState[r][c].pencils.has(fish.d)) return;
              if (window.addCandidateCircle) {
                window.addCandidateCircle(
                  r,
                  c,
                  fish.d,
                  markColorPalette[colorCode],
                );
              } else {
                boardState[r][c].candCircles.set(
                  fish.d,
                  markColorPalette[colorCode],
                );
              }
            });
          });

          chosenPaths.forEach((path) => {
            path.forEach((node, index) => {
              if (fishNodes.has(node)) return;
              // Even positions are the TRUE nodes of the branch.
              const colorIdx = index % 2 === 0 ? 4 : 5;
              node.cells.forEach((id) => {
                const r = Math.floor(id / 9);
                const c = id % 9;
                node.digits.forEach((d) => {
                  if (boardState[r][c].pencils.has(d)) {
                    boardState[r][c].pencilColors.set(
                      d,
                      candidateColorPalette[colorIdx],
                    );
                  }
                });
              });
            });

            path.forEach((node, index) => {
              if (fishNodes.has(node)) return; // Circled instead
              if (node.cells.length < 2) return;
              const colorIdx = index % 2 === 0 ? 4 : 5;
              for (let i = 0; i + 1 < node.cells.length; i++) {
                drawnLines.push({
                  r1: Math.floor(node.cells[i] / 9),
                  c1: node.cells[i] % 9,
                  n1: node.digits[0],
                  r2: Math.floor(node.cells[i + 1] / 9),
                  c2: node.cells[i + 1] % 9,
                  n2: node.digits[0],
                  color: lineColorPalette[colorIdx],
                  style: "solid",
                });
              }
            });

            for (let i = 0; i + 1 < path.length; i++) {
              // Fish OR links sit on the odd steps; the circles already show them.
              if (
                i % 2 === 1 &&
                fishLinkRegistry.get(path[i])?.get(path[i + 1])
              )
                continue;
              const [from, to] = getClosestCells(path[i], path[i + 1]);
              drawnLines.push({
                r1: from[0],
                c1: from[1],
                n1: path[i].digits[0],
                r2: to[0],
                c2: to[1],
                n2: path[i + 1].digits[0],
                color: lineColorPalette[0],
                // Branches leave a TRUE node weakly, so even links are dashed.
                style: i % 2 === 0 ? "dash" : "solid",
              });
            }
          });

          // The stem OR gate holding every branch together.
          for (let i = 0; i + 1 < startNodes.length; i++) {
            const [from, to] = getClosestCells(
              startNodes[i],
              startNodes[i + 1],
            );
            drawnLines.push({
              r1: from[0],
              c1: from[1],
              n1: startNodes[i].digits[0],
              r2: to[0],
              c2: to[1],
              n2: startNodes[i + 1].digits[0],
              color: lineColorPalette[1],
              style: "solid",
            });
          }

          elims.forEach((el) => {
            boardState[el.r][el.c].candSlashes.set(el.num, markColorPalette[0]);
          });
        },
      };

      if (!findAll) return resultObj;
      results.push(resultObj);
    }

    return findAll ? results : { change: false };
  },

  almostAic: (board, pencils, findAll = false) => {
    if (findAll) {
      const seenEliminations = new Set();
      return [
        ...techniques.cellAlmostAic(board, pencils, true, seenEliminations),
        ...techniques.regionAlmostAic(board, pencils, true, seenEliminations),
        ...techniques.aalsAlmostAic(board, pencils, true, seenEliminations),
      ];
    }
    const cell = techniques.cellAlmostAic(board, pencils, false);
    if (cell.change) return cell;
    const region = techniques.regionAlmostAic(board, pencils, false);
    if (region.change) return region;
    return techniques.aalsAlmostAic(board, pencils, false);
  },

  cellAlmostAic: (board, pencils, findAll = false, seenEliminations = null) => {
    return techniques._almostAicCore(
      board,
      pencils,
      false,
      findAll,
      null,
      seenEliminations,
    );
  },

  regionAlmostAic: (
    board,
    pencils,
    findAll = false,
    seenEliminations = null,
  ) => {
    return techniques._almostAicCore(
      board,
      pencils,
      true,
      findAll,
      null,
      seenEliminations,
    );
  },

  aalsAlmostAic: (board, pencils, findAll = false, seenEliminations = null) => {
    return techniques._almostAicCore(
      board,
      pencils,
      false,
      findAll,
      "aals",
      seenEliminations,
    );
  },

  _complexFishCore: (board, pencils, fishSize, isMutant, findAll = false) => {
    const results = [];
    const U_ROW = 0,
      U_COL = 1,
      U_BOX = 2;

    // --- 3x27 Bitset Helpers ---
    const isZero = (a) => a[0] === 0 && a[1] === 0 && a[2] === 0;
    const bitAnd = (a, b) => [a[0] & b[0], a[1] & b[1], a[2] & b[2]];
    const bitOr = (a, b) => [a[0] | b[0], a[1] | b[1], a[2] | b[2]];
    const bitAndNot = (a, b) => [a[0] & ~b[0], a[1] & ~b[1], a[2] & ~b[2]];
    const bitPopcount = (a) =>
      techniques._bits.popcount(a[0]) +
      techniques._bits.popcount(a[1]) +
      techniques._bits.popcount(a[2]);
    const setBit = (a, id) => {
      a[Math.floor(id / 27)] |= 1 << (id % 27);
    };
    const testBit = (a, id) =>
      (a[Math.floor(id / 27)] & (1 << (id % 27))) !== 0;
    const getBits = (a) => {
      const res = [];
      for (let p = 0; p < 3; p++) {
        let m = a[p];
        let bit = 0;
        while (m > 0) {
          if (m & 1) res.push(p * 27 + bit);
          m >>= 1;
          bit++;
        }
      }
      return res;
    };

    const toCheck = isMutant
      ? [{ base: [U_ROW, U_COL, U_BOX], cover: [U_ROW, U_COL, U_BOX] }]
      : [
          { base: [U_ROW, U_BOX], cover: [U_COL, U_BOX] },
          { base: [U_COL, U_BOX], cover: [U_ROW, U_BOX] },
        ];

    for (let num = 1; num <= 9; num++) {
      const templating = techniques._getTemplating(board, pencils, num);
      const { cb, cellsWithNum, units } = templating;

      if (cellsWithNum.length === 0) continue;

      // Memoization check using string representation of the bitset arrays
      const memoKey = `${fishSize}:${num}:${cb[0]}-${cb[1]}-${cb[2]}`;
      const memoSet = isMutant
        ? _memoComplexFish.mutant
        : _memoComplexFish.franken;
      if (memoSet.has(memoKey)) continue;

      // --- TEMPLATING STEP (Optimization) ---
      const rowToInds = Array.from({ length: 9 }, () => []);
      const rowsWith = [];

      for (let r = 0; r < 9; r++) {
        const present = units[r]; // Row is 0-8 in units
        if (present.length > 0) {
          rowToInds[r] = present;
          rowsWith.push(r);
        }
      }

      if (rowsWith.length === 0) {
        memoSet.add(memoKey);
        continue;
      }

      const orderRows = (firstRow) => {
        return rowsWith
          .filter((r) => r !== firstRow)
          .sort((a, b) => rowToInds[a].length - rowToInds[b].length);
      };

      // DFS to find valid patterns
      const findPatternIncluding = (i0) => {
        const r0 = Math.floor(i0 / 9);
        if (!rowToInds[r0].includes(i0)) return [];

        const rowsSeq = [r0, ...orderRows(r0)];
        const out = [i0];

        const dfs = (pos, usedCols, usedBoxes) => {
          if (pos === rowsSeq.length) return true;
          const r = rowsSeq[pos];
          for (const idx of rowToInds[r]) {
            const c = idx % 9;
            const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
            if ((usedCols >> c) & 1 || (usedBoxes >> b) & 1) continue;

            out.push(idx);
            if (dfs(pos + 1, usedCols | (1 << c), usedBoxes | (1 << b)))
              return true;
            out.pop();
          }
          return false;
        };

        const initCol = i0 % 9;
        const initBox = Math.floor(i0 / 9 / 3) * 3 + Math.floor((i0 % 9) / 3);
        if (!dfs(1, 1 << initCol, 1 << initBox)) return [];
        return out;
      };

      let possibleCells = [0, 0, 0];
      let impossibleCells = [0, 0, 0];

      const cbBits = getBits(cb);
      for (const idx of cbBits) {
        if (!testBit(possibleCells, idx)) {
          const sel = findPatternIncluding(idx);
          if (sel.length === 0) {
            setBit(impossibleCells, idx);
          } else {
            for (const j of sel) setBit(possibleCells, j);
          }
        }
      }

      if (isZero(impossibleCells)) {
        memoSet.add(memoKey);
        continue; // No constraints found
      }

      // --- FISH CORE (Targeted Combinations) ---
      const targetElims = getBits(impossibleCells);

      // Gather all valid units for this digit
      const allUnits = [];
      for (let u = 0; u < 27; u++) {
        const type = u < 9 ? U_ROW : u < 18 ? U_COL : U_BOX;
        const index = u < 9 ? u : u < 18 ? u - 9 : u - 18;
        const mask = bitAnd(UNIT_BITSETS[u], cb);
        if (!isZero(mask)) {
          allUnits.push({
            type,
            index,
            uIndex: u,
            mask,
            count: bitPopcount(mask),
          });
        }
      }

      let changed = false;
      const eliminatedTargets = new Set(); // Track globally eliminated cells across fishes found
      const seenElimSignatures = findAll ? new Set() : null;

      const baseCombinationCache = new Map();
      const getBaseCombinations = (baseTypes) => {
        const typeKey = baseTypes.reduce((mask, type) => mask | (1 << type), 0);
        if (baseCombinationCache.has(typeKey)) {
          return baseCombinationCache.get(typeKey);
        }

        const candidateUnits = allUnits.filter((unit) =>
          baseTypes.includes(unit.type),
        );
        const combinations = [];
        const selected = [];

        const visit = (start, mask, endoMask, typeMask) => {
          if (selected.length === fishSize) {
            combinations.push({
              units: selected.slice(),
              mask,
              endoMask,
              typeMask,
            });
            return;
          }

          const remaining = fishSize - selected.length;
          for (let i = start; i <= candidateUnits.length - remaining; i++) {
            const unit = candidateUnits[i];
            const nextEndoMask = bitOr(endoMask, bitAnd(mask, unit.mask));
            if (bitPopcount(nextEndoMask) > 2) continue;

            selected.push(unit);
            visit(
              i + 1,
              bitOr(mask, unit.mask),
              nextEndoMask,
              typeMask | (1 << unit.type),
            );
            selected.pop();
          }
        };

        visit(0, [0, 0, 0], [0, 0, 0], 0);
        baseCombinationCache.set(typeKey, combinations);
        return combinations;
      };

      const isExcludedGeometry = (baseTypeMask, coverTypeMask) => {
        const hasType = (mask, type) => (mask & (1 << type)) !== 0;
        if (baseTypeMask === 1 << U_ROW && coverTypeMask === 1 << U_COL)
          return true;
        if (baseTypeMask === 1 << U_COL && coverTypeMask === 1 << U_ROW)
          return true;
        if (!isMutant) {
          const hasBox =
            hasType(baseTypeMask, U_BOX) || hasType(coverTypeMask, U_BOX);
          const hasLine =
            hasType(baseTypeMask, U_ROW) ||
            hasType(baseTypeMask, U_COL) ||
            hasType(coverTypeMask, U_ROW) ||
            hasType(coverTypeMask, U_COL);
          return !hasBox || !hasLine;
        }

        return !(
          (hasType(baseTypeMask, U_ROW) && hasType(baseTypeMask, U_COL)) ||
          (hasType(coverTypeMask, U_ROW) && hasType(coverTypeMask, U_COL))
        );
      };

      const formatUnits = (selectedUnits) => {
        const r = [],
          c = [],
          b = [];
        selectedUnits.forEach((unit) => {
          if (unit.type === U_ROW) r.push(unit.index + 1);
          else if (unit.type === U_COL) c.push(unit.index + 1);
          else if (unit.type === U_BOX) b.push(unit.index + 1);
        });
        let str = "";
        if (r.length > 0) str += "r" + r.sort((x, y) => x - y).join("");
        if (c.length > 0) str += "c" + c.sort((x, y) => x - y).join("");
        if (b.length > 0) str += "b" + b.sort((x, y) => x - y).join("");
        return str;
      };

      const formatFins = (mask) =>
        getBits(mask)
          .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
          .join(",");

      const makeResult = (baseUnits, coverUnits, allFinsMask, elims) => {
        const isFinned = !isZero(allFinsMask);
        let fishName =
          fishSize === 4
            ? isMutant
              ? t("teks_msg_309")
              : t("teks_msg_310")
            : isMutant
              ? t("teks_msg_159")
              : t("teks_msg_160");
        if (isFinned) fishName = t("teks_msg_161") + fishName;

        const baseStr = formatUnits(baseUnits);
        const coverStr = formatUnits(coverUnits);
        let detailStr = t("teks_msg_162", num, baseStr, coverStr);
        if (isFinned) {
          detailStr += t("teks_msg_163", formatFins(allFinsMask));
        }

        const resultBaseUnits = baseUnits.slice();
        const resultCoverUnits = coverUnits.slice();
        const resultFinsMask = allFinsMask;
        const resultElims = elims;
        const resultNum = num;

        return {
          change: true,
          type: "remove",
          cells: resultElims,
          hint: {
            name: fishName,
            mainInfo: t("teks_msg_48", resultNum),
            detail: detailStr,
          },
          applyVisuals: () => {
            highlightedDigit = resultNum;
            highlightState = 1;
            const uTypeToName = (type) =>
              type === U_ROW ? "row" : type === U_COL ? "col" : "box";

            resultBaseUnits.forEach((unit) => {
              techniques
                ._getUnitCells(uTypeToName(unit.type), unit.index)
                .forEach(([r, c]) => {
                  window.addCellColor(r, c, cellColorPalette[6]);
                  if (boardState[r][c].pencils.has(resultNum)) {
                    boardState[r][c].pencilColors.set(
                      resultNum,
                      candidateColorPalette[6],
                    );
                  }
                });
            });

            resultCoverUnits.forEach((unit) => {
              techniques
                ._getUnitCells(uTypeToName(unit.type), unit.index)
                .forEach(([r, c]) => {
                  window.addCellColor(r, c, cellColorPalette[7]);
                });
            });

            getBits(resultFinsMask).forEach((id) => {
              window.addCellColor(
                Math.floor(id / 9),
                id % 9,
                cellColorPalette[5],
              );
            });

            resultElims.forEach((el) =>
              boardState[el.r][el.c].candSlashes.set(
                el.num,
                markColorPalette[0],
              ),
            );
          },
        };
      };

      // Loop over each impossible candidate cell one by one
      for (const targetId of targetElims) {
        if (eliminatedTargets.has(targetId)) continue; // Handled by a previously found fish

        let foundFishForTarget = false;

        for (const { base: baseTypes, cover: coverTypes } of toCheck) {
          if (foundFishForTarget) break; // STOP SIGN for this specific candidate target

          // Valid base units MUST NOT contain the target elimination cell
          const validBaseUnits = allUnits.filter(
            (u) => baseTypes.includes(u.type) && !testBit(u.mask, targetId),
          );
          const validCoverUnits = allUnits.filter((u) =>
            coverTypes.includes(u.type),
          );

          if (
            validBaseUnits.length < fishSize ||
            validCoverUnits.length < fishSize
          )
            continue;

          const coverByCell = Array.from({ length: 81 }, () => []);
          validCoverUnits.forEach((unit, index) => {
            getBits(unit.mask).forEach((id) => coverByCell[id].push(index));
          });

          const evaluateCover = (baseCombination, coverUnits, coverMask) => {
            if (
              coverUnits.some((cover) =>
                baseCombination.units.some(
                  (base) => base.uIndex === cover.uIndex,
                ),
              )
            )
              return null;

            const coverTypeMask = coverUnits.reduce(
              (mask, unit) => mask | (1 << unit.type),
              0,
            );
            if (isExcludedGeometry(baseCombination.typeMask, coverTypeMask))
              return null;

            const exoFinsMask = bitAndNot(baseCombination.mask, coverMask);
            if (bitPopcount(exoFinsMask) > 4) return null;

            const allFinsMask = bitOr(exoFinsMask, baseCombination.endoMask);
            if (bitPopcount(allFinsMask) > 5) return null;
            if (
              !isZero(allFinsMask) &&
              !isZero(bitAndNot(allFinsMask, PEER_BITSETS[targetId]))
            )
              return null;

            const possibleElimsMask = bitAndNot(
              coverMask,
              baseCombination.mask,
            );
            let toEliminateMask = possibleElimsMask;
            if (!isZero(allFinsMask)) {
              let commonVis = [0x7ffffff, 0x7ffffff, 0x7ffffff];
              for (const finId of getBits(allFinsMask)) {
                commonVis = bitAnd(commonVis, PEER_BITSETS[finId]);
              }
              toEliminateMask = bitAnd(possibleElimsMask, commonVis);
            }
            if (!testBit(toEliminateMask, targetId)) return null;

            const elims = getBits(toEliminateMask).map((id) => ({
              r: Math.floor(id / 9),
              c: id % 9,
              num,
            }));
            if (elims.length === 0) return null;

            if (findAll) {
              const elimSig = elims
                .map((el) => `${el.r},${el.c}:${el.num}`)
                .sort()
                .join("|");
              if (seenElimSignatures.has(elimSig)) return null;
              seenElimSignatures.add(elimSig);
            }

            elims.forEach((el) => eliminatedTargets.add(el.r * 9 + el.c));
            return makeResult(
              baseCombination.units,
              coverUnits,
              allFinsMask,
              elims,
            );
          };

          const searchCovers = (baseCombination) => {
            const requiredMask = bitAndNot(
              baseCombination.mask,
              PEER_BITSETS[targetId],
            );
            const selected = [];
            const selectedFlags = new Uint8Array(validCoverUnits.length);
            const seenStates = new Set();
            const seenCoverSets = new Set();

            const evaluateSelected = (coverMask) => {
              const sortedIndexes = selected.slice().sort((a, b) => a - b);
              const signature = sortedIndexes.join(",");
              if (seenCoverSets.has(signature)) return null;
              seenCoverSets.add(signature);
              return evaluateCover(
                baseCombination,
                sortedIndexes.map((index) => validCoverUnits[index]),
                coverMask,
              );
            };

            const fillRemaining = (start, coverMask) => {
              if (selected.length === fishSize) {
                return evaluateSelected(coverMask);
              }
              const needed = fishSize - selected.length;
              for (
                let index = start;
                index <= validCoverUnits.length - needed;
                index++
              ) {
                if (selectedFlags[index]) continue;
                selectedFlags[index] = 1;
                selected.push(index);
                const result = fillRemaining(
                  index + 1,
                  bitOr(coverMask, validCoverUnits[index].mask),
                );
                selected.pop();
                selectedFlags[index] = 0;
                if (result) return result;
              }
              return null;
            };

            const visit = (coverMask) => {
              if (selected.length === fishSize) {
                if (
                  !isZero(bitAndNot(requiredMask, coverMask)) ||
                  !testBit(coverMask, targetId)
                )
                  return null;
                return evaluateSelected(coverMask);
              }

              const stateKey = selected
                .slice()
                .sort((a, b) => a - b)
                .join(",");
              if (seenStates.has(stateKey)) return null;
              seenStates.add(stateKey);

              const uncovered = bitAndNot(requiredMask, coverMask);
              let choices = null;
              if (!isZero(uncovered)) {
                for (const id of getBits(uncovered)) {
                  const available = coverByCell[id].filter(
                    (index) => !selectedFlags[index],
                  );
                  if (available.length === 0) return null;
                  if (!choices || available.length < choices.length) {
                    choices = available;
                    if (choices.length === 1) break;
                  }
                }
              } else if (!testBit(coverMask, targetId)) {
                choices = coverByCell[targetId].filter(
                  (index) => !selectedFlags[index],
                );
                if (choices.length === 0) return null;
              } else {
                return fillRemaining(0, coverMask);
              }

              for (const index of choices) {
                selectedFlags[index] = 1;
                selected.push(index);
                const result = visit(
                  bitOr(coverMask, validCoverUnits[index].mask),
                );
                selected.pop();
                selectedFlags[index] = 0;
                if (result) return result;
              }
              return null;
            };

            return visit([0, 0, 0]);
          };

          for (const baseCombination of getBaseCombinations(baseTypes)) {
            if (testBit(baseCombination.mask, targetId)) continue;
            if (
              !isZero(
                bitAndNot(baseCombination.endoMask, PEER_BITSETS[targetId]),
              )
            )
              continue;

            const resultObj = searchCovers(baseCombination);
            if (!resultObj) continue;

            changed = true;
            foundFishForTarget = true;
            if (!findAll) return resultObj;
            results.push(resultObj);
            break;
          }
        }
      }

      if (changed && !findAll) break;
      memoSet.add(memoKey); // Caches processed digit grid
    }

    return findAll ? results : { change: false };
  },

  finnedFrankenSwordfish: (board, pencils, findAll = false) => {
    return techniques._complexFishCore(board, pencils, 3, false, findAll);
  },

  finnedMutantSwordfish: (board, pencils, findAll = false) => {
    return techniques._complexFishCore(board, pencils, 3, true, findAll);
  },

  finnedFrankenJellyfish: (board, pencils, findAll = false) => {
    return techniques._complexFishCore(board, pencils, 4, false, findAll);
  },

  finnedMutantJellyfish: (board, pencils, findAll = false) => {
    return techniques._complexFishCore(board, pencils, 4, true, findAll);
  },

  // --- Unified Coloring / Medusa Helper ---

  // Helper: Convert cell coordinates and digit into a unique 0-728 ID
  _getCandId: (r, c, n) => (r * 9 + c) * 9 + (n - 1),

  // Helper: Parse the 0-728 ID back into { r, c, n }
  _parseCandId: (id) => {
    const cellIdx = Math.floor(id / 9);
    return { r: Math.floor(cellIdx / 9), c: cellIdx % 9, n: (id % 9) + 1 };
  },

  // Helper: Build the bi-directional graph of strong links
  _buildColoringGraph: (pencils, singleDigit = null) => {
    const graph = Array.from({ length: 729 }, () => []);
    const addLink = (id1, id2) => {
      graph[id1].push(id2);
      graph[id2].push(id1);
    };
    const getCandId = techniques._getCandId;

    // 1. Strong Links (Conjugate Pairs in Units)
    const startD = singleDigit || 1;
    const endD = singleDigit || 9;

    for (let d = startD; d <= endD; d++) {
      for (let i = 0; i < 27; i++) {
        let unitType = i < 9 ? "row" : i < 18 ? "col" : "box";
        let idx = i < 9 ? i : i < 18 ? i - 9 : i - 18;
        const cells = techniques
          ._getUnitCells(unitType, idx)
          .filter(([r, c]) => pencils[r][c].has(d));

        // If exactly two candidates of digit 'd' exist in this unit, they form a strong link
        if (cells.length === 2) {
          addLink(
            getCandId(cells[0][0], cells[0][1], d),
            getCandId(cells[1][0], cells[1][1], d),
          );
        }
      }
    }

    // 2. Bivalue Cells (Strong Links between diff candidates in the same cell)
    // Applied ONLY for 3D Medusa (when singleDigit is null)
    if (singleDigit === null) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (pencils[r][c].size === 2) {
            const [d1, d2] = [...pencils[r][c]];
            addLink(getCandId(r, c, d1), getCandId(r, c, d2));
          }
        }
      }
    }

    return graph;
  },

  // Helper: Validates a colored component against coloring rules and finds eliminations
  _applyColoringRules: (
    componentNodes,
    coloring,
    pencils,
    board,
    isSimpleColoring,
  ) => {
    const parseCandId = techniques._parseCandId;
    const getCandId = techniques._getCandId;
    const bitFor = (d) => 1 << (d - 1);

    // Returns formatted elimination context based on the violated rule
    const eliminateColor = (targetColor, rule, data) => {
      const output = [];
      for (const id of componentNodes) {
        if (coloring[id] === targetColor) {
          const { r, c, n } = parseCandId(id);
          output.push({ r, c, num: n });
        }
      }
      return { removals: output, rule, targetColor, data };
    };

    // Arrays to track what each color 'sees' and occupies
    const killedMasks = [null, new Int32Array(81), new Int32Array(81)];
    const cellColors = new Int8Array(81).fill(0);
    const cellHasColor1 = new Int8Array(81).fill(0);
    const cellHasColor2 = new Int8Array(81).fill(0);

    for (const id of componentNodes) {
      const color = coloring[id];
      const { r, c, n } = parseCandId(id);
      const cellId = r * 9 + c;
      const digitBit = bitFor(n);

      // --- Rule A: Invalid Color (Color appears twice in the same cell) ---
      if (!isSimpleColoring) {
        if (color === 1) {
          if (cellHasColor1[cellId])
            return eliminateColor(1, "A_Cell", { r, c });
          cellHasColor1[cellId] = 1;
        } else if (color === 2) {
          if (cellHasColor2[cellId])
            return eliminateColor(2, "A_Cell", { r, c });
          cellHasColor2[cellId] = 1;
        }
      }

      cellColors[cellId] |= color;

      // Update killed masks using the BigInt PEER_MAP
      let pm = PEER_MAP[cellId];
      let idx = 0;
      while (pm !== 0n) {
        if (pm & 1n) killedMasks[color][idx] |= digitBit;
        pm >>= 1n;
        idx++;
      }
    }

    // --- Rule A: Invalid Color (Color sees itself via Peers) ---
    for (const id of componentNodes) {
      const color = coloring[id];
      const { r, c, n } = parseCandId(id);
      const cellId = r * 9 + c;
      const digitBit = bitFor(n);

      if ((killedMasks[color][cellId] & digitBit) !== 0) {
        return eliminateColor(color, "A_Peer", { r, c, n });
      }
    }

    if (!isSimpleColoring) {
      // --- Rule B: Bad Color (Color empties a cell entirely) ---
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] !== 0) continue;
          const cellIdx = r * 9 + c;

          let cellMask = 0;
          for (const d of pencils[r][c]) cellMask |= bitFor(d);
          if (cellMask === 0) continue;

          // If a color eliminates all possible candidates in a cell, that color is false
          if ((cellMask & ~killedMasks[1][cellIdx]) === 0)
            return eliminateColor(1, "B_Cell", { r, c });
          if ((cellMask & ~killedMasks[2][cellIdx]) === 0)
            return eliminateColor(2, "B_Cell", { r, c });
        }
      }

      // --- Rule B: Bad Color (Color empties a house of a specific digit) ---
      for (let i = 0; i < 27; i++) {
        let unitType = i < 9 ? "row" : i < 18 ? "col" : "box";
        let idx = i < 9 ? i : i < 18 ? i - 9 : i - 18;
        const cells = techniques._getUnitCells(unitType, idx);

        for (let d = 1; d <= 9; d++) {
          const dBit = bitFor(d);
          let hasD = false;
          let c1KillsAll = true;
          let c2KillsAll = true;

          for (const [hr, hc] of cells) {
            if (board[hr][hc] !== 0 || !pencils[hr][hc].has(d)) continue;
            hasD = true;
            const hCellId = hr * 9 + hc;

            const c1PlacesOther =
              cellColors[hCellId] & 1 && coloring[getCandId(hr, hc, d)] !== 1;
            const c1SeesD = (killedMasks[1][hCellId] & dBit) !== 0;
            if (!c1PlacesOther && !c1SeesD) c1KillsAll = false;

            const c2PlacesOther =
              cellColors[hCellId] & 2 && coloring[getCandId(hr, hc, d)] !== 2;
            const c2SeesD = (killedMasks[2][hCellId] & dBit) !== 0;
            if (!c2PlacesOther && !c2SeesD) c2KillsAll = false;
          }

          if (hasD) {
            if (c1KillsAll)
              return eliminateColor(1, "B_House", { unitType, idx, d });
            if (c2KillsAll)
              return eliminateColor(2, "B_House", { unitType, idx, d });
          }
        }
      }
    }

    // --- Rule C: Color Trap (Eliminations generated by BOTH colors) ---
    const removals = [];
    const trapDetails = [];

    const findSource = (targetR, targetC, targetN, targetColor) => {
      for (const id of componentNodes) {
        if (coloring[id] !== targetColor) continue;
        const { r, c, n } = parseCandId(id);
        // Source from within the cell (Medusa only)
        if (r === targetR && c === targetC && n !== targetN)
          return `(${n})r${r + 1}c${c + 1}`;
        // Source from peers
        if (
          n === targetN &&
          (r === targetR ||
            c === targetC ||
            (Math.floor(r / 3) === Math.floor(targetR / 3) &&
              Math.floor(c / 3) === Math.floor(targetC / 3)))
        ) {
          return `(${n})r${r + 1}c${c + 1}`;
        }
      }
      return null;
    };

    const addTrap = (r, c, d) => {
      removals.push({ r, c, num: d });
      trapDetails.push({
        r,
        c,
        num: d,
        c1Source: findSource(r, c, d, 1),
        c2Source: findSource(r, c, d, 2),
      });
    };

    if (!isSimpleColoring) {
      // Cell contains both colors for different digits, trapping uncolored candidates
      for (let i = 0; i < 81; i++) {
        if (cellColors[i] === 3) {
          const r = Math.floor(i / 9);
          const c = i % 9;
          for (const cand of pencils[r][c]) {
            if (coloring[getCandId(r, c, cand)] === 0) addTrap(r, c, cand);
          }
        }
      }
    }

    // Candidate sees both colors, trapping it (Twice-seen or seen + intra-cell colored)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const cellIdx = r * 9 + c;

        for (const d of pencils[r][c]) {
          if (coloring[getCandId(r, c, d)] !== 0) continue;

          const dBit = bitFor(d);
          const seesC1 = (killedMasks[1][cellIdx] & dBit) !== 0;
          const seesC2 = (killedMasks[2][cellIdx] & dBit) !== 0;

          if (seesC1 && seesC2) {
            addTrap(r, c, d);
            continue;
          }

          if (!isSimpleColoring) {
            if (seesC1 && cellColors[cellIdx] & 2) addTrap(r, c, d);
            else if (seesC2 && cellColors[cellIdx] & 1) addTrap(r, c, d);
          }
        }
      }
    }

    if (removals.length > 0) return { removals, rule: "C", trapDetails };
    return { removals: [] };
  },

  // Helper: Handles BFS clustering and delegates rule checking
  _solveColoring: (board, pencils, singleDigit = null, findAll = false) => {
    const results = [];
    const graph = techniques._buildColoringGraph(pencils, singleDigit);
    const visited = new Int8Array(729).fill(0);
    const coloring = new Int8Array(729).fill(0); // 0=None, 1=ColorA, 2=ColorB

    for (let startId = 0; startId < 729; startId++) {
      if (graph[startId].length === 0 || visited[startId]) continue;

      const component = [];
      const queue = [startId];
      visited[startId] = 1;
      coloring[startId] = 1;
      component.push(startId);

      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        const currColor = coloring[curr];
        const nextColor = 3 - currColor;

        for (const neighbor of graph[curr]) {
          if (coloring[neighbor] === 0) {
            coloring[neighbor] = nextColor;
            visited[neighbor] = 1;
            component.push(neighbor);
            queue.push(neighbor);
          }
        }
      }

      // Check the finalized component for logical eliminations
      const result = techniques._applyColoringRules(
        component,
        coloring,
        pencils,
        board,
        singleDigit !== null,
      );

      if (result.removals && result.removals.length > 0) {
        const uniqueElims = _getUniqueRemovals(result.removals);

        if (uniqueElims.length > 0) {
          const name =
            singleDigit !== null ? t("teks_msg_166") : t("teks_msg_167");
          const startCand = techniques._parseCandId(startId);
          const info =
            singleDigit !== null
              ? t("teks_msg_168", singleDigit)
              : t(
                  "teks_msg_169",
                  startCand.n,
                  startCand.r + 1,
                  startCand.c + 1,
                );

          let detail = t(
            "teks_msg_170",
            startCand.n,
            startCand.r + 1,
            startCand.c + 1,
          );

          if (result.rule === "A_Cell") {
            detail += t(
              "teks_msg_171",
              result.targetColor,
              result.data.r + 1,
              result.data.c + 1,
            );
          } else if (result.rule === "A_Peer") {
            detail += t(
              "teks_msg_172",
              result.data.n,
              result.targetColor,
              result.data.r + 1,
              result.data.c + 1,
            );
          } else if (result.rule === "B_Cell") {
            detail += t(
              "teks_msg_173",
              result.data.r + 1,
              result.data.c + 1,
              result.targetColor,
            );
          } else if (result.rule === "B_House") {
            const uType = result.data.unitType;
            const uName =
              uType === "row"
                ? t("teks_msg_174", result.data.idx + 1)
                : uType === "col"
                  ? t("teks_msg_175", result.data.idx + 1)
                  : t("teks_msg_176", result.data.idx + 1);
            detail += t(
              "teks_msg_177",
              result.targetColor,
              uName,
              result.data.d,
            );
          } else if (result.rule === "C") {
            const c1Sources = new Set();
            const c2Sources = new Set();
            for (const t of result.trapDetails) {
              if (t.c1Source) c1Sources.add(t.c1Source);
              if (t.c2Source) c2Sources.add(t.c2Source);
            }
            const c1Str =
              c1Sources.size > 0
                ? t("teks_msg_178", Array.from(c1Sources).join(", "))
                : "";
            const c2Str =
              c2Sources.size > 0
                ? t("teks_msg_179", Array.from(c2Sources).join(", "))
                : "";
            const sources = [c1Str, c2Str].filter(Boolean).join(", ");
            detail += t("teks_msg_180", sources);
          }

          // Snapshot graph component and colors to guarantee closure safety for visuals
          const visualComponent = [...component];
          const visualColoring = new Int8Array(coloring);

          const resObj = {
            change: true,
            type: "remove",
            cells: uniqueElims,
            hint: { name, mainInfo: info, detail },
            applyVisuals: () => {
              highlightedDigit = singleDigit;
              highlightState = singleDigit !== null ? 1 : 2;

              visualComponent.forEach((id) => {
                const { r, c, n } = techniques._parseCandId(id);
                const colorVal = visualColoring[id];

                // Color 1 => Candidate Palette 4, Color 2 => Candidate Palette 5
                const candColor =
                  colorVal === 1
                    ? candidateColorPalette[4]
                    : candidateColorPalette[5];

                // Only apply cell background coloring for Simple Coloring (singleDigit is not null)
                if (singleDigit !== null) {
                  const cellBgColor =
                    colorVal === 1 ? cellColorPalette[6] : cellColorPalette[7];
                  window.addCellColor(r, c, cellBgColor);
                }

                if (boardState[r][c].pencils.has(n)) {
                  window.addCandidateColor(r, c, n, candColor);
                }
              });

              // Highlight Removed Candidates in Color 1
              uniqueElims.forEach((el) => {
                boardState[el.r][el.c].candSlashes.set(
                  el.num,
                  markColorPalette[0],
                );
              });

              // --- Highlight contradiction locations and draw dashed lines ---
              if (result.rule === "B_Cell") {
                // B_Cell: Highlight the target cell that became empty due to contradiction with error color (index 1)
                window.addCellColor(
                  result.data.r,
                  result.data.c,
                  cellColorPalette[1],
                );

                const targetColor = result.targetColor;
                const r = result.data.r;
                const c = result.data.c;

                // Connect all candidates in the cell to the color node that caused the contradiction with a dashed line
                for (const d of boardState[r][c].pencils) {
                  let foundSource = null;

                  for (const id of visualComponent) {
                    if (visualColoring[id] !== targetColor) continue;
                    const src = techniques._parseCandId(id);

                    // 1) 3D Medusa: Different digit in the same cell (Intra-cell)
                    if (src.r === r && src.c === c && src.n !== d) {
                      foundSource = src;
                      break;
                    }
                    // 2) Peer: Same digit seeing each other in row/col/box
                    if (
                      src.n === d &&
                      (src.r === r ||
                        src.c === c ||
                        (Math.floor(src.r / 3) === Math.floor(r / 3) &&
                          Math.floor(src.c / 3) === Math.floor(c / 3)))
                    ) {
                      foundSource = src;
                      break;
                    }
                  }

                  if (foundSource) {
                    drawnLines.push({
                      r1: r,
                      c1: c,
                      n1: d,
                      r2: foundSource.r,
                      c2: foundSource.c,
                      n2: foundSource.n,
                      color: lineColorPalette[1], // Line color representing error/contradiction (index 1)
                      style: "dash",
                    });
                  }
                }
              } else if (result.rule === "B_House") {
                // B_House: Highlight the entire house that became empty due to contradiction with error color (index 1)
                const houseCells = techniques._getUnitCells(
                  result.data.unitType,
                  result.data.idx,
                );
                for (const [hr, hc] of houseCells) {
                  window.addCellColor(hr, hc, cellColorPalette[1]);
                }
              }
            },
          };

          if (!findAll) return resObj;
          results.push(resObj);
        }
      }

      // Cleanup local coloring for the next BFS component start point
      for (const id of component) coloring[id] = 0;
    }

    return findAll ? results : { change: false };
  },

  // --- Exposed Handlers ---

  simpleColoring: (board, pencils, findAll = false) => {
    const results = [];
    for (let d = 1; d <= 9; d++) {
      const res = techniques._solveColoring(board, pencils, d, findAll);
      if (!findAll) {
        if (res.change) return res;
      } else {
        if (res.length > 0) results.push(...res);
      }
    }
    return findAll ? results : { change: false };
  },

  medusa3D: (board, pencils, findAll = false) => {
    return techniques._solveColoring(board, pencils, null, findAll);
  },

  bivalueOddagon: (board, pencils, findAll = false) => {
    const results = [];
    const MAX_LOOPS = 100;

    const getHouse = (cell, type) => {
      const r = Math.floor(cell / 9);
      const c = cell % 9;
      if (type === 0) return r;
      if (type === 1) return 9 + c;
      if (type === 2) return 18 + (Math.floor(r / 3) * 3 + Math.floor(c / 3));
    };

    const getHouses = (cell) => {
      const r = Math.floor(cell / 9);
      const c = cell % 9;
      return [r, 9 + c, 18 + (Math.floor(r / 3) * 3 + Math.floor(c / 3))];
    };

    const housesMap = Array.from({ length: 27 }, () => []);
    for (let i = 0; i < 81; i++) {
      const h = getHouses(i);
      housesMap[h[0]].push(i);
      housesMap[h[1]].push(i);
      housesMap[h[2]].push(i);
    }

    const isPow2 = (n) => (n & (n - 1)) === 0 && n !== 0;
    const trailingZeroCount = (n) => {
      if (n === 0) return 32;
      let count = 0;
      while ((n & 1) === 0) {
        count++;
        n >>= 1;
      }
      return count;
    };
    const popCount = (n) => {
      let count = 0;
      while (n) {
        count += n & 1;
        n >>= 1;
      }
      return count;
    };

    const getSharedHouse = (cells) => {
      if (cells.length === 0) return -1;
      let shared = [true, true, true];
      const r0 = Math.floor(cells[0] / 9),
        c0 = cells[0] % 9,
        b0 = Math.floor(r0 / 3) * 3 + Math.floor(c0 / 3);
      for (let i = 1; i < cells.length; i++) {
        const r = Math.floor(cells[i] / 9),
          c = cells[i] % 9,
          b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        if (r !== r0) shared[0] = false;
        if (c !== c0) shared[1] = false;
        if (b !== b0) shared[2] = false;
      }
      if (shared[0]) return r0;
      if (shared[1]) return 9 + c0;
      if (shared[2]) return 18 + b0;
      return -1;
    };

    const getSharedHousesList = (cells) => {
      if (cells.length === 0) return [];
      let shared = [true, true, true];
      const r0 = Math.floor(cells[0] / 9),
        c0 = cells[0] % 9,
        b0 = Math.floor(r0 / 3) * 3 + Math.floor(c0 / 3);
      for (let i = 1; i < cells.length; i++) {
        const r = Math.floor(cells[i] / 9),
          c = cells[i] % 9,
          b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        if (r !== r0) shared[0] = false;
        if (c !== c0) shared[1] = false;
        if (b !== b0) shared[2] = false;
      }
      const list = [];
      if (shared[0]) list.push(r0);
      if (shared[1]) list.push(9 + c0);
      if (shared[2]) list.push(18 + b0);
      return list;
    };

    const getPeerIntersection = (cells) => {
      if (cells.length === 0) return [];
      let common = PEER_MAP[cells[0]];
      for (let i = 1; i < cells.length; i++) {
        common &= PEER_MAP[cells[i]];
      }
      const res = [];
      for (let i = 0; i < 81; i++) {
        if ((common & (1n << BigInt(i))) !== 0n) res.push(i);
      }
      return res;
    };

    const getGuardiansStr = (extraCells, d1, d2) => {
      const guardiansByDigit = new Map();

      for (const cell of extraCells) {
        const r = Math.floor(cell / 9);
        const c = cell % 9;
        for (const digit of pencils[r][c]) {
          if (digit === d1 || digit === d2) continue;
          if (!guardiansByDigit.has(digit)) guardiansByDigit.set(digit, []);
          guardiansByDigit.get(digit).push({ r, c });
        }
      }

      const formatCells = (cells) => {
        const rows = new Set(cells.map(({ r }) => r));
        const cols = new Set(cells.map(({ c }) => c));
        const groupByRow = rows.size <= cols.size;
        const groups = new Map();

        for (const { r, c } of cells) {
          const key = groupByRow ? r : c;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(groupByRow ? c : r);
        }

        return Array.from(groups.entries())
          .sort(([a], [b]) => a - b)
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
      };

      return Array.from(guardiansByDigit.entries())
        .sort(([a], [b]) => a - b)
        .map(([digit, cells]) => `(${digit})${formatCells(cells)}`)
        .join(",");
    };

    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        const cellsContainingBothTwoDigits = [];

        // Used by the existing Oddagon loop search.
        // Only cells containing both d1 and d2 are populated.
        const cellMasks = new Array(81).fill(0);

        // Full candidate mask for every unsolved cell.
        // Type 3 needs this when examining ALS cells outside the Oddagon loop.
        const allCellMasks = new Array(81).fill(0);

        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (board[r][c] !== 0) continue;

            const id = r * 9 + c;

            let mask = 0;
            for (const num of pencils[r][c]) {
              mask |= 1 << (num - 1);
            }

            // Store candidates for EVERY unsolved cell.
            allCellMasks[id] = mask;

            // Existing Oddagon-loop candidate selection.
            if (pencils[r][c].has(d1) && pencils[r][c].has(d2)) {
              cellsContainingBothTwoDigits.push(id);
              cellMasks[id] = mask;
            }
          }
        }

        if (cellsContainingBothTwoDigits.length < 4) continue;

        const comparer = (1 << (d1 - 1)) | (1 << (d2 - 1));
        const resultLoops = [];
        const seenLoopKeys = new Set();
        let loopsCount = 0;

        const dfs = (
          startCell,
          previousCell,
          previousHouse,
          loopSet,
          loopArr,
          extraCells,
          extraDigitsMask,
        ) => {
          if (loopsCount >= MAX_LOOPS) return;

          for (let houseType = 0; houseType < 3; houseType++) {
            const nextHouse = getHouse(previousCell, houseType);
            if (nextHouse === previousHouse) continue;

            const houseCells = housesMap[nextHouse];
            let loopCellsInThisHouse = 0;
            let hasStartCell = false;
            for (const cell of houseCells) {
              if (loopSet.has(cell)) {
                loopCellsInThisHouse++;
                if (cell === startCell) hasStartCell = true;
              }
            }

            if (loopCellsInThisHouse >= 2 && !hasStartCell) continue;

            const otherCellsCanBeIterated = [];
            for (const cell of houseCells) {
              if (
                (cellsContainingBothTwoDigits.includes(cell) &&
                  !loopSet.has(cell)) ||
                cell === startCell
              ) {
                otherCellsCanBeIterated.push(cell);
              }
            }
            if (otherCellsCanBeIterated.length === 0) continue;

            for (const cell of otherCellsCanBeIterated) {
              const h = getHouses(cell);
              let countH0 = 0,
                countH1 = 0,
                countH2 = 0;
              for (const lc of loopArr) {
                const lh = getHouses(lc);
                if (lh[0] === h[0]) countH0++;
                if (lh[1] === h[1]) countH1++;
                if (lh[2] === h[2]) countH2++;
              }
              if (
                (countH0 >= 2 || countH1 >= 2 || countH2 >= 2) &&
                startCell !== cell
              ) {
                continue;
              }

              if (startCell === cell) {
                if (loopArr.length % 2 !== 0 && loopArr.length > 4) {
                  const sortedLoop = [...loopArr]
                    .sort((a, b) => a - b)
                    .join(",");
                  if (!seenLoopKeys.has(sortedLoop)) {
                    seenLoopKeys.add(sortedLoop);
                    loopsCount++;
                    resultLoops.push({
                      loop: [...loopArr],
                      extraCells: [...extraCells],
                      comparer,
                    });
                  }
                  return;
                }
              } else {
                const cMask = cellMasks[cell];
                const newExtraDigitsMask =
                  extraDigitsMask | (cMask & ~comparer);
                const isExtra = popCount(cMask) > 2;
                const newExtraCells = isExtra
                  ? [...extraCells, cell]
                  : [...extraCells];

                let shouldProceed = false;
                const firstSharedHouse = getSharedHouse(newExtraCells);
                if (firstSharedHouse !== -1) shouldProceed = true;
                else if (newExtraCells.length < 3) shouldProceed = true;
                else {
                  if (isPow2(newExtraDigitsMask)) {
                    const extraDigit =
                      trailingZeroCount(newExtraDigitsMask) + 1;
                    const peers = getPeerIntersection(newExtraCells);
                    let hasDigitInPeers = false;
                    for (const p of peers) {
                      if (
                        board[Math.floor(p / 9)][p % 9] === 0 &&
                        pencils[Math.floor(p / 9)][p % 9].has(extraDigit)
                      ) {
                        hasDigitInPeers = true;
                        break;
                      }
                    }
                    if (hasDigitInPeers) shouldProceed = true;
                  }
                }

                if (shouldProceed) {
                  loopSet.add(cell);
                  loopArr.push(cell);
                  dfs(
                    startCell,
                    cell,
                    nextHouse,
                    loopSet,
                    loopArr,
                    newExtraCells,
                    newExtraDigitsMask,
                  );
                  loopArr.pop();
                  loopSet.delete(cell);
                }
              }
            }
          }
        };

        for (const cell of cellsContainingBothTwoDigits) {
          const isExtra = popCount(cellMasks[cell]) > 2;
          const extra = isExtra ? [cell] : [];
          dfs(cell, cell, -1, new Set([cell]), [cell], extra, 0);
        }

        for (const oddagon of resultLoops) {
          const { loop, extraCells } = oddagon;
          const pathStr =
            loop
              .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
              .join("-") + "-";

          if (extraCells.length === 0) continue;

          const checkType2 = () => {
            let mask = 0;
            for (const cell of extraCells) mask |= cellMasks[cell];
            mask &= ~comparer;

            if (!isPow2(mask)) return null;

            const extraDigit = trailingZeroCount(mask) + 1;
            const peers = getPeerIntersection(extraCells);
            const elimMap = [];
            for (const p of peers) {
              if (
                board[Math.floor(p / 9)][p % 9] === 0 &&
                pencils[Math.floor(p / 9)][p % 9].has(extraDigit)
              ) {
                elimMap.push({
                  r: Math.floor(p / 9),
                  c: p % 9,
                  num: extraDigit,
                });
              }
            }

            if (elimMap.length > 0) {
              return {
                change: true,
                type: "remove",
                cells: elimMap,
                hint: {
                  name: t("teks_msg_183"),
                  mainInfo: t("teks_msg_184", d1, d2),
                  detail: t(
                    "teks_msg_185",
                    d1,
                    d2,
                    getGuardiansStr(extraCells, d1, d2),
                    pathStr,
                  ),
                },
                applyVisuals: () => {
                  highlightedDigit = null;
                  highlightState = 0;
                  loop.forEach((id) => {
                    window.addCellColor(
                      Math.floor(id / 9),
                      id % 9,
                      cellColorPalette[7],
                    );
                    if (boardState[Math.floor(id / 9)][id % 9].pencils.has(d1))
                      boardState[Math.floor(id / 9)][id % 9].pencilColors.set(
                        d1,
                        candidateColorPalette[7],
                      );
                    if (boardState[Math.floor(id / 9)][id % 9].pencils.has(d2))
                      boardState[Math.floor(id / 9)][id % 9].pencilColors.set(
                        d2,
                        candidateColorPalette[7],
                      );
                  });
                  extraCells.forEach((id) => {
                    boardState[Math.floor(id / 9)][id % 9].pencils.forEach(
                      (cand) => {
                        if (cand !== d1 && cand !== d2) {
                          boardState[Math.floor(id / 9)][
                            id % 9
                          ].pencilColors.set(cand, candidateColorPalette[3]);
                        }
                      },
                    );
                  });
                  elimMap.forEach((el) =>
                    boardState[el.r][el.c].candSlashes.set(
                      el.num,
                      markColorPalette[0],
                    ),
                  );
                },
              };
            }
            return null;
          };

          const checkType3 = () => {
            const type3Results = [];
            for (const cell of extraCells) {
              const mask = allCellMasks[cell];

              // Every extra cell must contain both Oddagon base digits.
              if ((mask & comparer) !== comparer) {
                return null;
              }
            }

            // Type 3 requires all extra cells to share at least one house.
            const sharedHouses = getSharedHousesList(extraCells);

            if (sharedHouses.length === 0) {
              return null;
            }
            let extraCellsUnionMask = 0;
            for (const cell of extraCells) {
              extraCellsUnionMask |= allCellMasks[cell];
            }
            if ((extraCellsUnionMask & comparer) !== comparer) {
              return null;
            }
            const otherDigitsMask = extraCellsUnionMask & ~comparer;
            const otherDigitsCount = popCount(otherDigitsMask);
            for (const house of sharedHouses) {
              let hasPairValue = false;
              for (const cell of housesMap[house]) {
                const r = Math.floor(cell / 9);
                const c = cell % 9;
                const value = board[r][c];

                if (value === d1 || value === d2) {
                  hasPairValue = true;
                  break;
                }
              }
              if (hasPairValue) {
                continue;
              }
              const otherCellsInHouse = [];
              for (const cell of housesMap[house]) {
                const r = Math.floor(cell / 9);
                const c = cell % 9;
                if (board[r][c] === 0 && !loop.includes(cell)) {
                  otherCellsInHouse.push(cell);
                }
              }
              const minimumSize = otherDigitsCount - 1;
              for (
                let size = minimumSize;
                size <= otherCellsInHouse.length;
                size++
              ) {
                if (size <= 0) continue;

                for (const combo of techniques.combinations(
                  otherCellsInHouse,
                  size,
                )) {
                  let comboMask = 0;
                  for (const cell of combo) {
                    comboMask |= allCellMasks[cell];
                  }

                  // N cells / N+1 candidates = ALS.
                  if (popCount(comboMask) !== size + 1) {
                    continue;
                  }

                  // The ALS must contain every extra digit produced
                  // by the Oddagon extra cells.
                  if ((comboMask & otherDigitsMask) !== otherDigitsMask) {
                    continue;
                  }
                  const elimMap = [];
                  for (const cell of housesMap[house]) {
                    const r = Math.floor(cell / 9);
                    const c = cell % 9;

                    if (
                      board[r][c] !== 0 ||
                      loop.includes(cell) ||
                      combo.includes(cell)
                    ) {
                      continue;
                    }
                    const removableMask = allCellMasks[cell] & comboMask;
                    for (let digit = 1; digit <= 9; digit++) {
                      const bit = 1 << (digit - 1);

                      if ((removableMask & bit) !== 0) {
                        elimMap.push({
                          r,
                          c,
                          num: digit,
                        });
                      }
                    }
                  }
                  if (elimMap.length > 0) {
                    const subsetStr = combo
                      .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
                      .join("-");
                    const result = {
                      change: true,
                      type: "remove",
                      cells: elimMap,

                      hint: {
                        name: t("teks_msg_186"),
                        mainInfo: t("teks_msg_184", d1, d2),
                        detail: t(
                          "teks_msg_187",
                          d1,
                          d2,
                          getGuardiansStr(extraCells, d1, d2),
                          pathStr,
                          subsetStr,
                        ),
                      },
                      applyVisuals: () => {
                        highlightedDigit = null;
                        highlightState = 0;

                        // Oddagon loop
                        loop.forEach((id) => {
                          const r = Math.floor(id / 9);
                          const c = id % 9;

                          window.addCellColor(r, c, cellColorPalette[7]);

                          if (boardState[r][c].pencils.has(d1)) {
                            boardState[r][c].pencilColors.set(
                              d1,
                              candidateColorPalette[7],
                            );
                          }

                          if (boardState[r][c].pencils.has(d2)) {
                            boardState[r][c].pencilColors.set(
                              d2,
                              candidateColorPalette[7],
                            );
                          }
                        });

                        // Oddagon extra candidates
                        extraCells.forEach((id) => {
                          const r = Math.floor(id / 9);
                          const c = id % 9;

                          boardState[r][c].pencils.forEach((cand) => {
                            if (cand !== d1 && cand !== d2) {
                              boardState[r][c].pencilColors.set(
                                cand,
                                candidateColorPalette[3],
                              );
                            }
                          });
                        });

                        // ALS cells
                        combo.forEach((id) => {
                          const r = Math.floor(id / 9);
                          const c = id % 9;

                          window.addCellColor(r, c, cellColorPalette[6]);

                          boardState[r][c].pencils.forEach((cand) => {
                            if (cand !== d1 && cand !== d2) {
                              boardState[r][c].pencilColors.set(
                                cand,
                                candidateColorPalette[4],
                              );
                            }
                          });
                        });

                        // Eliminations
                        elimMap.forEach((el) => {
                          boardState[el.r][el.c].candSlashes.set(
                            el.num,
                            markColorPalette[0],
                          );
                        });
                      },
                    };
                    if (!findAll) return result;
                    type3Results.push(result);
                  }
                }
              }
            }

            return findAll ? type3Results : null;
          };

          const checkType4 = () => {
            let mask = 0;
            for (const cell of extraCells) mask |= cellMasks[cell];
            mask &= ~comparer;
            if (!isPow2(mask) || extraCells.length !== 2) return null;

            const [c1, c2] = extraCells;

            let adjacent = false;
            for (let i = 0; i < loop.length; i++) {
              const next = (i + 1) % loop.length;
              if (
                (loop[i] === c1 && loop[next] === c2) ||
                (loop[i] === c2 && loop[next] === c1)
              ) {
                adjacent = true;
                break;
              }
            }
            if (!adjacent) return null;

            const loopCellsCanSee = new Set();
            for (const lc of loop) {
              if (
                lc !== c1 &&
                lc !== c2 &&
                (techniques._sees(
                  techniques._idToCell(lc),
                  techniques._idToCell(c1),
                ) ||
                  techniques._sees(
                    techniques._idToCell(lc),
                    techniques._idToCell(c2),
                  ))
              ) {
                loopCellsCanSee.add(lc);
              }
            }

            let isAnyLoopCellSeeingBothCells = false;
            let elimMapMap = null;

            for (const extraCell of extraCells) {
              const sees = [];
              for (const lc of loopCellsCanSee) {
                if (
                  techniques._sees(
                    techniques._idToCell(lc),
                    techniques._idToCell(extraCell),
                  )
                ) {
                  sees.push(lc);
                }
              }
              if (sees.length !== 1) {
                isAnyLoopCellSeeingBothCells = true;
                break;
              }

              const localElims = [];
              for (const lc of loopCellsCanSee) {
                const intersection = getPeerIntersection([extraCell, lc]);
                for (const cell of intersection) {
                  if (!loop.includes(cell)) {
                    if (board[Math.floor(cell / 9)][cell % 9] === 0) {
                      if (pencils[Math.floor(cell / 9)][cell % 9].has(d1)) {
                        localElims.push(cell * 10 + d1);
                      }
                      if (pencils[Math.floor(cell / 9)][cell % 9].has(d2)) {
                        localElims.push(cell * 10 + d2);
                      }
                    }
                  }
                }
              }
              if (elimMapMap === null) {
                elimMapMap = new Set(localElims);
              } else {
                const nextElimMap = new Set();
                for (const el of localElims) {
                  if (elimMapMap.has(el)) nextElimMap.add(el);
                }
                elimMapMap = nextElimMap;
              }
            }

            if (
              isAnyLoopCellSeeingBothCells ||
              elimMapMap === null ||
              elimMapMap.size === 0
            )
              return null;

            const elims = [];
            for (const el of elimMapMap) {
              const cell = Math.floor(el / 10);
              const digit = el % 10;
              elims.push({ r: Math.floor(cell / 9), c: cell % 9, num: digit });
            }

            if (elims.length > 0) {
              return {
                change: true,
                type: "remove",
                cells: elims,
                hint: {
                  name: t("teks_msg_188"),
                  mainInfo: t("teks_msg_184", d1, d2),
                  detail: t(
                    "teks_msg_189",
                    d1,
                    d2,
                    getGuardiansStr(extraCells, d1, d2),
                    pathStr,
                  ),
                },
                applyVisuals: () => {
                  highlightState = 0;
                  loop.forEach((id) => {
                    window.addCellColor(
                      Math.floor(id / 9),
                      id % 9,
                      cellColorPalette[7],
                    );

                    if (boardState[Math.floor(id / 9)][id % 9].pencils.has(d1))
                      boardState[Math.floor(id / 9)][id % 9].pencilColors.set(
                        d1,
                        candidateColorPalette[7],
                      );
                    if (boardState[Math.floor(id / 9)][id % 9].pencils.has(d2))
                      boardState[Math.floor(id / 9)][id % 9].pencilColors.set(
                        d2,
                        candidateColorPalette[7],
                      );
                  });
                  extraCells.forEach((id) => {
                    boardState[Math.floor(id / 9)][id % 9].pencils.forEach(
                      (cand) => {
                        if (cand !== d1 && cand !== d2) {
                          boardState[Math.floor(id / 9)][
                            id % 9
                          ].pencilColors.set(cand, candidateColorPalette[3]);
                        }
                      },
                    );
                  });
                  elims.forEach((el) =>
                    boardState[el.r][el.c].candSlashes.set(
                      el.num,
                      markColorPalette[0],
                    ),
                  );
                },
              };
            }
            return null;
          };

          const res2 = checkType2();
          if (res2) {
            if (!findAll) return res2;
            results.push(res2);
          }

          const res3 = checkType3();
          if (findAll) {
            if (res3) results.push(...res3);
          } else if (res3) {
            return res3;
          }

          const res4 = checkType4();
          if (res4) {
            if (!findAll) return res4;
            results.push(res4);
          }
        }
      }
    }

    return findAll ? results : { change: false };
  },

  brokenWing: (board, pencils, findAll = false) => {
    const results = [];

    // --- 3x27 Bitset Helpers ---
    const bitAnd = (a, b) => [a[0] & b[0], a[1] & b[1], a[2] & b[2]];
    const setBit = (a, id) => {
      a[Math.floor(id / 27)] |= 1 << (id % 27);
    };
    const getBits = (a) => {
      const res = [];
      for (let p = 0; p < 3; p++) {
        let m = a[p];
        let bit = 0;
        while (m > 0) {
          if (m & 1) res.push(p * 27 + bit);
          m >>= 1;
          bit++;
        }
      }
      return res;
    };

    const getCompactLoc = (cellIds) => {
      if (cellIds.length === 0) return "";
      if (cellIds.length === 1)
        return `r${Math.floor(cellIds[0] / 9) + 1}c${(cellIds[0] % 9) + 1}`;

      const rows = new Set(cellIds.map((id) => Math.floor(id / 9)));
      const cols = new Set(cellIds.map((id) => id % 9));

      // Group by the dimension that produces fewer groups
      const groupByRow = rows.size <= cols.size;
      const groups = new Map();

      for (const id of cellIds) {
        const r = Math.floor(id / 9);
        const c = id % 9;
        const key = groupByRow ? r : c;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(groupByRow ? c : r);
      }

      return Array.from(groups.entries())
        .sort(([k1], [k2]) => k1 - k2)
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
    };

    // The odd-length loop itself may use at most two cells from each house.
    // Guardians are deliberately excluded: they are tracked separately and can
    // share houses with the loop (or with other guardians).
    const canExtendOddLoop = (path, id) => {
      const row = Math.floor(id / 9);
      const col = id % 9;
      const box = techniques._getBoxIndex(row, col);
      let rowCount = 0;
      let colCount = 0;
      let boxCount = 0;

      for (const pathId of path) {
        const pathRow = Math.floor(pathId / 9);
        const pathCol = pathId % 9;
        if (pathRow === row) rowCount++;
        if (pathCol === col) colCount++;
        if (techniques._getBoxIndex(pathRow, pathCol) === box) boxCount++;
      }

      return rowCount < 2 && colCount < 2 && boxCount < 2;
    };

    // Check all candidates at the shortest valid odd loop length before
    // considering loops that are two cells longer.
    const maxLen = 11;
    for (let pathLength = 5; pathLength <= maxLen; pathLength += 2) {
      for (let num = 1; num <= 9; num++) {
        const templating = techniques._getTemplating(board, pencils, num);
        const { cellsWithNum, allNumMask, units } = templating;

        if (cellsWithNum.length < 5) continue;

        const adj = {};
        for (let i = 0; i < cellsWithNum.length; i++) {
          adj[cellsWithNum[i]] = [];
        }

        // --- TEMPLATING STEP (Optimization) ---
        for (let i = 0; i < 27; i++) {
          const present = units[i];
          if (present.length >= 2) {
            for (let p1 = 0; p1 < present.length; p1++) {
              for (let p2 = p1 + 1; p2 < present.length; p2++) {
                const u = present[p1];
                const v = present[p2];
                const guards = present.filter((id) => id !== u && id !== v);
                adj[u].push({ to: v, guardians: guards });
                adj[v].push({ to: u, guardians: guards });
              }
            }
          }
        }

        for (const start of cellsWithNum) {
          const stack = [
            {
              current: start,
              path: [start],
              guards: new Set(),
              targets: allNumMask,
            },
          ];

          while (stack.length > 0) {
            const { current, path, guards, targets } = stack.pop();
            if (path.length > pathLength) continue;

            for (const edge of adj[current]) {
              let edgeTargets = targets;

              for (const g of edge.guardians) {
                edgeTargets &= PEER_MAP[g];
              }

              // --- Pruning Step ---
              if (edgeTargets === 0n) continue;

              if (edge.to === start && path.length === pathLength) {
                const cycleGuards = new Set(guards);
                edge.guardians.forEach((g) => cycleGuards.add(g));

                if (cycleGuards.size > 0) {
                  const removals = [];
                  let tempTargets = edgeTargets;
                  let i = 0;
                  while (tempTargets > 0n) {
                    if ((tempTargets & 1n) !== 0n) {
                      removals.push({ r: Math.floor(i / 9), c: i % 9, num });
                    }
                    tempTargets >>= 1n;
                    i++;
                  }

                  if (removals.length > 0) {
                    const cycleGuardsArr = Array.from(cycleGuards);
                    const guardCells = Array.from(cycleGuards).map((id) =>
                      techniques._idToCell(id),
                    );
                    const pathStr =
                      path
                        .map(
                          (id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`,
                        )
                        .join("-") + "-";
                    const guardStr = getCompactLoc(cycleGuardsArr);

                    const res = {
                      change: true,
                      type: "remove",
                      cells: removals,
                      hint: {
                        name: t("teks_msg_190"),
                        mainInfo: t("teks_msg_191", num),
                        detail: t("teks_msg_192", num, pathStr, guardStr),
                      },
                      applyVisuals: () => {
                        highlightedDigit = num;
                        highlightState = 1;
                        path.forEach((id) => {
                          const r = Math.floor(id / 9),
                            c = id % 9;
                          // A guardian can also belong to the loop, so retain
                          // both roles in the cell's multi-color annotation.
                          window.addCellColor(r, c, cellColorPalette[6]);
                          boardState[r][c].pencilColors.set(
                            num,
                            candidateColorPalette[4],
                          );
                        });
                        guardCells.forEach((cell) => {
                          window.addCellColor(
                            cell[0],
                            cell[1],
                            cellColorPalette[4],
                          );
                          boardState[cell[0]][cell[1]].pencilColors.set(
                            num,
                            candidateColorPalette[3],
                          );
                        });
                        removals.forEach((el) =>
                          boardState[el.r][el.c].candSlashes.set(
                            num,
                            markColorPalette[0],
                          ),
                        );
                      },
                    };

                    const removalKey = removals
                      .map((r) => `${r.r},${r.c},${r.num}`)
                      .sort()
                      .join(";");
                    const exists = results.some(
                      (r) =>
                        r.cells
                          .map((x) => `${x.r},${x.c},${x.num}`)
                          .sort()
                          .join(";") === removalKey,
                    );
                    if (!exists) {
                      if (!findAll) return res;
                      results.push(res);
                    }
                  }
                }
              } else if (
                path.length < pathLength &&
                !path.includes(edge.to) &&
                edge.to > start &&
                canExtendOddLoop(path, edge.to)
              ) {
                const newGuards = new Set(guards);
                edge.guardians.forEach((g) => newGuards.add(g));
                stack.push({
                  current: edge.to,
                  path: [...path, edge.to],
                  guards: newGuards,
                  targets: edgeTargets,
                });
              }
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  _applyBlossomVisuals: (blossom, removals) => {
    highlightedDigit = null;
    highlightState = 0;
    const usedAlses = blossom.alses;
    const burrNodes = blossom.burr;
    const paths = [blossom.mainPath, ...blossom.branches];
    const alsColorIndices = [6, 7, 2, 3, 4, 5, 8, 1];
    usedAlses.forEach((als, index) => {
      const color =
        cellColorPalette[alsColorIndices[index % alsColorIndices.length]];
      for (const [r, c] of als.cells) {
        if (window.addCellColor) {
          window.addCellColor(r, c, color);
        } else {
          const existing = boardState[r][c].cellColor;
          boardState[r][c].cellColor = existing
            ? Array.isArray(existing)
              ? [...new Set([...existing, color])]
              : existing === color
                ? existing
                : [existing, color]
            : color;
        }
      }
    });

    for (const node of burrNodes) {
      for (const id of node.cells) {
        const r = Math.floor(id / 9);
        const c = id % 9;
        if (boardState[r][c].pencils.has(node.digits[0])) {
          window.addCandidateColor?.(
            r,
            c,
            node.digits[0],
            candidateColorPalette[6],
          );
        }
      }
    }

    const drawnGroupedNodeKeys = new Set();
    const closest = (left, right) => {
      let pair = [left.cells[0], right.cells[0]];
      let distance = Infinity;
      for (const x of left.cells) {
        for (const y of right.cells) {
          const next =
            Math.abs(Math.floor(x / 9) - Math.floor(y / 9)) +
            Math.abs((x % 9) - (y % 9));
          if (next < distance) {
            distance = next;
            pair = [x, y];
          }
        }
      }
      return pair;
    };

    paths.forEach((path, pathIndex) => {
      const isBurringLoop = pathIndex === 0;
      const candidateColors = isBurringLoop ? [4, 2] : [7, 5, 8, 3];
      const lineColorIndex = isBurringLoop
        ? 0
        : 1 + ((pathIndex - 1) % Math.max(1, lineColorPalette.length - 1));
      path.forEach((node, nodeIndex) => {
        const color = candidateColors[nodeIndex % candidateColors.length];
        for (const id of node.cells) {
          const r = Math.floor(id / 9);
          const c = id % 9;
          if (boardState[r][c].pencils.has(node.digits[0])) {
            window.addCandidateColor?.(
              r,
              c,
              node.digits[0],
              candidateColorPalette[color],
            );
          }
        }
      });

      path.forEach((node, nodeIndex) => {
        if (node.cells.length < 2) return;
        const key = `${node.digits[0]}:${[...node.cells]
          .sort((a, b) => a - b)
          .join(",")}`;
        if (drawnGroupedNodeKeys.has(key)) return;
        drawnGroupedNodeKeys.add(key);

        const groupLineColorIndex = nodeIndex % 2 === 0 ? 5 : 4;
        for (let i = 0; i + 1 < node.cells.length; i++) {
          const left = node.cells[i];
          const right = node.cells[i + 1];
          drawnLines.push({
            r1: Math.floor(left / 9),
            c1: left % 9,
            n1: node.digits[0],
            r2: Math.floor(right / 9),
            c2: right % 9,
            n2: node.digits[0],
            color: lineColorPalette[groupLineColorIndex],
            style: "solid",
            role: isBurringLoop ? "blossom-main-group" : "blossom-branch-group",
          });
        }
      });
      for (let i = 0; i + 1 < path.length; i++) {
        const [x, y] = closest(path[i], path[i + 1]);
        drawnLines.push({
          r1: Math.floor(x / 9),
          c1: x % 9,
          n1: path[i].digits[0],
          r2: Math.floor(y / 9),
          c2: y % 9,
          n2: path[i + 1].digits[0],
          color: lineColorPalette[lineColorIndex],
          style: i % 2 === 0 ? "dash" : "solid",
          role: isBurringLoop ? "blossom-main" : "blossom-branch",
        });
      }
    });

    for (const el of removals) {
      boardState[el.r][el.c].candSlashes.set(el.num, markColorPalette[0]);
    }
  },

  _blossomLoopCore: (
    board,
    pencils,
    isRegion,
    findAll = false,
    focusKindOverride = null,
  ) => {
    const focusKind = focusKindOverride || (isRegion ? "region" : "cell");
    techniques._useSharedAICCache(board, pencils);
    const cache = techniques._aicCache;
    if (cache.AllNodes.length === 0) {
      const bitsets = techniques.buildCandidateBitsets(board, pencils);
      const baseNodes = techniques.generateBasicNodesFromBitsets(bitsets);
      for (const node of baseNodes) {
        const key = `${node.digits.join(",")}_${node.cells.join(",")}`;
        cache.NodeCache.set(key, node);
        cache.AllNodes.push(node);
      }
    }

    const allNodes = cache.AllNodes;
    const nodeCache = cache.NodeCache;
    const getNode = (cells, digit) => {
      const sortedCells = [...cells].sort((a, b) => a - b);
      const key = `${digit}_${sortedCells.join(",")}`;
      if (nodeCache.has(key)) return nodeCache.get(key);
      const node = new AICNode(sortedCells, [digit]);
      nodeCache.set(key, node);
      allNodes.push(node);
      return node;
    };

    let orMap = new Map();
    for (const node of allNodes) orMap.set(node, new Set());

    if (cache.BilocationOrMap.size === 0) {
      cache.BilocationOrMap = techniques.buildBilocationOrMap(allNodes);
    }
    orMap = techniques.mergeOrMaps(orMap, cache.BilocationOrMap);

    if (cache.BivalueOrMap.size === 0) {
      cache.BivalueOrMap = techniques.buildBivalueOrMap(allNodes);
    }
    orMap = techniques.mergeOrMaps(orMap, cache.BivalueOrMap);

    if (cache.GroupedOrMap.size === 0) {
      cache.GroupedOrMap = techniques.buildGroupedOrMap(
        pencils,
        (cells, digit) => getNode(cells, digit),
        cache.GroupedLinkRegistry,
      );
    }
    orMap = techniques.mergeOrMaps(orMap, cache.GroupedOrMap);

    const blossomAlsPolicyKey = "blossom-full-sectors";
    let blossomAlsPolicy = cache.AlsPolicyCache.get(blossomAlsPolicyKey);
    if (!blossomAlsPolicy) {
      const registry = new Map();
      const map = techniques.buildAlsOrMap(
        board,
        pencils,
        (cells, digit) => getNode(cells, digit),
        registry,
        {
          preferSmallestAls: true,
          requireAlsCellSubsetForDominance: false,
        },
      );
      blossomAlsPolicy = { map, registry };
      cache.AlsPolicyCache.set(blossomAlsPolicyKey, blossomAlsPolicy);
    }
    const blossomAlsMap = blossomAlsPolicy.map;
    const blossomAlsLinkRegistry = blossomAlsPolicy.registry;
    orMap = techniques.mergeOrMaps(orMap, blossomAlsMap);
    const alsEdgeSize = (left, right) =>
      blossomAlsLinkRegistry.get(left)?.get(right)?.cells.length || 0;
    const nodeAlsSizeCache = new WeakMap();
    const minimumAlsEdgeSize = (node) => {
      if (nodeAlsSizeCache.has(node)) return nodeAlsSizeCache.get(node);
      let minimum = Infinity;
      for (const neighbor of blossomAlsMap.get(node) || []) {
        minimum = Math.min(minimum, alsEdgeSize(node, neighbor));
      }
      nodeAlsSizeCache.set(node, minimum);
      return minimum;
    };

    let blossomSearchCache = cache.BlossomSearchCache;
    if (
      !blossomSearchCache ||
      blossomSearchCache.nodeCount !== allNodes.length
    ) {
      const orNodes = [];
      const orNodeSet = new Set();
      for (const [node, neighbors] of orMap) {
        if (neighbors.size > 0 && !orNodeSet.has(node)) {
          orNodeSet.add(node);
          orNodes.push(node);
        }
        for (const neighbor of neighbors) {
          if (!orNodeSet.has(neighbor)) {
            orNodeSet.add(neighbor);
            orNodes.push(neighbor);
          }
        }
      }

      const nodeIndices = new Map(allNodes.map((node, index) => [node, index]));
      const orNodeOrder = new Map(orNodes.map((node, index) => [node, index]));
      const nodesByCandidate = Array.from({ length: 9 * 81 }, () => []);
      for (const node of orNodes) {
        for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
          for (let part = 0; part < 3; part++) {
            let bits = node.NodeBitset[digitIndex][part] >>> 0;
            while (bits !== 0) {
              const low = bits & -bits;
              const bit = 31 - Math.clz32(low);
              const id = part * 27 + bit;
              if (id < 81) nodesByCandidate[digitIndex * 81 + id].push(node);
              bits = (bits & (bits - 1)) >>> 0;
            }
          }
        }
      }

      blossomSearchCache = {
        nodeCount: allNodes.length,
        orNodes,
        nodeIndices,
        orNodeOrder,
        nodesByCandidate,
        nandCache: new Map(),
        reverseDistanceCache: new Map(),
        mainNeighborOrderCache: new Map(),
        burrNandOrderCache: new Map(),
        burrOrOrderCache: new Map(),
        branchPotentialCache: new Map(),
        branchReachabilityCache: new Map(),
        branchReverseStateEdges: null,
        solvedBoard: null,
      };
      cache.BlossomSearchCache = blossomSearchCache;
    }

    const {
      orNodes,
      nodeIndices,
      orNodeOrder,
      nodesByCandidate,
      nandCache,
      reverseDistanceCache,
      mainNeighborOrderCache,
      burrNandOrderCache,
      burrOrOrderCache,
      branchPotentialCache,
      branchReachabilityCache,
    } = blossomSearchCache;

    if (!blossomSearchCache.solvedBoard) {
      blossomSearchCache.solvedBoard = techniques._getSolvedBoard(board);
    }
    const solvedBoard = blossomSearchCache.solvedBoard;

    const nodeWordCache = new WeakMap();
    const nodeWords = (node) => {
      let words = nodeWordCache.get(node);
      if (words) return words;
      words = [];
      for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
        for (let part = 0; part < 3; part++) {
          const bits = node.NodeBitset[digitIndex][part];
          if (bits !== 0) words.push(digitIndex, part, bits);
        }
      }
      nodeWordCache.set(node, words);
      return words;
    };
    const isNodeWithinMask = (node, mask) => {
      const words = nodeWords(node);
      for (let i = 0; i < words.length; i += 3) {
        const bits = words[i + 2];
        if ((mask[words[i]][words[i + 1]] & bits) !== bits) return false;
      }
      return true;
    };

    const nandNeighbors = (source) => {
      if (nandCache.has(source)) return nandCache.get(source);
      const candidateSet = new Set();
      for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
        for (let part = 0; part < 3; part++) {
          let bits = source.NandBitset[digitIndex][part] >>> 0;
          while (bits !== 0) {
            const low = bits & -bits;
            const bit = 31 - Math.clz32(low);
            const id = part * 27 + bit;
            if (id < 81) {
              for (const node of nodesByCandidate[digitIndex * 81 + id]) {
                candidateSet.add(node);
              }
            }
            bits = (bits & (bits - 1)) >>> 0;
          }
        }
      }
      const candidates = [...candidateSet].sort(
        (left, right) => orNodeOrder.get(left) - orNodeOrder.get(right),
      );
      const neighbors = [];
      for (const candidate of candidates) {
        if (
          candidate !== source &&
          techniques.isBitsetSubset(candidate.NodeBitset, source.NandBitset)
        ) {
          neighbors.push(candidate);
        }
      }
      nandCache.set(source, neighbors);
      return neighbors;
    };

    const burrSets = [];
    if (focusKind === "cell") {
      for (let id = 0; id < 81; id++) {
        const r = Math.floor(id / 9);
        const c = id % 9;
        if (board[r][c] !== 0) continue;
        const digits = [...pencils[r][c]].sort((a, b) => a - b);
        if (digits.length < 3 || digits.length > 5) continue;
        burrSets.push({
          kind: "cell",
          cells: [id],
          digits,
          nodes: digits.map((digit) => getNode([id], digit)),
        });
      }
    } else if (focusKind === "region") {
      for (let digit = 1; digit <= 9; digit++) {
        for (let unit = 0; unit < 27; unit++) {
          const cells = [];
          for (let id = 0; id < 81; id++) {
            const part = Math.floor(id / 27);
            const bit = id % 27;
            if ((UNIT_BITSETS[unit][part] & (1 << bit)) === 0) continue;
            const r = Math.floor(id / 9);
            const c = id % 9;
            if (board[r][c] === 0 && pencils[r][c].has(digit)) cells.push(id);
          }
          if (cells.length < 3 || cells.length > 5) continue;
          burrSets.push({
            kind: "region",
            unit,
            cells,
            digits: [digit],
            nodes: cells.map((id) => getNode([id], digit)),
          });
        }
      }
    } else {
      const seenAals = new Set();
      const aalsUnitOrder = [
        ...Array.from({ length: 9 }, (_, index) => 9 + index),
        ...Array.from({ length: 9 }, (_, index) => index),
        ...Array.from({ length: 9 }, (_, index) => 18 + index),
      ];
      for (const unit of aalsUnitOrder) {
        const eligibleCells = [];
        for (let id = 0; id < 81; id++) {
          const part = Math.floor(id / 27);
          const bit = id % 27;
          if ((UNIT_BITSETS[unit][part] & (1 << bit)) === 0) continue;
          const r = Math.floor(id / 9);
          const c = id % 9;
          if (board[r][c] === 0 && pencils[r][c].size >= 2) {
            eligibleCells.push(id);
          }
        }
        if (eligibleCells.length < 5) continue;

        const maximumSize = eligibleCells.length - 2;
        const choose = (start, size, cells) => {
          if (cells.length === size) {
            let unionMask = 0;
            const digitCounts = Array(10).fill(0);
            const digitCells = Array(10).fill(-1);
            for (const id of cells) {
              const r = Math.floor(id / 9);
              const c = id % 9;
              for (const digit of pencils[r][c]) {
                unionMask |= 1 << digit;
                digitCounts[digit]++;
                digitCells[digit] = id;
              }
            }
            if (techniques._bits.popcount(unionMask) !== size + 2) return;

            const onlyDigits = [];
            for (let digit = 1; digit <= 9; digit++) {
              if (digitCounts[digit] === 1) onlyDigits.push(digit);
            }
            if (onlyDigits.length !== 3) return;

            const key = [...cells].sort((a, b) => a - b).join(",");
            if (seenAals.has(key)) return;
            seenAals.add(key);
            const allDigits = [];
            for (let digit = 1; digit <= 9; digit++) {
              if (unionMask & (1 << digit)) allDigits.push(digit);
            }
            const alsCells = cells.map((id) => [Math.floor(id / 9), id % 9]);
            burrSets.push({
              kind: "aals",
              unit,
              cells: [...cells],
              digits: onlyDigits,
              allDigits,
              nodes: onlyDigits.map((digit) =>
                getNode([digitCells[digit]], digit),
              ),
              als: {
                cells: alsCells,
                candidates: unionMask,
                mask: unionMask,
                size,
                candMap: Object.fromEntries(
                  allDigits.map((digit) => [
                    digit,
                    alsCells.filter(([r, c]) => pencils[r][c].has(digit)),
                  ]),
                ),
                unitName: `AALS ${unit + 1}`,
              },
            });
            return;
          }
          const needed = size - cells.length;
          for (
            let index = start;
            index <= eligibleCells.length - needed;
            index++
          ) {
            cells.push(eligibleCells[index]);
            choose(index + 1, size, cells);
            cells.pop();
          }
        };

        for (let size = 3; size <= maximumSize; size++) {
          choose(0, size, []);
        }
      }
    }
    const actualCandidate = (id, digit) => {
      const r = Math.floor(id / 9);
      const c = id % 9;
      return board[r][c] === 0 && pencils[r][c]?.has(digit);
    };
    const candidateCode = (id, digit) => (digit - 1) * 81 + id;
    const candidateId = (code) => code % 81;
    const candidateDigit = (code) => Math.floor(code / 81) + 1;
    const candidateTextKey = (code) =>
      `${candidateId(code)}:${candidateDigit(code)}`;
    const liveCandidateCodes = [];
    for (let id = 0; id < 81; id++) {
      const r = Math.floor(id / 9);
      const c = id % 9;
      if (board[r][c] !== 0) continue;
      for (const digit of pencils[r][c]) {
        liveCandidateCodes.push(candidateCode(id, digit));
      }
    }

    const emptyMask = () => Array.from({ length: 9 }, () => [0, 0, 0]);

    const maskToRemovals = (mask, burrKeys) => {
      const removals = [];
      for (let digit = 1; digit <= 9; digit++) {
        for (let part = 0; part < 3; part++) {
          let bits = mask[digit - 1][part] >>> 0;
          while (bits !== 0) {
            const low = bits & -bits;
            const bit = 31 - Math.clz32(low);
            const id = part * 27 + bit;
            const key = candidateCode(id, digit);
            if (id < 81 && !burrKeys.has(key) && actualCandidate(id, digit)) {
              removals.push({ r: Math.floor(id / 9), c: id % 9, num: digit });
            }
            bits = (bits & (bits - 1)) >>> 0;
          }
        }
      }
      removals.sort((a, b) => a.r - b.r || a.c - b.c || a.num - b.num);
      return removals;
    };

    const nodesShareCandidate = (left, right) => {
      for (let d = 0; d < 9; d++) {
        for (let p = 0; p < 3; p++) {
          if ((left.NodeBitset[d][p] & right.NodeBitset[d][p]) !== 0) {
            return true;
          }
        }
      }
      return false;
    };

    const sharesWithSet = (node, nodes) => {
      for (const other of nodes) {
        if (nodesShareCandidate(node, other)) return true;
      }
      return false;
    };

    const nodeCandidateKeyCache = new WeakMap();
    const nodeCandidateKeys = (node) => {
      let keys = nodeCandidateKeyCache.get(node);
      if (!keys) {
        keys = node.cells.map((id) => candidateCode(id, node.digits[0]));
        nodeCandidateKeyCache.set(node, keys);
      }
      return keys;
    };

    const cellUnits = Array.from({ length: 81 }, (_, id) => [
      Math.floor(id / 9),
      9 + (id % 9),
      18 + Math.floor(Math.floor(id / 9) / 3) * 3 + Math.floor((id % 9) / 3),
    ]);
    const candidateKeysByUnit = Array.from({ length: 9 }, (_, digitIndex) =>
      Array.from({ length: 27 }, (_, unit) => {
        const keys = [];
        for (let id = 0; id < 81; id++) {
          const part = Math.floor(id / 27);
          const bit = id % 27;
          if (
            (UNIT_BITSETS[unit][part] & (1 << bit)) !== 0 &&
            actualCandidate(id, digitIndex + 1)
          ) {
            keys.push(candidateCode(id, digitIndex + 1));
          }
        }
        return keys;
      }),
    );
    const cellCandidateKeys = Array.from({ length: 81 }, (_, id) => {
      const r = Math.floor(id / 9);
      const c = id % 9;
      return [...pencils[r][c]]
        .map((digit) => candidateCode(id, digit))
        .sort((left, right) => left - right);
    });
    const buildTruthRegion = (keys) => {
      const uniqueKeys = [...new Set(keys)].sort((left, right) => left - right);
      return { uniqueKeys, signature: uniqueKeys.join("|") };
    };
    const cellTruthRegions = Array.from({ length: 81 }, (_, id) =>
      buildTruthRegion(cellCandidateKeys[id]),
    );
    const linkTruthRegionCache = new Map();
    const burrTruthRegionCache = new WeakMap();
    const nandLinkChoiceCache = new Map();
    const getAlsUnitIndex = (als) =>
      als.unitType === "row"
        ? als.unitIndex
        : als.unitType === "col"
          ? 9 + als.unitIndex
          : als.unitType === "box"
            ? 18 + als.unitIndex
            : null;

    const nodePairKey = (left, right) => {
      const leftIndex = nodeIndices.get(left);
      const rightIndex = nodeIndices.get(right);
      return leftIndex < rightIndex
        ? `${leftIndex}:${rightIndex}`
        : `${rightIndex}:${leftIndex}`;
    };

    const linkTruthRegion = (left, right) => {
      const cacheKey = nodePairKey(left, right);
      let region = linkTruthRegionCache.get(cacheKey);
      if (region === undefined) {
        region = buildTruthRegion([
          ...nodeCandidateKeys(left),
          ...nodeCandidateKeys(right),
        ]);
        linkTruthRegionCache.set(cacheKey, region);
      }
      return region;
    };

    const burrTruthRegion = (burr) => {
      let region = burrTruthRegionCache.get(burr);
      if (region === undefined) {
        region = buildTruthRegion(
          burr.nodes.flatMap((node) => nodeCandidateKeys(node)),
        );
        burrTruthRegionCache.set(burr, region);
      }
      return region;
    };

    const nandLinkOptions = (left, right) => {
      const cacheKey = nodePairKey(left, right);
      const cached = nandLinkChoiceCache.get(cacheKey);
      if (cached) return cached;

      const options = [];
      if (left.digits[0] !== right.digits[0]) {
        if (
          left.cells.length === 1 &&
          right.cells.length === 1 &&
          left.cells[0] === right.cells[0]
        ) {
          options.push(cellCandidateKeys[left.cells[0]]);
        }
        nandLinkChoiceCache.set(cacheKey, options);
        return options;
      }

      const digit = left.digits[0];
      const cells = [...new Set([...left.cells, ...right.cells])];
      if (cells.length === 0) {
        nandLinkChoiceCache.set(cacheKey, options);
        return options;
      }
      const commonUnits = cellUnits[cells[0]].filter((unit) =>
        cells.every((id) => cellUnits[id].includes(unit)),
      );
      const seen = new Set();
      for (const unit of commonUnits) {
        const keys = candidateKeysByUnit[digit - 1][unit];
        const signature = keys.join("|");
        if (!seen.has(signature)) {
          seen.add(signature);
          options.push(keys);
        }
      }
      nandLinkChoiceCache.set(cacheKey, options);
      return options;
    };

    const alsLinkCache = new Map();
    const alsLinkContribution = (left, right, als) => {
      const cacheKey = nodePairKey(left, right);
      const cached = alsLinkCache.get(cacheKey);
      if (cached !== undefined) return cached;

      const regions = als.cells.map(([r, c]) => cellTruthRegions[r * 9 + c]);
      const alsUnit = getAlsUnitIndex(als);
      const endDigits = new Set([left.digits[0], right.digits[0]]);
      const choices = [];
      for (const textDigit of Object.keys(als.candMap)) {
        const digit = Number(textDigit);
        if (endDigits.has(digit)) continue;
        const cells = als.candMap[digit].map(([r, c]) => r * 9 + c);
        const options =
          alsUnit === null
            ? cellUnits[cells[0]]
                .filter((unit) =>
                  cells.every((id) => cellUnits[id].includes(unit)),
                )
                .map((unit) => candidateKeysByUnit[digit - 1][unit])
            : [candidateKeysByUnit[digit - 1][alsUnit]];
        if (options.length === 0) {
          alsLinkCache.set(cacheKey, null);
          return null;
        }
        choices.push(options);
      }
      const contribution = { regions, choices };
      alsLinkCache.set(cacheKey, contribution);
      return contribution;
    };

    const choiceInfoCache = new WeakMap();
    const choiceSignatureIds = new Map();
    const choiceInfo = (choice) => {
      let info = choiceInfoCache.get(choice);
      if (info) return info;
      const uniqueKeys = [...new Set(choice)].sort(
        (left, right) => left - right,
      );
      const signature = uniqueKeys.join("|");
      let id = choiceSignatureIds.get(signature);
      if (id === undefined) {
        id = choiceSignatureIds.size;
        choiceSignatureIds.set(signature, id);
      }
      info = { uniqueKeys, id };
      choiceInfoCache.set(choice, info);
      return info;
    };

    const captureProof = Boolean(globalThis.__BLOSSOM_CAPTURE_PROOFS__);
    const evaluateStrictRankZero = (burr, paths) => {
      const truths = new Uint16Array(729);
      const truthKeys = [];
      const nandChoices = [];
      const truthRegionSignatures = new Set();
      const truthRegions = captureProof ? [] : null;
      const eliminationWitnesses = captureProof ? new Map() : null;
      let duplicateTruthRegion = false;
      let truthRegionCount = 0;

      const addTruthRegion = (region) => {
        const signature = region.signature;
        if (truthRegionSignatures.has(signature)) {
          duplicateTruthRegion = true;
          return;
        }
        truthRegionSignatures.add(signature);
        const uniqueKeys = region.uniqueKeys;
        if (truthRegions) {
          truthRegions.push(uniqueKeys.map(candidateTextKey));
        }
        truthRegionCount++;
        for (let i = 0; i < uniqueKeys.length; i++) {
          const key = uniqueKeys[i];
          if (truths[key] === 0) truthKeys.push(key);
          truths[key]++;
        }
      };
      addTruthRegion(burrTruthRegion(burr));

      for (const path of paths) {
        for (let i = 0; i + 1 < path.length; i++) {
          const left = path[i];
          const right = path[i + 1];
          if (i % 2 === 0) {
            const choices = nandLinkOptions(left, right);
            if (choices.length === 0) return null;
            nandChoices.push(choices);
            continue;
          }

          const als = blossomAlsLinkRegistry.get(left)?.get(right);
          if (!als) {
            addTruthRegion(linkTruthRegion(left, right));
            continue;
          }

          const contribution = alsLinkContribution(left, right, als);
          if (contribution === null) return null;
          for (const region of contribution.regions) addTruthRegion(region);
          for (const choices of contribution.choices) {
            nandChoices.push(choices);
          }
        }
      }

      if (duplicateTruthRegion) return null;
      if (nandChoices.length !== truthRegionCount) {
        return null;
      }

      const removalMask = emptyMask();
      let validCoverCount = 0;
      let visitedCovers = 0;
      const maxCovers = 20000;
      const truthIndexByKey = new Int16Array(729).fill(-1);
      for (let index = 0; index < truthKeys.length; index++) {
        truthIndexByKey[truthKeys[index]] = index;
      }
      const remainingCoverage = new Array(nandChoices.length + 1);
      remainingCoverage[nandChoices.length] = new Uint16Array(truthKeys.length);
      for (let index = nandChoices.length - 1; index >= 0; index--) {
        const coverage = new Uint16Array(remainingCoverage[index + 1]);
        const locallyCovered = new Uint8Array(truthKeys.length);
        for (const choice of nandChoices[index]) {
          for (const key of choiceInfo(choice).uniqueKeys) {
            const truthIndex = truthIndexByKey[key];
            if (truthIndex >= 0) locallyCovered[truthIndex] = 1;
          }
        }
        for (let truthIndex = 0; truthIndex < truthKeys.length; truthIndex++) {
          coverage[truthIndex] += locallyCovered[truthIndex];
        }
        remainingCoverage[index] = coverage;
      }

      const visitChoices = (index, links, usedLinkSignatures, chosenCovers) => {
        if (visitedCovers >= maxCovers) return;
        const remaining = remainingCoverage[index];
        for (let truthIndex = 0; truthIndex < truthKeys.length; truthIndex++) {
          const key = truthKeys[truthIndex];
          if (links[key] + remaining[truthIndex] < truths[key]) {
            return;
          }
        }
        if (index < nandChoices.length) {
          for (const choice of nandChoices[index]) {
            const { uniqueKeys, id } = choiceInfo(choice);
            if (usedLinkSignatures.has(id)) continue;
            usedLinkSignatures.add(id);
            for (const key of uniqueKeys) links[key]++;
            if (chosenCovers) chosenCovers.push(uniqueKeys);
            visitChoices(index + 1, links, usedLinkSignatures, chosenCovers);
            if (chosenCovers) chosenCovers.pop();
            for (const key of uniqueKeys) links[key]--;
            usedLinkSignatures.delete(id);
            if (visitedCovers >= maxCovers) break;
          }
          return;
        }

        visitedCovers++;
        validCoverCount++;
        for (const key of liveCandidateCodes) {
          if (links[key] <= truths[key]) continue;
          const id = candidateId(key);
          const digit = candidateDigit(key);
          if (actualCandidate(id, digit)) {
            const part = Math.floor(id / 27);
            removalMask[digit - 1][part] |= 1 << (id % 27);
            const textKey = captureProof ? candidateTextKey(key) : null;
            if (eliminationWitnesses && !eliminationWitnesses.has(textKey)) {
              eliminationWitnesses.set(
                textKey,
                chosenCovers.map((cover) => cover.map(candidateTextKey)),
              );
            }
          }
        }
      };
      visitChoices(
        0,
        new Uint16Array(729),
        new Set(),
        captureProof ? [] : null,
      );
      if (validCoverCount === 0) return null;

      if (burr.kind === "aals") {
        const onlyDigits = new Set(burr.digits);
        for (const digit of burr.allDigits) {
          if (onlyDigits.has(digit)) continue;
          for (const key of candidateKeysByUnit[digit - 1][burr.unit]) {
            const id = candidateId(key);
            const part = Math.floor(id / 27);
            removalMask[digit - 1][part] |= 1 << (id % 27);
          }
        }
      }

      if (captureProof) {
        removalMask.validationProof = {
          truthRegions,
          eliminationWitnesses: Object.fromEntries(eliminationWitnesses),
          validCoverCount,
        };
      }
      return removalMask;
    };

    const candidateSlots = new Int32Array(729).fill(-1);
    let assignedSlots = 0;
    for (const key of liveCandidateCodes) {
      candidateSlots[key] = assignedSlots++;
    }
    const MASK_WORDS = Math.max(1, Math.ceil(assignedSlots / 32));
    const MASK_FOLD = MASK_WORDS;
    const MASK_LENGTH = MASK_WORDS + 1;

    let maskArena = new Uint32Array(MASK_LENGTH * 4096);
    let maskArenaTop = 0;
    const maskAlloc = () => {
      const offset = maskArenaTop;
      maskArenaTop = offset + MASK_LENGTH;
      if (maskArenaTop > maskArena.length) {
        let capacity = maskArena.length * 2;
        while (capacity < maskArenaTop) capacity *= 2;
        const grown = new Uint32Array(capacity);
        grown.set(maskArena);
        maskArena = grown;
      }
      return offset;
    };
    const volatileNodeMasks = [];
    const releaseMasks = (mark) => {
      while (volatileNodeMasks.length > 0) {
        const node = volatileNodeMasks[volatileNodeMasks.length - 1];
        if (nodeMaskCache.get(node) < mark) break;
        nodeMaskCache.delete(node);
        volatileNodeMasks.pop();
      }
      maskArenaTop = mark;
    };
    const newMask = () => {
      const out = maskAlloc();
      maskArena.fill(0, out, out + MASK_LENGTH);
      return out;
    };
    const maskUnion = (left, right) => {
      const out = maskAlloc();
      const arena = maskArena;
      for (let i = 0; i < MASK_LENGTH; i++) {
        arena[out + i] = arena[left + i] | arena[right + i];
      }
      return out;
    };
    const maskWithout = (left, right) => {
      const out = maskAlloc();
      const arena = maskArena;
      let fold = 0;
      for (let i = 0; i < MASK_WORDS; i++) {
        const word = arena[left + i] & ~arena[right + i];
        arena[out + i] = word;
        fold |= word;
      }
      arena[out + MASK_FOLD] = fold;
      return out;
    };
    const maskIntersects = (left, right) => {
      const arena = maskArena;
      if ((arena[left + MASK_FOLD] & arena[right + MASK_FOLD]) === 0) {
        return false;
      }
      for (let i = 0; i < MASK_WORDS; i++) {
        if ((arena[left + i] & arena[right + i]) !== 0) return true;
      }
      return false;
    };
    const nodeMaskCache = new WeakMap();
    let maskArenaFloor = Infinity;
    const nodeMask = (node) => {
      const cached = nodeMaskCache.get(node);
      if (cached !== undefined) return cached;
      const mask = newMask();
      const arena = maskArena;
      for (const digit of node.digits) {
        for (const id of node.cells) {
          const slot = candidateSlots[(digit - 1) * 81 + id];
          if (slot < 0) continue;
          arena[mask + (slot >>> 5)] |= 1 << (slot & 31);
        }
      }
      let fold = 0;
      for (let i = 0; i < MASK_WORDS; i++) fold |= arena[mask + i];
      arena[mask + MASK_FOLD] = fold;
      nodeMaskCache.set(node, mask);
      if (mask >= maskArenaFloor) volatileNodeMasks.push(node);
      return mask;
    };
    for (const node of allNodes) nodeMask(node);
    maskArenaFloor = maskArenaTop;
    const nodeMaskAt = new Int32Array(nodeIndices.size);
    for (const [node, index] of nodeIndices) nodeMaskAt[index] = nodeMask(node);

    const pathsMask = (paths) => {
      const mask = newMask();
      for (const path of paths) {
        for (const node of path) {
          const nodeBits = nodeMask(node);
          const arena = maskArena;
          for (let i = 0; i < MASK_LENGTH; i++) {
            arena[mask + i] |= arena[nodeBits + i];
          }
        }
      }
      return mask;
    };

    const focusMaskWithout = (burrNodes, allowed) => {
      const mask = newMask();
      for (const node of burrNodes) {
        if (node === allowed) continue;
        const nodeBits = nodeMask(node);
        const arena = maskArena;
        for (let i = 0; i < MASK_LENGTH; i++) {
          arena[mask + i] |= arena[nodeBits + i];
        }
      }
      return mask;
    };

    const nodeSlot = (node) => {
      const index = nodeIndices.get(node);
      return index === undefined ? 0 : index + 1;
    };
    const stateId = (node, expectNand) =>
      nodeSlot(node) * 2 + (expectNand ? 1 : 0);
    const STATE_PREDECESSOR_BUCKETS = 8;
    const stateBucketKey = (state, predecessorIndex) =>
      state * STATE_PREDECESSOR_BUCKETS +
      (predecessorIndex & (STATE_PREDECESSOR_BUCKETS - 1));

    const reconstructWorkPath = (records, index) => {
      const path = [];
      while (index >= 0) {
        const record = records[index];
        path.push(record.node);
        index = record.parent;
      }
      path.reverse();
      return path;
    };

    const foldWithoutCore = (mask, core) => {
      const arena = maskArena;
      let fold = 0;
      for (let i = 0; i < MASK_WORDS; i++) {
        fold |= arena[mask + i] & ~arena[core + i];
      }
      return fold;
    };

    const retainUndominatedMask = (seen, key, usedMask, coreMask) => {
      const arena = maskArena;
      const usedFold = foldWithoutCore(usedMask, coreMask);
      const notUsedFold = ~usedFold;
      const store = seen.get(key);
      if (store === undefined) {
        const data = new Int32Array(16);
        data[0] = usedMask;
        data[1] = usedFold;
        seen.set(key, { data, count: 2 });
        return true;
      }

      const data = store.data;
      const count = store.count;
      for (let index = 0; index < count; index += 2) {
        if ((data[index + 1] & notUsedFold) !== 0) continue;
        const prior = data[index];
        let contained = true;
        for (let word = 0; word < MASK_WORDS; word++) {
          if ((arena[prior + word] & ~arena[usedMask + word]) !== 0) {
            contained = false;
            break;
          }
        }
        if (contained) return false;
      }
      if (count === data.length) {
        const grown = new Int32Array(count * 2);
        grown.set(data);
        grown[count] = usedMask;
        grown[count + 1] = usedFold;
        store.data = grown;
      } else {
        data[count] = usedMask;
        data[count + 1] = usedFold;
      }
      store.count = count + 2;
      return true;
    };
    function* iterateMainPaths(start, finish, burrNodes, maxStates = 30000) {
      const arenaMark = maskArenaTop;
      try {
        yield* iterateMainPathsFrom(start, finish, burrNodes, maxStates);
      } finally {
        releaseMasks(arenaMark);
      }
    }

    function* iterateMainPathsFrom(
      start,
      finish,
      burrNodes,
      maxStates = 30000,
    ) {
      const stateKey = stateId;
      let distance = reverseDistanceCache.get(finish);
      if (!distance) {
        distance = new Map();
        const reverseQueue = [{ node: finish, expectNand: false }];
        distance.set(stateKey(finish, false), 0);
        for (let head = 0; head < reverseQueue.length; head++) {
          const state = reverseQueue[head];
          const priorExpectNand = !state.expectNand;
          const predecessors = priorExpectNand
            ? nandNeighbors(state.node)
            : orMap.get(state.node) || new Set();
          for (const predecessor of predecessors) {
            const key = stateKey(predecessor, priorExpectNand);
            if (distance.has(key)) continue;
            distance.set(
              key,
              distance.get(stateKey(state.node, state.expectNand)) + 1,
            );
            reverseQueue.push({
              node: predecessor,
              expectNand: priorExpectNand,
            });
          }
        }
        reverseDistanceCache.set(finish, distance);
      }

      const orderedNeighbors = (node, expectNand) => {
        const orderKey = `${nodeIndices.get(finish)}:${nodeIndices.get(node)}:${
          expectNand ? 1 : 0
        }`;
        const cached = mainNeighborOrderCache.get(orderKey);
        if (cached) return cached;

        const neighbors = [
          ...(expectNand ? nandNeighbors(node) : orMap.get(node) || new Set()),
        ];
        if (
          expectNand &&
          !neighbors.includes(finish) &&
          techniques.isBitsetSubset(finish.NodeBitset, node.NandBitset)
        ) {
          neighbors.push(finish);
        }
        neighbors.sort((left, right) => {
          const leftAlsSize = expectNand
            ? minimumAlsEdgeSize(left)
            : alsEdgeSize(node, left);
          const rightAlsSize = expectNand
            ? minimumAlsEdgeSize(right)
            : alsEdgeSize(node, right);
          return (
            leftAlsSize - rightAlsSize ||
            orNodeOrder.get(left) - orNodeOrder.get(right)
          );
        });
        const indices = new Int32Array(neighbors.length);
        for (let i = 0; i < neighbors.length; i++) {
          indices[i] = nodeIndices.get(neighbors[i]);
        }
        const entry = { nodes: neighbors, indices };
        mainNeighborOrderCache.set(orderKey, entry);
        return entry;
      };

      const blockedFocusMask = maskWithout(
        focusMaskWithout(burrNodes, start),
        nodeMask(finish),
      );
      const records = [
        {
          node: start,
          nodeIndex: nodeIndices.get(start),
          expectNand: true,
          parent: -1,
          usedMask: nodeMask(start),
        },
      ];
      const seen = new Map();
      const seenCore = nodeMask(start);
      const startState = stateKey(start, true);
      retainUndominatedMask(
        seen,
        stateBucketKey(startState, nodeIndices.get(start)),
        seenCore,
        seenCore,
      );

      for (
        let head = 0;
        head < records.length && records.length < maxStates;
        head++
      ) {
        const current = records[head];
        const nextExpectNand = !current.expectNand;
        const nextStateBase = nextExpectNand ? 1 : 0;
        const neighbors = orderedNeighbors(current.node, current.expectNand);
        const neighborNodes = neighbors.nodes;
        const neighborIndices = neighbors.indices;
        for (let i = 0; i < neighborNodes.length; i++) {
          const next = neighborNodes[i];
          if (next === finish) {
            if (!current.expectNand) continue;
            let cursor = head;
            let alreadyUsedFinish = false;
            while (cursor >= 0) {
              if (records[cursor].node === finish) {
                alreadyUsedFinish = true;
                break;
              }
              cursor = records[cursor].parent;
            }
            if (alreadyUsedFinish) continue;
            const terminalIndex = records.length;
            records.push({
              node: finish,
              nodeIndex: neighborIndices[i],
              expectNand: false,
              parent: head,
              usedMask: maskUnion(current.usedMask, nodeMask(finish)),
            });
            yield reconstructWorkPath(records, terminalIndex);
            if (records.length >= maxStates) return;
            continue;
          }

          const nextIndex = neighborIndices[i];
          const nextMask = nodeMaskAt[nextIndex];
          if (
            maskIntersects(nextMask, current.usedMask) ||
            maskIntersects(nextMask, blockedFocusMask)
          ) {
            continue;
          }
          const nextState = (nextIndex + 1) * 2 + nextStateBase;
          if (!distance.has(nextState)) continue;

          const usedMask = maskUnion(current.usedMask, nextMask);
          if (
            !retainUndominatedMask(
              seen,
              stateBucketKey(nextState, current.nodeIndex),
              usedMask,
              seenCore,
            )
          ) {
            continue;
          }
          records.push({
            node: next,
            nodeIndex: nextIndex,
            expectNand: nextExpectNand,
            parent: head,
            usedMask,
          });
          if (records.length >= maxStates) return;
        }
      }
    }

    const alsInteriorCache = new Map();
    const alsInteriorNodes = (left, right, als) => {
      const cacheKey = nodePairKey(left, right);
      let nodes = alsInteriorCache.get(cacheKey);
      if (nodes !== undefined) return nodes;
      nodes = [];
      const endDigits = new Set([left.digits[0], right.digits[0]]);
      for (const textDigit of Object.keys(als.candMap)) {
        const digit = Number(textDigit);
        if (endDigits.has(digit)) continue;
        nodes.push(
          getNode(
            als.candMap[digit].map(([r, c]) => r * 9 + c),
            digit,
          ),
        );
      }
      alsInteriorCache.set(cacheKey, nodes);
      return nodes;
    };

    const getMainPotentialMask = (mainPath) => {
      const potentialMask = emptyMask();
      for (let i = 0; i + 1 < mainPath.length; i += 2) {
        const left = mainPath[i];
        const right = mainPath[i + 1];
        for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
          for (let part = 0; part < 3; part++) {
            potentialMask[digitIndex][part] |=
              left.NandBitset[digitIndex][part] &
              right.NandBitset[digitIndex][part];
          }
        }
      }

      for (let i = 1; i + 1 < mainPath.length; i += 2) {
        const left = mainPath[i];
        const right = mainPath[i + 1];
        const als = blossomAlsLinkRegistry.get(left)?.get(right);
        if (!als) continue;

        for (const internalNode of alsInteriorNodes(left, right, als)) {
          const digit = internalNode.digits[0];
          for (let part = 0; part < 3; part++) {
            potentialMask[digit - 1][part] |=
              internalNode.NandBitset[digit - 1][part];
          }
        }
      }
      return potentialMask;
    };

    const isBurrEndInMainPotential = (branch, mainPotentialMask) => {
      if (branch.length < 2) return true;
      const end = branch[branch.length - 1];
      const digit = end.digits[0];
      return end.cells.every((id) => {
        const part = Math.floor(id / 27);
        const bit = id % 27;
        return (mainPotentialMask[digit - 1][part] & (1 << bit)) !== 0;
      });
    };

    const orderedBurrNeighbors = (node, expectNand) => {
      const orderCache = expectNand ? burrNandOrderCache : burrOrOrderCache;
      const cached = orderCache.get(node);
      if (cached) return cached;

      const neighbors = [
        ...(expectNand ? nandNeighbors(node) : orMap.get(node) || new Set()),
      ];
      neighbors.sort((left, right) => {
        const leftAlsSize = expectNand
          ? minimumAlsEdgeSize(left)
          : alsEdgeSize(node, left);
        const rightAlsSize = expectNand
          ? minimumAlsEdgeSize(right)
          : alsEdgeSize(node, right);
        return (
          leftAlsSize - rightAlsSize ||
          orNodeOrder.get(left) - orNodeOrder.get(right)
        );
      });
      const indices = new Int32Array(neighbors.length);
      for (let i = 0; i < neighbors.length; i++) {
        indices[i] = nodeIndices.get(neighbors[i]);
      }
      const entry = { nodes: neighbors, indices };
      orderCache.set(node, entry);
      return entry;
    };

    const potentialMaskKey = (potentialMask) => {
      let key = "";
      for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
        const parts = potentialMask[digitIndex];
        key += parts[0] + "," + parts[1] + "," + parts[2] + ";";
      }
      return key;
    };

    const getBranchReachability = (potentialMask) => {
      const potentialKey = potentialMaskKey(potentialMask);
      const cached = branchPotentialCache.get(potentialKey);
      if (cached) return cached;

      const nodeCount = nodeIndices.size;
      const stateCount = nodeCount * 2;

      if (!blossomSearchCache.branchReverseStateEdges) {
        const reverseStateEdges = Array.from({ length: stateCount }, () => []);
        for (const source of orNodes) {
          const sourceIndex = nodeIndices.get(source);
          if (sourceIndex === undefined) continue;
          for (const target of nandNeighbors(source)) {
            const targetIndex = nodeIndices.get(target);
            if (targetIndex !== undefined) {
              reverseStateEdges[targetIndex * 2].push(sourceIndex * 2 + 1);
            }
          }
          for (const target of orMap.get(source) || []) {
            const targetIndex = nodeIndices.get(target);
            if (targetIndex !== undefined) {
              reverseStateEdges[targetIndex * 2 + 1].push(sourceIndex * 2);
            }
          }
        }
        blossomSearchCache.branchReverseStateEdges = reverseStateEdges;
      }

      const within = new Uint8Array(nodeCount);
      for (const [node, index] of nodeIndices) {
        if (isNodeWithinMask(node, potentialMask)) {
          within[index] = 1;
        }
      }

      let eligibleTerminalBits = 0n;
      const terminalStates = [];
      for (const terminal of orNodes) {
        const terminalIndex = nodeIndices.get(terminal);
        if (terminalIndex === undefined || within[terminalIndex] === 0) {
          continue;
        }
        eligibleTerminalBits |= 1n << BigInt(terminalIndex);
        terminalStates.push(terminalIndex * 2 + 1);
      }

      let reachable = branchReachabilityCache.get(eligibleTerminalBits);
      if (!reachable) {
        reachable = new Uint8Array(stateCount);
        const queue = new Int32Array(stateCount);
        let queueHead = 0;
        let queueTail = 0;
        for (const state of terminalStates) {
          if (reachable[state] !== 0) continue;
          reachable[state] = 1;
          queue[queueTail++] = state;
        }
        const reverseStateEdges = blossomSearchCache.branchReverseStateEdges;
        while (queueHead < queueTail) {
          const state = queue[queueHead++];
          for (const predecessor of reverseStateEdges[state]) {
            if (reachable[predecessor] !== 0) continue;
            reachable[predecessor] = 1;
            queue[queueTail++] = predecessor;
          }
        }
        branchReachabilityCache.set(eligibleTerminalBits, reachable);
        if (branchReachabilityCache.size > 4096) {
          branchReachabilityCache.delete(
            branchReachabilityCache.keys().next().value,
          );
        }
      }

      const entry = { reachable, within };
      branchPotentialCache.set(potentialKey, entry);
      return entry;
    };

    // Branch chains outlive the per-main-path arena marks, so they keep their
    // candidate masks in a store of their own rather than in the mask arena.
    // Layout matches the arena: MASK_WORDS words plus the fold word that
    // maskIntersects uses as a quick reject.
    let chainStore = new Uint32Array(MASK_LENGTH * 8192);
    let chainStoreTop = 0;
    const chainStoreReset = () => {
      chainStoreTop = 0;
    };
    const chainAlloc = () => {
      const offset = chainStoreTop;
      chainStoreTop = offset + MASK_LENGTH;
      if (chainStoreTop > chainStore.length) {
        let capacity = chainStore.length * 2;
        while (capacity < chainStoreTop) capacity *= 2;
        const grown = new Uint32Array(capacity);
        grown.set(chainStore);
        chainStore = grown;
      }
      return offset;
    };

    const chainTableCache = new Map();
    const chainTableKey = (burr, remaining) => {
      let key = burr.kind + (burr.unit === undefined ? "" : burr.unit);
      for (const node of burr.nodes) key += "," + nodeIndices.get(node);
      key += "|";
      for (const node of remaining) key += "," + nodeIndices.get(node);
      return key;
    };

    const buildChainsForRoot = (
      burr,
      remaining,
      rootIndex,
      unionReach,
      maxStates,
    ) => {
      const root = remaining[rootIndex];
      const unionWithin = unionReach.within;
      const unionReachable = unionReach.reachable;
      const overrides = new Uint8Array(nodeIndices.size * 2);
      const canReachTerminalAt = (nodeIndex, node, expectNand) => {
        const stateIndex = nodeIndex * 2 + (expectNand ? 1 : 0);
        if (unionReachable[stateIndex] === 1) return true;
        const known = overrides[stateIndex];
        if (known !== 0) return known === 3;
        const neighbors = expectNand
          ? nandNeighbors(node)
          : orMap.get(node) || [];
        const nextExpectNand = !expectNand;
        let reaches = false;
        for (const next of neighbors) {
          const nextIndex = nodeIndices.get(next);
          if (
            nextIndex !== undefined &&
            unionReachable[nextIndex * 2 + (nextExpectNand ? 1 : 0)] === 1
          ) {
            reaches = true;
            break;
          }
        }
        overrides[stateIndex] = reaches ? 3 : 2;
        return reaches;
      };

      const arenaMark = maskArenaTop;
      const chains = [];
      const rootMaskOffset = nodeMask(root);
      const blockedFocusMask = focusMaskWithout(burr.nodes, root);
      const records = [
        {
          node: root,
          nodeIndex: nodeIndices.get(root),
          expectNand: true,
          parent: -1,
          usedMask: rootMaskOffset,
        },
      ];
      const seen = new Map();
      retainUndominatedMask(
        seen,
        stateBucketKey(stateId(root, true), nodeIndices.get(root)),
        rootMaskOffset,
        rootMaskOffset,
      );

      const materialise = (head) => {
        const nodes = [];
        let cursor = head;
        while (cursor >= 0) {
          nodes.push(records[cursor].node);
          cursor = records[cursor].parent;
        }
        nodes.reverse();
        const offset = chainAlloc();
        const source = records[head].usedMask;
        for (let i = 0; i < MASK_LENGTH; i++) {
          chainStore[offset + i] = maskArena[source + i];
        }
        let gateCoverMask = 0;
        if (burr.kind === "region" && nodes.length > 1) {
          const gateOptions = nandLinkOptions(nodes[0], nodes[1]);
          for (let index = 0; index < remaining.length; index++) {
            if (index === rootIndex) continue;
            const focusKeys = nodeCandidateKeys(remaining[index]);
            if (
              gateOptions.some((option) =>
                focusKeys.every((key) => option.includes(key)),
              )
            ) {
              gateCoverMask |= 1 << index;
            }
          }
        }
        chains.push({
          nodes,
          endIndex: records[head].nodeIndex,
          maskOffset: offset,
          gateCoverMask,
        });
      };

      for (
        let head = 0;
        head < records.length && records.length < maxStates;
        head++
      ) {
        const current = records[head];
        if (current.expectNand && unionWithin[current.nodeIndex] === 1) {
          materialise(head);
        }
        const expectNand = !current.expectNand;
        const stateBase = expectNand ? 1 : 0;
        const neighbors = orderedBurrNeighbors(
          current.node,
          current.expectNand,
        );
        const neighborNodes = neighbors.nodes;
        const neighborIndices = neighbors.indices;
        for (let i = 0; i < neighborNodes.length; i++) {
          const nextIndex = neighborIndices[i];
          const nextMask = nodeMaskAt[nextIndex];
          if (
            maskIntersects(nextMask, current.usedMask) ||
            maskIntersects(nextMask, blockedFocusMask)
          ) {
            continue;
          }
          const next = neighborNodes[i];
          if (!canReachTerminalAt(nextIndex, next, expectNand)) continue;
          const usedMask = maskUnion(current.usedMask, nextMask);
          const key = stateBucketKey(
            (nextIndex + 1) * 2 + stateBase,
            current.nodeIndex,
          );
          if (!retainUndominatedMask(seen, key, usedMask, rootMaskOffset)) {
            continue;
          }
          records.push({
            node: next,
            nodeIndex: nextIndex,
            expectNand,
            parent: head,
            usedMask,
          });
          if (records.length >= maxStates) break;
        }
      }
      releaseMasks(arenaMark);
      // Grouped by end node: a main path admits or rejects a whole group with
      // one lookup. Chain by chain, that test was 79% of the join's work.
      const byEnd = new Map();
      for (const chain of chains) {
        let group = byEnd.get(chain.endIndex);
        if (group === undefined) {
          group = [];
          byEnd.set(chain.endIndex, group);
        }
        group.push(chain);
      }
      return {
        ends: Int32Array.from(byEnd.keys()),
        groups: [...byEnd.values()],
      };
    };

    const chainTableRebuilds = (burr, remaining) => {
      const table = chainTableCache.get(chainTableKey(burr, remaining));
      return table === undefined ? 0 : table.rebuilds || 0;
    };

    const primeChainTable = (burr, remaining, seedMask) => {
      const key = chainTableKey(burr, remaining);
      let table = chainTableCache.get(key);
      if (!table) {
        table = { unionMask: emptyMask(), byRoot: null, rebuilds: 0 };
        chainTableCache.set(key, table);
      }
      const unionMask = table.unionMask;
      for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
        for (let part = 0; part < 3; part++) {
          unionMask[digitIndex][part] |= seedMask[digitIndex][part];
        }
      }
      table.byRoot = null;
    };

    const getChainTable = (burr, remaining, mainPotentialMask, maxStates) => {
      const key = chainTableKey(burr, remaining);
      let table = chainTableCache.get(key);
      let grew = false;
      if (!table) {
        table = { unionMask: emptyMask(), byRoot: null, rebuilds: 0 };
        chainTableCache.set(key, table);
      }
      const unionMask = table.unionMask;
      for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
        const into = unionMask[digitIndex];
        const from = mainPotentialMask[digitIndex];
        for (let part = 0; part < 3; part++) {
          const bits = from[part];
          if ((into[part] & bits) !== bits) {
            into[part] |= bits;
            grew = true;
          }
        }
      }
      if (grew || table.byRoot === null) {
        table.rebuilds = (table.rebuilds || 0) + 1;
        // A widened union invalidates every chain mask, so the store is rebuilt
        // from scratch and the other tables are marked stale.
        chainStoreReset();
        for (const entry of chainTableCache.values()) {
          if (entry !== table) entry.byRoot = null;
        }
        const unionReach = getBranchReachability(unionMask);
        const byRoot = [];
        for (let index = 0; index < remaining.length; index++) {
          byRoot.push(
            buildChainsForRoot(burr, remaining, index, unionReach, maxStates),
          );
        }
        table.byRoot = byRoot;
      }
      return table;
    };

    // Scratch used-candidate masks for the join, one level per remaining root.
    let joinScratch = new Uint32Array(MASK_LENGTH * 8);
    const joinScratchGrow = (levels) => {
      const need = MASK_LENGTH * (levels + 2);
      if (need > joinScratch.length) {
        const grown = new Uint32Array(need * 2);
        grown.set(joinScratch);
        joinScratch = grown;
      }
    };
    const chainHitsScratch = (chainOffset, scratchOffset) => {
      if (
        (chainStore[chainOffset + MASK_FOLD] &
          joinScratch[scratchOffset + MASK_FOLD]) ===
        0
      ) {
        return false;
      }
      for (let i = 0; i < MASK_WORDS; i++) {
        if (
          (chainStore[chainOffset + i] & joinScratch[scratchOffset + i]) !==
          0
        ) {
          return true;
        }
      }
      return false;
    };

    function* iterateIntegratedBranches(
      burr,
      mainPath,
      remaining,
      mainPotentialMask,
      maxStates = 30000,
    ) {
      if (remaining.length === 0) {
        yield [];
        return;
      }
      const arenaMark = maskArenaTop;
      try {
        const table = getChainTable(
          burr,
          remaining,
          mainPotentialMask,
          maxStates,
        );
        const within = getBranchReachability(mainPotentialMask).within;
        joinScratchGrow(remaining.length + 1);
        const mainUsedMask = pathsMask([mainPath]);
        for (let i = 0; i < MASK_LENGTH; i++) {
          joinScratch[i] = maskArena[mainUsedMask + i];
        }
        yield* joinChains(burr, remaining, table.byRoot, within, 0, 0, [], {
          budget: maxStates,
        });
      } finally {
        releaseMasks(arenaMark);
      }
    }

    function* joinChains(
      burr,
      remaining,
      byRoot,
      within,
      depth,
      coveredMask,
      completed,
      counter,
    ) {
      let rootIndex = -1;
      for (let index = 0; index < remaining.length; index++) {
        if ((coveredMask & (1 << index)) === 0) {
          rootIndex = index;
          break;
        }
      }
      if (rootIndex < 0) {
        yield completed;
        return;
      }
      const usedOffset = depth * MASK_LENGTH;
      const nextOffset = usedOffset + MASK_LENGTH;
      const entry = byRoot[rootIndex];
      const ends = entry.ends;
      const groups = entry.groups;
      const isRegion = burr.kind === "region";
      for (let e = 0; e < ends.length; e++) {
        if (within[ends[e]] !== 1) continue;
        const chains = groups[e];
        for (let index = 0; index < chains.length; index++) {
          if (counter.budget <= 0) return;
          counter.budget--;
          const chain = chains[index];
          const offset = chain.maskOffset;
          if (chainHitsScratch(offset, usedOffset)) continue;
          for (let i = 0; i < MASK_LENGTH; i++) {
            joinScratch[nextOffset + i] =
              joinScratch[usedOffset + i] | chainStore[offset + i];
          }
          completed.push(chain.nodes);
          yield* joinChains(
            burr,
            remaining,
            byRoot,
            within,
            depth + 1,
            isRegion
              ? coveredMask | (1 << rootIndex) | chain.gateCoverMask
              : coveredMask | (1 << rootIndex),
            completed,
            counter,
          );
          completed.pop();
        }
      }
    }

    const getLoc = (cells, preferBox = false) => {
      const ids = [...new Set(cells)].sort((a, b) => a - b);
      if (ids.length === 0) return "";

      if (ids.length === 1) {
        const r = Math.floor(ids[0] / 9);
        const c = ids[0] % 9;
        if (preferBox) {
          const box = Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1;
          const position = (r % 3) * 3 + (c % 3) + 1;
          return `b${box}p${position}`;
        }
        return `r${r + 1}c${c + 1}`;
      }

      const rows = [...new Set(ids.map((id) => Math.floor(id / 9) + 1))];
      const cols = [...new Set(ids.map((id) => (id % 9) + 1))];
      const boxes = [
        ...new Set(
          ids.map(
            (id) =>
              Math.floor(Math.floor(id / 9) / 3) * 3 +
              Math.floor((id % 9) / 3) +
              1,
          ),
        ),
      ];
      if (preferBox && boxes.length === 1) {
        const positions = ids.map((id) => {
          const r = Math.floor(id / 9) % 3;
          const c = (id % 9) % 3;
          return r * 3 + c + 1;
        });
        return `b${boxes[0]}p${positions.join("")}`;
      }
      if (rows.length === 1) return `r${rows[0]}c${cols.join("")}`;
      if (cols.length === 1) return `r${rows.join("")}c${cols[0]}`;
      return ids
        .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
        .join("");
    };

    const getAlsForLink = (left, right) =>
      blossomAlsLinkRegistry.get(left)?.get(right) || null;

    const getAlsText = (left, right, als) => {
      const ids = als.cells.map(([r, c]) => r * 9 + c);
      const preferBox = als.unitName && als.unitName.includes(t("teks_msg_7"));
      return `(${left.digits[0]}=${right.digits[0]})${getLoc(ids, preferBox)}`;
    };

    const getPlainNodeText = (node, previousDigit = null) => {
      const digit = node.digits[0];
      return `${previousDigit === digit ? "" : `(${digit})`}${getLoc(node.cells)}`;
    };

    const buildBlossomEureka = (
      path,
      initialText = null,
      initialDigit = null,
    ) => {
      if (path.length === 0) return "";
      let text = initialText || getPlainNodeText(path[0]);
      let lastDigit = initialDigit ?? path[0].digits[0];
      for (let i = 0; i + 1 < path.length; i += 2) {
        const nandEnd = path[i + 1];
        const orEnd = path[i + 2];
        text += "-";

        if (!orEnd) {
          text += getPlainNodeText(nandEnd, lastDigit);
          break;
        }

        const als = getAlsForLink(nandEnd, orEnd);
        const isBivalueCell =
          !als &&
          nandEnd.digits[0] !== orEnd.digits[0] &&
          nandEnd.cells.length === 1 &&
          orEnd.cells.length === 1 &&
          nandEnd.cells[0] === orEnd.cells[0];

        if (als) {
          text += getAlsText(nandEnd, orEnd, als);
        } else if (isBivalueCell) {
          text += `(${nandEnd.digits[0]}=${orEnd.digits[0]})${getLoc(nandEnd.cells)}`;
        } else {
          text += `${getPlainNodeText(nandEnd, lastDigit)}=${getPlainNodeText(
            orEnd,
            nandEnd.digits[0],
          )}`;
        }
        lastDigit = orEnd.digits[0];
      }
      return `${text}-`;
    };

    const buildBurrBranchEureka = (burr, path, peerRoots = null) => {
      const root = path[0];
      const rootDigit = root.digits[0];
      const peers = peerRoots || burr.nodes.filter((node) => node !== root);
      if (burr.kind === "cell" || burr.kind === "aals") {
        const otherDigits = peers
          .map((node) => node.digits[0])
          .sort((a, b) => a - b)
          .join("");
        const gate = `(${otherDigits}=${rootDigit})${getLoc(
          burr.cells,
          burr.kind === "aals" && burr.unit >= 18,
        )}`;
        return buildBlossomEureka(path, gate, rootDigit);
      }
      const otherCells = peers.flatMap((node) => node.cells);
      const gate = `(${rootDigit})${getLoc(otherCells)}=${getLoc(root.cells)}`;
      return buildBlossomEureka(path, gate, rootDigit);
    };

    const buildMultiBurrGate = (burr, mainPath, branches) => {
      const mainRoots = [mainPath[0], mainPath[mainPath.length - 1]];
      const branchRoots = branches.map((path) => path[0]);
      if (burr.kind === "cell" || burr.kind === "aals") {
        const mainDigits = mainRoots
          .map((node) => node.digits[0])
          .sort((a, b) => a - b)
          .join("");
        const branchDigits = branchRoots
          .map((node) => node.digits[0])
          .sort((a, b) => a - b)
          .join("");
        return `(${mainDigits}=${branchDigits})${getLoc(
          burr.cells,
          burr.kind === "aals" && burr.unit >= 18,
        )}`;
      }

      const digit = mainRoots[0].digits[0];
      return `(${digit})${getLoc(mainRoots.flatMap((node) => node.cells))}=${getLoc(
        branchRoots.flatMap((node) => node.cells),
      )}`;
    };

    const getUsedAlses = (paths) => {
      const used = [];
      const seen = new Set();
      for (const path of paths) {
        for (let i = 1; i + 1 < path.length; i += 2) {
          const als = getAlsForLink(path[i], path[i + 1]);
          if (!als) continue;
          const key = als.cells
            .map(([r, c]) => r * 9 + c)
            .sort((a, b) => a - b)
            .join(",");
          if (!seen.has(key)) {
            seen.add(key);
            used.push(als);
          }
        }
      }
      return used;
    };

    const formatRemovals = (removals) => {
      const byCell = new Map();
      for (const { r, c, num } of removals) {
        const key = r * 9 + c;
        if (!byCell.has(key)) byCell.set(key, []);
        byCell.get(key).push(num);
      }
      return [...byCell.entries()]
        .sort(([left], [right]) => left - right)
        .map(([id, digits]) => {
          digits.sort((a, b) => a - b);
          return `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}<>${digits.join(",")}`;
        })
        .join(", ");
    };

    const results = [];
    const resultKeys = new Set();
    chainTableCache.clear();
    chainStoreReset();

    for (const burr of burrSets) {
      const burrNodeSet = new Set(burr.nodes);
      const burrKeys = new Set();
      for (const node of burr.nodes) {
        for (const id of node.cells) {
          burrKeys.add(candidateCode(id, node.digits[0]));
        }
      }
      if (burr.kind === "aals") {
        for (const id of burr.cells) {
          const r = Math.floor(id / 9);
          const c = id % 9;
          for (const digit of pencils[r][c]) {
            burrKeys.add(candidateCode(id, digit));
          }
        }
      }

      for (let a = 0; a < burr.nodes.length - 1; a++) {
        for (let b = a + 1; b < burr.nodes.length; b++) {
          if (solvedBoard && burr.kind !== "aals") {
            let trueNode = null;
            if (burr.kind === "cell") {
              const id = burr.cells[0];
              const solvedDigit = solvedBoard[Math.floor(id / 9)][id % 9];
              trueNode = burr.nodes.find(
                (node) => node.digits[0] === solvedDigit,
              );
            } else {
              const trueCell = burr.cells.find(
                (id) =>
                  solvedBoard[Math.floor(id / 9)][id % 9] === burr.digits[0],
              );
              trueNode = burr.nodes.find((node) => node.cells[0] === trueCell);
            }
            if (
              trueNode &&
              burr.nodes[a] !== trueNode &&
              burr.nodes[b] !== trueNode
            ) {
              continue;
            }
          }
          const remaining = burr.nodes.filter(
            (_, index) => index !== a && index !== b,
          );
          let primed = false;
          const primeAfter = globalThis.__PRIME_AFTER ?? 1;
          let selected = null;

          for (const candidateMain of iterateMainPaths(
            burr.nodes[a],
            burr.nodes[b],
            burr.nodes,
          )) {
            if (candidateMain.length < 4) continue;
            if (
              candidateMain.length === 4 &&
              !blossomAlsLinkRegistry
                .get(candidateMain[1])
                ?.has(candidateMain[2]) &&
              candidateMain[1].cells.length === 1 &&
              candidateMain[2].cells.length === 1
            ) {
              continue;
            }
            if (!primed && chainTableRebuilds(burr, remaining) >= primeAfter) {
              const seedMask = emptyMask();
              for (const seedMain of iterateMainPaths(
                burr.nodes[a],
                burr.nodes[b],
                burr.nodes,
              )) {
                if (seedMain.length < 4) continue;
                const learned = getMainPotentialMask(seedMain);
                for (let d = 0; d < 9; d++) {
                  for (let p = 0; p < 3; p++) seedMask[d][p] |= learned[d][p];
                }
              }
              primeChainTable(burr, remaining, seedMask);
              primed = true;
            }
            const mainPotentialMask = getMainPotentialMask(candidateMain);
            for (let branches of iterateIntegratedBranches(
              burr,
              candidateMain,
              remaining,
              mainPotentialMask,
            )) {
              if (!branches.some((path) => path.length > 1)) continue;
              branches = branches.slice();
              const paths = [candidateMain, ...branches];
              const mask = evaluateStrictRankZero(burr, paths);
              if (!mask) continue;

              const trialStructureKeys = new Set(burrKeys);
              for (const path of paths) {
                for (const node of path) {
                  for (const id of node.cells) {
                    trialStructureKeys.add(candidateCode(id, node.digits[0]));
                  }
                }
              }
              if (maskToRemovals(mask, trialStructureKeys).length === 0) {
                continue;
              }
              selected = {
                mainPath: candidateMain,
                branches,
                removalMask: mask,
              };
              break;
            }
            if (selected) break;
          }
          if (!selected) continue;

          const { mainPath, branches, removalMask } = selected;
          const structureKeys = new Set(burrKeys);
          for (const path of [mainPath, ...branches]) {
            for (const node of path) {
              for (const id of node.cells) {
                structureKeys.add(candidateCode(id, node.digits[0]));
              }
            }
          }
          const removals = maskToRemovals(removalMask, structureKeys);
          if (removals.length === 0) continue;

          const removalKey = removals
            .map((el) => `${el.r}:${el.c}:${el.num}`)
            .join("|");
          if (resultKeys.has(removalKey)) continue;
          resultKeys.add(removalKey);

          const burrText =
            burr.kind === "cell"
              ? `(${burr.digits.join("")})${getLoc(burr.cells)}`
              : burr.kind === "region"
                ? `(${burr.digits[0]})${getLoc(burr.cells)}`
                : `AALS(${burr.allDigits.join("")})${getLoc(
                    burr.cells,
                    burr.unit >= 18,
                  )}`;
          const visibleBranches = branches.filter((path) => path.length > 1);
          const allPaths = [mainPath, ...visibleBranches];
          const usedAlses = getUsedAlses(allPaths);
          if (burr.kind === "aals") usedAlses.unshift(burr.als);
          const eurekaParts = [`[${buildBlossomEureka(mainPath)}]`];
          if (visibleBranches.length > 1) {
            eurekaParts.push(
              buildMultiBurrGate(burr, mainPath, visibleBranches),
            );
            for (const path of visibleBranches) {
              const peers = visibleBranches
                .map((branch) => branch[0])
                .filter((root) => root !== path[0]);
              eurekaParts.push(`[${buildBurrBranchEureka(burr, path, peers)}]`);
            }
          } else {
            eurekaParts.push(
              ...visibleBranches.map((path) =>
                buildBurrBranchEureka(burr, path),
              ),
            );
          }
          const eurekaText = `${eurekaParts.join(" + ")}`;

          const result = {
            change: true,
            type: "remove",
            cells: removals,
            hint: {
              name:
                burr.kind === "cell"
                  ? t("teks_msg_193")
                  : burr.kind === "region"
                    ? t("teks_msg_194")
                    : t("teks_msg_196"),
              mainInfo: t("teks_msg_195", burrText),
              detail: eurekaText,
            },
            blossom: {
              kind: burr.kind,
              burrText,
              burr: burr.nodes,
              mainPath,
              branches: visibleBranches,
              alses: usedAlses,
              rank: 0,
              validationProof: removalMask.validationProof,
              validationBranches: globalThis.__BLOSSOM_CAPTURE_PROOFS__
                ? branches
                : undefined,
              validationMainPotential: globalThis.__BLOSSOM_CAPTURE_PROOFS__
                ? getMainPotentialMask(mainPath)
                : undefined,
            },
            applyVisuals: () =>
              techniques._applyBlossomVisuals(result.blossom, removals),
          };

          if (!findAll) return result;
          results.push(result);
        }
      }
    }

    return findAll ? results : { change: false };
  },

  blossomLoop: (board, pencils, findAll = false) => {
    if (findAll) {
      return [
        ...techniques.cellBlossomLoop(board, pencils, true),
        ...techniques.regionBlossomLoop(board, pencils, true),
        ...techniques.aalsBlossomLoop(board, pencils, true),
      ];
    }
    const cell = techniques.cellBlossomLoop(board, pencils, false);
    if (cell.change) return cell;
    const region = techniques.regionBlossomLoop(board, pencils, false);
    if (region.change) return region;
    return techniques.aalsBlossomLoop(board, pencils, false);
  },

  cellBlossomLoop: (board, pencils, findAll = false) => {
    return techniques._blossomLoopCore(board, pencils, false, findAll);
  },

  regionBlossomLoop: (board, pencils, findAll = false) => {
    return techniques._blossomLoopCore(board, pencils, true, findAll);
  },

  aalsBlossomLoop: (board, pencils, findAll = false) => {
    return techniques._blossomLoopCore(board, pencils, false, findAll, "aals");
  },
};
