Object.assign(techniques, {
  // Trivalue Oddagon
  // meets[mask * 3 + w]: word w (28 triplets each, in lexicographic order) of
  // the triplets sharing a digit with mask; meetsTwice: sharing two digits.
  _trivalueOddagonTriplets: (() => {
    const masks = [];
    for (let a = 0; a < 7; a++) {
      for (let b = a + 1; b < 8; b++) {
        for (let c = b + 1; c < 9; c++) {
          masks.push((1 << a) | (1 << b) | (1 << c));
        }
      }
    }
    const meets = new Int32Array(512 * 3);
    const meetsTwice = new Int32Array(512 * 3);
    for (let mask = 0; mask < 512; mask++) {
      masks.forEach((triplet, i) => {
        const shared = mask & triplet;
        const at = mask * 3 + Math.floor(i / 28);
        const bit = 1 << i % 28;
        if (shared) meets[at] |= bit;
        if (shared & (shared - 1)) meetsTwice[at] |= bit;
      });
    }
    return { masks, meets, meetsTwice };
  })(),

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
    const { placementCells } = techniques._tobBuildGeometry();
    const {
      masks: tripletMasks,
      meets,
      meetsTwice,
    } = techniques._trivalueOddagonTriplets;
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
    const bodyMasks = new Array(81).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const id = r * 9 + c;
        if (board[r][c] !== 0) {
          bodyMasks[id] = 1 << (board[r][c] - 1);
          continue;
        }
        const mask = techniques._bits.maskFromSet(pencils[r][c]);
        allCellMasks[id] = mask;
        if (popcount(mask) < 2) continue;
        cellMasks[id] = mask;
        bodyMasks[id] = mask;
      }
    }

    // Per box placement, the triplets all three cells can hold: an empty cell
    // needs one triplet digit (XZ rule) or two (Types 3 and 5), a filled cell
    // needs its value in the triplet.
    const slotAny = new Int32Array(162);
    const slotTwo = new Int32Array(162);
    const slotUnion = new Int32Array(54);
    const slotNarrow = new Int8Array(54);
    for (let s = 0; s < 54; s++) {
      for (const id of placementCells[s]) {
        slotUnion[s] |= bodyMasks[id];
        if (popcount(bodyMasks[id]) <= 3) slotNarrow[s]++;
      }
      for (let w = 0; w < 3; w++) {
        let any = 0xfffffff;
        let two = 0xfffffff;
        for (const id of placementCells[s]) {
          const at = bodyMasks[id] * 3 + w;
          any &= meets[at];
          two &= cellMasks[id] ? meetsTwice[at] : meets[at];
        }
        slotAny[s * 3 + w] = any;
        slotTwo[s * 3 + w] = two;
      }
    }

    const tripletsOf = (words) => {
      const triplets = [];
      for (let w = 0; w < 3; w++) {
        for (let bits = words[w]; bits !== 0; bits &= bits - 1) {
          triplets.push(tripletMasks[w * 28 + 31 - Math.clz32(bits & -bits)]);
        }
      }
      return triplets;
    };

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

    const emit = (result) => {
      results.push(result);
      return !findAll;
    };

    const inspectBody = (cells, union, anySet, twoSet) => {
      for (const baseMask of tripletsOf(twoSet)) {
        const guardianMask = union & ~baseMask;
        if ((baseMask & ~union) !== 0 || guardianMask === 0) continue;
        const guardianIds = cells.filter((id) => bodyMasks[id] & guardianMask);
        const sharedHouses = getSharedHouses(guardianIds);
        const singleDigit = popcount(guardianMask) === 1;
        if (
          !(singleDigit && guardianIds.length >= 3) &&
          sharedHouses.length === 0
        ) {
          continue;
        }
        const baseDigits = techniques._bits.maskToDigits(baseMask);
        const guardiansStr = guardiansString(guardianIds, baseMask);

        // Type 5: every guardian is the same digit.
        if (singleDigit && guardianIds.length >= 3) {
          const [guardianDigit] = techniques._bits.maskToDigits(guardianMask);
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
                name: t("teks_TVO_type_5"),
                mainInfo: t("teks_TVO_type_1_digits", ...baseDigits),
                detail: t(
                  "teks_TVO_type_1_guardians",
                  ...baseDigits,
                  loopPath(cells),
                  guardiansStr,
                ),
              },
              visualPlan: techniques._buildTrivalueOddagonVisualPlan(
                cells,
                guardianIds,
                baseDigits,
                elimCells,
                pencils,
              ),
            };
            if (emit(result)) return true;
          }
        }

        // Type 3: the guardian union is a virtual cell that reduces an ALS in
        // their shared house to a naked set.
        for (const house of sharedHouses) {
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
            for (const combo of techniques.combinations(otherCells, size)) {
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
                if (cells.includes(id) || combo.includes(id)) {
                  continue;
                }
                const r = Math.floor(id / 9);
                const c = id % 9;
                if (board[r][c] !== 0) continue;
                const removable = allCellMasks[id] & comboMask;
                for (const num of techniques._bits.maskToDigits(removable)) {
                  elimCells.push({ r, c, num });
                }
              }
              if (elimCells.length === 0) continue;

              const subsetStr = techniques._formatCellsRC(
                combo.map((id) => [Math.floor(id / 9), id % 9]),
              );
              const result = {
                change: true,
                type: "remove",
                cells: elimCells,
                hint: {
                  name: t("teks_TVO_type_3"),
                  mainInfo: t("teks_TVO_type_1_digits", ...baseDigits),
                  detail: t(
                    "teks_TVO_type_3_VNS_detail",
                    ...baseDigits,
                    loopPath(cells),
                    guardiansStr,
                    techniques._bits.maskToDigits(comboMask).join(""),
                    subsetStr,
                  ),
                },
                visualPlan: techniques._buildTrivalueOddagonVisualPlan(
                  cells,
                  guardianIds,
                  baseDigits,
                  elimCells,
                  pencils,
                  combo,
                ),
              };
              if (emit(result)) return true;
            }
          }
        }
      }

      // XZ Rule
      if (popcount(union) !== 5) return false;
      const patternSet = new Set(cells);
      for (const baseMask of tripletsOf(anySet)) {
        if ((baseMask & ~union) !== 0) continue;
        const baseDigits = techniques._bits.maskToDigits(baseMask);
        const extraMask = union & ~baseMask;
        const extraDigits = techniques._bits.maskToDigits(extraMask);
        const guardianIds = cells.filter((id) => cellMasks[id] & extraMask);
        if (guardianIds.length !== 2) continue;

        if (xzAlses === null) {
          xzAlses = techniques._collectAllALS(board, pencils);
        }
        for (const als of xzAlses) {
          if ((als.mask & extraMask) !== extraMask) continue;
          const alsIds = als.cells.map(([r, c]) => r * 9 + c);
          if (alsIds.some((id) => patternSet.has(id))) continue;
          const alsDigits = techniques._bits.maskToDigits(als.mask);

          for (const restrictedDigit of extraDigits) {
            const restrictedBit = 1 << (restrictedDigit - 1);
            const restrictedGuardians = guardianIds.filter(
              (id) => cellMasks[id] & restrictedBit,
            );
            const restrictedAlsIds = als.candMap[restrictedDigit].map(
              ([r, c]) => r * 9 + c,
            );
            if (
              !restrictedGuardians.every((guardianId) =>
                restrictedAlsIds.every(
                  (alsId) =>
                    (PEER_MAP[guardianId] & (1n << BigInt(alsId))) !== 0n,
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
            const otherSources = [...otherGuardians, ...otherAlsIds];
            let commonPeers = PEER_MAP[otherSources[0]];
            for (const id of otherSources.slice(1)) {
              commonPeers &= PEER_MAP[id];
            }

            const elimCells = [];
            for (let id = 0; id < 81; id++) {
              if (
                (commonPeers & (1n << BigInt(id))) !== 0n &&
                board[Math.floor(id / 9)][id % 9] === 0 &&
                pencils[Math.floor(id / 9)][id % 9].has(otherDigit)
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
                  .filter((id) => cellMasks[id] & (1 << (digit - 1)))
                  .map((id) => [Math.floor(id / 9), id % 9]);
                return `(${digit})${techniques._formatCellsRC(digitCells)}`;
              })
              .join(",");
            const alsCellsStr = techniques._formatCellsRC(als.cells);
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
                      { r, c, num, color: num === restrictedDigit ? 4 : 5 },
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
                    Math.abs(Math.floor(left / 9) - Math.floor(right / 9)) +
                    Math.abs((left % 9) - (right % 9));
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
            addCandidateGroup(restrictedGuardians, restrictedDigit, 4);
            addCandidateGroup(otherGuardians, otherDigit, 5);
            addCandidateGroup(restrictedAlsIds, restrictedDigit, 5);
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
                mainInfo: t("teks_TVO_XZ_digits", ...baseDigits),
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
                candidateMarks: elimCells.map(({ r, c, num }) => ({
                  r,
                  c,
                  num,
                  marker: "slash",
                  color: 0,
                })),
                links,
              },
            };
            if (emit(result)) return true;
          }
        }
      }
      return false;
    };

    // A Type 3 or XZ body has at most three guardians, hence nine cells of at
    // most three digits; a Type 5 body has a four-digit union.
    const level = new Int32Array(12);
    const slots = [0, 0, 0, 0];
    const search = (boxes, depth, odd) => {
      for (let p = 0; p < 6; p++) {
        const parity = odd ^ (p >= 3 ? 1 : 0);
        if (depth === 3 && parity === 0) continue;
        const s = boxes[depth] * 6 + p;
        let alive = 0;
        for (let w = 0; w < 3; w++) {
          const bits =
            (depth === 0 ? 0xfffffff : level[depth * 3 - 3 + w]) &
            slotAny[s * 3 + w];
          level[depth * 3 + w] = bits;
          alive |= bits;
        }
        if (alive === 0) continue;
        slots[depth] = s;
        if (depth < 3) {
          if (search(boxes, depth + 1, parity)) return true;
          continue;
        }

        let union = 0;
        let narrow = 0;
        for (const slot of slots) {
          union |= slotUnion[slot];
          narrow += slotNarrow[slot];
        }
        if (narrow < 9 && popcount(union) !== 4) continue;
        const twoSet = [0, 1, 2].map((w) =>
          slots.reduce((bits, slot) => bits & slotTwo[slot * 3 + w], 0xfffffff),
        );
        if (
          inspectBody(
            slots.flatMap((slot) => placementCells[slot]),
            union,
            level.slice(9, 12),
            twoSet,
          )
        ) {
          return true;
        }
      }
      return false;
    };
    for (const boxes of techniques._tobQuadBoxes) {
      if (search(boxes, 0, 0)) return results[0];
    }

    if (!findAll) {
      return techniques._trivalueOddagonBranches(board, pencils, false);
    }
    const elimKey = (cells) =>
      cells
        .map(({ r, c, num }) => (r * 9 + c) * 9 + num - 1)
        .sort((a, b) => a - b)
        .join(",");
    const seenElims = new Set(results.map((result) => elimKey(result.cells)));
    for (const result of techniques._trivalueOddagonBranches(
      board,
      pencils,
      true,
    )) {
      const key = elimKey(result.cells);
      if (seenElims.has(key)) continue;
      seenElims.add(key);
      results.push(result);
    }
    return results;
  },

  _tobPlacements: [
    [0, 4, 8],
    [1, 5, 6],
    [2, 3, 7],
    [0, 5, 7],
    [1, 3, 8],
    [2, 4, 6],
  ],

  _tobQuadBoxes: [
    [0, 1, 3, 4],
    [0, 2, 3, 5],
    [1, 2, 4, 5],
    [0, 1, 6, 7],
    [0, 2, 6, 8],
    [1, 2, 7, 8],
    [3, 4, 6, 7],
    [3, 5, 6, 8],
    [4, 5, 7, 8],
  ],

  _tobGeometry: null,

  _tobBuildGeometry: () => {
    if (techniques._tobGeometry) return techniques._tobGeometry;
    const placements = techniques._tobPlacements;
    const cellAt = (b, p) =>
      (((b / 3) | 0) * 3 + ((p / 3) | 0)) * 9 + (b % 3) * 3 + (p % 3);

    const quads = techniques._tobQuadBoxes.map((boxes) => {
      const bands = [(boxes[0] / 3) | 0, (boxes[2] / 3) | 0];
      const stacks = [boxes[0] % 3, boxes[1] % 3];
      const band3 = 3 - bands[0] - bands[1];
      const stack3 = 3 - stacks[0] - stacks[1];
      const eriBoxes = [
        bands[0] * 3 + stack3,
        bands[1] * 3 + stack3,
        band3 * 3 + stacks[0],
        band3 * 3 + stacks[1],
      ];
      const bodies = [];
      for (let br = 0; br < 6; br++)
        for (let bl = 0; bl < 6; bl++)
          for (let tr = 0; tr < 6; tr++)
            for (let tl = 0; tl < 6; tl++) {
              const pl = [tl, tr, bl, br];
              let odd = 0;
              for (const j of pl) if (j >= 3) odd++;
              if ((odd & 1) === 0) continue;
              const cells = [];
              for (let k = 0; k < 4; k++)
                for (const p of placements[pl[k]]) cells.push(cellAt(boxes[k], p));

              const rowMate = new Int8Array(12);
              const colMate = new Int8Array(12);
              for (let i = 0; i < 12; i++)
                for (let j = 0; j < 12; j++) {
                  if (i === j) continue;
                  if (((cells[i] / 9) | 0) === ((cells[j] / 9) | 0)) rowMate[i] = j;
                  if (cells[i] % 9 === cells[j] % 9) colMate[i] = j;
                }
              const cycle = [];
              let cur = 0;
              do {
                cycle.push(cur);
                cur = cycle.length % 2 === 1 ? rowMate[cur] : colMate[cur];
              } while (cur !== 0);
              const short = cycle.length === 4;
              const inRing = new Array(12).fill(!short);
              for (const i of cycle) inRing[i] = short;
              const ringIdx = [];
              for (let k = 0; k < 4; k++)
                for (let i = 0; i < 3; i++) if (inRing[k * 3 + i]) ringIdx.push(i);
              const ring = ringIdx.map((i, k) => cells[k * 3 + i]);
              bodies.push({
                pl,
                cells,
                ra: (ring[0] / 9) | 0,
                rb: (ring[2] / 9) | 0,
                ca: ring[0] % 9,
                cb: ring[1] % 9,
              });
            }
      let boxMask = 0;
      for (const b of boxes) boxMask |= 1 << b;
      return { boxes, boxMask, eriBoxes, bodies };
    });

    const boxCells = [];
    const placementCells = [];
    for (let b = 0; b < 9; b++) {
      const list = [];
      for (let p = 0; p < 9; p++) list.push(cellAt(b, p));
      boxCells.push(list);
      for (let j = 0; j < 6; j++)
        placementCells.push(placements[j].map((p) => cellAt(b, p)));
    }

    techniques._tobGeometry = { quads, boxCells, placementCells };
    return techniques._tobGeometry;
  },

  _tobPop: (m) => {
    let n = 0;
    while (m) {
      m &= m - 1;
      n++;
    }
    return n;
  },

  _tobDigits: (m) => {
    const out = [];
    for (let d = 1; d <= 9; d++) if (m & (1 << (d - 1))) out.push(d);
    return out;
  },

  _tobCands: (id, mask) =>
    techniques._tobDigits(mask).map((d) => id * 9 + d - 1),

  _tobCommonPeerCands: (ids, digitMask, P) => {
    const parts = [0x7ffffff, 0x7ffffff, 0x7ffffff];
    for (const id of ids)
      for (let part = 0; part < 3; part++) parts[part] &= PEER_BITSETS[id][part];
    const out = [];
    const digit = 31 - Math.clz32(digitMask);
    for (let part = 0; part < 3; part++) {
      let m = parts[part];
      while (m) {
        const low = m & -m;
        const id = part * 27 + 31 - Math.clz32(low);
        if (P[id] & digitMask) out.push(id * 9 + digit);
        m ^= low;
      }
    }
    return out;
  },

  _tobExtraText: (ctx, ids) =>
    ids
      .map(
        (id) =>
          `(${techniques._tobDigits(ctx.M[id] & ~ctx.T).join("")})${techniques._formatCellsRC([id])}`,
      )
      .join(","),

  _tobGuardianText: (ids, z) =>
    `(${techniques._tobDigits(z).join("")})${techniques._formatCellsRC(ids)}`,

  _tobTargets: (elimIds) => elimIds.map((cand) => (cand / 9) | 0),

  _tobMakeHint: (found, ctx) => {
    const { branch, body, elimIds, escapes, aux, structure, detail } = found;
    const { M, P, T } = ctx;
    const digits = techniques._tobDigits(T);
    const elims = [...elimIds].sort((a, b) => a - b);
    const cells = elims.map((cand) => {
      const id = (cand / 9) | 0;
      return { r: (id / 9) | 0, c: id % 9, num: (cand % 9) + 1 };
    });
    const sortedBody = [...body].sort((a, b) => a - b);
    const rc = (id) => ({ r: (id / 9) | 0, c: id % 9 });
    const bodySet = new Set(sortedBody);

    const cellColors = sortedBody.map((id) => ({ ...rc(id), color: 7, mode: "add" }));
    for (const id of new Set(structure))
      if (!bodySet.has(id)) cellColors.push({ ...rc(id), color: 6, mode: "add" });
    const candidateColors = [];
    for (const id of sortedBody) {
      const { r, c } = rc(id);
      for (const num of techniques._tobDigits(P[id] & T))
        candidateColors.push({ r, c, num, color: 7 });
      if (escapes.includes(id))
        for (const num of techniques._tobDigits(P[id] & ~T))
          candidateColors.push({ r, c, num, color: 3 });
    }

    const nameKeys = {
      "Type 1": "teks_TVO_type_1",
      "Type 2": "teks_TVO_type_2",
    };
    const sortedAux = {};
    for (const [key, list] of Object.entries(aux))
      sortedAux[key] = [...new Set(list)].sort((a, b) => a - b);

    return {
      change: true,
      type: "remove",
      cells,
      hint: {
        name: t(nameKeys[branch]),
        mainInfo: t("teks_TVO_digits", ...digits),
        detail: t(
          detail.key,
          digits.join(""),
          techniques._formatCellsRC(sortedBody),
          ...detail.args,
        ),
      },
      visualPlan: {
        highlight: { digit: null, state: 0 },
        cellColors,
        candidateColors,
        candidateMarks: cells.map(({ r, c, num }) => ({
          r,
          c,
          num,
          marker: "slash",
          color: 0,
        })),
        links: [],
      },
      meta: {
        kind: "tripletOddagon",
        branch,
        digits,
        body: sortedBody,
        elims,
        aux: sortedAux,
      },
    };
  },

  _trivalueOddagonBranches: (board, pencils, findAll = false) => {
    const geo = techniques._tobBuildGeometry();
    const pop = techniques._tobPop;
    const results = [];
    const M = new Int32Array(81);
    const P = new Int32Array(81);
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        const id = r * 9 + c;
        const v = board[r][c];
        if (v) {
          M[id] = 1 << (v - 1);
        } else {
          let m = 0;
          for (const d of pencils[r][c]) m |= 1 << (d - 1);
          M[id] = m;
          P[id] = m;
        }
      }

    const pure = new Int32Array(512);
    const triplets = [];
    for (let s = 0; s < 54; s++) {
      const [c1, c2, c3] = geo.placementCells[s];
      const u = M[c1] | M[c2] | M[c3];
      if (pop(u) !== 3) continue;
      if (!pure[u]) triplets.push(u);
      pure[u] |= 1 << ((s / 6) | 0);
    }
    let K = 0;
    for (const T of triplets) K = Math.max(K, pop(pure[T]));
    if (K <= 1) return findAll ? results : { change: false };
    triplets.sort((x, y) => x - y);

    const seen = new Set();
    const statDef = new Int8Array(54);
    const statEsc = new Int8Array(54);
    const statExtra = new Int32Array(54);
    const ctx = {
      M,
      P,
      T: 0,
    };

    for (const T of triplets) {
      if (pop(pure[T]) !== K) continue;
      ctx.T = T;
      for (let s = 0; s < 54; s++) {
        let def = 0;
        let esc = 0;
        let extra = 0;
        const list = geo.placementCells[s];
        for (let i = 0; i < 3; i++) {
          const m = M[list[i]];
          if ((m & T) === 0) def++;
          if (m & ~T) {
            esc++;
            extra |= m & ~T;
          }
        }
        statDef[s] = def;
        statEsc[s] = esc;
        statExtra[s] = extra;
      }

      for (const quad of geo.quads) {
        if (pop(pure[T] & quad.boxMask) < 2) continue;
        const [b0, b1, b2, b3] = quad.boxes.map((b) => b * 6);
        for (const body of quad.bodies) {
          const pl = body.pl;
          const s0 = b0 + pl[0];
          const s1 = b1 + pl[1];
          const s2 = b2 + pl[2];
          const s3 = b3 + pl[3];
          if (statDef[s0] + statDef[s1] + statDef[s2] + statDef[s3] !== 0) continue;
          const E = statEsc[s0] + statEsc[s1] + statEsc[s2] + statEsc[s3];
          if (E === 0) continue;
          const X = statExtra[s0] | statExtra[s1] | statExtra[s2] | statExtra[s3];
          const ES = body.cells.filter((id) => M[id] & ~T);
          let found;
          if (E === 1) found = [techniques._tobType1(ctx, body, ES[0])];
          else if (pop(X) === 1) found = [techniques._tobType2(ctx, body, ES, X)];
          else continue;

          for (const item of found) {
            if (item.elimIds.length === 0) continue;
            const key = [...item.elimIds].sort((a, b) => a - b).join(",");
            if (seen.has(key)) continue;
            seen.add(key);
            const hint = techniques._tobMakeHint(item, ctx);
            if (!findAll) return hint;
            results.push(hint);
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  _tobType1: (ctx, body, e) => ({
    branch: "Type 1",
    body: body.cells,
    elimIds: techniques._tobCands(e, ctx.P[e] & ctx.T),
    escapes: [e],
    structure: [],
    aux: { escape: [e], guardians: [], witness: [], targets: [e], other: [] },
    detail: {
      key: "teks_TVO_guardians_detail",
      args: [techniques._tobExtraText(ctx, [e])],
    },
  }),

  _tobType2: (ctx, body, ES, z) => {
    const elimIds = techniques._tobCommonPeerCands(ES, z, ctx.P);
    return {
      branch: "Type 2",
      body: body.cells,
      elimIds,
      escapes: ES,
      structure: [],
      aux: {
        escape: [],
        guardians: ES,
        witness: [],
        targets: techniques._tobTargets(elimIds),
        other: [],
      },
      detail: {
        key: "teks_TVO_guardians_detail",
        args: [techniques._tobGuardianText(ES, z)],
      },
    };
  },
});
