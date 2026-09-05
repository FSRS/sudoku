Object.assign(techniques, {
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
    const formatRC = techniques._formatCellsRC;
    const formatBP = techniques._formatBoxPoints;
    const getBasePosStr = techniques._formatRectangleBounds;

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

      if (extraData.wings) {
        detail = t(
          "teks_AUR_XY_Wing_detail",
          d1,
          d2,
          basePosStr,
          filledStr,
          unfilledStr,
          extraData.guardiansStr,
          extraData.wings[0][0] + 1,
          extraData.wings[0][1] + 1,
          extraData.wings[1][0] + 1,
          extraData.wings[1][1] + 1,
        );
      } else if (extraData.subsetCells && extraData.subsetCands) {
        const subsetStr =
          extraData.unitType === "box"
            ? formatBP(extraData.subsetCells, extraData.unitIdx)
            : formatRC(extraData.subsetCells);

        detail = t(
          "teks_AR_type_3_VNS_detail",
          d1,
          d2,
          basePosStr,
          filledStr,
          unfilledStr,
          subsetStr,
        );
      } else if (extraData.strongLinks) {
        detail = t(
          "teks_AR_type_5_ConPairs_detail",
          d1,
          d2,
          basePosStr,
          filledStr,
          unfilledStr,
          extraData.strongLinks.join(","),
        );
      } else {
        detail = t("teks_AR_base_detail", d1, d2, basePosStr, filledStr, unfilledStr);
      }

      return {
        change: true,
        type: "remove",
        cells: uniqueRemovals,

        hint: {
          name: t(nameKey),
          mainInfo: t("teks_AR_digits", d1, d2),
          detail,
        },

        visualPlan: {
          highlight: { digit: null, state: 0 },
          cellColors: [
            ...rectCells.map(([r, c]) => ({ r, c, color: 7 })),
            ...filledCells.map(([r, c]) => ({ r, c, color: 6 })),
            ...(extraData.subsetCells || []).map(([r, c]) => ({
              r,
              c,
              color: 6,
            })),
            ...(extraData.wings || []).map(([r, c]) => ({
              r,
              c,
              color: 6,
            })),
          ],
          candidateColors: [
            ...rectCells.flatMap(([r, c]) =>
              board[r][c] === 0
                ? [...pencils[r][c]].map((num) => ({
                    r,
                    c,
                    num,
                    color: num === d1 || num === d2 ? 7 : 3,
                  }))
                : [],
            ),
            ...(extraData.subsetCells || []).flatMap(([r, c]) =>
              [...pencils[r][c]]
                .filter((num) => extraData.subsetCands.has(num))
                .map((num) => ({ r, c, num, color: 4 })),
            ),
            ...(extraData.wings || []).flatMap(([r, c], index) =>
              [...pencils[r][c]].map((num) => ({
                r,
                c,
                num,
                color:
                  num === extraData.pivotDigit ? 6 : index === 0 ? 4 : 5,
              })),
            ),
          ],
          candidateMarks: uniqueRemovals.map(({ r, c, num }) => ({
            r,
            c,
            num,
            marker: "slash",
            color: 0,
          })),
          links: extraData.visualLinks || [],
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
                "teks_AR_type_1",
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
              const immediate = addResult(resultObj, "teks_AR_type_1");
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
                          "teks_AR_type_2",
                          d1,
                          d2,
                          cells,
                          filledCells,
                          removals,
                        );
                        const immediate = addResult(resultObj, "teks_AR_type_2");
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
                        "teks_AR_type_3",
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
                      const immediate = addResult(resultObj, "teks_AR_type_3");
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
                  "teks_AR_type_5",
                  d1,
                  d2,
                  cells,
                  filledCells,
                  removals,
                );

                const immediate = addResult(resultObj, "teks_AR_type_5");

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
                    "teks_AR_type_5",
                    d1,
                    d2,
                    cells,
                    filledCells,
                    removals,
                  );
                  const immediate = addResult(resultObj, "teks_AR_type_5");
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
                      color: 0,
                      style: "solid",
                    },
                    {
                      r1: fr,
                      c1: oc,
                      n1: linkDigit,
                      r2: or,
                      c2: oc,
                      n2: linkDigit,
                      color: 0,
                      style: "solid",
                    },
                  ];

                  const resultObj = makeResult(
                    "teks_HAR",
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

                  const immediate = addResult(resultObj, "teks_HAR");

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

    const filledValues = techniques._getAvoidableFilledValues(board);
    if (filledValues) {
      const xyWingProofs = techniques._findAvoidableRectangleXyWings(
        board,
        pencils,
        filledValues,
      );

      for (const proof of xyWingProofs) {
        const filledCells = proof.cells.filter(
          ([r, c]) => board[r][c] !== 0,
        );
        const guardiansStr = proof.guardianCells
          .flatMap(([r, c]) => {
            const extras = [...pencils[r][c]]
              .filter((digit) => digit !== proof.d1 && digit !== proof.d2)
              .sort((a, b) => a - b)
              .join("");
            return extras ? [`(${extras})r${r + 1}c${c + 1}`] : [];
          })
          .join(",");
        const resultObj = makeResult(
          "teks_AUR_plus_XY_Wing",
          proof.d1,
          proof.d2,
          proof.cells,
          filledCells,
          proof.removals,
          {
            guardiansStr,
            wings: proof.branches,
            pivotDigit: proof.pivotDigit,
          },
        );
        const immediate = addResult(resultObj, "teks_AUR_plus_XY_Wing");
        if (immediate) return immediate;
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

});
