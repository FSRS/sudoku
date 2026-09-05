Object.assign(techniques, {
  uniquenessExternalTest: (board, pencils, findAll = false) =>
    techniques._uniquenessExternalTest(board, pencils, findAll, false),

  avoidableUniquenessExternalTest: (board, pencils, findAll = false) =>
    techniques._uniquenessExternalTest(board, pencils, findAll, true),

  _uniquenessExternalTest: (board, pencils, findAll, avoidable) => {
    const results = [];
    const emitted = new Set();
    // Type 2, Type 3, Type 3h, + XY-Wing.
    const [type2Key, type3Key, type3hKey, xyWingKey] = avoidable
      ? ["teks_AUET_type_2", "teks_AUET_type_3", "teks_AUET_type_3h", "teks_AUET_plus_XY_Wing"]
      : ["teks_UET_type_2", "teks_UET_type_3", "teks_UET_type_3h", "teks_UET_plus_XY_Wing"];
    const cellKey = (r, c) => r + "," + c;
    const cellId = techniques._cellToId;
    const idToCell = techniques._idToCell;
    const uniqueCells = (cells) =>
      [...new Set(cells.map(([r, c]) => cellId(r, c)))]
        .sort((a, b) => a - b)
        .map(idToCell);
    const formatBody = techniques._formatRectangleBounds;
    const formatCompactCells = (cells) => {
      const unique = uniqueCells(cells);
      const groupBy = (primaryIndex, secondaryIndex, primaryPrefix) => {
        const groups = new Map();
        unique.forEach((cell) => {
          const primary = cell[primaryIndex];
          if (!groups.has(primary)) groups.set(primary, []);
          groups.get(primary).push(cell[secondaryIndex] + 1);
        });
        return [...groups]
          .map(([primary, secondary]) =>
            primaryPrefix === "r"
              ? `r${primary + 1}c${secondary.join("")}`
              : `r${secondary.join("")}c${primary + 1}`,
          )
          .join(",");
      };
      const byRow = groupBy(0, 1, "r");
      const byColumn = groupBy(1, 0, "c");
      return byColumn.length < byRow.length ? byColumn : byRow;
    };
    const formatCandidateCells = (cells, getDigits) => {
      const byDigits = new Map();
      uniqueCells(cells).forEach(([r, c]) => {
        const digits = [...new Set(getDigits(r, c))]
          .sort((a, b) => a - b)
          .join("");
        if (!digits) return;
        if (!byDigits.has(digits)) byDigits.set(digits, []);
        byDigits.get(digits).push([r, c]);
      });
      return [...byDigits]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([digits, groupedCells]) =>
            `(${digits})${formatCompactCells(groupedCells)}`,
        )
        .join(",");
    };
    const formatGuardians = (cells, d1, d2) =>
      formatCandidateCells(cells, (r, c) =>
        [d1, d2].filter((digit) => pencils[r][c].has(digit)),
      );
    const formatHouse = (type, index) =>
      `${type === "row" ? "r" : type === "col" ? "c" : "b"}${index + 1}`;

    const makeVisualPlan = (body, d1, d2, guardians, removals, extra = {}) => {
      const cellColors = [];
      const candidateColors = [];
      const paint = (cells, digits, color) => {
        for (const [r, c] of cells) {
          cellColors.push({ r, c, color });
          for (const num of digits) {
            if (pencils[r][c].has(num)) {
              candidateColors.push({ r, c, num, color });
            }
          }
        }
      };

      paint(body, [d1, d2], 7);
      const uniqueGuardians = uniqueCells(guardians);
      paint(uniqueGuardians, [d1, d2], 6);
      paint(extra.subsetCells || [], extra.subsetDigits || [], 5);

      const guardianKeys = new Set(
        uniqueGuardians.map(([r, c]) => cellKey(r, c)),
      );
      for (const [r, c] of extra.ahsCells || []) {
        const isGuardian = guardianKeys.has(cellKey(r, c));
        paint(
          [[r, c]],
          isGuardian
            ? new Set([d1, d2, ...(extra.ahsDigits || [])])
            : extra.ahsDigits || [],
          isGuardian ? 6 : 5,
        );
      }
      for (const [r, c] of extra.wings || []) {
        paint([[r, c]], pencils[r][c], 4);
      }

      return {
        highlight: { digit: null, state: 0 },
        cellColors,
        candidateColors,
        candidateMarks: removals.map(({ r, c, num }) => ({
          r,
          c,
          num,
          marker: "slash",
          color: 0,
        })),
      };
    };

    const publish = (
      nameKey,
      body,
      d1,
      d2,
      guardians,
      removals,
      detail,
      extra,
    ) => {
      const cells = _getUniqueRemovals(removals);
      if (cells.length === 0) return null;
      const removalKey = cells
        .map(({ r, c, num }) => r + ":" + c + ":" + num)
        .sort()
        .join("|");
      const key =
        nameKey +
        ":" +
        d1 +
        ":" +
        d2 +
        ":" +
        body.map(([r, c]) => cellId(r, c)).join(",") +
        ":" +
        removalKey;
      if (emitted.has(key)) return null;
      emitted.add(key);
      const result = {
        change: true,
        type: "remove",
        cells,
        hint: {
          name: t(nameKey),
          mainInfo: t("teks_UET_digits", "" + d1 + d2),
          detail,
        },
        visualPlan: makeVisualPlan(body, d1, d2, guardians, cells, extra),
      };
      if (!findAll) return result;
      results.push(result);
      return null;
    };

    const filledValues = avoidable
      ? techniques._getAvoidableFilledValues(board)
      : null;
    if (avoidable && !filledValues)
      return findAll ? results : { change: false };

    const bodies = techniques
      ._findUniquenessRectangles(pencils, false, filledValues)
      .flatMap(({ cells, digits: [d1, d2] }) => {
        const placed = cells.filter(([r, c]) => board[r][c] !== 0);
        if (placed.length > 0 !== avoidable) return [];
        const usable = placed.every(
          ([r, c]) =>
            filledValues[r * 9 + c] !== 0 &&
            (board[r][c] === d1 || board[r][c] === d2),
        );
        return usable ? [{ d1, d2, cells }] : [];
      });

    const unsolved = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) unsolved.push([r, c]);
      }
    }
    const seesEvery = (r, c, cells) =>
      cells.every(([gr, gc]) => techniques._sees([r, c], [gr, gc]));

    for (const { d1, d2, cells: body } of bodies) {
      const bodySet = new Set(body.map(([r, c]) => cellKey(r, c)));
      const families = [
        {
          type: "row",
          indices: [...new Set(body.map(([r]) => r))].sort((a, b) => a - b),
        },
        {
          type: "col",
          indices: [...new Set(body.map(([, c]) => c))].sort((a, b) => a - b),
        },
        {
          type: "box",
          indices: [
            ...new Set(body.map(([r, c]) => techniques._getBoxIndex(r, c))),
          ].sort((a, b) => a - b),
        },
      ];

      for (const family of families) {
        const hasPlacedDeadlyDigit = family.indices.some((index) =>
          techniques
            ._getUnitCells(family.type, index)
            .some(
              ([r, c]) =>
                !bodySet.has(cellKey(r, c)) &&
                (board[r][c] === d1 || board[r][c] === d2),
            ),
        );
        if (hasPlacedDeadlyDigit) continue;

        const allIds = new Set();
        const byDigitIds = new Map([
          [d1, new Set()],
          [d2, new Set()],
        ]);
        const houses = [];
        family.indices.forEach((index) => {
          const local = [];
          techniques._getUnitCells(family.type, index).forEach(([r, c]) => {
            if (board[r][c] !== 0 || bodySet.has(cellKey(r, c))) return;
            const hasD1 = pencils[r][c].has(d1);
            const hasD2 = pencils[r][c].has(d2);
            if (!hasD1 && !hasD2) return;
            const id = cellId(r, c);
            allIds.add(id);
            local.push([r, c]);
            if (hasD1) byDigitIds.get(d1).add(id);
            if (hasD2) byDigitIds.get(d2).add(id);
          });
          houses.push({ index, cells: local });
        });
        if (allIds.size === 0) continue;

        const guardians = [...allIds].sort((a, b) => a - b).map(idToCell);
        const guardianByDigit = new Map(
          [d1, d2].map((digit) => [
            digit,
            [...byDigitIds.get(digit)].sort((a, b) => a - b).map(idToCell),
          ]),
        );
        const detail = t(
          "teks_UET_base_guardians",
          "" + d1 + d2,
          formatBody(body),
          formatGuardians(guardians, d1, d2),
        );

        // Type 2
        for (const [targetDigit, absentDigit] of [
          [d1, d2],
          [d2, d1],
        ]) {
          const targetGuardians = guardianByDigit.get(targetDigit);
          if (
            targetGuardians.length === 0 ||
            guardianByDigit.get(absentDigit).length !== 0
          ) {
            continue;
          }
          const guardianSet = new Set(
            targetGuardians.map(([r, c]) => cellKey(r, c)),
          );
          const removals = [];
          unsolved.forEach(([r, c]) => {
            if (
              !guardianSet.has(cellKey(r, c)) &&
              pencils[r][c].has(targetDigit) &&
              seesEvery(r, c, targetGuardians)
            ) {
              removals.push({ r, c, num: targetDigit });
            }
          });
          const result = publish(
            type2Key,
            body,
            d1,
            d2,
            targetGuardians,
            removals,
            detail,
          );
          if (result) return result;
        }

        const guardianSet = new Set(guardians.map(([r, c]) => cellKey(r, c)));

        // Type 3H
        const [firstGuardianRow, firstGuardianCol] = guardians[0];
        const ahsCarrierSpecs = [
          { type: "row", index: firstGuardianRow },
          { type: "col", index: firstGuardianCol },
          {
            type: "box",
            index: techniques._getBoxIndex(firstGuardianRow, firstGuardianCol),
          },
        ];
        const extraDigits = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(
          (digit) => digit !== d1 && digit !== d2,
        );
        for (const ahsCarrier of ahsCarrierSpecs) {
          const ahsHouseCells = techniques._getUnitCells(
            ahsCarrier.type,
            ahsCarrier.index,
          );
          const ahsHouseCellSet = new Set(
            ahsHouseCells.map(([r, c]) => cellKey(r, c)),
          );
          if (![...guardianSet].every((key) => ahsHouseCellSet.has(key))) {
            continue;
          }

          const emptyHouseCellCount = ahsHouseCells.filter(
            ([r, c]) => board[r][c] === 0,
          ).length;
          const minAhsDigitCount = Math.max(1, guardians.length - 1);
          const maxAhsDigitCount = Math.min(
            extraDigits.length,
            emptyHouseCellCount - 1,
          );
          for (
            let count = minAhsDigitCount;
            count <= maxAhsDigitCount;
            count++
          ) {
            for (const digits of techniques.combinations(extraDigits, count)) {
              const ahsDigits = new Set(digits);
              const positions = ahsHouseCells.filter(
                ([r, c]) =>
                  board[r][c] === 0 &&
                  digits.some((digit) => pencils[r][c].has(digit)),
              );
              if (
                !digits.every((digit) =>
                  positions.some(([r, c]) => pencils[r][c].has(digit)),
                )
              ) {
                continue;
              }
              if (positions.length !== count + 1) continue;
              const positionSet = new Set(
                positions.map(([r, c]) => cellKey(r, c)),
              );
              if (![...guardianSet].every((key) => positionSet.has(key)))
                continue;
              const guardianAllowedDigits = new Set([d1, d2, ...digits]);
              const removals = [];
              positions.forEach(([r, c]) => {
                const allowedDigits = guardianSet.has(cellKey(r, c))
                  ? guardianAllowedDigits
                  : ahsDigits;
                pencils[r][c].forEach((num) => {
                  if (!allowedDigits.has(num)) removals.push({ r, c, num });
                });
              });
              const result = publish(
                type3hKey,
                body,
                d1,
                d2,
                guardians,
                removals,
                t(
                  "teks_UET_type_3h_VHS_detail",
                  "" + d1 + d2,
                  formatBody(body),
                  formatGuardians(guardians, d1, d2),
                  digits.join(""),
                  formatHouse(ahsCarrier.type, ahsCarrier.index),
                ),
                { ahsCells: positions, ahsDigits },
              );
              if (result) return result;
            }
          }
        }

        if (guardians.length > 4) continue;
        const carrier = houses.find(({ cells }) => {
          const local = new Set(cells.map(([r, c]) => cellKey(r, c)));
          return guardians.every(([r, c]) => local.has(cellKey(r, c)));
        });
        if (!carrier) continue;

        const houseCells = techniques._getUnitCells(family.type, carrier.index);
        const available = houseCells.filter(
          ([r, c]) =>
            board[r][c] === 0 &&
            !bodySet.has(cellKey(r, c)) &&
            !guardianSet.has(cellKey(r, c)),
        );

        // Type 3
        const maxSelected = Math.min(4 - guardians.length, available.length);
        for (let count = 0; count <= maxSelected; count++) {
          for (const selected of techniques.combinations(available, count)) {
            const subsetCells = [...guardians, ...selected];
            const subsetDigits = new Set();
            subsetCells.forEach(([r, c]) =>
              pencils[r][c].forEach((digit) => subsetDigits.add(digit)),
            );
            if (
              subsetDigits.size < 2 ||
              subsetDigits.size !== subsetCells.length
            ) {
              continue;
            }
            const subsetSet = new Set(
              subsetCells.map(([r, c]) => cellKey(r, c)),
            );
            const removals = [];
            houseCells.forEach(([r, c]) => {
              if (bodySet.has(cellKey(r, c)) || subsetSet.has(cellKey(r, c)))
                return;
              subsetDigits.forEach((num) => {
                if (pencils[r][c].has(num)) removals.push({ r, c, num });
              });
            });
            const result = publish(
              type3Key,
              body,
              d1,
              d2,
              guardians,
              removals,
              t(
                "teks_UET_type_3_VNS_detail",
                "" + d1 + d2,
                formatBody(body),
                formatGuardians(guardians, d1, d2),
                selected.length ? formatCompactCells(selected) : "-",
              ),
              { subsetCells, subsetDigits },
            );
            if (result) return result;
          }
        }

        // UET + XY Wing
        const guardians1 = guardianByDigit.get(d1);
        const guardians2 = guardianByDigit.get(d2);
        if (guardians1.length === 0 || guardians2.length === 0) continue;
        const bivalue = unsolved.filter(
          ([r, c]) => pencils[r][c].size === 2 && !bodySet.has(cellKey(r, c)),
        );
        for (const wingA of bivalue) {
          const [ar, ac] = wingA;
          if (!pencils[ar][ac].has(d1) || !seesEvery(ar, ac, guardians1))
            continue;
          const z = [...pencils[ar][ac]].find((digit) => digit !== d1);
          if (z === d2) continue;
          for (const wingB of bivalue) {
            const [br, bc] = wingB;
            if (
              (ar === br && ac === bc) ||
              !pencils[br][bc].has(d2) ||
              !pencils[br][bc].has(z) ||
              !seesEvery(br, bc, guardians2)
            ) {
              continue;
            }
            const removals = [];
            unsolved.forEach(([r, c]) => {
              if (
                (r === ar && c === ac) ||
                (r === br && c === bc) ||
                !pencils[r][c].has(z)
              ) {
                return;
              }
              if (
                techniques._sees([r, c], wingA) &&
                techniques._sees([r, c], wingB)
              ) {
                removals.push({ r, c, num: z });
              }
            });
            const result = publish(
              xyWingKey,
              body,
              d1,
              d2,
              guardians,
              removals,
              t(
                "teks_UET_XY_Wing_detail",
                "" + d1 + d2,
                formatBody(body),
                formatGuardians(guardians, d1, d2),
                ar + 1,
                ac + 1,
                br + 1,
                bc + 1,
              ),
              { wings: [wingA, wingB] },
            );
            if (result) return result;
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },
});
