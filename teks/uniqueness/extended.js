Object.assign(techniques, {
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
    const bitCount = techniques._bits.popcount;

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

    const formatRC = techniques._formatCellsRC;
    const formatBP = techniques._formatBoxPoints;
    const getBasePosStr = techniques._formatRectangleBounds;
    const getGuardiansStr = (extraCells, coreDigits, sourcePencils) =>
      techniques._formatGuardianExtras(extraCells, coreDigits, sourcePencils);

    const getEURVisualPlan = (
      type,
      cells,
      digits,
      removals,
      extraData = {},
    ) => {
      const plan = techniques._buildDeadlyPatternBaseVisualPlan(
        type,
        cells,
        digits,
        extraData,
        pencils,
      );

      if (type === 6) {
        const u = extraData.restrictedDigit;
        const [e1r, e1c] = extraData.e1;
        const [e2r, e2c] = extraData.e2;
        if (extraData.is_nx2) {
          plan.links.push({
              r1: e1r,
              c1: e1c,
              n1: u,
              r2: e2r,
              c2: e1c,
              n2: u,
              color: 0,
              style: "solid",
          });
          plan.links.push({
              r1: e1r,
              c1: e2c,
              n1: u,
              r2: e2r,
              c2: e2c,
              n2: u,
              color: 0,
              style: "solid",
          });
        } else {
          plan.links.push({
              r1: e1r,
              c1: e1c,
              n1: u,
              r2: e1r,
              c2: e2c,
              n2: u,
              color: 0,
              style: "solid",
          });
          plan.links.push({
              r1: e2r,
              c1: e1c,
              n1: u,
              r2: e2r,
              c2: e2c,
              n2: u,
              color: 0,
              style: "solid",
          });
        }
      }

      plan.candidateMarks = removals.map(({ r, c, num }) => ({
        r,
        c,
        num,
        marker: "slash",
        color: 0,
      }));
      return plan;
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
            visualPlan: getEURVisualPlan(
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
              visualPlan: getEURVisualPlan(
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
                visualPlan: getEURVisualPlan(
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
                  visualPlan: getEURVisualPlan(
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
                  visualPlan: getEURVisualPlan(
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

});
