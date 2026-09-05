Object.assign(techniques, {
  _gspSymmetries: {
    diagonal: {
      partner: (r, c) => [c, r],
      axis: Array.from({ length: 9 }, (_, i) => [i, i]),
      maxSelfPaired: 3,
      dirKey: "teks_top_left",
      labelKey: "teks_diagonal",
    },
    antiDiagonal: {
      partner: (r, c) => [8 - c, 8 - r],
      axis: Array.from({ length: 9 }, (_, i) => [i, 8 - i]),
      maxSelfPaired: 3,
      dirKey: "teks_top_right",
      labelKey: "teks_antidiagonal",
    },
    xAxis: {
      partner: (r, c) => [8 - r, c],
      axis: Array.from({ length: 9 }, (_, i) => [4, i]),
      maxSelfPaired: 0,
      dirKey: null,
      labelKey: "teks_x_axis",
    },
    yAxis: {
      partner: (r, c) => [r, 8 - c],
      axis: Array.from({ length: 9 }, (_, i) => [i, 4]),
      maxSelfPaired: 0,
      dirKey: null,
      labelKey: "teks_y_axis",
    },
    central: {
      partner: (r, c) => [8 - r, 8 - c],
      axis: [[4, 4]],
      maxSelfPaired: 1,
      dirKey: null,
      labelKey: "teks_central",
    },
  },

  _gspBuildMapping: (board, partner, broken = null) => {
    const mapping = new Array(10).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const [pr, pc] = partner(r, c);
        if (r * 9 + c >= pr * 9 + pc) continue;
        const d1 = board[r][c];
        const d2 = board[pr][pc];
        if ((d1 === 0) !== (d2 === 0)) {
          if (!broken || broken.length) return null;
          broken.push({ r, c }, { r: pr, c: pc });
          continue;
        }
        if (d1 === 0) continue;
        if (d1 === d2) {
          if (mapping[d1] === 0) mapping[d1] = d1;
          else if (mapping[d1] !== d1) return null;
        } else {
          if ((mapping[d1] === 0) !== (mapping[d2] === 0)) return null;
          if (mapping[d1] === 0) {
            mapping[d1] = d2;
            mapping[d2] = d1;
          } else if (mapping[d1] !== d2 || mapping[d2] !== d1) return null;
        }
      }
    }
    return mapping;
  },

  _gspSelfPairedDigits: (mapping) => {
    const selfPaired = new Set();
    for (let d = 1; d <= 9; d++) {
      if (mapping[d] === 0 || mapping[d] === d) selfPaired.add(d);
    }
    return selfPaired;
  },

  _gspMappingText: (mapping) => {
    const seen = new Set();
    const parts = [];
    for (let d = 1; d <= 9; d++) {
      if (seen.has(d)) continue;
      const other = mapping[d] === 0 ? d : mapping[d];
      parts.push(`${d}<=>${other}`);
      seen.add(d);
      seen.add(other);
    }
    return parts.join(" ");
  },

  _gspCellGroups: (board, mapping) => {
    const groupOf = new Array(10).fill(-1);
    let groups = 0;
    for (let d = 1; d <= 9; d++) {
      if (groupOf[d] !== -1) continue;
      groupOf[d] = groups;
      if (mapping[d] !== 0 && mapping[d] !== d) groupOf[mapping[d]] = groups;
      groups++;
    }
    const cells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0)
          cells.push({ r, c, group: groupOf[board[r][c]] });
      }
    }
    return cells;
  },

  _buildGspVisualPlan: (cellGroups, kept, removals) => ({
    highlight: { digit: null, state: 0 },
    cellColors: cellGroups.map(({ r, c, group }) => ({
      r,
      c,
      color: group,
    })),
    candidateColors: kept.map(({ r, c, num }) => ({
      r,
      c,
      num,
      color: 4,
    })),
    candidateMarks: removals.map(({ r, c, num }) => ({
      r,
      c,
      num,
      marker: "slash",
      color: 0,
    })),
  }),

  _applyGspVisuals: (cellGroups, kept, removals) => {
    techniques._applyVisualPlan(
      techniques._buildGspVisualPlan(cellGroups, kept, removals),
    );
  },

  gurthSymmetricalPlacement: (board, pencils, findAll = false) => {
    const results = [];

    for (const key of ["diagonal", "antiDiagonal", "central"]) {
      const symmetry = techniques._gspSymmetries[key];
      const mapping = techniques._gspBuildMapping(board, symmetry.partner);
      if (!mapping) continue;
      const selfPaired = techniques._gspSelfPairedDigits(mapping);
      const removals = [];
      const kept = [];
      let axisHolds = true;
      for (const [r, c] of symmetry.axis) {
        if (board[r][c] !== 0) {
          if (!selfPaired.has(board[r][c])) axisHolds = false;
          if (!axisHolds) break;
          continue;
        }
        let hasSelfPaired = false;
        for (const num of pencils[r][c]) {
          if (selfPaired.has(num)) {
            hasSelfPaired = true;
            kept.push({ r, c, num });
          } else {
            removals.push({ r, c, num });
          }
        }
        if (!hasSelfPaired) {
          axisHolds = false;
          break;
        }
      }
      if (!axisHolds || removals.length === 0) continue;

      const cellGroups = techniques._gspCellGroups(board, mapping);
      const result = {
        change: true,
        type: "remove",
        cells: removals,
        hint: {
          name: t("teks_GSP"),
          mainInfo: symmetry.dirKey
            ? t("teks_puzzle_is_diagonally_symmetric_in_the_direction", t(symmetry.dirKey))
            : t("teks_puzzle_is_centrally_symmetric"),
          detail: t(
            "teks_cand_s_mapping_in",
            t(symmetry.labelKey),
            techniques._gspMappingText(mapping),
          ),
        },
        visualPlan: techniques._buildGspVisualPlan(
          cellGroups,
          kept,
          removals,
        ),
      };
      if (!findAll) return result;
      results.push(result);
    }

    return findAll ? results : { change: false };
  },

  antiGurthSymmetricalPlacement: (board, pencils, findAll = false) => {
    const results = [];

    for (const key of [
      "diagonal",
      "antiDiagonal",
      "xAxis",
      "yAxis",
      "central",
    ]) {
      const symmetry = techniques._gspSymmetries[key];
      const broken = [];
      const mapping = techniques._gspBuildMapping(
        board,
        symmetry.partner,
        broken,
      );
      if (!mapping || broken.length === 0) continue;

      const empty =
        board[broken[0].r][broken[0].c] === 0 ? broken[0] : broken[1];
      const filled = empty === broken[0] ? broken[1] : broken[0];
      const num = mapping[board[filled.r][filled.c]];
      if (num === 0) continue;

      const selfPaired = techniques._gspSelfPairedDigits(mapping);
      let axisHolds = true;
      let axisRulesOutSymmetry = false;
      for (const [r, c] of symmetry.axis) {
        if (board[r][c] !== 0) {
          if (!selfPaired.has(board[r][c])) {
            axisHolds = false;
            break;
          }
          continue;
        }
        let hasSelfPaired = false;
        for (const candidate of pencils[r][c]) {
          if (selfPaired.has(candidate)) {
            hasSelfPaired = true;
            break;
          }
        }
        if (!hasSelfPaired) axisRulesOutSymmetry = true;
      }
      if (!axisHolds) continue;

      if (selfPaired.size <= symmetry.maxSelfPaired && !axisRulesOutSymmetry) {
        continue;
      }

      if (!pencils[empty.r][empty.c].has(num)) continue;

      const removals = [{ r: empty.r, c: empty.c, num }];
      const cellGroups = techniques._gspCellGroups(board, mapping);
      const result = {
        change: true,
        type: "remove",
        cells: removals,
        hint: {
          name: t("teks_anti_GSP"),
          mainInfo: t("teks_puzzle_cannot_have_symmetry", t(symmetry.labelKey)),
          detail: t(
            "teks_mapping_required_for_symmetry",
            t(symmetry.labelKey),
            techniques._gspMappingText(mapping),
          ),
        },
        visualPlan: techniques._buildGspVisualPlan(cellGroups, [], removals),
      };
      if (!findAll) return result;
      results.push(result);
    }

    return findAll ? results : { change: false };
  },

  bugPlusOne: (board, pencils, findAll = false) => {
    const unsolvedCells = [];
    const bivalueCells = [];
    const trivalueCells = [];

    // Step 1 & 2: Categorize all unsolved cells
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          unsolvedCells.push({ r, c });
          const count = pencils[r][c].size;
          if (count === 2) bivalueCells.push({ r, c });
          else if (count === 3) trivalueCells.push({ r, c });
        }
      }
    }

    // Step 3: Check if the board is in a BUG+1 state
    if (
      trivalueCells.length === 1 &&
      bivalueCells.length === unsolvedCells.length - 1
    ) {
      const { r: r_plus1, c: c_plus1 } = trivalueCells[0];
      const cands = [...pencils[r_plus1][c_plus1]];

      // Step 4: Test each of the 3 candidates in the "+1" cell
      for (const num of cands) {
        // Count occurrences of candidate 'num' in the cell's units
        let rowCount = 0;
        for (let c = 0; c < 9; c++) {
          if (board[r_plus1][c] === 0 && pencils[r_plus1][c].has(num))
            rowCount++;
        }

        let colCount = 0;
        for (let r = 0; r < 9; r++) {
          if (board[r][c_plus1] === 0 && pencils[r][c_plus1].has(num))
            colCount++;
        }

        let boxCount = 0;
        const boxRowStart = Math.floor(r_plus1 / 3) * 3;
        const boxColStart = Math.floor(c_plus1 / 3) * 3;
        for (let ro = 0; ro < 3; ro++) {
          for (let co = 0; co < 3; co++) {
            const r = boxRowStart + ro;
            const c = boxColStart + co;
            if (board[r][c] === 0 && pencils[r][c].has(num)) boxCount++;
          }
        }

        if (rowCount % 2 !== 0 && colCount % 2 !== 0 && boxCount % 2 !== 0) {
          // Identify the candidates to remove (everything that isn't 'num')
          const removals = cands
            .filter((n) => n !== num)
            .map((n) => ({
              r: r_plus1,
              c: c_plus1,
              num: n,
            }));

          return {
            change: true,
            type: "remove",
            cells: removals,
            hint: {
              name: t("teks_BUG_plus_1"),
              mainInfo: t("teks_tri_value_cell_at_r_c", r_plus1 + 1, c_plus1 + 1),
              detail: t("teks_all_digits_appear_exactly_twice_in_all_houses_except_for_r_c", num, r_plus1 + 1, c_plus1 + 1),
            },
            visualPlan: {
              highlight: { digit: null, state: 2 },
              cellColors: [{ r: r_plus1, c: c_plus1, color: 7 }],
              candidateColors: [
                { r: r_plus1, c: c_plus1, num, color: 3 },
              ],
              candidateMarks: removals.map(({ r, c, num: removalNum }) => ({
                r,
                c,
                num: removalNum,
                marker: "slash",
                color: 0,
              })),
            },
          };
        }
      }
    }

    return { change: false };
  },

  bugPlusN: (board, pencils, findAll = false) => {
    const maxTrueCandidates = 5; // BUG+n limit.
    const results = [];
    const emptyCells = [];
    const bivalueCells = [];
    const multivalueCells = [];
    let candidatesCount = 0;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const digits = [...pencils[r][c]].sort((a, b) => a - b);
        if (digits.length < 2) return findAll ? [] : { change: false };
        const cell = { r, c, digits };
        emptyCells.push(cell);
        candidatesCount += digits.length;
        if (digits.length === 2) bivalueCells.push(cell);
        else multivalueCells.push(cell);
      }
    }

    if (
      multivalueCells.length === 0 ||
      candidatesCount > emptyCells.length * 2 + 28
    ) {
      return findAll ? [] : { change: false };
    }

    const boxOf = techniques._getBoxIndex;
    const housesOf = (r, c) => [r, 9 + c, 18 + boxOf(r, c)];
    const sameCell = (a, b) => a.r === b.r && a.c === b.c;
    const sees = (a, b) =>
      a.r === b.r || a.c === b.c || boxOf(a.r, a.c) === boxOf(b.r, b.c);
    const candidatePeers = (a, b) =>
      (sameCell(a, b) && a.num !== b.num) ||
      (a.num === b.num && !sameCell(a, b) && sees(a, b));

    const formatCells = (cells) => {
      const unique = [];
      const seen = new Set();
      for (const cell of cells) {
        const key = `${cell.r},${cell.c}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(cell);
        }
      }
      unique.sort((a, b) => a.r - b.r || a.c - b.c);
      if (unique.length === 0) return "";
      if (unique.every((cell) => cell.r === unique[0].r)) {
        return `r${unique[0].r + 1}c${unique.map((cell) => cell.c + 1).join("")}`;
      }
      if (unique.every((cell) => cell.c === unique[0].c)) {
        return `r${unique.map((cell) => cell.r + 1).join("")}c${unique[0].c + 1}`;
      }
      return unique.map((cell) => `r${cell.r + 1}c${cell.c + 1}`).join(",");
    };
    const formatCandidates = (candidates) => {
      const cellsByDigit = new Map();
      for (const { r, c, num } of candidates) {
        if (!cellsByDigit.has(num)) cellsByDigit.set(num, []);
        cellsByDigit.get(num).push({ r, c });
      }

      const formatByHouse = (num, cells, groupByRow) => {
        const groups = new Map();
        for (const { r, c } of cells) {
          const primary = groupByRow ? r : c;
          const secondary = groupByRow ? c : r;
          if (!groups.has(primary)) groups.set(primary, new Set());
          groups.get(primary).add(secondary);
        }
        return [...groups]
          .sort(([a], [b]) => a - b)
          .map(([primary, secondaries]) => {
            const secondaryText = [...secondaries]
              .sort((a, b) => a - b)
              .map((value) => value + 1)
              .join("");
            return groupByRow
              ? `(${num})r${primary + 1}c${secondaryText}`
              : `(${num})r${secondaryText}c${primary + 1}`;
          })
          .join(",");
      };

      return [...cellsByDigit]
        .sort(([a], [b]) => a - b)
        .map(([num, cells]) => {
          const byRow = formatByHouse(num, cells, true);
          const byCol = formatByHouse(num, cells, false);
          return byRow.length <= byCol.length ? byRow : byCol;
        })
        .join(",");
    };

    // Choose a two-candidate BUG floor for every multi-value cell.
    const houseCounts = Array.from({ length: 10 }, () => new Uint8Array(27));
    for (const cell of bivalueCells) {
      for (const num of cell.digits) {
        for (const house of housesOf(cell.r, cell.c)) {
          if (++houseCounts[num][house] > 2) {
            return findAll ? [] : { change: false };
          }
        }
      }
    }

    const chosenPairs = new Array(multivalueCells.length);
    const chooseFloor = (index) => {
      if (index === multivalueCells.length) return true;
      const cell = multivalueCells[index];
      const houses = housesOf(cell.r, cell.c);
      for (let i = 0; i < cell.digits.length - 1; i++) {
        for (let j = i + 1; j < cell.digits.length; j++) {
          const pair = [cell.digits[i], cell.digits[j]];
          let valid = true;
          for (const num of pair) {
            for (const house of houses) {
              if (houseCounts[num][house] >= 2) valid = false;
            }
          }
          if (!valid) continue;
          for (const num of pair) {
            for (const house of houses) houseCounts[num][house]++;
          }
          chosenPairs[index] = pair;
          if (chooseFloor(index + 1)) return true;
          for (const num of pair) {
            for (const house of houses) houseCounts[num][house]--;
          }
        }
      }
      return false;
    };

    if (!chooseFloor(0)) return findAll ? [] : { change: false };

    const trueCandidates = [];
    for (let i = 0; i < multivalueCells.length; i++) {
      const cell = multivalueCells[i];
      const floorPair = new Set(chosenPairs[i]);
      for (const num of cell.digits) {
        if (!floorPair.has(num))
          trueCandidates.push({ r: cell.r, c: cell.c, num });
      }
    }
    if (trueCandidates.length < 2) return findAll ? [] : { change: false };
    const guardiansStr = formatCandidates(trueCandidates);

    const makeVisualPlan = (removals, extra = {}) => {
      const conjugate = extra.conjugate;
      return {
        highlight: {
          digit: conjugate ? conjugate.num : null,
          state: conjugate ? 1 : 2,
        },
        cellColors: [
          ...trueCandidates.map(({ r, c }) => ({ r, c, color: 7 })),
          ...(extra.subsetCells || []).map(({ r, c }) => ({ r, c, color: 6 })),
        ],
        candidateColors: [
          ...trueCandidates.map(({ r, c, num }) => ({
            r,
            c,
            num,
            color: 3,
          })),
          ...(extra.subsetCells || []).flatMap(({ r, c, digits }) =>
            digits.map((num) => ({ r, c, num, color: 4 })),
          ),
          ...(conjugate
            ? [
                {
                  r: conjugate.cell1.r,
                  c: conjugate.cell1.c,
                  num: conjugate.num,
                  color: 4,
                },
                {
                  r: conjugate.cell2.r,
                  c: conjugate.cell2.c,
                  num: conjugate.num,
                  color: 4,
                },
              ]
            : []),
        ],
        candidateMarks: removals.map(({ r, c, num }) => ({
          r,
          c,
          num,
          marker: "slash",
          color: 0,
        })),
        links: conjugate
          ? [
              {
                r1: conjugate.cell1.r,
                c1: conjugate.cell1.c,
                n1: conjugate.num,
                r2: conjugate.cell2.r,
                c2: conjugate.cell2.c,
                n2: conjugate.num,
                color: 0,
                style: "solid",
              },
            ]
          : [],
      };
    };

    const addResult = (name, detail, removals, extra = {}) => {
      const uniqueRemovals = _getUniqueRemovals(removals);
      if (uniqueRemovals.length === 0) return null;
      const result = {
        change: true,
        type: "remove",
        cells: uniqueRemovals,
        hint: {
          name,
          mainInfo: t("teks_BUG_type_2_guardians", guardiansStr),
          detail,
        },
        visualPlan: makeVisualPlan(uniqueRemovals, extra),
      };
      if (!findAll) return result;
      results.push(result);
      return null;
    };

    const trueCandidateCells = [];
    const trueDigitsByCell = new Map();
    for (const candidate of trueCandidates) {
      const key = candidate.r * 9 + candidate.c;
      if (!trueDigitsByCell.has(key)) {
        trueDigitsByCell.set(key, new Set());
        trueCandidateCells.push({ r: candidate.r, c: candidate.c });
      }
      trueDigitsByCell.get(key).add(candidate.num);
    }

    // Type 2.
    if (
      trueCandidates.every(
        (candidate) => candidate.num === trueCandidates[0].num,
      )
    ) {
      const num = trueCandidates[0].num;
      const removals = [];
      for (const cell of emptyCells) {
        if (
          !trueCandidateCells.some((candidateCell) =>
            sameCell(cell, candidateCell),
          ) &&
          cell.digits.includes(num) &&
          trueCandidateCells.every((candidateCell) => sees(cell, candidateCell))
        ) {
          removals.push({ r: cell.r, c: cell.c, num });
        }
      }
      const result = addResult(
        t("teks_BUG_type_2"),
        t("teks_BUG_type_3_guardians", guardiansStr),
        removals,
      );
      if (result) return result;
      return findAll ? results : { change: false };
    }

    // BUG + n.
    if (trueCandidates.length <= maxTrueCandidates) {
      const removals = [];
      for (const cell of emptyCells) {
        for (const num of cell.digits) {
          const candidate = { r: cell.r, c: cell.c, num };
          if (
            trueCandidates.every((trueCandidate) =>
              candidatePeers(candidate, trueCandidate),
            )
          ) {
            removals.push(candidate);
          }
        }
      }
      const result = addResult(
        t("teks_BUG_plus", trueCandidates.length),
        t("teks_BUG_plus_n_guardians", guardiansStr),
        removals,
      );
      if (result) return result;
    }

    const sharedHouses = (cells) => {
      if (cells.length === 0) return [];
      return housesOf(cells[0].r, cells[0].c).filter((house) =>
        cells.every((cell) => housesOf(cell.r, cell.c).includes(house)),
      );
    };

    // Type 3.
    const trueDigits = new Set(
      trueCandidates.map((candidate) => candidate.num),
    );
    for (const house of sharedHouses(trueCandidateCells)) {
      const houseType = house < 9 ? "row" : house < 18 ? "col" : "box";
      const houseIndex =
        house < 9 ? house : house < 18 ? house - 9 : house - 18;
      const otherCells = techniques
        ._getUnitCells(houseType, houseIndex)
        .filter(
          ([r, c]) =>
            board[r][c] === 0 &&
            !trueCandidateCells.some((cell) => cell.r === r && cell.c === c),
        )
        .map(([r, c]) => ({
          r,
          c,
          digits: [...pencils[r][c]].sort((a, b) => a - b),
        }));

      for (let size = 1; size < otherCells.length; size++) {
        for (const subsetCells of techniques.combinations(otherCells, size)) {
          const subsetDigits = new Set(trueDigits);
          for (const cell of subsetCells) {
            for (const num of cell.digits) subsetDigits.add(num);
          }
          if (subsetDigits.size !== size + 1) continue;
          const subsetKeys = new Set(
            subsetCells.map((cell) => cell.r * 9 + cell.c),
          );
          const removals = [];
          for (const cell of otherCells) {
            if (subsetKeys.has(cell.r * 9 + cell.c)) continue;
            for (const num of subsetDigits) {
              if (cell.digits.includes(num))
                removals.push({ r: cell.r, c: cell.c, num });
            }
          }
          const result = addResult(
            t("teks_BUG_type_3"),
            t(
              "teks_BUG_type_3_VNS_detail",
              guardiansStr,
              [...subsetDigits].sort((a, b) => a - b).join(""),
              formatCells(subsetCells),
            ),
            removals,
            { subsetCells },
          );
          if (result) return result;
        }
      }
    }

    // Type 4.
    if (trueCandidateCells.length === 2) {
      const [cell1, cell2] = trueCandidateCells;
      for (const house of sharedHouses(trueCandidateCells)) {
        const houseType = house < 9 ? "row" : house < 18 ? "col" : "box";
        const houseIndex =
          house < 9 ? house : house < 18 ? house - 9 : house - 18;
        const unitCells = techniques._getUnitCells(houseType, houseIndex);
        for (let num = 1; num <= 9; num++) {
          if (trueDigits.has(num)) continue;
          const positions = unitCells.filter(
            ([r, c]) => board[r][c] === 0 && pencils[r][c].has(num),
          );
          if (
            positions.length !== 2 ||
            !positions.some(([r, c]) => r === cell1.r && c === cell1.c) ||
            !positions.some(([r, c]) => r === cell2.r && c === cell2.c)
          ) {
            continue;
          }
          const removals = [];
          for (const cell of [cell1, cell2]) {
            const cellTrueDigits = trueDigitsByCell.get(cell.r * 9 + cell.c);
            for (const digit of pencils[cell.r][cell.c]) {
              if (digit !== num && !cellTrueDigits.has(digit)) {
                removals.push({ r: cell.r, c: cell.c, num: digit });
              }
            }
          }
          const result = addResult(
            t("teks_BUG_type_4"),
            t("teks_BUG_type_4_ConPair_detail", guardiansStr, num, formatCells([cell1, cell2])),
            removals,
            { conjugate: { cell1, cell2, num } },
          );
          if (result) return result;
        }
      }
    }

    return findAll ? results : { change: false };
  },

});
