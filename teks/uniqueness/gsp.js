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

});
