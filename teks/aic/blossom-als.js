Object.assign(techniques, {
  _calculateALSHash: (cells) => {
    if (cells.length === 0) return 0;

    // Sort to ensure consistency, though inputs are usually sorted by unit generation
    // We strictly follow the C++ priority: Row > Col > Box

    // Check Row
    const r0 = cells[0][0];
    const isRow = cells.every((c) => c[0] === r0);
    if (isRow) {
      let mask = 0;
      for (const [r, c] of cells) mask |= 1 << c;
      // Type 00 (Row) | Unit Index | Cell Mask
      return (0 << 13) | (r0 << 9) | mask;
    }

    // Check Col
    const c0 = cells[0][1];
    const isCol = cells.every((c) => c[1] === c0);
    if (isCol) {
      let mask = 0;
      for (const [r, c] of cells) mask |= 1 << r;
      // Type 01 (Col) | Unit Index | Cell Mask
      return (1 << 13) | (c0 << 9) | mask;
    }

    // Assume Box (valid ALSs must belong to *some* unit)
    const b0 = techniques._getBoxIndex(cells[0][0], cells[0][1]);
    let mask = 0;
    for (const [r, c] of cells) {
      const boxCellIdx = (r % 3) * 3 + (c % 3);
      mask |= 1 << boxCellIdx;
    }
    // Type 10 (Box) | Unit Index | Cell Mask
    return (2 << 13) | (b0 << 9) | mask;
  },

  _collectAllALS: (board, pencils, minSize = 1, maxSize = 8) => {
    const uniqueALS = new Map();
    const unitTypes = [
      { name: "box", label: t("teks_msg_7") },
      { name: "row", label: t("teks_msg_14") },
      { name: "col", label: t("teks_msg_15") },
    ];

    for (const { name, label } of unitTypes) {
      for (let i = 0; i < 9; i++) {
        const unitCells = techniques._getUnitCells(name, i);
        const emptyCells = unitCells.filter(([r, c]) => board[r][c] === 0);
        const n = emptyCells.length;
        if (n === 0) continue;

        const effectiveMaxSize = Math.min(maxSize, n - 1);
        const nakedSubsets = [];

        for (let mask = 1; mask < 1 << n; mask++) {
          const size = techniques._bits.popcount(mask);
          if (size > 1 && size < n) {
            let candMask = 0;
            for (let bit = 0; bit < n; bit++) {
              if (mask & (1 << bit)) {
                const [r, c] = emptyCells[bit];
                candMask |= techniques._bits.maskFromSet(pencils[r][c]);
              }
            }
            if (techniques._bits.popcount(candMask) === size) {
              nakedSubsets.push(mask);
            }
          }
        }

        const tainted = new Set();
        for (const ns of nakedSubsets) {
          let sup = ns;
          const limit = 1 << n;
          while (sup < limit) {
            tainted.add(sup);
            sup = (sup + 1) | ns;
          }
        }

        for (let mask = 1; mask < 1 << n; mask++) {
          const k = techniques._bits.popcount(mask);
          if (k < minSize || k > effectiveMaxSize) continue;
          if (tainted.has(mask)) continue;

          if (name !== "box" && k > 1) {
            let firstBox = -1;
            let confined = true;
            for (let bit = 0; bit < n; bit++) {
              if (mask & (1 << bit)) {
                const [r, c] = emptyCells[bit];
                const b = techniques._getBoxIndex(r, c);
                if (firstBox === -1) firstBox = b;
                else if (firstBox !== b) {
                  confined = false;
                  break;
                }
              }
            }
            if (confined) continue;
          }

          let currentMask = 0;
          for (let bit = 0; bit < n; bit++) {
            if (mask & (1 << bit)) {
              const [r, c] = emptyCells[bit];
              currentMask |= techniques._bits.maskFromSet(pencils[r][c]);
            }
          }

          if (techniques._bits.popcount(currentMask) === k + 1) {
            const currentCells = [];
            for (let bit = 0; bit < n; bit++) {
              if (mask & (1 << bit)) currentCells.push(emptyCells[bit]);
            }

            // Updated to 3x27 bitsets format
            const positions = [0, 0, 0];
            const candidatePositions = Array.from({ length: 9 }, () => [
              0, 0, 0,
            ]);
            const candMap = {};

            for (const [r, c] of currentCells) {
              const id = r * 9 + c;
              const part = Math.floor(id / 27);
              const bitPos = id % 27;

              positions[part] |= 1 << bitPos;

              for (const d of pencils[r][c]) {
                candidatePositions[d - 1][part] |= 1 << bitPos;
                if (!candMap[d]) candMap[d] = [];
                candMap[d].push([r, c]);
              }
            }

            const hash = techniques._calculateALSHash(currentCells);
            if (!uniqueALS.has(hash)) {
              uniqueALS.set(hash, {
                cells: currentCells,
                candidates: currentMask,
                mask: currentMask,
                size: k,
                candMap: candMap,
                unitType: name,
                unitIndex: i,
                unitName: t("teks_msg_17", label, i + 1),
                hash: hash,
                positions: positions,
                candidatePositions: candidatePositions,
              });
            }
          }
        }
      }
    }

    alses = Array.from(uniqueALS.values()).sort((a, b) => a.hash - b.hash);
    return alses;
  },
});
