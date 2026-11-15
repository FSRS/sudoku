Object.assign(techniques, {
  _findUniqueLoops: function (pencils, filledValues = null, coverable = null) {
    if (filledValues) {
      return techniques._findAvoidableUniqueLoops(
        pencils,
        filledValues,
        coverable,
      );
    }
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

      // Digits a guardian carries beyond the pair; 0 for floor cells.
      const pairBits = (1 << (d1 - 1)) | (1 << (d2 - 1));
      const extraMask = new Uint16Array(81);
      for (const id of cell_list) {
        let mask = 0;
        for (const digit of pencils[Math.floor(id / 9)][id % 9]) {
          mask |= 1 << (digit - 1);
        }
        extraMask[id] = mask & ~pairBits;
      }

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

      const extraCands = (id) =>
        techniques._bits
          .maskToDigits(extraMask[id])
          .map((digit) => [id, digit]);

      for (const start of bivalue_set_for_pair) {
        if (!neighbors.has(start)) continue;
        const path = [start];
        const used = new Set(path);
        const guardCands = [];
        let guardianCount = 0;
        // Shared single extra digit of the guardians so far (-1 once broken)
        // and their shared loop parity (-1 none, 2 mixed).  Three or more
        // guardians only ever feed Type 2/5 (shared extra) or Type 6 (one
        // parity), and both properties can only be lost as the path grows.
        let guardianExtra = 0;
        let guardianParity = -1;
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
            if (!coverable && isGuardian && guardianCount >= 4) continue;
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
            let nextExtra = guardianExtra;
            let nextParity = guardianParity;
            const guardBase = guardCands.length;
            if (isGuardian && coverable) {
              guardCands.push(...extraCands(next));
              if (!coverable(guardCands)) {
                guardCands.length = guardBase;
                continue;
              }
            } else if (isGuardian) {
              const extra = extraMask[next];
              if (guardianCount === 0) nextExtra = extra;
              if (nextExtra !== extra || (extra & (extra - 1)) !== 0) {
                nextExtra = -1;
              }
              nextParity =
                guardianCount === 0 || guardianParity === parity ? parity : 2;
              if (guardianCount >= 2 && nextExtra === -1 && nextParity === 2) {
                continue;
              }
            }

            path.push(next);
            used.add(next);
            if (isGuardian) guardianCount++;
            const oldGuardianExtra = guardianExtra;
            const oldGuardianParity = guardianParity;
            guardianExtra = nextExtra;
            guardianParity = nextParity;
            for (const house of nextHouses) {
              houseCounts[house]++;
              houseParityMasks[house] |= parityBit;
            }

            let stop = false;
            if (
              path.length >= 6 &&
              path.length % 2 === 0 &&
              guardianCount > 0 &&
              houseCounts.every((count) => count === 0 || count === 2) &&
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
            guardCands.length = guardBase;
            if (isGuardian) guardianCount--;
            guardianExtra = oldGuardianExtra;
            guardianParity = oldGuardianParity;
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

  _findAvoidableUniqueLoops: function (pencils, filledValues, coverable = null) {
    const loops = [];
    const found = new Set();
    const maxLoopLength = 18;
    const maxResults = 1023;
    const getHouses = (id) => {
      const r = Math.floor(id / 9);
      const c = id % 9;
      return [r, 9 + c, 18 + techniques._getBoxIndex(r, c)];
    };

    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        const cellList = [];
        const floor = new Set();
        const guardians = new Set();
        const placed = new Map();

        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const id = r * 9 + c;
            const value = filledValues[id];
            if (value) {
              if (value !== d1 && value !== d2) continue;
              cellList.push(id);
              floor.add(id);
              placed.set(id, value);
              continue;
            }
            const cands = pencils[r][c];
            if (cands.size === 0) continue;
            const hasD1 = cands.has(d1);
            const hasD2 = cands.has(d2);
            if (!hasD1 && !hasD2) continue;
            const hasExtra = [...cands].some(
              (digit) => digit !== d1 && digit !== d2,
            );
            if (!hasD1 || !hasD2) {
              if (!hasExtra) continue;
              guardians.add(id);
            } else if (hasExtra) {
              guardians.add(id);
            } else {
              floor.add(id);
            }
            cellList.push(id);
          }
        }
        if (cellList.length < 6 || placed.size === 0 || floor.size < 2)
          continue;

        const pairBits = (1 << (d1 - 1)) | (1 << (d2 - 1));
        const extraMask = new Uint16Array(81);
        for (const id of guardians) {
          let mask = 0;
          for (const digit of pencils[Math.floor(id / 9)][id % 9]) {
            mask |= 1 << (digit - 1);
          }
          extraMask[id] = mask & ~pairBits;
        }

        const neighbors = new Map();
        for (const id of cellList) {
          const cell = [Math.floor(id / 9), id % 9];
          neighbors.set(
            id,
            cellList.filter(
              (other) =>
                other !== id &&
                techniques._sees(cell, [Math.floor(other / 9), other % 9]),
            ),
          );
        }

        for (const start of floor) {
          const path = [start];
          const used = new Set(path);
          const guardCands = [];
          const houseCounts = new Uint8Array(27);
          const houseParityMasks = new Uint8Array(27);
          for (const house of getHouses(start)) {
            houseCounts[house] = 1;
            houseParityMasks[house] = 1;
          }
          let guardianCount = 0;
          let guardianExtra = 0;
          let direction = placed.has(start)
            ? placed.get(start) === d1
              ? 1
              : 2
            : 0;

          const search = (current) => {
            for (const next of neighbors.get(current)) {
              if (next === start) continue;
              if (used.has(next) || path.length >= maxLoopLength) continue;
              if (floor.has(next) && next < start) continue;
              const isGuardian = guardians.has(next);
              if (!coverable && isGuardian && guardianCount >= 4) continue;

              const parity = path.length & 1;
              const parityBit = 1 << parity;
              const nextHouses = getHouses(next);
              if (
                nextHouses.some(
                  (house) =>
                    houseCounts[house] >= 2 ||
                    (houseParityMasks[house] & parityBit) !== 0,
                )
              ) {
                continue;
              }
              let nextExtra = guardianExtra;
              if (isGuardian && !coverable) {
                const extra = extraMask[next];
                if (guardianCount === 0) nextExtra = extra;
                if (nextExtra !== extra || (extra & (extra - 1)) !== 0) {
                  nextExtra = -1;
                }
                if (guardianCount >= 2 && nextExtra === -1) continue;
              }

              const oldDirection = direction;
              if (placed.has(next)) {
                const requiredDirection =
                  (parity === 0) === (placed.get(next) === d1) ? 1 : 2;
                if (direction !== 0 && direction !== requiredDirection)
                  continue;
                if (direction === 0) direction = requiredDirection;
              }

              const guardBase = guardCands.length;
              if (isGuardian && coverable) {
                for (const digit of techniques._bits.maskToDigits(
                  extraMask[next],
                )) {
                  guardCands.push([next, digit]);
                }
                if (!coverable(guardCands)) {
                  guardCands.length = guardBase;
                  direction = oldDirection;
                  continue;
                }
              }

              path.push(next);
              used.add(next);
              if (isGuardian) guardianCount++;
              const oldGuardianExtra = guardianExtra;
              guardianExtra = nextExtra;
              for (const house of nextHouses) {
                houseCounts[house]++;
                houseParityMasks[house] |= parityBit;
              }

              let stop = false;
              if (
                path.length >= 6 &&
                path.length % 2 === 0 &&
                guardianCount > 0 &&
                houseCounts.every((count) => count === 0 || count === 2) &&
                techniques._sees(
                  [Math.floor(next / 9), next % 9],
                  [Math.floor(start / 9), start % 9],
                )
              ) {
                const key = `${d1},${d2}:${[...path]
                  .sort((left, right) => left - right)
                  .join(",")}`;
                const placedIds = path.filter((id) => placed.has(id));
                if (
                  !found.has(key) &&
                  placedIds.length > 0 &&
                  placedIds.length < path.length
                ) {
                  found.add(key);
                  loops.push({
                    cells: path.map((id) => [Math.floor(id / 9), id % 9]),
                    digits: [d1, d2],
                    placedCells: placedIds.map((id) => [
                      Math.floor(id / 9),
                      id % 9,
                    ]),
                  });
                  stop = loops.length >= maxResults;
                }
              }

              if (!stop && path.length < maxLoopLength) stop = search(next);
              for (const house of nextHouses) {
                houseCounts[house]--;
                houseParityMasks[house] &= ~parityBit;
              }
              used.delete(next);
              path.pop();
              guardCands.length = guardBase;
              if (isGuardian) guardianCount--;
              guardianExtra = oldGuardianExtra;
              direction = oldDirection;
              if (stop) return true;
            }
            return false;
          };

          if (search(start) || loops.length >= maxResults) break;
        }
        if (loops.length >= maxResults) break;
      }
      if (loops.length >= maxResults) break;
    }
    return loops;
  },

  _uniqueLoopGuardianPatterns: (board, pencils) => {
    const coverable = techniques._guardianCoverable;
    const toPattern = (kind) => (loop) =>
      techniques._guardianPatternFromCells(
        kind,
        board,
        pencils,
        loop.cells.map(([r, c]) => r * 9 + c),
        loop.digits,
      );
    const patterns = techniques
      ._findUniqueLoops(pencils, null, coverable)
      .filter(({ cells }) => cells.every(([r, c]) => board[r][c] === 0))
      .map(toPattern("UL"));
    const filledValues = techniques._getAvoidableFilledValues(board);
    if (!filledValues) return patterns;
    return patterns.concat(
      techniques
        ._findAvoidableUniqueLoops(pencils, filledValues, coverable)
        .filter(({ cells }) =>
          cells.every(
            ([r, c]) => board[r][c] === 0 || filledValues[r * 9 + c] !== 0,
          ),
        )
        .map(toPattern("AUL")),
    );
  },

  _findUniqueLoopExternalBodies: function (
    board,
    pencils,
    filledValues = null,
  ) {
    const g = buildGrid(pencils);
    const bodies = [];
    const maxLoopLength = 18;
    const cellHouses = new Uint8Array(243);
    const placedHouses = new Int32Array(10);
    for (let id = 0; id < 81; id++) {
      const r = (id / 9) | 0;
      const c = id % 9;
      cellHouses[id * 3] = r;
      cellHouses[id * 3 + 1] = 9 + c;
      cellHouses[id * 3 + 2] = 18 + boxOf(r, c);
      const value = board[r][c];
      if (value !== 0 && !(filledValues && filledValues[id])) {
        placedHouses[value] |=
          (1 << r) | (1 << (9 + c)) | (1 << (18 + boxOf(r, c)));
      }
    }
    const many = (m0, m1, m2) =>
      ((m0 & (m0 - 1)) | (m1 & (m1 - 1)) | (m2 & (m2 - 1))) !== 0 ||
      (m0 !== 0) + (m1 !== 0) + (m2 !== 0) > 1;
    const free = new Int32Array(3);
    const spare = new Int32Array(3);
    const above = new Int32Array(3);
    const digitsOf = new Uint16Array(81);
    const open = new Int32Array(27);
    const kill = new Uint8Array(81);
    const houseCounts = new Uint8Array(27);
    const holders1 = new Uint8Array(27);
    const holders2 = new Uint8Array(27);
    const houseParityMasks = new Uint8Array(27);
    const path = [];

    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        const bit1 = 1 << (d1 - 1);
        const bit2 = 1 << (d2 - 1);
        const digitMask = bit1 | bit2;
        const cellMask = new Int32Array(3);
        const placedMask = new Int32Array(3);
        const cellList = [];
        for (let id = 0; id < 81; id++) {
          const value = filledValues ? filledValues[id] : 0;
          if (value === d1 || value === d2) {
            digitsOf[id] = 1 << (value - 1);
            placedMask[CELL_PART[id]] |= CELL_BIT[id];
          } else if (
            board[(id / 9) | 0][id % 9] === 0 &&
            g.cand[id] & digitMask
          ) {
            digitsOf[id] = g.cand[id] & digitMask;
            cellMask[CELL_PART[id]] |= CELL_BIT[id];
          } else continue;
          cellList.push(id);
        }
        if (cellList.length < 6) continue;
        if (
          filledValues &&
          (placedMask[0] | placedMask[1] | placedMask[2]) === 0
        )
          continue;
        // A family stays usable only on cells of a closed loop whose houses
        // of that family hold no placed base digit; in every house a loop
        // cell needs a partner taking the other base digit.
        const housePlaced = placedHouses[d1] | placedHouses[d2];
        const hasPartner = (id, house) =>
          (digitsOf[id] & bit1 &&
            holders2[house] - (digitsOf[id] & bit2 ? 1 : 0) > 0) ||
          (digitsOf[id] & bit2 &&
            holders1[house] - (digitsOf[id] & bit1 ? 1 : 0) > 0);
        for (const id of cellList) kill[id] = 0;
        for (let family = 0; family < 3; family++) {
          const bit = 1 << family;
          holders1.fill(0);
          holders2.fill(0);
          for (const id of cellList) {
            if ((housePlaced >> cellHouses[id * 3 + family]) & 1) {
              kill[id] |= bit;
              continue;
            }
            for (let i = 0; i < 3; i++) {
              if (digitsOf[id] & bit1) holders1[cellHouses[id * 3 + i]]++;
              if (digitsOf[id] & bit2) holders2[cellHouses[id * 3 + i]]++;
            }
          }
          for (let changed = true; changed;) {
            changed = false;
            for (const id of cellList) {
              if (kill[id] & bit) continue;
              if (
                !hasPartner(id, cellHouses[id * 3]) ||
                !hasPartner(id, cellHouses[id * 3 + 1]) ||
                !hasPartner(id, cellHouses[id * 3 + 2])
              ) {
                kill[id] |= bit;
                for (let i = 0; i < 3; i++) {
                  if (digitsOf[id] & bit1) holders1[cellHouses[id * 3 + i]]--;
                  if (digitsOf[id] & bit2) holders2[cellHouses[id * 3 + i]]--;
                }
                changed = true;
              }
            }
          }
        }
        // Bit 1: even cells take d1 and odd cells d2; bit 2: the reverse.
        const orientations = (id, parity) =>
          (digitsOf[id] & bit1 ? (parity === 0 ? 1 : 2) : 0) |
          (digitsOf[id] & bit2 ? (parity === 0 ? 2 : 1) : 0);
        const mixedBody = () => {
          const filled = path.filter((id) => filledValues[id] !== 0).length;
          return filled > 0 && filled < path.length;
        };
        const found = new Set();
        let start = 0;
        let openHouses = 0;
        let dead = 0;

        const insideOneHouse = (anchor, fixed0, fixed1, fixed2, openCount) => {
          for (let i = 0; i < 3; i++) {
            const unit = cellHouses[anchor * 3 + i] * 3;
            const out0 = ~UNIT_POS[unit];
            const out1 = ~UNIT_POS[unit + 1];
            const out2 = ~UNIT_POS[unit + 2];
            if ((fixed0 & out0) | (fixed1 & out1) | (fixed2 & out2)) continue;
            let inside = true;
            for (let j = 0; j < openCount && inside; j++) {
              inside = !many(
                open[j * 3] & out0,
                open[j * 3 + 1] & out1,
                open[j * 3 + 2] & out2,
              );
            }
            if (inside) return true;
          }
          return false;
        };

        // An open house keeps all its free cells but one as guardians.
        const familyState = (family) => {
          let fixed0 = 0;
          let fixed1 = 0;
          let fixed2 = 0;
          let openCount = 0;
          for (let cell = 0; cell < path.length; cell++) {
            const house = cellHouses[path[cell] * 3 + family];
            const m0 = free[0] & UNIT_POS[house * 3];
            const m1 = free[1] & UNIT_POS[house * 3 + 1];
            const m2 = free[2] & UNIT_POS[house * 3 + 2];
            if (houseCounts[house] === 2) {
              fixed0 |= m0;
              fixed1 |= m1;
              fixed2 |= m2;
            } else if ((m0 | m1 | m2) === 0) {
              if (
                ((spare[0] & placedMask[0] & UNIT_POS[house * 3]) |
                  (spare[1] & placedMask[1] & UNIT_POS[house * 3 + 1]) |
                  (spare[2] & placedMask[2] & UNIT_POS[house * 3 + 2])) ===
                0
              ) {
                return -1;
              }
            } else if (many(m0, m1, m2)) {
              open[openCount * 3] = m0;
              open[openCount * 3 + 1] = m1;
              open[openCount * 3 + 2] = m2;
              openCount++;
            }
          }
          const guarded = (fixed0 | fixed1 | fixed2) !== 0 ? 1 : 0;
          if (!guarded && openCount === 0) return 0;
          if (guarded) {
            const part = fixed0 ? 0 : fixed1 ? 1 : 2;
            const anchor =
              part * 27 +
              lowest(part === 0 ? fixed0 : part === 1 ? fixed1 : fixed2);
            if (insideOneHouse(anchor, fixed0, fixed1, fixed2, openCount)) {
              return guarded;
            }
          } else {
            let tried = 0;
            for (let part = 0; part < 3 && tried < 2; part++) {
              let m = open[part];
              while (m && tried < 2) {
                if (insideOneHouse(part * 27 + lowest(m), 0, 0, 0, openCount)) {
                  return guarded;
                }
                m &= m - 1;
                tried++;
              }
            }
          }
          for (let which = 0; which < 2; which++) {
            const k = (which === 0 ? d1 : d2) - 1;
            const other = (which === 0 ? d2 : d1) - 1;
            const other0 = g.pos[other * 3];
            const other1 = g.pos[other * 3 + 1];
            const other2 = g.pos[other * 3 + 2];
            if ((fixed0 & other0) | (fixed1 & other1) | (fixed2 & other2)) {
              continue;
            }
            let blocked = false;
            for (let j = 0; j < openCount && !blocked; j++) {
              blocked = many(
                open[j * 3] & other0,
                open[j * 3 + 1] & other1,
                open[j * 3 + 2] & other2,
              );
            }
            if (blocked) continue;
            const pos0 = g.pos[k * 3];
            const pos1 = g.pos[k * 3 + 1];
            const pos2 = g.pos[k * 3 + 2];
            for (let part = 0; part < 3; part++) {
              let seers = g.pos[k * 3 + part];
              for (let fp = 0; fp < 3 && seers; fp++) {
                let m = fp === 0 ? fixed0 : fp === 1 ? fixed1 : fixed2;
                while (m) {
                  seers &= PEER[(fp * 27 + lowest(m)) * 3 + part];
                  m &= m - 1;
                }
              }
              while (seers) {
                const seer = part * 27 + lowest(seers);
                seers &= seers - 1;
                const keep0 = pos0 & ~PEER[seer * 3];
                const keep1 = pos1 & ~PEER[seer * 3 + 1];
                const keep2 = pos2 & ~PEER[seer * 3 + 2];
                let ok = true;
                for (let j = 0; j < openCount && ok; j++) {
                  const holdsSeer =
                    (open[j * 3 + CELL_PART[seer]] & CELL_BIT[seer]) !== 0;
                  let m0 = open[j * 3] & keep0;
                  let m1 = open[j * 3 + 1] & keep1;
                  let m2 = open[j * 3 + 2] & keep2;
                  if (CELL_PART[seer] === 0) m0 &= ~CELL_BIT[seer];
                  else if (CELL_PART[seer] === 1) m1 &= ~CELL_BIT[seer];
                  else m2 &= ~CELL_BIT[seer];
                  ok = holdsSeer ? (m0 | m1 | m2) === 0 : !many(m0, m1, m2);
                }
                if (ok) return guarded;
              }
            }
          }
          return -1;
        };

        const search = (current, orientation) => {
          for (let part = 0; part < 3; part++) {
            let candidates =
              PEER[current * 3 + part] & spare[part] & above[part];
            while (candidates) {
              const next = part * 27 + lowest(candidates);
              candidates &= candidates - 1;
              const parity = path.length & 1;
              const parityBit = 1 << parity;
              const h0 = cellHouses[next * 3];
              const h1 = cellHouses[next * 3 + 1];
              const h2 = cellHouses[next * 3 + 2];
              if (
                houseCounts[h0] >= 2 ||
                (houseParityMasks[h0] & parityBit) !== 0 ||
                houseCounts[h1] >= 2 ||
                (houseParityMasks[h1] & parityBit) !== 0 ||
                houseCounts[h2] >= 2 ||
                (houseParityMasks[h2] & parityBit) !== 0
              ) {
                continue;
              }
              if ((dead | kill[next]) === 7) continue;
              const nextOrientation = orientation & orientations(next, parity);
              if (nextOrientation === 0) continue;

              const savedDead = dead;
              const savedOpen = openHouses;
              path.push(next);
              free[part] &= ~CELL_BIT[next];
              spare[part] &= ~CELL_BIT[next];
              dead |= kill[next];
              for (let i = 0; i < 3; i++) {
                const house = cellHouses[next * 3 + i];
                houseCounts[house]++;
                houseParityMasks[house] |= parityBit;
                if (houseCounts[house] === 1) openHouses++;
                else {
                  openHouses--;
                  if (
                    (spare[0] & placedMask[0] & UNIT_POS[house * 3]) |
                    (spare[1] & placedMask[1] & UNIT_POS[house * 3 + 1]) |
                    (spare[2] & placedMask[2] & UNIT_POS[house * 3 + 2])
                  ) {
                    dead |= 1 << i;
                  }
                }
              }
              let guarded = false;
              for (let family = 0; family < 3; family++) {
                if ((dead >> family) & 1) continue;
                const state = familyState(family);
                if (state < 0) dead |= 1 << family;
                else if (state > 0) guarded = true;
              }

              if (dead !== 7) {
                if (
                  openHouses === 0 &&
                  guarded &&
                  path.length >= 6 &&
                  seesId(next, start) &&
                  (!filledValues || mixedBody())
                ) {
                  const ids = [...path].sort((a, b) => a - b);
                  const key = ids.join(",");
                  if (!found.has(key)) {
                    found.add(key);
                    bodies.push({
                      digits: [d1, d2],
                      cells: path.map((id) => [(id / 9) | 0, id % 9]),
                    });
                  }
                }
                if (openHouses > 0 && path.length < maxLoopLength) {
                  search(next, nextOrientation);
                }
              }

              for (let i = 0; i < 3; i++) {
                const house = cellHouses[next * 3 + i];
                houseCounts[house]--;
                houseParityMasks[house] &= ~parityBit;
              }
              free[part] |= cellMask[part] & CELL_BIT[next];
              spare[part] |= CELL_BIT[next];
              path.pop();
              openHouses = savedOpen;
              dead = savedDead;
            }
          }
        };

        for (const first of cellList) {
          if (kill[first] === 7) continue;
          start = first;
          path.length = 0;
          path.push(start);
          for (let part = 0; part < 3; part++) {
            free[part] = cellMask[part];
            spare[part] = cellMask[part] | placedMask[part];
            above[part] =
              part < CELL_PART[start]
                ? 0
                : part > CELL_PART[start]
                  ? 0x7ffffff
                  : 0x7ffffff & ~((CELL_BIT[start] << 1) - 1);
          }
          free[CELL_PART[start]] &= ~CELL_BIT[start];
          spare[CELL_PART[start]] &= ~CELL_BIT[start];
          for (let i = 0; i < 3; i++) {
            houseCounts[cellHouses[start * 3 + i]] = 1;
            houseParityMasks[cellHouses[start * 3 + i]] = 1;
          }
          openHouses = 3;
          dead = kill[start];
          search(start, orientations(start, 0));
          for (let i = 0; i < 3; i++) {
            houseCounts[cellHouses[start * 3 + i]] = 0;
            houseParityMasks[cellHouses[start * 3 + i]] = 0;
          }
        }
      }
    }
    return bodies;
  },

  uniqueLoop: (
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
    const loops = techniques._findUniqueLoops(pencils, filledValues);
    if (loops.length === 0) return findAll ? results : { change: false };

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
        removals,
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

      return plan;
    };

    const getULTlg = (cells, digits, removals, build = () => {}) => {
      const logic = techniques._tlgDeadlyCells(
        cells,
        digits,
        pencils,
        removals,
      );
      build(logic);
      return logic.logic();
    };

    for (const ul of loops) {
      const { cells, digits, placedCells = [] } = ul;
      const [d1, d2] = digits;
      const d_set = new Set(digits);
      const placedIds = new Set(
        placedCells.map(([r, c]) => techniques._cellToId(r, c)),
      );
      let removals = [];

      const extra_cells = cells.filter(
        ([r, c]) =>
          !placedIds.has(techniques._cellToId(r, c)) &&
          (pencils[r][c].size !== 2 ||
            ![...pencils[r][c]].every((d) => d_set.has(d))),
      );

      const baseDigitsStr = `${d1}${d2}`;
      let detailPrefixCache = null;
      const getDetailPrefix = () => {
        if (detailPrefixCache === null) {
          detailPrefixCache = avoidable
            ? t(
                "teks_AUL_base_guardians",
                baseDigitsStr,
                getBasePosStr(cells),
                getGuardiansStr(extra_cells, d_set, pencils),
              )
            : t(
                "teks_UL_base_guardians",
                baseDigitsStr,
                getBasePosStr(cells),
                getGuardiansStr(extra_cells, d_set, pencils),
              );
        }
        return detailPrefixCache;
      };

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
              name: t(avoidable ? "teks_AUL_type_1" : "teks_UL_type_1"),
              mainInfo: t(
                avoidable ? "teks_AUL_digits" : "teks_UL_digits",
                baseDigitsStr,
              ),
              detail: getDetailPrefix(),
            },
            visualPlan: getULVisualPlan(
              1,
              cells,
              digits,
              _getUniqueRemovals(removals),
            ),
            tlg: getULTlg(cells, digits, removals),
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
                  ? t(avoidable ? "teks_AUL_type_2" : "teks_UL_type_2")
                  : t(avoidable ? "teks_AUL_type_5" : "teks_UL_type_5"),
                mainInfo: t(
                  avoidable ? "teks_AUL_digits" : "teks_UL_digits",
                  baseDigitsStr,
                ),
                detail: getDetailPrefix(),
              },
              visualPlan: getULVisualPlan(
                guardiansShareHouse ? 2 : 5,
                cells,
                digits,
                _getUniqueRemovals(removals),
              ),
              tlg: getULTlg(cells, digits, removals, (logic) => {
                const guards = extra_cells.map(([r, c]) => [
                  r * 9 + c,
                  common_extra_cand,
                ]);
                for (const { r, c, num } of removals) {
                  logic.connect([[r * 9 + c, num]], guards);
                }
              }),
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
                  name: t(avoidable ? "teks_AUL_type_3" : "teks_UL_type_3"),
                  mainInfo: t(
                    avoidable ? "teks_AUL_digits" : "teks_UL_digits",
                    baseDigitsStr,
                  ),
                  detail: t(
                    avoidable
                      ? "teks_UL_subset_cells"
                      : "teks_EUR_subset_cells",
                    getDetailPrefix(),
                    subsetStr,
                  ),
                },
                visualPlan: getULVisualPlan(
                  3,
                  cells,
                  digits,
                  _getUniqueRemovals(res.removals),
                  {
                    subsetCells: res.chosen,
                    subsetCands: res.union,
                  },
                ),
                tlg: getULTlg(cells, digits, res.removals, (logic) => {
                  for (const [r, c] of res.chosen) {
                    logic.truth({ kind: "cell", cell: r * 9 + c });
                  }
                  for (const digit of res.union) {
                    logic.linkSet({ kind: unit.type, index: unit.idx, digit });
                  }
                }),
              };
              if (!findAll) return resultObj;
              results.push(resultObj);
              continue;
            }
          }
        }

        // --- Type 4 ---
        // Avoidable loops intentionally do not define Type 4.
        if (!avoidable && techniques._sees([e1r, e1c], [e2r, e2c])) {
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
                      getDetailPrefix(),
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
                  tlg: getULTlg(cells, digits, removals, (logic) =>
                    logic.truth({ kind: unitType, index: unitIndex, digit: d }),
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
      // Avoidable loops intentionally do not define Type 6.
      if (!avoidable && extra_cells.length > 1) {
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
                detail: t(
                  "teks_UL_type_6_guardian_elimination_detail",
                  getDetailPrefix(),
                  u,
                ),
              },
              visualPlan: getULVisualPlan(6, cells, digits, uniqueRemovals, {
                restrictedDigit: u,
              }),
              tlg: getULTlg(cells, digits, type6Removals, (logic) => {
                for (const { type, index } of loopHouses.values()) {
                  logic.truth({ kind: type, index, digit: u });
                }
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

  avoidableUniqueLoop: (board, pencils, findAll = false) =>
    techniques.uniqueLoop(board, pencils, { avoidable: true }, findAll),
});
