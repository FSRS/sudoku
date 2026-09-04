Object.assign(techniques, {
  _buildBivalueOddagonVisualPlan: (
    loop,
    extraCells,
    d1,
    d2,
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
        return [d1, d2]
          .filter((num) => pencils[r][c].has(num))
          .map((num) => ({ r, c, num, color: 7 }));
      }),
      ...extraCells.flatMap((id) => {
        const r = Math.floor(id / 9);
        const c = id % 9;
        return [...pencils[r][c]]
          .filter((num) => num !== d1 && num !== d2)
          .map((num) => ({ r, c, num, color: 3 }));
      }),
      ...subsetCells.flatMap((id) => {
        const r = Math.floor(id / 9);
        const c = id % 9;
        return [...pencils[r][c]]
          .filter((num) => num !== d1 && num !== d2)
          .map((num) => ({ r, c, num, color: 4 }));
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

  bivalueOddagon: (board, pencils, findAll = false) => {
    const results = [];

    const getHouse = (cell, type) => {
      const r = Math.floor(cell / 9);
      const c = cell % 9;
      if (type === 0) return r;
      if (type === 1) return 9 + c;
      if (type === 2) return 18 + (Math.floor(r / 3) * 3 + Math.floor(c / 3));
    };

    const getHouses = (cell) => {
      const r = Math.floor(cell / 9);
      const c = cell % 9;
      return [r, 9 + c, 18 + (Math.floor(r / 3) * 3 + Math.floor(c / 3))];
    };

    const housesMap = Array.from({ length: 27 }, () => []);
    for (let i = 0; i < 81; i++) {
      const h = getHouses(i);
      housesMap[h[0]].push(i);
      housesMap[h[1]].push(i);
      housesMap[h[2]].push(i);
    }

    const isPow2 = (n) => (n & (n - 1)) === 0 && n !== 0;
    const trailingZeroCount = (n) => {
      if (n === 0) return 32;
      let count = 0;
      while ((n & 1) === 0) {
        count++;
        n >>= 1;
      }
      return count;
    };
    const popCount = (n) => {
      let count = 0;
      while (n) {
        count += n & 1;
        n >>= 1;
      }
      return count;
    };

    const getSharedHouse = (cells) => {
      if (cells.length === 0) return -1;
      let shared = [true, true, true];
      const r0 = Math.floor(cells[0] / 9),
        c0 = cells[0] % 9,
        b0 = Math.floor(r0 / 3) * 3 + Math.floor(c0 / 3);
      for (let i = 1; i < cells.length; i++) {
        const r = Math.floor(cells[i] / 9),
          c = cells[i] % 9,
          b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        if (r !== r0) shared[0] = false;
        if (c !== c0) shared[1] = false;
        if (b !== b0) shared[2] = false;
      }
      if (shared[0]) return r0;
      if (shared[1]) return 9 + c0;
      if (shared[2]) return 18 + b0;
      return -1;
    };

    const getSharedHousesList = (cells) => {
      if (cells.length === 0) return [];
      let shared = [true, true, true];
      const r0 = Math.floor(cells[0] / 9),
        c0 = cells[0] % 9,
        b0 = Math.floor(r0 / 3) * 3 + Math.floor(c0 / 3);
      for (let i = 1; i < cells.length; i++) {
        const r = Math.floor(cells[i] / 9),
          c = cells[i] % 9,
          b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
        if (r !== r0) shared[0] = false;
        if (c !== c0) shared[1] = false;
        if (b !== b0) shared[2] = false;
      }
      const list = [];
      if (shared[0]) list.push(r0);
      if (shared[1]) list.push(9 + c0);
      if (shared[2]) list.push(18 + b0);
      return list;
    };

    const getPeerIntersection = (cells) => {
      if (cells.length === 0) return [];
      let common = PEER_MAP[cells[0]];
      for (let i = 1; i < cells.length; i++) {
        common &= PEER_MAP[cells[i]];
      }
      const res = [];
      for (let i = 0; i < 81; i++) {
        if ((common & (1n << BigInt(i))) !== 0n) res.push(i);
      }
      return res;
    };

    const getGuardiansStr = (extraCells, d1, d2) => {
      const guardiansByDigit = new Map();

      for (const cell of extraCells) {
        const r = Math.floor(cell / 9);
        const c = cell % 9;
        for (const digit of pencils[r][c]) {
          if (digit === d1 || digit === d2) continue;
          if (!guardiansByDigit.has(digit)) guardiansByDigit.set(digit, []);
          guardiansByDigit.get(digit).push({ r, c });
        }
      }

      const formatCells = (cells) => {
        const rows = new Set(cells.map(({ r }) => r));
        const cols = new Set(cells.map(({ c }) => c));
        const groupByRow = rows.size <= cols.size;
        const groups = new Map();

        for (const { r, c } of cells) {
          const key = groupByRow ? r : c;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(groupByRow ? c : r);
        }

        return Array.from(groups.entries())
          .sort(([a], [b]) => a - b)
          .map(([key, values]) => {
            const positions = values
              .sort((a, b) => a - b)
              .map((value) => value + 1)
              .join("");
            return groupByRow
              ? `r${key + 1}c${positions}`
              : `r${positions}c${key + 1}`;
          })
          .join(",");
      };

      return Array.from(guardiansByDigit.entries())
        .sort(([a], [b]) => a - b)
        .map(([digit, cells]) => `(${digit})${formatCells(cells)}`)
        .join(",");
    };

    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        const cellsContainingBothTwoDigits = [];

        // Used by the existing Oddagon loop search.
        // Only cells containing both d1 and d2 are populated.
        const cellMasks = new Array(81).fill(0);

        // Full candidate mask for every unsolved cell.
        // Type 3 needs this when examining ALS cells outside the Oddagon loop.
        const allCellMasks = new Array(81).fill(0);

        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (board[r][c] !== 0) continue;

            const id = r * 9 + c;

            let mask = 0;
            for (const num of pencils[r][c]) {
              mask |= 1 << (num - 1);
            }

            // Store candidates for EVERY unsolved cell.
            allCellMasks[id] = mask;

            // Existing Oddagon-loop candidate selection.
            if (pencils[r][c].has(d1) && pencils[r][c].has(d2)) {
              cellsContainingBothTwoDigits.push(id);
              cellMasks[id] = mask;
            }
          }
        }

        if (cellsContainingBothTwoDigits.length < 4) continue;

        const comparer = (1 << (d1 - 1)) | (1 << (d2 - 1));
        const resultLoops = [];
        const seenLoopKeys = new Set();

        const dfs = (
          startCell,
          previousCell,
          previousHouse,
          loopSet,
          loopArr,
          extraCells,
          extraDigitsMask,
        ) => {
          for (let houseType = 0; houseType < 3; houseType++) {
            const nextHouse = getHouse(previousCell, houseType);
            if (nextHouse === previousHouse) continue;

            const houseCells = housesMap[nextHouse];
            let loopCellsInThisHouse = 0;
            let hasStartCell = false;
            for (const cell of houseCells) {
              if (loopSet.has(cell)) {
                loopCellsInThisHouse++;
                if (cell === startCell) hasStartCell = true;
              }
            }

            if (loopCellsInThisHouse >= 2 && !hasStartCell) continue;

            const otherCellsCanBeIterated = [];
            for (const cell of houseCells) {
              if (
                (cellsContainingBothTwoDigits.includes(cell) &&
                  !loopSet.has(cell)) ||
                cell === startCell
              ) {
                otherCellsCanBeIterated.push(cell);
              }
            }
            if (otherCellsCanBeIterated.length === 0) continue;

            for (const cell of otherCellsCanBeIterated) {
              const h = getHouses(cell);
              let countH0 = 0,
                countH1 = 0,
                countH2 = 0;
              for (const lc of loopArr) {
                const lh = getHouses(lc);
                if (lh[0] === h[0]) countH0++;
                if (lh[1] === h[1]) countH1++;
                if (lh[2] === h[2]) countH2++;
              }
              if (
                (countH0 >= 2 || countH1 >= 2 || countH2 >= 2) &&
                startCell !== cell
              ) {
                continue;
              }

              if (startCell === cell) {
                if (loopArr.length % 2 !== 0 && loopArr.length > 4) {
                  const sortedLoop = [...loopArr]
                    .sort((a, b) => a - b)
                    .join(",");
                  if (!seenLoopKeys.has(sortedLoop)) {
                    seenLoopKeys.add(sortedLoop);
                    resultLoops.push({
                      loop: [...loopArr],
                      extraCells: [...extraCells],
                      comparer,
                    });
                  }
                  return;
                }
              } else {
                const cMask = cellMasks[cell];
                const newExtraDigitsMask =
                  extraDigitsMask | (cMask & ~comparer);
                const isExtra = popCount(cMask) > 2;
                const newExtraCells = isExtra
                  ? [...extraCells, cell]
                  : [...extraCells];

                let shouldProceed = false;
                const firstSharedHouse = getSharedHouse(newExtraCells);
                if (firstSharedHouse !== -1) shouldProceed = true;
                else if (newExtraCells.length < 3) shouldProceed = true;
                else {
                  if (isPow2(newExtraDigitsMask)) {
                    const extraDigit =
                      trailingZeroCount(newExtraDigitsMask) + 1;
                    const peers = getPeerIntersection(newExtraCells);
                    let hasDigitInPeers = false;
                    for (const p of peers) {
                      if (
                        board[Math.floor(p / 9)][p % 9] === 0 &&
                        pencils[Math.floor(p / 9)][p % 9].has(extraDigit)
                      ) {
                        hasDigitInPeers = true;
                        break;
                      }
                    }
                    if (hasDigitInPeers) shouldProceed = true;
                  }
                }

                if (shouldProceed) {
                  loopSet.add(cell);
                  loopArr.push(cell);
                  dfs(
                    startCell,
                    cell,
                    nextHouse,
                    loopSet,
                    loopArr,
                    newExtraCells,
                    newExtraDigitsMask,
                  );
                  loopArr.pop();
                  loopSet.delete(cell);
                }
              }
            }
          }
        };

        for (const cell of cellsContainingBothTwoDigits) {
          const isExtra = popCount(cellMasks[cell]) > 2;
          const extra = isExtra ? [cell] : [];
          dfs(cell, cell, -1, new Set([cell]), [cell], extra, 0);
        }

        for (const oddagon of resultLoops) {
          const { loop, extraCells } = oddagon;
          const pathStr =
            loop
              .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
              .join("-") + "-";

          if (extraCells.length === 0) continue;

          const checkType2 = () => {
            let mask = 0;
            for (const cell of extraCells) mask |= cellMasks[cell];
            mask &= ~comparer;

            if (!isPow2(mask)) return null;

            const extraDigit = trailingZeroCount(mask) + 1;
            const peers = getPeerIntersection(extraCells);
            const elimMap = [];
            for (const p of peers) {
              if (
                board[Math.floor(p / 9)][p % 9] === 0 &&
                pencils[Math.floor(p / 9)][p % 9].has(extraDigit)
              ) {
                elimMap.push({
                  r: Math.floor(p / 9),
                  c: p % 9,
                  num: extraDigit,
                });
              }
            }

            if (elimMap.length > 0) {
              return {
                change: true,
                type: "remove",
                cells: elimMap,
                hint: {
                  name: t("teks_msg_183"),
                  mainInfo: t("teks_msg_184", d1, d2),
                  detail: t(
                    "teks_msg_185",
                    d1,
                    d2,
                    getGuardiansStr(extraCells, d1, d2),
                    pathStr,
                  ),
                },
                visualPlan: techniques._buildBivalueOddagonVisualPlan(
                  loop,
                  extraCells,
                  d1,
                  d2,
                  elimMap,
                  pencils,
                ),
              };
            }
            return null;
          };

          const checkType3 = () => {
            const type3Results = [];
            for (const cell of extraCells) {
              const mask = allCellMasks[cell];

              // Every extra cell must contain both Oddagon base digits.
              if ((mask & comparer) !== comparer) {
                return null;
              }
            }

            // Type 3 requires all extra cells to share at least one house.
            const sharedHouses = getSharedHousesList(extraCells);

            if (sharedHouses.length === 0) {
              return null;
            }
            let extraCellsUnionMask = 0;
            for (const cell of extraCells) {
              extraCellsUnionMask |= allCellMasks[cell];
            }
            if ((extraCellsUnionMask & comparer) !== comparer) {
              return null;
            }
            const otherDigitsMask = extraCellsUnionMask & ~comparer;
            const otherDigitsCount = popCount(otherDigitsMask);
            for (const house of sharedHouses) {
              let hasPairValue = false;
              for (const cell of housesMap[house]) {
                const r = Math.floor(cell / 9);
                const c = cell % 9;
                const value = board[r][c];

                if (value === d1 || value === d2) {
                  hasPairValue = true;
                  break;
                }
              }
              if (hasPairValue) {
                continue;
              }
              const otherCellsInHouse = [];
              for (const cell of housesMap[house]) {
                const r = Math.floor(cell / 9);
                const c = cell % 9;
                if (board[r][c] === 0 && !loop.includes(cell)) {
                  otherCellsInHouse.push(cell);
                }
              }
              const minimumSize = otherDigitsCount - 1;
              for (
                let size = minimumSize;
                size <= otherCellsInHouse.length;
                size++
              ) {
                if (size <= 0) continue;

                for (const combo of techniques.combinations(
                  otherCellsInHouse,
                  size,
                )) {
                  let comboMask = 0;
                  for (const cell of combo) {
                    comboMask |= allCellMasks[cell];
                  }

                  // N cells / N+1 candidates = ALS.
                  if (popCount(comboMask) !== size + 1) {
                    continue;
                  }

                  // The ALS must contain every extra digit produced
                  // by the Oddagon extra cells.
                  if ((comboMask & otherDigitsMask) !== otherDigitsMask) {
                    continue;
                  }
                  const elimMap = [];
                  for (const cell of housesMap[house]) {
                    const r = Math.floor(cell / 9);
                    const c = cell % 9;

                    if (
                      board[r][c] !== 0 ||
                      loop.includes(cell) ||
                      combo.includes(cell)
                    ) {
                      continue;
                    }
                    const removableMask = allCellMasks[cell] & comboMask;
                    for (let digit = 1; digit <= 9; digit++) {
                      const bit = 1 << (digit - 1);

                      if ((removableMask & bit) !== 0) {
                        elimMap.push({
                          r,
                          c,
                          num: digit,
                        });
                      }
                    }
                  }
                  if (elimMap.length > 0) {
                    const subsetStr = combo
                      .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
                      .join("-");
                    const result = {
                      change: true,
                      type: "remove",
                      cells: elimMap,

                      hint: {
                        name: t("teks_msg_186"),
                        mainInfo: t("teks_msg_184", d1, d2),
                        detail: t(
                          "teks_msg_187",
                          d1,
                          d2,
                          getGuardiansStr(extraCells, d1, d2),
                          pathStr,
                          subsetStr,
                        ),
                      },
                      visualPlan: techniques._buildBivalueOddagonVisualPlan(
                        loop,
                        extraCells,
                        d1,
                        d2,
                        elimMap,
                        pencils,
                        combo,
                      ),
                    };
                    if (!findAll) return result;
                    type3Results.push(result);
                  }
                }
              }
            }

            return findAll ? type3Results : null;
          };

          const checkType4 = () => {
            let mask = 0;
            for (const cell of extraCells) mask |= cellMasks[cell];
            mask &= ~comparer;
            if (!isPow2(mask) || extraCells.length !== 2) return null;

            const [c1, c2] = extraCells;

            let adjacent = false;
            for (let i = 0; i < loop.length; i++) {
              const next = (i + 1) % loop.length;
              if (
                (loop[i] === c1 && loop[next] === c2) ||
                (loop[i] === c2 && loop[next] === c1)
              ) {
                adjacent = true;
                break;
              }
            }
            if (!adjacent) return null;

            const loopCellsCanSee = new Set();
            for (const lc of loop) {
              if (
                lc !== c1 &&
                lc !== c2 &&
                (techniques._sees(
                  techniques._idToCell(lc),
                  techniques._idToCell(c1),
                ) ||
                  techniques._sees(
                    techniques._idToCell(lc),
                    techniques._idToCell(c2),
                  ))
              ) {
                loopCellsCanSee.add(lc);
              }
            }

            let isAnyLoopCellSeeingBothCells = false;
            let elimMapMap = null;

            for (const extraCell of extraCells) {
              const sees = [];
              for (const lc of loopCellsCanSee) {
                if (
                  techniques._sees(
                    techniques._idToCell(lc),
                    techniques._idToCell(extraCell),
                  )
                ) {
                  sees.push(lc);
                }
              }
              if (sees.length !== 1) {
                isAnyLoopCellSeeingBothCells = true;
                break;
              }

              const localElims = [];
              for (const lc of loopCellsCanSee) {
                const intersection = getPeerIntersection([extraCell, lc]);
                for (const cell of intersection) {
                  if (!loop.includes(cell)) {
                    if (board[Math.floor(cell / 9)][cell % 9] === 0) {
                      if (pencils[Math.floor(cell / 9)][cell % 9].has(d1)) {
                        localElims.push(cell * 10 + d1);
                      }
                      if (pencils[Math.floor(cell / 9)][cell % 9].has(d2)) {
                        localElims.push(cell * 10 + d2);
                      }
                    }
                  }
                }
              }
              if (elimMapMap === null) {
                elimMapMap = new Set(localElims);
              } else {
                const nextElimMap = new Set();
                for (const el of localElims) {
                  if (elimMapMap.has(el)) nextElimMap.add(el);
                }
                elimMapMap = nextElimMap;
              }
            }

            if (
              isAnyLoopCellSeeingBothCells ||
              elimMapMap === null ||
              elimMapMap.size === 0
            )
              return null;

            const elims = [];
            for (const el of elimMapMap) {
              const cell = Math.floor(el / 10);
              const digit = el % 10;
              elims.push({ r: Math.floor(cell / 9), c: cell % 9, num: digit });
            }

            if (elims.length > 0) {
              return {
                change: true,
                type: "remove",
                cells: elims,
                hint: {
                  name: t("teks_msg_188"),
                  mainInfo: t("teks_msg_184", d1, d2),
                  detail: t(
                    "teks_msg_189",
                    d1,
                    d2,
                    getGuardiansStr(extraCells, d1, d2),
                    pathStr,
                  ),
                },
                visualPlan: techniques._buildBivalueOddagonVisualPlan(
                  loop,
                  extraCells,
                  d1,
                  d2,
                  elims,
                  pencils,
                ),
              };
            }
            return null;
          };

          const res2 = checkType2();
          if (res2) {
            if (!findAll) return res2;
            results.push(res2);
          }

          const res3 = checkType3();
          if (findAll) {
            if (res3) results.push(...res3);
          } else if (res3) {
            return res3;
          }

          const res4 = checkType4();
          if (res4) {
            if (!findAll) return res4;
            results.push(res4);
          }
        }
      }
    }

    return findAll ? results : { change: false };
  },

  // Trivalue Oddagon
});
