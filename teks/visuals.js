Object.assign(techniques, {
  _applyVisualPlan: (plan) => {
    if (!plan) return false;

    if (plan.highlight) {
      highlightedDigit = plan.highlight.digit;
      highlightState = plan.highlight.state;
    }

    for (const { r, c, color, mode } of plan.cellColors || []) {
      if (mode === "add") {
        window.addCellColor(r, c, cellColorPalette[color]);
      } else {
        boardState[r][c].cellColor = cellColorPalette[color];
      }
    }

    for (const { r, c, num, color, mode } of plan.candidateColors || []) {
      if (mode === "add") {
        window.addCandidateColor(r, c, num, candidateColorPalette[color]);
      } else {
        boardState[r][c].pencilColors.set(num, candidateColorPalette[color]);
      }
    }

    for (const { r, c, num, marker, color } of plan.candidateMarks || []) {
      const target =
        marker === "circle"
          ? boardState[r][c].candCircles
          : boardState[r][c].candSlashes;
      target.set(num, markColorPalette[color]);
    }

    for (const link of plan.links || []) {
      drawnLines.push({
        ...link,
        color: lineColorPalette[link.color],
      });
    }

    return true;
  },

  _applyResultVisuals: (result) =>
    techniques._applyVisualPlan(result?.visualPlan),

  _buildSingleDigitChainVisualPlan: (
    digit,
    nodes,
    removals,
    grouped = false,
  ) => {
    const links = [];
    const drawGroup = (node, index) => {
      if (!grouped || node.cells.length <= 1) return;
      const colorIndex = index % 2 === 0 ? 5 : 4;
      for (let i = 0; i < node.cells.length - 1; i++) {
        links.push({
          r1: node.cells[i][0],
          c1: node.cells[i][1],
          n1: digit,
          r2: node.cells[i + 1][0],
          c2: node.cells[i + 1][1],
          n2: digit,
          color: colorIndex,
          style: "solid",
        });
      }
    };

    const closestCells = (left, right) => {
      let minimum = Infinity;
      let bestLeft = left.cells[0];
      let bestRight = right.cells[0];
      for (const leftCell of left.cells) {
        for (const rightCell of right.cells) {
          const distance =
            Math.abs(leftCell[0] - rightCell[0]) +
            Math.abs(leftCell[1] - rightCell[1]);
          if (distance < minimum) {
            minimum = distance;
            bestLeft = leftCell;
            bestRight = rightCell;
          }
        }
      }
      return [bestLeft, bestRight];
    };

    for (let i = 0; i < nodes.length - 1; i++) {
      const left = nodes[i];
      const right = nodes[i + 1];
      if (i === 0) drawGroup(left, 0);
      drawGroup(right, i + 1);
      const [from, to] = grouped
        ? closestCells(left, right)
        : [left.cells[0], right.cells[0]];
      links.push({
        r1: from[0],
        c1: from[1],
        n1: digit,
        r2: to[0],
        c2: to[1],
        n2: digit,
        color: 0,
        style: i % 2 === 0 ? "solid" : "dash",
      });
    }

    return {
      highlight: { digit, state: 1 },
      candidateColors: nodes.flatMap((node, index) =>
        node.cells.map(([r, c]) => ({
          r,
          c,
          num: digit,
          color: index % 2 === 0 ? 5 : 4,
        })),
      ),
      candidateMarks: removals.map(({ r, c, num }) => ({
        r,
        c,
        num,
        marker: "slash",
        color: 0,
      })),
      links,
    };
  },

  _applySingleDigitChainVisuals: (digit, nodes, removals, grouped = false) => {
    techniques._applyVisualPlan(
      techniques._buildSingleDigitChainVisualPlan(
        digit,
        nodes,
        removals,
        grouped,
      ),
    );
  },

  _buildDeadlyPatternBaseVisualPlan: (
    type,
    cells,
    digits,
    extraData,
    sourcePencils,
  ) => {
    const coreDigits = new Set(digits);
    const placedIds = new Set(
      (extraData.placedCells || []).map(([r, c]) => r * 9 + c),
    );
    const cellColors = cells.map(([r, c]) => ({
      r,
      c,
      color: placedIds.has(r * 9 + c) ? 6 : 7,
    }));
    const candidateColors = cells.flatMap(([r, c]) =>
      Array.from(sourcePencils[r][c], (num) => ({
        r,
        c,
        num,
        color: coreDigits.has(num) ? 7 : 3,
      })),
    );
    const links = [];

    if (type === 3) {
      for (const [r, c] of extraData.subsetCells) {
        cellColors.push({ r, c, color: placedIds.size > 0 ? 5 : 6 });
        for (const num of sourcePencils[r][c]) {
          if (extraData.subsetCands.has(num)) {
            candidateColors.push({ r, c, num, color: 4 });
          }
        }
      }
    }

    if (type === 4) {
      links.push({
        r1: extraData.e1[0],
        c1: extraData.e1[1],
        n1: extraData.restrictedDigit,
        r2: extraData.e2[0],
        c2: extraData.e2[1],
        n2: extraData.restrictedDigit,
        color: 0,
        style: "solid",
      });
    }

    return {
      highlight: {
        digit:
          type === 4 || type === 6 ? extraData.restrictedDigit : null,
        state: type === 4 || type === 6 ? 1 : 0,
      },
      cellColors,
      candidateColors,
      links,
    };
  },

  _applyDeadlyPatternBaseVisuals: (type, cells, digits, extraData) => {
    const sourcePencils = boardState.map((row) =>
      row.map((cell) => cell.pencils),
    );
    techniques._applyVisualPlan(
      techniques._buildDeadlyPatternBaseVisualPlan(
        type,
        cells,
        digits,
        extraData,
        sourcePencils,
      ),
    );
  },

});
