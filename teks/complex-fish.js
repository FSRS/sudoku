Object.assign(techniques, {
  _complexFishCore: (board, pencils, fishSize, isMutant, findAll = false) => {
    const results = [];
    const U_ROW = 0,
      U_COL = 1,
      U_BOX = 2;

    // --- 3x27 Bitset Helpers ---
    const isZero = (a) => a[0] === 0 && a[1] === 0 && a[2] === 0;
    const bitAnd = techniques._cellBitsetAnd;
    const bitOr = (a, b) => [a[0] | b[0], a[1] | b[1], a[2] | b[2]];
    const bitAndNot = (a, b) => [a[0] & ~b[0], a[1] & ~b[1], a[2] & ~b[2]];
    const bitPopcount = (a) =>
      techniques._bits.popcount(a[0]) +
      techniques._bits.popcount(a[1]) +
      techniques._bits.popcount(a[2]);
    const setBit = techniques._setCellBit;
    const testBit = (a, id) =>
      (a[Math.floor(id / 27)] & (1 << (id % 27))) !== 0;
    const getBits = techniques._getCellBits;

    const toCheck = isMutant
      ? [{ base: [U_ROW, U_COL, U_BOX], cover: [U_ROW, U_COL, U_BOX] }]
      : [
          { base: [U_ROW, U_BOX], cover: [U_COL, U_BOX] },
          { base: [U_COL, U_BOX], cover: [U_ROW, U_BOX] },
        ];

    for (let num = 1; num <= 9; num++) {
      const templating = techniques._getTemplating(board, pencils, num);
      const { cb, cellsWithNum, units } = templating;

      if (cellsWithNum.length === 0) continue;

      // Memoization check using string representation of the bitset arrays
      const memoKey = `${fishSize}:${num}:${cb[0]}-${cb[1]}-${cb[2]}`;
      const memoSet = isMutant
        ? _memoComplexFish.mutant
        : _memoComplexFish.franken;
      if (memoSet.has(memoKey)) continue;

      // --- TEMPLATING STEP (Optimization) ---
      const rowToInds = Array.from({ length: 9 }, () => []);
      const rowsWith = [];

      for (let r = 0; r < 9; r++) {
        const present = units[r]; // Row is 0-8 in units
        if (present.length > 0) {
          rowToInds[r] = present;
          rowsWith.push(r);
        }
      }

      if (rowsWith.length === 0) {
        memoSet.add(memoKey);
        continue;
      }

      const orderRows = (firstRow) => {
        return rowsWith
          .filter((r) => r !== firstRow)
          .sort((a, b) => rowToInds[a].length - rowToInds[b].length);
      };

      // DFS to find valid patterns
      const findPatternIncluding = (i0) => {
        const r0 = Math.floor(i0 / 9);
        if (!rowToInds[r0].includes(i0)) return [];

        const rowsSeq = [r0, ...orderRows(r0)];
        const out = [i0];

        const dfs = (pos, usedCols, usedBoxes) => {
          if (pos === rowsSeq.length) return true;
          const r = rowsSeq[pos];
          for (const idx of rowToInds[r]) {
            const c = idx % 9;
            const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
            if ((usedCols >> c) & 1 || (usedBoxes >> b) & 1) continue;

            out.push(idx);
            if (dfs(pos + 1, usedCols | (1 << c), usedBoxes | (1 << b)))
              return true;
            out.pop();
          }
          return false;
        };

        const initCol = i0 % 9;
        const initBox = Math.floor(i0 / 9 / 3) * 3 + Math.floor((i0 % 9) / 3);
        if (!dfs(1, 1 << initCol, 1 << initBox)) return [];
        return out;
      };

      let possibleCells = [0, 0, 0];
      let impossibleCells = [0, 0, 0];

      const cbBits = getBits(cb);
      for (const idx of cbBits) {
        if (!testBit(possibleCells, idx)) {
          const sel = findPatternIncluding(idx);
          if (sel.length === 0) {
            setBit(impossibleCells, idx);
          } else {
            for (const j of sel) setBit(possibleCells, j);
          }
        }
      }

      if (isZero(impossibleCells)) {
        memoSet.add(memoKey);
        continue; // No constraints found
      }

      // --- FISH CORE (Targeted Combinations) ---
      const targetElims = getBits(impossibleCells);

      // Gather all valid units for this digit
      const allUnits = [];
      for (let u = 0; u < 27; u++) {
        const type = u < 9 ? U_ROW : u < 18 ? U_COL : U_BOX;
        const index = u < 9 ? u : u < 18 ? u - 9 : u - 18;
        const mask = bitAnd(UNIT_BITSETS[u], cb);
        if (!isZero(mask)) {
          allUnits.push({
            type,
            index,
            uIndex: u,
            mask,
            count: bitPopcount(mask),
          });
        }
      }

      let changed = false;
      const eliminatedTargets = new Set(); // Track globally eliminated cells across fishes found
      const seenElimSignatures = findAll ? new Set() : null;

      const baseCombinationCache = new Map();
      const getBaseCombinations = (baseTypes) => {
        const typeKey = baseTypes.reduce((mask, type) => mask | (1 << type), 0);
        if (baseCombinationCache.has(typeKey)) {
          return baseCombinationCache.get(typeKey);
        }

        const candidateUnits = allUnits.filter((unit) =>
          baseTypes.includes(unit.type),
        );
        const combinations = [];
        const selected = [];

        const visit = (start, mask, endoMask, typeMask) => {
          if (selected.length === fishSize) {
            combinations.push({
              units: selected.slice(),
              mask,
              endoMask,
              typeMask,
            });
            return;
          }

          const remaining = fishSize - selected.length;
          for (let i = start; i <= candidateUnits.length - remaining; i++) {
            const unit = candidateUnits[i];
            const nextEndoMask = bitOr(endoMask, bitAnd(mask, unit.mask));
            if (bitPopcount(nextEndoMask) > 2) continue;

            selected.push(unit);
            visit(
              i + 1,
              bitOr(mask, unit.mask),
              nextEndoMask,
              typeMask | (1 << unit.type),
            );
            selected.pop();
          }
        };

        visit(0, [0, 0, 0], [0, 0, 0], 0);
        baseCombinationCache.set(typeKey, combinations);
        return combinations;
      };

      const isExcludedGeometry = (baseTypeMask, coverTypeMask) => {
        const hasType = (mask, type) => (mask & (1 << type)) !== 0;
        if (baseTypeMask === 1 << U_ROW && coverTypeMask === 1 << U_COL)
          return true;
        if (baseTypeMask === 1 << U_COL && coverTypeMask === 1 << U_ROW)
          return true;
        if (!isMutant) {
          const hasBox =
            hasType(baseTypeMask, U_BOX) || hasType(coverTypeMask, U_BOX);
          const hasLine =
            hasType(baseTypeMask, U_ROW) ||
            hasType(baseTypeMask, U_COL) ||
            hasType(coverTypeMask, U_ROW) ||
            hasType(coverTypeMask, U_COL);
          return !hasBox || !hasLine;
        }

        return !(
          (hasType(baseTypeMask, U_ROW) && hasType(baseTypeMask, U_COL)) ||
          (hasType(coverTypeMask, U_ROW) && hasType(coverTypeMask, U_COL))
        );
      };

      const formatUnits = (selectedUnits) => {
        const r = [],
          c = [],
          b = [];
        selectedUnits.forEach((unit) => {
          if (unit.type === U_ROW) r.push(unit.index + 1);
          else if (unit.type === U_COL) c.push(unit.index + 1);
          else if (unit.type === U_BOX) b.push(unit.index + 1);
        });
        let str = "";
        if (r.length > 0) str += "r" + r.sort((x, y) => x - y).join("");
        if (c.length > 0) str += "c" + c.sort((x, y) => x - y).join("");
        if (b.length > 0) str += "b" + b.sort((x, y) => x - y).join("");
        return str;
      };

      const formatFins = (mask) =>
        getBits(mask)
          .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
          .join(",");

      const makeResult = (baseUnits, coverUnits, allFinsMask, elims) => {
        const isFinned = !isZero(allFinsMask);
        let fishName =
          fishSize === 4
            ? isMutant
              ? t("teks_mutant_jellyfish")
              : t("teks_franken_jellyfish")
            : isMutant
              ? t("teks_mutant_swordfish")
              : t("teks_franken_swordfish");
        if (isFinned) fishName = t("teks_finned_prefix") + fishName;

        const baseStr = formatUnits(baseUnits);
        const coverStr = formatUnits(coverUnits);
        let detailStr = t("teks_digit_base_cover", num, baseStr, coverStr);
        if (isFinned) {
          detailStr += t("teks_fin", formatFins(allFinsMask));
        }

        const uTypeToName = (type) =>
          type === U_ROW ? "row" : type === U_COL ? "col" : "box";
        const baseCells = baseUnits.flatMap((unit) =>
          techniques._getUnitCells(uTypeToName(unit.type), unit.index),
        );
        const coverCells = coverUnits.flatMap((unit) =>
          techniques._getUnitCells(uTypeToName(unit.type), unit.index),
        );

        return {
          change: true,
          type: "remove",
          cells: elims,
          hint: {
            name: fishName,
            mainInfo: t("teks_fish_digit", num),
            detail: detailStr,
          },
          visualPlan: {
            highlight: { digit: num, state: 1 },
            cellColors: [
              ...baseCells.map(([r, c]) => ({ r, c, color: 6, mode: "add" })),
              ...coverCells.map(([r, c]) => ({ r, c, color: 7, mode: "add" })),
              ...getBits(allFinsMask).map((id) => ({
                r: Math.floor(id / 9),
                c: id % 9,
                color: 5,
                mode: "add",
              })),
            ],
            candidateColors: baseCells
              .filter(([r, c]) => pencils[r][c].has(num))
              .map(([r, c]) => ({ r, c, num, color: 6 })),
            candidateMarks: elims.map(({ r, c, num: removalNum }) => ({
              r,
              c,
              num: removalNum,
              marker: "slash",
              color: 0,
            })),
          },
        };
      };

      // Loop over each impossible candidate cell one by one
      for (const targetId of targetElims) {
        if (eliminatedTargets.has(targetId)) continue; // Handled by a previously found fish

        let foundFishForTarget = false;

        for (const { base: baseTypes, cover: coverTypes } of toCheck) {
          if (foundFishForTarget) break; // STOP SIGN for this specific candidate target

          // Valid base units MUST NOT contain the target elimination cell
          const validBaseUnits = allUnits.filter(
            (u) => baseTypes.includes(u.type) && !testBit(u.mask, targetId),
          );
          const validCoverUnits = allUnits.filter((u) =>
            coverTypes.includes(u.type),
          );

          if (
            validBaseUnits.length < fishSize ||
            validCoverUnits.length < fishSize
          )
            continue;

          const coverByCell = Array.from({ length: 81 }, () => []);
          validCoverUnits.forEach((unit, index) => {
            getBits(unit.mask).forEach((id) => coverByCell[id].push(index));
          });

          const evaluateCover = (baseCombination, coverUnits, coverMask) => {
            if (
              coverUnits.some((cover) =>
                baseCombination.units.some(
                  (base) => base.uIndex === cover.uIndex,
                ),
              )
            )
              return null;

            const coverTypeMask = coverUnits.reduce(
              (mask, unit) => mask | (1 << unit.type),
              0,
            );
            if (isExcludedGeometry(baseCombination.typeMask, coverTypeMask))
              return null;

            const exoFinsMask = bitAndNot(baseCombination.mask, coverMask);
            if (bitPopcount(exoFinsMask) > 4) return null;

            const allFinsMask = bitOr(exoFinsMask, baseCombination.endoMask);
            if (bitPopcount(allFinsMask) > 5) return null;
            if (
              !isZero(allFinsMask) &&
              !isZero(bitAndNot(allFinsMask, PEER_BITSETS[targetId]))
            )
              return null;

            const possibleElimsMask = bitAndNot(
              coverMask,
              baseCombination.mask,
            );
            let toEliminateMask = possibleElimsMask;
            if (!isZero(allFinsMask)) {
              let commonVis = [0x7ffffff, 0x7ffffff, 0x7ffffff];
              for (const finId of getBits(allFinsMask)) {
                commonVis = bitAnd(commonVis, PEER_BITSETS[finId]);
              }
              toEliminateMask = bitAnd(possibleElimsMask, commonVis);
            }
            if (!testBit(toEliminateMask, targetId)) return null;

            const elims = getBits(toEliminateMask).map((id) => ({
              r: Math.floor(id / 9),
              c: id % 9,
              num,
            }));
            if (elims.length === 0) return null;

            if (findAll) {
              const elimSig = elims
                .map((el) => `${el.r},${el.c}:${el.num}`)
                .sort()
                .join("|");
              if (seenElimSignatures.has(elimSig)) return null;
              seenElimSignatures.add(elimSig);
            }

            elims.forEach((el) => eliminatedTargets.add(el.r * 9 + el.c));
            return makeResult(
              baseCombination.units,
              coverUnits,
              allFinsMask,
              elims,
            );
          };

          const searchCovers = (baseCombination) => {
            const requiredMask = bitAndNot(
              baseCombination.mask,
              PEER_BITSETS[targetId],
            );
            const selected = [];
            const selectedFlags = new Uint8Array(validCoverUnits.length);
            const seenStates = new Set();
            const seenCoverSets = new Set();

            const evaluateSelected = (coverMask) => {
              const sortedIndexes = selected.slice().sort((a, b) => a - b);
              const signature = sortedIndexes.join(",");
              if (seenCoverSets.has(signature)) return null;
              seenCoverSets.add(signature);
              return evaluateCover(
                baseCombination,
                sortedIndexes.map((index) => validCoverUnits[index]),
                coverMask,
              );
            };

            const fillRemaining = (start, coverMask) => {
              if (selected.length === fishSize) {
                return evaluateSelected(coverMask);
              }
              const needed = fishSize - selected.length;
              for (
                let index = start;
                index <= validCoverUnits.length - needed;
                index++
              ) {
                if (selectedFlags[index]) continue;
                selectedFlags[index] = 1;
                selected.push(index);
                const result = fillRemaining(
                  index + 1,
                  bitOr(coverMask, validCoverUnits[index].mask),
                );
                selected.pop();
                selectedFlags[index] = 0;
                if (result) return result;
              }
              return null;
            };

            const visit = (coverMask) => {
              if (selected.length === fishSize) {
                if (
                  !isZero(bitAndNot(requiredMask, coverMask)) ||
                  !testBit(coverMask, targetId)
                )
                  return null;
                return evaluateSelected(coverMask);
              }

              const stateKey = selected
                .slice()
                .sort((a, b) => a - b)
                .join(",");
              if (seenStates.has(stateKey)) return null;
              seenStates.add(stateKey);

              const uncovered = bitAndNot(requiredMask, coverMask);
              let choices = null;
              if (!isZero(uncovered)) {
                for (const id of getBits(uncovered)) {
                  const available = coverByCell[id].filter(
                    (index) => !selectedFlags[index],
                  );
                  if (available.length === 0) return null;
                  if (!choices || available.length < choices.length) {
                    choices = available;
                    if (choices.length === 1) break;
                  }
                }
              } else if (!testBit(coverMask, targetId)) {
                choices = coverByCell[targetId].filter(
                  (index) => !selectedFlags[index],
                );
                if (choices.length === 0) return null;
              } else {
                return fillRemaining(0, coverMask);
              }

              for (const index of choices) {
                selectedFlags[index] = 1;
                selected.push(index);
                const result = visit(
                  bitOr(coverMask, validCoverUnits[index].mask),
                );
                selected.pop();
                selectedFlags[index] = 0;
                if (result) return result;
              }
              return null;
            };

            return visit([0, 0, 0]);
          };

          for (const baseCombination of getBaseCombinations(baseTypes)) {
            if (testBit(baseCombination.mask, targetId)) continue;
            if (
              !isZero(
                bitAndNot(baseCombination.endoMask, PEER_BITSETS[targetId]),
              )
            )
              continue;

            const resultObj = searchCovers(baseCombination);
            if (!resultObj) continue;

            changed = true;
            foundFishForTarget = true;
            if (!findAll) return resultObj;
            results.push(resultObj);
            break;
          }
        }
      }

      if (changed && !findAll) break;
      memoSet.add(memoKey); // Caches processed digit grid
    }

    return findAll ? results : { change: false };
  },

  finnedFrankenSwordfish: (board, pencils, findAll = false) => {
    return techniques._complexFishCore(board, pencils, 3, false, findAll);
  },

  finnedMutantSwordfish: (board, pencils, findAll = false) => {
    return techniques._complexFishCore(board, pencils, 3, true, findAll);
  },

  finnedFrankenJellyfish: (board, pencils, findAll = false) => {
    return techniques._complexFishCore(board, pencils, 4, false, findAll);
  },

  finnedMutantJellyfish: (board, pencils, findAll = false) => {
    return techniques._complexFishCore(board, pencils, 4, true, findAll);
  },

  // --- Unified Coloring / Medusa Helper ---
});
