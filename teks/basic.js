Object.assign(techniques, {
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
        visualPlan: {
          highlight: { digit: null, state: 0 },
          cellColors: [{ r: newr, c: newc, color: 7 }],
          candidateMarks: uniqueRemovals.map(({ r, c, num }) => ({
            r,
            c,
            num,
            marker: "slash",
            color: 0,
          })),
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
          "row",
          r,
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
          "col",
          c,
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
          "box",
          b,
        );
        if (!findAll) return res;
        results.push(res);
      }
    }
    return findAll ? results : { change: false };
  },

  // Helper to calculate missing digit and format the return object
  _resolveFullHouse: (r, c, solvedMask, unitName, unitType, unitIndex) => {
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
      visualPlan: {
        highlight: { digit: missingNum, state: 1 },
        cellColors: techniques
          ._getUnitCells(unitType, unitIndex)
          .map(([ur, uc]) => ({ r: ur, c: uc, color: 7 })),
        candidateColors: [{ r, c, num: missingNum, color: 3 }],
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
            visualPlan: {
              highlight: { digit: null, state: 0 },
              cellColors: [{ r, c, color: 7 }],
              candidateColors: [{ r, c, num, color: 3 }],
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
              visualPlan: {
                highlight: { digit: num, state: 1 },
                cellColors: [
                  ...unit.map(([ur, uc]) => ({ r: ur, c: uc, color: 7 })),
                  { r, c, color: 6 },
                ],
                candidateColors: [{ r, c, num, color: 3 }],
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
                  visualPlan: {
                    highlight: { digit: null, state: 0 },
                    cellColors: combo.map(([r, c]) => ({ r, c, color: 6 })),
                    candidateColors: combo.flatMap(([r, c]) =>
                      [...union]
                        .filter((num) => pencils[r][c].has(num))
                        .map((num) => ({ r, c, num, color: 4 })),
                    ),
                    candidateMarks: removals.map(({ r, c, num }) => ({
                      r,
                      c,
                      num,
                      marker: "slash",
                      color: 0,
                    })),
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
    const g = buildGrid(pencils);
    const results = [];

    for (const is_pointing of [true, false]) {
      for (let primaryIdx = 0; primaryIdx < 9; primaryIdx++) {
        for (let num = 1; num <= 9; num++) {
          const k = num - 1;
          for (const isRow of [true, false]) {
            const sourceCellsWithNum = [];
            if (is_pointing) {
              let m = g.box[k * 9 + primaryIdx];
              if (pop(m) < 2) continue;
              const sr = ((primaryIdx / 3) | 0) * 3;
              const sc = (primaryIdx % 3) * 3;
              while (m) {
                const p = lowest(m);
                sourceCellsWithNum.push([sr + ((p / 3) | 0), sc + (p % 3)]);
                m &= m - 1;
              }
            } else {
              let m = isRow
                ? g.row[k * 9 + primaryIdx]
                : g.col[k * 9 + primaryIdx];
              if (pop(m) < 2) continue;
              while (m) {
                const j = lowest(m);
                sourceCellsWithNum.push(
                  isRow ? [primaryIdx, j] : [j, primaryIdx],
                );
                m &= m - 1;
              }
            }

            let secMask = 0;
            for (const [r, c] of sourceCellsWithNum) {
              secMask |= 1 << (is_pointing ? (isRow ? r : c) : boxOf(r, c));
            }
            if (pop(secMask) !== 1) continue;
            const secondaryIdx = lowest(secMask);

            const removals = [];
            if (is_pointing) {
              let m = isRow
                ? g.row[k * 9 + secondaryIdx]
                : g.col[k * 9 + secondaryIdx];
              while (m) {
                const peer = lowest(m);
                m &= m - 1;
                const r = isRow ? secondaryIdx : peer;
                const c = isRow ? peer : secondaryIdx;
                if (boxOf(r, c) !== primaryIdx) removals.push({ r, c, num });
              }
            } else {
              let m = g.box[k * 9 + secondaryIdx];
              const sr = ((secondaryIdx / 3) | 0) * 3;
              const sc = (secondaryIdx % 3) * 3;
              while (m) {
                const p = lowest(m);
                m &= m - 1;
                const r = sr + ((p / 3) | 0);
                const c = sc + (p % 3);
                if (isRow ? r !== primaryIdx : c !== primaryIdx) {
                  removals.push({ r, c, num });
                }
              }
            }

            if (removals.length === 0) continue;

            const lineName = isRow ? t("teks_msg_14") : t("teks_msg_15");

            const hintName = is_pointing ? t("teks_msg_28") : t("teks_msg_29");
            const mainInfo = is_pointing
              ? t("teks_msg_30", primaryIdx + 1, lineName, secondaryIdx + 1)
              : t("teks_msg_31", lineName, primaryIdx + 1, secondaryIdx + 1);

            let cellStr;
            if (is_pointing) {
              const points = [
                ...new Set(
                  sourceCellsWithNum.map(([r, c]) => pointOf(r, c) + 1),
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

            const boxIdx = is_pointing ? primaryIdx : secondaryIdx;
            const lineIdx = is_pointing ? secondaryIdx : primaryIdx;
            const boxCells = techniques._getUnitCells("box", boxIdx);
            const lineCells = techniques._getUnitCells(
              isRow ? "row" : "col",
              lineIdx,
            );
            const [color8Cells, color7Cells] = is_pointing
              ? [lineCells, boxCells]
              : [boxCells, lineCells];

            const res = {
              change: true,
              type: "remove",
              cells: removals,
              hint: { name: hintName, mainInfo, detail },
              visualPlan: {
                highlight: { digit: num, state: 1 },
                cellColors: [
                  ...color7Cells.map(([r, c]) => ({
                    r,
                    c,
                    color: 6,
                    mode: "add",
                  })),
                  ...color8Cells.map(([r, c]) => ({
                    r,
                    c,
                    color: 7,
                    mode: "add",
                  })),
                ],
                candidateColors: sourceCellsWithNum.map(([r, c]) => ({
                  r,
                  c,
                  num,
                  color: 4,
                })),
                candidateMarks: removals.map(({ r, c, num: removalNum }) => ({
                  r,
                  c,
                  num: removalNum,
                  marker: "slash",
                  color: 0,
                })),
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
                visualPlan: {
                  highlight: { digit: null, state: 0 },
                  cellColors: cellGroup.map(([r, c]) => ({
                    r,
                    c,
                    color: 6,
                  })),
                  candidateColors: cellGroup.flatMap(([r, c]) =>
                    [...union]
                      .filter((num) => pencils[r][c].has(num))
                      .map((num) => ({ r, c, num, color: 4 })),
                  ),
                  candidateMarks: removals.map(({ r, c, num }) => ({
                    r,
                    c,
                    num,
                    marker: "slash",
                    color: 0,
                  })),
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
                visualPlan: {
                  highlight: { digit: null, state: 0 },
                  cellColors: cells.map(([r, c]) => ({ r, c, color: 6 })),
                  candidateColors: cells.flatMap(([r, c]) =>
                    [...numGroupSet]
                      .filter((num) => pencils[r][c].has(num))
                      .map((num) => ({ r, c, num, color: 4 })),
                  ),
                  candidateMarks: removals.map(({ r, c, num }) => ({
                    r,
                    c,
                    num,
                    marker: "slash",
                    color: 0,
                  })),
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
    const g = buildGrid(pencils);
    const results = [];

    for (const isRowBased of [true, false]) {
      for (let num = 1; num <= 9; num++) {
        const k = num - 1;
        const lineMasks = isRowBased ? g.row : g.col;

        const candidatesInDim = [];
        for (let i = 0; i < 9; i++) {
          const m = lineMasks[k * 9 + i];
          const n = pop(m);
          if (n >= 2 && n <= size) candidatesInDim.push([i, m]);
        }
        if (candidatesInDim.length < size) continue;

        for (const lines of techniques.combinations(candidatesInDim, size)) {
          let coverMask = 0;
          for (const [, m] of lines) coverMask |= m;
          if (pop(coverMask) !== size) continue;

          const coverOrder = bits9(coverMask);

          let baseMask = 0;
          for (const [i] of lines) baseMask |= 1 << i;

          const removals = [];
          for (const secIdx of coverOrder) {
            let m = (isRowBased ? g.col : g.row)[k * 9 + secIdx] & ~baseMask;
            while (m) {
              const primIdx = lowest(m);
              m &= m - 1;
              const [r, c] = isRowBased ? [primIdx, secIdx] : [secIdx, primIdx];
              removals.push({ r, c, num });
            }
          }
          if (removals.length === 0) continue;

          const primaryLineIndices = new Set(lines.map(([i]) => i));
          const allSecondaryIndices = new Set(coverOrder);

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
            visualPlan: {
              highlight: { digit: num, state: 1 },
              cellColors: [
                ...[...primaryLineIndices].flatMap((primIdx) =>
                  Array.from({ length: 9 }, (_, p) => {
                    const [r, c] = isRowBased ? [primIdx, p] : [p, primIdx];
                    return { r, c, color: 6, mode: "add" };
                  }),
                ),
                ...[...allSecondaryIndices].flatMap((secIdx) =>
                  Array.from({ length: 9 }, (_, p) => {
                    const [r, c] = isRowBased ? [p, secIdx] : [secIdx, p];
                    return { r, c, color: 7, mode: "add" };
                  }),
                ),
              ],
              candidateColors: [...primaryLineIndices].flatMap((primIdx) =>
                Array.from({ length: 9 }, (_, p) =>
                  isRowBased ? [primIdx, p] : [p, primIdx],
                )
                  .filter(([r, c]) => pencils[r][c].has(num))
                  .map(([r, c]) => ({ r, c, num, color: 6 })),
              ),
              candidateMarks: removals.map(({ r, c, num: removalNum }) => ({
                r,
                c,
                num: removalNum,
                marker: "slash",
                color: 0,
              })),
            },
          };
          if (!findAll) return res;
          results.push(res);
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
    const g = buildGrid(pencils);
    const results = [];

    for (let num = 1; num <= 9; num++) {
      const k = num - 1;
      const lineMasks = isRowBased ? g.row : g.col;

      const potentialLines = [];
      for (let i = 0; i < 9; i++) {
        const m = lineMasks[k * 9 + i];
        const n = pop(m);
        if (n >= 1 && n <= fishSize + 2) {
          potentialLines.push({ line: i, mask: m, locs: bits9(m) });
        }
      }
      if (potentialLines.length < fishSize) continue;

      for (const baseLines of techniques.combinations(
        potentialLines,
        fishSize,
      )) {
        let coverAllMask = 0;
        for (const line of baseLines) coverAllMask |= line.mask;
        const coverCount = pop(coverAllMask);
        if (coverCount < fishSize + 1 || coverCount > fishSize + 2) continue;

        const allCoverIndices = bits9(coverAllMask);

        for (const coverBaseIndices of techniques.combinations(
          allCoverIndices,
          fishSize,
        )) {
          let coverBaseMask = 0;
          for (const loc of coverBaseIndices) coverBaseMask |= 1 << loc;

          const fins = [];
          let finBoxMask = 0;
          for (const line of baseLines) {
            let m = line.mask & ~coverBaseMask;
            while (m) {
              const loc = lowest(m);
              m &= m - 1;
              const r = isRowBased ? line.line : loc;
              const c = isRowBased ? loc : line.line;
              fins.push([r, c]);
              finBoxMask |= 1 << boxOf(r, c);
            }
          }

          if (pop(finBoxMask) !== 1) continue;
          const finBoxIndex = lowest(finBoxMask);

          let baseLineMask = 0;
          for (const line of baseLines) baseLineMask |= 1 << line.line;

          const finIds = new Set(fins.map(([r, c]) => r * 9 + c));

          const removals = [];
          let m = g.box[k * 9 + finBoxIndex];
          const sr = ((finBoxIndex / 3) | 0) * 3;
          const sc = (finBoxIndex % 3) * 3;
          while (m) {
            const p = lowest(m);
            m &= m - 1;
            const r_target = sr + ((p / 3) | 0);
            const c_target = sc + (p % 3);
            const base_idx = isRowBased ? r_target : c_target;
            const cover_idx = isRowBased ? c_target : r_target;
            if (
              (coverBaseMask & (1 << cover_idx)) !== 0 &&
              (baseLineMask & (1 << base_idx)) === 0 &&
              !finIds.has(r_target * 9 + c_target)
            ) {
              removals.push({ r: r_target, c: c_target, num });
            }
          }

          if (removals.length === 0) continue;

          const baseLineIndices = new Set(baseLines.map((line) => line.line));
          const coverBaseSet = new Set(coverBaseIndices);

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

          const finPoints = [
            ...new Set(fins.map(([r, c]) => pointOf(r, c) + 1)),
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
            visualPlan: {
              highlight: { digit: num, state: 1 },
              cellColors: [
                ...[...baseLineIndices].flatMap((primIdx) =>
                  Array.from({ length: 9 }, (_, p) => {
                    const [r, c] = isRowBased ? [primIdx, p] : [p, primIdx];
                    return { r, c, color: 6, mode: "add" };
                  }),
                ),
                ...[...coverBaseSet].flatMap((secIdx) =>
                  Array.from({ length: 9 }, (_, p) => {
                    const [r, c] = isRowBased ? [p, secIdx] : [secIdx, p];
                    return { r, c, color: 7, mode: "add" };
                  }),
                ),
                ...fins.map(([r, c]) => ({
                  r,
                  c,
                  color: 5,
                  mode: "add",
                })),
              ],
              candidateColors: [...baseLineIndices].flatMap((primIdx) =>
                Array.from({ length: 9 }, (_, p) =>
                  isRowBased ? [primIdx, p] : [p, primIdx],
                )
                  .filter(([r, c]) => pencils[r][c].has(num))
                  .map(([r, c]) => ({ r, c, num, color: 6 })),
              ),
              candidateMarks: removals.map(({ r, c, num: removalNum }) => ({
                r,
                c,
                num: removalNum,
                marker: "slash",
                color: 0,
              })),
            },
          };
          if (!findAll) return resultObj;
          results.push(resultObj);
        }
      }
    }
    return findAll ? results : { change: false };
  },
});
