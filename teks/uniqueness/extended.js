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

  _avoidableERHasDeadlyFilling: (
    pairs,
    digits,
    board,
    pencils,
    filledValues,
  ) => {
    if (!board || !filledValues) return false;

    const cells = pairs.flat();
    const bodyIds = new Set(cells.map(([r, c]) => r * 9 + c));
    const allowed = cells.map(([r, c]) => {
      const placed = filledValues[r * 9 + c];
      return placed
        ? [placed]
        : digits.filter((digit) => pencils[r][c].has(digit));
    });
    if (allowed.some((domain) => domain.length === 0)) return false;

    const values = new Uint8Array(cells.length);
    const order = cells
      .map((_, index) => index)
      .sort((left, right) => allowed[left].length - allowed[right].length);
    const canUse = (index, digit) => {
      const [r, c] = cells[index];
      for (let other = 0; other < cells.length; other++) {
        if (values[other] !== digit) continue;
        const [otherR, otherC] = cells[other];
        if (
          r === otherR ||
          c === otherC ||
          techniques._getBoxIndex(r, c) ===
            techniques._getBoxIndex(otherR, otherC)
        ) {
          return false;
        }
      }
      return true;
    };
    const canUseAgainstOutside = (r, c, digit) => {
      for (let index = 0; index < 9; index++) {
        const rowId = r * 9 + index;
        const colId = index * 9 + c;
        if (!bodyIds.has(rowId) && board[r][index] === digit) return false;
        if (!bodyIds.has(colId) && board[index][c] === digit) return false;
      }
      const boxR = Math.floor(r / 3) * 3;
      const boxC = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          const peerR = boxR + dr;
          const peerC = boxC + dc;
          if (
            !bodyIds.has(peerR * 9 + peerC) &&
            board[peerR][peerC] === digit
          ) {
            return false;
          }
        }
      }
      return true;
    };
    const swappedFillingIsValid = () => {
      for (let pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
        const first = pairIndex * 2;
        const second = first + 1;
        const [firstR, firstC] = cells[first];
        const [secondR, secondC] = cells[second];
        if (
          !canUseAgainstOutside(firstR, firstC, values[second]) ||
          !canUseAgainstOutside(secondR, secondC, values[first])
        ) {
          return false;
        }
      }
      return true;
    };
    const search = (depth) => {
      if (depth === order.length) return swappedFillingIsValid();
      const index = order[depth];
      for (const digit of allowed[index]) {
        if (!canUse(index, digit)) continue;
        values[index] = digit;
        if (search(depth + 1)) return true;
        values[index] = 0;
      }
      return false;
    };

    return search(0);
  },

  _findExtendedRectangles: function (
    pencils,
    filledValues = null,
    board = null,
  ) {
    const rectangles = [];
    const found = new Set();
    const g = buildGrid(pencils);
    const popcount = techniques._bits.popcount;
    const maskToDigits = techniques._bits.maskToDigits;
    const cellMask = new Uint16Array(81);
    for (let id = 0; id < 81; id++) {
      const value = filledValues ? filledValues[id] : 0;
      cellMask[id] = value ? 1 << (value - 1) : g.cand[id];
    }
    const pairUsable = (idA, idB) => {
      const maskA = cellMask[idA];
      const maskB = cellMask[idB];
      if (maskA === 0 || maskB === 0) return false;
      if (!filledValues && (popcount(maskA) < 2 || popcount(maskB) < 2)) {
        return false;
      }
      return popcount(maskA | maskB) >= 2;
    };

    const ids = new Uint8Array(14);
    const pairMasks = new Uint16Array(7);
    let pairs = null;
    let cells = null;
    let placedCells = null;

    const addPattern = (coreMask, count, isNx2) => {
      for (let i = 0; i < count; i++) {
        if (popcount(pairMasks[i] & coreMask) < 2) return;
      }
      if (filledValues) {
        for (let i = 0; i < 2 * count; i++) {
          const value = filledValues[ids[i]];
          if (value && (coreMask & (1 << (value - 1))) === 0) return;
        }
      }
      let guardians = 0;
      let commonExtra = 0;
      let singleCommonExtra = true;
      for (let i = 0; i < 2 * count; i++) {
        const extra = cellMask[ids[i]] & ~coreMask;
        if (extra === 0) continue;
        guardians++;
        if (guardians === 1) commonExtra = extra;
        if (extra !== commonExtra || (extra & (extra - 1)) !== 0) {
          singleCommonExtra = false;
        }
      }
      if (guardians === 0) return;
      if (guardians >= 4 && !singleCommonExtra) return;
      if (pairs === null) {
        pairs = [];
        for (let i = 0; i < count; i++) {
          const idA = ids[2 * i];
          const idB = ids[2 * i + 1];
          pairs.push([
            [Math.floor(idA / 9), idA % 9],
            [Math.floor(idB / 9), idB % 9],
          ]);
        }
        cells = pairs.flat();
        placedCells = filledValues
          ? cells.filter(([r, c]) => filledValues[r * 9 + c] !== 0)
          : [];
      }
      const digits = maskToDigits(coreMask);
      if (
        filledValues &&
        !techniques._avoidableERHasDeadlyFilling(
          pairs,
          digits,
          board,
          pencils,
          filledValues,
        )
      ) {
        return;
      }
      const key =
        digits.join("") +
        ":" +
        cells
          .map(([r, c]) => r * 9 + c)
          .sort((a, b) => a - b)
          .join(",");
      if (found.has(key)) return;
      found.add(key);
      rectangles.push({ cells, pairs, digits, is_nx2: isNx2, placedCells });
    };

    const chooseCore = (eligible, need, fromBit, coreMask, count, isNx2) => {
      if (need === 0) {
        addPattern(coreMask, count, isNx2);
        return;
      }
      for (let bit = fromBit; bit <= 9 - need; bit++) {
        if ((eligible >> bit) & 1) {
          chooseCore(
            eligible,
            need - 1,
            bit + 1,
            coreMask | (1 << bit),
            count,
            isNx2,
          );
        }
      }
    };

    const checkPattern = (count, isNx2) => {
      let seenOnce = 0;
      let seenTwice = 0;
      for (let i = 0; i < count; i++) {
        const mask = cellMask[ids[2 * i]] | cellMask[ids[2 * i + 1]];
        pairMasks[i] = mask;
        seenTwice |= seenOnce & mask;
        seenOnce |= mask;
      }
      if (popcount(seenTwice) < count) return;
      if (filledValues) {
        let placedCount = 0;
        for (let i = 0; i < 2 * count; i++) {
          if (filledValues[ids[i]]) placedCount++;
        }
        if (placedCount === 0 || placedCount === 2 * count) return;
      }
      pairs = null;
      chooseCore(seenTwice, count, 0, 0, count, isNx2);
    };

    const chooseLines = (usable, need, from, depth, place, isNx2) => {
      if (need === 0) {
        checkPattern(depth, isNx2);
        return;
      }
      for (let i = from; i <= usable.length - need; i++) {
        place(usable[i], depth);
        chooseLines(usable, need - 1, i + 1, depth + 1, place, isNx2);
      }
    };

    for (let r1 = 0; r1 < 8; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        const place = (c, slot) => {
          ids[2 * slot] = r1 * 9 + c;
          ids[2 * slot + 1] = r2 * 9 + c;
        };
        if (Math.floor(r1 / 3) === Math.floor(r2 / 3)) {
          const usable = [];
          for (let c = 0; c < 9; c++) {
            if (pairUsable(r1 * 9 + c, r2 * 9 + c)) usable.push(c);
          }
          for (let size = 3; size <= 7; size++) {
            if (usable.length < size) break;
            chooseLines(usable, size, 0, 0, place, false);
          }
        } else {
          for (let stack = 0; stack < 3; stack++) {
            const c0 = stack * 3;
            if (
              !pairUsable(r1 * 9 + c0, r2 * 9 + c0) ||
              !pairUsable(r1 * 9 + c0 + 1, r2 * 9 + c0 + 1) ||
              !pairUsable(r1 * 9 + c0 + 2, r2 * 9 + c0 + 2)
            ) {
              continue;
            }
            place(c0, 0);
            place(c0 + 1, 1);
            place(c0 + 2, 2);
            checkPattern(3, false);
          }
        }
      }
    }

    for (let c1 = 0; c1 < 8; c1++) {
      for (let c2 = c1 + 1; c2 < 9; c2++) {
        const place = (r, slot) => {
          ids[2 * slot] = r * 9 + c1;
          ids[2 * slot + 1] = r * 9 + c2;
        };
        if (Math.floor(c1 / 3) === Math.floor(c2 / 3)) {
          const usable = [];
          for (let r = 0; r < 9; r++) {
            if (pairUsable(r * 9 + c1, r * 9 + c2)) usable.push(r);
          }
          for (let size = 3; size <= 7; size++) {
            if (usable.length < size) break;
            chooseLines(usable, size, 0, 0, place, true);
          }
        } else {
          for (let band = 0; band < 3; band++) {
            const r0 = band * 3;
            if (
              !pairUsable(r0 * 9 + c1, r0 * 9 + c2) ||
              !pairUsable((r0 + 1) * 9 + c1, (r0 + 1) * 9 + c2) ||
              !pairUsable((r0 + 2) * 9 + c1, (r0 + 2) * 9 + c2)
            ) {
              continue;
            }
            place(r0, 0);
            place(r0 + 1, 1);
            place(r0 + 2, 2);
            checkPattern(3, true);
          }
        }
      }
    }
    return rectangles;
  },

  extendedRectangle: (
    board,
    pencils,
    optionsOrFindAll = false,
    requestedFindAll = false,
  ) => {
    const options =
      optionsOrFindAll && typeof optionsOrFindAll === "object"
        ? optionsOrFindAll
        : {};
    const findAll =
      typeof optionsOrFindAll === "boolean"
        ? optionsOrFindAll
        : requestedFindAll;
    const avoidable = options.avoidable === true;
    const filledValues = avoidable
      ? techniques._getAvoidableFilledValues(board)
      : null;
    const results = [];
    if (avoidable && !filledValues)
      return findAll ? results : { change: false };
    const ers = techniques._findExtendedRectangles(
      pencils,
      filledValues,
      board,
    );
    if (ers.length === 0) return findAll ? results : { change: false };

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
      const { cells, digits, is_nx2, placedCells = [] } = er;
      const placedIds = new Set(
        placedCells.map(([r, c]) => techniques._cellToId(r, c)),
      );
      const core_digits = new Set(digits);
      const removals = [];

      const extra_cells = cells.filter(
        ([r, c]) =>
          !placedIds.has(techniques._cellToId(r, c)) &&
          [...pencils[r][c]].some((cand) => !core_digits.has(cand)),
      );

      const baseDigitsStr = digits.sort().join("");
      let detailPrefixCache = null;
      const getDetailPrefix = () => {
        if (detailPrefixCache === null) {
          detailPrefixCache = avoidable
            ? t(
                "teks_AEUR_base_guardians",
                baseDigitsStr,
                getBasePosStr(cells),
                getGuardiansStr(extra_cells, core_digits, pencils),
              )
            : t(
                "teks_EUR_base_guardians",
                baseDigitsStr,
                getBasePosStr(cells),
                getGuardiansStr(extra_cells, core_digits, pencils),
              );
        }
        return detailPrefixCache;
      };

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
              name: t(avoidable ? "teks_AEUR_type_1" : "teks_EUR_type_1"),
              mainInfo: t(
                avoidable ? "teks_AEUR_digits" : "teks_EUR_digits",
                baseDigitsStr,
              ),
              detail: getDetailPrefix(),
            },
            visualPlan: getEURVisualPlan(
              1,
              cells,
              digits,
              _getUniqueRemovals(removals),
              { placedCells },
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
                  ? t(avoidable ? "teks_AEUR_type_2" : "teks_EUR_type_2")
                  : t(avoidable ? "teks_AEUR_type_5" : "teks_EUR_type_5"),
                mainInfo: t(
                  avoidable ? "teks_AEUR_digits" : "teks_EUR_digits",
                  baseDigitsStr,
                ),
                detail: getDetailPrefix(),
              },
              visualPlan: getEURVisualPlan(
                guardiansShareHouse ? 2 : 5,
                cells,
                digits,
                _getUniqueRemovals(removals),
                { placedCells },
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
                  name: t(avoidable ? "teks_AEUR_type_3" : "teks_EUR_type_3"),
                  mainInfo: t(
                    avoidable ? "teks_AEUR_digits" : "teks_EUR_digits",
                    baseDigitsStr,
                  ),
                  detail: t(
                    "teks_EUR_subset_cells",
                    getDetailPrefix(),
                    subsetStr,
                  ),
                },
                visualPlan: getEURVisualPlan(
                  3,
                  cells,
                  digits,
                  _getUniqueRemovals(res.removals),
                  {
                    subsetCells: res.chosen,
                    subsetCands: res.union,
                    placedCells,
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
                const restrictedCellsStr = formatRC([
                  [e1r, e1c],
                  [e2r, e2c],
                ]);

                const resultObj = {
                  change: true,
                  type: "remove",
                  cells: _getUniqueRemovals(removals),
                  hint: {
                    name: t(avoidable ? "teks_AEUR_type_4" : "teks_EUR_type_4"),
                    mainInfo: t(
                      avoidable ? "teks_AEUR_digits" : "teks_EUR_digits",
                      baseDigitsStr,
                    ),
                    detail: t(
                      "teks_EUR_type_4_restricted_base_detail",
                      getDetailPrefix(),
                      d,
                      restrictedCellsStr,
                    ),
                  },
                  visualPlan: getEURVisualPlan(
                    4,
                    cells,
                    digits,
                    _getUniqueRemovals(removals),
                    {
                      restrictedDigit: d,
                      e1: [e1r, e1c],
                      e2: [e2r, e2c],
                      placedCells,
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
        // Type 6: Extras do not see each other
        else {
          for (const d of digits) {
            if (!pencils[e1r][e1c].has(d) || !pencils[e2r][e2c].has(d))
              continue;

            let is_restricted = false;
            if (!is_nx2) {
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
                    name: t(avoidable ? "teks_AEUR_type_6" : "teks_EUR_type_6"),
                    mainInfo: t(
                      avoidable ? "teks_AEUR_digits" : "teks_EUR_digits",
                      baseDigitsStr,
                    ),
                    detail: t(
                      "teks_EUR_type_6_guardian_elimination_detail",
                      getDetailPrefix(),
                      d,
                    ),
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
                      placedCells,
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

  avoidableExtendedRectangle: (board, pencils, findAll = false) =>
    techniques.extendedRectangle(board, pencils, { avoidable: true }, findAll),
});
