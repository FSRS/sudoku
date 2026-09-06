Object.assign(techniques, {
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
                                      name: t("teks_firework_triple"),
                                      mainInfo: t("teks_firework_digits", ahsDigits),
                                      detail: t(
                                        "teks_firework_position",
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

});
