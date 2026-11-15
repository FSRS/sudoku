Object.assign(techniques, {
  uniquenessExternalTest: (board, pencils, findAll = false) =>
    techniques._uniquenessExternalTest(board, pencils, findAll, false),

  avoidableUniquenessExternalTest: (board, pencils, findAll = false) =>
    techniques._uniquenessExternalTest(board, pencils, findAll, true),

  uniqueLoopExternalTest: (board, pencils, findAll = false) =>
    techniques._externalTest(
      board,
      pencils,
      findAll,
      techniques._findUniqueLoopExternalBodies(board, pencils),
      [
        "teks_ULET_type_2",
        "teks_ULET_type_3",
        "teks_ULET_type_3h",
        "teks_ULET_plus_XY_Wing",
      ],
    ),

  extendedRectangleExternalTest: (board, pencils, findAll = false) =>
    techniques._externalTest(
      board,
      pencils,
      findAll,
      techniques._findExtendedExternalBodies(board, pencils),
      [
        "teks_EURET_type_2",
        "teks_EURET_type_3",
        "teks_EURET_type_3h",
        "teks_EURET_plus_XY_Wing",
      ],
    ),

  avoidableUniqueLoopExternalTest: (board, pencils, findAll = false) => {
    const filledValues = techniques._getAvoidableFilledValues(board);
    if (!filledValues) return findAll ? [] : { change: false };
    return techniques._externalTest(
      board,
      pencils,
      findAll,
      techniques._findUniqueLoopExternalBodies(board, pencils, filledValues),
      [
        "teks_AULET_type_2",
        "teks_AULET_type_3",
        "teks_AULET_type_3h",
        "teks_AULET_plus_XY_Wing",
      ],
    );
  },

  avoidableExtendedRectangleExternalTest: (board, pencils, findAll = false) => {
    const filledValues = techniques._getAvoidableFilledValues(board);
    if (!filledValues) return findAll ? [] : { change: false };
    return techniques._externalTest(
      board,
      pencils,
      findAll,
      techniques._findExtendedExternalBodies(board, pencils, filledValues),
      [
        "teks_AEURET_type_2",
        "teks_AEURET_type_3",
        "teks_AEURET_type_3h",
        "teks_AEURET_plus_XY_Wing",
      ],
    );
  },

  _uniquenessExternalTest: (board, pencils, findAll, avoidable) => {
    const filledValues = avoidable
      ? techniques._getAvoidableFilledValues(board)
      : null;
    if (avoidable && !filledValues) return findAll ? [] : { change: false };

    const bodies = techniques
      ._findUniquenessRectangles(pencils, false, filledValues)
      .flatMap(({ cells, digits }) => {
        const placed = cells.filter(([r, c]) => board[r][c] !== 0);
        if (placed.length > 0 !== avoidable) return [];
        const usable = placed.every(
          ([r, c]) =>
            filledValues[r * 9 + c] !== 0 && digits.includes(board[r][c]),
        );
        return usable ? [{ digits, cells }] : [];
      });

    return techniques._externalTest(
      board,
      pencils,
      findAll,
      bodies,
      avoidable
        ? [
            "teks_AUET_type_2",
            "teks_AUET_type_3",
            "teks_AUET_type_3h",
            "teks_AUET_plus_XY_Wing",
          ]
        : [
            "teks_UET_type_2",
            "teks_UET_type_3",
            "teks_UET_type_3h",
            "teks_UET_plus_XY_Wing",
          ],
    );
  },

  _externalFamilyLive: (board, g, inBody, digitMask, houses) => {
    const guards = [];
    for (const house of houses) {
      for (const id of UNIT_IDS[house]) {
        if (inBody[id]) continue;
        const value = board[(id / 9) | 0][id % 9];
        if (value !== 0) {
          if ((digitMask >> (value - 1)) & 1) return false;
        } else if ((g.cand[id] & digitMask) !== 0) {
          guards.push(id);
        }
      }
    }
    if (guards.length === 0) return false;
    for (const kind of ["row", "col", "box"]) {
      const index = HOUSE_OF[kind](guards[0]);
      if (guards.every((id) => HOUSE_OF[kind](id) === index)) return true;
    }
    let held = 0;
    for (const id of guards) held |= g.cand[id] & digitMask;
    if ((held & (held - 1)) !== 0) return false;
    const k = lowest(held);
    for (let part = 0; part < 3; part++) {
      let seers = g.pos[k * 3 + part];
      for (const id of guards) seers &= PEER[id * 3 + part];
      if (seers !== 0) return true;
    }
    return false;
  },

  _externalTest: (board, pencils, findAll, bodies, nameKeys) => {
    const results = [];
    const emitted = new Set();
    const [type2Key, type3Key, type3hKey, xyWingKey] = nameKeys;
    const cellKey = (r, c) => r + "," + c;
    const cellId = techniques._cellToId;
    const idToCell = techniques._idToCell;
    const uniqueCells = (cells) =>
      [...new Set(cells.map(([r, c]) => cellId(r, c)))]
        .sort((a, b) => a - b)
        .map(idToCell);
    const formatBody = techniques._formatRectangleBounds;
    const formatCompactCells = techniques._formatCellsRC;
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
    const formatGuardians = (cells, digits) =>
      formatCandidateCells(cells, (r, c) =>
        digits.filter((digit) => pencils[r][c].has(digit)),
      );
    const formatHouse = (type, index) =>
      `${type === "row" ? "r" : type === "col" ? "c" : "b"}${index + 1}`;

    const makeVisualPlan = (body, digits, guardians, removals, extra = {}) => {
      const plan = techniques._buildDeadlyPatternBaseVisualPlan(
        extra.subsetCells ? 3 : 2,
        body,
        digits,
        {
          placedCells: body.filter(([r, c]) => board[r][c] !== 0),
          subsetCells: extra.subsetCells,
          subsetCands: extra.subsetDigits,
        },
        pencils,
        removals,
      );
      const bodyKeys = new Set(body.map(([r, c]) => cellKey(r, c)));
      plan.candidateColors = plan.candidateColors.filter(
        ({ r, c, num }) => digits.includes(num) || !bodyKeys.has(cellKey(r, c)),
      );
      const paint = (
        cells,
        digits,
        { cellColor, candidateColor = cellColor },
      ) => {
        for (const [r, c] of cells) {
          if (cellColor !== undefined) {
            plan.cellColors.push({ r, c, color: cellColor });
          }
          for (const num of digits) {
            if (pencils[r][c].has(num)) {
              plan.candidateColors.push({ r, c, num, color: candidateColor });
            }
          }
        }
      };

      const uniqueGuardians = uniqueCells(guardians);
      paint(uniqueGuardians, digits, {
        cellColor: 6,
        candidateColor: 3,
      });

      const guardianKeys = new Set(
        uniqueGuardians.map(([r, c]) => cellKey(r, c)),
      );
      for (const [r, c] of extra.ahsCells || []) {
        const isGuardian = guardianKeys.has(cellKey(r, c));
        paint(
          [[r, c]],
          isGuardian
            ? new Set([...digits, ...(extra.ahsDigits || [])])
            : extra.ahsDigits || [],
          { cellColor: isGuardian ? 6 : 5 },
        );
      }
      for (const [r, c] of extra.wings || []) {
        paint([[r, c]], pencils[r][c], { cellColor: 4 });
      }

      paint(uniqueGuardians, digits, { candidateColor: 3 });

      return plan;
    };

    const publish = (
      nameKey,
      body,
      digits,
      guardians,
      removals,
      detail,
      extra,
      family,
      addLogic,
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
        digits.join(":") +
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
          mainInfo: t("teks_UET_digits", digits.join("")),
          detail,
        },
        visualPlan: makeVisualPlan(body, digits, guardians, cells, extra),
      };
      if (addLogic) {
        const logic = techniques._tlgBuilder(cells);
        logic.deadly(body.map(([r, c]) => cellId(r, c)), digits, pencils);
        family.indices.forEach((index) =>
          digits.forEach((digit) =>
            logic.truth({ kind: family.type, index, digit }),
          ),
        );
        addLogic(logic);
        result.tlg = logic.logic();
      }
      if (!findAll) return result;
      results.push(result);
      return null;
    };

    const unsolved = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) unsolved.push([r, c]);
      }
    }
    const seesEvery = (r, c, cells) =>
      cells.every(([gr, gc]) => techniques._sees([r, c], [gr, gc]));

    for (const { digits, cells: body } of bodies) {
      const bodySet = new Set(body.map(([r, c]) => cellKey(r, c)));
      const houseOf = {
        row: ([r]) => r,
        col: ([, c]) => c,
        box: ([r, c]) => techniques._getBoxIndex(r, c),
      };
      const families = ["row", "col", "box"].flatMap((type) => {
        const counts = new Map();
        body.forEach((cell) => {
          const index = houseOf[type](cell);
          counts.set(index, (counts.get(index) || 0) + 1);
        });
        if ([...counts.values()].some((count) => count !== digits.length)) {
          return [];
        }
        return [{ type, indices: [...counts.keys()].sort((a, b) => a - b) }];
      });

      for (const family of families) {
        const hasPlacedDeadlyDigit = family.indices.some((index) =>
          techniques
            ._getUnitCells(family.type, index)
            .some(
              ([r, c]) =>
                !bodySet.has(cellKey(r, c)) && digits.includes(board[r][c]),
            ),
        );
        if (hasPlacedDeadlyDigit) continue;

        const allIds = new Set();
        const byDigitIds = new Map(digits.map((digit) => [digit, new Set()]));
        const houses = [];
        family.indices.forEach((index) => {
          const local = [];
          techniques._getUnitCells(family.type, index).forEach(([r, c]) => {
            if (board[r][c] !== 0 || bodySet.has(cellKey(r, c))) return;
            const held = digits.filter((digit) => pencils[r][c].has(digit));
            if (held.length === 0) return;
            const id = cellId(r, c);
            allIds.add(id);
            local.push([r, c]);
            held.forEach((digit) => byDigitIds.get(digit).add(id));
          });
          houses.push({ index, cells: local });
        });
        if (allIds.size === 0) continue;

        const guardians = [...allIds].sort((a, b) => a - b).map(idToCell);
        const guardianByDigit = new Map(
          digits.map((digit) => [
            digit,
            [...byDigitIds.get(digit)].sort((a, b) => a - b).map(idToCell),
          ]),
        );
        const guardedDigits = digits.filter(
          (digit) => guardianByDigit.get(digit).length > 0,
        );
        const detail = t(
          "teks_UET_base_guardians",
          digits.join(""),
          formatBody(body),
          formatGuardians(guardians, digits),
        );

        // Type 2
        for (const targetDigit of guardedDigits.length === 1
          ? guardedDigits
          : []) {
          const targetGuardians = guardianByDigit.get(targetDigit);
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
            digits,
            targetGuardians,
            removals,
            detail,
            undefined,
            family,
            (logic) =>
              logic.targets.forEach((target) =>
                logic.connect(
                  [target],
                  targetGuardians.map(([r, c]) => [cellId(r, c), targetDigit]),
                ),
              ),
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
          (digit) => !digits.includes(digit),
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
            for (const hiddenDigits of techniques.combinations(
              extraDigits,
              count,
            )) {
              const ahsDigits = new Set(hiddenDigits);
              const positions = ahsHouseCells.filter(
                ([r, c]) =>
                  board[r][c] === 0 &&
                  hiddenDigits.some((digit) => pencils[r][c].has(digit)),
              );
              if (
                !hiddenDigits.every((digit) =>
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
              const guardianAllowedDigits = new Set([
                ...digits,
                ...hiddenDigits,
              ]);
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
                digits,
                guardians,
                removals,
                t(
                  "teks_UET_type_3h_VHS_detail",
                  digits.join(""),
                  formatBody(body),
                  formatGuardians(guardians, digits),
                  hiddenDigits.join(""),
                  formatHouse(ahsCarrier.type, ahsCarrier.index),
                ),
                { ahsCells: positions, ahsDigits },
                family,
                (logic) => {
                  hiddenDigits.forEach((digit) =>
                    logic.truth({
                      kind: ahsCarrier.type,
                      index: ahsCarrier.index,
                      digit,
                    }),
                  );
                  positions.forEach(([r, c]) =>
                    logic.linkSet({ kind: "cell", cell: cellId(r, c) }),
                  );
                },
              );
              if (result) return result;
            }
          }
        }

        // Type 3
        // One guardian cell holds a base digit, so the guardian cells stand
        // in as one cell of a naked subset whose other cells are selected.
        const subsetCarriers = guardedDigits.length >= 2 ? ahsCarrierSpecs : [];
        for (const subsetCarrier of subsetCarriers) {
          const houseCells = techniques._getUnitCells(
            subsetCarrier.type,
            subsetCarrier.index,
          );
          const houseCellSet = new Set(
            houseCells.map(([r, c]) => cellKey(r, c)),
          );
          if (![...guardianSet].every((key) => houseCellSet.has(key))) {
            continue;
          }
          const available = houseCells.filter(
            ([r, c]) =>
              board[r][c] === 0 &&
              !bodySet.has(cellKey(r, c)) &&
              !guardianSet.has(cellKey(r, c)),
          );
          const maxSelected = Math.min(3, available.length);
          for (let count = 1; count <= maxSelected; count++) {
            for (const selected of techniques.combinations(available, count)) {
              const subsetDigits = new Set();
              selected.forEach(([r, c]) =>
                pencils[r][c].forEach((digit) => subsetDigits.add(digit)),
              );
              if (
                subsetDigits.size !== count + 1 ||
                !guardedDigits.every((digit) => subsetDigits.has(digit))
              ) {
                continue;
              }
              let lockedInside = false;
              for (let size = 1; size < count; size++) {
                for (const part of techniques.combinations(selected, size)) {
                  const held = new Set(
                    part.flatMap(([r, c]) => [...pencils[r][c]]),
                  );
                  if (held.size <= size) lockedInside = true;
                }
              }
              if (lockedInside) continue;
              const selectedSet = new Set(
                selected.map(([r, c]) => cellKey(r, c)),
              );
              const removals = [];
              houseCells.forEach(([r, c]) => {
                const key = cellKey(r, c);
                if (bodySet.has(key) || selectedSet.has(key)) return;
                const isGuardian = guardianSet.has(key);
                subsetDigits.forEach((num) => {
                  if (isGuardian && digits.includes(num)) return;
                  if (pencils[r][c].has(num)) removals.push({ r, c, num });
                });
              });
              const result = publish(
                type3Key,
                body,
                digits,
                guardians,
                removals,
                t(
                  "teks_UET_type_3_VNS_detail",
                  digits.join(""),
                  formatBody(body),
                  formatGuardians(guardians, digits),
                  formatCompactCells(selected),
                ),
                { subsetCells: selected, subsetDigits },
                family,
                (logic) => {
                  selected.forEach(([r, c]) =>
                    logic.truth({ kind: "cell", cell: cellId(r, c) }),
                  );
                  subsetDigits.forEach((digit) =>
                    logic.linkSet({
                      kind: subsetCarrier.type,
                      index: subsetCarrier.index,
                      digit,
                    }),
                  );
                },
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

        // UET + XY Wing
        if (guardedDigits.length !== 2) continue;
        const [d1, d2] = guardedDigits;
        const guardians1 = guardianByDigit.get(d1);
        const guardians2 = guardianByDigit.get(d2);
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
              digits,
              guardians,
              removals,
              t(
                "teks_UET_XY_Wing_detail",
                digits.join(""),
                formatBody(body),
                formatGuardians(guardians, digits),
                ar + 1,
                ac + 1,
                br + 1,
                bc + 1,
              ),
              { wings: [wingA, wingB] },
              family,
              (logic) => {
                const wingCands = [];
                [
                  [wingA, d1, guardians1],
                  [wingB, d2, guardians2],
                ].forEach(([[wr, wc], digit, digitGuardians]) => {
                  logic.truth({ kind: "cell", cell: cellId(wr, wc) });
                  logic.connect(
                    [[cellId(wr, wc), digit]],
                    digitGuardians.map(([r, c]) => [cellId(r, c), digit]),
                  );
                  wingCands.push([cellId(wr, wc), z]);
                });
                logic.targets.forEach((target) =>
                  logic.connect([target], wingCands),
                );
              },
            );
            if (result) return result;
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },
});
