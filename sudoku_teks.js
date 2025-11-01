const techniques = {
  _getBoxIndex: (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3),

  _cellToId: (r, c) => r * 9 + c,
  _idToCell: (id) => [Math.floor(id / 9), id % 9],

  _sees: (cell1, cell2) => {
    const [r1, c1] = cell1;
    const [r2, c2] = cell2;
    if (r1 === r2 && c1 === c2) return false;
    if (r1 === r2 || c1 === c2) return true;
    return techniques._getBoxIndex(r1, c1) === techniques._getBoxIndex(r2, c2);
  },

  _commonVisibleCells: (cell1, cell2) => {
    const id1 = techniques._cellToId(cell1[0], cell1[1]);
    const id2 = techniques._cellToId(cell2[0], cell2[1]);
    const peers1 = PEER_MAP[id1];
    const peers2 = PEER_MAP[id2];
    const common = [];
    for (const peerId of peers1) {
      if (peers2.has(peerId)) {
        common.push(techniques._idToCell(peerId));
      }
    }
    return common;
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

  eliminateCandidates: (board, pencils) => {
    const removals = [];
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
        new Set(removals.map(JSON.stringify))
      ).map(JSON.parse);
      return { change: true, type: "remove", cells: uniqueRemovals };
    }
    return { change: false };
  },

  nakedSingle: (board, pencils) => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0 && pencils[r][c].size === 1) {
          const num = pencils[r][c].values().next().value;
          return { change: true, type: "place", r, c, num };
        }
      }
    }
    return { change: false };
  },

  hiddenSingle: (board, pencils) => {
    const units = [];
    for (let i = 0; i < 9; i++) {
      units.push(techniques._getUnitCells("row", i));
      units.push(techniques._getUnitCells("col", i));
      units.push(techniques._getUnitCells("box", i));
    }
    for (const unit of units) {
      for (let num = 1; num <= 9; num++) {
        const possibleCells = [];
        for (const [r, c] of unit) {
          if (board[r][c] === 0 && pencils[r][c].has(num)) {
            possibleCells.push([r, c]);
          }
        }
        if (possibleCells.length === 1) {
          const [r, c] = possibleCells[0];
          return { change: true, type: "place", r, c, num };
        }
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
              return { change: true, type: "remove", cells: removals };
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
              return { change: true, type: "remove", cells: removals };
            }
          }
        }
      }
    }

    return { change: false };
  },

  intersection: (board, pencils) => {
    // --- 1. Pointing (Line -> Box) ---
    for (let i = 0; i < 9; i++) {
      // i is row or column index
      for (let num = 1; num <= 9; num++) {
        // Check for pointing pairs/triples in rows
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
            return { change: true, type: "remove", cells: removals };
          }
        }

        // Check for pointing pairs/triples in columns
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
            return { change: true, type: "remove", cells: removals };
          }
        }
      }
    }

    // --- 2. Claiming (Box -> Line) ---
    for (let boxIdx = 0; boxIdx < 9; boxIdx++) {
      for (let num = 1; num <= 9; num++) {
        const boxCellsWithNum = [];
        const boxCells = techniques._getUnitCells("box", boxIdx);
        for (const [r, c] of boxCells) {
          if (pencils[r][c].has(num)) boxCellsWithNum.push([r, c]);
        }

        if (boxCellsWithNum.length > 1) {
          // Check for claiming in a row
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
              return { change: true, type: "remove", cells: removals };
            }
          }
          // Check for claiming in a column
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
              return { change: true, type: "remove", cells: removals };
            }
          }
        }
      }
    }

    return { change: false };
  },

  nakedSubset: (board, pencils, size) => {
    const units = [];
    for (let i = 0; i < 9; i++) {
      units.push(techniques._getUnitCells("row", i));
      units.push(techniques._getUnitCells("col", i));
      units.push(techniques._getUnitCells("box", i));
    }
    for (const unit of units) {
      const emptyCells = unit.filter(([r, c]) => board[r][c] === 0);
      if (emptyCells.length < 2 * size) continue;
      const potentialCells = unit.filter(
        ([r, c]) =>
          board[r][c] === 0 &&
          pencils[r][c].size >= 2 &&
          pencils[r][c].size <= size
      );
      if (potentialCells.length < size) continue;
      for (const cellGroup of techniques.combinations(potentialCells, size)) {
        const union = new Set();
        cellGroup.forEach(([r, c]) =>
          pencils[r][c].forEach((p) => union.add(p))
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
            return { change: true, type: "remove", cells: removals };
        }
      }
    }
    return { change: false };
  },

  hiddenSubset: (board, pencils, size) => {
    for (const unit of ALL_UNITS) {
      const emptyCells = unit.filter(([r, c]) => board[r][c] === 0);
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
              cellUnion.add(techniques._cellToId(cell[0], cell[1]))
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
            return { change: true, type: "remove", cells: removals };
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
            indices.forEach((idx) => allSecondaryIndices.add(idx))
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
              return { change: true, type: "remove", cells: removals };
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
        fishSize
      )) {
        const allCoverIndicesSet = new Set();
        baseLines.forEach((line) =>
          line.locs.forEach((loc) => allCoverIndicesSet.add(loc))
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
          fishSize
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
            fins.map(([r, c]) => techniques._getBoxIndex(r, c))
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
            return { change: true, type: "remove", cells: removals };
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
          !cell.cands.includes(y)
      );
      const pincer2Candidates = bivalueCells.filter(
        (cell) =>
          (cell.r !== pivot.r || cell.c !== pivot.c) &&
          techniques._sees([cell.r, cell.c], [pivot.r, pivot.c]) &&
          cell.cands.includes(y) &&
          !cell.cands.includes(x)
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
              [pincer2.r, pincer2.c]
            );
            for (const [r, c] of commonSeers) {
              if (pencils[r][c].has(z) && !(r === pivot.r && c === pivot.c)) {
                removals.push({ r, c, num: z });
              }
            }
            if (removals.length > 0) {
              return { change: true, type: "remove", cells: removals };
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
          [...cell.cands].every((cand) => pivot.cands.has(cand))
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
          [...wing1.cands].filter((c) => wing2.cands.has(c))
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
            return { change: true, type: "remove", cells: removals };
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
        y
      );
      if (result.change) return result;
      // Strong link on y, eliminate x
      result = techniques._findWWingElimination(
        board,
        pencils,
        cell1,
        cell2,
        y,
        x
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
            [cell2.r, cell2.c]
          );
          for (const [r, c] of commonSeers) {
            if (pencils[r][c].has(y)) {
              removals.push({ r, c, num: y });
            }
          }
          if (removals.length > 0) {
            return { change: true, type: "remove", cells: removals };
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
                (r === cell2.r && c === cell2.c)
            )
          ) {
            continue;
          }

          const x_cells_in_unit = unit.filter(([r, c]) =>
            pencils[r][c].has(linkDigit)
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
              [cell2.r, cell2.c]
            );
            for (const [r, c] of commonPeers) {
              if (pencils[r][c].has(elimDigit)) {
                removals.push({ r, c, num: elimDigit });
              }
            }
            if (removals.length > 0) {
              return { change: true, type: "remove", cells: removals };
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
              return { change: true, type: "remove", cells: removals };
            }
          }

          const currentStr = JSON.stringify(current);
          for (const neighbor of adj.get(currentStr)) {
            if (
              !path.some((p) => p[0] === neighbor[0] && p[1] === neighbor[1])
            ) {
              const newPath = [...path, neighbor];
              const newPathStr = JSON.stringify(
                newPath.map((p) => p.join(",")).sort()
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
            return { change: true, type: "remove", cells: removals };
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
                  rowLinkCells[i][1]
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
                  pencils[r][c].has(num)
                );

                if (strongLinkLocs.length === 2) {
                  const pD = strongLinkLocs.find(
                    (cell) => cell[0] !== pC[0] || cell[1] !== pC[1]
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

  rectangleElimination: (board, pencils) => {
    let result = techniques.groupedTurbotFish(board, pencils);
    if (result.change) return result;
    result = techniques.groupedKite(board, pencils);
    return result;
  },

  groupedTurbotFish: (board, pencils) => {
    const logic = (isRowVersion) => {
      for (let num = 1; num <= 9; num++) {
        for (let b = 0; b < 9; b++) {
          const boxCells = techniques._getUnitCells("box", b);
          const box_n_cells = boxCells.filter(([r, c]) =>
            pencils[r][c].has(num)
          );
          if (box_n_cells.length < 2) continue;

          const rows = new Set(box_n_cells.map((c) => c[0]));
          const cols = new Set(box_n_cells.map((c) => c[1]));

          if (rows.size === 1 || cols.size === 1) continue;

          for (const r1 of rows) {
            for (const c1 of cols) {
              const coversAll = box_n_cells.every(
                ([r, c]) => r === r1 || c === c1
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
            (b) => !pair_boxes.has(b)
          );
          if (other_box_index === undefined) continue;
          other_box_start = (other_box_index % 3) * 3;

          for (let c = other_box_start; c < other_box_start + 3; c++) {
            pencils[other_line][c].forEach((cand) =>
              intersectionCandidates.add(cand)
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
            (b) => !pair_boxes.has(b)
          );
          if (other_box_index === undefined) continue;
          other_box_start = Math.floor(other_box_index / 3) * 3;

          for (let r = other_box_start; r < other_box_start + 3; r++) {
            pencils[r][other_line].forEach((cand) =>
              intersectionCandidates.add(cand)
            );
            if (board[r][other_line] !== 0)
              intersectionCandidates.add(board[r][other_line]);
          }
        }

        const removals = [];
        const commonSeers = techniques._commonVisibleCells(
          [cell1.r, cell1.c],
          [cell2.r, cell2.c]
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
            new Set(removals.map(JSON.stringify))
          ).map(JSON.parse);
          return { change: true, type: "remove", cells: uniqueRemovals };
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
          return { change: true, type: "place", r: r_plus1, c: c_plus1, num };
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
          };
      }

      // --- Types 2 & 5: Two or three extra cells with a common extra digit ---
      if (extraCells.length === 2 || extraCells.length === 3) {
        const extrasMasks = extraCells.map(([r, c]) =>
          Array.from(pencils[r][c]).filter((x) => x !== d1 && x !== d2)
        );
        let allHaveOneExtra = extrasMasks.every((arr) => arr.length === 1);
        if (allHaveOneExtra && extrasMasks.length > 0) {
          const commonExtraDigit = extrasMasks[0][0];
          let allAreSame = extrasMasks.every(
            (arr) => arr[0] === commonExtraDigit
          );
          if (allAreSame) {
            const peers = techniques._findCommonPeers(
              extraCells,
              cells,
              board,
              pencils
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
                board[r][c] === 0
            );
            if (unitCells.length < 1) return null;
            // Note: The loop for k can stop earlier, as k + 1 cannot be larger than the number of available 'other' cells
            for (let k = 1; k < unitCells.length; k++) {
              for (const chosen of techniques.combinations(unitCells, k)) {
                const union = new Set(virtualSet);
                chosen.forEach(([r, c]) =>
                  pencils[r][c].forEach((p) => union.add(p))
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
              techniques._getUnitCells("box", techniques._getBoxIndex(e1r, e1c))
            );
          }

          for (const unit of sharedUnits) {
            const res = processUnit(unit);
            if (res)
              return {
                change: true,
                type: "remove",
                cells: res,
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
            e1c
          );
          const c_f1_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "col",
            floor1[1],
            floor1[0],
            e2r
          );
          const r_f2_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "row",
            floor2[0],
            floor2[1],
            e2c
          );
          const c_f2_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "col",
            floor2[1],
            floor2[0],
            e1r
          );
          const r_f1_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "row",
            floor1[0],
            floor1[1],
            e1c
          );
          const c_f1_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "col",
            floor1[1],
            floor1[0],
            e2r
          );
          const r_f2_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "row",
            floor2[0],
            floor2[1],
            e2c
          );
          const c_f2_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "col",
            floor2[1],
            floor2[0],
            e1r
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
            other_c
          );
          const c_floor_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "col",
            fc,
            fr,
            other_r
          );
          const r_other_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "row",
            other_r,
            fc,
            other_c
          );
          const c_other_bi_d1 = techniques._isStrongLink(
            pencils,
            d1,
            "col",
            other_c,
            fr,
            other_r
          );
          const r_floor_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "row",
            fr,
            fc,
            other_c
          );
          const c_floor_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "col",
            fc,
            fr,
            other_r
          );
          const r_other_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "row",
            other_r,
            fc,
            other_c
          );
          const c_other_bi_d2 = techniques._isStrongLink(
            pencils,
            d2,
            "col",
            other_c,
            fr,
            other_r
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
          new Set(removals.map(JSON.stringify))
        ).map(JSON.parse);
        if (uniqueRemovals.length > 0) {
          return {
            change: true,
            type: "remove",
            cells: removals,
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
        cell.cands.forEach((cand) => union.add(cand))
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
                    2
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
                      true
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
                    true // is_3x2
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
                      false
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
                    false // is_3x2 = false
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
        [...pencils[r][c]].some((cand) => !core_digits.has(cand))
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
          };
        }
      }

      // --- Type 2 ---
      if (extra_cells.length >= 2) {
        let common_extra_cand = -1;
        let is_type2 = true;
        for (const [r, c] of extra_cells) {
          const extras = [...pencils[r][c]].filter(
            (cand) => !core_digits.has(cand)
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
            pencils
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
          extra_cells.map(([r, c]) => techniques._getBoxIndex(r, c))
        );

        if (r_set.size === 1)
          sharedUnits.push(
            techniques._getUnitCells("row", r_set.values().next().value)
          );
        if (c_set.size === 1)
          sharedUnits.push(
            techniques._getUnitCells("col", c_set.values().next().value)
          );
        if (b_set.size === 1)
          sharedUnits.push(
            techniques._getUnitCells("box", b_set.values().next().value)
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
                !erCellsSet.has(JSON.stringify([r, c])) && board[r][c] === 0
            );
            if (unitCells.length < 1) return null;

            for (let k = 1; k <= unitCells.length; k++) {
              for (const chosen of techniques.combinations(unitCells, k)) {
                const union = new Set(virtual_cands);
                chosen.forEach(([r, c]) =>
                  pencils[r][c].forEach((p) => union.add(p))
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
                loc2
              );
            } else {
              const boxCells = techniques._getUnitCells("box", unitIndex);
              const candLocs = boxCells.filter(([r, c]) =>
                pencils[r][c].has(d)
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
                };
              }
            }
          }
        }
      }
    }
    return { change: false };
  },
  // Add this constant and helper function inside the 'techniques' object.

  // Pre-translated from the C++ offsets relative to a 3x3 selection of rows/cols
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
    const cells_by_pair = new Map();
    const bivalue_cells_by_pair = new Map();

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size < 2) continue;
        const cands = [...pencils[r][c]];
        const id = r * 9 + c;

        for (const pair of techniques.combinations(cands, 2)) {
          const [d1, d2] = pair.sort((a, b) => a - b);
          const pair_key = `${d1},${d2}`;

          if (!cells_by_pair.has(pair_key)) cells_by_pair.set(pair_key, []);
          cells_by_pair.get(pair_key).push(id);

          if (pencils[r][c].size === 2) {
            if (!bivalue_cells_by_pair.has(pair_key))
              bivalue_cells_by_pair.set(pair_key, new Set());
            bivalue_cells_by_pair.get(pair_key).add(id);
          }
        }
      }
    }

    const hexagons = [];
    const found = new Set();

    for (const [pair_key, cell_list] of cells_by_pair.entries()) {
      if (cell_list.length < 6) continue;
      if (
        !bivalue_cells_by_pair.has(pair_key) ||
        bivalue_cells_by_pair.get(pair_key).size < 2
      )
        continue;

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

            const bivalue_set_for_pair = bivalue_cells_by_pair.get(pair_key);
            const biv_count = hex_cells.filter(([r, c]) =>
              bivalue_set_for_pair.has(r * 9 + c)
            ).length;
            if (biv_count < 2) continue;

            const blocks = new Set(
              hex_cells.map(([r, c]) => techniques._getBoxIndex(r, c))
            );
            if (blocks.size !== 3) continue;

            hexagons.push({
              cells: hex_cells,
              digits: pair_key.split(",").map(Number),
            });
            found.add(hex_key);
          }
        }
      }
    }
    return hexagons;
  },
  // Add this main technique function inside the 'techniques' object.
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
          ![...pencils[r][c]].every((d) => d_set.has(d))
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
            pencils
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
            techniques._getUnitCells("box", techniques._getBoxIndex(e1r, e1c))
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
                !hexCellsSet.has(JSON.stringify([r, c])) && board[r][c] === 0
            );
            if (unitCells.length < 1) return null;

            for (let k = 1; k < unitCells.length; k++) {
              for (const chosen of techniques.combinations(unitCells, k)) {
                const union = new Set(virtual_cands);
                chosen.forEach(([r, c]) =>
                  pencils[r][c].forEach((p) => union.add(p))
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
                loc2
              );
            } else {
              const boxCells = techniques._getUnitCells("box", unitIndex);
              const candLocs = boxCells.filter(([r, c]) =>
                pencils[r][c].has(d)
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
                (ec) => ec[0] === hex_cell[0] && ec[1] === hex_cell[1]
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
                    req_locs[1]
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
  simpleColoring: (board, pencils) => {
    // This technique works on a single digit at a time. It finds "strong links"
    // (pairs of cells that are the only two in a unit with that candidate) and
    // builds chains. It then assigns alternating "colors" to the cells in a chain.
    for (let d = 1; d <= 9; d++) {
      // 1. Build a graph of strong links for the current digit 'd'.
      const graph = new Map();
      const cellsWithDigit = [];
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (pencils[r][c].has(d)) {
            cellsWithDigit.push([r, c]);
          }
        }
      }

      for (let i = 0; i < cellsWithDigit.length; i++) {
        for (let j = i + 1; j < cellsWithDigit.length; j++) {
          const cell1 = cellsWithDigit[i];
          const cell2 = cellsWithDigit[j];
          const [r1, c1] = cell1;
          const [r2, c2] = cell2;

          let isStrongLink = false;
          // Check for strong link in row, column, or box
          if (r1 === r2) {
            const unit = techniques._getUnitCells("row", r1);
            if (unit.filter(([r, c]) => pencils[r][c].has(d)).length === 2)
              isStrongLink = true;
          }
          if (!isStrongLink && c1 === c2) {
            const unit = techniques._getUnitCells("col", c1);
            if (unit.filter(([r, c]) => pencils[r][c].has(d)).length === 2)
              isStrongLink = true;
          }
          if (
            !isStrongLink &&
            techniques._getBoxIndex(r1, c1) === techniques._getBoxIndex(r2, c2)
          ) {
            const unit = techniques._getUnitCells(
              "box",
              techniques._getBoxIndex(r1, c1)
            );
            if (unit.filter(([r, c]) => pencils[r][c].has(d)).length === 2)
              isStrongLink = true;
          }

          if (isStrongLink) {
            const key1 = JSON.stringify(cell1);
            const key2 = JSON.stringify(cell2);
            if (!graph.has(key1)) graph.set(key1, []);
            if (!graph.has(key2)) graph.set(key2, []);
            graph.get(key1).push(cell2);
            graph.get(key2).push(cell1);
          }
        }
      }

      if (graph.size === 0) continue;

      // 2. Traverse the graph, find connected components, and color them.
      const visited = new Set();
      for (const startNodeKey of graph.keys()) {
        if (visited.has(startNodeKey)) continue;

        const coloring = new Map();
        const queue = [[JSON.parse(startNodeKey), 1]]; // [cell, color]

        while (queue.length > 0) {
          const [current, color] = queue.shift();
          const currentKey = JSON.stringify(current);

          if (coloring.has(currentKey)) continue;
          coloring.set(currentKey, color);
          visited.add(currentKey);

          const neighbors = graph.get(currentKey) || [];
          for (const neighbor of neighbors) {
            queue.push([neighbor, 3 - color]); // Alternate color (1 or 2)
          }
        }

        // 3. Apply coloring rules to find eliminations.
        const color1Nodes = [];
        const color2Nodes = [];
        for (const [key, color] of coloring.entries()) {
          if (color === 1) color1Nodes.push(JSON.parse(key));
          else color2Nodes.push(JSON.parse(key));
        }

        // Rule 1: Contradiction - Two cells with the same color can't see each other.
        // If they do, that color is invalid, and 'd' can be removed from all cells of that color.
        for (const colorGroup of [color1Nodes, color2Nodes]) {
          for (let i = 0; i < colorGroup.length; i++) {
            for (let j = i + 1; j < colorGroup.length; j++) {
              if (techniques._sees(colorGroup[i], colorGroup[j])) {
                const removals = colorGroup.map(([r, c]) => ({ r, c, num: d }));
                if (removals.length > 0)
                  return { change: true, type: "remove", cells: removals };
              }
            }
          }
        }

        // Rule 2: Elimination - If a cell with candidate 'd' sees both colors, remove 'd'.
        const removals = [];
        for (const [r, c] of cellsWithDigit) {
          const key = JSON.stringify([r, c]);
          if (coloring.has(key)) continue; // Skip cells that are part of the chain

          let seesColor1 = false;
          let seesColor2 = false;

          for (const node of color1Nodes) {
            if (techniques._sees([r, c], node)) {
              seesColor1 = true;
              break;
            }
          }
          if (!seesColor1) continue;

          for (const node of color2Nodes) {
            if (techniques._sees([r, c], node)) {
              seesColor2 = true;
              break;
            }
          }

          if (seesColor1 && seesColor2) {
            removals.push({ r, c, num: d });
          }
        }
        if (removals.length > 0)
          return { change: true, type: "remove", cells: removals };
      }
    }
    return { change: false };
  },
  xChain: (board, pencils, maxLength = 8) => {
    const _inSameUnit = (a, b) =>
      a[0] === b[0] ||
      a[1] === b[1] ||
      (Math.floor(a[0] / 3) === Math.floor(b[0] / 3) &&
        Math.floor(a[1] / 3) === Math.floor(b[1] / 3));

    const _isValidStrongLink = (a, b, d) => {
      if (!_inSameUnit(a, b)) return false;

      // Row
      if (a[0] === b[0]) {
        const r = a[0];
        const cells = [];
        for (let c = 0; c < 9; c++) if (pencils[r][c].has(d)) cells.push(c);
        if (cells.length === 2 && cells.includes(a[1]) && cells.includes(b[1]))
          return true;
      }

      // Column
      if (a[1] === b[1]) {
        const c = a[1];
        const cells = [];
        for (let r = 0; r < 9; r++) if (pencils[r][c].has(d)) cells.push(r);
        if (cells.length === 2 && cells.includes(a[0]) && cells.includes(b[0]))
          return true;
      }

      // Box
      const boxR = Math.floor(a[0] / 3),
        boxC = Math.floor(a[1] / 3);
      if (boxR === Math.floor(b[0] / 3) && boxC === Math.floor(b[1] / 3)) {
        const unit = [];
        for (let r = boxR * 3; r < boxR * 3 + 3; r++)
          for (let c = boxC * 3; c < boxC * 3 + 3; c++)
            if (pencils[r][c].has(d)) unit.push([r, c]);
        if (
          unit.length === 2 &&
          unit.some(([r, c]) => r === a[0] && c === a[1]) &&
          unit.some(([r, c]) => r === b[0] && c === b[1])
        )
          return true;
      }
      return false;
    };

    const _buildStrongLinkGraph = (d) => {
      const graph = new Map();
      const cells = [];
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
          if (pencils[r][c].has(d)) cells.push([r, c]);
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i],
            b = cells[j];
          if (_isValidStrongLink(a, b, d)) {
            const aKey = JSON.stringify(a),
              bKey = JSON.stringify(b);
            if (!graph.has(aKey)) graph.set(aKey, []);
            if (!graph.has(bKey)) graph.set(bKey, []);
            graph.get(aKey).push(b);
            graph.get(bKey).push(a);
          }
        }
      }
      return graph;
    };

    const _sees = techniques._sees;
    let changed = false;
    const eliminations = [];

    const _eliminate = (d, chain) => {
      const start = chain[0],
        end = chain[chain.length - 1];
      const chainSet = new Set(chain.map(JSON.stringify));
      const seesBoth = (r, c, a, b) => _sees([r, c], a) && _sees([r, c], b);

      const isCycle = _sees(start, end);

      if (isCycle) {
        const weakLinks = [];
        for (let i = 1; i < chain.length - 1; i += 2)
          weakLinks.push([chain[i], chain[i + 1]]);
        weakLinks.push([start, end]);

        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const cellKey = JSON.stringify([r, c]);
            if (!chainSet.has(cellKey) && pencils[r][c].has(d)) {
              for (const [n1, n2] of weakLinks) {
                if (seesBoth(r, c, n1, n2)) {
                  eliminations.push({ r, c, num: d });
                  changed = true;
                  break;
                }
              }
            }
          }
        }
      } else {
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const cellKey = JSON.stringify([r, c]);
            if (!chainSet.has(cellKey) && pencils[r][c].has(d)) {
              if (seesBoth(r, c, start, end)) {
                eliminations.push({ r, c, num: d });
                changed = true;
              }
            }
          }
        }
      }
    };

    const _dfs = (d, graph, chain, visited) => {
      if (changed || chain.length > maxLength) return;
      if (chain.length >= 6 && chain.length % 2 === 0) {
        _eliminate(d, chain);
        if (changed) return;
      }
      const current = chain[chain.length - 1];
      const currentKey = JSON.stringify(current);
      const isStrong = (chain.length - 1) % 2 === 0;
      if (isStrong) {
        for (const neighbor of graph.get(currentKey) || []) {
          const key = JSON.stringify(neighbor);
          if (!visited.has(key))
            _dfs(d, graph, [...chain, neighbor], new Set([...visited, key]));
          if (changed) return;
        }
      } else {
        for (const [nodeKey] of graph) {
          const node = JSON.parse(nodeKey);
          if (!visited.has(nodeKey) && _sees(current, node))
            _dfs(d, graph, [...chain, node], new Set([...visited, nodeKey]));
          if (changed) return;
        }
      }
    };

    for (let d = 1; d <= 9; d++) {
      const graph = _buildStrongLinkGraph(d);
      if (graph.size === 0) continue;
      for (const [nodeKey] of graph) {
        const node = JSON.parse(nodeKey);
        _dfs(d, graph, [node], new Set([nodeKey]));
        if (changed)
          return { change: true, type: "remove", cells: eliminations };
      }
    }

    return { change: false, cells: [] };
  },

  xyChain: (board, pencils, maxLength = 12) => {
    const sees = techniques._sees;
    const commonVisibleCells = techniques._commonVisibleCells;

    let changed = false;
    const eliminations = [];

    // Build list of bivalue cells
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          bivalueCells.push({ r, c, pair: [...pencils[r][c]].sort() });
        }
      }
    }
    if (bivalueCells.length === 0)
      return { change: false, type: null, cells: [] };

    // --- Recursive DFS to explore possible chains ---
    const dfs = (chain, lastCandidate, linkedCandidates, startCandidate) => {
      if (changed) return;

      const last = chain[chain.length - 1];
      const lastPair = [...pencils[last.r][last.c]].sort();
      const nextCandidate =
        chain.length === 1
          ? lastPair.find((x) => x !== lastCandidate)
          : lastCandidate;

      const newLinked = [...linkedCandidates, nextCandidate];

      for (const cell of bivalueCells) {
        const { r, c, pair } = cell;
        if (chain.some((x) => x.r === r && x.c === c)) continue;
        if (!pair.includes(nextCandidate)) continue;
        if (!sees([r, c], [last.r, last.c])) continue;

        const newChain = [...chain, { r, c }];
        const endCandidate = pair.find((x) => x !== nextCandidate);

        // --- Check for valid chain or cycle ---
        if (
          newChain.length > 3 &&
          (r !== chain[0].r || c !== chain[0].c) &&
          startCandidate === endCandidate
        ) {
          const start = chain[0];
          const isCycle = sees([start.r, start.c], [r, c]);

          // --- Case 1: XY-Cycle ---
          if (isCycle) {
            for (let i = 0; i < chain.length - 1; i++) {
              const cellA = chain[i];
              const cellB = chain[i + 1];
              const cvc = commonVisibleCells(
                [cellA.r, cellA.c],
                [cellB.r, cellB.c]
              );
              const d = newLinked[i];
              for (const [rr, cc] of cvc) {
                const isLinkCell =
                  (rr === cellA.r && cc === cellA.c) ||
                  (rr === cellB.r && cc === cellB.c);
                if (isLinkCell) continue;
                if (pencils[rr][cc].has(d)) {
                  eliminations.push({ r: rr, c: cc, num: d });
                  changed = true;
                }
              }
            }
          }

          // --- Case 2: XY-Chain (non-cycle) ---
          const cvc = commonVisibleCells([start.r, start.c], [r, c]);
          for (const [rr, cc] of cvc) {
            const isInChain = newChain.some((p) => p.r === rr && p.c === cc);
            if (isInChain) continue;
            if (pencils[rr][cc].has(startCandidate)) {
              eliminations.push({ r: rr, c: cc, num: startCandidate });
              changed = true;
            }
          }

          if (changed)
            return { change: true, type: "remove", cells: eliminations };
        }

        if (newChain.length < maxLength)
          dfs(newChain, endCandidate, newLinked, startCandidate);
      }
    };

    // --- Main search loop ---
    for (const startCell of bivalueCells) {
      const { r, c, pair } = startCell;
      for (const startCandidate of pair) {
        dfs([{ r, c }], startCandidate, [], startCandidate);
        if (changed)
          return { change: true, type: "remove", cells: eliminations };
      }
    }

    return { change: false, type: null, cells: [] };
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
                ([r, c]) => !usedC.has(`${r},${c}`)
              );

              // Build pools excluding used C, including unused intersection cells
              const line_pool = allRowCells.filter(
                ([r, c]) => !usedC.has(`${r},${c}`)
              );
              const box_pool = allBoxCells.filter(
                ([r, c]) => !usedC.has(`${r},${c}`)
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
                        remaining_V
                      );
                      recordRemovalsFromMask(
                        box_pool,
                        B.positions,
                        remaining_V
                      );
                    }
                    if (eliminations.length > 0)
                      return {
                        change: true,
                        type: "remove",
                        cells: eliminations,
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
                ([r, c]) => !usedC.has(`${r},${c}`)
              );

              const line_pool = allColCells.filter(
                ([r, c]) => !usedC.has(`${r},${c}`)
              );
              const box_pool = allBoxCells.filter(
                ([r, c]) => !usedC.has(`${r},${c}`)
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
                        remaining_V
                      );
                      recordRemovalsFromMask(
                        box_pool,
                        B.positions,
                        remaining_V
                      );
                    }
                    if (eliminations.length > 0)
                      return {
                        change: true,
                        type: "remove",
                        cells: eliminations,
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

  wxyzWing: (board, pencils) => {
    const sees = techniques._sees;
    const combGen = techniques.combinations;
    const eliminationsSet = new Set(); // to deduplicate
    const eliminations = [];

    const recordElim = (r, c, num) => {
      const key = JSON.stringify([r, c, num]);
      if (!eliminationsSet.has(key)) {
        eliminationsSet.add(key);
        eliminations.push({ r, c, num });
      }
    };

    // gather bivalue cells: [ [r,c], Set ]
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          bivalueCells.push([[r, c], new Set([...pencils[r][c]])]);
        }
      }
    }

    // build units: rows, cols, boxes
    const units = [];
    for (let r = 0; r < 9; r++)
      units.push(Array.from({ length: 9 }, (_, i) => [r, i]));
    for (let c = 0; c < 9; c++)
      units.push(Array.from({ length: 9 }, (_, i) => [i, c]));
    for (let br = 0; br < 3; br++)
      for (let bc = 0; bc < 3; bc++) {
        const cells = [];
        for (let rr = 0; rr < 3; rr++)
          for (let cc = 0; cc < 3; cc++) {
            cells.push([br * 3 + rr, bc * 3 + cc]);
          }
        units.push(cells);
      }

    // iterate units to find 3-cell ALS with exactly 4 distinct candidates
    for (const unit of units) {
      // unsolved cells in unit
      const unsolved = unit.filter(([r, c]) => board[r][c] === 0);
      if (unsolved.length < 4) continue;

      // combinations of 3 cells from unsolved
      for (const triple of combGen(unsolved, 3)) {
        // union of candidates
        const unionSet = new Set();
        for (const [r, c] of triple)
          for (const d of pencils[r][c]) unionSet.add(d);
        if (unionSet.size !== 4) continue; // require WXYZ

        const wxyz = [...unionSet]; // array of 4 digits

        // For each bivalue cell
        for (const [bcoord, bset] of bivalueCells) {
          const [br, bc] = bcoord;

          // skip if bivalue is part of ALS
          if (triple.some(([ar, ac]) => ar === br && ac === bc)) continue;

          // bivalue must be subset of ALS candidates
          let subset = true;
          for (const v of bset)
            if (!unionSet.has(v)) {
              subset = false;
              break;
            }
          if (!subset) continue;

          // get seen_count
          const seenCount = triple.reduce(
            (acc, cell) => acc + (sees(bcoord, cell) ? 1 : 0),
            0
          );
          if (!(seenCount >= 1 && seenCount < 3)) continue; // must see at least one but not all 3

          // For each orientation of bivalue: pick x as one candidate, z the other
          const bArr = [...bset];
          for (let idx = 0; idx < 2; idx++) {
            const x = bArr[idx];
            const z = bArr[1 - idx];

            // ALS cells that contain x and z
            const als_with_x = triple.filter(([r, c]) => pencils[r][c].has(x));
            const als_with_z = triple.filter(([r, c]) => pencils[r][c].has(z));

            // Condition 3: bivalue must see all ALS cells that contain X
            const biv_sees_all_x = als_with_x.every((cell) =>
              sees(bcoord, cell)
            );
            if (!biv_sees_all_x) continue;

            // Determine possible eliminations:
            // Normal case: remove z from any cell that sees bivalue AND all ALS cells that contain z
            for (let r = 0; r < 9; r++) {
              for (let c = 0; c < 9; c++) {
                const target = [r, c];
                // skip pattern cells
                if (
                  (r === br && c === bc) ||
                  triple.some(([ar, ac]) => ar === r && ac === c)
                )
                  continue;
                if (!pencils[r][c].has(z)) continue;

                const seesBiv = sees(target, bcoord);
                const seesAllZ =
                  als_with_z.length === 0
                    ? false
                    : als_with_z.every((cell) => sees(target, cell));
                if (seesBiv && seesAllZ) {
                  recordElim(r, c, z);
                }
              }
            }

            // Doubly-linked case: if bivalue sees all ALS cells that contain Z as well (so it sees all ALS-with-x and all ALS-with-z)
            const biv_sees_all_z = als_with_z.every((cell) =>
              sees(bcoord, cell)
            );
            if (biv_sees_all_z) {
              // For each digit in {x, z} : remove that digit from cells that see bivalue AND all ALS cells that contain that digit.
              for (const digit of [x, z]) {
                const als_with_d = triple.filter(([r, c]) =>
                  pencils[r][c].has(digit)
                );
                if (als_with_d.length === 0) continue;
                for (let r = 0; r < 9; r++) {
                  for (let c = 0; c < 9; c++) {
                    const target = [r, c];
                    if (
                      (r === br && c === bc) ||
                      triple.some(([ar, ac]) => ar === r && ac === c)
                    )
                      continue;
                    if (!pencils[r][c].has(digit)) continue;
                    const seesBiv = sees(target, bcoord);
                    const seesAll = als_with_d.every((cell) =>
                      sees(target, cell)
                    );
                    if (seesBiv && seesAll) recordElim(r, c, digit);
                  }
                }
              }

              // For the remaining two digits (W and Y), remove them from any cell that sees ALL ALS cells that contain that digit.
              const otherDigits = wxyz.filter((d) => d !== x && d !== z);
              for (const digit of otherDigits) {
                const als_with_d = triple.filter(([r, c]) =>
                  pencils[r][c].has(digit)
                );
                if (als_with_d.length === 0) continue;
                for (let r = 0; r < 9; r++) {
                  for (let c = 0; c < 9; c++) {
                    const target = [r, c];
                    if (
                      (r === br && c === bc) ||
                      triple.some(([ar, ac]) => ar === r && ac === c)
                    )
                      continue;
                    if (!pencils[r][c].has(digit)) continue;
                    const seesAll = als_with_d.every((cell) =>
                      sees(target, cell)
                    );
                    if (seesAll) recordElim(r, c, digit);
                  }
                }
              }
            }

            // If any eliminations collected, return early per original behavior
            if (eliminations.length > 0) {
              return { change: true, type: "remove", cells: eliminations };
            }
          } // end iterate bivalue orientation
        } // end bivalue loop
      } // end triple combos
    } // end units

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
        // const beforeDigits = maskToDigits(before);
        // const afterDigits = maskToDigits(after);
        // console.log(
        //   `Fireworks restrict r${r + 1}c${
        //     c + 1
        //   }: {${beforeDigits}} -> {${afterDigits}}`
        // );
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
          ([r, c]) => !boxCells.some(([br, bc]) => br === r && bc === c)
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
                          ([rr, cc]) => rr === r && cc === c
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
                          ([r, c]) => maskFromSet(pencils[r][c]) & vbit
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
                          ([rr, cc]) => boxIndex(rr, cc) === boxIdx
                        );
                        if (boxColInt.length < 3) continue;

                        const extraColCells = colCells.filter(
                          ([rr, cc]) =>
                            !boxColInt.some(
                              ([br, bc]) => br === rr && bc === cc
                            )
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
                                    ([rr, cc]) => rr === r && cc === c
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
                                      maskFromSet(pencils[r][c]) & vbit
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
                                  candMask
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

  groupedXChain: function (board, pencils, maxLength = 8) {
    const _sees = techniques._sees;

    // A Node represents a single candidate cell or a group of candidates acting as one unit.
    const _createNode = (cells, isGroup = false) => {
      // Sort cells for a canonical key representation
      const sortedCells = [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return {
        cells: sortedCells,
        isGroup: isGroup,
        key: JSON.stringify(sortedCells),
      };
    };

    const _nodeSees = (nodeA, nodeB) => {
      for (const cellA of nodeA.cells) {
        for (const cellB of nodeB.cells) {
          if (!_sees(cellA, cellB)) return false;
        }
      }
      return true;
    };

    const _nodeHasOverlap = (nodeA, nodeB) => {
      const cellsA = new Set(nodeA.cells.map(JSON.stringify));
      for (const cellB of nodeB.cells) {
        if (cellsA.has(JSON.stringify(cellB))) return true;
      }
      return false;
    };

    const _nodeInSameUnit = (nodeA, nodeB) => {
      for (const cellA of nodeA.cells) {
        for (const cellB of nodeB.cells) {
          if (
            cellA[0] === cellB[0] ||
            cellA[1] === cellB[1] ||
            techniques._getBoxIndex(cellA[0], cellA[1]) ===
              techniques._getBoxIndex(cellB[0], cellB[1])
          ) {
            return true;
          }
        }
      }
      return false;
    };

    const _getCommonUnits = (cellsA, cellsB) => {
      const allCells = [...cellsA, ...cellsB];
      const rSet = new Set(allCells.map(([r, _]) => r));
      const cSet = new Set(allCells.map(([_, c]) => c));
      const bSet = new Set(
        allCells.map(([r, c]) => techniques._getBoxIndex(r, c))
      );
      const units = [];
      if (rSet.size === 1)
        units.push(techniques._getUnitCells("row", rSet.values().next().value));
      if (cSet.size === 1)
        units.push(techniques._getUnitCells("col", cSet.values().next().value));
      if (bSet.size === 1)
        units.push(techniques._getUnitCells("box", bSet.values().next().value));
      return units;
    };

    const _isValidStrongLink = (nodeA, nodeB, d) => {
      if (_nodeHasOverlap(nodeA, nodeB)) return false;

      const units = _getCommonUnits(nodeA.cells, nodeB.cells);
      if (units.length === 0) return false;

      const cellsA_Str = new Set(nodeA.cells.map(JSON.stringify));
      const cellsB_Str = new Set(nodeB.cells.map(JSON.stringify));
      const combinedStr = new Set([...cellsA_Str, ...cellsB_Str]);

      for (const unit of units) {
        const unitCellsStr = new Set(unit.map(JSON.stringify));
        if (
          ![...cellsA_Str, ...cellsB_Str].every((cell) =>
            unitCellsStr.has(cell)
          )
        )
          continue;

        const candidatesInUnit = unit.filter(([r, c]) => pencils[r][c].has(d));
        if (candidatesInUnit.length !== combinedStr.size) continue;

        const candidatesInUnitStr = new Set(
          candidatesInUnit.map(JSON.stringify)
        );

        let isMatch = true;
        for (const cand of candidatesInUnitStr) {
          if (!combinedStr.has(cand)) {
            isMatch = false;
            break;
          }
        }
        if (isMatch) return true;
      }
      return false;
    };

    const _generateGroups = (d) => {
      const groups = [];
      for (let b = 0; b < 9; b++) {
        const boxCells = techniques
          ._getUnitCells("box", b)
          .filter(([r, c]) => pencils[r][c].has(d));

        // Optimization: skip if no groups are possible
        if (boxCells.length < 2) continue;

        const rowGroups = new Map(),
          colGroups = new Map();

        for (const [r, c] of boxCells) {
          if (!rowGroups.has(r)) rowGroups.set(r, []);
          if (!colGroups.has(c)) colGroups.set(c, []);
          rowGroups.get(r).push([r, c]);
          colGroups.get(c).push([r, c]);
        }

        for (const group of rowGroups.values()) {
          if (group.length >= 2) {
            groups.push(_createNode(group, true));
          }
        }
        for (const group of colGroups.values()) {
          if (group.length >= 2) {
            groups.push(_createNode(group, true));
          }
        }

        // --- New logic for the 5-cell "cross" pattern ---
        if (boxCells.length === 5) {
          // Find all 3-cell groups
          const row3Groups = [...rowGroups.values()].filter(
            (g) => g.length === 3
          );
          const col3Groups = [...colGroups.values()].filter(
            (g) => g.length === 3
          );

          // Check for the specific pattern: 1 row-3 and 1 col-3
          if (row3Groups.length === 1 && col3Groups.length === 1) {
            const row3Cells = row3Groups[0];
            const col3Cells = col3Groups[0];

            // Find the intersection (overlapping cell)
            const row3CellStrings = new Set(row3Cells.map(JSON.stringify));
            const overlapCells = col3Cells.filter((cell) =>
              row3CellStrings.has(JSON.stringify(cell))
            );

            const overlapCellStr = JSON.stringify(overlapCells[0]);

            // Create the 2-cell "fin" groups by filtering out the overlap
            const groupRow2 = row3Cells.filter(
              (cell) => JSON.stringify(cell) !== overlapCellStr
            );
            const groupCol2 = col3Cells.filter(
              (cell) => JSON.stringify(cell) !== overlapCellStr
            );

            // Add the new 2-cell groups
            groups.push(_createNode(groupRow2, true));
            groups.push(_createNode(groupCol2, true));
          }
        }
      }
      return groups;
    };

    const _buildStrongLinkGraph = (d) => {
      const graph = new Map();
      const nodeMap = new Map();

      const cellNodes = [];
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (pencils[r][c].has(d)) {
            cellNodes.push(_createNode([[r, c]]));
          }
        }
      }
      const groupNodes = _generateGroups(d);
      const allNodes = [...cellNodes, ...groupNodes];

      allNodes.forEach((node) => nodeMap.set(node.key, node));

      for (let i = 0; i < allNodes.length; i++) {
        for (let j = i + 1; j < allNodes.length; j++) {
          const a = allNodes[i];
          const b = allNodes[j];
          if (!_nodeSees(a, b)) continue;
          if (_isValidStrongLink(a, b, d)) {
            if (!graph.has(a.key)) graph.set(a.key, []);
            if (!graph.has(b.key)) graph.set(b.key, []);
            graph.get(a.key).push(b.key);
            graph.get(b.key).push(a.key);
          }
        }
      }
      return { graph, nodeMap };
    };

    let changed = false;
    const eliminations = [];
    const chainContainsGroup = (chain) => chain.some((node) => node.isGroup);

    const _eliminateChain = (d, chain) => {
      const startNode = chain[0];
      const endNode = chain[chain.length - 1];
      const chainCells = new Set();
      chain.forEach((node) =>
        node.cells.forEach((cell) => chainCells.add(JSON.stringify(cell)))
      );

      if (
        _nodeInSameUnit(startNode, endNode) &&
        _nodeSees(startNode, endNode) &&
        !_nodeHasOverlap(startNode, endNode)
      ) {
        // X-Cycle / Continuous Loop
        const weakLinks = [];
        for (let i = 1; i < chain.length - 2; i += 2) {
          weakLinks.push([chain[i], chain[i + 1]]);
        }
        weakLinks.push([chain[chain.length - 1], chain[0]]);

        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (chainCells.has(JSON.stringify([r, c]))) continue;
            if (pencils[r][c].has(d)) {
              const candidate = _createNode([[r, c]]);
              for (const [n1, n2] of weakLinks) {
                if (_nodeSees(candidate, n1) && _nodeSees(candidate, n2)) {
                  eliminations.push({ r, c, num: d });
                  changed = true;
                  break;
                }
              }
            }
          }
        }
      } else {
        // Standard X-Chain
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (chainCells.has(JSON.stringify([r, c]))) continue;
            if (pencils[r][c].has(d)) {
              const candidate = _createNode([[r, c]]);
              if (
                _nodeSees(candidate, startNode) &&
                _nodeSees(candidate, endNode)
              ) {
                eliminations.push({ r, c, num: d });
                changed = true;
              }
            }
          }
        }
      }
    };

    const _dfs = (d, graph, nodeMap, chain, visitedCells) => {
      if (changed || chain.length >= maxLength) return;

      if (chain.length >= 6 && chain.length % 2 === 0) {
        _eliminateChain(d, chain);
        if (changed) return;
      }

      const current = chain[chain.length - 1];
      const isStrongLinkStep = (chain.length - 1) % 2 === 0;

      if (isStrongLinkStep) {
        const neighbors = graph.get(current.key) || [];
        for (const neighborKey of neighbors) {
          const neighbor = nodeMap.get(neighborKey);
          const hasVisited = neighbor.cells.some((cell) =>
            visitedCells.has(JSON.stringify(cell))
          );
          if (!hasVisited) {
            const newVisited = new Set(visitedCells);
            neighbor.cells.forEach((cell) =>
              newVisited.add(JSON.stringify(cell))
            );
            _dfs(d, graph, nodeMap, [...chain, neighbor], newVisited);
            if (changed) return;
          }
        }
      } else {
        // Weak link step
        for (const neighborKey of nodeMap.keys()) {
          const neighbor = nodeMap.get(neighborKey);
          if (neighbor.key === current.key) continue;

          const hasVisited = neighbor.cells.some((cell) =>
            visitedCells.has(JSON.stringify(cell))
          );
          if (hasVisited) continue;

          if (
            _nodeSees(current, neighbor) &&
            !_nodeHasOverlap(current, neighbor)
          ) {
            const newVisited = new Set(visitedCells);
            neighbor.cells.forEach((cell) =>
              newVisited.add(JSON.stringify(cell))
            );
            _dfs(d, graph, nodeMap, [...chain, neighbor], newVisited);
            if (changed) return;
          }
        }
      }
    };

    for (let d = 1; d <= 9; d++) {
      const { graph, nodeMap } = _buildStrongLinkGraph(d);
      if (graph.size === 0) continue;

      for (const startNodeKey of graph.keys()) {
        const startNode = nodeMap.get(startNodeKey);
        const visited = new Set();
        startNode.cells.forEach((cell) => visited.add(JSON.stringify(cell)));
        _dfs(d, graph, nodeMap, [startNode], visited);
        if (changed) {
          const uniqueRemovals = Array.from(
            new Set(eliminations.map(JSON.stringify))
          ).map(JSON.parse);
          return { change: true, type: "remove", cells: uniqueRemovals };
        }
      }
    }

    return { change: false };
  },

  medusa3D: function (board, pencils) {
    const graph = techniques._buildMedusaGraph(pencils);
    if (graph.size === 0) return { change: false };

    const visited = new Set(); // Stores node keys {r,c,num} as strings

    // Iterate through all nodes to find and color each connected component
    for (const startNodeKey of graph.keys()) {
      if (visited.has(startNodeKey)) continue;

      // 1. Color the current component using Breadth-First Search (BFS)
      const coloring = new Map();
      const queue = [[JSON.parse(startNodeKey), 1]]; // [[node, color]]

      while (queue.length > 0) {
        const [currentNode, color] = queue.shift();
        const currentKey = JSON.stringify(currentNode);
        if (coloring.has(currentKey)) continue;

        coloring.set(currentKey, color);
        visited.add(currentKey);

        const neighbors = graph.get(currentKey) || [];
        for (const neighborKey of neighbors) {
          if (!coloring.has(neighborKey)) {
            queue.push([JSON.parse(neighborKey), 3 - color]); // Alternate color
          }
        }
      }

      // 2. Apply the 3D Medusa elimination rules to the colored component
      const removals = techniques._applyMedusaRules(coloring, pencils, board);
      if (removals.length > 0) {
        // Deduplicate removals before returning
        const uniqueRemovals = Array.from(
          new Set(removals.map(JSON.stringify))
        ).map(JSON.parse);
        if (uniqueRemovals.length > 0) {
          return { change: true, type: "remove", cells: uniqueRemovals };
        }
      }
    }

    return { change: false };
  },

  /**
   * Builds the graph for 3D Medusa.
   * Links include:
   * 1. Strong links: Pairs of a single candidate in a unit.
   * 2. Bivalue links: The two candidates within a single bivalue cell.
   */
  _buildMedusaGraph: function (pencils) {
    const graph = new Map();
    const addLink = (nodeA, nodeB) => {
      const keyA = JSON.stringify(nodeA);
      const keyB = JSON.stringify(nodeB);
      if (!graph.has(keyA)) graph.set(keyA, []);
      if (!graph.has(keyB)) graph.set(keyB, []);
      graph.get(keyA).push(keyB);
      graph.get(keyB).push(keyA);
    };

    // Part 1: Add strong links for each digit across all units
    for (let d = 1; d <= 9; d++) {
      for (let i = 0; i < 9; i++) {
        // Rows
        const rowCells = techniques
          ._getUnitCells("row", i)
          .filter(([r, c]) => pencils[r][c].has(d));
        if (rowCells.length === 2) {
          addLink(
            { r: rowCells[0][0], c: rowCells[0][1], num: d },
            { r: rowCells[1][0], c: rowCells[1][1], num: d }
          );
        }
        // Columns
        const colCells = techniques
          ._getUnitCells("col", i)
          .filter(([r, c]) => pencils[r][c].has(d));
        if (colCells.length === 2) {
          addLink(
            { r: colCells[0][0], c: colCells[0][1], num: d },
            { r: colCells[1][0], c: colCells[1][1], num: d }
          );
        }
        // Boxes
        const boxCells = techniques
          ._getUnitCells("box", i)
          .filter(([r, c]) => pencils[r][c].has(d));
        if (boxCells.length === 2) {
          addLink(
            { r: boxCells[0][0], c: boxCells[0][1], num: d },
            { r: boxCells[1][0], c: boxCells[1][1], num: d }
          );
        }
      }
    }

    // Part 2: Add links for candidates within bivalue cells
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          const [d1, d2] = [...pencils[r][c]];
          addLink({ r, c, num: d1 }, { r, c, num: d2 });
        }
      }
    }

    return graph;
  },

  /**
   * Applies the six elimination rules for 3D Medusa.
   */
  _applyMedusaRules: function (coloring, pencils, board) {
    const removals = [];

    // Helper to generate removals if a whole color is found to be invalid
    const _eliminateColor = (badColor) => {
      const colorRemovals = [];
      for (const [nodeKey, color] of coloring.entries()) {
        if (color === badColor) {
          const node = JSON.parse(nodeKey);
          if (pencils[node.r][node.c].has(node.num)) {
            colorRemovals.push({ r: node.r, c: node.c, num: node.num });
          }
        }
      }
      return colorRemovals;
    };

    // --- Pre-computation for faster rule checking ---
    const cellColors = new Map(); // Map<"r,c", [{num, color}, ...]>
    const rowCount = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => [0, 0])
    ); // [digit-1][row][color-1]
    const colCount = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => [0, 0])
    );
    const boxCount = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => [0, 0])
    );

    for (const [nodeKey, color] of coloring.entries()) {
      const node = JSON.parse(nodeKey);
      const cellKey = `${node.r},${node.c}`;
      if (!cellColors.has(cellKey)) cellColors.set(cellKey, []);
      cellColors.get(cellKey).push({ num: node.num, color });

      const d_idx = node.num - 1,
        c_idx = color - 1;
      rowCount[d_idx][node.r][c_idx]++;
      colCount[d_idx][node.c][c_idx]++;
      boxCount[d_idx][techniques._getBoxIndex(node.r, node.c)][c_idx]++;
    }

    // --- Contradiction Rules (return immediately as they are powerful) ---

    // Rule 1: Two candidates in the same cell have the same color.
    for (const colorsInCell of cellColors.values()) {
      if (colorsInCell.filter((c) => c.color === 1).length > 1)
        return _eliminateColor(1);
      if (colorsInCell.filter((c) => c.color === 2).length > 1)
        return _eliminateColor(2);
    }

    // Rule 2: The same digit has the same color twice in one unit.
    for (let d = 0; d < 9; d++) {
      for (let i = 0; i < 9; i++) {
        if (
          rowCount[d][i][0] > 1 ||
          colCount[d][i][0] > 1 ||
          boxCount[d][i][0] > 1
        )
          return _eliminateColor(1);
        if (
          rowCount[d][i][1] > 1 ||
          colCount[d][i][1] > 1 ||
          boxCount[d][i][1] > 1
        )
          return _eliminateColor(2);
      }
    }

    // Rule 6: All candidates in an unsolved cell see nodes of a single color.
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0 || pencils[r][c].size === 0) continue;
        for (let color_to_check = 1; color_to_check <= 2; color_to_check++) {
          const seenDigits = new Set();
          for (const [nodeKey, color] of coloring.entries()) {
            if (color === color_to_check) {
              const node = JSON.parse(nodeKey);
              if (techniques._sees([r, c], [node.r, node.c])) {
                seenDigits.add(node.num);
              }
            }
          }

          let isSubset = true;
          for (const cand of pencils[r][c]) {
            if (!seenDigits.has(cand)) {
              isSubset = false;
              break;
            }
          }
          if (isSubset) return _eliminateColor(color_to_check);
        }
      }
    }

    // --- Standard Elimination Rules (accumulate changes) ---

    // Rule 3: A cell with candidates of both colors cannot have other candidates.
    for (const [cellKey, colorsInCell] of cellColors.entries()) {
      const hasColor1 = colorsInCell.some((c) => c.color === 1);
      const hasColor2 = colorsInCell.some((c) => c.color === 2);
      if (hasColor1 && hasColor2) {
        const [r, c] = cellKey.split(",").map(Number);
        const colored_nums = new Set(colorsInCell.map((c) => c.num));
        for (const cand of pencils[r][c]) {
          if (!colored_nums.has(cand)) removals.push({ r, c, num: cand });
        }
      }
    }
    if (removals.length > 0) return removals;

    // Rule 4: An uncolored candidate that sees both colors of its own digit is false.
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        for (const d of pencils[r][c]) {
          if (coloring.has(JSON.stringify({ r, c, num: d }))) continue;

          let sees1 = false,
            sees2 = false;
          for (const [peerKey, color] of coloring.entries()) {
            const peer = JSON.parse(peerKey);
            if (peer.num === d && techniques._sees([r, c], [peer.r, peer.c])) {
              if (color === 1) sees1 = true;
              else sees2 = true;
            }
          }
          if (sees1 && sees2) removals.push({ r, c, num: d });
        }
      }
    }
    if (removals.length > 0) return removals;

    // Rule 5: An uncolored candidate is false if it sees a peer of the same digit, and its cell contains another candidate with the opposite color of that peer.
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        for (const d1 of pencils[r][c]) {
          if (coloring.has(JSON.stringify({ r, c, num: d1 }))) continue;

          for (const [peerKey, peerColor] of coloring.entries()) {
            const peer = JSON.parse(peerKey);
            if (peer.num !== d1 || !techniques._sees([r, c], [peer.r, peer.c]))
              continue;

            for (const d2 of pencils[r][c]) {
              if (d1 === d2) continue;
              const cellmateKey = JSON.stringify({ r, c, num: d2 });
              if (
                coloring.has(cellmateKey) &&
                coloring.get(cellmateKey) !== peerColor
              ) {
                removals.push({ r, c, num: d1 });
                break;
              }
            }
            if (
              removals.some(
                (rem) => rem.r === r && rem.c === c && rem.num === d1
              )
            )
              break;
          }
        }
      }
    }

    return removals;
  },
  alternatingInferenceChain: (board, pencils, maxLength = 16) => {
    let changeFound = false;
    let removals = [];

    // --- Optimized Key & Bitmask Functions ---
    const makeKey = (r, c, d) => r * 81 + c * 9 + (d - 1);
    const parseKey = (key) => ({
      r: Math.floor(key / 81),
      c: Math.floor((key % 81) / 9),
      d: (key % 9) + 1,
    });
    const _idToCell = (id) => [Math.floor(id / 9), id % 9];
    const _sees = (id1, id2) => (PEER_MASK[id1] & CELL_MASK[id2]) !== 0n;

    // --- Graph Building ---
    const buildStrongLinkGraph = () => {
      const graph = new Map();
      const addStrongLink = (r1, c1, d1, r2, c2, d2) => {
        const keyA = makeKey(r1, c1, d1);
        const keyB = makeKey(r2, c2, d2);
        if (!graph.has(keyA)) graph.set(keyA, []);
        if (!graph.has(keyB)) graph.set(keyB, []);
        graph.get(keyA).push(keyB);
        graph.get(keyB).push(keyA);
      };

      // Strong links from bi-location candidates
      for (let d = 1; d <= 9; d++) {
        // Rows
        for (let r = 0; r < 9; r++) {
          const cols = [];
          for (let c = 0; c < 9; c++) {
            if (pencils[r][c].has(d)) cols.push(c);
          }
          if (cols.length === 2) {
            addStrongLink(r, cols[0], d, r, cols[1], d);
          }
        }
        // Columns
        for (let c = 0; c < 9; c++) {
          const rows = [];
          for (let r = 0; r < 9; r++) {
            if (pencils[r][c].has(d)) rows.push(r);
          }
          if (rows.length === 2) {
            addStrongLink(rows[0], c, d, rows[1], c, d);
          }
        }
        // Boxes
        for (let b = 0; b < 9; b++) {
          const cells = [];
          const br = Math.floor(b / 3) * 3;
          const bc = (b % 3) * 3;
          for (let dr = 0; dr < 3; dr++) {
            for (let dc = 0; dc < 3; dc++) {
              const r = br + dr;
              const c = bc + dc;
              if (pencils[r][c].has(d)) cells.push([r, c]);
            }
          }
          if (cells.length === 2) {
            addStrongLink(
              cells[0][0],
              cells[0][1],
              d,
              cells[1][0],
              cells[1][1],
              d
            );
          }
        }
      }

      // Strong links from bi-value cells
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (pencils[r][c].size === 2) {
            const [d1, d2] = [...pencils[r][c]];
            addStrongLink(r, c, d1, r, c, d2);
          }
        }
      }
      return graph;
    };

    const buildWeakLinkCache = () => {
      const cache = new Map();
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cellId = r * 9 + c;
          const peerIds = PEER_MAP[cellId];

          for (const d of pencils[r][c]) {
            const key = makeKey(r, c, d);
            const links = [];

            // Same-digit weak links (peers)
            for (const peerId of peerIds) {
              const [pr, pc] = _idToCell(peerId);
              if (pencils[pr][pc].has(d)) {
                links.push(makeKey(pr, pc, d));
              }
            }

            // Same-cell weak links (other candidates)
            for (const otherD of pencils[r][c]) {
              if (otherD !== d) {
                links.push(makeKey(r, c, otherD));
              }
            }
            cache.set(key, links);
          }
        }
      }
      return cache;
    };

    // --- Elimination Logic ---
    const processRemovals = (foundRemovals) => {
      if (foundRemovals && foundRemovals.length > 0) {
        removals.push(...foundRemovals);
        changeFound = true;
        return true;
      }
      return false;
    };

    const eliminateCycle = (chain) => {
      const start = parseKey(chain[0]);
      const end = parseKey(chain[chain.length - 1]);
      const startId = start.r * 9 + start.c;
      const endId = end.r * 9 + end.c;

      const type1 = startId === endId && start.d !== end.d;
      const type2 = start.d === end.d && _sees(startId, endId);

      if (!(type1 || type2)) return false;

      const localRemovals = [];
      const weakLinks = [];
      for (let i = 1; i < chain.length - 1; i += 2) {
        weakLinks.push([parseKey(chain[i]), parseKey(chain[i + 1])]);
      }
      weakLinks.push([end, start]); // Implicit closing link

      for (const [nodeA, nodeB] of weakLinks) {
        const idA = nodeA.r * 9 + nodeA.c;
        const idB = nodeB.r * 9 + nodeB.c;

        if (idA === idB && nodeA.d !== nodeB.d) {
          const keep = new Set([nodeA.d, nodeB.d]);
          for (const cand of pencils[nodeA.r][nodeA.c]) {
            if (!keep.has(cand)) {
              localRemovals.push({ r: nodeA.r, c: nodeA.c, num: cand });
            }
          }
        } else if (nodeA.d === nodeB.d && _sees(idA, idB)) {
          const commonPeersMask = PEER_MASK[idA] & PEER_MASK[idB];
          for (let i = 0; i < 81; i++) {
            if ((commonPeersMask & CELL_MASK[i]) !== 0n) {
              const [pr, pc] = _idToCell(i);
              if (pencils[pr][pc].has(nodeA.d)) {
                localRemovals.push({ r: pr, c: pc, num: nodeA.d });
              }
            }
          }
        }
      }
      return processRemovals(localRemovals);
    };

    const eliminateChain = (chain) => {
      const start = parseKey(chain[0]);
      const end = parseKey(chain[chain.length - 1]);
      const startId = start.r * 9 + start.c;
      const endId = end.r * 9 + end.c;
      const localRemovals = [];

      if (start.d === end.d && !_sees(startId, endId)) {
        const commonPeersMask = PEER_MASK[startId] & PEER_MASK[endId];
        for (let i = 0; i < 81; i++) {
          if ((commonPeersMask & CELL_MASK[i]) !== 0n) {
            const [pr, pc] = _idToCell(i);
            if (pencils[pr][pc].has(start.d)) {
              localRemovals.push({ r: pr, c: pc, num: start.d });
            }
          }
        }
        return processRemovals(localRemovals);
      } else if (start.d !== end.d && _sees(startId, endId)) {
        if (pencils[start.r][start.c].has(end.d)) {
          localRemovals.push({ r: start.r, c: start.c, num: end.d });
        }
        if (pencils[end.r][end.c].has(start.d)) {
          localRemovals.push({ r: end.r, c: end.c, num: start.d });
        }
        return processRemovals(localRemovals);
      }
      return false;
    };

    // --- Search Algorithm ---
    const dfs = (chain, visited, depth) => {
      if (changeFound || depth >= maxLength) return;

      if (depth >= 6 && depth % 2 === 0) {
        const currentChain = chain.slice(0, depth);
        if (eliminateCycle(currentChain)) return;
        if (eliminateChain(currentChain)) return;
      }

      const currentKey = chain[depth - 1];
      const isStrongLinkTurn = (depth - 1) % 2 === 0;

      const neighbors = isStrongLinkTurn
        ? strongLinkGraph.get(currentKey) || []
        : weakLinkCache.get(currentKey) || [];

      for (const neighborKey of neighbors) {
        if (!visited[neighborKey]) {
          visited[neighborKey] = true;
          chain[depth] = neighborKey;
          dfs(chain, visited, depth + 1);
          visited[neighborKey] = false; // Backtrack
          if (changeFound) return;
        }
      }
    };

    // --- Main Execution ---
    const strongLinkGraph = buildStrongLinkGraph();
    const weakLinkCache = buildWeakLinkCache();
    const visited = new Array(729);
    const chain = new Array(maxLength);

    for (const startNodeKey of strongLinkGraph.keys()) {
      if (changeFound) break;
      visited.fill(false);
      visited[startNodeKey] = true;
      chain[0] = startNodeKey;
      dfs(chain, visited, 1);
    }

    if (changeFound) {
      const uniqueRemovals = Array.from(
        new Set(removals.map(JSON.stringify))
      ).map(JSON.parse);
      return { change: true, type: "remove", cells: uniqueRemovals };
    }

    return { change: false };
  },

  // --- End of newly added techniques ---
};
