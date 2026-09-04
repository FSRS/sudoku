Object.assign(techniques, {
  _getAvoidableFilledValues: (board) => {
    const hasInitialString =
      typeof initialPuzzleString === "string" &&
      initialPuzzleString.length >= 81;
    const hasGivenGrid =
      typeof boardState !== "undefined" &&
      Array.isArray(boardState) &&
      boardState.length === 9;
    if (!hasInitialString && !hasGivenGrid) return null;

    const isInitialGiven = (r, c) => {
      if (hasInitialString) {
        const ch = initialPuzzleString[r * 9 + c];
        return ch >= "1" && ch <= "9";
      }
      return !!(boardState[r] && boardState[r][c] && boardState[r][c].isGiven);
    };

    const values = new Uint8Array(81);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0 && !isInitialGiven(r, c)) {
          values[r * 9 + c] = board[r][c];
        }
      }
    }
    return values;
  },

  /**
   * @param {Uint8Array|null} filledValues - when supplied, a cell already
   *   holding a digit counts as carrying that digit, so rectangles may span
   *   solved cells.  Cells left at 0 fall back to their pencil marks, which
   *   keeps givens (no pencils, no entry here) out of every rectangle.
   */
  _findUniquenessRectangles: (
    pencils,
    requireBivalueFloor = true,
    filledValues = null,
  ) => {
    const rects = [];
    const cellHas = filledValues
      ? (r, c, digit) => {
          const value = filledValues[r * 9 + c];
          return value === 0 ? pencils[r][c].has(digit) : value === digit;
        }
      : (r, c, digit) => pencils[r][c].has(digit);
    const canFormPattern = (r1, r2, c1, c2, x, y) =>
      cellHas(r1, c1, x) &&
      cellHas(r1, c2, y) &&
      cellHas(r2, c1, y) &&
      cellHas(r2, c2, x);
    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        for (let r1 = 0; r1 < 8; r1++) {
          for (let r2 = r1 + 1; r2 < 9; r2++) {
            const cols = [];
            for (let c = 0; c < 9; c++) {
              const r1_has = cellHas(r1, c, d1) || cellHas(r1, c, d2);
              const r2_has = cellHas(r2, c, d1) || cellHas(r2, c, d2);
              if (r1_has && r2_has) {
                cols.push(c);
              }
            }
            if (cols.length < 2) continue;

            for (const colPair of techniques.combinations(cols, 2)) {
              const [c1, c2] = colPair;
              if (
                !(
                  (Math.floor(r1 / 3) === Math.floor(r2 / 3)) !==
                  (Math.floor(c1 / 3) === Math.floor(c2 / 3))
                )
              )
                continue;

              if (
                !canFormPattern(r1, r2, c1, c2, d1, d2) &&
                !canFormPattern(r1, r2, c1, c2, d2, d1)
              ) {
                continue;
              }

              const currentCells = [
                [r1, c1],
                [r1, c2],
                [r2, c1],
                [r2, c2],
              ];

              if (requireBivalueFloor) {
                const hasBivalueFloor = currentCells.some(([r, c]) => {
                  const cands = pencils[r][c];
                  return cands.size === 2 && cands.has(d1) && cands.has(d2);
                });
                if (!hasBivalueFloor) continue;
              }

              rects.push({
                cells: currentCells,
                digits: [d1, d2],
              });
            }
          }
        }
      }
    }
    return rects;
  },

  _findUniqueRectangleXyWings: (board, pencils, rectangles = null) => {
    const rects =
      rectangles || techniques._findUniquenessRectangles(pencils) || [];
    if (rects.length === 0) return [];

    const candidateMasks = new Uint16Array(81);
    const candidateCells = Array(10).fill(0n);
    const bivalueCells = Array.from({ length: 10 }, () => []);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const id = r * 9 + c;
        const mask = techniques._bits.maskFromSet(pencils[r][c]);
        candidateMasks[id] = mask;
        for (const digit of pencils[r][c]) {
          candidateCells[digit] |= CELL_MASK[id];
          if (pencils[r][c].size === 2) bivalueCells[digit].push(id);
        }
      }
    }

    const crossGroupPairIndex = (first, second) => {
      let index = 0;
      for (let a = 0; a < 9; a++) {
        for (let b = a + 1; b < 9; b++) {
          if (Math.floor(a / 3) === Math.floor(b / 3)) continue;
          if (a === first && b === second) return index;
          index++;
        }
      }
      return -1;
    };

    const withinGroupPairIndex = (first, second) => {
      const a = first % 3;
      const b = second % 3;
      if (a === 0) return b - 1;
      return 2;
    };

    const patternIndex = (cells) => {
      const r1 = cells[0][0];
      const r2 = cells[2][0];
      const c1 = cells[0][1];
      const c2 = cells[1][1];
      if (Math.floor(r1 / 3) === Math.floor(r2 / 3)) {
        return (
          Math.floor(r1 / 3) * 81 +
          withinGroupPairIndex(r1, r2) * 27 +
          crossGroupPairIndex(c1, c2)
        );
      }
      return (
        243 +
        Math.floor(c1 / 3) * 81 +
        withinGroupPairIndex(c1, c2) * 27 +
        crossGroupPairIndex(r1, r2)
      );
    };

    const cornerPairs = [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ];
    const foundByPattern = new Map();

    for (const rect of rects) {
      const index = patternIndex(rect.cells);
      if (foundByPattern.has(index)) continue;

      const ids = rect.cells.map(([r, c]) => r * 9 + c);
      const [d1, d2] = rect.digits;
      const baseMask = (1 << (d1 - 1)) | (1 << (d2 - 1));
      const canMakeDeadlyPattern =
        (Boolean(
          candidateMasks[ids[0]] & candidateMasks[ids[3]] & (1 << (d1 - 1)),
        ) &&
          Boolean(
            candidateMasks[ids[1]] & candidateMasks[ids[2]] & (1 << (d2 - 1)),
          )) ||
        (Boolean(
          candidateMasks[ids[1]] & candidateMasks[ids[2]] & (1 << (d1 - 1)),
        ) &&
          Boolean(
            candidateMasks[ids[0]] & candidateMasks[ids[3]] & (1 << (d2 - 1)),
          ));
      if (!canMakeDeadlyPattern) continue;

      for (const [cornerIndex1, cornerIndex2] of cornerPairs) {
        const cornerMask =
          candidateMasks[ids[cornerIndex1]] | candidateMasks[ids[cornerIndex2]];
        if (cornerMask !== baseMask) continue;

        const petalIndices = [0, 1, 2, 3].filter(
          (value) => value !== cornerIndex1 && value !== cornerIndex2,
        );
        const petalMask1 = candidateMasks[ids[petalIndices[0]]];
        const petalMask2 = candidateMasks[ids[petalIndices[1]]];
        if (((petalMask1 | petalMask2) & baseMask) !== baseMask) {
          continue;
        }

        const extraMask = (petalMask1 | petalMask2) & ~baseMask;
        if (techniques._bits.popcount(extraMask) !== 2) continue;
        const [extraDigit1, extraDigit2] =
          techniques._bits.maskToDigits(extraMask);

        const sourceMask1 = ids.reduce(
          (mask, id) =>
            candidateMasks[id] & (1 << (extraDigit1 - 1))
              ? mask | CELL_MASK[id]
              : mask,
          0n,
        );
        const sourceMask2 = ids.reduce(
          (mask, id) =>
            candidateMasks[id] & (1 << (extraDigit2 - 1))
              ? mask | CELL_MASK[id]
              : mask,
          0n,
        );
        const branchGroup1 = bivalueCells[extraDigit1].filter(
          (id) => (sourceMask1 & ~PEER_MAP[id]) === 0n,
        );
        const branchGroup2 = bivalueCells[extraDigit2].filter(
          (id) => (sourceMask2 & ~PEER_MAP[id]) === 0n,
        );

        let proof = null;
        for (const branch1 of branchGroup1) {
          const pivotMask = candidateMasks[branch1] & ~(1 << (extraDigit1 - 1));
          if (techniques._bits.popcount(pivotMask) !== 1) continue;
          const [pivotDigit] = techniques._bits.maskToDigits(pivotMask);
          const requiredBranch2Mask =
            (1 << (extraDigit2 - 1)) | (1 << (pivotDigit - 1));

          for (const branch2 of branchGroup2) {
            if (
              branch1 === branch2 ||
              candidateMasks[branch2] !== requiredBranch2Mask
            ) {
              continue;
            }

            const eliminationMask =
              PEER_MAP[branch1] &
              PEER_MAP[branch2] &
              candidateCells[pivotDigit];
            if (eliminationMask === 0n) continue;

            const removals = [];
            for (let id = 0; id < 81; id++) {
              if ((eliminationMask & CELL_MASK[id]) === 0n) continue;
              removals.push({
                r: Math.floor(id / 9),
                c: id % 9,
                num: pivotDigit,
              });
            }
            proof = {
              patternIndex: index,
              cells: rect.cells.map(([r, c]) => [r, c]),
              d1,
              d2,
              petals: petalIndices.map((value) => [...rect.cells[value]]),
              branches: [
                [Math.floor(branch1 / 9), branch1 % 9],
                [Math.floor(branch2 / 9), branch2 % 9],
              ],
              pivotDigit,
              extraDigits: [extraDigit1, extraDigit2],
              removals,
            };
            break;
          }
          if (proof) break;
        }
        if (proof) {
          foundByPattern.set(index, proof);
          break;
        }
      }
    }

    return [...foundByPattern.values()].sort(
      (left, right) => left.patternIndex - right.patternIndex,
    );
  },

  _findAvoidableRectangleXyWings: (board, pencils, filledValues = null) => {
    const placed = filledValues || techniques._getAvoidableFilledValues(board);
    if (!placed) return [];

    const candidateMasks = new Uint16Array(81);
    const candidateCells = Array(10).fill(0n);
    const bivalueCells = Array.from({ length: 10 }, () => []);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const id = r * 9 + c;
        const mask = techniques._bits.maskFromSet(pencils[r][c]);
        candidateMasks[id] = mask;
        for (const digit of pencils[r][c]) {
          candidateCells[digit] |= CELL_MASK[id];
          if (pencils[r][c].size === 2) bivalueCells[digit].push(id);
        }
      }
    }

    const bit = (digit) => 1 << (digit - 1);
    const digits = techniques._bits.maskToDigits;
    const popcount = techniques._bits.popcount;
    const rotations = [
      [0, 1, 2, 3],
      [1, 3, 0, 2],
      [3, 2, 1, 0],
      [2, 0, 3, 1],
    ];
    const patterns = [];

    const isPlaced = (id, digit) =>
      board[Math.floor(id / 9)][id % 9] !== 0 && placed[id] === digit;
    const isEmptyBivalue = (id) =>
      board[Math.floor(id / 9)][id % 9] === 0 &&
      popcount(candidateMasks[id]) === 2;

    const addSingleFilledPattern = (ids, cells) => {
      const [a, b, c, d] = ids;
      const d1 = placed[a];
      if (!d1 || !isPlaced(a, d1)) return;
      if (!isEmptyBivalue(b) || !isEmptyBivalue(c)) return;
      if (board[Math.floor(d / 9)][d % 9] !== 0) return;

      const shared = candidateMasks[b] & candidateMasks[c];
      if (popcount(shared) !== 1) return;
      const [d2] = digits(shared);
      const [z] = digits(candidateMasks[b] & ~shared);
      const [x] = digits(candidateMasks[c] & ~shared);
      if (new Set([d1, d2, x, z]).size !== 4) return;

      const dMask = candidateMasks[d];
      const allowed = bit(d1) | bit(d2) | bit(x) | bit(z);
      if (
        popcount(dMask) < 2 ||
        (dMask & bit(d1)) === 0 ||
        (dMask & ~allowed) !== 0
      ) {
        return;
      }

      let caseId = null;
      if (dMask === allowed) caseId = "single-all";
      else if (dMask === (bit(d1) | bit(x) | bit(z))) caseId = "single-xz";
      else if (
        dMask === (bit(d1) | bit(d2) | bit(x)) ||
        dMask === (bit(d1) | bit(d2) | bit(z))
      ) {
        caseId = "single-d2-extra";
      } else if (
        dMask === (bit(d1) | bit(x)) ||
        dMask === (bit(d1) | bit(z))
      ) {
        caseId = "single-extra";
      } else if (dMask === (bit(d1) | bit(d2))) {
        caseId = "single-d2";
      }
      if (!caseId) return;

      patterns.push({ caseId, cells, ids, d1, d2, x, z });
    };

    const addAdjacentFilledPatterns = (ids, cells) => {
      const [a, b, c, d] = ids;
      const d1 = placed[a];
      const d2 = placed[b];
      if (!d1 || !d2 || d1 === d2) return;
      if (!isPlaced(a, d1) || !isPlaced(b, d2)) return;
      if (!isEmptyBivalue(c)) return;
      if ((candidateMasks[c] & bit(d2)) === 0) return;
      const [x] = digits(candidateMasks[c] & ~bit(d2));
      if (!x || x === d1) return;
      if (board[Math.floor(d / 9)][d % 9] !== 0) return;

      const dMask = candidateMasks[d];
      if ((dMask & bit(d1)) === 0) return;
      if (popcount(dMask) === 2) {
        const [z] = digits(dMask & ~bit(d1));
        if (!z || new Set([d1, d2, x, z]).size !== 4) return;
        patterns.push({
          caseId: "adjacent-z",
          cells,
          ids,
          d1,
          d2,
          x,
          z,
        });
      } else if (popcount(dMask) === 3 && (dMask & bit(x)) !== 0) {
        const remaining = dMask & ~(bit(d1) | bit(x));
        if (popcount(remaining) !== 1) return;
        const [z] = digits(remaining);
        if (new Set([d1, d2, x, z]).size !== 4) return;
        patterns.push({
          caseId: "adjacent-xz",
          cells,
          ids,
          d1,
          d2,
          x,
          z,
        });
      }
    };

    const addDiagonalFilledPattern = (ids, cells) => {
      const [a, b, c, d] = ids;
      const d1 = placed[a];
      if (!d1 || !isPlaced(a, d1) || !isPlaced(d, d1)) return;
      if (!isEmptyBivalue(b) || !isEmptyBivalue(c)) return;

      const shared = candidateMasks[b] & candidateMasks[c];
      if (popcount(shared) !== 1) return;
      const [d2] = digits(shared);
      const [z] = digits(candidateMasks[b] & ~shared);
      const [x] = digits(candidateMasks[c] & ~shared);
      if (new Set([d1, d2, x, z]).size !== 4) return;
      patterns.push({ caseId: "diagonal", cells, ids, d1, d2, x, z });
    };

    for (const rect of techniques._findAvoidableRectangles()) {
      for (const rotation of rotations) {
        const cells = rotation.map((index) => [...rect.cells[index]]);
        const ids = cells.map(([r, c]) => r * 9 + c);
        addSingleFilledPattern(ids, cells);
        addAdjacentFilledPatterns(ids, cells);
        addDiagonalFilledPattern(ids, cells);
      }
    }

    const proofs = [];
    const seen = new Set();
    for (const pattern of patterns) {
      const body = new Set(pattern.ids);
      const sourceMask = (digit) =>
        pattern.ids.reduce(
          (mask, id) =>
            candidateMasks[id] & bit(digit) ? mask | CELL_MASK[id] : mask,
          0n,
        );
      const xSources = sourceMask(pattern.x);
      const zSources = sourceMask(pattern.z);
      const xWings = bivalueCells[pattern.x].filter(
        (id) => !body.has(id) && (xSources & ~PEER_MAP[id]) === 0n,
      );
      const zWings = bivalueCells[pattern.z].filter(
        (id) => !body.has(id) && (zSources & ~PEER_MAP[id]) === 0n,
      );

      for (const xWing of xWings) {
        const pivotMask = candidateMasks[xWing] & ~bit(pattern.x);
        if (popcount(pivotMask) !== 1) continue;
        const [pivotDigit] = digits(pivotMask);
        const expectedZWing = bit(pattern.z) | bit(pivotDigit);

        for (const zWing of zWings) {
          if (xWing === zWing || candidateMasks[zWing] !== expectedZWing) {
            continue;
          }
          const eliminationMask =
            PEER_MAP[xWing] & PEER_MAP[zWing] & candidateCells[pivotDigit];
          if (eliminationMask === 0n) continue;

          const removals = [];
          for (let id = 0; id < 81; id++) {
            if ((eliminationMask & CELL_MASK[id]) === 0n) continue;
            removals.push({
              r: Math.floor(id / 9),
              c: id % 9,
              num: pivotDigit,
            });
          }
          const key = [
            [...pattern.ids].sort((a, b) => a - b).join(","),
            [xWing, zWing].sort((a, b) => a - b).join(","),
            pivotDigit,
            removals
              .map(({ r, c, num }) => `${r},${c},${num}`)
              .sort()
              .join(";"),
          ].join("|");
          if (seen.has(key)) continue;
          seen.add(key);

          const guardianCells = pattern.ids
            .filter(
              (id) =>
                (candidateMasks[id] & (bit(pattern.x) | bit(pattern.z))) !== 0,
            )
            .map((id) => [Math.floor(id / 9), id % 9]);
          proofs.push({
            caseId: pattern.caseId,
            cells: pattern.cells,
            d1: pattern.d1,
            d2: pattern.d2,
            guardianCells,
            branches: [
              [Math.floor(xWing / 9), xWing % 9],
              [Math.floor(zWing / 9), zWing % 9],
            ],
            pivotDigit,
            extraDigits: [pattern.x, pattern.z],
            removals,
          });
        }
      }
    }

    return proofs;
  },
});
