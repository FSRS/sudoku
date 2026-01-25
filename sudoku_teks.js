// --- ALS Cache Structure ---
let _alsCache = [];
let _alsDigitCommonPeers = {};
let _alsRccMap = {};
let _alsLookup = {};
let _memoComplexFish = {
  franken: new Set(),
  mutant: new Set(),
};

const techniques = {
  _getBoxIndex: (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3),

  _cellToId: (r, c) => r * 9 + c,
  _idToCell: (id) => [Math.floor(id / 9), id % 9],

  _sees: (cell1, cell2) => {
    const id1 = cell1[0] * 9 + cell1[1];
    const id2 = cell2[0] * 9 + cell2[1];
    // Check if the bit for id2 is enabled in id1's peer mask using Bitwise AND
    return (PEER_MAP[id1] & CELL_MASK[id2]) !== 0n;
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
    while (true) {
      yield indices.map((i) => arr[i]);
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

  eliminateCandidates: (board, pencils) => {
    const removals = [];
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
      const uniqueRemovals = Array.from(
        new Set(removals.map(JSON.stringify)),
      ).map(JSON.parse);
      return {
        change: true,
        type: "remove",
        cells: uniqueRemovals,
        hint: {
          name: "Eliminate Candidates",
          mainInfo: `at r${newpr + 1}c${newpc + 1}`,
        },
      };
    }
    return { change: false };
  },

  fullHouse: (board, pencils) => {
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
        return techniques._resolveFullHouse(
          r,
          emptyCol,
          solvedMask,
          `Row ${r + 1}`,
        );
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
        return techniques._resolveFullHouse(
          emptyRow,
          c,
          solvedMask,
          `Col ${c + 1}`,
        );
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
        return techniques._resolveFullHouse(
          emptyCell.r,
          emptyCell.c,
          solvedMask,
          `Box ${b + 1}`,
        );
      }
    }

    return { change: false };
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
    return {
      change: true,
      type: "place",
      r: r,
      c: c,
      num: missingNum,
      hint: {
        name: "Full House",
        mainInfo: unitName,
      },
    };
  },

  nakedSingle: (board, pencils) => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0 && pencils[r][c].size === 1) {
          const num = pencils[r][c].values().next().value;
          return {
            change: true,
            type: "place",
            r,
            c,
            num,
            hint: {
              name: "Naked Single",
              mainInfo: `at r${r + 1}c${c + 1}`,
            },
          };
        }
      }
    }
    return { change: false };
  },

  hiddenSingle: (board, pencils) => {
    // 1. Define types with the display name you want
    const unitTypes = [
      { name: "row", label: "Row" },
      { name: "col", label: "Col" },
      { name: "box", label: "Box" },
    ];

    // 2. Iterate through types, then indices (0-8)
    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        // Get the specific unit (e.g., Row 0)
        const unit = techniques._getUnitCells(name, i);

        // --- EXISTING LOGIC STARTS HERE ---
        for (let num = 1; num <= 9; num++) {
          const possibleCells = [];
          for (const [r, c] of unit) {
            if (board[r][c] === 0 && pencils[r][c].has(num)) {
              possibleCells.push([r, c]);
            }
          }

          if (possibleCells.length === 1) {
            const [r, c] = possibleCells[0];

            return {
              change: true,
              type: "place",
              r,
              c,
              num,
              hint: {
                name: "Hidden Single",
                // 3. Use 'label' and 'i' directly
                mainInfo: `${label} ${i + 1}`,
              },
            };
          }
        }
        // --- EXISTING LOGIC ENDS HERE ---
      }
    }
    return { change: false };
  },

  lockedSubset: (board, pencils, size) => {
    // This technique finds subsets of candidates that are locked within the
    // intersection of a box and a line (row or column).
    // It's a combination of "Pointing" (eliminating from the line outside the box)
    // and "Naked Subset" (eliminating from the box outside the line).

    // Iterate through each of the 9 boxes
    for (let b = 0; b < 9; b++) {
      const box_r_start = Math.floor(b / 3) * 3;
      const box_c_start = (b % 3) * 3;

      // --- Part 1: Check Intersections with ROWS ---
      for (
        let r_intersect = box_r_start;
        r_intersect < box_r_start + 3;
        r_intersect++
      ) {
        // Find potential cells for a subset within this intersection
        const potential_cells = [];
        for (let c = box_c_start; c < box_c_start + 3; c++) {
          if (
            board[r_intersect][c] === 0 &&
            pencils[r_intersect][c].size <= size &&
            pencils[r_intersect][c].size > 1
          ) {
            potential_cells.push([r_intersect, c]);
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

            // A) Eliminate from other cells in the ROW (outside this box). This is a "Pointing" move.
            for (let c_peer = 0; c_peer < 9; c_peer++) {
              if (c_peer >= box_c_start && c_peer < box_c_start + 3) continue; // Skip cells inside the box
              if (board[r_intersect][c_peer] === 0) {
                for (const num of union) {
                  if (pencils[r_intersect][c_peer].has(num)) {
                    removals.push({ r: r_intersect, c: c_peer, num });
                  }
                }
              }
            }

            // B) Eliminate from other cells in the BOX (outside this row). This is a "Naked Subset" move within the box.
            for (let r_peer = box_r_start; r_peer < box_r_start + 3; r_peer++) {
              if (r_peer === r_intersect) continue; // Skip the intersection row itself
              for (
                let c_peer = box_c_start;
                c_peer < box_c_start + 3;
                c_peer++
              ) {
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
              return {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: size === 2 ? "Locked Pair" : "Locked Triple",
                  mainInfo: `Intersection of Row ${r_intersect + 1} and Box ${
                    b + 1
                  }`,
                },
              };
            }
          }
        }
      }

      // --- Part 2: Check Intersections with COLUMNS ---
      for (
        let c_intersect = box_c_start;
        c_intersect < box_c_start + 3;
        c_intersect++
      ) {
        const potential_cells = [];
        for (let r = box_r_start; r < box_r_start + 3; r++) {
          if (
            board[r][c_intersect] === 0 &&
            pencils[r][c_intersect].size <= size &&
            pencils[r][c_intersect].size > 1
          ) {
            potential_cells.push([r, c_intersect]);
          }
        }
        if (potential_cells.length < size) continue;

        for (const combo of techniques.combinations(potential_cells, size)) {
          const union = new Set();
          combo.forEach(([r, c]) => {
            pencils[r][c].forEach((num) => union.add(num));
          });

          if (union.size === size) {
            const removals = [];

            // A) Eliminate from other cells in the COLUMN (outside this box). This is a "Pointing" move.
            for (let r_peer = 0; r_peer < 9; r_peer++) {
              if (r_peer >= box_r_start && r_peer < box_r_start + 3) continue; // Skip cells inside the box
              if (board[r_peer][c_intersect] === 0) {
                for (const num of union) {
                  if (pencils[r_peer][c_intersect].has(num)) {
                    removals.push({ r: r_peer, c: c_intersect, num });
                  }
                }
              }
            }

            // B) Eliminate from other cells in the BOX (outside this column). This is a "Naked Subset" move within the box.
            for (let r_peer = box_r_start; r_peer < box_r_start + 3; r_peer++) {
              for (
                let c_peer = box_c_start;
                c_peer < box_c_start + 3;
                c_peer++
              ) {
                if (c_peer === c_intersect) continue; // Skip the intersection column itself
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
              return {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: size === 2 ? "Locked Pair" : "Locked Triple",
                  mainInfo: `Intersection of Col ${c_intersect + 1} and Box ${
                    b + 1
                  }`,
                },
              };
            }
          }
        }
      }
    }

    return { change: false };
  },

  intersection: (board, pencils) => {
    // --- 1. Pointing (Box -> Line) ---
    for (let boxIdx = 0; boxIdx < 9; boxIdx++) {
      for (let num = 1; num <= 9; num++) {
        const boxCellsWithNum = [];
        const boxCells = techniques._getUnitCells("box", boxIdx);
        for (const [r, c] of boxCells) {
          if (pencils[r][c].has(num)) boxCellsWithNum.push([r, c]);
        }

        if (boxCellsWithNum.length > 1) {
          if (new Set(boxCellsWithNum.map(([r, c]) => r)).size === 1) {
            const removals = [];
            const row = boxCellsWithNum[0][0];
            for (let c = 0; c < 9; c++) {
              if (
                Math.floor(c / 3) !== boxIdx % 3 &&
                pencils[row][c].has(num)
              ) {
                removals.push({ r: row, c, num });
              }
            }
            if (removals.length > 0) {
              return {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: "Pointing",
                  mainInfo: `Intersection of Box ${boxIdx + 1} and Row ${
                    row + 1
                  }`,
                },
              };
            }
          }

          if (new Set(boxCellsWithNum.map(([r, c]) => c)).size === 1) {
            const removals = [];
            const col = boxCellsWithNum[0][1];
            for (let r = 0; r < 9; r++) {
              if (
                Math.floor(r / 3) !== Math.floor(boxIdx / 3) &&
                pencils[r][col].has(num)
              ) {
                removals.push({ r, c: col, num });
              }
            }
            if (removals.length > 0) {
              return {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: "Pointing",
                  mainInfo: `Intersection of Box ${boxIdx + 1} and Col ${
                    col + 1
                  }`,
                },
              };
            }
          }
        }
      }
    }
    // --- 2. Claiming (Line -> Box) ---
    for (let i = 0; i < 9; i++) {
      // i is row or column index
      for (let num = 1; num <= 9; num++) {
        const rowColsWithNum = [];
        for (let c = 0; c < 9; c++) {
          if (pencils[i][c].has(num)) rowColsWithNum.push(c);
        }
        if (
          rowColsWithNum.length > 1 &&
          new Set(rowColsWithNum.map((c) => Math.floor(c / 3))).size === 1
        ) {
          const removals = [];
          const boxIdx =
            Math.floor(i / 3) * 3 + Math.floor(rowColsWithNum[0] / 3);
          const boxCells = techniques._getUnitCells("box", boxIdx);
          for (const [r, c] of boxCells) {
            if (r !== i && pencils[r][c].has(num)) {
              removals.push({ r, c, num });
            }
          }
          if (removals.length > 0) {
            return {
              change: true,
              type: "remove",
              cells: removals,
              hint: {
                name: "Claiming",
                mainInfo: `Intersection of Row ${i + 1} and Box ${boxIdx + 1}`,
              },
            };
          }
        }

        const colRowsWithNum = [];
        for (let r = 0; r < 9; r++) {
          if (pencils[r][i].has(num)) colRowsWithNum.push(r);
        }
        if (
          colRowsWithNum.length > 1 &&
          new Set(colRowsWithNum.map((r) => Math.floor(r / 3))).size === 1
        ) {
          const removals = [];
          const boxIdx =
            Math.floor(colRowsWithNum[0] / 3) * 3 + Math.floor(i / 3);
          const boxCells = techniques._getUnitCells("box", boxIdx);
          for (const [r, c] of boxCells) {
            if (c !== i && pencils[r][c].has(num)) {
              removals.push({ r, c, num });
            }
          }
          if (removals.length > 0) {
            return {
              change: true,
              type: "remove",
              cells: removals,
              hint: {
                name: "Claiming",
                mainInfo: `Intersection of Col ${i + 1} and Box ${boxIdx + 1}`,
              },
            };
          }
        }
      }
    }

    return { change: false };
  },

  nakedSubset: (board, pencils, size) => {
    const unitTypes = [
      { name: "row", label: "Row" },
      { name: "col", label: "Col" },
      { name: "box", label: "Box" },
    ];

    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        const unit = techniques._getUnitCells(name, i);
        const unitName = `${label} ${i + 1}`; // Now we have the proper name

        const emptyCells = unit.filter(([r, c]) => board[r][c] === 0);
        if (emptyCells.length < 2 * size) continue;

        const potentialCells = unit.filter(
          ([r, c]) =>
            board[r][c] === 0 &&
            pencils[r][c].size >= 2 &&
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

            for (const [r, c] of unit) {
              if (
                board[r][c] === 0 &&
                !cellGroupSet.has(JSON.stringify([r, c]))
              ) {
                for (const num of union)
                  if (pencils[r][c].has(num)) removals.push({ r, c, num });
              }
            }

            if (removals.length > 0)
              return {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  // Fixed: Hardcoded "Naked" instead of undefined variable 'type'
                  name: `Naked ${
                    size === 2 ? "Pair" : size === 3 ? "Triple" : "Quad"
                  }`,
                  mainInfo: `${unitName}`,
                },
              };
          }
        }
      }
    }
    return { change: false };
  },

  hiddenSubset: (board, pencils, size) => {
    const unitTypes = [
      { name: "row", label: "Row" },
      { name: "col", label: "Col" },
      { name: "box", label: "Box" },
    ];

    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        const unit = techniques._getUnitCells(name, i);
        const unitName = `${label} ${i + 1}`; // Now we have the proper name

        const emptyCells = unit.filter(([r, c]) => board[r][c] === 0);
        // Fixed logic: Hidden subsets need at least size + 1 empty cells usually,
        // but keeping your original logic:
        if (emptyCells.length < 2 * size + 1) continue;

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
              return {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  // Fixed: Hardcoded "Hidden" instead of undefined variable 'type'
                  name: `Hidden ${
                    size === 2 ? "Pair" : size === 3 ? "Triple" : "Quad"
                  }`,
                  mainInfo: `${unitName}`,
                },
              };
            }
          }
        }
      }
    }
    return { change: false };
  },

  fish: (board, pencils, size) => {
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
            if (removals.length > 0)
              return {
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
                  mainInfo: `Digit ${num}`,
                },
              };
          }
        }
      }
    }
    return { change: false };
  },

  finnedXWing: (board, pencils) => {
    let result = techniques._findFinnedFish(board, pencils, 2, true); // Row-based
    if (result.change) return result;
    result = techniques._findFinnedFish(board, pencils, 2, false); // Column-based
    return result;
  },

  finnedSwordfish: (board, pencils) => {
    let result = techniques._findFinnedFish(board, pencils, 3, true);
    if (result.change) return result;
    result = techniques._findFinnedFish(board, pencils, 3, false);
    return result;
  },

  finnedJellyfish: (board, pencils) => {
    let result = techniques._findFinnedFish(board, pencils, 4, true);
    if (result.change) return result;
    result = techniques._findFinnedFish(board, pencils, 4, false);
    return result;
  },

  _findFinnedFish: (board, pencils, fishSize, isRowBased) => {
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
        if (candidateLocs.length >= 2 && candidateLocs.length <= fishSize + 2) {
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
            return {
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

                mainInfo: `Digit ${num}`,
              },
            };
          }
        }
      }
    }
    return { change: false };
  },

  xyWing: (board, pencils) => {
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          bivalueCells.push({ r, c, cands: [...pencils[r][c]].sort() });
        }
      }
    }

    if (bivalueCells.length < 3) return { change: false };

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
              return {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: "XY-Wing",
                  mainInfo: `Pivot at r${pivot.r + 1}c${pivot.c + 1}`,
                },
              };
            }
          }
        }
      }
    }
    return { change: false };
  },

  xyzWing: (board, pencils) => {
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

        // --- START: BUG FIX ---
        // A true XYZ-Wing requires the two wing cells to not see each other.
        // If they do, they form a Naked Triple with the pivot cell.
        if (techniques._sees([wing1.r, wing1.c], [wing2.r, wing2.c])) {
          continue;
        }
        // --- END: BUG FIX ---

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
            return {
              change: true,
              type: "remove",
              cells: removals,
              hint: {
                name: "XYZ-Wing",
                mainInfo: `Pivot at r${pivot.r + 1}c${pivot.c + 1}`,
              },
            };
          }
        }
      }
    }
    return { change: false };
  },

  wWing: (board, pencils) => {
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          bivalueCells.push({ r, c, cands: new Set(pencils[r][c]) });
        }
      }
    }
    if (bivalueCells.length < 2) return { change: false };

    for (const pair of techniques.combinations(bivalueCells, 2)) {
      const [cell1, cell2] = pair;
      if (cell1.cands.size !== 2 || cell2.cands.size !== 2) continue;
      const cands1 = [...cell1.cands].sort();
      const cands2 = [...cell2.cands].sort();
      if (cands1[0] !== cands2[0] || cands1[1] !== cands2[1]) continue;
      if (techniques._sees([cell1.r, cell1.c], [cell2.r, cell2.c])) continue;

      const [x, y] = cands1;
      // Strong link on x, eliminate y
      let result = techniques._findWWingElimination(
        board,
        pencils,
        cell1,
        cell2,
        x,
        y,
      );
      if (result.change) return result;
      // Strong link on y, eliminate x
      result = techniques._findWWingElimination(
        board,
        pencils,
        cell1,
        cell2,
        y,
        x,
      );
      if (result.change) return result;
    }
    return { change: false };
  },

  _findWWingElimination: (board, pencils, cell1, cell2, x, y) => {
    const units = [];
    for (let i = 0; i < 9; i++) {
      units.push(techniques._getUnitCells("row", i));
      units.push(techniques._getUnitCells("col", i));
      units.push(techniques._getUnitCells("box", i));
    }

    for (const unit of units) {
      const x_cells = unit.filter(([r, c]) => pencils[r][c].has(x));
      if (x_cells.length === 2) {
        const [link1, link2] = x_cells;
        const sees_l1_c1 = techniques._sees(link1, [cell1.r, cell1.c]);
        const sees_l1_c2 = techniques._sees(link1, [cell2.r, cell2.c]);
        const sees_l2_c1 = techniques._sees(link2, [cell1.r, cell1.c]);
        const sees_l2_c2 = techniques._sees(link2, [cell2.r, cell2.c]);

        if (
          (sees_l1_c1 && sees_l2_c2 && !sees_l1_c2 && !sees_l2_c1) ||
          (sees_l1_c2 && sees_l2_c1 && !sees_l1_c1 && !sees_l2_c2)
        ) {
          const removals = [];
          const commonSeers = techniques._commonVisibleCells(
            [cell1.r, cell1.c],
            [cell2.r, cell2.c],
          );
          for (const [r, c] of commonSeers) {
            if (pencils[r][c].has(y)) {
              removals.push({ r, c, num: y });
            }
          }
          if (removals.length > 0) {
            return {
              change: true,
              type: "remove",
              cells: removals,
              hint: {
                name: "W-Wing",
                mainInfo: `using Candidates ${x}/${y}`,
              },
            };
          }
        }
      }
    }
    return { change: false };
  },

  groupedWWing: (board, pencils) => {
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          bivalueCells.push({ r, c, cands: pencils[r][c] });
        }
      }
    }
    if (bivalueCells.length < 2) return { change: false };

    for (const pair of techniques.combinations(bivalueCells, 2)) {
      const [cell1, cell2] = pair;

      const cands1Str = [...cell1.cands].sort().join("");
      const cands2Str = [...cell2.cands].sort().join("");
      if (cands1Str !== cands2Str) continue;

      // Base cells must not be in the same band or stack
      if (
        Math.floor(cell1.r / 3) === Math.floor(cell2.r / 3) ||
        Math.floor(cell1.c / 3) === Math.floor(cell2.c / 3)
      ) {
        continue;
      }

      const [x, y] = [...cell1.cands];

      for (const linkDigit of [x, y]) {
        const elimDigit = linkDigit === x ? y : x;

        // Check all 27 units for a grouped strong link
        for (let u = 0; u < 27; u++) {
          let unit;
          if (u < 9) unit = techniques._getUnitCells("row", u);
          else if (u < 18) unit = techniques._getUnitCells("col", u - 9);
          else unit = techniques._getUnitCells("box", u - 18);

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

          // Check if every linking cell sees exactly one of the two base cells
          const isGroupedLink = x_cells_in_unit.every(([r, c]) => {
            const sees1 = techniques._sees([r, c], [cell1.r, cell1.c]);
            const sees2 = techniques._sees([r, c], [cell2.r, cell2.c]);
            return sees1 !== sees2; // XOR: must see one, but not both
          });

          if (isGroupedLink) {
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
              return {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: "Grouped W-Wing",
                  mainInfo: `using Candidates ${x}/${y}`,
                },
              };
            }
          }
        }
      }
    }
    return { change: false };
  },

  remotePair: (board, pencils) => {
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
              return {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: "Remote Pair",
                  mainInfo: `using Candidates ${pair[0]}/${pair[1]}`,
                },
              };
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
    return { change: false };
  },

  skyscraper: (board, pencils) => {
    const skyscraperLogic = (isRowBased) => {
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

          // Find the common location (the base) and the two different locations (the peaks)
          const sharedLocs = new Set(link1.locs);
          const baseLoc = link2.locs.find((loc) => sharedLocs.has(loc));

          if (baseLoc === undefined) continue; // No common location, not a skyscraper

          const peak1Loc = link1.locs.find((loc) => loc !== baseLoc);
          const peak2Loc = link2.locs.find((loc) => loc !== baseLoc);

          const p1 = isRowBased
            ? [link1.line, peak1Loc]
            : [peak1Loc, link1.line];
          const p2 = isRowBased
            ? [link2.line, peak2Loc]
            : [peak2Loc, link2.line];

          const removals = [];
          for (const [r, c] of techniques._commonVisibleCells(p1, p2)) {
            if (pencils[r][c].has(num)) {
              removals.push({ r, c, num });
            }
          }
          if (removals.length > 0) {
            return {
              change: true,
              type: "remove",
              cells: removals,
              hint: {
                name: "Skyscraper",
                mainInfo: `Digit ${num}`,
              },
            };
          }
        }
      }
      return { change: false };
    };

    let result = skyscraperLogic(true); // Row-based
    if (result.change) return result;
    result = skyscraperLogic(false); // Column-based
    return result;
  },

  twoStringKite: (board, pencils) => {
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
          // --- START: BUG FIX ---
          // Add stricter check to ensure the four cells are distinct and don't overlap.
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
          // --- END: BUG FIX ---

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
                const p1 = rowLinkCells[1 - i];
                const p2 = colLinkCells[1 - j];

                if (p1[0] === p2[0] && p1[1] === p2[1]) continue;

                const removals = [];
                for (const [r, c] of techniques._commonVisibleCells(p1, p2)) {
                  if (pencils[r][c].has(num)) {
                    removals.push({ r, c, num });
                  }
                }
                if (removals.length > 0) {
                  return {
                    change: true,
                    type: "remove",
                    cells: removals,
                    hint: {
                      name: "2-String Kite",
                      mainInfo: `Digit ${num}`,
                    },
                  };
                }
              }
            }
          }
        }
      }
    }
    return { change: false };
  },

  // Replace the existing turbotFish function
  turbotFish: (board, pencils) => {
    const turbotLogic = (isRowBased) => {
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
                    // --- ADDED: Define pattern cells for logging ---
                    const patternCells = [pA, pB, pC, pD];
                    return {
                      change: true,
                      type: "remove",
                      cells: removals,
                      hint: {
                        name: "Turbot Fish",
                        mainInfo: `Digit ${num}`,
                      },
                    };
                  }
                }
              }
            }
          }
        }
      }
      return { change: false };
    };

    let result = turbotLogic(true);
    if (result.change) return result;
    result = turbotLogic(false);
    return result;
  },

  emptyRectangle: (board, pencils) => {
    let result = techniques.groupedTurbotFish(board, pencils);
    return result;
  },

  rectangleElimination: (board, pencils) => {
    result = techniques.groupedKite(board, pencils);
    return result;
  },

  groupedTurbotFish: (board, pencils) => {
    const logic = (isRowVersion) => {
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

              if (isRowVersion) {
                for (let r2 = 0; r2 < 9; r2++) {
                  if (Math.floor(r2 / 3) === Math.floor(r1 / 3)) continue;
                  if (!pencils[r2][c1].has(num)) continue;

                  const r2_locs = [];
                  for (let c = 0; c < 9; c++)
                    if (pencils[r2][c].has(num)) r2_locs.push(c);

                  if (r2_locs.length === 2 && r2_locs.includes(c1)) {
                    const c2 = r2_locs.find((c) => c !== c1);
                    if (Math.floor(c1 / 3) === Math.floor(c2 / 3)) continue;
                    if (pencils[r1][c2].has(num)) {
                      return {
                        change: true,
                        type: "remove",
                        cells: [{ r: r1, c: c2, num }],
                        hint: {
                          name: "Empty Rectangle",
                          mainInfo: `Digit ${num}`,
                        },
                      };
                    }
                  }
                }
              } else {
                // Column version
                for (let c2 = 0; c2 < 9; c2++) {
                  if (Math.floor(c2 / 3) === Math.floor(c1 / 3)) continue;
                  if (!pencils[r1][c2].has(num)) continue;

                  const c2_locs = [];
                  for (let r = 0; r < 9; r++)
                    if (pencils[r][c2].has(num)) c2_locs.push(r);

                  if (c2_locs.length === 2 && c2_locs.includes(r1)) {
                    const r2 = c2_locs.find((r) => r !== r1);
                    if (Math.floor(r1 / 3) === Math.floor(r2 / 3)) continue;
                    if (pencils[r2][c1].has(num)) {
                      return {
                        change: true,
                        type: "remove",
                        cells: [{ r: r2, c: c1, num }],
                        hint: {
                          name: "Empty Rectangle",
                          mainInfo: `Digit ${num}`,
                        },
                      };
                    }
                  }
                }
              }
            }
          }
        }
      }
      return { change: false };
    };
    let result = logic(true);
    if (result.change) return result;
    result = logic(false);
    return result;
  },

  groupedKite: (board, pencils) => {
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
            if (group.length < 3) continue;

            if (pencils[r2][c2].has(num)) {
              return {
                change: true,
                type: "remove",
                cells: [{ r: r2, c: c2, num }],
                hint: {
                  name: "Rectangle Elimination",
                  mainInfo: `Digit ${num}`,
                },
              };
            }
          }
        }
      }
    }
    return { change: false };
  },

  chuteRemotePair: (board, pencils) => {
    let result = techniques._runChuteLogic(board, pencils, true); // Rows
    if (result.change) return result;
    result = techniques._runChuteLogic(board, pencils, false); // Columns
    return result;
  },

  _runChuteLogic: (board, pencils, isRowVersion) => {
    for (let chuteIndex = 0; chuteIndex < 3; chuteIndex++) {
      const bivalueCells = [];
      const chuteRange = [
        chuteIndex * 3,
        chuteIndex * 3 + 1,
        chuteIndex * 3 + 2,
      ];

      for (const i of chuteRange) {
        for (let j = 0; j < 9; j++) {
          const [r, c] = isRowVersion ? [i, j] : [j, i];
          if (pencils[r][c].size === 2) {
            bivalueCells.push({ r, c, cands: pencils[r][c] });
          }
        }
      }

      if (bivalueCells.length < 2) continue;

      for (const pair of techniques.combinations(bivalueCells, 2)) {
        const [cell1, cell2] = pair;
        if (techniques._sees([cell1.r, cell1.c], [cell2.r, cell2.c])) continue;

        const cands1Str = [...cell1.cands].sort().join("");
        const cands2Str = [...cell2.cands].sort().join("");
        if (cands1Str !== cands2Str) continue;

        const [x, y] = [...cell1.cands];
        const intersectionCandidates = new Set();
        let other_line, other_box_start;

        if (isRowVersion) {
          const pair_rows = new Set([cell1.r, cell2.r]);
          other_line = chuteRange.find((r) => !pair_rows.has(r));

          const chute_boxes = new Set([
            chuteIndex * 3,
            chuteIndex * 3 + 1,
            chuteIndex * 3 + 2,
          ]);
          const pair_boxes = new Set([
            techniques._getBoxIndex(cell1.r, cell1.c),
            techniques._getBoxIndex(cell2.r, cell2.c),
          ]);
          const other_box_index = [...chute_boxes].find(
            (b) => !pair_boxes.has(b),
          );
          if (other_box_index === undefined) continue;
          other_box_start = (other_box_index % 3) * 3;

          for (let c = other_box_start; c < other_box_start + 3; c++) {
            pencils[other_line][c].forEach((cand) =>
              intersectionCandidates.add(cand),
            );
            if (board[other_line][c] !== 0)
              intersectionCandidates.add(board[other_line][c]);
          }
        } else {
          // Column version
          const pair_cols = new Set([cell1.c, cell2.c]);
          other_line = chuteRange.find((c) => !pair_cols.has(c));

          const chute_boxes = new Set([
            chuteIndex,
            chuteIndex + 3,
            chuteIndex + 6,
          ]);
          const pair_boxes = new Set([
            techniques._getBoxIndex(cell1.r, cell1.c),
            techniques._getBoxIndex(cell2.r, cell2.c),
          ]);
          const other_box_index = [...chute_boxes].find(
            (b) => !pair_boxes.has(b),
          );
          if (other_box_index === undefined) continue;
          other_box_start = Math.floor(other_box_index / 3) * 3;

          for (let r = other_box_start; r < other_box_start + 3; r++) {
            pencils[r][other_line].forEach((cand) =>
              intersectionCandidates.add(cand),
            );
            if (board[r][other_line] !== 0)
              intersectionCandidates.add(board[r][other_line]);
          }
        }

        const removals = [];
        const commonSeers = techniques._commonVisibleCells(
          [cell1.r, cell1.c],
          [cell2.r, cell2.c],
        );
        if (!intersectionCandidates.has(x)) {
          for (const [r, c] of commonSeers) {
            if (pencils[r][c].has(y)) removals.push({ r, c, num: y });
          }
        }
        if (!intersectionCandidates.has(y)) {
          for (const [r, c] of commonSeers) {
            if (pencils[r][c].has(x)) removals.push({ r, c, num: x });
          }
        }
        if (removals.length > 0) {
          const uniqueRemovals = Array.from(
            new Set(removals.map(JSON.stringify)),
          ).map(JSON.parse);
          return {
            change: true,
            type: "remove",
            cells: uniqueRemovals,
            hint: {
              name: "Chute Remote Pair",
              mainInfo: `using Candidates ${x}/${y}`,
            },
          };
        }
      }
    }
    return { change: false };
  },

  bugPlusOne: (board, pencils) => {
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

        // Step 5: If 'num' appears an odd number of times in all three units, it must be the solution
        if (rowCount % 2 !== 0 && colCount % 2 !== 0 && boxCount % 2 !== 0) {
          // Reduce the cell to a naked single
          return {
            change: true,
            type: "place",
            r: r_plus1,
            c: c_plus1,
            num,
            hint: {
              name: "BUG+1",
              mainInfo: `Tri-value cell at r${r_plus1 + 1}c${c_plus1 + 1}`,
            },
          };
        }
      }
    }

    return { change: false };
  },

  _findUniqueRectangles: (board, pencils) => {
    // Returns list of rectangles: { cells: [[r1,c1],[r1,c2],[r2,c1],[r2,c2]], digits: [d1,d2] }
    const rects = [];
    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        for (let r1 = 0; r1 < 9; r1++) {
          for (let r2 = r1 + 1; r2 < 9; r2++) {
            const cols = [];
            for (let c = 0; c < 9; c++) {
              // both rows must have both digits in this column (as candidates)
              if (
                pencils[r1][c].has(d1) &&
                pencils[r1][c].has(d2) &&
                pencils[r2][c].has(d1) &&
                pencils[r2][c].has(d2)
              ) {
                cols.push(c);
              }
            }
            if (cols.length < 2) continue;
            for (let i = 0; i < cols.length; i++) {
              for (let j = i + 1; j < cols.length; j++) {
                const c1 = cols[i],
                  c2 = cols[j];
                // must span exactly two boxes
                const spanBoxes =
                  (Math.floor(r1 / 3) === Math.floor(r2 / 3)) !==
                  (Math.floor(c1 / 3) === Math.floor(c2 / 3));
                if (!spanBoxes) continue;
                const cells = [
                  [r1, c1],
                  [r1, c2],
                  [r2, c1],
                  [r2, c2],
                ];

                // At least one of the four must be exactly the bivalue pair (UR floor)
                let hasBivalueFloor = false;
                for (const [r, c] of cells) {
                  if (
                    pencils[r][c].size === 2 &&
                    pencils[r][c].has(d1) &&
                    pencils[r][c].has(d2)
                  ) {
                    hasBivalueFloor = true;
                    break;
                  }
                }
                if (!hasBivalueFloor) continue;

                rects.push({ cells, digits: [d1, d2] });
              }
            }
          }
        }
      }
    }
    return rects;
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

  uniqueRectangle: (board, pencils) => {
    const rects = techniques._findUniqueRectangles(board, pencils);
    if (!rects || rects.length === 0) return { change: false };

    const isExactPair = (r, c, d1, d2) =>
      pencils[r][c].size === 2 &&
      pencils[r][c].has(d1) &&
      pencils[r][c].has(d2);

    const uniqueRemovals = (arr) => {
      return Array.from(new Set(arr.map(JSON.stringify))).map(JSON.parse);
    };

    for (const rect of rects) {
      const { cells, digits } = rect;
      const [d1, d2] = digits;

      const extraCells = cells.filter(([r, c]) => !isExactPair(r, c, d1, d2));

      // --- Type 1: One extra cell ---
      if (extraCells.length === 1) {
        const [r, c] = extraCells[0];
        const removals = [];
        if (pencils[r][c].has(d1)) removals.push({ r, c, num: d1 });
        if (pencils[r][c].has(d2)) removals.push({ r, c, num: d2 });
        if (removals.length > 0)
          return {
            change: true,
            type: "remove",
            cells: uniqueRemovals(removals),
            hint: {
              name: "Unique Rectangle Type 1",
              mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
            },
          };
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
            if (removals.length > 0)
              return {
                change: true,
                type: "remove",
                cells: uniqueRemovals(removals),
                hint: {
                  name:
                    extraCells.length === 2
                      ? "Unique Rectangle Type 2"
                      : "Unique Rectangle Type 5",
                  mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
                },
              };
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
            // Note: The loop for k can stop earlier, as k + 1 cannot be larger than the number of available 'other' cells
            for (let k = 1; k < unitCells.length; k++) {
              for (const chosen of techniques.combinations(unitCells, k)) {
                const union = new Set(virtualSet);
                chosen.forEach(([r, c]) =>
                  pencils[r][c].forEach((p) => union.add(p)),
                );
                // --- FIX IS HERE ---
                // The number of candidates must equal k real cells + 1 virtual cell.
                if (union.size === k + 1) {
                  const chosenSet = new Set(chosen.map(JSON.stringify));
                  const removals = [];
                  for (const [r, c] of unitCells) {
                    if (chosenSet.has(JSON.stringify([r, c]))) continue;
                    for (const d of union) {
                      if (pencils[r][c].has(d)) removals.push({ r, c, num: d });
                    }
                  }
                  if (removals.length > 0) return uniqueRemovals(removals);
                }
              }
            }
            return null;
          };

          const sharedUnits = [];
          if (e1r === e2r)
            sharedUnits.push(techniques._getUnitCells("row", e1r));
          if (e1c === e2c)
            sharedUnits.push(techniques._getUnitCells("col", e1c));
          if (
            techniques._getBoxIndex(e1r, e1c) ===
            techniques._getBoxIndex(e2r, e2c)
          ) {
            sharedUnits.push(
              techniques._getUnitCells(
                "box",
                techniques._getBoxIndex(e1r, e1c),
              ),
            );
          }

          for (const unit of sharedUnits) {
            const res = processUnit(unit);
            if (res)
              return {
                change: true,
                type: "remove",
                cells: res,
                hint: {
                  name: "Unique Rectangle Type 3",
                  mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
                },
              };
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
              if (removals.length > 0)
                return {
                  change: true,
                  type: "remove",
                  cells: uniqueRemovals(removals),
                  hint: {
                    name: "Unique Rectangle Type 4",
                    mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
                  },
                };
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
              if (removals.length > 0)
                return {
                  change: true,
                  type: "remove",
                  cells: uniqueRemovals(removals),
                  hint: {
                    name: "Unique Rectangle Type 6",
                    mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
                  },
                };
            }
          }
        }
      }
    }
    return { change: false };
  },

  hiddenRectangle: (board, pencils) => {
    const rectangles = techniques._findHiddenRectangles(pencils);
    if (rectangles.length === 0) return { change: false };

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
      const addRemoval = (r, c, num) => {
        if (pencils[r][c] && pencils[r][c].has(num)) {
          removals.push({ r, c, num });
        }
      };

      if (extraCells.length === 1) {
        caseInfo = "Case 1: 1 Extra Cell";
        const [r, c] = extraCells[0];
        addRemoval(r, c, d1);
        addRemoval(r, c, d2);
      } else if (extraCells.length === 2) {
        const [e1r, e1c] = extraCells[0];
        const [e2r, e2c] = extraCells[1];
        const [f1r, f1c] = bivalueCells[0];
        const [f2r, f2c] = bivalueCells[1];
        const row_aligned = e1r === e2r;
        const col_aligned = e1c === e2c;

        if (row_aligned) {
          caseInfo = "Case 2: Row-Aligned";
          if (techniques._isStrongLink(pencils, d1, "row", e1r, e1c, e2c)) {
            addRemoval(e1r, e1c, d2);
            addRemoval(e2r, e2c, d2);
          } else if (
            techniques._isStrongLink(pencils, d2, "row", e1r, e1c, e2c)
          ) {
            addRemoval(e1r, e1c, d1);
            addRemoval(e2r, e2c, d1);
          }
          if (techniques._isStrongLink(pencils, d1, "col", f1c, f1r, e1r))
            addRemoval(e2r, f2c, d2);
          if (techniques._isStrongLink(pencils, d2, "col", f1c, f1r, e1r))
            addRemoval(e2r, f2c, d1);
          if (techniques._isStrongLink(pencils, d1, "col", f2c, f2r, e2r))
            addRemoval(e2r, f1c, d2);
          if (techniques._isStrongLink(pencils, d2, "col", f2c, f2r, e2r))
            addRemoval(e2r, f1c, d1);
        } else if (col_aligned) {
          caseInfo = "Case 2: Col-Aligned";
          if (techniques._isStrongLink(pencils, d1, "col", e1c, e1r, e2r)) {
            addRemoval(e1r, e1c, d2);
            addRemoval(e2r, e2c, d2);
          } else if (
            techniques._isStrongLink(pencils, d2, "col", e1c, e1r, e2r)
          ) {
            addRemoval(e1r, e1c, d1);
            addRemoval(e2r, e2c, d1);
          }
          if (techniques._isStrongLink(pencils, d1, "row", f1r, f1c, e1c))
            addRemoval(f2r, e1c, d2);
          if (techniques._isStrongLink(pencils, d2, "row", f1r, f1c, e1c))
            addRemoval(f2r, e1c, d1);
          if (techniques._isStrongLink(pencils, d1, "row", f2r, f2c, e2c))
            addRemoval(f1r, e1c, d2);
          if (techniques._isStrongLink(pencils, d2, "row", f2r, f2c, e2c))
            addRemoval(f1r, e1c, d1);
        } else {
          // Diagonal
          // --- START: REVISED DIAGONAL LOGIC ---
          caseInfo = "Case 2: Diagonal";
          const floor1 = [e1r, e2c],
            floor2 = [e2r, e1c];

          const r_f1_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "row",
            floor1[0],
            floor1[1],
            e1c,
          );
          const c_f1_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "col",
            floor1[1],
            floor1[0],
            e2r,
          );
          const r_f2_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "row",
            floor2[0],
            floor2[1],
            e2c,
          );
          const c_f2_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "col",
            floor2[1],
            floor2[0],
            e1r,
          );
          const r_f1_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "row",
            floor1[0],
            floor1[1],
            e1c,
          );
          const c_f1_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "col",
            floor1[1],
            floor1[0],
            e2r,
          );
          const r_f2_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "row",
            floor2[0],
            floor2[1],
            e2c,
          );
          const c_f2_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "col",
            floor2[1],
            floor2[0],
            e1r,
          );

          let isType6 = false;
          if (r_f1_bi_d1 && r_f2_bi_d1) {
            caseInfo += " (Type 6)";
            isType6 = true;
            addRemoval(e1r, e1c, d1);
            addRemoval(e2r, e2c, d1);
          } else if (r_f1_bi_d2 && r_f2_bi_d2) {
            caseInfo += " (Type 6)";
            isType6 = true;
            addRemoval(e1r, e1c, d2);
            addRemoval(e2r, e2c, d2);
          }

          if (!isType6) {
            if (r_f1_bi_d1 || c_f2_bi_d1) addRemoval(floor2[0], floor1[1], d1);
            if (r_f1_bi_d2 || c_f2_bi_d2) addRemoval(floor2[0], floor1[1], d2);
            if (r_f2_bi_d1 || c_f1_bi_d1) addRemoval(floor1[0], floor2[1], d1);
            if (r_f2_bi_d2 || c_f1_bi_d2) addRemoval(floor1[0], floor2[1], d2);

            // Added new rules
            if (r_f1_bi_d2 && c_f1_bi_d2) addRemoval(floor1[0], floor1[1], d1);
            if (r_f1_bi_d1 && c_f1_bi_d1) addRemoval(floor1[0], floor1[1], d2);
            if (r_f2_bi_d2 && c_f2_bi_d2) addRemoval(floor2[0], floor2[1], d1);
            if (r_f2_bi_d1 && c_f2_bi_d1) addRemoval(floor2[0], floor2[1], d2);
          }
          // --- END: REVISED DIAGONAL LOGIC ---
        }
      } else if (extraCells.length === 3) {
        caseInfo = "Case 3: 3 Extra Cells";
        const [fr, fc] = bivalueCells[0];
        const diagCell = extraCells.find(([r, c]) => r !== fr && c !== fc);
        if (diagCell) {
          const [other_r, other_c] = diagCell;
          const r_floor_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "row",
            fr,
            fc,
            other_c,
          );
          const c_floor_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "col",
            fc,
            fr,
            other_r,
          );
          const r_other_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "row",
            other_r,
            fc,
            other_c,
          );
          const c_other_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "col",
            other_c,
            fr,
            other_r,
          );
          const r_floor_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "row",
            fr,
            fc,
            other_c,
          );
          const c_floor_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "col",
            fc,
            fr,
            other_r,
          );
          const r_other_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "row",
            other_r,
            fc,
            other_c,
          );
          const c_other_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "col",
            other_c,
            fr,
            other_r,
          );
          if (r_other_bi_d1 && (r_floor_bi_d1 || c_other_bi_d1))
            addRemoval(other_r, other_c, d2);
          if (r_other_bi_d2 && (r_floor_bi_d2 || c_other_bi_d2))
            addRemoval(other_r, other_c, d1);
          if (r_other_bi_d1 && c_other_bi_d2) {
            addRemoval(other_r, fc, d2);
            addRemoval(fr, other_c, d1);
          }
          if (r_other_bi_d2 && c_other_bi_d1) {
            addRemoval(other_r, fc, d1);
            addRemoval(fr, other_c, d2);
          }
          if (
            (r_floor_bi_d1 && r_other_bi_d2) ||
            (r_floor_bi_d1 && c_other_bi_d2)
          )
            addRemoval(other_r, fc, d1);
          if (
            (r_floor_bi_d2 && r_other_bi_d1) ||
            (r_floor_bi_d2 && c_other_bi_d1)
          )
            addRemoval(other_r, fc, d2);
          if (
            (c_floor_bi_d1 && c_other_bi_d2) ||
            (r_other_bi_d2 && c_floor_bi_d1)
          )
            addRemoval(fr, other_c, d1);
          if (
            (c_floor_bi_d2 && c_other_bi_d1) ||
            (r_other_bi_d1 && c_floor_bi_d2)
          )
            addRemoval(fr, other_c, d2);
        }
      }

      if (removals.length > 0) {
        const uniqueRemovals = Array.from(
          new Set(removals.map(JSON.stringify)),
        ).map(JSON.parse);
        if (uniqueRemovals.length > 0) {
          return {
            change: true,
            type: "remove",
            cells: removals,
            hint: {
              name: "Hidden Rectangle",
              mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
            },
          };
        }
      }
    }
    return { change: false };
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

  extendedRectangle: (board, pencils) => {
    const ers = techniques._findExtendedRectangles(pencils);
    if (ers.length === 0) return { change: false };

    const uniqueRemovals = (arr) => {
      return Array.from(new Set(arr.map(JSON.stringify))).map(JSON.parse);
    };

    for (const er of ers) {
      const { cells, digits, is_3x2 } = er;
      const core_digits = new Set(digits);
      const removals = [];

      const extra_cells = cells.filter(([r, c]) =>
        [...pencils[r][c]].some((cand) => !core_digits.has(cand)),
      );

      // --- Type 1 ---
      if (extra_cells.length === 1) {
        const [r, c] = extra_cells[0];
        digits.forEach((d) => {
          if (pencils[r][c].has(d)) removals.push({ r, c, num: d });
        });
        if (removals.length > 0) {
          return {
            change: true,
            type: "remove",
            cells: uniqueRemovals(removals),
            hint: {
              name: "Extended Unique Rectangle Type 1",
              mainInfo: `Digits ${digits.join("/")}`,
            },
          };
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
            return {
              change: true,
              type: "remove",
              cells: uniqueRemovals(removals),
              hint: {
                name: "Extended Unique Rectangle Type 2",
                mainInfo: `Digits ${digits.join("/")}`,
              },
            };
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

        if (r_set.size === 1)
          sharedUnits.push(
            techniques._getUnitCells("row", r_set.values().next().value),
          );
        if (c_set.size === 1)
          sharedUnits.push(
            techniques._getUnitCells("col", c_set.values().next().value),
          );
        if (b_set.size === 1)
          sharedUnits.push(
            techniques._getUnitCells("box", b_set.values().next().value),
          );

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
                  // k real cells + 1 virtual ER cell
                  const local_removals = [];
                  const chosenSet = new Set(chosen.map(JSON.stringify));
                  for (const [r, c] of unitCells) {
                    if (chosenSet.has(JSON.stringify([r, c]))) continue;
                    for (const d of union) {
                      if (pencils[r][c].has(d))
                        local_removals.push({ r, c, num: d });
                    }
                  }
                  if (local_removals.length > 0) return local_removals;
                }
              }
            }
            return null;
          };

          for (const unit of sharedUnits) {
            const res = processUnit(unit);
            if (res)
              return {
                change: true,
                type: "remove",
                cells: uniqueRemovals(res),
                hint: {
                  name: "Extended Unique Rectangle Type 3",
                  mainInfo: `Digits ${digits.join("/")}`,
                },
              };
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
                return {
                  change: true,
                  type: "remove",
                  cells: uniqueRemovals(removals),
                  hint: {
                    name: "Extended Unique Rectangle Type 4",
                    mainInfo: `Digits ${digits.join("/")}`,
                  },
                };
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
                return {
                  change: true,
                  type: "remove",
                  cells: uniqueRemovals(removals),
                  hint: {
                    name: "Extended Unique Rectangle Type 6",
                    mainInfo: `Digits ${digits.join("/")}`,
                  },
                };
              }
            }
          }
        }
      }
    }
    return { change: false };
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
  uniqueHexagon: (board, pencils) => {
    const hexagons = techniques._findUniqueHexagons(pencils);
    if (hexagons.length === 0) return { change: false };

    const uniqueRemovals = (arr) => {
      return Array.from(new Set(arr.map(JSON.stringify))).map(JSON.parse);
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

      // --- Type 1 ---
      if (extra_cells.length === 1) {
        const [r, c] = extra_cells[0];
        if (pencils[r][c].has(d1)) removals.push({ r, c, num: d1 });
        if (pencils[r][c].has(d2)) removals.push({ r, c, num: d2 });
        if (removals.length > 0) {
          return {
            change: true,
            type: "remove",
            cells: uniqueRemovals(removals),
            hint: {
              name: "Unique Hexagon Type 1",
              mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
            },
          };
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
            return {
              change: true,
              type: "remove",
              cells: uniqueRemovals(removals),
              hint: {
                name:
                  extra_cells.length === 2
                    ? "Unique Hexagon Type 2"
                    : "Unique Hexagon Type 5",
                mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
              },
            };
          }
        }
      }

      // --- Types 3 & 4 ---
      if (extra_cells.length === 2) {
        const [e1r, e1c] = extra_cells[0];
        const [e2r, e2c] = extra_cells[1];

        // --- Type 3 (Hexagon + Naked Subset) ---
        const sharedUnits = [];
        if (e1r === e2r) sharedUnits.push(techniques._getUnitCells("row", e1r));
        if (e1c === e2c) sharedUnits.push(techniques._getUnitCells("col", e1c));
        if (
          techniques._getBoxIndex(e1r, e1c) ===
          techniques._getBoxIndex(e2r, e2c)
        ) {
          sharedUnits.push(
            techniques._getUnitCells("box", techniques._getBoxIndex(e1r, e1c)),
          );
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
                  // k real cells + 1 virtual cell
                  const local_removals = [];
                  const chosenSet = new Set(chosen.map(JSON.stringify));
                  for (const [r, c] of unitCells) {
                    if (chosenSet.has(JSON.stringify([r, c]))) continue;
                    for (const d of union) {
                      if (pencils[r][c].has(d))
                        local_removals.push({ r, c, num: d });
                    }
                  }
                  if (local_removals.length > 0) return local_removals;
                }
              }
            }
            return null;
          };
          for (const unit of sharedUnits) {
            const res = processUnit(unit);
            if (res)
              return {
                change: true,
                type: "remove",
                cells: uniqueRemovals(res),
                hint: {
                  name: "Unique Hexagon Type 3",
                  mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
                },
              };
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
                return {
                  change: true,
                  type: "remove",
                  cells: uniqueRemovals(removals),
                  hint: {
                    name: "Unique Hexagon Type 4",
                    mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
                  },
                };
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
                  return {
                    change: true,
                    type: "remove",
                    cells: uniqueRemovals(removals),
                    hint: {
                      name: "Unique Hexagon Type 6",
                      mainInfo: `using Candidates ${digits[0]}/${digits[1]}`,
                    },
                  };
                }
              }
            }
          }
        }
      }
    }
    return { change: false };
  },

  sueDeCoq: (board, pencils) => {
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

    const findAlses = (cells, minSize = 1, maxSize = 8, extraCandSize = 1) => {
      const alses = [];
      if (!cells || !cells.length) return alses;
      for (let size = minSize; size <= cells.length; size++) {
        if (size > maxSize) continue;
        for (const combo of combinations(cells, size)) {
          let unionMask = 0;
          for (const [r, c] of combo) unionMask |= maskFromSet(pencils[r][c]);
          if (bitCount(unionMask) === size + extraCandSize) {
            const posSet = new Set(combo.map(([r, c]) => `${r},${c}`));
            alses.push({ positions: posSet, mask: unionMask });
          }
        }
      }
      return alses;
    };

    const eliminations = [];
    const recordRemovalsFromMask = (cellList, positionsSet, mask) => {
      for (const [r, c] of cellList) {
        if (positionsSet.has(`${r},${c}`)) continue; // skip ALS cells
        for (let d = 1; d <= 9; d++) {
          const bit = bitFor(d);
          if ((mask & bit) !== 0 && pencils[r][c].has(d)) {
            eliminations.push({ r, c, num: d });
          }
        }
      }
    };

    // ---------- Main loop ----------
    for (let b = 0; b < 9; b++) {
      const br = Math.floor(b / 3) * 3;
      const bc = (b % 3) * 3;

      for (let i = 0; i < 3; i++) {
        // ---- Row-based intersection ----
        {
          const rowIdx = br + i;
          const C_full = [];
          for (let j = 0; j < 3; j++) {
            const rr = rowIdx,
              cc = bc + j;
            if (board[rr][cc] === 0) C_full.push([rr, cc]);
          }
          if (C_full.length < 2) continue;

          // All empty cells in row and box
          const allRowCells = [];
          for (let cc = 0; cc < 9; cc++)
            if (board[rowIdx][cc] === 0) allRowCells.push([rowIdx, cc]);
          const allBoxCells = [];
          for (let rr = br; rr < br + 3; rr++)
            for (let cc = bc; cc < bc + 3; cc++)
              if (board[rr][cc] === 0) allBoxCells.push([rr, cc]);

          // --- Try all 2+ cell combinations of intersection C ---
          for (let k = 2; k <= C_full.length; k++) {
            for (const C of combinations(C_full, k)) {
              const usedC = new Set(C.map(([r, c]) => `${r},${c}`));
              const unusedC = C_full.filter(
                ([r, c]) => !usedC.has(`${r},${c}`),
              );

              // Build pools excluding used C, including unused intersection cells
              const line_pool = allRowCells.filter(
                ([r, c]) => !usedC.has(`${r},${c}`),
              );
              const box_pool = allBoxCells.filter(
                ([r, c]) => !usedC.has(`${r},${c}`),
              );

              // --- Process this intersection subset ---
              let V_mask = 0;
              for (const [r, c] of C) V_mask |= maskFromSet(pencils[r][c]);
              if (bitCount(V_mask) < C.length + 2) continue;

              const line_alses = findAlses(line_pool, 1, 8, 1);
              const box_alses = findAlses(box_pool, 1, 8, 1);
              if (!line_alses.length || !box_alses.length) continue;

              for (const A of line_alses) {
                for (const B of box_alses) {
                  // Disjointness check
                  let overlap = false;
                  for (const p of A.positions)
                    if (B.positions.has(p)) {
                      overlap = true;
                      break;
                    }
                  if (overlap) continue;

                  const D_mask = A.mask;
                  const E_mask = B.mask;
                  const remaining_V = V_mask & ~(D_mask | E_mask);

                  if (bitCount(remaining_V) === C.length - 2) {
                    recordRemovalsFromMask(line_pool, A.positions, D_mask);
                    recordRemovalsFromMask(box_pool, B.positions, E_mask);
                    if (remaining_V > 0) {
                      recordRemovalsFromMask(
                        line_pool,
                        A.positions,
                        remaining_V,
                      );
                      recordRemovalsFromMask(
                        box_pool,
                        B.positions,
                        remaining_V,
                      );
                    }
                    if (eliminations.length > 0)
                      return {
                        change: true,
                        type: "remove",
                        cells: eliminations,

                        hint: {
                          name: "Sue de Coq",
                          mainInfo: `Intersecting Row ${rowIdx + 1} and Box ${
                            Math.floor(br / 3) * 3 + bc / 3 + 1
                          }`,
                        },
                      };
                  }
                }
              }
            }
          }
        }

        // ---- Column-based intersection ----
        {
          const colIdx = bc + i;
          const C_full = [];
          for (let j = 0; j < 3; j++) {
            const rr = br + j,
              cc = colIdx;
            if (board[rr][cc] === 0) C_full.push([rr, cc]);
          }
          if (C_full.length < 2) continue;

          const allColCells = [];
          for (let rr = 0; rr < 9; rr++)
            if (board[rr][colIdx] === 0) allColCells.push([rr, colIdx]);
          const allBoxCells = [];
          for (let rr = br; rr < br + 3; rr++)
            for (let cc = bc; cc < bc + 3; cc++)
              if (board[rr][cc] === 0) allBoxCells.push([rr, cc]);

          for (let k = 2; k <= C_full.length; k++) {
            for (const C of combinations(C_full, k)) {
              const usedC = new Set(C.map(([r, c]) => `${r},${c}`));
              const unusedC = C_full.filter(
                ([r, c]) => !usedC.has(`${r},${c}`),
              );

              const line_pool = allColCells.filter(
                ([r, c]) => !usedC.has(`${r},${c}`),
              );
              const box_pool = allBoxCells.filter(
                ([r, c]) => !usedC.has(`${r},${c}`),
              );

              let V_mask = 0;
              for (const [r, c] of C) V_mask |= maskFromSet(pencils[r][c]);
              if (bitCount(V_mask) < C.length + 2) continue;

              const line_alses = findAlses(line_pool, 1, 7, 1);
              const box_alses = findAlses(box_pool, 1, 7, 1);
              if (!line_alses.length || !box_alses.length) continue;

              for (const A of line_alses) {
                for (const B of box_alses) {
                  let overlap = false;
                  for (const p of A.positions)
                    if (B.positions.has(p)) {
                      overlap = true;
                      break;
                    }
                  if (overlap) continue;

                  const D_mask = A.mask;
                  const E_mask = B.mask;
                  const remaining_V = V_mask & ~(D_mask | E_mask);

                  if (bitCount(remaining_V) === C.length - 2) {
                    recordRemovalsFromMask(line_pool, A.positions, D_mask);
                    recordRemovalsFromMask(box_pool, B.positions, E_mask);
                    if (remaining_V > 0) {
                      recordRemovalsFromMask(
                        line_pool,
                        A.positions,
                        remaining_V,
                      );
                      recordRemovalsFromMask(
                        box_pool,
                        B.positions,
                        remaining_V,
                      );
                    }
                    if (eliminations.length > 0)
                      return {
                        change: true,
                        type: "remove",
                        cells: eliminations,
                        hint: {
                          name: "Sue de Coq",
                          mainInfo: `Intersecting Col ${colIdx + 1} and Box ${
                            Math.floor(br / 3) * 3 + bc / 3 + 1
                          }`,
                        },
                      };
                  }
                }
              }
            }
          }
        }
      }
    }

    return { change: false, type: null, cells: [] };
  },

  firework: (board, pencils) => {
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

                                if (eliminations.length)
                                  return {
                                    change: true,
                                    type: "remove",
                                    cells: eliminations,
                                    hint: {
                                      name: "Firework",
                                      mainInfo: `using Row ${
                                        rIdx + 1
                                      } and Col ${cIdx + 1}`,
                                    },
                                  };
                              }
                            }
                      }
                    }
              }
            }
      }
    }

    return { change: false, type: null, cells: [] };
  },

  // --- Unified Coloring / Medusa Helper ---

  // Node ID helpers: (cellIndex * 9) + (digit - 1) => 0..728
  _getCandId: (r, c, n) => (r * 9 + c) * 9 + (n - 1),

  _parseCandId: (id) => {
    const cellIdx = Math.floor(id / 9);
    return { r: Math.floor(cellIdx / 9), c: cellIdx % 9, n: (id % 9) + 1 };
  },

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

        if (cells.length === 2) {
          addLink(
            getCandId(cells[0][0], cells[0][1], d),
            getCandId(cells[1][0], cells[1][1], d),
          );
        }
      }
    }

    // 2. Bivalue Cells (Strong Links between diff candidates in same cell)
    // Only for 3D Medusa (singleDigit == null)
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

  _applyColoringRules: (
    componentNodes,
    coloring,
    pencils,
    board,
    isSimpleColoring,
  ) => {
    const removals = [];
    const parseCandId = techniques._parseCandId;

    // Helper: Eliminate entire color group (Color X is False -> Remove all X candidates)
    const eliminateColor = (color) => {
      const output = [];
      for (const id of componentNodes) {
        if (coloring[id] === color) {
          const { r, c, n } = parseCandId(id);
          output.push({ r, c, num: n });
        }
      }
      return output;
    };

    // -- Data Structures for Rule Checking --

    // cellHas[cellIndex] = bitmask (1=Color1, 2=Color2, 3=Both)
    const cellHas = new Int8Array(81).fill(0);

    // unitHas[digit][unitIndex] = bitmask
    const rowHas = Array.from({ length: 10 }, () => new Int8Array(9).fill(0));
    const colHas = Array.from({ length: 10 }, () => new Int8Array(9).fill(0));
    const boxHas = Array.from({ length: 10 }, () => new Int8Array(9).fill(0));

    // 1. Populate Maps & Check Intrinsic Contradictions (Rules 1 & 2)
    for (const id of componentNodes) {
      const killedMasks = [null, new Int32Array(81), new Int32Array(81)];
      const bitFor = (d) => 1 << (d - 1);
      const color = coloring[id];
      const { r, c, n } = parseCandId(id);
      const digitBit = bitFor(n);
      const cellId = r * 9 + c;

      // Ensure PEER_MAP is accessible
      const peerMask = PEER_MAP[cellId];

      // Iterate 0-80 and check mask
      for (let peerIdx = 0; peerIdx < 81; peerIdx++) {
        if ((peerMask & CELL_MASK[peerIdx]) !== 0n) {
          killedMasks[color][peerIdx] |= digitBit;
        }
      }
    }

    // --- Rule 6: Cell Emptiness (3D Medusa Only) ---
    // If Color X is TRUE, does it eliminate ALL candidates in an uncolored cell?
    if (!isSimpleColoring) {
      const killedMasks = [null, new Int32Array(81), new Int32Array(81)];
      const bitFor = (d) => 1 << (d - 1);

      // Build killed masks
      for (const id of componentNodes) {
        const color = coloring[id];
        const { r, c, n } = parseCandId(id);
        const digitBit = bitFor(n);
        const cellId = r * 9 + c;

        // Ensure PEER_MAP is accessible
        const peerMask = PEER_MAP[cellId];

        // NEW CODE: Iterate 0-80 and check mask
        for (let peerIdx = 0; peerIdx < 81; peerIdx++) {
          if ((peerMask & CELL_MASK[peerIdx]) !== 0n) {
            killedMasks[color][peerIdx] |= digitBit;
          }
        }
        // --- CHANGED SECTION END ---
      }

      // Check all cells for emptiness
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] !== 0) continue;
          const killedMasks = [null, new Int32Array(81), new Int32Array(81)];
          const bitFor = (d) => 1 << (d - 1);
          const cellIdx = r * 9 + c;

          // Construct mask of current candidates in the cell
          let cellMask = 0;
          for (const d of pencils[r][c]) cellMask |= bitFor(d);
          if (cellMask === 0) continue;

          // If cellMask is a subset of killedMasks[1], Color 1 kills this cell -> Color 1 is False
          if ((cellMask & ~killedMasks[1][cellIdx]) === 0) {
            return eliminateColor(1);
          }
          // If cellMask is a subset of killedMasks[2], Color 2 kills this cell -> Color 2 is False
          if ((cellMask & ~killedMasks[2][cellIdx]) === 0) {
            return eliminateColor(2);
          }
        }
      }
    }

    // --- Eliminations (Rules 3, 4, 5) ---

    // Rule 3: Two colors in same cell -> remove uncolored candidates
    if (!isSimpleColoring) {
      for (let i = 0; i < 81; i++) {
        if (cellHas[i] === 3) {
          // Both colors present
          const r = Math.floor(i / 9);
          const c = i % 9;
          for (const cand of pencils[r][c]) {
            const id = techniques._getCandId(r, c, cand);
            if (coloring[id] === 0) {
              removals.push({ r, c, num: cand });
            }
          }
        }
      }
    }

    // Rules 4 & 5
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const cellIdx = r * 9 + c;
        const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);

        for (const d of pencils[r][c]) {
          const candId = techniques._getCandId(r, c, d);
          if (coloring[candId] !== 0) continue; // Skip colored candidates

          // Check visibility of Colors for digit 'd'
          const seesC1 =
            rowHas[d][r] & 1 || colHas[d][c] & 1 || boxHas[d][b] & 1;
          const seesC2 =
            rowHas[d][r] & 2 || colHas[d][c] & 2 || boxHas[d][b] & 2;

          // Rule 4: Sees both colors of same digit
          if (seesC1 && seesC2) {
            removals.push({ r, c, num: d });
            continue;
          }

          // Rule 5: Sees Color A (digit d) AND cell has Color B (other digit)
          if (!isSimpleColoring) {
            const cellMask = cellHas[cellIdx];
            // If sees Color 1 (d) AND cell has Color 2 (other)
            if (seesC1 && cellMask & 2) {
              removals.push({ r, c, num: d });
            }
            // If sees Color 2 (d) AND cell has Color 1 (other)
            else if (seesC2 && cellMask & 1) {
              removals.push({ r, c, num: d });
            }
          }
        }
      }
    }

    return removals;
  },

  _solveColoring: (board, pencils, singleDigit = null) => {
    // 1. Build Graph
    const graph = techniques._buildColoringGraph(pencils, singleDigit);
    const parseCandId = techniques._parseCandId;

    const visited = new Int8Array(729).fill(0);
    const coloring = new Int8Array(729).fill(0); // 0=None, 1=ColorA, 2=ColorB

    // 2. BFS Components
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

      // 3. Apply Rules
      const removals = techniques._applyColoringRules(
        component,
        coloring,
        pencils,
        board,
        singleDigit !== null,
      );

      // Clean up coloring for next component
      for (const id of component) coloring[id] = 0;

      if (removals.length > 0) {
        // Deduplicate
        const unique = [];
        const seen = new Set();
        for (const r of removals) {
          const k = `${r.r},${r.c},${r.num}`;
          if (!seen.has(k)) {
            seen.add(k);
            unique.push(r);
          }
        }

        let name = "3D Medusa";
        let info = "";
        const startCand = parseCandId(startId);

        if (singleDigit !== null) {
          name = "Simple Coloring";
          info = `Digit ${singleDigit}`;
        } else {
          info = `Start: r${startCand.r + 1}c${startCand.c + 1} (${
            startCand.n
          })`;
        }

        return {
          change: true,
          type: "remove",
          cells: unique,
          hint: { name, mainInfo: info },
        };
      }
    }

    return { change: false };
  },

  // --- Wrapper Functions ---

  simpleColoring: (board, pencils) => {
    for (let d = 1; d <= 9; d++) {
      const result = techniques._solveColoring(board, pencils, d);
      if (result.change) return result;
    }
    return { change: false };
  },

  medusa3D: (board, pencils) => {
    return techniques._solveColoring(board, pencils, null);
  },

  // --- Unified AIC Helpers ---
  // --- 17-Bit ID Helpers ---
  // ID Format: [Digit:4] [Box:4] [Mask:9]
  // Range: 0 to ~82,000. Fits efficiently in flat arrays.
  _enc17: (d, b, m) => (d << 13) | (b << 9) | m,
  _dec17: (id) => ({ d: (id >> 13) & 0xf, b: (id >> 9) & 0xf, m: id & 0x1ff }),

  _cellsFrom17: (b, m) => {
    const cells = [],
      br = Math.floor(b / 3) * 3,
      bc = (b % 3) * 3;
    for (let i = 0; i < 9; i++)
      if (m & (1 << i)) cells.push([br + Math.floor(i / 3), bc + (i % 3)]);
    return cells;
  },

  // Check if two nodes overlap (Same Digit + Same Box + Overlapping Mask)
  _intersect17: (a, b) => {
    // must be same digit AND same box AND share cells
    return (
      (a & 0x1e000) === (b & 0x1e000) &&
      (a & 0x1e00) === (b & 0x1e00) &&
      a & b & 0x1ff
    );
  },

  // --- Node Formatter for Hints ---
  _fmtNode: (node) => {
    const cells = node.cells;
    if (cells.length === 0) return "";

    // Check if Single Cell
    if (cells.length === 1) return `r${cells[0][0] + 1}c${cells[0][1] + 1}`;

    // Grouped Logic
    const firstR = cells[0][0];
    const isSameRow = cells.every((c) => c[0] === firstR);
    if (isSameRow) {
      const cols = cells.map((c) => c[1] + 1).join("");
      return `r${firstR + 1}c${cols}`;
    }

    const firstC = cells[0][1];
    const isSameCol = cells.every((c) => c[1] === firstC);
    if (isSameCol) {
      const rows = cells.map((c) => c[0] + 1).join("");
      return `r${rows}c${firstC + 1}`;
    }

    // Mixed Group
    const rowMap = new Map();
    for (const [r, c] of cells) {
      if (!rowMap.has(r)) rowMap.set(r, []);
      rowMap.get(r).push(c);
    }
    let result = "";
    for (const [r, cols] of rowMap) {
      const colStr = cols.map((c) => c + 1).join("");
      result += `r${r + 1}c${colStr}`;
    }
    return result;
  },

  _getHintInfo: (chain, hintType) => {
    const startNode = chain[0];
    const nextNode = chain[1];

    if (hintType === "digit") {
      return `Digit ${startNode.digit}`;
    }

    if (hintType === "startCell") {
      // For XY-Chain: just the location of the start node
      const cell = startNode.cells[0];
      return `Start at r${cell[0] + 1}c${cell[1] + 1}`;
    }

    if (hintType === "strongLink") {
      const n1Str = techniques._fmtNode(startNode);

      if (startNode.digit === nextNode.digit) {
        // Strong Link on Digit (Grouped or Single)
        const n2Str = techniques._fmtNode(nextNode);
        return `Start with (${startNode.digit})${n1Str}=${n2Str}`;
      } else {
        // Strong Link on Cell (Bivalue / Intra-cell)
        return `Start with (${startNode.digit}=${nextNode.digit})${n1Str}`;
      }
    }
    return "";
  },

  _createAICNode: (cells, digit) => {
    // assume at least one cell exists
    const [r0, c0] = cells[0];

    // fixed box index for all cells
    const b = Math.floor(r0 / 3) * 3 + Math.floor(c0 / 3);

    let cellMask = 0;

    for (const [r, c] of cells) {
      // position inside the 3×3 box (0–8)
      const bit = (r % 3) * 3 + (c % 3);
      cellMask |= 1 << bit;
    }

    const key = techniques._enc17(digit, b, cellMask);

    return {
      cells,
      digit,
      key,
      count: cells.length,
    };
  },

  _generateGroupedNodes: (pencils, d) => {
    // Extracted logic for finding Groups (ALS-like subsets in boxes)
    const groups = [];
    const _create = techniques._createAICNode;

    for (let b = 0; b < 9; b++) {
      const boxCells = techniques
        ._getUnitCells("box", b)
        .filter(([r, c]) => pencils[r][c].has(d));
      if (boxCells.length < 2) continue;

      const rowMap = new Map(),
        colMap = new Map();
      boxCells.forEach((cell) => {
        if (!rowMap.has(cell[0])) rowMap.set(cell[0], []);
        if (!colMap.has(cell[1])) colMap.set(cell[1], []);
        rowMap.get(cell[0]).push(cell);
        colMap.get(cell[1]).push(cell);
      });

      // Add Row/Col Groups
      [...rowMap.values(), ...colMap.values()].forEach((g) => {
        if (g.length >= 2) groups.push(_create(g, d));
      });

      // 5-Cell Cross Pattern
      if (boxCells.length === 5) {
        const r3 = [...rowMap.values()].find((g) => g.length === 3);
        const c3 = [...colMap.values()].find((g) => g.length === 3);
        if (r3 && c3) {
          const rSet = new Set(r3.map((c) => c.join(",")));
          const overlap = c3.find((c) => rSet.has(c.join(",")));
          if (overlap) {
            const overlapStr = overlap.join(",");
            groups.push(
              _create(
                r3.filter((c) => c.join(",") !== overlapStr),
                d,
              ),
            );
            groups.push(
              _create(
                c3.filter((c) => c.join(",") !== overlapStr),
                d,
              ),
            );
          }
        }
      }
    }
    return groups;
  },
  // --- Global Cache for AIC Graph ---
  _aicCache: {
    valid: false,
    // Maps
    singleNodes: [],
    groupedNodes: [],
    nodeMap: new Map(), // key -> Node
    // Links (Adjacency Maps: NodeKey -> [Node])
    strongLinksSingle: new Map(), // Single <-> Single (Same Digit)
    weakLinksSingle: new Map(), // Single <-> Single (Same Digit)
    strongLinksInCell: new Map(), // Single <-> Single (Diff Digit)
    weakLinksInCell: new Map(), // Single <-> Single (Diff Digit)
    strongLinksGrouped: new Map(), // Involving Groups
    weakLinksGrouped: new Map(), // Involving Groups
  },

  _resetAICCache: () => {
    techniques._aicCache = {
      valid: true,
      singleNodes: [],
      groupedNodes: [],
      nodeMap: new Map(),
      strongLinksSingle: new Map(),
      weakLinksSingle: new Map(),
      strongLinksInCell: new Map(),
      weakLinksInCell: new Map(),
      strongLinksGrouped: new Map(),
      weakLinksGrouped: new Map(),
    };
  },

  // --- Graph Building (Incremental) ---

  _ensureSingleNodesAndLinks: (pencils) => {
    const cache = techniques._aicCache;
    if (cache.singleNodes.length > 0) return; // Already built

    // 1. Generate Single Nodes
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        for (const d of pencils[r][c]) {
          const node = techniques._createAICNode([[r, c]], d);
          cache.singleNodes.push(node);
          cache.nodeMap.set(node.key, node);
        }
      }
    }

    // 2. Build Same-Digit Links (Strong & Weak)
    const _sees = techniques._sees;
    const _seesAll = (nA, nB) => {
      for (const cA of nA.cells)
        for (const cB of nB.cells) if (!_sees(cA, cB)) return false;
      return true;
    };

    const nodes = cache.singleNodes;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const u = nodes[i];
        const v = nodes[j];
        if (u.digit !== v.digit) continue;

        if (!techniques._intersect17(u.key, v.key) && _seesAll(u, v)) {
          // Weak Link: Visibility
          techniques._addLink(cache.weakLinksSingle, u, v);
          techniques._addLink(cache.weakLinksSingle, v, u);

          // Strong Link: Conjugate Pair
          const combined = [...u.cells, ...v.cells];
          const commonUnits = techniques._getCommonUnits(combined);
          for (const unit of commonUnits) {
            let cnt = 0;
            for (const [r, c] of unit.cells)
              if (pencils[r][c].has(u.digit)) cnt++;
            if (cnt === u.count + v.count) {
              techniques._addLink(cache.strongLinksSingle, u, v);
              techniques._addLink(cache.strongLinksSingle, v, u);
              break;
            }
          }
        }
      }
    }
  },

  _ensureInCellLinks: (pencils) => {
    const cache = techniques._aicCache;
    if (cache.strongLinksInCell.size > 0 || cache.weakLinksInCell.size > 0)
      return;

    // Build Intra-Cell Links (Diff Digit)
    // We can iterate the existing singleNodes, grouped by cell
    const nodesByCell = new Map();
    for (const node of cache.singleNodes) {
      const cellKey = node.cells[0][0] * 9 + node.cells[0][1];
      if (!nodesByCell.has(cellKey)) nodesByCell.set(cellKey, []);
      nodesByCell.get(cellKey).push(node);
    }

    for (const nodes of nodesByCell.values()) {
      if (nodes.length < 2) continue;
      // All nodes in this list are in the same cell
      const isBivalue = nodes.length === 2;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const u = nodes[i];
          const v = nodes[j];

          // Weak Link: Same Cell always weak linked
          techniques._addLink(cache.weakLinksInCell, u, v);
          techniques._addLink(cache.weakLinksInCell, v, u);

          // Strong Link: Only if Bivalue
          if (isBivalue) {
            techniques._addLink(cache.strongLinksInCell, u, v);
            techniques._addLink(cache.strongLinksInCell, v, u);
          }
        }
      }
    }
  },

  _ensureGroupedNodesAndLinks: (pencils) => {
    const cache = techniques._aicCache;
    if (cache.groupedNodes.length > 0) return;

    // 1. Generate Grouped Nodes
    for (let d = 1; d <= 9; d++) {
      const groups = techniques._generateGroupedNodes(pencils, d);
      groups.forEach((g) => {
        cache.groupedNodes.push(g);
        cache.nodeMap.set(g.key, g);
      });
    }

    // 2. Build Grouped Links
    // Interactions: Single <-> Group, Group <-> Group (Same Digit only here)
    // Note: Diff digit grouped links are generally not standard AIC.
    const singles = cache.singleNodes;
    const groups = cache.groupedNodes;
    const all = [...singles, ...groups];

    // Helpers reused from closure scope if possible, defined here for clarity
    const _sees = techniques._sees;
    const _seesAll = (nA, nB) => {
      for (const cA of nA.cells)
        for (const cB of nB.cells) if (!_sees(cA, cB)) return false;
      return true;
    };
    // Only iterate pairs involving at least one group
    for (let i = 0; i < all.length; i++) {
      const u = all[i];
      // If u is single, we only check against groups. If u is group, check all j > i
      const startJ = u.count === 1 ? singles.length : i + 1;

      for (let j = startJ; j < all.length; j++) {
        const v = all[j];
        if (u.digit !== v.digit) continue;

        // Skip Single <-> Single (already done)
        if (u.count === 1 && v.count === 1) continue;

        if (!techniques._intersect17(u.key, v.key) && _seesAll(u, v)) {
          // Weak Link
          techniques._addLink(cache.weakLinksGrouped, u, v);
          techniques._addLink(cache.weakLinksGrouped, v, u);

          // Strong Link
          const combined = [...u.cells, ...v.cells];
          const commonUnits = techniques._getCommonUnits(combined);
          for (const unit of commonUnits) {
            let cnt = 0;
            for (const [r, c] of unit.cells)
              if (pencils[r][c].has(u.digit)) cnt++;
            if (cnt === u.count + v.count) {
              techniques._addLink(cache.strongLinksGrouped, u, v);
              techniques._addLink(cache.strongLinksGrouped, v, u);
              break;
            }
          }
        }
      }
    }
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

  // --- Main Finder ---
  _findAIC: (board, pencils, options) => {
    const {
      maxLength = 16,
      hintType = "digit",
      singleDigit = false,
      useGrouped = false,
      bivalueOnly = false,
    } = options;

    let strongLinks, weakLinks, nodeMap;

    // --- Graph Building ---
    if (bivalueOnly) {
      const graph = techniques._buildXYChainGraph(pencils);
      strongLinks = graph.strongLinks;
      weakLinks = graph.weakLinks;
      nodeMap = graph.nodeMap;
    } else {
      if (singleDigit & !useGrouped) techniques._resetAICCache();
      techniques._ensureSingleNodesAndLinks(pencils);

      if (useGrouped) {
        techniques._ensureGroupedNodesAndLinks(pencils);
      }
      if (!singleDigit) {
        techniques._ensureInCellLinks(pencils);
      }

      const cache = techniques._aicCache;
      nodeMap = cache.nodeMap;

      const strongMaps = [cache.strongLinksSingle];
      if (useGrouped) strongMaps.push(cache.strongLinksGrouped);
      if (!singleDigit) strongMaps.push(cache.strongLinksInCell);
      strongLinks = techniques._mergeMaps(...strongMaps);

      const weakMaps = [cache.weakLinksSingle];
      if (useGrouped) weakMaps.push(cache.weakLinksGrouped);
      if (!singleDigit) weakMaps.push(cache.weakLinksInCell);
      weakLinks = techniques._mergeMaps(...weakMaps);
    }

    // --- Helper: Find common peers ---
    const _getCommonPeers = (nA, nB) => {
      const targets = [];
      const _sees = techniques._sees;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] !== 0) continue;
          const target = [r, c];
          if (!nA.cells.every((cA) => _sees(target, cA))) continue;
          if (!nB.cells.every((cB) => _sees(target, cB))) continue;
          targets.push({ r, c });
        }
      }
      return targets;
    };

    let result = { change: false };

    // --- DFS Traversal ---
    const dfs = (chain, visited, hasGrouped) => {
      if (result.change) return;
      if (chain.length > maxLength) return;

      const shouldCheck = !options.useGrouped || hasGrouped;
      if (shouldCheck && chain.length % 2 === 0 && chain.length >= 4) {
        const start = chain[0];
        const end = chain[chain.length - 1];

        // --- Check for Continuous Loop ---
        if (true) {
          const elims = [];
          const wNeighbors = weakLinks.get(end.key) || [];
          const isContinuous = wNeighbors.some((n) => n.key === start.key);

          if (isContinuous) {
            if ((start.key < end.key) | (chain.length === 4)) return;
            const fullChain = [...chain, start];

            for (let i = 1; i < fullChain.length - 1; i += 2) {
              const u = fullChain[i];
              const v = fullChain[i + 1];

              if (u.digit === v.digit) {
                // Weak link between same digits (different cells)
                _getCommonPeers(u, v).forEach(({ r, c }) => {
                  const inU = u.cells.some(
                    (cell) => cell[0] === r && cell[1] === c,
                  );
                  const inV = v.cells.some(
                    (cell) => cell[0] === r && cell[1] === c,
                  );
                  if (!inU && !inV && pencils[r][c].has(u.digit)) {
                    elims.push({ r, c, num: u.digit });
                  }
                });
              } else {
                // Weak link within a cell (different digits)
                if (u.count === 1 && v.count === 1) {
                  const [r, c] = u.cells[0];
                  if (v.cells[0][0] === r && v.cells[0][1] === c) {
                    for (const cand of pencils[r][c]) {
                      if (cand !== u.digit && cand !== v.digit) {
                        elims.push({ r, c, num: cand });
                      }
                    }
                  }
                }
              }
            }

            if (elims.length > 0) {
              result = {
                change: true,
                type: "remove",
                cells: elims,
                hint: {
                  name: options.nameOverride || "Continuous AIC Loop",
                  mainInfo: techniques._getHintInfo(chain, hintType),
                },
              };
              return;
            } else {
              // Optimization: Chain is continuous but useless. Stop extending.
              return;
            }
          }

          // --- Standard Check: Discontinuous Chain (Length >= 6) ---
          if (!isContinuous && chain.length >= 6 && start.key > end.key) {
            // Note: If it was continuous, we returned above. So this is strictly discontinuous.

            if (start.digit === end.digit) {
              // Type 1: Start(d) ... End(d) => mutual peers != d
              const peers = _getCommonPeers(start, end);
              peers.forEach(({ r, c }) => {
                const inStart = start.cells.some(
                  (cell) => cell[0] === r && cell[1] === c,
                );
                const inEnd = end.cells.some(
                  (cell) => cell[0] === r && cell[1] === c,
                );
                if (!inStart && !inEnd && pencils[r][c].has(start.digit)) {
                  elims.push({ r, c, num: start.digit });
                }
              });
            } else {
              // Type 2: Start(d1) ... End(d2) => Start sees End
              if (end.count === 1) {
                const [er, ec] = end.cells[0];
                const seesStart = start.cells.every((sc) =>
                  techniques._sees(sc, [er, ec]),
                );
                if (seesStart && pencils[er][ec].has(start.digit)) {
                  elims.push({ r: er, c: ec, num: start.digit });
                }
              }
              if (start.count === 1) {
                const [sr, sc] = start.cells[0];
                const seesEnd = end.cells.every((ec) =>
                  techniques._sees(ec, [sr, sc]),
                );
                if (seesEnd && pencils[sr][sc].has(end.digit)) {
                  elims.push({ r: sr, c: sc, num: end.digit });
                }
              }
            }

            if (elims.length > 0) {
              result = {
                change: true,
                type: "remove",
                cells: elims,
                hint: {
                  name: options.nameOverride || "AIC",
                  mainInfo:
                    techniques._getHintInfo(chain, hintType) +
                    `${isContinuous ? " (Ring)" : ""}`,
                },
              };
              return;
            }
          }
        }
      }

      // --- Continue DFS ---
      const currentNode = chain[chain.length - 1];
      const isStrongTurn = chain.length % 2 !== 0; // Alternate Strong/Weak
      const nextMap = isStrongTurn ? strongLinks : weakLinks;

      const neighbors = nextMap.get(currentNode.key) || [];
      for (const nextNode of neighbors) {
        if (!visited.has(nextNode.key)) {
          visited.add(nextNode.key);
          chain.push(nextNode);
          dfs(chain, visited, hasGrouped || nextNode.count > 1);
          chain.pop();
          visited.delete(nextNode.key);
          if (result.change) return;
        }
      }
    };

    // Iterate start nodes
    for (const key of strongLinks.keys()) {
      if (result.change) break;
      const startNode = nodeMap.get(key);
      if (startNode) {
        dfs([startNode], new Set([key]), startNode.count > 1);
      }
    }

    return result;
  },

  // --- Optimized XY-Chain Graph Builder ---
  _buildXYChainGraph: (pencils) => {
    const strongLinks = new Map();
    const weakLinks = new Map();
    const nodeMap = new Map();

    // Helper to get/create node
    const getNode = (r, c, d) => {
      // Sort cells to ensure consistent key for the same candidate
      const cells = [[r, c]];
      const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const cellMask = 1 << ((r % 3) * 3 + (c % 3));
      const key = techniques._enc17(d, b, cellMask);
      if (!nodeMap.has(key)) {
        nodeMap.set(key, { cells, digit: d, key, count: 1 });
      }
      return nodeMap.get(key);
    };

    const addLink = (map, u, v) => {
      if (!map.has(u.key)) map.set(u.key, []);
      map.get(u.key).push(v);
    };

    // 1. Find all Bivalue Cells & Build Strong Links (Intra-cell)
    const nodesByDigit = Array.from({ length: 10 }, () => []);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          const [d1, d2] = [...pencils[r][c]];
          const n1 = getNode(r, c, d1);
          const n2 = getNode(r, c, d2);

          // Strong Link: Between d1 and d2 in the same bivalue cell
          addLink(strongLinks, n1, n2);
          addLink(strongLinks, n2, n1);

          nodesByDigit[d1].push(n1);
          nodesByDigit[d2].push(n2);
        }
      }
    }

    // 2. Build Weak Links (Visibility, Same Digit)
    // Compare only nodes of the same digit to avoid O(N^2) over the whole board
    for (let d = 1; d <= 9; d++) {
      const nodes = nodesByDigit[d];
      if (nodes.length < 2) continue;

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const u = nodes[i];
          const v = nodes[j];
          // Weak Link: If two bivalue cells containing 'd' can see each other
          if (techniques._sees(u.cells[0], v.cells[0])) {
            addLink(weakLinks, u, v);
            addLink(weakLinks, v, u);
          }
        }
      }
    }

    return { strongLinks, weakLinks, nodeMap };
  },

  // --- Technique Wrappers ---

  xChain: (board, pencils) =>
    techniques._findAIC(board, pencils, {
      singleDigit: true,
      useGrouped: false,
      bivalueOnly: false,
      maxLength: 10,
      hintType: "digit",
      nameOverride: "X-Chain",
    }),

  groupedXChain: (board, pencils) =>
    techniques._findAIC(board, pencils, {
      singleDigit: true,
      useGrouped: true,
      bivalueOnly: false,
      maxLength: 10,
      hintType: "digit",
      nameOverride: "Grouped X-Chain",
    }),

  xyChain: (board, pencils) =>
    techniques._findAIC(board, pencils, {
      singleDigit: false,
      useGrouped: false,
      bivalueOnly: true,
      maxLength: 24,
      hintType: "startCell",
      nameOverride: "XY-Chain",
    }),

  alternatingInferenceChain: (board, pencils) =>
    techniques._findAIC(board, pencils, {
      singleDigit: false,
      useGrouped: false,
      bivalueOnly: false,
      maxLength: 16,
      hintType: "strongLink",
    }),

  groupedAIC: (board, pencils) =>
    techniques._findAIC(board, pencils, {
      singleDigit: false,
      useGrouped: true,
      bivalueOnly: false,
      maxLength: 16,
      hintType: "strongLink",
      nameOverride: "Grouped AIC",
    }),

  alignedPairExclusion: function (board, pencils) {
    // --- Helpers ---
    const _popcount = (n) => {
      n = n - ((n >> 1) & 0x55555555);
      n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
      return (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
    };

    const _getMask = (r, c) => {
      let mask = 0;
      if (pencils[r][c].size > 0) {
        for (const d of pencils[r][c]) mask |= 1 << (d - 1);
      }
      return mask;
    };

    const _maskHas = (mask, d) => (mask & (1 << (d - 1))) !== 0;

    // Recursive helper to find ALS (N cells, N+1 candidates)
    const _findALS = (cells) => {
      const alses = [];
      const n = cells.length;
      if (n === 0) return alses;
      const maxSubset = n;

      const search = (index, k, currentMask, targetSize) => {
        if (k === 0) {
          if (_popcount(currentMask) === targetSize + 1) {
            alses.push({ candidates: currentMask });
          }
          return;
        }
        for (let i = index; i <= n - k; i++) {
          const [r, c] = cells[i];
          search(i + 1, k - 1, currentMask | _getMask(r, c), targetSize);
        }
      };

      for (let size = 1; size <= maxSubset; size++) {
        search(0, size, 0, size);
      }
      return alses;
    };

    const eliminations = [];
    let hintInfo = "";
    let hintName = "Aligned Pair Exclusion";

    // --- APE Type 1 (Intersection of Line and Box) ---
    const apeType1 = (isRow) => {
      let found = false;
      for (let i = 0; i < 9; i++) {
        // Line index
        for (let bSec = 0; bSec < 3; bSec++) {
          // Box 'secondary' index

          // 1. Identify Intersection Cells
          const intersection = [];
          const boxIdx = isRow
            ? Math.floor(i / 3) * 3 + bSec
            : bSec * 3 + Math.floor(i / 3);

          for (let j = 0; j < 9; j++) {
            const r = isRow ? i : j;
            const c = isRow ? j : i;
            if (
              techniques._getBoxIndex(r, c) === boxIdx &&
              pencils[r][c].size > 0
            ) {
              intersection.push([r, c]);
            }
          }

          if (intersection.length < 2) continue;

          // 2. Iterate Pair (p1, p2) within intersection
          for (let m = 0; m < intersection.length; m++) {
            for (let n = 0; n < intersection.length; n++) {
              if (m === n) continue;

              const p1 = intersection[m];
              const p2 = intersection[n];

              // 3. Find "Rest" cells (Reverted to separate lists)
              const lineRest = [];
              const boxRest = [];

              // Line Rest: All empty cells in line MINUS p1, p2
              for (let j = 0; j < 9; j++) {
                const r = isRow ? i : j;
                const c = isRow ? j : i;
                if (pencils[r][c].size === 0) continue;
                if (
                  (r === p1[0] && c === p1[1]) ||
                  (r === p2[0] && c === p2[1])
                )
                  continue;
                lineRest.push([r, c]);
              }

              // Box Rest: All empty cells in box MINUS p1, p2
              const boxCells = techniques._getUnitCells("box", boxIdx);
              for (const [r, c] of boxCells) {
                if (pencils[r][c].size === 0) continue;
                if (
                  (r === p1[0] && c === p1[1]) ||
                  (r === p2[0] && c === p2[1])
                )
                  continue;
                boxRest.push([r, c]);
              }

              if (lineRest.length === 0 && boxRest.length === 0) continue;

              // 4. Find ALSs separately and merge lists
              const alses = [..._findALS(lineRest), ..._findALS(boxRest)];
              if (alses.length === 0) continue;

              const p1Mask = _getMask(p1[0], p1[1]);
              const p2Mask = _getMask(p2[0], p2[1]);

              // 5. Check Eliminations
              for (let d1 = 1; d1 <= 9; d1++) {
                if (!_maskHas(p1Mask, d1)) continue;

                const d1Bit = 1 << (d1 - 1);
                const p2CandsToCheck = p2Mask & ~d1Bit;
                if (p2CandsToCheck === 0) continue;

                let lockedWithD1Mask = 0;
                for (const als of alses) {
                  if ((als.candidates & d1Bit) !== 0) {
                    lockedWithD1Mask |= als.candidates;
                  }
                }

                if ((p2CandsToCheck & ~lockedWithD1Mask) === 0) {
                  eliminations.push({ r: p1[0], c: p1[1], num: d1 });
                  found = true;
                  hintName = "APE Type 1";
                  hintInfo = `using ${isRow ? "Row" : "Col"} ${i + 1} and Box ${
                    boxIdx + 1
                  }`;
                }
              }
            }
          }
        }
      }
      return found;
    };

    // --- APE Type 2 (Chute Intersection) ---
    const apeType2 = (isRow) => {
      let found = false;
      for (let chute = 0; chute < 3; chute++) {
        const lines = [chute * 3, chute * 3 + 1, chute * 3 + 2];
        const boxes = isRow
          ? [chute * 3, chute * 3 + 1, chute * 3 + 2]
          : [chute, chute + 3, chute + 6];

        for (let uAi = 0; uAi < 3; uAi++) {
          for (let uBi = 0; uBi < 3; uBi++) {
            if (uAi === uBi) continue;
            for (let bAi = 0; bAi < 3; bAi++) {
              for (let bBi = 0; bBi < 3; bBi++) {
                if (bAi === bBi) continue;

                const uA = lines[uAi];
                const uB = lines[uBi];
                const bA = boxes[bAi];
                const bB = boxes[bBi];

                // 1. Gather Intersection Area cells for ALS search
                const getInter = (lineIdx, boxIdx) => {
                  const cells = [];
                  const boxC = techniques._getUnitCells("box", boxIdx);
                  for (const [r, c] of boxC) {
                    if (pencils[r][c].size > 0) {
                      if (
                        (isRow && r === lineIdx) ||
                        (!isRow && c === lineIdx)
                      ) {
                        cells.push([r, c]);
                      }
                    }
                  }
                  return cells;
                };

                const inter_uA_bB = getInter(uA, bB); // ALS Area 1
                const inter_uB_bA = getInter(uB, bA); // ALS Area 2

                if (inter_uA_bB.length === 0 || inter_uB_bA.length === 0)
                  continue;

                // Find ALSs in these specific intersections
                const alses = [
                  ..._findALS(inter_uA_bB),
                  ..._findALS(inter_uB_bA),
                ];
                if (alses.length === 0) continue;

                // 2. Identify Pivot Cells P1(uA, bA) and P2(uB, bB)
                const p1Cells = getInter(uA, bA);
                const p2Cells = getInter(uB, bB);

                if (p1Cells.length === 0 || p2Cells.length === 0) continue;

                // 3. Check Eliminations
                for (const p1 of p1Cells) {
                  for (const p2 of p2Cells) {
                    const p1Mask = _getMask(p1[0], p1[1]);
                    const p2Mask = _getMask(p2[0], p2[1]);

                    for (let d1 = 1; d1 <= 9; d1++) {
                      if (!_maskHas(p1Mask, d1)) continue;

                      const d1Bit = 1 << (d1 - 1);
                      if ((p2Mask & d1Bit) !== 0) continue; // Skip if p2 has d1

                      const p2CandsToCheck = p2Mask;
                      if (p2CandsToCheck === 0) continue;

                      let lockedWithD1Mask = 0;
                      for (const als of alses) {
                        if ((als.candidates & d1Bit) !== 0) {
                          lockedWithD1Mask |= als.candidates;
                        }
                      }

                      if ((p2CandsToCheck & ~lockedWithD1Mask) === 0) {
                        eliminations.push({ r: p1[0], c: p1[1], num: d1 });
                        found = true;
                        hintName = "APE Type 2";
                        hintInfo = `Chute ${isRow ? "Row" : "Col"} ${
                          chute * 3 + 1
                        }-${chute * 3 + 3}`;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      return found;
    };

    if (
      apeType1(true) ||
      apeType1(false) ||
      apeType2(true) ||
      apeType2(false)
    ) {
      const uniqueElims = [];
      const seen = new Set();
      for (const e of eliminations) {
        const key = `${e.r},${e.c},${e.num}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueElims.push(e);
        }
      }
      return {
        change: true,
        type: "remove",
        cells: uniqueElims,
        hint: {
          name: hintName,
          mainInfo: hintInfo,
        },
      };
    }

    return { change: false };
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
    // If cache is valid, return it directly
    if (_alsCache && _alsCache.length > 0) {
      return _alsCache;
    }

    const alses = [];

    const findInCells = (unitCells, unitName) => {
      // Filter open cells BEFORE starting recursion
      const cells = unitCells.filter(([r, c]) => board[r][c] === 0);
      const n = cells.length;

      const backtrack = (start, currentCells, currentMask) => {
        const k = currentCells.length;
        if (k > maxSize) return;

        // Check for valid ALS
        if (k >= minSize) {
          const cCount = techniques._bits.popcount(currentMask);
          if (cCount === k + 1) {
            // --- DEFINING POSITIONS & CANDIDATE POSITIONS ---
            let positions = 0n;
            const candidatePositions = Array(9).fill(0n);
            const candMap = {};

            for (const [r, c] of currentCells) {
              const cellIndex = BigInt(r * 9 + c);
              const bit = 1n << cellIndex;

              // 1. Update total position mask
              positions |= bit;

              // 2. Update per-digit position masks
              for (const d of pencils[r][c]) {
                candidatePositions[d - 1] |= bit;

                // Build legacy candMap for UI/Logging
                if (!candMap[d]) candMap[d] = [];
                candMap[d].push([r, c]);
              }
            }
            // ------------------------------------------------

            const hash = techniques._calculateALSHash(currentCells);

            alses.push({
              cells: [...currentCells],
              candidates: currentMask, // Integer mask (used by bitwise logic)
              mask: currentMask, // Alias for compatibility
              size: k,
              candMap: candMap, // Map<Digit, Coords[]>
              unitName: unitName,
              hash: hash,
              positions: positions, // BigInt (81 bits)
              candidatePositions: candidatePositions, // Array[9] of BigInts
            });
          }
        }

        // Iterate through remaining OPEN cells
        for (let i = start; i < n; i++) {
          const [r, c] = cells[i];
          const cellMask = techniques._bits.maskFromSet(pencils[r][c]);
          const newMask = currentMask | cellMask;

          const newK = k + 1;
          const newPop = techniques._bits.popcount(newMask);
          const excess = newPop - newK;
          const remainingCells = n - 1 - i;

          // Pruning: excess candidates vs remaining cells
          if (excess <= remainingCells + 1) {
            backtrack(i + 1, [...currentCells, [r, c]], newMask);
          }
        }
      };

      backtrack(0, [], 0);
    };

    // Iterate over all 27 units
    const unitTypes = [
      { name: "row", label: "Row" },
      { name: "col", label: "Col" },
      { name: "box", label: "Box" },
    ];

    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        findInCells(techniques._getUnitCells(name, i), `${label} ${i + 1}`);
      }
    }

    // Deduplicate using the 15-bit integer hash
    const uniqueALS = new Map();
    for (const als of alses) {
      if (!uniqueALS.has(als.hash)) {
        uniqueALS.set(als.hash, als);
      }
    }

    return Array.from(uniqueALS.values()).sort((a, b) => a.hash - b.hash);
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

  _applySinglyLinked: (A, B, rccMask, commonMask, pencils) => {
    const elims = [];
    const zMask = commonMask & ~rccMask;
    const zDigits = techniques._bits.maskToDigits(zMask);

    for (const z of zDigits) {
      // Eliminate z from common peers of ALL z-candidates in BOTH A and B
      const allZ = A.candidatePositions[z - 1] | B.candidatePositions[z - 1];
      const pm = techniques._findCommonPeersBS(allZ);
      techniques._processElims(pm, z, pencils, elims);
    }
    return elims;
  },

  _applyDoublyLinked: (A, B, rccMask, commonMask, pencils) => {
    const elims = [];

    // 1. Non-RCC eliminations for A
    const zMaskA = A.mask & ~rccMask;
    const zDigitsA = techniques._bits.maskToDigits(zMaskA);
    for (const z of zDigitsA) {
      const pm = techniques._findCommonPeersBS(A.candidatePositions[z - 1]);
      techniques._processElims(pm, z, pencils, elims);
    }

    // 2. Non-RCC eliminations for B
    const zMaskB = B.mask & ~rccMask;
    const zDigitsB = techniques._bits.maskToDigits(zMaskB);
    for (const z of zDigitsB) {
      const pm = techniques._findCommonPeersBS(B.candidatePositions[z - 1]);
      techniques._processElims(pm, z, pencils, elims);
    }

    // 3. RCC eliminations (common peers of RCC digits)
    const rccDigits = techniques._bits.maskToDigits(rccMask);
    for (const x of rccDigits) {
      const allX = A.candidatePositions[x - 1] | B.candidatePositions[x - 1];
      const pm = techniques._findCommonPeersBS(allX);
      techniques._processElims(pm, x, pencils, elims);
    }
    return elims;
  },

  // --- ALS-XZ & WXYZ-WING ---
  alsXZ: (board, pencils, wxyzOnly = false) => {
    // Reset cache at the start
    _alsCache = [];

    let alses = [];
    let outerLoopLimit = 0; // Controls 'i' loop
    let innerLoopStartBase = 0; // Controls 'j' loop

    if (wxyzOnly) {
      // Optimization for WXYZ: Compare Size 1 (XY) only against Size 3 (WXYZ)
      const alsesXY = techniques._collectAllALS(board, pencils, 1, 1);
      const alsesWXYZ = techniques._collectAllALS(board, pencils, 3, 3);

      // Merge into one array: [ ...XYs, ...WXYZs ]
      alses = [...alsesXY, ...alsesWXYZ];

      // We only want 'i' to iterate over the XY part
      outerLoopLimit = alsesXY.length;
      // We want 'j' to iterate over the WXYZ part (starting where XY ends)
      innerLoopStartBase = alsesXY.length;
    } else {
      // Standard ALS-XZ: Compare everything (Size 1 to 8) against everything
      alses = techniques._collectAllALS(board, pencils, 1, 8);
      _alsCache = alses;
      outerLoopLimit = alses.length;
    }

    for (let i = 0; i < outerLoopLimit; i++) {
      // For WXYZ, j starts at the WXYZ section. For normal, j starts at i + 1.
      let j = wxyzOnly ? innerLoopStartBase : i + 1;

      for (; j < alses.length; j++) {
        const A = alses[i];
        const B = alses[j];

        // --- OVERLAP LOGIC (Bitwise Optimization) ---
        // 1. Check intersection of all cells using BigInt masks
        if (wxyzOnly && (A.positions & B.positions) !== 0n) continue;

        const commonMask = A.mask & B.mask;
        if (techniques._bits.popcount(commonMask) < 2) continue;

        let rccMask = 0;
        const commonDigits = techniques._bits.maskToDigits(commonMask);

        for (const d of commonDigits) {
          // RCC VALIDATION: Digit d cannot be an RCC if it exists in an overlapping cell.
          // Bitwise check: If d exists in both A and B at the same position
          if (!wxyzOnly) {
            if (
              (A.candidatePositions[d - 1] & B.candidatePositions[d - 1]) !==
              0n
            ) {
              continue;
            }
          }

          // Standard RCC visibility check
          // (Keeping candMap loop to strictly preserve logic as requested,
          // though this could also be optimized if peer masks were pre-built)
          const dCellsA = A.candMap[d];
          const dCellsB = B.candMap[d];
          let seesAll = true;
          for (const cA of dCellsA) {
            for (const cB of dCellsB) {
              if (!techniques._sees(cA, cB)) {
                seesAll = false;
                break;
              }
            }
            if (!seesAll) break;
          }
          if (seesAll) rccMask |= 1 << (d - 1);
        }

        // If no valid RCCs remain, this pair is invalid
        if (rccMask === 0) continue;

        const rccCount = techniques._bits.popcount(rccMask);
        let elims = [];

        if (rccCount === 1) {
          elims = techniques._applySinglyLinked(
            A,
            B,
            rccMask,
            commonMask,
            pencils,
          );
        } else if (rccCount >= 2) {
          elims = techniques._applyDoublyLinked(
            A,
            B,
            rccMask,
            commonMask,
            pencils,
          );
        }

        if (elims.length > 0) {
          const uniqueElims = Array.from(
            new Set(elims.map(JSON.stringify)),
          ).map(JSON.parse);

          let name = "ALS-XZ";
          let mainInfo = `ALSes on ${A.unitName} and ${B.unitName} (${
            rccCount === 1 ? "Singly" : "Doubly"
          } linked)`;

          if (wxyzOnly) {
            name = "WXYZ-Wing";
            const pivot = A.size === 1 ? A : B;
            const [pr, pc] = pivot.cells[0];
            mainInfo = `Bivalue cell at r${pr + 1}c${pc + 1}`;
          }

          return {
            change: true,
            type: "remove",
            cells: uniqueElims,
            hint: { name, mainInfo },
          };
        }
      }
    }
    return { change: false };
  },

  wxyzWing: (board, pencils) => {
    return techniques.alsXZ(board, pencils, true);
  },

  alignedTripleExclusion: (board, pencils) => {
    // --- Helpers ---

    const _popcount = (n) => {
      n = n - ((n >> 1) & 0x55555555);
      n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
      return (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
    };

    const _getMask = (r, c) => {
      let mask = 0;
      if (pencils[r][c].size > 0) {
        for (const d of pencils[r][c]) mask |= 1 << (d - 1);
      }
      return mask;
    };

    // Finds ALS of specific 'degree' (excess candidates)
    // Degree 1: N cells, N+1 candidates (Standard ALS)
    // Degree 2: N cells, N+2 candidates (Almost Almost Locked Set)
    const _findALS_ATE = (cells, degree, max_size = 6) => {
      const alses = [];
      const n = cells.length;
      if (n === 0) return alses;

      // Iterate through all possible subset sizes
      for (let size = 1; size <= Math.min(n, max_size); size++) {
        // Defined INSIDE the loop to capture 'size'
        const combinations = (start, k, currentMask) => {
          if (k === 0) {
            // Check if the union of candidates equals size + degree
            if (_popcount(currentMask) === size + degree) {
              alses.push(currentMask);
            }
            return;
          }
          for (let i = start; i <= n - k; i++) {
            const [r, c] = cells[i];
            combinations(i + 1, k - 1, currentMask | _getMask(r, c));
          }
        };

        combinations(0, size, 0);
      }
      return alses;
    };

    const _alsCoversAtLeast = (alsMask, tripleMask, required) => {
      return _popcount(alsMask & tripleMask) >= required;
    };

    // Checks if the triple {d1, d2, d3} is covered by any ALS/AALS
    // Returns TRUE if the combination is invalid (covered/blocked)
    const _ateCheckTriple = (d1, d2, d3, alses1, alses2) => {
      const tripleMask = (1 << (d1 - 1)) | (1 << (d2 - 1)) | (1 << (d3 - 1));

      // Degree 1 ALS needs to cover at least 2 candidates
      for (const mask of alses1) {
        if (_alsCoversAtLeast(mask, tripleMask, 2)) return true;
      }
      // Degree 2 ALS needs to cover at least 3 candidates
      for (const mask of alses2) {
        if (_alsCoversAtLeast(mask, tripleMask, 3)) return true;
      }
      return false;
    };

    const eliminations = [];

    const _ateTryElim = (
      cell,
      selfMask,
      other1Mask,
      other2Mask,
      alses1,
      alses2,
      restriction,
    ) => {
      let changed = false;

      // For every candidate in the target cell
      for (let d = 1; d <= 9; d++) {
        if (!((selfMask >> (d - 1)) & 1)) continue;

        let isInvalid = true;

        // Try to find ANY valid combination of d, dA, dB
        // Loop dA (Other 1)
        for (let dA = 1; dA <= 9; dA++) {
          if (!((other1Mask >> (dA - 1)) & 1)) continue;
          if (restriction & 4 && dA === d) continue; // Constraint: Self != Other1

          let possibleWithDA = false;

          // Loop dB (Other 2)
          for (let dB = 1; dB <= 9; dB++) {
            if (!((other2Mask >> (dB - 1)) & 1)) continue;
            if (restriction & 2 && dB === d) continue; // Constraint: Self != Other2
            if (restriction & 1 && dB === dA) continue; // Constraint: Other1 != Other2

            // If checkTriple returns false, it means NO conflict, so this combo is valid
            if (!_ateCheckTriple(d, dA, dB, alses1, alses2)) {
              possibleWithDA = true;
              break; // Found a valid dB for this dA
            }
          }

          if (possibleWithDA) {
            isInvalid = false;
            break; // Found a valid dA (and dB), so d is safe
          }
        }

        if (isInvalid) {
          eliminations.push({ r: cell[0], c: cell[1], num: d });
          changed = true;
        }
      }
      return changed;
    };

    // --- ATE Type 1 Logic ---
    const _runType1 = (isRow) => {
      for (let i = 0; i < 9; i++) {
        // Line index
        for (let bSec = 0; bSec < 3; bSec++) {
          // Secondary box index
          const boxIdx = isRow
            ? Math.floor(i / 3) * 3 + bSec
            : bSec * 3 + Math.floor(i / 3);

          // 1. Find Intersection (must be exactly size 3)
          const intersection = [];
          for (let j = 0; j < 9; j++) {
            const r = isRow ? i : j;
            const c = isRow ? j : i;
            if (board[r][c] === 0 && techniques._getBoxIndex(r, c) === boxIdx) {
              intersection.push([r, c]);
            }
          }
          if (intersection.length !== 3) continue;

          const [p1, p2, p3] = intersection;

          // 2. Find Rest Cells
          const lineRest = [];
          for (let j = 0; j < 9; j++) {
            const r = isRow ? i : j;
            const c = isRow ? j : i;
            if (
              board[r][c] === 0 &&
              !intersection.some(([pr, pc]) => pr === r && pc === c)
            ) {
              lineRest.push([r, c]);
            }
          }
          if (lineRest.length === 0) continue;

          const boxRest = [];
          const boxCells = techniques._getUnitCells("box", boxIdx);
          for (const [r, c] of boxCells) {
            if (
              board[r][c] === 0 &&
              !intersection.some(([pr, pc]) => pr === r && pc === c)
            ) {
              boxRest.push([r, c]);
            }
          }
          if (boxRest.length === 0) continue;

          // 3. Find ALSs
          // Degree 1 (Standard) and Degree 2 (AALS)
          const lineALS1 = _findALS_ATE(lineRest, 1);
          const boxALS1 = _findALS_ATE(boxRest, 1);
          const lineALS2 = _findALS_ATE(lineRest, 2);
          const boxALS2 = _findALS_ATE(boxRest, 2);

          if (
            (lineALS1.length === 0 && lineALS2.length === 0) ||
            (boxALS1.length === 0 && boxALS2.length === 0)
          )
            continue;

          const alses1 = [...lineALS1, ...boxALS1];
          const alses2 = [...lineALS2, ...boxALS2];

          const m1 = _getMask(p1[0], p1[1]);
          const m2 = _getMask(p2[0], p2[1]);
          const m3 = _getMask(p3[0], p3[1]);

          // Restriction 0b111: All cells see each other (same row/box intersection)
          if (_ateTryElim(p1, m1, m2, m3, alses1, alses2, 0b111))
            return {
              found: true,
              info: `${isRow ? "Row" : "Col"} ${i + 1}, Box ${boxIdx + 1}`,
            };
          if (_ateTryElim(p2, m2, m1, m3, alses1, alses2, 0b111))
            return {
              found: true,
              info: `${isRow ? "Row" : "Col"} ${i + 1}, Box ${boxIdx + 1}`,
            };
          if (_ateTryElim(p3, m3, m1, m2, alses1, alses2, 0b111))
            return {
              found: true,
              info: `${isRow ? "Row" : "Col"} ${i + 1}, Box ${boxIdx + 1}`,
            };
        }
      }
      return { found: false };
    };

    // --- ATE Type 2 Logic ---
    const _runType2 = (isRow) => {
      const tempPairs = [
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 2],
        [2, 0],
        [2, 1],
      ];

      for (let chute = 0; chute < 3; chute++) {
        // Define Units and Boxes for this chute
        const units = [chute * 3, chute * 3 + 1, chute * 3 + 2];
        const boxes = isRow
          ? [chute * 3, chute * 3 + 1, chute * 3 + 2]
          : [chute, chute + 3, chute + 6];

        for (const [uIdxA, uIdxB] of tempPairs) {
          const uA = units[uIdxA];
          const uB = units[uIdxB];

          for (const [bIdxA, bIdxB] of tempPairs) {
            const bA = boxes[bIdxA];
            const bB = boxes[bIdxB];

            // 1. Find Intersections (ALS areas)
            const getInter = (lineIdx, boxIdx) => {
              const res = [];
              const bCells = techniques._getUnitCells("box", boxIdx);
              for (const [r, c] of bCells) {
                if (board[r][c] === 0) {
                  const lineMatch = isRow ? r === lineIdx : c === lineIdx;
                  if (lineMatch) res.push([r, c]);
                }
              }
              return res;
            };

            const inter_uA_bB = getInter(uA, bB);
            const inter_uB_bA = getInter(uB, bA);

            if (inter_uA_bB.length === 0 || inter_uB_bA.length === 0) continue;

            // 2. Find ALSs
            const als1_A = _findALS_ATE(inter_uA_bB, 1, 3);
            const als1_B = _findALS_ATE(inter_uB_bA, 1, 3);
            const als2_A = _findALS_ATE(inter_uA_bB, 2, 3);
            const als2_B = _findALS_ATE(inter_uB_bA, 2, 3);

            if (
              (als1_A.length === 0 && als2_A.length === 0) ||
              (als1_B.length === 0 && als2_B.length === 0)
            )
              continue;

            const alses1 = [...als1_A, ...als1_B];
            const alses2 = [...als2_A, ...als2_B];

            // 3. Define Pivot Groups
            // P1 group from uA n bA
            // P3 group from uB n bB
            const P1_unit = getInter(uA, bA);
            const P3_unit = getInter(uB, bB);

            if (P1_unit.length < 2 || P3_unit.length === 0) continue;

            // 4. Check combinations
            for (let a = 0; a < P1_unit.length; a++) {
              for (let b = a + 1; b < P1_unit.length; b++) {
                const p1 = P1_unit[a];
                const p2 = P1_unit[b];

                for (const p3 of P3_unit) {
                  const m1 = _getMask(p1[0], p1[1]);
                  const m2 = _getMask(p2[0], p2[1]);
                  const m3 = _getMask(p3[0], p3[1]);

                  // Try Elim with Restrictions:
                  // Target p1: p1!=p2 (0b100)
                  if (_ateTryElim(p1, m1, m2, m3, alses1, alses2, 0b100))
                    return {
                      found: true,
                      info: `Chute ${isRow ? "Row" : "Col"} ${chute * 3 + 1}-${
                        chute * 3 + 3
                      }`,
                    };

                  // Target p2: p2!=p1 (0b100) -> swapped other1/other2 semantics in helper call relative to logic
                  // helper: (self, other1, other2). restriction & 4 is self!=other1
                  if (_ateTryElim(p2, m2, m1, m3, alses1, alses2, 0b100))
                    return {
                      found: true,
                      info: `Chute ${isRow ? "Row" : "Col"} ${chute * 3 + 1}-${
                        chute * 3 + 3
                      }`,
                    };

                  // Target p3: p1!=p2 (0b001) -> other1!=other2
                  if (_ateTryElim(p3, m3, m1, m2, alses1, alses2, 0b001))
                    return {
                      found: true,
                      info: `Chute ${isRow ? "Row" : "Col"} ${chute * 3 + 1}-${
                        chute * 3 + 3
                      }`,
                    };
                }
              }
            }
          }
        }
      }
      return { found: false };
    };

    // --- Execution ---
    let res = _runType1(true);
    if (!res.found) res = _runType1(false);

    let typeName = "ATE Type 1";
    if (!res.found) {
      res = _runType2(true);
      if (!res.found) res = _runType2(false);
      typeName = "ATE Type 2";
    }

    if (res.found && eliminations.length > 0) {
      // Deduplicate eliminations
      const uniqueElims = [];
      const seen = new Set();
      for (const e of eliminations) {
        const k = `${e.r},${e.c},${e.num}`;
        if (!seen.has(k)) {
          seen.add(k);
          uniqueElims.push(e);
        }
      }

      return {
        change: true,
        type: "remove",
        cells: uniqueElims,
        hint: {
          name: typeName,
          mainInfo: res.info,
        },
      };
    }

    return { change: false };
  },
  // --- ALS CHAIN SUPPORT STRUCTURES ---

  /**
   * Helper: Calculates the bitwise intersection of peers for a set of cells (given as a BigInt mask).
   * Returns a BigInt mask of common peers.
   */
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

  /**
   * Core DFS logic for ALS Chains.
   * Supports both Ring (Continuous Loop) and Linear Chain eliminations.
   * Corresponds to C++: als_chain_core
   */
  _alsChainCore: (
    board,
    pencils,
    minLen,
    maxLen,
    nameOverride = "ALS Chain",
  ) => {
    let eliminations = [];
    let found = false;
    let successPath = null; // To store the path that triggered the elimination

    // Helper: Eliminate RCC from common peers of the link (Used for Rings)
    const eliminateRccPeers = (alsA, alsB, rccDigit) => {
      let changed = false;
      const allCells =
        alsA.candidatePositions[rccDigit - 1] |
        alsB.candidatePositions[rccDigit - 1];
      const peerMask = techniques._findCommonPeersBS(allCells);
      techniques._processElims(peerMask, rccDigit, pencils, eliminations);
      if (eliminations.length > 0) changed = true; // Optimization: _processElims pushes to array
      return changed;
    };

    // DFS Function
    const dfs = (path, visited) => {
      if (found) return;

      const lastStep = path[path.length - 1];
      const neighbors = _alsRccMap[lastStep.hash];
      if (!neighbors) return;

      for (const { hash: nbrHash, digit: d } of neighbors) {
        if (found) return;

        // Cannot use the same digit to enter and exit an ALS
        if (d === lastStep.viaDigit) continue;
        if (visited.has(nbrHash)) continue;

        // Prepare next step
        path.push({ hash: nbrHash, viaDigit: d });
        visited.add(nbrHash);

        const len = path.length;

        // Check Constraints
        if (len >= minLen && len <= maxLen) {
          const alsStart = _alsLookup[path[0].hash];
          const alsEnd = _alsLookup[nbrHash];
          let isRing = false;

          // --- 1. PRIORITY: Check for Ring (Continuous Loop) ---
          const endNeighbors = _alsRccMap[alsEnd.hash];
          if (endNeighbors) {
            for (const {
              hash: closingHash,
              digit: closingRcc,
            } of endNeighbors) {
              if (closingHash === alsStart.hash) {
                const startExitDigit = path[1].viaDigit;
                const endEntryDigit = d;

                if (
                  closingRcc !== startExitDigit &&
                  closingRcc !== endEntryDigit
                ) {
                  isRing = true;

                  let ringChange = false;
                  // A. Internal links
                  for (let i = 0; i < path.length - 1; i++) {
                    const a = _alsLookup[path[i].hash];
                    const b = _alsLookup[path[i + 1].hash];
                    const rcc = path[i + 1].viaDigit;
                    if (eliminateRccPeers(a, b, rcc)) ringChange = true;
                  }
                  // B. Closing link
                  if (eliminateRccPeers(alsEnd, alsStart, closingRcc))
                    ringChange = true;

                  if (ringChange) {
                    found = true;
                    successPath = [...path]; // Capture path
                    return;
                  }
                }
              }
            }
          }

          // --- 2. If not a Ring, Check Linear Chain Elimination ---
          if (!found && !isRing) {
            const commonMask = alsStart.candidates & alsEnd.candidates;
            if (commonMask !== 0) {
              const disallow1 = path[1].viaDigit; // Exit from start
              const disallow2 = d; // Entry to end

              let localChange = false;
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
                const prevLen = eliminations.length;
                techniques._processElims(peerMask, z, pencils, eliminations);
                if (eliminations.length > prevLen) localChange = true;
              }

              if (localChange) {
                found = true;
                successPath = [...path]; // Capture path
              }
            }
          }
        }

        if (!found && len < maxLen) {
          dfs(path, visited);
        }

        // Backtrack
        path.pop();
        visited.delete(nbrHash);
      }
    };

    // Start DFS from every ALS
    for (const als of _alsCache) {
      if (found) break;
      dfs([{ hash: als.hash, viaDigit: 0 }], new Set([als.hash]));
    }

    if (found && eliminations.length > 0) {
      const uniqueElims = Array.from(
        new Set(eliminations.map(JSON.stringify)),
      ).map(JSON.parse);

      // --- Hint Construction ---
      let info = `Length ${minLen} Chain found`;

      // Specific Format for ALS XY-Wing (Length 3 Linear Chain)
      // Structure: Start(A) -[rcc1]- Pivot(B) -[rcc2]- End(C)
      if (
        nameOverride === "ALS XY-Wing" &&
        successPath &&
        successPath.length === 3
      ) {
        const pivotNode = _alsLookup[successPath[1].hash];
        const pivotLoc = techniques._fmtNode(pivotNode);

        const rcc1 = successPath[1].viaDigit; // Digit entering Pivot
        const rcc2 = successPath[2].viaDigit; // Digit leaving Pivot

        info = `Pivot ALS: -(${rcc1}=${rcc2})${pivotLoc}-`;
      } else if (successPath) {
        const startNode = _alsLookup[successPath[0].hash];
        // The digit used to exit the start node is stored in the *next* step's viaDigit
        const firstRcc = successPath[1].viaDigit;

        // Remaining digits = All Candidates & ~RCC
        const remMask = startNode.candidates & ~(1 << (firstRcc - 1));
        const remStr = techniques._bits.maskToDigits(remMask).join("");
        const loc = techniques._fmtNode(startNode);

        info = `Start with (${remStr}=${firstRcc})${loc}`;
      }

      return {
        change: true,
        type: "remove",
        cells: uniqueElims,
        hint: {
          name: nameOverride,
          mainInfo: info,
        },
      };
    }

    return { change: false };
  },
  /**
   * ALS XY-Wing Wrapper
   * Length 3 chain (ALS A - ALS B - ALS C)
   * Corresponds to C++: als_xy_wing()
   */
  alsXYWing: (board, pencils) => {
    if (_alsCache.legnth === 0)
      _alsCache = techniques._collectAllALS(board, pencils, 1, 8);
    techniques._buildAlsDigitCommonPeers();
    techniques._buildAlsRccMap();

    return techniques._alsChainCore(board, pencils, 3, 3, "ALS XY-Wing");
  },

  alsChain: (board, pencils) => {
    if (_alsCache.legnth === 0)
      _alsCache = techniques._collectAllALS(board, pencils, 1, 8);
    if (_alsDigitCommonPeers.length === 0) {
      techniques._buildAlsDigitCommonPeers();
      techniques._buildAlsRccMap();
    }
    return techniques._alsChainCore(board, pencils, 4, 5, "ALS Chain");
  },

  // --- ALS W-WING & HELPERS ---

  _digitRowMasks: [],
  _digitColMasks: [],
  _digitBoxMasks: [],

  /**
   * Precomputes bitmasks for candidate locations for every digit in every unit.
   * Corresponds to C++: precompute_digit_locations()
   */
  _precomputeDigitLocations: (board, pencils) => {
    // Initialize 9x9 arrays with 0 (for digits 1-9)
    techniques._digitRowMasks = Array.from({ length: 9 }, () =>
      new Int32Array(9).fill(0),
    );
    techniques._digitColMasks = Array.from({ length: 9 }, () =>
      new Int32Array(9).fill(0),
    );
    techniques._digitBoxMasks = Array.from({ length: 9 }, () =>
      new Int32Array(9).fill(0),
    );

    for (let d = 1; d <= 9; d++) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] === 0 && pencils[r][c].has(d)) {
            // Row mask: set bit 'c' for row 'r'
            techniques._digitRowMasks[d - 1][r] |= 1 << c;
            // Col mask: set bit 'r' for col 'c'
            techniques._digitColMasks[d - 1][c] |= 1 << r;
            // Box mask: set bit 'indexInBox' for 'boxIndex'
            const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
            const idxInBox = (r % 3) * 3 + (c % 3);
            techniques._digitBoxMasks[d - 1][b] |= 1 << idxInBox;
          }
        }
      }
    }
  },

  // Helpers to convert BigInt 81-bit position masks to 9-bit unit masks
  _bigIntToRowMask: (bigInt, r) => Number((bigInt >> BigInt(r * 9)) & 511n),

  _bigIntToColMask: (bigInt, c) => {
    let mask = 0;
    for (let r = 0; r < 9; r++) {
      if ((bigInt >> BigInt(r * 9 + c)) & 1n) mask |= 1 << r;
    }
    return mask;
  },

  _bigIntToBoxMask: (bigInt, b) => {
    let mask = 0;
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    for (let i = 0; i < 9; i++) {
      const r = br + Math.floor(i / 3);
      const c = bc + (i % 3);
      if ((bigInt >> BigInt(r * 9 + c)) & 1n) mask |= 1 << i;
    }
    return mask;
  },

  /**
   * Checks if a specific unit acts as a bridge for digit 'd' between two ALSs.
   * C++ Logic: unit_covered_by_pair
   */
  _unitCoveredByPair: (als1, als2, d, unitType, idx) => {
    let unitMask = 0;
    // Retrieve precomputed mask of ALL candidates for d in this unit
    if (unitType === 0) unitMask = techniques._digitRowMasks[d - 1][idx];
    else if (unitType === 1) unitMask = techniques._digitColMasks[d - 1][idx];
    else unitMask = techniques._digitBoxMasks[d - 1][idx];

    // Need at least 2 cells to be a valid bridge/RCC relevance
    let cnt = 0;
    let m = unitMask;
    while (m) {
      m &= m - 1;
      cnt++;
    }
    if (cnt < 2) return false;

    // Calculate masks of d-cells belonging to ALS1 and ALS2 within this unit
    let aMask = 0,
      bMask = 0;
    const p1 = als1.candidatePositions[d - 1];
    const p2 = als2.candidatePositions[d - 1];

    if (unitType === 0) {
      aMask = techniques._bigIntToRowMask(p1, idx);
      bMask = techniques._bigIntToRowMask(p2, idx);
    } else if (unitType === 1) {
      aMask = techniques._bigIntToColMask(p1, idx);
      bMask = techniques._bigIntToColMask(p2, idx);
    } else {
      aMask = techniques._bigIntToBoxMask(p1, idx);
      bMask = techniques._bigIntToBoxMask(p2, idx);
    }

    // Reject if any ALS's d-cells overlap with the unit's d-cells.
    // (The bridge unit must be external to the ALS cells themselves)
    if (((aMask | bMask) & unitMask) !== 0) return false;

    // Check peer coverage:
    // The union of common peers of ALS1 and ALS2 must cover all d-candidates in the unit.
    const aPeers = _alsDigitCommonPeers[als1.hash][d - 1];
    const bPeers = _alsDigitCommonPeers[als2.hash][d - 1];

    if (aPeers === 0n || bPeers === 0n) return false;

    let aPeerMask = 0,
      bPeerMask = 0;
    if (unitType === 0) {
      aPeerMask = techniques._bigIntToRowMask(aPeers, idx);
      bPeerMask = techniques._bigIntToRowMask(bPeers, idx);
    } else if (unitType === 1) {
      aPeerMask = techniques._bigIntToColMask(aPeers, idx);
      bPeerMask = techniques._bigIntToColMask(bPeers, idx);
    } else {
      aPeerMask = techniques._bigIntToBoxMask(aPeers, idx);
      bPeerMask = techniques._bigIntToBoxMask(bPeers, idx);
    }

    const combined = aPeerMask | bPeerMask;
    // Check if 'combined' peers cover all bits in 'unitMask'
    return (unitMask & ~combined) === 0;
  },

  alsWWing: (board, pencils) => {
    if (_alsCache.legnth === 0)
      _alsCache = techniques._collectAllALS(board, pencils, 1, 8);

    techniques._buildAlsDigitCommonPeers();
    techniques._buildAlsRccMap();
    techniques._precomputeDigitLocations(board, pencils);

    const alses = _alsCache;

    for (let i = 0; i < alses.length; i++) {
      for (let j = i + 1; j < alses.length; j++) {
        const A = alses[i];
        const B = alses[j];

        // Basic filters matching C++ logic
        const popA = techniques._bits.popcount(A.mask);
        const popB = techniques._bits.popcount(B.mask);

        // Skip standard W-Wings (2x2 bivalue cells) or specific size combos excluded in C++
        if (popA + popB === 4) continue;

        const commonMask = A.mask & B.mask;
        if (techniques._bits.popcount(commonMask) < 2) continue;

        let rccMask = 0;
        const commonDigits = techniques._bits.maskToDigits(commonMask);

        for (const d of commonDigits) {
          // Disallow direct overlap of d-cells between A and B
          if (
            (A.candidatePositions[d - 1] & B.candidatePositions[d - 1]) !==
            0n
          )
            continue;

          // 1. Detect "Virtual RCCs" (Bridge via Row/Col/Box)
          let foundVirtual = false;
          // Unit types: 0=Row, 1=Col, 2=Box
          for (let ut = 0; ut < 3 && !foundVirtual; ut++) {
            for (let idx = 0; idx < 9 && !foundVirtual; idx++) {
              if (techniques._unitCoveredByPair(A, B, d, ut, idx)) {
                rccMask |= 1 << (d - 1);
                foundVirtual = true;
              }
            }
          }
          if (foundVirtual) continue;

          // 2. Include Cached RCCs (Standard RCCs)
          const neighbors = _alsRccMap[A.hash];
          if (neighbors) {
            for (const n of neighbors) {
              if (n.hash === B.hash && n.digit === d) {
                rccMask |= 1 << (d - 1);
              }
            }
          }
        }

        if (rccMask === 0) continue;

        // --- ELIMINATIONS ---
        const rccCount = techniques._bits.popcount(rccMask);
        let elims = [];

        if (rccCount === 1) {
          elims = techniques._applySinglyLinked(
            A,
            B,
            rccMask,
            commonMask,
            pencils,
          );
        } else {
          elims = techniques._applyDoublyLinked(
            A,
            B,
            rccMask,
            commonMask,
            pencils,
          );
        }

        if (elims.length > 0) {
          const uniqueElims = Array.from(
            new Set(elims.map(JSON.stringify)),
          ).map(JSON.parse);

          return {
            change: true,
            type: "remove",
            cells: uniqueElims,
            hint: {
              name: "ALS W-Wing",
              mainInfo: `${A.unitName} and ${B.unitName}`,
            },
          };
        }
      }
    }
    return { change: false };
  },
  // --- DEATH BLOSSOM ---
  deathBlossom: (board, pencils) => {
    if (_alsCache.legnth === 0)
      _alsCache = techniques._collectAllALS(board, pencils, 1, 8);

    // 1. Call Cache
    const alses = _alsCache;

    // 2. Precompute per-ALS per-digit peer masks
    // Corresponds to C++: als_digit_peer_mask[ai][d]
    // Stores the intersection of peers for all cells in ALS[i] that contain digit d
    const alsDigitPeerMask = new Array(alses.length);
    for (let i = 0; i < alses.length; i++) {
      alsDigitPeerMask[i] = new Array(9).fill(0n); // 0n for empty/none
      for (let d = 1; d <= 9; d++) {
        const dCells = alses[i].candidatePositions[d - 1];
        if (dCells !== 0n) {
          alsDigitPeerMask[i][d - 1] = techniques._findCommonPeersBS(dCells);
        }
      }
    }

    // 3. Collect Stem Cells (Cells with 3 to 6 candidates)
    const stems = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const mask = techniques._bits.maskFromSet(pencils[r][c]);
        const count = techniques._bits.popcount(mask);
        if (count >= 3 && count <= 6) {
          stems.push({ r, c, mask, count, id: r * 9 + c });
        }
      }
    }
    // Sort stems by candidate count (ascending) to process simpler cases first
    stems.sort((a, b) => a.count - b.count);

    // 4. Process each Stem
    for (const stem of stems) {
      const { r, c, mask: stemMask, count: stemCount, id: stemId } = stem;
      const stemIdBn = BigInt(stemId);

      // Build Pool of valid Petals (ALSs) for this stem
      // A valid petal must:
      // 1. Not contain the stem cell itself.
      // 2. "Cover" at least one digit of the stem (see the stem cell via common peers).
      // 3. Have "Z" candidates (candidates NOT in the stem).
      const pool = []; // Array of { alsIdx, covers, z }

      for (let i = 0; i < alses.length; i++) {
        const als = alses[i];

        // 1. Check overlap with stem cell
        if ((als.positions & (1n << stemIdBn)) !== 0n) continue;

        let covers = 0;
        // 2. Check coverage: An ALS covers digit d if its d-peers include the stem cell
        const digits = techniques._bits.maskToDigits(stemMask);
        for (const d of digits) {
          const peerMask = alsDigitPeerMask[i][d - 1];
          // Check if stemId bit is set in peerMask
          if ((peerMask & (1n << stemIdBn)) !== 0n) {
            covers |= 1 << (d - 1);
          }
        }

        if (covers === 0) continue;

        // 3. Check Z candidates (ALS candidates excluding Stem candidates)
        const z = als.candidates & ~stemMask;
        if (z === 0) continue;

        pool.push({ alsIdx: i, covers, z });
      }

      if (pool.length < 2) continue;

      // DFS State
      const chosen = []; // Stack of currently selected petals
      const seenCombos = new Set(); // For deduplication (String key)
      let foundAny = false;
      const eliminations = [];

      // Recursive Search
      const dfs = (startIndex, coveredMask, possibleElimMask, depth) => {
        // --- CHECK FOR ELIMINATION ---
        // Condition: All stem candidates are covered by the chosen petals
        if (coveredMask === stemMask && depth >= 2 && depth <= stemCount) {
          if (possibleElimMask !== 0) {
            const elimDigits = techniques._bits.maskToDigits(possibleElimMask);

            for (const d of elimDigits) {
              // Find intersection of peer masks for digit d across ALL chosen petals
              let intersectPeers = ~0n; // Start with all ones
              let first = true;
              let empty = false;

              for (const petal of chosen) {
                const pm = alsDigitPeerMask[petal.alsIdx][d - 1];
                if (pm === 0n) {
                  empty = true;
                  break;
                }

                if (first) {
                  intersectPeers = pm;
                  first = false;
                } else {
                  intersectPeers &= pm;
                }

                if (intersectPeers === 0n) {
                  empty = true;
                  break;
                }
              }

              if (empty) continue;

              // Eliminate d from any cell in intersectPeers that currently has it
              let m = intersectPeers;
              let idx = 0;
              while (m !== 0n) {
                if (m & 1n) {
                  const rr = Math.floor(idx / 9);
                  const cc = idx % 9;
                  if (pencils[rr][cc].has(d)) {
                    eliminations.push({ r: rr, c: cc, num: d });
                    foundAny = true;
                  }
                }
                m >>= 1n;
                idx++;
              }
            }
          }
          // Do not return; continue searching for other valid combinations using this base
        }

        // Pruning
        if (depth >= stemCount) return;

        // --- RECURSIVE STEP ---
        for (let i = startIndex; i < pool.length; i++) {
          const p = pool[i];

          // Deduplicate: Create a unique key for this set of ALS indices
          // (Simpler than FNV hash, uses sorted string key)
          const indices = chosen.map((c) => c.alsIdx);
          indices.push(p.alsIdx);
          indices.sort((a, b) => a - b);
          const key = indices.join(",");

          if (seenCombos.has(key)) continue;

          const newCovered = coveredMask | p.covers;

          // Update possible elim mask: Must be in Z of PREVIOUS petals AND NEW petal
          // (Intersection of all Zs)
          const newPossibleElim = possibleElimMask & p.z;

          if (newPossibleElim === 0) {
            seenCombos.add(key);
            continue;
          }

          // --- VALIDATION (Forward Checking) ---
          // Ensure that for every digit in newPossibleElim, the intersection of peers
          // (current chosen + new petal) is non-empty AND contains at least one target cell.
          let validatedMask = 0;
          const checkDigits = techniques._bits.maskToDigits(newPossibleElim);

          for (const d of checkDigits) {
            let inter = ~0n;
            let first = true;
            let invalid = false;

            // 1. Intersection with existing chosen petals
            for (const c of chosen) {
              const pm = alsDigitPeerMask[c.alsIdx][d - 1];
              if (pm === 0n) {
                invalid = true;
                break;
              }
              if (first) {
                inter = pm;
                first = false;
              } else {
                inter &= pm;
              }
              if (inter === 0n) {
                invalid = true;
                break;
              }
            }
            if (invalid) continue;

            // 2. Intersection with new petal
            const pm = alsDigitPeerMask[p.alsIdx][d - 1];
            if (pm === 0n) continue;
            if (first) inter = pm;
            else inter &= pm;
            if (inter === 0n) continue;

            // 3. Ensure candidate exists in at least one cell in the intersection
            let exists = false;
            let m = inter;
            let idx = 0;
            while (m !== 0n) {
              if (m & 1n) {
                const rr = Math.floor(idx / 9);
                const cc = idx % 9;
                if (pencils[rr][cc].has(d)) {
                  exists = true;
                  break;
                }
              }
              m >>= 1n;
              idx++;
            }

            if (exists) validatedMask |= 1 << (d - 1);
          }

          if (validatedMask === 0) {
            seenCombos.add(key);
            continue;
          }

          // Recurse
          chosen.push(p);
          dfs(i + 1, newCovered, validatedMask, depth + 1);
          chosen.pop();

          // Mark as seen after exploring
          seenCombos.add(key);
        }
      };

      // Start DFS for this stem
      // possibleElimMask starts as 0x1FF (all 9 digits candidates)
      dfs(0, 0, 0x1ff, 0);

      // If eliminations found for this stem, return immediately
      if (foundAny && eliminations.length > 0) {
        const uniqueElims = Array.from(
          new Set(eliminations.map(JSON.stringify)),
        ).map(JSON.parse);
        return {
          change: true,
          type: "remove",
          cells: uniqueElims,
          hint: {
            name: "Death Blossom",
            mainInfo: `Stem cell r${r + 1}c${c + 1}`,
          },
        };
      }
    }

    return { change: false };
  },
  _complexFishCore: (board, pencils, fishSize, isMutant) => {
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
        for (let ia = 0; ia < B - 2 && !changed; ia++) {
          for (let ib = ia + 1; ib < B - 1 && !changed; ib++) {
            for (let ic = ib + 1; ic < B && !changed; ic++) {
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
              for (let ca = 0; ca < C - 2 && !changed; ca++) {
                for (let cbx = ca + 1; cbx < C - 1 && !changed; cbx++) {
                  for (let cc = cbx + 1; cc < C && !changed; cc++) {
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
                      const name = isMutant
                        ? "Finned Mutant Swordfish"
                        : "Finned Franken Swordfish";
                      return {
                        change: true,
                        type: "remove",
                        cells: elims,
                        hint: {
                          name: name,
                          mainInfo: `Digit ${num}`,
                        },
                      };
                    }
                  }
                }
              }
            }
          }
        }
      } // End Base Loops

      if (changed) break;
      memoSet.add(memoKey); // Cache processed result
    }

    return { change: false };
  },

  finnedFrankenSwordfish: (board, pencils) => {
    return techniques._complexFishCore(board, pencils, 3, false);
  },

  finnedMutantSwordfish: (board, pencils) => {
    return techniques._complexFishCore(board, pencils, 3, true);
  },
};
