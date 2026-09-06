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
        // A concrete digit can participate in an ALT's off-intersection set,
        // but it is already placed and therefore has nothing to remove.
        if (board[r][c] !== 0) continue;
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

              const inIntersection = [];
              const outsideIntersection = [];
              let hasDisallowedConcrete = false;

              for (const [tr, tc] of targetCells) {
                let isIntersect = false;
                if (baseType === "box") {
                  isIntersect = techniques._getBoxIndex(tr, tc) === baseIdx;
                } else {
                  isIntersect = (isRow ? tr : tc) === baseIdx;
                }

                const concrete = board[tr][tc];
                // A placed ALS digit may occupy one of an ALT's two
                // off-intersection cells.  ALPs retain their existing,
                // candidate-only behavior.
                if (concrete !== 0) {
                  if (size === 3 && !isIntersect && V.has(concrete)) {
                    outsideIntersection.push({ r: tr, c: tc });
                  } else if (V.has(concrete)) {
                    // Keep concrete digits out of the intersection, and
                    // preserve ALP's candidate-only behavior.
                    hasDisallowedConcrete = true;
                    break;
                  }
                  continue;
                }

                let hasV = false;
                for (const v of V) {
                  if (pencils[tr][tc].has(v)) {
                    hasV = true;
                    break;
                  }
                }
                if (!hasV) continue;

                if (isIntersect) {
                  inIntersection.push({ r: tr, c: tc });
                } else {
                  outsideIntersection.push({ r: tr, c: tc });
                }
              }

              if (hasDisallowedConcrete) continue;

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

                  const techName = size === 2 ? t("teks_ALP") : t("teks_ALT");
                  const mainInfo = t(
                    "teks_ALS_houses",
                    isRow ? t("teks_unit_row") : t("teks_unit_col"),
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
                        "teks_ALS_intersection_detail",
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
                      const hintName = t("teks_SdC");
                      const lineName = isRow
                        ? t("teks_unit_row")
                        : t("teks_unit_col");

                      // Build Hint Detail
                      const aCells = parsePosSet(A.positions);
                      const bCells = parsePosSet(B.positions);

                      const strA = formatRC(aCells);
                      const strB = formatBP(bCells, boxNum);
                      const strC = formatRC(C);

                      const totalMask = A.mask | B.mask | V_mask;
                      const strDigits = maskToDigitsStr(totalMask);

                      let detailStr = t(
                        "teks_SdC_detail",
                        strC,
                        strA,
                        strB,
                        strDigits,
                      );

                      if (overlapMask > 0) {
                        detailStr += t(
                          "teks_SdC_duplicate_digit_suffix",
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
                            "teks_SdC_intersection",
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
});
