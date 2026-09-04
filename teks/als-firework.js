Object.assign(techniques, {
  // --- Unified Helper for Almost Locked Pair & Triple ---
  _almostLockedSets: (board, pencils, size, findAll = false) => {
    const results = [];
    const numBaseCells = size - 1;

    // --- Format Helpers for Hints ---
    const formatRC = techniques._formatCellsRC;
    const formatBP = techniques._formatBoxPoints;

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
                    visualPlan: {
                      highlight: { digit: null, state: 0 },
                      cellColors: [
                        ...baseCells.map(([r, c]) => ({
                          r,
                          c,
                          color: 6,
                          mode: "add",
                        })),
                        ...inIntersection.flatMap(({ r, c }) => [
                          { r, c, color: 6, mode: "add" },
                          { r, c, color: 7, mode: "add" },
                        ]),
                        ...outsideIntersection.map(({ r, c }) => ({
                          r,
                          c,
                          color: 7,
                          mode: "add",
                        })),
                      ],
                      candidateColors: [
                        ...baseCells,
                        ...inIntersection.map(({ r, c }) => [r, c]),
                        ...outsideIntersection.map(({ r, c }) => [r, c]),
                      ].flatMap(([r, c]) =>
                        [...V]
                          .filter((num) => pencils[r][c].has(num))
                          .map((num) => ({ r, c, num, color: 4 })),
                      ),
                      candidateMarks: uniqueElims.map(({ r, c, num }) => ({
                        r,
                        c,
                        num,
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
    const bitFor = techniques._bits.bitFor;
    const maskFromSet = techniques._bits.maskFromSet;
    const bitCount = techniques._bits.popcount;

    const combinations = techniques.combinations;

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

    const formatRC = techniques._formatCellsRC;

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

                      const lineOnlyMask = A.mask & ~overlapMask;
                      const boxOnlyMask = B.mask & ~overlapMask;
                      const intOnlyMask = V_mask & ~(A.mask | B.mask);
                      const allPatternCells = [...C, ...aCells, ...bCells];
                      const candidateColors = [
                        [overlapMask, 2],
                        [lineOnlyMask, 6],
                        [boxOnlyMask, 4],
                        [intOnlyMask, 5],
                      ].flatMap(([mask, color]) =>
                        allPatternCells.flatMap(([r, c]) =>
                          techniques._bits
                            .maskToDigits(mask)
                            .filter((num) => pencils[r][c].has(num))
                            .map((num) => ({ r, c, num, color })),
                        ),
                      );

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
                        visualPlan: {
                          highlight: { digit: null, state: 0 },
                          cellColors: [
                            ...[...C, ...aCells].map(([r, c]) => ({
                              r,
                              c,
                              color: 7,
                              mode: "add",
                            })),
                            ...[...C, ...bCells].map(([r, c]) => ({
                              r,
                              c,
                              color: 6,
                              mode: "add",
                            })),
                          ],
                          candidateColors,
                          candidateMarks: eliminations.map(({ r, c, num }) => ({
                            r,
                            c,
                            num,
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
    const bitFor = techniques._bits.bitFor;
    const maskFromSet = techniques._bits.maskFromSet;
    const bitCount = techniques._bits.popcount;
    const maskToDigits = techniques._bits.maskToDigits;
    const boxIndex = techniques._getBoxIndex;

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
            const pivotPairs = [
              [map[0], map[3]],
              [map[1], map[2]],
            ];
            const pivotData = pivotPairs.map(([pivot1, pivot2]) => {
              const other1 = pivot1 === map[0] ? map[1] : map[0];
              const other2 = pivot1 === map[0] ? map[2] : map[3];
              return {
                pivot1,
                pivot2,
                other1,
                other2,
                satisfied1: getFireworkDigits(other1, other2, pivot1),
                satisfied2: getFireworkDigits(other1, other2, pivot2),
              };
            });

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

              for (const {
                pivot1,
                pivot2,
                other1,
                other2,
                satisfied1,
                satisfied2,
              } of pivotData) {
                for (const [[d1, d2], [d3, d4]] of cases) {
                  const pair1Mask = bitFor(d1) | bitFor(d2);
                  const pair2Mask = bitFor(d3) | bitFor(d4);

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
                    const buildPairVisuals = (pivot, mask, color) => {
                      const cellColors = [];
                      const candidateColors = [];
                      for (let r = 0; r < 9; r++) {
                        for (let c = 0; c < 9; c++) {
                          if (r !== pivot[0] && c !== pivot[1]) continue;
                          const candidates = maskToDigits(mask).filter((num) =>
                            pencils[r][c].has(num),
                          );
                          if (candidates.length === 0) continue;
                          cellColors.push({ r, c, color, mode: "add" });
                          candidateColors.push(
                            ...candidates.map((num) => ({ r, c, num, color })),
                          );
                        }
                      }
                      return { cellColors, candidateColors };
                    };
                    const pair1Visuals = buildPairVisuals(pivot1, pair1Mask, 5);
                    const pair2Visuals = buildPairVisuals(pivot2, pair2Mask, 6);
                    const resultEliminations = [...eliminations];
                    const res = {
                      change: true,
                      type: "remove",
                      cells: resultEliminations,
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
                      visualPlan: {
                        highlight: { digit: null, state: 0 },
                        cellColors: [
                          ...pair1Visuals.cellColors,
                          ...pair2Visuals.cellColors,
                        ],
                        candidateColors: [
                          ...pair1Visuals.candidateColors,
                          ...pair2Visuals.candidateColors,
                        ],
                        candidateMarks: resultEliminations.map(
                          ({ r, c, num }) => ({
                            r,
                            c,
                            num,
                            marker: "slash",
                            color: 0,
                          }),
                        ),
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
    const bitFor = techniques._bits.bitFor;
    const maskFromSet = techniques._bits.maskFromSet;
    const bitCount = techniques._bits.popcount;
    const maskToDigits = techniques._bits.maskToDigits;
    const boxIndex = techniques._getBoxIndex;
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
                                  const ahsCells = [
                                    ...new Map(
                                      [...rowAhsCells, ...colAhsCells].map(
                                        ([r, c]) => [`${r},${c}`, [r, c]],
                                      ),
                                    ).values(),
                                  ];

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
                                    visualPlan: {
                                      highlight: { digit: null, state: 0 },
                                      cellColors: ahsCells.map(([r, c]) => ({
                                        r,
                                        c,
                                        color: 5,
                                        mode: "add",
                                      })),
                                      candidateColors: ahsCells.flatMap(
                                        ([r, c]) =>
                                          ahsDigitArr
                                            .filter((num) =>
                                              pencils[r][c].has(num),
                                            )
                                            .map((num) => ({
                                              r,
                                              c,
                                              num,
                                              color: 5,
                                            })),
                                      ),
                                      candidateMarks: eliminations.map(
                                        ({ r, c, num }) => ({
                                          r,
                                          c,
                                          num,
                                          marker: "slash",
                                          color: 0,
                                        }),
                                      ),
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
});
