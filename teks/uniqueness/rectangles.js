Object.assign(techniques, {
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
    const rects = techniques._findUniquenessRectangles(pencils);
    if (!rects || rects.length === 0) return { change: false };

    const isExactPair = (r, c, d1, d2) =>
      pencils[r][c].size === 2 &&
      pencils[r][c].has(d1) &&
      pencils[r][c].has(d2);

    const formatRC = techniques._formatCellsRC;
    const formatBP = techniques._formatBoxPoints;
    const getGuardiansStr = (extraCells, d1, d2) =>
      techniques._formatGuardianExtras(extraCells, new Set([d1, d2]), pencils);
    const getBasePosStr = techniques._formatRectangleBounds;

    const getURVisualPlan = (type, cells, d1, d2, removals, extraData = {}) => {
      const candidateColors = cells.flatMap(([r, c]) =>
        Array.from(pencils[r][c], (num) => ({
          r,
          c,
          num,
          color: num === d1 || num === d2 ? 7 : 3,
        })),
      );
      const cellColors = cells.map(([r, c]) => ({ r, c, color: 7 }));
      const links = [];

      if (type === 3) {
        for (const [r, c] of extraData.subsetCells) {
          cellColors.push({ r, c, color: 6 });
          for (const num of pencils[r][c]) {
            if (extraData.subsetCands.has(num)) {
              candidateColors.push({ r, c, num, color: 4 });
            }
          }
        }
      }

      if (type === 4) {
        links.push({
          r1: extraData.e1[0],
          c1: extraData.e1[1],
          n1: extraData.restrictedDigit,
          r2: extraData.e2[0],
          c2: extraData.e2[1],
          n2: extraData.restrictedDigit,
          color: 0,
          style: "solid",
        });
      }

      if (type === 6) {
        const u = extraData.restrictedDigit;
        const rows = [...new Set(cells.map((c) => c[0]))];
        const cols = [...new Set(cells.map((c) => c[1]))];
        links.push({
          r1: rows[0],
          c1: cols[0],
          n1: u,
          r2: rows[0],
          c2: cols[1],
          n2: u,
          color: 0,
          style: "solid",
        });
        links.push({
          r1: rows[1],
          c1: cols[0],
          n1: u,
          r2: rows[1],
          c2: cols[1],
          n2: u,
          color: 0,
          style: "solid",
        });
      }

      return {
        highlight: {
          digit: type === 4 || type === 6 ? extraData.restrictedDigit : null,
          state: type === 4 || type === 6 ? 1 : 0,
        },
        cellColors,
        candidateColors,
        candidateMarks: removals.map(({ r, c, num }) => ({
          r,
          c,
          num,
          marker: "slash",
          color: 0,
        })),
        links,
      };
    };

    const getURXyWingVisualPlan = (
      cells,
      d1,
      d2,
      wings,
      pivotDigit,
      extraDigits,
      removals,
    ) => {
      return {
        highlight: { digit: null, state: 0 },
        cellColors: [
          ...cells.map(([r, c]) => ({ r, c, color: 7 })),
          ...wings.map(([r, c]) => ({ r, c, color: 6 })),
        ],
        candidateColors: [
          ...cells.flatMap(([r, c]) =>
            Array.from(pencils[r][c], (num) => ({
              r,
              c,
              num,
              color:
                num === d1 || num === d2 ? 7 : num === extraDigits[1] ? 5 : 4,
            })),
          ),
          ...wings.flatMap(([r, c], index) =>
            Array.from(pencils[r][c], (num) => ({
              r,
              c,
              num,
              color: num === pivotDigit ? 6 : index === 0 ? 4 : 5,
            })),
          ),
        ],
        candidateMarks: removals.map(({ r, c, num }) => ({
          r,
          c,
          num,
          marker: "slash",
          color: 0,
        })),
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
            visualPlan: getURVisualPlan(
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
                visualPlan: getURVisualPlan(
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
                visualPlan: getURVisualPlan(
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
                  visualPlan: getURVisualPlan(
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
                  visualPlan: getURVisualPlan(
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
          ),
        },
        visualPlan: getURXyWingVisualPlan(
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
    const rectangles = techniques._findUniquenessRectangles(pencils);
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
            color: 0,
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
            color: 0,
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

            visualPlan: {
              highlight: { digit: null, state: 0 },
              cellColors: cells.map(([r, c]) => ({ r, c, color: 7 })),
              candidateColors: cells.flatMap(([r, c]) =>
                Array.from(pencils[r][c], (num) => ({
                  r,
                  c,
                  num,
                  color: num === d1 || num === d2 ? 7 : 3,
                })),
              ),
              candidateMarks: uniqueRemovals.map(({ r, c, num }) => ({
                r,
                c,
                num,
                marker: "slash",
                color: 0,
              })),
              links: visualLinks,
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
