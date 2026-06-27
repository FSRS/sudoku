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
          name: "Eliminate Candidates",
          mainInfo: `at r${newpr + 1}c${newpc + 1}`,
          detail: `Concrete number (${newd})r${newr}c${newc}`,
        },
        applyVisuals: () => {
          highlightedDigit = null;
          highlightState = 0;

          boardState[newr][newc].cellColor = cellColorPalette[7]; // Color 8
          uniqueRemovals.forEach((el) =>
            boardState[el.r][el.c].pencilColors.set(
              el.num,
              candidateColorPalette[0],
            ),
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
          `Row ${r + 1}`,
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
          `Col ${c + 1}`,
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
          `Box ${b + 1}`,
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
    const isBox = unitName.includes("Box");
    const position = isBox
      ? `b${techniques._getBoxIndex(r, c) + 1}p${techniques._getPointIndex(r, c) + 1}`
      : `r${r + 1}c${c + 1}`;
    const detail = `Last digit (${missingNum}) in ${unitName} at ${position}`;

    return {
      change: true,
      type: "place",
      r,
      c,
      num: missingNum,
      hint: {
        name: "Full House",
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
              name: "Naked Single",
              mainInfo: `at r${r + 1}c${c + 1}`,
              detail: `Only digit (${num}) remains at r${r + 1}c${c + 1}`,
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
      { name: "box", label: "Box" },
      { name: "row", label: "Row" },
      { name: "col", label: "Col" },
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
            const isBox = label === "Box";
            const position = isBox
              ? `b${techniques._getBoxIndex(r, c) + 1}p${techniques._getPointIndex(r, c) + 1}`
              : `r${r + 1}c${c + 1}`;
            const unitLabel = `${label} ${i + 1}`;
            const detail = `Only cell ${position} with digit (${num}) in ${unitLabel}`;

            const res = {
              change: true,
              type: "place",
              r,
              c,
              num,
              hint: {
                name: "Hidden Single",
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
    // It's a combination of "Pointing" (eliminating from the line outside the box)
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

              // A) Eliminate from other cells in the LINE (outside this box). This is a "Pointing" move.
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

                const lineType = isRow ? "Row" : "Col";

                const res = {
                  change: true,
                  type: "remove",
                  cells: removals,
                  hint: {
                    name: size === 2 ? "Locked Pair" : "Locked Triple",
                    mainInfo: `Intersection of ${lineType} ${line_idx + 1} and Box ${b + 1}`,
                    detail: `${cellStr} together have digits (${[...union].join("")}) on intersection of ${lineType} ${line_idx + 1} and Box ${b + 1}`,
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
                      boardState[el.r][el.c].pencilColors.set(
                        el.num,
                        candidateColorPalette[0],
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
            const lineName = isRow ? "Row" : "Col";

            const hintName = is_pointing ? "Pointing" : "Claiming";
            const mainInfo = is_pointing
              ? `Intersection of Box ${primaryIdx + 1} and ${lineName} ${secondaryIdx + 1}`
              : `Intersection of ${lineName} ${primaryIdx + 1} and Box ${secondaryIdx + 1}`;

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
              ? `All cells with digit (${num}) in Box ${primaryIdx + 1} ${cellStr} are also in ${lineName} ${secondaryIdx + 1}`
              : `All cells with digit (${num}) in ${lineName} ${primaryIdx + 1} ${cellStr} are also in Box ${secondaryIdx + 1}`;

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
                  boardState[el.r][el.c].pencilColors.set(
                    el.num,
                    candidateColorPalette[0],
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
      { name: "box", label: "Box" },
      { name: "row", label: "Row" },
      { name: "col", label: "Col" },
    ];

    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        const unit = techniques._getUnitCells(name, i);
        const unitName = `${label} ${i + 1}`; // Now we have the proper name

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
                  name: `Naked ${
                    size === 2 ? "Pair" : size === 3 ? "Triple" : "Quad"
                  }`,
                  mainInfo: `${unitName}`,
                  detail: `${cellStr} together have digits (${[...union].sort().join("")}) in ${unitName}`,
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
                    boardState[el.r][el.c].pencilColors.set(
                      el.num,
                      candidateColorPalette[0],
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
      { name: "box", label: "Box" },
      { name: "row", label: "Row" },
      { name: "col", label: "Col" },
    ];
    const results = [];

    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        const unit = techniques._getUnitCells(name, i);
        const unitName = `${label} ${i + 1}`; // Now we have the proper name

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
                  name: `Hidden ${
                    size === 2 ? "Pair" : size === 3 ? "Triple" : "Quad"
                  }`,
                  mainInfo: `${unitName}`,
                  detail: `All cells with digits (${digitsStr}) in ${unitName} are ${cellStr}`,
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
                    boardState[el.r][el.c].pencilColors.set(
                      el.num,
                      candidateColorPalette[0],
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
                      ? "X-Wing"
                      : size === 3
                        ? "Swordfish"
                        : "Jellyfish",
                  mainInfo: `Digit (${num})`,
                  detail: `Digit (${num}), Base ${baseStr}, Cover ${coverStr}`,
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
                    boardState[el.r][el.c].pencilColors.set(
                      el.num,
                      candidateColorPalette[0],
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
                name: `Finned ${
                  fishSize === 2
                    ? "X-Wing"
                    : fishSize === 3
                      ? "Swordfish"
                      : "Jellyfish"
                }`,
                mainInfo: `Digit (${num})`,
                detail: `Digit (${num}), Base ${baseStr}, Cover ${coverStr}, Fin ${finStr}`,
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
                  boardState[el.r][el.c].pencilColors.set(
                    el.num,
                    candidateColorPalette[0],
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
                  name: "XY-Wing",
                  mainInfo: `Pivot at r${pivot.r + 1}c${pivot.c + 1}`,
                  detail: `Digits (${allCands}) in Pivot r${pivot.r + 1}c${pivot.c + 1} with wings r${pincer1.r + 1}c${pincer1.c + 1} and r${pincer2.r + 1}c${pincer2.c + 1}`,
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
                    boardState[el.r][el.c].pencilColors.set(
                      el.num,
                      candidateColorPalette[0],
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
                name: "XYZ-Wing",
                mainInfo: `Pivot at r${pivot.r + 1}c${pivot.c + 1}`,
                detail: `Digits (${pivotCands}) in Pivot r${pivot.r + 1}c${pivot.c + 1} with wings r${wing1.r + 1}c${wing1.c + 1} and r${wing2.r + 1}c${wing2.c + 1}`,
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
                  boardState[el.r][el.c].pencilColors.set(
                    el.num,
                    candidateColorPalette[0],
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
                name: isGrouped ? "Grouped W-Wing" : "W-Wing",
                mainInfo: `Using digits (${elimDigit}${linkDigit})`,
                detail: `Digits (${elimDigit}${linkDigit}) in wings r${cell1.r + 1}c${cell1.c + 1} and r${cell2.r + 1}c${cell2.c + 1} connected by pivot ${unitType.slice(0, 1)}${unitIndex + 1} as ${strongLinkDetail}`,
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
                  boardState[el.r][el.c].pencilColors.set(
                    el.num,
                    candidateColorPalette[0],
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
                  name: "Remote Pair",
                  mainInfo: `using digits (${pair[0]}${pair[1]})`,
                  detail: `(${pair[0]}${pair[1]}) on ${pathStr}`,
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
                    boardState[el.r][el.c].pencilColors.set(
                      el.num,
                      candidateColorPalette[0],
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
                name: "Skyscraper",
                mainInfo: `Digit (${num})`,
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
                  boardState[el.r][el.c].pencilColors.set(
                    el.num,
                    candidateColorPalette[0],
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
                      name: "2-String Kite",
                      mainInfo: `Digit (${num})`,
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
                        boardState[el.r][el.c].pencilColors.set(
                          el.num,
                          candidateColorPalette[0],
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
                        name: "Crane",
                        mainInfo: `Digit (${num})`,
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
                          boardState[el.r][el.c].pencilColors.set(
                            el.num,
                            candidateColorPalette[0],
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
                  name: "Grouped 2-String Kite",
                  mainInfo: `Digit (${num})`,
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
                  boardState[r2][c2].pencilColors.set(
                    num,
                    candidateColorPalette[0],
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
                        name: "Empty Rectangle",
                        mainInfo: `Digit (${num})`,
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
                        boardState[elimR][elimC].pencilColors.set(
                          num,
                          candidateColorPalette[0],
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
              name: "BUG+1",
              mainInfo: `Tri-value cell at r${r_plus1 + 1}c${c_plus1 + 1}`,
              detail: `All digits appear exactly twice in all houses except for (${num})r${r_plus1 + 1}c${c_plus1 + 1}`,
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
                boardState[el.r][el.c].pencilColors.set(
                  el.num,
                  candidateColorPalette[0],
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
          boardState[el.r][el.c].pencilColors.set(
            el.num,
            candidateColorPalette[0],
          ),
        );
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
              name: "Unique Rectangle Type 1",
              mainInfo: `using Digits (${d1}${d2})`,
              detail: `Base (${d1}${d2}) in ${basePosStr}, Guardians ${getGuardiansStr(extraCells, d1, d2)}`,
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
          continue;
        }
      }

      // --- Types 2 & 5: Two or three extra cells with a common extra digit ---
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
                  name:
                    extraCells.length === 2
                      ? "Unique Rectangle Type 2"
                      : "Unique Rectangle Type 5",
                  mainInfo: `using Digits (${d1}${d2})`,
                  detail: `Base (${d1}${d2}) in ${basePosStr}, Guardians ${getGuardiansStr(extraCells, d1, d2)}`,
                },
                applyVisuals: getURVisuals(
                  extraCells.length === 2 ? 2 : 5,
                  cells,
                  d1,
                  d2,
                  _getUniqueRemovals(removals),
                ),
              };

              if (!findAll) return resultObj;
              results.push(resultObj);
              continue;
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
                  name: "Unique Rectangle Type 3",
                  mainInfo: `using Digits (${d1}${d2})`,
                  detail: `Base (${d1}${d2}) in ${basePosStr}, Guardians ${getGuardiansStr(extraCells, d1, d2)}, Exrta cells for vitrual naked subset ${subsetStr}`,
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
              continue;
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
                  e1r === e2r ? `Row ${e1r + 1}` : `Col ${e1c + 1}`;
                const resultObj = {
                  change: true,
                  type: "remove",
                  cells: _getUniqueRemovals(removals),
                  hint: {
                    name: "Unique Rectangle Type 4",
                    mainInfo: `using Digits (${d1}${d2})`,
                    detail: `Base (${d1}${d2}) in ${basePosStr}, Guardians ${getGuardiansStr(extraCells, d1, d2)}, Restricted guardians and base (${u}) in ${lineStr}`,
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
                continue;
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
                    name: "Unique Rectangle Type 6",
                    mainInfo: `using Digits (${d1}${d2})`,
                    detail: `Base (${d1}${d2}) in ${basePosStr}, Guardians ${getGuardiansStr(extraCells, d1, d2)}. Exclude a specific placement of (${u}) on UR removing all guardians`,
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

                continue;
              }
            }
          }
        }
      }
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
        if (hasExtra) extraCells.push([r, c]);
        else bivalueCells.push([r, c]);
      }

      let removals = [];
      let caseInfo = "";
      const strongLinks = [];
      const visualLinks = []; // Track strong lines

      const checkStrong = (d, type, idx, p1, p2) => {
        const isStrong = techniques._isStrongLink(
          pencils,
          d,
          type,
          idx,
          p1,
          p2,
        );
        if (isStrong) {
          if (type === "row")
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
          else
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
        return isStrong;
      };

      const addRemoval = (r, c, num) => {
        if (pencils[r][c] && pencils[r][c].has(num)) {
          removals.push({ r, c, num });
        }
      };

      if (extraCells.length === 2) {
        const [e1r, e1c] = extraCells[0];
        const [e2r, e2c] = extraCells[1];
        const [f1r, f1c] = bivalueCells[0];
        const [f2r, f2c] = bivalueCells[1];
        const row_aligned = e1r === e2r;
        const col_aligned = e1c === e2c;

        if (row_aligned) {
          caseInfo = "Case 2: Row-Aligned";
          if (checkStrong(d1, "row", e1r, e1c, e2c)) {
            addRemoval(e1r, e1c, d2);
            addRemoval(e2r, e2c, d2);
            strongLinks.push(`(${d1})r${e1r + 1}`);
          } else if (checkStrong(d2, "row", e1r, e1c, e2c)) {
            addRemoval(e1r, e1c, d1);
            addRemoval(e2r, e2c, d1);
            strongLinks.push(`(${d2})r${e1r + 1}`);
          }
          if (checkStrong(d1, "col", f1c, f1r, e1r)) {
            addRemoval(e2r, f2c, d2);
            strongLinks.push(`(${d1})c${f1c + 1}`);
          }
          if (checkStrong(d2, "col", f1c, f1r, e1r)) {
            addRemoval(e2r, f2c, d1);
            strongLinks.push(`(${d2})c${f1c + 1}`);
          }
          if (checkStrong(d1, "col", f2c, f2r, e2r)) {
            addRemoval(e2r, f1c, d2);
            strongLinks.push(`(${d1})c${f2c + 1}`);
          }
          if (checkStrong(d2, "col", f2c, f2r, e2r)) {
            addRemoval(e2r, f1c, d1);
            strongLinks.push(`(${d2})c${f2c + 1}`);
          }
        } else if (col_aligned) {
          caseInfo = "Case 2: Col-Aligned";
          if (checkStrong(d1, "col", e1c, e1r, e2r)) {
            addRemoval(e1r, e1c, d2);
            addRemoval(e2r, e2c, d2);
            strongLinks.push(`(${d1})c${e1c + 1}`);
          } else if (checkStrong(d2, "col", e1c, e1r, e2r)) {
            addRemoval(e1r, e1c, d1);
            addRemoval(e2r, e2c, d1);
            strongLinks.push(`(${d2})c${e1c + 1}`);
          }
          if (checkStrong(d1, "row", f1r, f1c, e1c)) {
            addRemoval(f2r, e1c, d2);
            strongLinks.push(`(${d1})r${f1r + 1}`);
          }
          if (checkStrong(d2, "row", f1r, f1c, e1c)) {
            addRemoval(f2r, e1c, d1);
            strongLinks.push(`(${d2})r${f1r + 1}`);
          }
          if (checkStrong(d1, "row", f2r, f2c, e2c)) {
            addRemoval(f1r, e1c, d2);
            strongLinks.push(`(${d1})r${f2r + 1}`);
          }
          if (checkStrong(d2, "row", f2r, f2c, e2c)) {
            addRemoval(f1r, e1c, d1);
            strongLinks.push(`(${d2})r${f2r + 1}`);
          }
        } else {
          // Diagonal
          caseInfo = "Case 2: Diagonal";
          const floor1 = [e1r, e2c],
            floor2 = [e2r, e1c];

          const r_f1_bi_d1 = checkStrong(d1, "row", floor1[0], floor1[1], e1c);
          const c_f1_bi_d1 = checkStrong(d1, "col", floor1[1], floor1[0], e2r);
          const r_f2_bi_d1 = checkStrong(d1, "row", floor2[0], floor2[1], e2c);
          const c_f2_bi_d1 = checkStrong(d1, "col", floor2[1], floor2[0], e1r);

          const r_f1_bi_d2 = checkStrong(d2, "row", floor1[0], floor1[1], e1c);
          const c_f1_bi_d2 = checkStrong(d2, "col", floor1[1], floor1[0], e2r);
          const r_f2_bi_d2 = checkStrong(d2, "row", floor2[0], floor2[1], e2c);
          const c_f2_bi_d2 = checkStrong(d2, "col", floor2[1], floor2[0], e1r);

          if (r_f1_bi_d1) {
            addRemoval(floor2[0], floor1[1], d1);
            strongLinks.push(`(${d1})r${floor1[0] + 1}`);
          }
          if (c_f2_bi_d1) {
            addRemoval(floor2[0], floor1[1], d1);
            strongLinks.push(`(${d1})c${floor2[1] + 1}`);
          }
          if (r_f1_bi_d2) {
            addRemoval(floor2[0], floor1[1], d2);
            strongLinks.push(`(${d2})r${floor1[0] + 1}`);
          }
          if (c_f2_bi_d2) {
            addRemoval(floor2[0], floor1[1], d2);
            strongLinks.push(`(${d2})c${floor2[1] + 1}`);
          }

          if (r_f2_bi_d1) {
            addRemoval(floor1[0], floor2[1], d1);
            strongLinks.push(`(${d1})r${floor2[0] + 1}`);
          }
          if (c_f1_bi_d1) {
            addRemoval(floor1[0], floor2[1], d1);
            strongLinks.push(`(${d1})c${floor1[1] + 1}`);
          }
          if (r_f2_bi_d2) {
            addRemoval(floor1[0], floor2[1], d2);
            strongLinks.push(`(${d2})r${floor2[0] + 1}`);
          }
          if (c_f1_bi_d2) {
            addRemoval(floor1[0], floor2[1], d2);
            strongLinks.push(`(${d2})c${floor1[1] + 1}`);
          }

          if (r_f1_bi_d2 && c_f1_bi_d2) addRemoval(floor1[0], floor1[1], d1);
          if (r_f1_bi_d1 && c_f1_bi_d1) addRemoval(floor1[0], floor1[1], d2);
          if (r_f2_bi_d2 && c_f2_bi_d2) addRemoval(floor2[0], floor2[1], d1);
          if (r_f2_bi_d1 && c_f2_bi_d1) addRemoval(floor2[0], floor2[1], d2);
        }
      } else if (extraCells.length === 3) {
        caseInfo = "Case 3: 3 Extra Cells";
        const [fr, fc] = bivalueCells[0];
        const diagCell = extraCells.find(([r, c]) => r !== fr && c !== fc);
        if (diagCell) {
          const [other_r, other_c] = diagCell;

          const r_floor_bi_d1 = checkStrong(d1, "row", fr, fc, other_c);
          const c_floor_bi_d1 = checkStrong(d1, "col", fc, fr, other_r);
          const r_other_bi_d1 = checkStrong(d1, "row", other_r, fc, other_c);
          const c_other_bi_d1 = checkStrong(d1, "col", other_c, fr, other_r);

          const r_floor_bi_d2 = checkStrong(d2, "row", fr, fc, other_c);
          const c_floor_bi_d2 = checkStrong(d2, "col", fc, fr, other_r);
          const r_other_bi_d2 = checkStrong(d2, "row", other_r, fc, other_c);
          const c_other_bi_d2 = checkStrong(d2, "col", other_c, fr, other_r);

          if (r_other_bi_d1 && (r_floor_bi_d1 || c_other_bi_d1)) {
            addRemoval(other_r, other_c, d2);
            strongLinks.push(`(${d1})r${other_r + 1}`);
          }
          if (r_other_bi_d2 && (r_floor_bi_d2 || c_other_bi_d2)) {
            addRemoval(other_r, other_c, d1);
            strongLinks.push(`(${d2})r${other_r + 1}`);
          }
          if (r_other_bi_d1 && c_other_bi_d2) {
            addRemoval(other_r, fc, d2);
            addRemoval(fr, other_c, d1);
            strongLinks.push(
              `(${d1})r${other_r + 1}`,
              `(${d2})c${other_c + 1}`,
            );
          }
          if (r_other_bi_d2 && c_other_bi_d1) {
            addRemoval(other_r, fc, d1);
            addRemoval(fr, other_c, d2);
            strongLinks.push(
              `(${d2})r${other_r + 1}`,
              `(${d1})c${other_c + 1}`,
            );
          }
          if (
            (r_floor_bi_d1 && r_other_bi_d2) ||
            (r_floor_bi_d1 && c_other_bi_d2)
          ) {
            addRemoval(other_r, fc, d1);
            strongLinks.push(`(${d1})r${fr + 1}`);
          }
          if (
            (r_floor_bi_d2 && r_other_bi_d1) ||
            (r_floor_bi_d2 && c_other_bi_d1)
          ) {
            addRemoval(other_r, fc, d2);
            strongLinks.push(`(${d2})r${fr + 1}`);
          }
          if (
            (c_floor_bi_d1 && c_other_bi_d2) ||
            (r_other_bi_d2 && c_floor_bi_d1)
          ) {
            addRemoval(fr, other_c, d1);
            strongLinks.push(`(${d1})c${fc + 1}`);
          }
          if (
            (c_floor_bi_d2 && c_other_bi_d1) ||
            (r_other_bi_d1 && c_floor_bi_d2)
          ) {
            addRemoval(fr, other_c, d2);
            strongLinks.push(`(${d2})c${fc + 1}`);
          }
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
            hint: {
              name: "Hidden Rectangle",
              mainInfo: `using Digits (${d1}${d2})`,
              detail: `Base (${d1}${d2}) in ${basePosStr}, Guardians ${guardiansStr}, Bivalue cells ${bivalueStr}, Conjugate pairs ${uniqueLinks}`,
            },
            applyVisuals: () => {
              highlightState = 0;
              highlightedDigit = null;
              cells.forEach(([cr, cc]) => {
                boardState[cr][cc].cellColor = cellColorPalette[7];
                if (boardState[cr][cc].pencils.has(d1))
                  boardState[cr][cc].pencilColors.set(
                    d1,
                    candidateColorPalette[7],
                  );
                if (boardState[cr][cc].pencils.has(d2))
                  boardState[cr][cc].pencilColors.set(
                    d2,
                    candidateColorPalette[7],
                  );
                boardState[cr][cc].pencils.forEach((cand) => {
                  if (cand !== d1 && cand !== d2)
                    boardState[cr][cc].pencilColors.set(
                      cand,
                      candidateColorPalette[3],
                    );
                });
              });
              visualLinks.forEach((link) => drawnLines.push(link));
              uniqueRemovals.forEach((el) =>
                boardState[el.r][el.c].pencilColors.set(
                  el.num,
                  candidateColorPalette[0],
                ),
              );
            },
          };
          if (!findAll) return resultObj;
          results.push(resultObj);
        }
      }
    }
    return findAll ? results : { change: false }; // ← was just `return { change: false }`
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

  _checkAndAddER: (cells, d1, d2, d3, pencils, er_list, is_3x2) => {
    const core_digits = new Set([d1, d2, d3]);

    let extra_count = 0;
    const masked_cands = [];

    for (const [r, c] of cells) {
      const cands = pencils[r][c];
      if (!cands) return; // Skip if cell is solved
      const core_cands_in_cell = new Set();
      let has_extra = false;

      for (const cand of cands) {
        if (core_digits.has(cand)) {
          core_cands_in_cell.add(cand);
        } else {
          has_extra = true;
        }
      }

      if (core_cands_in_cell.size === 0) return; // Cell must have at least one core digit
      if (has_extra) extra_count++;

      masked_cands.push({ r, c, cands: core_cands_in_cell });
    }

    if (extra_count > 4) return;

    const check_unit = (unit_cells) => {
      const union = new Set();
      unit_cells.forEach((cell) =>
        cell.cands.forEach((cand) => union.add(cand)),
      );
      return union.size === 3;
    };

    if (is_3x2) {
      const cA = cells[0][1];
      const col1_cands = masked_cands.filter((mc) => mc.c === cA);
      const col2_cands = masked_cands.filter((mc) => mc.c !== cA);
      if (check_unit(col1_cands) && check_unit(col2_cands)) {
        er_list.push({ cells, digits: [d1, d2, d3], is_3x2: true });
      }
    } else {
      // 2x3
      const rA = cells[0][0];
      const row1_cands = masked_cands.filter((mc) => mc.r === rA);
      const row2_cands = masked_cands.filter((mc) => mc.r !== rA);
      if (check_unit(row1_cands) && check_unit(row2_cands)) {
        er_list.push({ cells, digits: [d1, d2, d3], is_3x2: false });
      }
    }
  },

  _findExtendedRectangles: function (pencils) {
    const rectangles = [];

    for (let d1 = 1; d1 <= 7; d1++) {
      for (let d2 = d1 + 1; d2 <= 8; d2++) {
        for (let d3 = d2 + 1; d3 <= 9; d3++) {
          // --- 3x2 ERs (3 rows in different bands, 2 cols in same stack) ---
          for (let r1 = 0; r1 < 3; r1++) {
            for (let r2 = 3; r2 < 6; r2++) {
              for (let r3 = 6; r3 < 9; r3++) {
                for (let stack = 0; stack < 3; stack++) {
                  const cols_in_stack = [
                    stack * 3,
                    stack * 3 + 1,
                    stack * 3 + 2,
                  ];
                  for (const col_pair of techniques.combinations(
                    cols_in_stack,
                    2,
                  )) {
                    const [c1, c2] = col_pair;
                    const cells = [
                      [r1, c1],
                      [r2, c1],
                      [r3, c1],
                      [r1, c2],
                      [r2, c2],
                      [r3, c2],
                    ];
                    techniques._checkAndAddER(
                      cells,
                      d1,
                      d2,
                      d3,
                      pencils,
                      rectangles,
                      true,
                    );
                  }
                }
              }
            }
          }

          // --- NEW: 3x2 ERs (3 rows in SAME band, 2 cols in DIFFERENT stacks) ---
          for (let band = 0; band < 3; band++) {
            const r1 = band * 3;
            const r2 = band * 3 + 1;
            const r3 = band * 3 + 2;

            for (let c1 = 0; c1 < 8; c1++) {
              for (let c2 = c1 + 1; c2 < 9; c2++) {
                // Check if cols are in different stacks
                if (Math.floor(c1 / 3) !== Math.floor(c2 / 3)) {
                  const cells = [
                    [r1, c1],
                    [r2, c1],
                    [r3, c1],
                    [r1, c2],
                    [r2, c2],
                    [r3, c2],
                  ];
                  techniques._checkAndAddER(
                    cells,
                    d1,
                    d2,
                    d3,
                    pencils,
                    rectangles,
                    true, // is_3x2
                  );
                }
              }
            }
          }

          // --- 2x3 ERs (2 rows in same band, 3 cols in different stacks) ---
          for (let band = 0; band < 3; band++) {
            const rows_in_band = [band * 3, band * 3 + 1, band * 3 + 2];
            for (const row_pair of techniques.combinations(rows_in_band, 2)) {
              const [r1, r2] = row_pair;
              for (let c1 = 0; c1 < 3; c1++) {
                for (let c2 = 3; c2 < 6; c2++) {
                  for (let c3 = 6; c3 < 9; c3++) {
                    const cells = [
                      [r1, c1],
                      [r1, c2],
                      [r1, c3],
                      [r2, c1],
                      [r2, c2],
                      [r2, c3],
                    ];
                    techniques._checkAndAddER(
                      cells,
                      d1,
                      d2,
                      d3,
                      pencils,
                      rectangles,
                      false,
                    );
                  }
                }
              }
            }
          }

          // --- NEW: 2x3 ERs (2 rows in DIFFERENT bands, 3 cols in SAME stack) ---
          for (let stack = 0; stack < 3; stack++) {
            const c1 = stack * 3;
            const c2 = stack * 3 + 1;
            const c3 = stack * 3 + 2;

            for (let r1 = 0; r1 < 8; r1++) {
              for (let r2 = r1 + 1; r2 < 9; r2++) {
                // Check if rows are in different bands
                if (Math.floor(r1 / 3) !== Math.floor(r2 / 3)) {
                  const cells = [
                    [r1, c1],
                    [r1, c2],
                    [r1, c3],
                    [r2, c1],
                    [r2, c2],
                    [r2, c3],
                  ];
                  techniques._checkAndAddER(
                    cells,
                    d1,
                    d2,
                    d3,
                    pencils,
                    rectangles,
                    false, // is_3x2 = false
                  );
                }
              }
            }
          }
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
          const rows = [...new Set(cells.map((c) => c[0]))].sort(
            (a, b) => a - b,
          );
          const cols = [...new Set(cells.map((c) => c[1]))].sort(
            (a, b) => a - b,
          );
          if (extraData.is_3x2) {
            // 3x2: bilocated in cols
            drawnLines.push({
              r1: rows[0],
              c1: cols[0],
              n1: u,
              r2: rows[2],
              c2: cols[0],
              n2: u,
              color: lineColorPalette[0],
              style: "solid",
            });
            drawnLines.push({
              r1: rows[0],
              c1: cols[1],
              n1: u,
              r2: rows[2],
              c2: cols[1],
              n2: u,
              color: lineColorPalette[0],
              style: "solid",
            });
          } else {
            // 2x3: bilocated in rows
            drawnLines.push({
              r1: rows[0],
              c1: cols[0],
              n1: u,
              r2: rows[0],
              c2: cols[2],
              n2: u,
              color: lineColorPalette[0],
              style: "solid",
            });
            drawnLines.push({
              r1: rows[1],
              c1: cols[0],
              n1: u,
              r2: rows[1],
              c2: cols[2],
              n2: u,
              color: lineColorPalette[0],
              style: "solid",
            });
          }
        }

        removals.forEach((el) =>
          boardState[el.r][el.c].pencilColors.set(
            el.num,
            candidateColorPalette[0],
          ),
        );
      };
    };

    for (const er of ers) {
      const { cells, digits, is_3x2 } = er;
      const core_digits = new Set(digits);
      const removals = [];

      const extra_cells = cells.filter(([r, c]) =>
        [...pencils[r][c]].some((cand) => !core_digits.has(cand)),
      );

      const baseDigitsStr = digits.sort().join("");
      const detailPrefix = `Base (${baseDigitsStr}) in ${getBasePosStr(cells)}, Guardians ${getGuardiansStr(extra_cells, core_digits, pencils)}`;

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
              name: "Extended Unique Rectangle Type 1",
              mainInfo: `Digits (${baseDigitsStr})`,
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

      // --- Type 2 ---
      if (extra_cells.length >= 2) {
        let common_extra_cand = -1;
        let is_type2 = true;
        for (const [r, c] of extra_cells) {
          const extras = [...pencils[r][c]].filter(
            (cand) => !core_digits.has(cand),
          );
          if (extras.length !== 1) {
            is_type2 = false;
            break;
          }
          if (common_extra_cand === -1) common_extra_cand = extras[0];
          else if (common_extra_cand !== extras[0]) {
            is_type2 = false;
            break;
          }
        }
        if (is_type2) {
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
                name: "Extended Unique Rectangle Type 2",
                mainInfo: `Digits (${baseDigitsStr})`,
                detail: detailPrefix,
              },
              applyVisuals: getEURVisuals(
                2,
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
                  name: "Extended Unique Rectangle Type 3",
                  mainInfo: `Digits (${baseDigitsStr})`,
                  detail: `${detailPrefix}, Subset cells: ${subsetStr}`,
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
                    name: "Extended Unique Rectangle Type 4",
                    mainInfo: `Digits (${baseDigitsStr})`,
                    detail: `${detailPrefix}, Restricted base (${d}) in ${restrictedCellsStr}`,
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
            if (!is_3x2) {
              // 2x3 ER, check rows for X-Wing
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
              // 3x2 ER, check cols for X-Wing
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
                    name: "Extended Unique Rectangle Type 6",
                    mainInfo: `Digits (${baseDigitsStr})`,
                    detail: `${detailPrefix}, Exclude a specific placement of (${d}) on ER removing all guardians`,
                  },
                  applyVisuals: getEURVisuals(
                    6,
                    cells,
                    digits,
                    _getUniqueRemovals(removals),
                    { restrictedDigit: d, is_3x2 },
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

  // Offsets relative to a 3x3 selection of rows/cols
  // The inner arrays represent [row_index, col_index] into the selected 3 rows and 3 columns.
  HEX_PATTERNS: [
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 1],
      [2, 2],
    ],
    [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 2],
    ],
    [
      [0, 0],
      [0, 2],
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 2],
    ],
    [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 1],
    ],
    [
      [0, 0],
      [0, 2],
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2],
    ],
  ],
  _findUniqueHexagons: function (pencils) {
    // 1. Do one pass to find all "pure" bivalue cells and group them by their pair.
    const bivalue_cells_by_pair = new Map();

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cands = pencils[r][c];
        // We only care about pure bivalue cells for this map
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

    const hexagons = [];
    const found = new Set();

    if (typeof techniques.combinations !== "function") {
      console.error("techniques.combinations helper function is missing.");
      return [];
    }

    // 2. Iterate ONLY over pairs that have at least 2 bivalue cells
    for (const [
      pair_key,
      bivalue_set_for_pair,
    ] of bivalue_cells_by_pair.entries()) {
      // This is the optimization: We skip any pair that doesn't have at least 2
      // pure bivalue cells, before doing any more work.
      if (bivalue_set_for_pair.size < 2) continue;

      const [d1, d2] = pair_key.split(",").map(Number);
      const cell_list = []; // Cells containing d1 OR d2

      // 3. Now, for this "promising" pair, find all cells
      //    that contain at least one of the core digits.
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cands = pencils[r][c];
          if (cands.size < 1) continue;

          if (cands.has(d1) || cands.has(d2)) {
            cell_list.push(r * 9 + c);
          }
        }
      }

      // 4. The rest of the logic is the same as before
      if (cell_list.length < 6) continue;

      const cellset = new Set(cell_list);
      const row_cnt = Array(9).fill(0),
        col_cnt = Array(9).fill(0);
      cell_list.forEach((id) => {
        row_cnt[Math.floor(id / 9)]++;
        col_cnt[id % 9]++;
      });

      const rows = [],
        cols = [];
      for (let i = 0; i < 9; ++i) {
        if (row_cnt[i] >= 2) rows.push(i);
        if (col_cnt[i] >= 2) cols.push(i);
      }

      if (rows.length < 3 || cols.length < 3) continue;

      for (const rr of techniques.combinations(rows, 3)) {
        for (const cc of techniques.combinations(cols, 3)) {
          for (const pattern of techniques.HEX_PATTERNS) {
            const hex_cells = [];
            let isValid = true;
            for (const [r_idx, c_idx] of pattern) {
              const r = rr[r_idx],
                c = cc[c_idx];

              if (!cellset.has(r * 9 + c)) {
                isValid = false;
                break;
              }
              hex_cells.push([r, c]);
            }
            if (!isValid) continue;

            const sorted_ids = hex_cells
              .map(([r, c]) => r * 9 + c)
              .sort((a, b) => a - b);
            const hex_key = sorted_ids.join(",");
            if (found.has(hex_key)) continue;

            // Check that the found hexagon contains at least 2 pure bivalue cells
            const biv_count = hex_cells.filter(([r, c]) =>
              bivalue_set_for_pair.has(r * 9 + c),
            ).length;
            if (biv_count < 2) continue;

            const blocks = new Set(
              hex_cells.map(([r, c]) => techniques._getBoxIndex(r, c)),
            );
            if (blocks.size !== 3) continue;

            hexagons.push({
              cells: hex_cells,
              digits: [d1, d2], // Already have them as numbers
            });
            found.add(hex_key);
          }
        }
      }
    }
    return hexagons;
  },
  uniqueLoop: (board, pencils, findAll = false) => {
    const results = [];
    const hexagons = techniques._findUniqueHexagons(pencils);
    if (hexagons.length === 0) return { change: false };

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
          boardState[el.r][el.c].pencilColors.set(
            el.num,
            candidateColorPalette[0],
          ),
        );
      };
    };

    for (const hex of hexagons) {
      const { cells, digits } = hex;
      const [d1, d2] = digits;
      const d_set = new Set(digits);
      let removals = [];

      const extra_cells = cells.filter(
        ([r, c]) =>
          pencils[r][c].size !== 2 ||
          ![...pencils[r][c]].every((d) => d_set.has(d)),
      );

      const baseDigitsStr = `${d1}${d2}`;
      const detailPrefix = `Base (${baseDigitsStr}) in ${getBasePosStr(cells)}, Guardians: ${getGuardiansStr(extra_cells, d_set, pencils)}`;

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
              name: "Unique Loop Type 1",
              mainInfo: `using Digits (${baseDigitsStr})`,
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

      // --- Type 2 ---
      if (extra_cells.length >= 2 && extra_cells.length <= 4) {
        let common_extra_cand = -1;
        let is_type2 = true;
        for (const [r, c] of extra_cells) {
          const extras = [...pencils[r][c]].filter((cand) => !d_set.has(cand));
          if (extras.length !== 1) {
            is_type2 = false;
            break;
          }
          if (common_extra_cand === -1) common_extra_cand = extras[0];
          else if (common_extra_cand !== extras[0]) {
            is_type2 = false;
            break;
          }
        }
        if (is_type2) {
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
                name:
                  extra_cells.length === 2
                    ? "Unique Loop Type 2"
                    : "Unique Loop Type 5",
                mainInfo: `using Digits (${baseDigitsStr})`,
                detail: detailPrefix,
              },
              applyVisuals: getULVisuals(
                extra_cells.length === 2 ? 2 : 5,
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

        // --- Type 3 (Hexagon + Naked Subset) ---
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
            const hexCellsSet = new Set(cells.map(JSON.stringify));
            const unitCells = unitCellsRaw.filter(
              ([r, c]) =>
                !hexCellsSet.has(JSON.stringify([r, c])) && board[r][c] === 0,
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
                  name: "Unique Loop Type 3",
                  mainInfo: `using Digits (${baseDigitsStr})`,
                  detail: `${detailPrefix}, Subset cells: ${subsetStr}`,
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
                    name: "Unique Loop Type 4",
                    mainInfo: `using Digits (${baseDigitsStr})`,
                    detail: `${detailPrefix}, Restricted base (${d}) in ${restrictedCellsStr}`,
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
      if (extra_cells.length === 2 || extra_cells.length === 3) {
        let seeing_pair_exists = false;
        for (let i = 0; i < extra_cells.length; ++i) {
          for (let j = i + 1; j < extra_cells.length; ++j) {
            if (techniques._sees(extra_cells[i], extra_cells[j])) {
              seeing_pair_exists = true;
              break;
            }
          }
          if (seeing_pair_exists) break;
        }

        if (!seeing_pair_exists) {
          let common_peer_in_hex_exists = false;
          if (extra_cells.length === 2) {
            for (const hex_cell of cells) {
              const is_extra = extra_cells.some(
                (ec) => ec[0] === hex_cell[0] && ec[1] === hex_cell[1],
              );
              if (is_extra) continue;
              if (
                techniques._sees(hex_cell, extra_cells[0]) &&
                techniques._sees(hex_cell, extra_cells[1])
              ) {
                common_peer_in_hex_exists = true;
                break;
              }
            }
          } else {
            // Size 3 and no seeing pairs is geometrically rare/impossible, but follow cpp
            common_peer_in_hex_exists = true;
          }

          if (common_peer_in_hex_exists) {
            const rows = [...new Set(cells.map((c) => c[0]))];
            for (const u of digits) {
              let u_is_bilocated_in_all_rows = true;
              for (const r of rows) {
                const req_locs = cells
                  .filter((cell) => cell[0] === r)
                  .map((cell) => cell[1]);
                if (
                  req_locs.length !== 2 ||
                  !techniques._isStrongLink(
                    pencils,
                    u,
                    "row",
                    r,
                    req_locs[0],
                    req_locs[1],
                  )
                ) {
                  u_is_bilocated_in_all_rows = false;
                  break;
                }
              }
              if (u_is_bilocated_in_all_rows) {
                extra_cells.forEach(([r, c]) => {
                  if (pencils[r][c].has(u)) removals.push({ r, c, num: u });
                });
                if (removals.length > 0) {
                  const resultObj = {
                    change: true,
                    type: "remove",
                    cells: _getUniqueRemovals(removals),
                    hint: {
                      name: "Unique Loop Type 6",
                      mainInfo: `using Digits (${baseDigitsStr})`,
                      detail: `${detailPrefix}, Exclude a specific placement of (${u}) on Unique Loop removing all guardians`,
                    },
                    applyVisuals: getULVisuals(
                      6,
                      cells,
                      digits,
                      _getUniqueRemovals(removals),
                      { restrictedDigit: u },
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
                    size === 2 ? "Almost Locked Pair" : "Almost Locked Triple";
                  const mainInfo = `using ${isRow ? "Row" : "Col"} ${isLineToBox ? baseIdx + 1 : targetIdx + 1} and Box ${isLineToBox ? targetIdx + 1 : baseIdx + 1}`;

                  const resultObj = {
                    change: true,
                    type: "remove",
                    cells: uniqueElims,
                    hint: {
                      name: techName,
                      mainInfo: mainInfo,
                      detail: `ALS (${digitsStr})${alsStr}, Intersection ${intStr}, Off-intersection ${outStr}`,
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
                        boardState[el.r][el.c].pencilColors.set(
                          el.num,
                          candidateColorPalette[0],
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

    return findAll ? results : { change: false }; // ← was just `return { change: false }`
  },

  almostLockedPair: (board, pencils, findAll = false) => {
    return techniques._almostLockedSets(board, pencils, 2, findAll); // pass findAll
  },

  almostLockedTriple: (board, pencils, findAll = false) => {
    return techniques._almostLockedSets(board, pencils, 3, findAll); // pass findAll
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
                      const hintName = "Sue de Coq";
                      const lineName = isRow ? "Row" : "Col";

                      // Build Hint Detail
                      const aCells = parsePosSet(A.positions);
                      const bCells = parsePosSet(B.positions);

                      const strA = formatRC(aCells);
                      const strB = formatBP(bCells, boxNum);
                      const strC = formatRC(C);

                      const totalMask = A.mask | B.mask | V_mask;
                      const strDigits = maskToDigitsStr(totalMask);

                      let detailStr = `Intersection ${strC}, Off-intersection ${strA} and ${strB}, Digit (${strDigits})`;

                      if (overlapMask > 0) {
                        detailStr += `, (${maskToDigitsStr(overlapMask)}) appears twice`;
                      }

                      const resultObj = {
                        change: true,
                        type: "remove",
                        cells: eliminations,
                        hint: {
                          name: hintName,
                          mainInfo: `Intersecting ${lineName} ${lineIdx + 1} and Box ${boxNum}`,
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
                            boardState[el.r][el.c].pencilColors.set(
                              el.num,
                              candidateColorPalette[0],
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
    const formatRC = (cells) => {
      if (!cells || cells.length === 0) return "";
      if (cells.every((c) => c[0] === cells[0][0])) {
        return `r${cells[0][0] + 1}c${cells
          .map((c) => c[1] + 1)
          .sort((a, b) => a - b)
          .join("")}`;
      }
      if (cells.every((c) => c[1] === cells[0][1])) {
        return `r${cells
          .map((c) => c[0] + 1)
          .sort((a, b) => a - b)
          .join("")}c${cells[0][1] + 1}`;
      }
      return cells.map((c) => `r${c[0] + 1}c${c[1] + 1}`).join(",");
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
                                  const rowAhsStr = formatRC(rowAhsCells);
                                  const colAhsStr = formatRC(colAhsCells);

                                  const resultObj = {
                                    change: true,
                                    type: "remove",
                                    cells: eliminations,
                                    hint: {
                                      name: "Triple Firework",
                                      mainInfo: `using Row ${rIdx + 1} and Col ${cIdx + 1}`,
                                      detail: `AHS (${ahsDigits})${rowAhsStr} and (${ahsDigits})${colAhsStr}`,
                                    },
                                    applyVisuals: () => {
                                      highlightedDigit = null;
                                      highlightState = 0;

                                      // Color Row AHS
                                      rowAhsCells.forEach(([r, c]) => {
                                        window.addCellColor(
                                          r,
                                          c,
                                          cellColorPalette[6],
                                        );
                                        ahsDigitArr.forEach((d) => {
                                          if (boardState[r][c].pencils.has(d)) {
                                            boardState[r][c].pencilColors.set(
                                              d,
                                              candidateColorPalette[4],
                                            ); // AHS candidate Color 5
                                          }
                                        });
                                      });

                                      // Color Col AHS
                                      colAhsCells.forEach(([r, c]) => {
                                        window.addCellColor(
                                          r,
                                          c,
                                          cellColorPalette[7],
                                        );

                                        ahsDigitArr.forEach((d) => {
                                          if (boardState[r][c].pencils.has(d)) {
                                            boardState[r][c].pencilColors.set(
                                              d,
                                              candidateColorPalette[4],
                                            ); // AHS candidate Color 5
                                          }
                                        });
                                      });

                                      // Color Eliminations (Candidate Color 1)
                                      eliminations.forEach((el) => {
                                        boardState[el.r][el.c].pencilColors.set(
                                          el.num,
                                          candidateColorPalette[0],
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

  buildGroupedOrMap: (pencils, getNode) => {
    const orMap = new Map();

    const addLink = (cellsA, cellsB, digit) => {
      const nodeA = getNode(cellsA, digit);
      const nodeB = getNode(cellsB, digit);
      if (nodeA !== nodeB) {
        if (!orMap.has(nodeA)) orMap.set(nodeA, new Set());
        if (!orMap.has(nodeB)) orMap.set(nodeB, new Set());
        orMap.get(nodeA).add(nodeB);
        orMap.get(nodeB).add(nodeA);
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

  buildAlsOrMap: (board, pencils, getNode, alsLinkRegistry) => {
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
            if (pencils[r][c] && pencils[r][c].has(d)) return true;
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

          if (!hasNandCandidates(node1) || !hasNandCandidates(node2)) continue;

          // SAVE THE ALS REFERENCE HERE
          candidateLinks.push({ nodeA: node1, nodeB: node2, als });
        }
      }
    }

    const isSubset = (subNode, superNode) => {
      if (subNode.digits[0] !== superNode.digits[0]) return false;
      return subNode.cells.every((id) => superNode.cells.includes(id));
    };

    // 2. Subset Reduction Filter
    const finalLinks = [];
    for (let i = 0; i < candidateLinks.length; i++) {
      const { nodeA, nodeB } = candidateLinks[i];
      let isDominated = false;
      for (let j = 0; j < candidateLinks.length; j++) {
        if (i === j) continue;
        const other = candidateLinks[j];
        if (
          (isSubset(other.nodeA, nodeA) && isSubset(other.nodeB, nodeB)) ||
          (isSubset(other.nodeA, nodeB) && isSubset(other.nodeB, nodeA))
        ) {
          if (
            other.nodeA.cells.length !== nodeA.cells.length ||
            other.nodeB.cells.length !== nodeB.cells.length
          ) {
            isDominated = true;
            break;
          }
        }
      }
      if (!isDominated) finalLinks.push(candidateLinks[i]);
    }
    const alsMap = new Map();
    for (const { nodeA, nodeB, als } of finalLinks) {
      if (als.cells.length > 1) {
        if (!alsMap.has(nodeA)) alsMap.set(nodeA, new Set());
        if (!alsMap.has(nodeB)) alsMap.set(nodeB, new Set());
        alsMap.get(nodeA).add(nodeB);
        alsMap.get(nodeB).add(nodeA);

        // Register the ALS against the node pair
        if (alsLinkRegistry) {
          if (!alsLinkRegistry.has(nodeA))
            alsLinkRegistry.set(nodeA, new Map());
          if (!alsLinkRegistry.has(nodeB))
            alsLinkRegistry.set(nodeB, new Map());
          alsLinkRegistry.get(nodeA).set(nodeB, als);
          alsLinkRegistry.get(nodeB).set(nodeA, als);
        }
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
              if (fins.length === 0 || fins.length > n) continue;

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

  _findCommonPeersBS: (cellMask) => {
    let commonPeers = ~0n; // All ones (conceptually, practically handling 81 bits)
    // We mask it down to 81 bits at the end or implicitly via ANDing with PEER_MAP

    // Iterate set bits in cellMask
    let m = cellMask;
    let idx = 0;
    while (m !== 0n) {
      if (m & 1n) {
        // Intersect current common peers with the peer map of this cell
        if (commonPeers === ~0n) {
          commonPeers = PEER_MAP[idx];
        } else {
          commonPeers &= PEER_MAP[idx];
        }
      }
      m >>= 1n;
      idx++;
    }
    return commonPeers === ~0n ? 0n : commonPeers;
  },
  /**
   * Precomputes common peers for every digit of every ALS in the cache.
   * Corresponds to C++: build_als_digit_common_peers()
   */
  _buildAlsDigitCommonPeers: () => {
    _alsDigitCommonPeers = {};

    for (const als of _alsCache) {
      const peersArray = Array(9).fill(0n);
      for (let d = 1; d <= 9; d++) {
        const dCells = als.candidatePositions[d - 1];
        if (dCells === 0n) continue;
        peersArray[d - 1] = techniques._findCommonPeersBS(dCells);
      }
      _alsDigitCommonPeers[als.hash] = peersArray;
    }
  },

  /**
   * Builds the Restricted Common Candidate (RCC) graph between ALSs.
   * Corresponds to C++: build_als_rcc_map()
   */
  _buildAlsRccMap: () => {
    _alsRccMap = {};
    _alsLookup = {};

    // Build lookup for easy access by hash

    for (const als of _alsCache) {
      _alsLookup[als.hash] = als;
      _alsRccMap[als.hash] = [];
    }

    for (let i = 0; i < _alsCache.length; i++) {
      for (let j = i + 1; j < _alsCache.length; j++) {
        const als1 = _alsCache[i];
        const als2 = _alsCache[j];

        const commonMask = als1.candidates & als2.candidates;
        if (commonMask === 0) continue;

        // Iterate bits in commonMask
        for (let d = 1; d <= 9; d++) {
          if ((commonMask >> (d - 1)) & 1) {
            const d1Pos = als1.candidatePositions[d - 1];
            const d2Pos = als2.candidatePositions[d - 1];

            // 1. Check for overlap in candidate positions (Invalid for RCC)
            if ((d1Pos & d2Pos) !== 0n) continue;

            // 2. Check visibility: All d-cells in ALS1 must see all d-cells in ALS2
            // We use the precomputed common peers:
            // If ALS1's common peers for 'd' cover all of ALS2's 'd' cells, it's a valid link.
            const p1 = _alsDigitCommonPeers[als1.hash][d - 1];

            // (p1 & d2Pos) === d2Pos checks if d2Pos is a subset of p1
            if ((p1 & d2Pos) === d2Pos) {
              _alsRccMap[als1.hash].push({
                hash: als2.hash,
                digit: d,
              });
              _alsRccMap[als2.hash].push({
                hash: als1.hash,
                digit: d,
              });
            }
          }
        }
      }
    }
  },

  _processElims: (peerMask, digit, pencils, elims) => {
    let m = peerMask;
    let idx = 0;
    while (m !== 0n) {
      if (m & 1n) {
        const r = Math.floor(idx / 9);
        const c = idx % 9;
        if (pencils[r][c].has(digit)) {
          elims.push({ r, c, num: digit });
        }
      }
      m >>= 1n;
      idx++;
    }
  },

  /**
   * Core DFS logic for Almost Locked Set Chains.
   * Supports both Ring (Continuous Loop) and Linear Chain eliminations.
   * Corresponds to C++: als_chain_core
   */
  _alsChainCore: (
    board,
    pencils,
    minLen,
    maxLen,
    nameOverride = "ALS Chain",
    sizePairFilter = null,
    findAll = false,
  ) => {
    // 1. Map string/complex hashes to simple 0-based integers for the Uint8Array
    const hashToId = Object.create(null);
    for (let i = 0; i < _alsCache.length; i++) {
      hashToId[_alsCache[i].hash] = i;
    }

    // 2. Clear out shared structures
    SHARED_VISITED_ALS = new Uint8Array(4096);
    SHARED_PATH_ALS = new Array(20);
    let results = [];
    let found = false;
    let resultToReturn = { change: false };

    // Helper: Eliminate RCC from common peers of the link (Used for Rings)
    const eliminateRccPeers = (alsA, alsB, rccDigit, outElims) => {
      let changed = false;
      const allCells =
        alsA.candidatePositions[rccDigit - 1] |
        alsB.candidatePositions[rccDigit - 1];
      const peerMask = techniques._findCommonPeersBS(allCells);
      techniques._processElims(peerMask, rccDigit, pencils, outElims);
      if (outElims.length > 0) changed = true;
      return changed;
    };

    const eliminateNonRcc = (A, nonRccMask, outElims) => {
      let changed = false;
      const zMaskA = A.mask & ~nonRccMask;
      const zDigitsA = techniques._bits.maskToDigits(zMaskA);
      for (const z of zDigitsA) {
        const pm = techniques._findCommonPeersBS(A.candidatePositions[z - 1]);
        techniques._processElims(pm, z, pencils, outElims);
      }
      if (outElims.length > 0) changed = true;
      return changed;
    };

    const createResult = (
      path,
      isRingResult,
      eliminations,
      successTarget,
      successClosingRcc,
    ) => {
      const uniqueElims = [];
      const seen = new Set();
      for (let i = 0; i < eliminations.length; i++) {
        const el = eliminations[i];
        // Create a unique 12-bit integer key for r, c, num
        const key = (el.r << 8) | (el.c << 4) | el.num;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueElims.push(el);
        }
      }

      // --- Hint Construction ---
      let info = "";
      if (nameOverride === "WXYZ-Wing" && path.length === 2) {
        const alsA = _alsLookup[path[0].hash];
        const alsB = _alsLookup[path[1].hash];
        const pivot = alsA.size === 1 ? alsA : alsB;
        const [pr, pc] = pivot.cells[0];
        info = `Bivalue cell at r${pr + 1}c${pc + 1}`;
      } else if (nameOverride === "ALS XY-Wing" && path.length === 3) {
        const pivotNode = _alsLookup[path[1].hash];
        const pivotLoc = techniques.fmtAlsNode(pivotNode);

        const rcc1 = path[1].viaDigit;
        const rcc2 = path[2].viaDigit;

        info = `Pivot ALS: -(${rcc1}=${rcc2})${pivotLoc}-`;
      } else {
        const startNode = _alsLookup[path[0].hash];
        const firstRcc = path[1].viaDigit;

        const remMask = startNode.candidates & ~(1 << (firstRcc - 1));
        const zStr = isRingResult ? successClosingRcc : successTarget.join("");
        const loc = techniques.fmtAlsNode(startNode);

        info = `Start with (${zStr}=${firstRcc})${loc}`;
      }

      // Build the Detail String
      let detail = "";
      const fmtALS = (als) => {
        if (als.unitName && als.unitName.startsWith("Box")) {
          const b = [
            ...new Set(
              als.cells.map(
                ([r, c]) => Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1,
              ),
            ),
          ];
          const pts = [
            ...new Set(
              als.cells.map(
                ([r, c]) => Math.floor(r % 3) * 3 + Math.floor(c % 3) + 1,
              ),
            ),
          ]
            .sort((a, b) => a - b)
            .join("");
          return `b${b}p${pts}`;
        } else {
          const rs = [...new Set(als.cells.map(([r, c]) => r + 1))]
            .sort((a, b) => a - b)
            .join("");
          const cs = [...new Set(als.cells.map(([r, c]) => c + 1))]
            .sort((a, b) => a - b)
            .join("");
          return `r${rs}c${cs}`;
        }
      };

      const pieces = [];
      for (let i = 0; i < path.length; i++) {
        const als = _alsLookup[path[i].hash];
        // Determine entering and exiting digits
        const d_in =
          i === 0
            ? isRingResult
              ? successClosingRcc
              : successTarget.join("")
            : path[i].viaDigit;
        const d_out =
          i === path.length - 1
            ? isRingResult
              ? successClosingRcc
              : successTarget.join("")
            : path[i + 1].viaDigit;

        pieces.push(`(${d_in}=${d_out})${fmtALS(als)}`);
      }
      detail = pieces.join("-");
      if (isRingResult) {
        detail += "-(Ring)";
      }
      if (nameOverride === "ALS Chain")
        detail = `[${2 * path.length}] ` + detail;

      // Deep capture necessary properties to avoid relying on global _alsLookup in UI callback
      const visualPath = path.map((step) => ({
        viaDigit: step.viaDigit,
        alsCells: [..._alsLookup[step.hash].cells],
      }));
      const v_isRingResult = isRingResult;
      const v_successTargets = successTarget;
      const v_successClosingRcc = successClosingRcc;

      const snap_nodes = (() => {
        const nodes = [];
        visualPath.forEach((step, i) => {
          const d_in =
            i === 0
              ? v_isRingResult
                ? v_successClosingRcc
                : v_successTargets[0]
              : step.viaDigit;
          const d_out =
            i === visualPath.length - 1
              ? v_isRingResult
                ? v_successClosingRcc
                : v_successTargets[0]
              : visualPath[i + 1].viaDigit;

          nodes.push({
            cells: step.alsCells.filter(([r, c]) => pencils[r][c].has(d_in)),
            digit: d_in,
          });
          nodes.push({
            cells: step.alsCells.filter(([r, c]) => pencils[r][c].has(d_out)),
            digit: d_out,
          });
        });
        return nodes;
      })();

      return {
        change: true,
        type: "remove",
        cells: uniqueElims,
        hint: {
          name: nameOverride,
          mainInfo: info,
          detail: detail,
        },
        applyVisuals: () => {
          highlightedDigit = null;
          highlightState = 0;

          const alsColors = [6, 7, 2, 3, 4, 5]; // Color loop

          visualPath.forEach((step, i) => {
            // Color ALS cells (Supports Multiple Colors)
            step.alsCells.forEach(([r, c]) => {
              window.addCellColor(r, c, cellColorPalette[alsColors[i % 6]]);
            });
          });

          // Color elimination candidate in color 1
          uniqueElims.forEach((el) =>
            window.addCandidateColor(
              el.r,
              el.c,
              el.num,
              candidateColorPalette[0],
            ),
          );

          const nodes = snap_nodes;
          const getClosestCells = (cellsA, cellsB) => {
            if (!cellsA || !cellsB || !cellsA.length || !cellsB.length)
              return null;
            let minD = Infinity;
            let bestA = cellsA[0];
            let bestB = cellsB[0];
            for (const a of cellsA) {
              for (const b of cellsB) {
                const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
                if (d < minD) {
                  minD = d;
                  bestA = a;
                  bestB = b;
                }
              }
            }
            return [bestA, bestB];
          };

          const drawGroup = (cells, digit, colorIdx) => {
            if (cells.length > 1) {
              for (let k = 0; k < cells.length - 1; k++) {
                drawnLines.push({
                  r1: cells[k][0],
                  c1: cells[k][1],
                  n1: digit,
                  r2: cells[k + 1][0],
                  c2: cells[k + 1][1],
                  n2: digit,
                  color: lineColorPalette[colorIdx], // Color matching candidate
                  style: "solid",
                });
              }
            }
          };

          for (let k = 0; k < nodes.length; k++) {
            const node = nodes[k];
            const colorIdx = k % 2 === 0 ? 4 : 5; // Alternating candidate color 5 and 6

            // Color candidate nodes (Supports Multiple Colors)
            node.cells.forEach(([r, c]) =>
              window.addCandidateColor(
                r,
                c,
                node.digit,
                candidateColorPalette[colorIdx],
              ),
            );

            // Connect grouped candidates' links with the same candidate color
            drawGroup(node.cells, node.digit, colorIdx);

            // Connect adjacent nodes
            if (k < nodes.length - 1) {
              const nextNode = nodes[k + 1];
              const closest = getClosestCells(node.cells, nextNode.cells);
              if (closest) {
                const isInner = k % 2 === 0;
                drawnLines.push({
                  r1: closest[0][0],
                  c1: closest[0][1],
                  n1: node.digit,
                  r2: closest[1][0],
                  c2: closest[1][1],
                  n2: nextNode.digit,
                  color: lineColorPalette[0], // Solid/Dash in Color 1
                  style: isInner ? "solid" : "dash", // Inner ALS solid, intra ALS dash
                });
              }
            }
          }

          // Ring connection
          if (v_isRingResult && nodes.length > 1) {
            const firstNode = nodes[0];
            const lastNode = nodes[nodes.length - 1];
            const closest = getClosestCells(lastNode.cells, firstNode.cells);
            if (closest) {
              drawnLines.push({
                r1: closest[0][0],
                c1: closest[0][1],
                n1: lastNode.digit,
                r2: closest[1][0],
                c2: closest[1][1],
                n2: firstNode.digit,
                color: lineColorPalette[0],
                style: "dash", // Ring in dash Color 1
              });
            }
          }
        },
      };
    };

    let currentTargetLen = minLen;

    // 3. Ultra-Fast Pointer-Based DFS Function
    const dfs = (depth) => {
      if (found && !findAll) return;

      const lastStep = SHARED_PATH_ALS[depth];
      const neighbors = _alsRccMap[lastStep.hash];
      if (!neighbors) return;

      // Use a fast standard loop over neighbors
      for (let n = 0; n < neighbors.length; n++) {
        if (found && !findAll) return;

        const neighbor = neighbors[n];
        const nbrHash = neighbor.hash;
        const d = neighbor.digit;

        // Cannot use the same digit to enter and exit an ALS
        if (d === lastStep.viaDigit) continue;

        // Fast Uint8Array Check using mapped ID
        const nbrId = hashToId[nbrHash];
        if (SHARED_VISITED_ALS[nbrId] === 1) continue;

        if (sizePairFilter && depth === 0) {
          // depth 0 means path length is 1
          const alsStart = _alsLookup[SHARED_PATH_ALS[0].hash];
          const alsNext = _alsLookup[nbrHash];
          if (!sizePairFilter(alsStart, alsNext)) continue;
        }

        // Prepare next step pointer
        const nextDepth = depth + 1;
        SHARED_PATH_ALS[nextDepth] = { hash: nbrHash, viaDigit: d };
        SHARED_VISITED_ALS[nbrId] = 1;

        const len = nextDepth + 1;
        const currentPathSlice = SHARED_PATH_ALS.slice(0, len); // Needed for validations

        // Check Constraints
        if (len === currentTargetLen && SHARED_PATH_ALS[0].hash < nbrHash) {
          const alsStart = _alsLookup[SHARED_PATH_ALS[0].hash];
          const alsEnd = _alsLookup[nbrHash];
          let isRing = false;

          // --- 1. PRIORITY: Check for Ring (Continuous Loop) ---
          const endNeighbors = _alsRccMap[alsEnd.hash];
          if (endNeighbors) {
            for (let en = 0; en < endNeighbors.length; en++) {
              const endNeighbor = endNeighbors[en];
              const closingHash = endNeighbor.hash;
              const closingRcc = endNeighbor.digit;

              if (closingHash === alsStart.hash) {
                const startExitDigit = SHARED_PATH_ALS[1].viaDigit;
                const endEntryDigit = d;

                if (
                  closingRcc !== startExitDigit &&
                  closingRcc !== endEntryDigit
                ) {
                  isRing = true;

                  let ringChange = false;
                  let localElims = [];
                  // A. Internal links
                  for (let i = 0; i < currentPathSlice.length - 1; i++) {
                    const a = _alsLookup[currentPathSlice[i].hash];
                    const b = _alsLookup[currentPathSlice[i + 1].hash];
                    const rcc = currentPathSlice[i + 1].viaDigit;
                    if (eliminateRccPeers(a, b, rcc, localElims))
                      ringChange = true;
                  }
                  // B. Closing link
                  if (
                    eliminateRccPeers(alsEnd, alsStart, closingRcc, localElims)
                  )
                    ringChange = true;

                  // C. non-Rcc in ALS
                  const nonRccStartbm =
                    (1 << (closingRcc - 1)) | (1 << (startExitDigit - 1));
                  if (eliminateNonRcc(alsStart, nonRccStartbm, localElims))
                    ringChange = true;

                  for (let i = 1; i < currentPathSlice.length - 1; i++) {
                    const alsMid = _alsLookup[currentPathSlice[i].hash];
                    const nonRccMidbm =
                      (1 << (currentPathSlice[i].viaDigit - 1)) |
                      (1 << (currentPathSlice[i + 1].viaDigit - 1));
                    if (eliminateNonRcc(alsMid, nonRccMidbm, localElims))
                      ringChange = true;
                  }

                  const nonRccEndbm =
                    (1 << (endEntryDigit - 1)) | (1 << (closingRcc - 1));
                  if (eliminateNonRcc(alsEnd, nonRccEndbm, localElims))
                    ringChange = true;

                  if (ringChange) {
                    const res = createResult(
                      currentPathSlice,
                      true,
                      localElims,
                      [],
                      closingRcc,
                    );
                    if (!findAll) {
                      found = true;
                      resultToReturn = res;
                      return;
                    } else {
                      results.push(res);
                    }
                  }
                }
              }
            }
          }

          // --- 2. If not a Ring, Check Linear Chain Elimination ---
          if (!isRing) {
            const commonMask = alsStart.candidates & alsEnd.candidates;
            if (commonMask !== 0) {
              const disallow1 = SHARED_PATH_ALS[1].viaDigit; // Exit from start
              const disallow2 = d; // Entry to end

              let localChange = false;
              let foundZs = [];
              let localElims = [];

              // Iterate bits in commonMask
              const zDigits = techniques._bits.maskToDigits(commonMask);
              for (const z of zDigits) {
                if (z === disallow1 || z === disallow2) continue;

                // Check common peers of 'z' in Start and End
                const zPosStart = alsStart.candidatePositions[z - 1];
                const zPosEnd = alsEnd.candidatePositions[z - 1];
                const allZPos = zPosStart | zPosEnd;

                const peerMask = techniques._findCommonPeersBS(allZPos);

                // Capture length before processing to check if new elims added
                const prevLen = localElims.length;
                techniques._processElims(peerMask, z, pencils, localElims);
                if (localElims.length > prevLen) {
                  localChange = true;
                  foundZs.push(z);
                }
              }

              if (localChange) {
                const res = createResult(
                  currentPathSlice,
                  false,
                  localElims,
                  foundZs,
                  null,
                );
                if (!findAll) {
                  found = true;
                  resultToReturn = res;
                  return;
                } else {
                  results.push(res);
                }
              }
            }
          }
        }

        if ((!found || findAll) && len < currentTargetLen) {
          dfs(nextDepth);
        }

        // BACKTRACK: Instantly unset the memory slot
        SHARED_VISITED_ALS[nbrId] = 0;
      }
    };

    // Start DFS from every ALS
    for (
      currentTargetLen = minLen;
      currentTargetLen <= maxLen;
      currentTargetLen++
    ) {
      for (let i = 0; i < _alsCache.length; i++) {
        if (found && !findAll) break;

        const als = _alsCache[i];
        const alsId = hashToId[als.hash];

        // Manually write the root node to depth 0
        SHARED_PATH_ALS[0] = { hash: als.hash, viaDigit: 0 };
        SHARED_VISITED_ALS[alsId] = 1;

        dfs(0); // Trigger DFS passing `0` as the initial depth

        SHARED_VISITED_ALS[alsId] = 0; // Backtrack the root node
      }
      if (found && !findAll) break;
    }

    if (findAll) {
      return results.length > 0 ? results : { change: false };
    } else {
      return resultToReturn;
    }
  },

  _collectAllALSLegacy: (board, pencils, minSize = 1, maxSize = 8) => {
    const uniqueALS = new Map();

    // 1. Scan order: box, row, col
    const unitTypes = [
      { name: "box", label: "Box" },
      { name: "row", label: "Row" },
      { name: "col", label: "Col" },
    ];

    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        const unitCells = techniques._getUnitCells(name, i);

        // Pre-exclude concrete numbers by exclusively grabbing empty cells
        const emptyCells = unitCells.filter(([r, c]) => board[r][c] === 0);
        const n = emptyCells.length;
        if (n === 0) continue;

        const effectiveMaxSize = Math.min(maxSize, n - 1);

        // Pre-evaluate naked subsets to exclude them from generating false ALSes
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
        // Precompute all masks that are supersets of any naked subset (O(1) lookup later)
        const tainted = new Set();
        for (const ns of nakedSubsets) {
          // Enumerate every superset of ns within n bits using the standard bit trick:
          // Starting from ns itself, repeatedly find the next integer that has ns as a subset.
          // Formula: next = (prev + 1) | ns  gives the next superset after prev.
          let sup = ns;
          const limit = 1 << n;
          while (sup < limit) {
            tainted.add(sup);
            sup = (sup + 1) | ns;
          }
        }

        // Search ALS combinations using bitmasks
        for (let mask = 1; mask < 1 << n; mask++) {
          const k = techniques._bits.popcount(mask);
          if (k < minSize || k > effectiveMaxSize) continue;

          if (tainted.has(mask)) continue;

          // Skip confined intersections for row/col (already scanned by box pass)
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

            let positions = 0n;
            const candidatePositions = Array(9).fill(0n);
            const candMap = {};

            for (const [r, c] of currentCells) {
              const cellIndex = BigInt(r * 9 + c);
              const bitId = 1n << cellIndex;
              positions |= bitId;
              for (const d of pencils[r][c]) {
                candidatePositions[d - 1] |= bitId;
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
                unitName: `${label} ${i + 1}`,
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

  wxyzWing: (board, pencils) => {
    // Collect only size-1 and size-3 ALSes, merge them
    const alsesXY = techniques._collectAllALSLegacy(board, pencils, 1, 1);
    _alsCache = [];
    const alsesWXYZ = techniques._collectAllALSLegacy(board, pencils, 3, 3);
    _alsCache = [...alsesXY, ...alsesWXYZ];

    techniques._buildAlsDigitCommonPeers();
    techniques._buildAlsRccMap();

    const sizePairFilter = (a, b) =>
      (a.size === 1 && b.size === 3) || (a.size === 3 && b.size === 1);

    const name = "WXYZ-Wing";
    return techniques._alsChainCore(board, pencils, 2, 2, name, sizePairFilter);
  },

  // --- Global Cache for AIC Graph ---
  _aicCache: {
    AllNodes: [],
    NodeCache: new Map(),
    BivalueOrMap: new Map(),
    BilocationOrMap: new Map(),
    GroupedOrMap: new Map(),
    AlsMap: new Map(),
    FishMap: new Map(),
    AlsLinkRegistry: new Map(),
    FishLinkRegistry: new Map(),
  },

  _resetAICCache: () => {
    techniques._aicCache = {
      AllNodes: [],
      NodeCache: new Map(),
      BivalueOrMap: new Map(),
      BilocationOrMap: new Map(),
      GroupedOrMap: new Map(),
      AlsMap: new Map(),
      FishMap: new Map(),
      AlsLinkRegistry: new Map(),
      FishLinkRegistry: new Map(),
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
    } = config;
    const techniqueName = nameOverride || "Alternating Inference Chain";

    let cache = techniques._aicCache;

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
    if (singleDigit || (!singleDigit && !bivalueOnly && !useAlsXZ)) {
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
        cache.GroupedOrMap = techniques.buildGroupedOrMap(pencils, (cells, d) =>
          getNode(cells, [d]),
        );
      }
      aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.GroupedOrMap);
    }

    let activeAlsLinkRegistry = cache.AlsLinkRegistry;
    if (useAls) {
      if (cache.AlsMap.size === 0) {
        cache.AlsMap = techniques.buildAlsOrMap(
          board,
          pencils,
          (cells, d) => getNode(cells, [d]),
          cache.AlsLinkRegistry,
          false,
        );
      }
      aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.AlsMap);
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

    const baseOrMap = new Map();
    allNodes.forEach((n) => baseOrMap.set(n, new Set(aicOrMap.get(n))));

    const interestedNodes = allNodes.filter(
      (n) => aicOrMap.has(n) && aicOrMap.get(n).size > 0,
    );

    interestedNodes.forEach((node, idx) => {
      node.index = idx;

      // Keep Sets for fast overlap/intersection checks
      node.OrNodes = new Set(aicOrMap.get(node));
      node.OrNandNodes = new Set();
      node.NandNodes = new Set();

      // New: Maps for path origin memoization
      node.OrNodesMap = new Map();
      for (const target of node.OrNodes) {
        node.OrNodesMap.set(target, { source: node }); // Reached directly
      }
      node.OrNandNodesMap = new Map();
    });

    for (const A of interestedNodes) {
      for (const B of interestedNodes) {
        if (A !== B) {
          if (singleDigit && A.digits[0] !== B.digits[0]) continue;
          if (bivalueOnly && A.digits[0] !== B.digits[0]) continue;

          if (techniques.isBitsetSubset(B.NodeBitset, A.NandBitset)) {
            A.NandNodes.add(B);
          }
        }
      }
    }

    let maxCycles = maxCycle;

    const stringifiedFoundRemovals = new Set();
    const deadRings = new Set();

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

    const buildBacktrackPath = (start, end, isOrNodeMap) => {
      // The greedy start === end check is removed so cycles can resolve

      if (isOrNodeMap) {
        const memo = start.OrNodesMap.get(end);
        if (!memo) return null;
        if (memo.source) return [start, end];

        if (memo.viaNand) {
          const C = memo.viaNand;
          const leftPath = buildBacktrackPath(start, C, false);
          const rightPath = buildBacktrackPath(C, end, true);
          if (!leftPath || !rightPath) return null;
          return [...leftPath, ...rightPath.slice(1)];
        }
      } else {
        const memo = start.OrNandNodesMap.get(end);
        if (!memo) return null;

        if (memo.viaOr) {
          const B = memo.viaOr;
          const leftPath = buildBacktrackPath(start, B, true);
          if (!leftPath) return null;
          return [...leftPath, end];
        }
      }
      return null;
    };

    const findAICPath = (startNode, endNode, maxNodes) => {
      // 1. Fast Path: Backtrack using memoized origins
      const fastPath = buildBacktrackPath(startNode, endNode, true);

      if (fastPath && fastPath.length <= maxNodes && fastPath.length > 1) {
        let isSimplePath = true;
        const seen = new Set();

        for (let i = 0; i < fastPath.length; i++) {
          const n = fastPath[i];
          if (seen.has(n)) {
            // A duplicate is ONLY allowed if it is exactly closing the loop at the end
            if (
              i === fastPath.length - 1 &&
              n === startNode &&
              startNode === endNode
            ) {
              // Valid loop closure
            } else {
              isSimplePath = false;
              break;
            }
          }
          seen.add(n);
        }

        if (isSimplePath) return fastPath;
      }

      // 2. Fallback: Standard BFS
      const queue = [{ node: startNode, isNextOr: true, path: [startNode] }];
      while (queue.length > 0) {
        const { node, isNextOr, path } = queue.shift();

        if (node === endNode && path.length > 1) {
          if (!isNextOr) return path;
          continue;
        }

        if (path.length > maxNodes) continue;

        if (isNextOr) {
          const nextNodes = baseOrMap.get(node) || new Set();
          for (const nxt of nextNodes) {
            const prev = path.length >= 2 ? path[path.length - 2] : null;
            if (nxt !== prev && (!path.includes(nxt) || nxt === endNode)) {
              queue.push({ node: nxt, isNextOr: false, path: [...path, nxt] });
            }
          }
        } else {
          const nextNodes = node.NandNodes;
          for (const nxt of nextNodes) {
            const prev = path.length >= 2 ? path[path.length - 2] : null;
            if (nxt !== prev && (!path.includes(nxt) || nxt === endNode)) {
              queue.push({ node: nxt, isNextOr: true, path: [...path, nxt] });
            }
          }
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

      if (preferBox || boxes.length === 1) {
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
          const preferBox = als.unitName && als.unitName.startsWith("Box");
          orGateStr = `(${u.digits[0]}=${v.digits[0]})${getLoc(alsIds, preferBox)}`;
          lastDigit = v.digits[0];
        } else if (fish) {
          orGateStr = `(${fish.d})(${getLoc(u.cells)}=${getLoc(v.cells)})(${fish.basesStr}\\${fish.coversStr})`;
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
          orGateStr = `${prefix}${getLoc(u.cells)}=${getLoc(v.cells)}`;
          lastDigit = d;
        }

        if (i === 0) str += orGateStr;
        else str += "-" + orGateStr;
      }

      if (isRing) str += "-";
      return str;
    };

    const buildResult = (removals, name, path, isRing = false) => {
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
        hint: {
          name: name,
          mainInfo: `Start with ${eurekaStr.split("-")[0]}`,
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
            boardState[el.r][el.c].pencilColors.set(
              el.num,
              candidateColorPalette[0],
            );
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
            const getFlatIds = (cells) => {
              if (!cells) return [];
              return cells.map((cell) =>
                Array.isArray(cell) ? cell[0] * 9 + cell[1] : cell,
              );
            };

            const drawFishGroup = (cells, digit, colorIdx) => {
              const flatIds = getFlatIds(cells);
              if (flatIds.length > 1) {
                for (let i = 0; i < flatIds.length - 1; i++) {
                  const r1 = Math.floor(flatIds[i] / 9),
                    c1 = flatIds[i] % 9;
                  const r2 = Math.floor(flatIds[i + 1] / 9),
                    c2 = flatIds[i + 1] % 9;
                  drawnLines.push({
                    r1,
                    c1,
                    n1: digit,
                    r2,
                    c2,
                    n2: digit,
                    color: lineColorPalette[colorIdx],
                    style: "solid",
                  });
                }
              }
            };

            usedFishes.forEach((fish) => {
              colorCount++;
              const fishColor = colorCodes[colorCount % 8];

              const flatAllCells = getFlatIds(fish.allCells);
              flatAllCells.forEach((id) => {
                const r = Math.floor(id / 9);
                const c = id % 9;
                if (boardState[r][c].pencils.has(fish.d)) {
                  if (window.addCellColor)
                    window.addCellColor(r, c, cellColorPalette[fishColor]);
                  else
                    boardState[r][c].cellColor =
                      candidateColorPalette[fishColor];

                  if (window.addCandidateColor)
                    window.addCandidateColor(
                      r,
                      c,
                      fish.d,
                      candidateColorPalette[fishColor],
                    );
                  else
                    boardState[r][c].pencilColors.set(
                      fish.d,
                      candidateColorPalette[fishColor],
                    );
                }
              });

              const finCells = fish.fins || fish.finCells;
              if (finCells) {
                drawFishGroup(finCells, fish.d, fishColor);
              }
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
      const nextOrNandNodesMap = new Map();
      const nextOrNandOrigins = new Map();

      // Expand NAND links
      for (const A of interestedNodes) {
        const pendingOrNand = new Set(A.OrNandNodes);
        const pendingOrNandOrigin = new Map(A.OrNandNodesMap);

        for (const B of A.OrNodes) {
          for (const C of B.NandNodes) {
            if (!pendingOrNand.has(C)) {
              pendingOrNand.add(C);
              pendingOrNandOrigin.set(C, { viaOr: B }); // Memoize origin
            }
          }
        }
        nextOrNandNodesMap.set(A, pendingOrNand);
        nextOrNandOrigins.set(A, pendingOrNandOrigin);
      }

      for (const A of interestedNodes) {
        A.OrNandNodes = nextOrNandNodesMap.get(A);
        A.OrNandNodesMap = nextOrNandOrigins.get(A);
      }

      const nextOrNodesMap = new Map();
      const nextOrOrigins = new Map();

      // Expand OR links
      for (const A of interestedNodes) {
        const pendingOr = new Set(A.OrNodes);
        const pendingOrOrigin = new Map(A.OrNodesMap);

        for (const C of A.OrNandNodes) {
          for (const D of C.OrNodes) {
            if (!pendingOr.has(D)) {
              pendingOr.add(D);
              pendingOrOrigin.set(D, { viaNand: C }); // Memoize origin
            }
          }
        }
        nextOrNodesMap.set(A, pendingOr);
        nextOrOrigins.set(A, pendingOrOrigin);
      }

      for (const A of interestedNodes) {
        A.OrNodes = nextOrNodesMap.get(A);
        A.OrNodesMap = nextOrOrigins.get(A);
      }

      // Priority 1: AIC Ring
      for (const A of interestedNodes) {
        for (const D of A.OrNodes) {
          if (D.index <= A.index || !A.NandNodes.has(D)) continue;
          if (deadRings.has(`${A.index}_${D.index}`)) continue;

          const maxPathLen = Math.pow(2, cycle + 1) * 2;
          const path = findAICPath(A, D, maxPathLen);

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
              ringRemovals = ringRemovals.filter(
                (v, i, a) =>
                  a.findIndex(
                    (t) => t.r === v.r && t.c === v.c && t.num === v.num,
                  ) === i,
              );
              const removalsKey = JSON.stringify(
                ringRemovals.sort(
                  (a, b) => a.r - b.r || a.c - b.c || a.num - b.num,
                ),
              );

              if (!stringifiedFoundRemovals.has(removalsKey)) {
                stringifiedFoundRemovals.add(removalsKey);
                const ringName = (techniqueName || "AIC").includes("Chain")
                  ? (techniqueName || "AIC").replace("Chain", "Ring")
                  : useAlsXZ
                    ? "Doubly linked " + (techniqueName || "AIC")
                    : (techniqueName || "AIC") + " Ring";
                const res = buildResult(ringRemovals, ringName, path, true);
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

      // Priority 2: DN Loop

      for (const A of interestedNodes) {
        for (const D of A.OrNodes) {
          if (D.index === A.index) {
            let dnRemovals = extractRemovals(A.NandBitset);
            if (dnRemovals.length > 0) {
              const removalsKey = JSON.stringify(
                dnRemovals.sort(
                  (a, b) => a.r - b.r || a.c - b.c || a.num - b.num,
                ),
              );
              if (!stringifiedFoundRemovals.has(removalsKey)) {
                stringifiedFoundRemovals.add(removalsKey);

                const maxPathLen = Math.pow(2, cycle + 1) * 2;
                const path = findAICPath(A, D, maxPathLen);

                const DNLName = (techniqueName || "Chain").includes("Chain")
                  ? (techniqueName || "Chain").replace("Chain", "DN Loop")
                  : (techniqueName || "AIC").includes("AIC")
                    ? (techniqueName || "AIC").replace("AIC", "DN Loop")
                    : "DN Loop";

                if (path) {
                  const res = buildResult(dnRemovals, DNLName, path, false);
                  if (!findAll) return res;
                  results.push(res);
                }
              }
            }
          }
        }
      }

      if (results.length > 0 && !findAll) return results[0];

      // Priority 3: Standard AIC
      for (const A of interestedNodes) {
        for (const D of A.OrNodes) {
          if (D.index <= A.index) continue;
          if (deadRings.has(`${A.index}_${D.index}`)) continue;

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
                stringifiedFoundRemovals.add(removalsKey);

                const maxPathLen = Math.pow(2, cycle + 1) * 2;
                const path = findAICPath(A, D, maxPathLen);

                if (path) {
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
        nameOverride: "X-Chain",
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
        nameOverride: "Grouped X-Chain",
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
        nameOverride: "XY-Chain",
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
        nameOverride: "Grouped AIC",
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
        nameOverride: "Almost Locked Set XZ-Rule",
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
        nameOverride: "Almost Locked Set AIC",
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
        nameOverride: "Complex AIC",
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
      { name: "box", label: "Box" },
      { name: "row", label: "Row" },
      { name: "col", label: "Col" },
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
                unitName: `${label} ${i + 1}`,
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

  _deathBlossomCore: (board, pencils, isRegion, findAll = false) => {
    const results = [];
    const cache = techniques._aicCache;

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
      if (preferBox || boxes.length === 1) {
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

    if (!isRegion) {
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
    } else {
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
              houseName: `r${r + 1}`,
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
              houseName: `c${c + 1}`,
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
              houseName: `b${b + 1}`,
            });
        }
      }
    }

    // Sort stems so cells/regions with fewer candidates are processed first
    potentialStems.sort((a, b) => a.size - b.size);

    // 3. Iterate through sorted stem cells/regions
    for (const stem of potentialStems) {
      const startNodes = !isRegion
        ? stem.startDigits.map((d) => getNode([stem.cellId], [d]))
        : stem.cells.map((cId) => getNode([cId], [stem.digit]));

      const reachMap = new Map();

      // 4. Collect NandNodes and NandOrNodes
      for (const s of startNodes) {
        const reachable = [{ node: s, path: [s] }];

        // Evaluate NandNodes via NandBitset
        const nandNodes = allNodes.filter((n) => {
          if (n === s) return false;

          // Exclude different digit of its cell (Applies to both Cell and Region)
          if (n.cells.length === 1 && n.cells[0] === s.cells[0]) return false;

          // Exclude the digit from the different cell of the stem house (Applies to Region only)
          if (
            isRegion &&
            n.digits.length === 1 &&
            n.digits[0] === stem.digit &&
            n.cells.length === 1 &&
            stem.cells.includes(n.cells[0])
          )
            return false;

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
      const elims = [];
      for (let d = 0; d < 9; d++) {
        for (let p = 0; p < 3; p++) {
          let m = commonMask[d][p];
          let bitPos = 0;
          while (m > 0) {
            if (m & 1) {
              const id = p * 27 + bitPos;
              const er = Math.floor(id / 9);
              const ec = id % 9;
              const num = d + 1;

              // Ensure it's not the stem itself
              let isStemCandidate = false;
              if (!isRegion) {
                if (er === stem.r && ec === stem.c) isStemCandidate = true;
              } else {
                if (num === stem.digit && stem.cells.includes(id))
                  isStemCandidate = true;
              }

              if (
                pencils[er][ec] &&
                pencils[er][ec].has(num) &&
                !isStemCandidate
              ) {
                elims.push({ r: er, c: ec, num });
              }
            }
            m >>>= 1;
            bitPos++;
          }
        }
      }

      if (elims.length > 0) {
        const target = elims[0];
        const targetDigit = target.num;
        const targetId = target.r * 9 + target.c;
        const targetPart = Math.floor(targetId / 27);
        const targetBit = targetId % 27;

        const chosenPaths = [];
        for (const s of startNodes) {
          const reachList = reachMap.get(s);
          const validReach = reachList.find((rObj) => {
            return (
              (rObj.node.NandBitset[targetDigit - 1][targetPart] &
                (1 << targetBit)) !==
              0
            );
          });
          if (validReach) chosenPaths.push(validReach.path);
        }

        const chainStrs = chosenPaths.map((path) => {
          const startNode = path[0];
          let str = `(${startNode.digits[0]})r${Math.floor(startNode.cells[0] / 9) + 1}c${(startNode.cells[0] % 9) + 1}`;
          if (path.length === 3) {
            const n = path[1];
            const o = path[2];
            const als = alsLinkRegistry.get(n)?.get(o);

            if (als) {
              const preferBox = als.unitName && als.unitName.startsWith("Box");
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

        const blossomName = isRegion
          ? "Region Death Blossom"
          : "Cell Death Blossom";
        const mainInfoStr = isRegion
          ? `Stem (${stem.digit}) in ${stem.houseName}`
          : `Stem at r${stem.r + 1}c${stem.c + 1}`;

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

            chosenPaths.forEach((path, branchIdx) => {
              const branchColor = [6, 7, 2, 3, 4, 8][branchIdx % 6]; // Unique color per stem candidate chain

              if (path.length === 3) {
                const u = path[0]; // Stem candidate
                const v = path[1]; // NAND node
                const w = path[2]; // OR node

                // 1. Color stem cell candidate matching the branch color
                if (!isRegion) {
                  boardState[stem.r][stem.c].pencilColors.set(
                    u.digits[0],
                    candidateColorPalette[branchColor],
                  );
                } else {
                  const ur = Math.floor(u.cells[0] / 9),
                    uc = u.cells[0] % 9;
                  boardState[ur][uc].pencilColors.set(
                    stem.digit,
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
              boardState[el.r][el.c].pencilColors.set(
                el.num,
                candidateColorPalette[0],
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

  cellDeathBlossom: (board, pencils, findAll = false) => {
    return techniques._deathBlossomCore(board, pencils, false, findAll);
  },

  regionDeathBlossom: (board, pencils, findAll = false) => {
    return techniques._deathBlossomCore(board, pencils, true, findAll);
  },

  _complexFishCore: (board, pencils, fishSize, isMutant, findAll = false) => {
    let results = [];
    // Constants for Unit Types
    const U_ROW = 0,
      U_COL = 1,
      U_BOX = 2;

    // Helper to build a BigInt mask for a specific unit
    const getUnitMask = (type, index) => {
      let mask = 0n;
      if (type === U_ROW) {
        for (let c = 0; c < 9; c++) mask |= 1n << BigInt(index * 9 + c);
      } else if (type === U_COL) {
        for (let r = 0; r < 9; r++) mask |= 1n << BigInt(r * 9 + index);
      } else {
        // U_BOX
        const br = Math.floor(index / 3) * 3;
        const bc = (index % 3) * 3;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 9; c++) {
            // Fix: Inner loop should be 3, logic below is safer
            const cellId = (br + r) * 9 + (bc + (c % 3));
            if (c < 3) mask |= 1n << BigInt(cellId);
          }
        }
        // Safer explicit loop for box
        mask = 0n;
        const cellIds = techniques
          ._getUnitCells("box", index)
          .map((c) => c[0] * 9 + c[1]);
        for (const id of cellIds) mask |= 1n << BigInt(id);
      }
      return mask;
    };

    // Helper: Unsolved unit count (heuristic pruning)
    const getUnsolvedUnitCount = (d) => {
      let needed = 0;
      for (let r = 0; r < 9; r++) {
        let solvedOrGiven = false;
        for (let c = 0; c < 9; c++) {
          if (board[r][c] === d) {
            solvedOrGiven = true;
            break;
          }
        }
        if (!solvedOrGiven) needed++;
      }
      return needed;
    };

    // Define search configurations
    const toCheck = [];
    if (isMutant) {
      toCheck.push({
        base: [U_ROW, U_COL, U_BOX],
        cover: [U_ROW, U_COL, U_BOX],
      });
    } else {
      toCheck.push({ base: [U_ROW, U_BOX], cover: [U_COL, U_BOX] });
      toCheck.push({ base: [U_COL, U_BOX], cover: [U_ROW, U_BOX] });
    }

    // Iterate digits 1-9
    for (let num = 1; num <= 9; num++) {
      // 1. Build Candidate Bitset for this digit
      let cb = 0n;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (pencils[r][c].has(num)) {
            cb |= 1n << BigInt(r * 9 + c);
          }
        }
      }

      if (cb === 0n) continue;

      // Memoization check (using string representation of BigInt)
      const memoKey = cb.toString();
      const memoSet = isMutant
        ? _memoComplexFish.mutant
        : _memoComplexFish.franken;
      if (memoSet.has(memoKey)) continue;

      if (getUnsolvedUnitCount(num) < fishSize * 2) continue;

      // --- TEMPLATING STEP (Optimization) ---
      // Determine which cells are "impossible" based on row distribution patterns
      // This prunes the search space significantly.

      const rowToInds = Array.from({ length: 9 }, () => []);
      const rowsWith = [];
      const rowMasks = Array.from({ length: 9 }, (_, r) =>
        getUnitMask(U_ROW, r),
      );

      for (let r = 0; r < 9; r++) {
        const inter = cb & rowMasks[r];
        if (inter !== 0n) {
          // Extract indices from BigInt
          let m = inter;
          let idx = 0;
          while (m !== 0n) {
            if (m & 1n) rowToInds[r].push(idx);
            m >>= 1n;
            idx++;
          }
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

      // DFS to find valid patterns including a starting cell index (i0)
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

      let possibleCellsMask = 0n;
      let impossibleCellsMask = 0n;

      // Scan all set bits in cb
      let m = cb;
      let idx = 0;
      while (m !== 0n) {
        if (m & 1n) {
          if (!((possibleCellsMask >> BigInt(idx)) & 1n)) {
            const sel = findPatternIncluding(idx);
            if (sel.length === 0) {
              impossibleCellsMask |= 1n << BigInt(idx);
            } else {
              for (const j of sel) possibleCellsMask |= 1n << BigInt(j);
            }
          }
        }
        m >>= 1n;
        idx++;
      }

      if (impossibleCellsMask === 0n) {
        memoSet.add(memoKey);
        continue; // No constraints found, skip
      }

      // --- FISH CORE (Optimized for Triples) ---
      let changed = false;

      // 1. Gather and Sort all valid units for this digit
      let allUnits = [];
      for (let r = 0; r < 9; r++) {
        const mask = getUnitMask(U_ROW, r) & cb;
        if (mask !== 0n)
          allUnits.push({
            type: U_ROW,
            index: r,
            mask,
            count: techniques._bits.popcount(mask),
          });
      }
      for (let c = 0; c < 9; c++) {
        const mask = getUnitMask(U_COL, c) & cb;
        if (mask !== 0n)
          allUnits.push({
            type: U_COL,
            index: c,
            mask,
            count: techniques._bits.popcount(mask),
          });
      }
      for (let b = 0; b < 9; b++) {
        const mask = getUnitMask(U_BOX, b) & cb;
        if (mask !== 0n)
          allUnits.push({
            type: U_BOX,
            index: b,
            mask,
            count: techniques._bits.popcount(mask),
          });
      }

      // Sort by size (count) to check more constrained units first
      allUnits.sort((a, b) => a.count - b.count);

      // 2. Iterate Search Configurations
      for (const { base: baseTypes, cover: coverTypes } of toCheck) {
        if (changed) break;

        // Filter units for Base and Cover
        const baseUnits = allUnits.filter((u) => baseTypes.includes(u.type));
        const coverUnits = allUnits.filter((u) => coverTypes.includes(u.type));

        const B = baseUnits.length;
        if (B < 3) continue;

        // Base Triple Loop
        for (let ia = 0; ia < B - 2 && (!changed || findAll); ia++) {
          for (let ib = ia + 1; ib < B - 1 && (!changed || findAll); ib++) {
            for (let ic = ib + 1; ic < B && (!changed || findAll); ic++) {
              const baseMask =
                baseUnits[ia].mask | baseUnits[ib].mask | baseUnits[ic].mask;

              // Optimization: Check if impossible cells are fully covered by base
              // "impossible_outside_base" means cells that MUST be part of a pattern but aren't in our base.
              // If there are impossible cells *outside* our base, this base is invalid.
              const impossibleOutsideBase = impossibleCellsMask & ~baseMask;
              if (impossibleOutsideBase === 0n) continue;

              // Filter Cover Units (must overlap with base)
              const finalCoverUnits = coverUnits.filter(
                (cu) => (cu.mask & baseMask) !== 0n,
              );

              // Optimization: Check if remaining cover units can cover the impossible cells
              let coverUnion = 0n;
              for (const cu of finalCoverUnits) coverUnion |= cu.mask;
              if ((coverUnion & impossibleOutsideBase) === 0n) continue;

              // Check Endofins (Overlaps within base units)
              let endoMask =
                (baseUnits[ia].mask & baseUnits[ib].mask) |
                (baseUnits[ia].mask & baseUnits[ic].mask) |
                (baseUnits[ib].mask & baseUnits[ic].mask);
              let countedEndo = endoMask & baseMask;
              if (techniques._bits.popcount(countedEndo) > 2) continue;

              const C = finalCoverUnits.length;

              // Cover Triple Loop
              for (let ca = 0; ca < C - 2 && (!changed || findAll); ca++) {
                for (
                  let cbx = ca + 1;
                  cbx < C - 1 && (!changed || findAll);
                  cbx++
                ) {
                  for (
                    let cc = cbx + 1;
                    cc < C && (!changed || findAll);
                    cc++
                  ) {
                    const coverMask =
                      finalCoverUnits[ca].mask |
                      finalCoverUnits[cbx].mask |
                      finalCoverUnits[cc].mask;

                    // Must cover all impossible cells outside base
                    if ((coverMask & impossibleOutsideBase) === 0n) continue;

                    // Type Constraints (Logic directly from C++)
                    let baseTypeMask =
                      (1 << baseUnits[ia].type) |
                      (1 << baseUnits[ib].type) |
                      (1 << baseUnits[ic].type);
                    let coverTypeMask =
                      (1 << finalCoverUnits[ca].type) |
                      (1 << finalCoverUnits[cbx].type) |
                      (1 << finalCoverUnits[cc].type);

                    if (
                      baseTypeMask === 1 << U_ROW &&
                      coverTypeMask === 1 << U_COL
                    )
                      continue;
                    if (
                      baseTypeMask === 1 << U_COL &&
                      coverTypeMask === 1 << U_ROW
                    )
                      continue;
                    if (isMutant) {
                      if (
                        baseTypeMask === ((1 << U_ROW) | (1 << U_BOX)) &&
                        coverTypeMask === ((1 << U_COL) | (1 << U_BOX))
                      )
                        continue;
                      if (
                        baseTypeMask === ((1 << U_COL) | (1 << U_BOX)) &&
                        coverTypeMask === ((1 << U_ROW) | (1 << U_BOX))
                      )
                        continue;
                    }

                    // Fins Calculation
                    // Exo-fins: Candidates in Base but NOT in Cover
                    const exoFinsMask = baseMask & ~coverMask;
                    if (techniques._bits.popcount(exoFinsMask) > 4) continue;

                    const allFinsMask = exoFinsMask | countedEndo;
                    if (techniques._bits.popcount(allFinsMask) > 5) continue;

                    // Possible Eliminations: Candidates in Cover AND Digit, but NOT in Base
                    const possibleElimsMask = coverMask & cb & ~baseMask;
                    if (possibleElimsMask === 0n) continue;

                    let toEliminateMask = 0n;

                    if (allFinsMask === 0n) {
                      // Basic Fish (No fins)
                      toEliminateMask = possibleElimsMask;
                    } else {
                      // Finned Fish: Eliminations must see ALL fins
                      let commonVis = ~0n;

                      let mF = allFinsMask;
                      let idxF = 0;
                      let hasFins = false;
                      while (mF !== 0n) {
                        if (mF & 1n) {
                          hasFins = true;
                          // This peer map look up might be slow if done bit-by-bit,
                          // but fins count is low (<= 5).
                          const rF = Math.floor(idxF / 9);
                          const cF = idxF % 9;
                          // Note: We need a peer mask for (rF, cF).
                          // Assuming techniques._getPeerMask exists or we use existing helpers
                          // Fallback: Manually constructing or using PEER_MAP if available globally
                          // Re-using _findCommonPeersBS logic implies access to PEER_MAP
                          if (typeof PEER_MAP !== "undefined") {
                            commonVis &= PEER_MAP[idxF];
                          } else {
                            // Fallback if PEER_MAP not directly available in this scope (should act as peers[k])
                            // This part relies on integration with your existing peer structure
                            // Assuming global PEER_MAP or techniques._peers
                            commonVis &= techniques._peers
                              ? techniques._peers[idxF]
                              : 0n; // Placeholder
                          }
                        }
                        mF >>= 1n;
                        idxF++;
                      }

                      if (!hasFins || commonVis === 0n) continue;
                      toEliminateMask = possibleElimsMask & commonVis;
                    }

                    if (toEliminateMask === 0n) continue;

                    // Process Eliminations
                    const elims = [];
                    let mE = toEliminateMask;
                    let idxE = 0;
                    while (mE !== 0n) {
                      if (mE & 1n) {
                        const rr = Math.floor(idxE / 9);
                        const cc2 = idxE % 9;
                        if (pencils[rr][cc2].has(num)) {
                          elims.push({ r: rr, c: cc2, num: num });
                          changed = true;
                        }
                      }
                      mE >>= 1n;
                      idxE++;
                    }

                    if (elims.length > 0) {
                      const isFinned = allFinsMask !== 0n;
                      let fishName = isMutant
                        ? "Mutant Swordfish"
                        : "Franken Swordfish";
                      if (isFinned) fishName = "Finned " + fishName;

                      // --- Formatting Helpers ---
                      const formatUnits = (units) => {
                        let r = [],
                          c = [],
                          b = [];
                        units.forEach((u) => {
                          if (u.type === U_ROW) r.push(u.index + 1);
                          else if (u.type === U_COL) c.push(u.index + 1);
                          else if (u.type === U_BOX) b.push(u.index + 1);
                        });
                        let str = "";
                        if (r.length > 0)
                          str += "r" + r.sort((x, y) => x - y).join("");
                        if (c.length > 0)
                          str += "c" + c.sort((x, y) => x - y).join("");
                        if (b.length > 0)
                          str += "b" + b.sort((x, y) => x - y).join("");
                        return str;
                      };

                      const formatFins = (mask) => {
                        let fins = [];
                        let m = mask;
                        let i = 0;
                        while (m !== 0n) {
                          if (m & 1n)
                            fins.push(
                              `r${Math.floor(i / 9) + 1}c${(i % 9) + 1}`,
                            );
                          m >>= 1n;
                          i++;
                        }
                        return fins.join(",");
                      };

                      // --- Build Detail String ---
                      const baseStr = formatUnits([
                        baseUnits[ia],
                        baseUnits[ib],
                        baseUnits[ic],
                      ]);
                      const coverStr = formatUnits([
                        finalCoverUnits[ca],
                        finalCoverUnits[cbx],
                        finalCoverUnits[cc],
                      ]);
                      let detailStr = `Digit (${num}), Base ${baseStr}, Cover ${coverStr}`;

                      if (isFinned) {
                        detailStr += `, Fin ${formatFins(allFinsMask)}`;
                      }

                      const resultObj = {
                        change: true,
                        type: "remove",
                        cells: elims,
                        hint: {
                          name: fishName,
                          mainInfo: `Digit (${num})`,
                          detail: detailStr,
                        },
                        applyVisuals: () => {
                          highlightedDigit = num;
                          highlightState = 1;

                          const uTypeToName = (t) =>
                            t === U_ROW ? "row" : t === U_COL ? "col" : "box";

                          // Color Base Units over Cover Units (Color 7)
                          [baseUnits[ia], baseUnits[ib], baseUnits[ic]].forEach(
                            (u) => {
                              techniques
                                ._getUnitCells(uTypeToName(u.type), u.index)
                                .forEach(([cr, cc]) => {
                                  window.addCellColor(
                                    cr,
                                    cc,
                                    cellColorPalette[6],
                                  );

                                  // FIX: Use boardState.pencils instead of local pencils
                                  if (boardState[cr][cc].pencils.has(num)) {
                                    boardState[cr][cc].pencilColors.set(
                                      num,
                                      candidateColorPalette[6],
                                    ); // Candidate Color 7
                                  }
                                });
                            },
                          );

                          // Color Cover Units (Color 8)
                          [
                            finalCoverUnits[ca],
                            finalCoverUnits[cbx],
                            finalCoverUnits[cc],
                          ].forEach((u) => {
                            techniques
                              ._getUnitCells(uTypeToName(u.type), u.index)
                              .forEach(([cr, cc]) => {
                                window.addCellColor(
                                  cr,
                                  cc,
                                  cellColorPalette[7],
                                );
                              });
                          });

                          // Color Fins over Base/Cover
                          let mF = allFinsMask; // BigInt mask for all fins
                          let idxF = 0;
                          while (mF !== 0n) {
                            if (mF & 1n) {
                              window.addCellColor(
                                Math.floor(idxF / 9),
                                idxF % 9,
                                cellColorPalette[5],
                              );
                            }
                            mF >>= 1n;
                            idxF++;
                          }

                          // Color Eliminations (Color 1)
                          elims.forEach((el) =>
                            boardState[el.r][el.c].pencilColors.set(
                              el.num,
                              candidateColorPalette[0],
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
      } // End Base Loops

      if (changed && !findAll) break;
      memoSet.add(memoKey); // Cache processed result
    }

    return findAll ? results : { change: false };
  },

  finnedFrankenSwordfish: (board, pencils, findAll = false) => {
    return techniques._complexFishCore(board, pencils, 3, false, findAll);
  },

  finnedMutantSwordfish: (board, pencils, findAll = false) => {
    return techniques._complexFishCore(board, pencils, 3, true, findAll);
  },
};
