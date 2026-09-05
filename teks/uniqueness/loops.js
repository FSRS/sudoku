Object.assign(techniques, {
  _findUniqueLoops: function (pencils) {
    const bivalue_cells_by_pair = new Map();

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cands = pencils[r][c];
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

    const loops = [];
    const found = new Set();
    const maxLoopLength = 18;
    const maxResults = 1023;

    for (const [
      pair_key,
      bivalue_set_for_pair,
    ] of bivalue_cells_by_pair.entries()) {
      if (bivalue_set_for_pair.size < 2) continue;

      const [d1, d2] = pair_key.split(",").map(Number);
      const cell_list = [];
      const guardian_set_for_pair = new Set();

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const cands = pencils[r][c];
          const hasD1 = cands.has(d1);
          const hasD2 = cands.has(d2);
          if (!hasD1 && !hasD2) continue;

          const hasExtra = [...cands].some(
            (digit) => digit !== d1 && digit !== d2,
          );
          if (!hasD1 || !hasD2) {
            if (!hasExtra) continue;
            guardian_set_for_pair.add(r * 9 + c);
          } else if (hasExtra) {
            guardian_set_for_pair.add(r * 9 + c);
          }
          cell_list.push(r * 9 + c);
        }
      }
      if (cell_list.length < 6) continue;

      const neighbors = new Map();
      for (const id of cell_list) {
        const cell = [Math.floor(id / 9), id % 9];
        neighbors.set(
          id,
          cell_list.filter(
            (other) =>
              other !== id &&
              techniques._sees(cell, [Math.floor(other / 9), other % 9]),
          ),
        );
      }

      for (const start of bivalue_set_for_pair) {
        if (!neighbors.has(start)) continue;
        const path = [start];
        const used = new Set(path);
        let guardianCount = 0;
        const houseCounts = new Uint8Array(27);
        const houseParityMasks = new Uint8Array(27);
        const getHouses = (id) => {
          const r = Math.floor(id / 9);
          const c = id % 9;
          return [r, 9 + c, 18 + techniques._getBoxIndex(r, c)];
        };
        for (const house of getHouses(start)) {
          houseCounts[house] = 1;
          houseParityMasks[house] = 1;
        }

        const search = (current) => {
          for (const next of neighbors.get(current)) {
            if (next === start) continue;
            if (used.has(next) || path.length >= maxLoopLength) continue;
            if (bivalue_set_for_pair.has(next) && next < start) continue;
            const isGuardian = guardian_set_for_pair.has(next);
            if (isGuardian && guardianCount >= 4) continue;
            const parity = path.length & 1;
            const parityBit = 1 << parity;
            const nextHouses = getHouses(next);
            if (
              nextHouses.some(
                (house) =>
                  houseCounts[house] >= 2 ||
                  (houseParityMasks[house] & parityBit) !== 0,
              )
            )
              continue;

            path.push(next);
            used.add(next);
            if (isGuardian) guardianCount++;
            for (const house of nextHouses) {
              houseCounts[house]++;
              houseParityMasks[house] |= parityBit;
            }

            let stop = false;
            const isDeadlyBody = houseCounts.every(
              (count) => count === 0 || count === 2,
            );
            if (
              path.length >= 6 &&
              path.length % 2 === 0 &&
              isDeadlyBody &&
              techniques._sees(
                [Math.floor(next / 9), next % 9],
                [Math.floor(start / 9), start % 9],
              )
            ) {
              const key = `${pair_key}:${[...path]
                .sort((a, b) => a - b)
                .join(",")}`;
              if (!found.has(key)) {
                const bivalueCount = path.filter((id) =>
                  bivalue_set_for_pair.has(id),
                ).length;
                if (bivalueCount >= 2) {
                  found.add(key);
                  loops.push({
                    cells: path.map((id) => [Math.floor(id / 9), id % 9]),
                    digits: [d1, d2],
                  });
                  stop = loops.length >= maxResults;
                }
              }
            }

            if (!stop && path.length < maxLoopLength) stop = search(next);
            for (const house of nextHouses) {
              houseCounts[house]--;
              houseParityMasks[house] &= ~parityBit;
            }
            used.delete(next);
            path.pop();
            if (isGuardian) guardianCount--;
            if (stop) return true;
          }
          return false;
        };

        if (search(start) || loops.length >= maxResults) break;
      }
      if (loops.length >= maxResults) break;
    }
    return loops;
  },
  uniqueLoop: (board, pencils, findAll = false) => {
    const results = [];
    const loops = techniques._findUniqueLoops(pencils);
    if (loops.length === 0) return { change: false };

    const formatRC = techniques._formatCellsRC;
    const formatBP = techniques._formatBoxPoints;
    const getBasePosStr = techniques._formatRectangleBounds;
    const getGuardiansStr = (extraCells, digitSet, sourcePencils) =>
      techniques._formatGuardianExtras(extraCells, digitSet, sourcePencils);

    const getULVisualPlan = (type, cells, digits, removals, extraData = {}) => {
      const plan = techniques._buildDeadlyPatternBaseVisualPlan(
        type,
        cells,
        digits,
        extraData,
        pencils,
      );

      if (type === 6) {
        const u = extraData.restrictedDigit;
        const rows = [...new Set(cells.map((c) => c[0]))];
        rows.forEach((r) => {
          const req_locs = cells
            .filter((cell) => cell[0] === r)
            .map((cell) => cell[1])
            .sort((a, b) => a - b);
          if (req_locs.length === 2) {
            plan.links.push({
              r1: r,
              c1: req_locs[0],
              n1: u,
              r2: r,
              c2: req_locs[1],
              n2: u,
              color: 0,
              style: "solid",
            });
          }
        });
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

    for (const ul of loops) {
      const { cells, digits } = ul;
      const [d1, d2] = digits;
      const d_set = new Set(digits);
      let removals = [];

      const extra_cells = cells.filter(
        ([r, c]) =>
          pencils[r][c].size !== 2 ||
          ![...pencils[r][c]].every((d) => d_set.has(d)),
      );

      const baseDigitsStr = `${d1}${d2}`;
      const detailPrefix = t(
        "teks_UL_base_guardians",
        baseDigitsStr,
        getBasePosStr(cells),
        getGuardiansStr(extra_cells, d_set, pencils),
      );

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
              name: t("teks_UL_type_1"),
              mainInfo: t("teks_UL_digits", baseDigitsStr),
              detail: detailPrefix,
            },
            visualPlan: getULVisualPlan(
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
      if (extra_cells.length >= 2 && extra_cells.length <= 4) {
        let common_extra_cand = -1;
        let isCommonGuardian = true;
        for (const [r, c] of extra_cells) {
          const extras = [...pencils[r][c]].filter((cand) => !d_set.has(cand));
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
                  ? t("teks_UL_type_2")
                  : t("teks_UL_type_5"),
                mainInfo: t("teks_UL_digits", baseDigitsStr),
                detail: detailPrefix,
              },
              visualPlan: getULVisualPlan(
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

      // --- Types 3 & 4 ---
      if (extra_cells.length === 2) {
        const [e1r, e1c] = extra_cells[0];
        const [e2r, e2c] = extra_cells[1];

        // --- Type 3 (Loop + Naked Subset) ---
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
            const ulCellsSet = new Set(cells.map(JSON.stringify));
            const unitCells = unitCellsRaw.filter(
              ([r, c]) =>
                !ulCellsSet.has(JSON.stringify([r, c])) && board[r][c] === 0,
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
                  name: t("teks_UL_type_3"),
                  mainInfo: t("teks_UL_digits", baseDigitsStr),
                  detail: t("teks_EUR_subset_cells", detailPrefix, subsetStr),
                },
                visualPlan: getULVisualPlan(
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
                    name: t("teks_UL_type_4"),
                    mainInfo: t("teks_UL_digits", baseDigitsStr),
                    detail: t(
                      "teks_EUR_type_4_restricted_base_detail",
                      detailPrefix,
                      d,
                      restrictedCellsStr,
                    ),
                  },
                  visualPlan: getULVisualPlan(
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
      if (extra_cells.length > 1) {
        // A restricted base digit can occupy either parity of the loop, but
        // not a mixture of both.  Therefore Type 6 only applies when every
        // guardian belongs to the same parity of the loop order.  Whether
        // guardians see one another is unrelated to this deduction.
        const guardianIds = new Set(
          extra_cells.map(([r, c]) => techniques._cellToId(r, c)),
        );
        const guardianParities = new Set();
        cells.forEach(([r, c], index) => {
          if (guardianIds.has(techniques._cellToId(r, c))) {
            guardianParities.add(index & 1);
          }
        });

        if (guardianParities.size === 1) {
          // Group the loop cells by every house they occupy.  The loop
          // finder guarantees two loop cells per occupied house; checking
          // that explicitly here keeps the restriction test self-contained.
          const loopHouses = new Map();
          const addToHouse = (type, index, cell) => {
            const key = `${type}:${index}`;
            if (!loopHouses.has(key)) {
              loopHouses.set(key, { type, index, cellIds: new Set() });
            }
            loopHouses
              .get(key)
              .cellIds.add(techniques._cellToId(cell[0], cell[1]));
          };
          cells.forEach((cell) => {
            const [r, c] = cell;
            addToHouse("row", r, cell);
            addToHouse("col", c, cell);
            addToHouse("box", techniques._getBoxIndex(r, c), cell);
          });

          for (const u of digits) {
            // The base digit must be restricted to the two loop cells in
            // every row, column, and box used by the loop.  This establishes
            // the two alternating placements of that digit around the loop.
            const isRestrictedInAllLoopHouses = [...loopHouses.values()].every(
              ({ type, index, cellIds }) => {
                if (cellIds.size !== 2) return false;
                const candidateIds = new Set(
                  techniques
                    ._getUnitCells(type, index)
                    .filter(([r, c]) => pencils[r][c].has(u))
                    .map(([r, c]) => techniques._cellToId(r, c)),
                );
                return (
                  candidateIds.size === cellIds.size &&
                  [...cellIds].every((id) => candidateIds.has(id))
                );
              },
            );
            if (!isRestrictedInAllLoopHouses) continue;

            const type6Removals = extra_cells
              .filter(([r, c]) => pencils[r][c].has(u))
              .map(([r, c]) => ({ r, c, num: u }));
            if (type6Removals.length === 0) continue;

            const uniqueRemovals = _getUniqueRemovals(type6Removals);
            const resultObj = {
              change: true,
              type: "remove",
              cells: uniqueRemovals,
              hint: {
                name: t("teks_UL_type_6"),
                mainInfo: t("teks_UL_digits", baseDigitsStr),
                detail: t("teks_UL_type_6_guardian_elimination_detail", detailPrefix, u),
              },
              visualPlan: getULVisualPlan(6, cells, digits, uniqueRemovals, {
                restrictedDigit: u,
              }),
            };
            if (!findAll) return resultObj;
            results.push(resultObj);
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

});
