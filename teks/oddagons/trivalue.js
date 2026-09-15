Object.assign(techniques, {
  // Trivalue Oddagon
  _trivalueOddagonPlacements: [
    [0, 10, 20],
    [1, 11, 18],
    [2, 9, 19],
    [0, 11, 19],
    [1, 9, 20],
    [2, 10, 18],
  ],

  _buildTrivalueOddagonVisualPlan: (
    loop,
    guardianIds,
    baseDigits,
    removals,
    pencils,
    subsetCells = [],
  ) => ({
    highlight: { digit: null, state: 0 },
    cellColors: [
      ...loop.map((id) => ({
        r: Math.floor(id / 9),
        c: id % 9,
        color: 7,
        mode: "add",
      })),
      ...subsetCells.map((id) => ({
        r: Math.floor(id / 9),
        c: id % 9,
        color: 6,
        mode: "add",
      })),
    ],
    candidateColors: [
      ...loop.flatMap((id) => {
        const r = Math.floor(id / 9);
        const c = id % 9;
        return baseDigits
          .filter((num) => pencils[r][c].has(num))
          .map((num) => ({ r, c, num, color: 7 }));
      }),
      ...guardianIds.flatMap((id) => {
        const r = Math.floor(id / 9);
        const c = id % 9;
        return [...pencils[r][c]]
          .filter((num) => !baseDigits.includes(num))
          .map((num) => ({ r, c, num, color: 3 }));
      }),
      ...subsetCells.flatMap((id) => {
        const r = Math.floor(id / 9);
        const c = id % 9;
        return [...pencils[r][c]].map((num) => ({
          r,
          c,
          num,
          color: 4,
        }));
      }),
    ],
    candidateMarks: removals.map(({ r, c, num }) => ({
      r,
      c,
      num,
      marker: "slash",
      color: 0,
    })),
  }),

  trivalueOddagon: (board, pencils, findAll = false) => {
    const results = [];
    const popcount = techniques._bits.popcount;
    const placements = techniques._trivalueOddagonPlacements;
    let xzAlses = null;

    const getHouses = (id) => {
      const r = Math.floor(id / 9);
      const c = id % 9;
      return [r, 9 + c, 18 + techniques._getBoxIndex(r, c)];
    };
    const housesMap = Array.from({ length: 27 }, () => []);
    for (let id = 0; id < 81; id++) {
      for (const house of getHouses(id)) housesMap[house].push(id);
    }
    const getSharedHouses = (ids) => {
      if (ids.length === 0) return [];
      const shared = new Set(getHouses(ids[0]));
      for (const id of ids.slice(1)) {
        const houses = new Set(getHouses(id));
        for (const house of shared) {
          if (!houses.has(house)) shared.delete(house);
        }
      }
      return [...shared];
    };
    const getCommonPeers = (ids) => {
      if (ids.length === 0) return 0n;
      let peers = PEER_MAP[ids[0]];
      for (const id of ids.slice(1)) peers &= PEER_MAP[id];
      return peers;
    };

    const cellMasks = new Array(81).fill(0);
    const allCellMasks = new Array(81).fill(0);
    const usableInBlock = new Array(9).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const mask = techniques._bits.maskFromSet(pencils[r][c]);
        allCellMasks[r * 9 + c] = mask;
        if (popcount(mask) < 2) continue;
        cellMasks[r * 9 + c] = mask;
        usableInBlock[techniques._getBoxIndex(r, c)]++;
      }
    }

    const blockOptions = [];
    for (let b = 0; b < 9; b++) {
      const options = [];
      if (usableInBlock[b] >= 3) {
        const origin = Math.floor(b / 3) * 27 + (b % 3) * 3;
        for (let p = 0; p < 6; p++) {
          const cells = placements[p].map((offset) => origin + offset);
          if (cells.some((id) => cellMasks[id] === 0)) continue;
          options.push({
            cells,
            odd: p >= 3 ? 1 : 0,
          });
        }
      }
      blockOptions.push(options);
    }

    const loopPath = (cells) => {
      const sharedHouse = (left, right) => {
        const lr = Math.floor(left / 9);
        const lc = left % 9;
        const rr = Math.floor(right / 9);
        const rc = right % 9;
        if (lr === rr) return lr;
        if (lc === rc) return 9 + lc;

        const lb = Math.floor(lr / 3) * 3 + Math.floor(lc / 3);
        const rb = Math.floor(rr / 3) * 3 + Math.floor(rc / 3);
        return lb === rb ? 18 + lb : -1;
      };

      const ordered = [...cells].sort((a, b) => a - b);
      const path = [ordered[0]];
      const houses = [];
      const used = new Set(path);

      const search = (id, previousHouse) => {
        if (path.length === ordered.length) {
          const closingHouse = sharedHouse(id, path[0]);
          return (
            closingHouse !== -1 &&
            closingHouse !== previousHouse &&
            closingHouse !== houses[0]
          );
        }

        for (const next of ordered) {
          if (used.has(next)) continue;
          const house = sharedHouse(id, next);
          if (house === -1 || house === previousHouse) continue;

          used.add(next);
          path.push(next);
          houses.push(house);
          if (search(next, house)) return true;
          houses.pop();
          path.pop();
          used.delete(next);
        }
        return false;
      };

      search(path[0], -1);
      return (
        path
          .map((cell) => `r${Math.floor(cell / 9) + 1}c${(cell % 9) + 1}`)
          .join("-") + "-"
      );
    };

    const guardiansString = (guardianIds, baseMask) => {
      let guardianMask = 0;
      for (const id of guardianIds) guardianMask |= cellMasks[id] & ~baseMask;
      return techniques._bits
        .maskToDigits(guardianMask)
        .map((digit) => {
          const bit = 1 << (digit - 1);
          const digitCells = guardianIds
            .filter((id) => cellMasks[id] & bit)
            .map((id) => [Math.floor(id / 9), id % 9]);
          return `(${digit})${techniques._formatCellsRC(digitCells)}`;
        })
        .join(",");
    };

    for (let topBand = 0; topBand < 2; topBand++) {
      for (let bottomBand = topBand + 1; bottomBand < 3; bottomBand++) {
        for (let leftStack = 0; leftStack < 2; leftStack++) {
          for (let rightStack = leftStack + 1; rightStack < 3; rightStack++) {
            const corners = [
              blockOptions[topBand * 3 + leftStack],
              blockOptions[topBand * 3 + rightStack],
              blockOptions[bottomBand * 3 + leftStack],
              blockOptions[bottomBand * 3 + rightStack],
            ];
            if (corners.some((options) => options.length === 0)) continue;

            for (const o1 of corners[0]) {
              for (const o2 of corners[1]) {
                for (const o3 of corners[2]) {
                  for (const o4 of corners[3]) {
                    if (!(o1.odd ^ o2.odd ^ o3.odd ^ o4.odd)) continue;

                    const cells = [
                      ...o1.cells,
                      ...o2.cells,
                      ...o3.cells,
                      ...o4.cells,
                    ];

                    let union = 0;
                    let twice = 0;
                    for (const id of cells) {
                      twice |= union & cellMasks[id];
                      union |= cellMasks[id];
                    }
                    const onlyOnce = union & ~twice;

                    for (const extraId of cells) {
                      const extraMask = cellMasks[extraId];
                      const digitsMask = union & ~(extraMask & onlyOnce);
                      if (popcount(digitsMask) !== 3) continue;

                      const elimMask = extraMask & digitsMask;
                      if (elimMask === 0 || elimMask === extraMask) continue;

                      const [d1, d2, d3] =
                        techniques._bits.maskToDigits(digitsMask);
                      const er = Math.floor(extraId / 9);
                      const ec = extraId % 9;
                      const guardiansStr = techniques._bits
                        .maskToDigits(extraMask & ~digitsMask)
                        .map(
                          (digit) =>
                            `(${digit})${techniques._formatCellsRC([[er, ec]])}`,
                        )
                        .join(",");
                      const elimCells = techniques._bits
                        .maskToDigits(elimMask)
                        .map((num) => ({ r: er, c: ec, num }));
                      const patternCells = cells.map((id) => ({
                        r: Math.floor(id / 9),
                        c: id % 9,
                      }));

                      const result = {
                        change: true,
                        type: "remove",
                        cells: elimCells,
                        hint: {
                          name: t("teks_TVO_type_1"),
                          mainInfo: t("teks_TVO_type_1_digits", d1, d2, d3),
                          detail: t(
                            "teks_TVO_type_1_guardians",
                            d1,
                            d2,
                            d3,
                            loopPath(cells),
                            guardiansStr,
                          ),
                        },
                        visualPlan: {
                          highlight: { digit: null, state: 0 },
                          cellColors: patternCells.map(({ r, c }) => ({
                            r,
                            c,
                            color: 7,
                            mode: "add",
                          })),
                          candidateColors: patternCells.flatMap(({ r, c }) =>
                            [...pencils[r][c]].map((num) => ({
                              r,
                              c,
                              num,
                              color:
                                num === d1 || num === d2 || num === d3 ? 7 : 3,
                            })),
                          ),
                          candidateMarks: elimCells.map(({ r, c, num }) => ({
                            r,
                            c,
                            num,
                            marker: "slash",
                            color: 0,
                          })),
                        },
                      };

                      if (!findAll) return result;
                      results.push(result);
                    }

                    const unionDigits = techniques._bits.maskToDigits(union);
                    for (let i = 0; i < unionDigits.length - 2; i++) {
                      for (let j = i + 1; j < unionDigits.length - 1; j++) {
                        for (let k = j + 1; k < unionDigits.length; k++) {
                          const baseDigits = [
                            unionDigits[i],
                            unionDigits[j],
                            unionDigits[k],
                          ];
                          const baseMask = baseDigits.reduce(
                            (mask, digit) => mask | (1 << (digit - 1)),
                            0,
                          );
                          if (
                            cells.some(
                              (id) => popcount(cellMasks[id] & baseMask) < 2,
                            )
                          ) {
                            continue;
                          }

                          const guardianIds = cells.filter(
                            (id) => cellMasks[id] & ~baseMask,
                          );
                          if (guardianIds.length === 0) continue;
                          let guardianMask = 0;
                          for (const id of guardianIds) {
                            guardianMask |= cellMasks[id] & ~baseMask;
                          }
                          const guardianDigits =
                            techniques._bits.maskToDigits(guardianMask);
                          const guardiansStr = guardiansString(
                            guardianIds,
                            baseMask,
                          );

                          // Types 2 and 5: every guardian is the same digit.
                          if (
                            guardianDigits.length === 1 &&
                            guardianIds.length >= 2
                          ) {
                            const guardianDigit = guardianDigits[0];
                            const commonPeers = getCommonPeers(guardianIds);
                            const elimCells = [];
                            for (let id = 0; id < 81; id++) {
                              const r = Math.floor(id / 9);
                              const c = id % 9;
                              if (
                                (commonPeers & (1n << BigInt(id))) !== 0n &&
                                board[r][c] === 0 &&
                                pencils[r][c].has(guardianDigit)
                              ) {
                                elimCells.push({ r, c, num: guardianDigit });
                              }
                            }

                            if (elimCells.length > 0) {
                              const result = {
                                change: true,
                                type: "remove",
                                cells: elimCells,
                                hint: {
                                  name: t(
                                    guardianIds.length === 2
                                      ? "teks_TVO_type_2"
                                      : "teks_TVO_type_5",
                                  ),
                                  mainInfo: t(
                                    "teks_TVO_type_1_digits",
                                    ...baseDigits,
                                  ),
                                  detail: t(
                                    "teks_TVO_type_1_guardians",
                                    ...baseDigits,
                                    loopPath(cells),
                                    guardiansStr,
                                  ),
                                },
                                visualPlan:
                                  techniques._buildTrivalueOddagonVisualPlan(
                                    cells,
                                    guardianIds,
                                    baseDigits,
                                    elimCells,
                                    pencils,
                                  ),
                              };

                              if (!findAll) return result;
                              results.push(result);
                            }
                          }

                          // Type 3: the guardian union is a virtual cell that
                          // reduces an ALS in their shared house to a naked set.
                          for (const house of getSharedHouses(guardianIds)) {
                            const otherCells = housesMap[house].filter((id) => {
                              const r = Math.floor(id / 9);
                              const c = id % 9;
                              return board[r][c] === 0 && !cells.includes(id);
                            });
                            const minimumSize = popcount(guardianMask) - 1;
                            for (
                              let size = Math.max(1, minimumSize);
                              size <= otherCells.length;
                              size++
                            ) {
                              for (const combo of techniques.combinations(
                                otherCells,
                                size,
                              )) {
                                let comboMask = 0;
                                for (const id of combo) {
                                  comboMask |= allCellMasks[id];
                                }
                                if (
                                  popcount(comboMask) !== size + 1 ||
                                  (comboMask & guardianMask) !== guardianMask
                                ) {
                                  continue;
                                }

                                const elimCells = [];
                                for (const id of housesMap[house]) {
                                  if (
                                    cells.includes(id) ||
                                    combo.includes(id)
                                  ) {
                                    continue;
                                  }
                                  const r = Math.floor(id / 9);
                                  const c = id % 9;
                                  if (board[r][c] !== 0) continue;
                                  const removable =
                                    allCellMasks[id] & comboMask;
                                  for (const num of techniques._bits.maskToDigits(
                                    removable,
                                  )) {
                                    elimCells.push({ r, c, num });
                                  }
                                }
                                if (elimCells.length === 0) continue;

                                const subsetStr = techniques._formatCellsRC(
                                  combo.map((id) => [
                                    Math.floor(id / 9),
                                    id % 9,
                                  ]),
                                );
                                const result = {
                                  change: true,
                                  type: "remove",
                                  cells: elimCells,
                                  hint: {
                                    name: t("teks_TVO_type_3"),
                                    mainInfo: t(
                                      "teks_TVO_type_1_digits",
                                      ...baseDigits,
                                    ),
                                    detail: t(
                                      "teks_TVO_type_3_VNS_detail",
                                      ...baseDigits,
                                      loopPath(cells),
                                      guardiansStr,
                                      techniques._bits
                                        .maskToDigits(comboMask)
                                        .join(""),
                                      subsetStr,
                                    ),
                                  },
                                  visualPlan:
                                    techniques._buildTrivalueOddagonVisualPlan(
                                      cells,
                                      guardianIds,
                                      baseDigits,
                                      elimCells,
                                      pencils,
                                      combo,
                                    ),
                                };

                                if (!findAll) return result;
                                results.push(result);
                              }
                            }
                          }
                        }
                      }
                    }

                    // XZ Rule
                    if (popcount(union) !== 5) continue;
                    const xzUnionDigits = techniques._bits.maskToDigits(union);
                    const patternSet = new Set(cells);
                    for (let i = 0; i < xzUnionDigits.length - 2; i++) {
                      for (let j = i + 1; j < xzUnionDigits.length - 1; j++) {
                        for (let k = j + 1; k < xzUnionDigits.length; k++) {
                          const baseDigits = [
                            xzUnionDigits[i],
                            xzUnionDigits[j],
                            xzUnionDigits[k],
                          ];
                          const baseMask = baseDigits.reduce(
                            (mask, digit) => mask | (1 << (digit - 1)),
                            0,
                          );
                          const extraMask = union & ~baseMask;
                          const extraDigits =
                            techniques._bits.maskToDigits(extraMask);
                          const guardianIds = cells.filter(
                            (id) => cellMasks[id] & extraMask,
                          );
                          if (guardianIds.length !== 2) continue;

                          if (xzAlses === null) {
                            xzAlses = techniques._collectAllALS(board, pencils);
                          }
                          for (const als of xzAlses) {
                            if ((als.mask & extraMask) !== extraMask) continue;
                            const alsIds = als.cells.map(([r, c]) => r * 9 + c);
                            if (alsIds.some((id) => patternSet.has(id)))
                              continue;
                            const alsDigits = techniques._bits.maskToDigits(
                              als.mask,
                            );

                            for (const restrictedDigit of extraDigits) {
                              const restrictedBit = 1 << (restrictedDigit - 1);
                              const restrictedGuardians = guardianIds.filter(
                                (id) => cellMasks[id] & restrictedBit,
                              );
                              const restrictedAlsIds = als.candMap[
                                restrictedDigit
                              ].map(([r, c]) => r * 9 + c);
                              if (
                                !restrictedGuardians.every((guardianId) =>
                                  restrictedAlsIds.every(
                                    (alsId) =>
                                      (PEER_MAP[guardianId] &
                                        (1n << BigInt(alsId))) !==
                                      0n,
                                  ),
                                )
                              ) {
                                continue;
                              }

                              const otherDigit = extraDigits.find(
                                (digit) => digit !== restrictedDigit,
                              );
                              const otherBit = 1 << (otherDigit - 1);
                              const otherGuardians = guardianIds.filter(
                                (id) => cellMasks[id] & otherBit,
                              );
                              const otherAlsIds = als.candMap[otherDigit].map(
                                ([r, c]) => r * 9 + c,
                              );
                              const otherSources = [
                                ...otherGuardians,
                                ...otherAlsIds,
                              ];
                              let commonPeers = PEER_MAP[otherSources[0]];
                              for (const id of otherSources.slice(1)) {
                                commonPeers &= PEER_MAP[id];
                              }

                              const elimCells = [];
                              for (let id = 0; id < 81; id++) {
                                if (
                                  (commonPeers & (1n << BigInt(id))) !== 0n &&
                                  board[Math.floor(id / 9)][id % 9] === 0 &&
                                  pencils[Math.floor(id / 9)][id % 9].has(
                                    otherDigit,
                                  )
                                ) {
                                  elimCells.push({
                                    r: Math.floor(id / 9),
                                    c: id % 9,
                                    num: otherDigit,
                                  });
                                }
                              }
                              if (elimCells.length === 0) continue;

                              const guardiansStr = extraDigits
                                .map((digit) => {
                                  const digitCells = guardianIds
                                    .filter(
                                      (id) =>
                                        cellMasks[id] & (1 << (digit - 1)),
                                    )
                                    .map((id) => [Math.floor(id / 9), id % 9]);
                                  return `(${digit})${techniques._formatCellsRC(
                                    digitCells,
                                  )}`;
                                })
                                .join(",");
                              const alsCellsStr = techniques._formatCellsRC(
                                als.cells,
                              );
                              const patternCells = cells.map((id) => ({
                                r: Math.floor(id / 9),
                                c: id % 9,
                              }));
                              const cellColors = [
                                ...patternCells.map(({ r, c }) => ({
                                  r,
                                  c,
                                  color: 7,
                                  mode: "add",
                                })),
                                ...als.cells.map(([r, c]) => ({
                                  r,
                                  c,
                                  color: 6,
                                  mode: "add",
                                })),
                              ];
                              const candidateColors = [
                                ...patternCells.flatMap(({ r, c }) =>
                                  [...pencils[r][c]].flatMap((num) => {
                                    if (baseDigits.includes(num)) {
                                      return [{ r, c, num, color: 7 }];
                                    }
                                    if (extraDigits.includes(num)) {
                                      return [
                                        {
                                          r,
                                          c,
                                          num,
                                          color:
                                            num === restrictedDigit ? 4 : 5,
                                        },
                                      ];
                                    }
                                    return [];
                                  }),
                                ),
                                ...als.cells.flatMap(([r, c]) =>
                                  [...pencils[r][c]].map((num) => ({
                                    r,
                                    c,
                                    num,
                                    color:
                                      num === restrictedDigit
                                        ? 5
                                        : num === otherDigit
                                          ? 4
                                          : 3,
                                  })),
                                ),
                              ];
                              const links = [];
                              const addCandidateGroup = (ids, digit, color) => {
                                for (let i = 0; i < ids.length - 1; i++) {
                                  links.push({
                                    r1: Math.floor(ids[i] / 9),
                                    c1: ids[i] % 9,
                                    n1: digit,
                                    r2: Math.floor(ids[i + 1] / 9),
                                    c2: ids[i + 1] % 9,
                                    n2: digit,
                                    color,
                                    style: "solid",
                                  });
                                }
                              };
                              const addClosestLink = (
                                leftIds,
                                leftDigit,
                                rightIds,
                                rightDigit,
                                style,
                              ) => {
                                let closest = [leftIds[0], rightIds[0]];
                                let closestDistance = Infinity;
                                for (const left of leftIds) {
                                  for (const right of rightIds) {
                                    const distance =
                                      Math.abs(
                                        Math.floor(left / 9) -
                                          Math.floor(right / 9),
                                      ) + Math.abs((left % 9) - (right % 9));
                                    if (distance < closestDistance) {
                                      closestDistance = distance;
                                      closest = [left, right];
                                    }
                                  }
                                }
                                links.push({
                                  r1: Math.floor(closest[0] / 9),
                                  c1: closest[0] % 9,
                                  n1: leftDigit,
                                  r2: Math.floor(closest[1] / 9),
                                  c2: closest[1] % 9,
                                  n2: rightDigit,
                                  color: 0,
                                  style,
                                });
                              };
                              addCandidateGroup(
                                restrictedGuardians,
                                restrictedDigit,
                                4,
                              );
                              addCandidateGroup(otherGuardians, otherDigit, 5);
                              addCandidateGroup(
                                restrictedAlsIds,
                                restrictedDigit,
                                5,
                              );
                              addCandidateGroup(otherAlsIds, otherDigit, 4);
                              addClosestLink(
                                restrictedGuardians,
                                restrictedDigit,
                                otherGuardians,
                                otherDigit,
                                "solid",
                              );
                              addClosestLink(
                                restrictedAlsIds,
                                restrictedDigit,
                                otherAlsIds,
                                otherDigit,
                                "solid",
                              );
                              addClosestLink(
                                restrictedGuardians,
                                restrictedDigit,
                                restrictedAlsIds,
                                restrictedDigit,
                                "dash",
                              );

                              const result = {
                                change: true,
                                type: "remove",
                                cells: elimCells,
                                hint: {
                                  name: t("teks_TVO_XZ"),
                                  mainInfo: t(
                                    "teks_TVO_XZ_digits",
                                    ...baseDigits,
                                  ),
                                  detail: t(
                                    "teks_TVO_XZ_ALS_detail",
                                    ...baseDigits,
                                    loopPath(cells),
                                    guardiansStr,
                                    alsDigits.join(""),
                                    alsCellsStr,
                                  ),
                                },
                                visualPlan: {
                                  highlight: { digit: null, state: 0 },
                                  cellColors,
                                  candidateColors,
                                  candidateMarks: elimCells.map(
                                    ({ r, c, num }) => ({
                                      r,
                                      c,
                                      num,
                                      marker: "slash",
                                      color: 0,
                                    }),
                                  ),
                                  links,
                                },
                              };

                              if (!findAll) return result;
                              results.push(result);
                            }
                          }
                        }
                      }
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
