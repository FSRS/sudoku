Object.assign(techniques, {

  // Helper: Convert cell coordinates and digit into a unique 0-728 ID
  _getCandId: (r, c, n) => (r * 9 + c) * 9 + (n - 1),

  // Helper: Parse the 0-728 ID back into { r, c, n }
  _parseCandId: (id) => {
    const cellIdx = Math.floor(id / 9);
    return { r: Math.floor(cellIdx / 9), c: cellIdx % 9, n: (id % 9) + 1 };
  },

  // Helper: Build the bi-directional graph of strong links
  _buildColoringGraph: (pencils, singleDigit = null) => {
    const graph = Array.from({ length: 729 }, () => []);
    const addLink = (id1, id2) => {
      graph[id1].push(id2);
      graph[id2].push(id1);
    };
    const getCandId = techniques._getCandId;

    // 1. Strong Links (Conjugate Pairs in Units)
    const startD = singleDigit || 1;
    const endD = singleDigit || 9;

    for (let d = startD; d <= endD; d++) {
      for (let i = 0; i < 27; i++) {
        let unitType = i < 9 ? "row" : i < 18 ? "col" : "box";
        let idx = i < 9 ? i : i < 18 ? i - 9 : i - 18;
        const cells = techniques
          ._getUnitCells(unitType, idx)
          .filter(([r, c]) => pencils[r][c].has(d));

        // If exactly two candidates of digit 'd' exist in this unit, they form a strong link
        if (cells.length === 2) {
          addLink(
            getCandId(cells[0][0], cells[0][1], d),
            getCandId(cells[1][0], cells[1][1], d),
          );
        }
      }
    }

    // 2. Bivalue Cells (Strong Links between diff candidates in the same cell)
    // Applied ONLY for 3D Medusa (when singleDigit is null)
    if (singleDigit === null) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (pencils[r][c].size === 2) {
            const [d1, d2] = [...pencils[r][c]];
            addLink(getCandId(r, c, d1), getCandId(r, c, d2));
          }
        }
      }
    }

    return graph;
  },

  // Helper: Validates a colored component against coloring rules and finds eliminations
  _applyColoringRules: (
    componentNodes,
    coloring,
    pencils,
    board,
    isSimpleColoring,
  ) => {
    const parseCandId = techniques._parseCandId;
    const getCandId = techniques._getCandId;
    const bitFor = techniques._bits.bitFor;

    // Returns formatted elimination context based on the violated rule
    const eliminateColor = (targetColor, rule, data) => {
      const output = [];
      for (const id of componentNodes) {
        if (coloring[id] === targetColor) {
          const { r, c, n } = parseCandId(id);
          output.push({ r, c, num: n });
        }
      }
      return { removals: output, rule, targetColor, data };
    };

    // Arrays to track what each color 'sees' and occupies
    const killedMasks = [null, new Int32Array(81), new Int32Array(81)];
    const cellColors = new Int8Array(81).fill(0);
    const cellHasColor1 = new Int8Array(81).fill(0);
    const cellHasColor2 = new Int8Array(81).fill(0);

    for (const id of componentNodes) {
      const color = coloring[id];
      const { r, c, n } = parseCandId(id);
      const cellId = r * 9 + c;
      const digitBit = bitFor(n);

      // --- Rule A: Invalid Color (Color appears twice in the same cell) ---
      if (!isSimpleColoring) {
        if (color === 1) {
          if (cellHasColor1[cellId])
            return eliminateColor(1, "A_Cell", { r, c });
          cellHasColor1[cellId] = 1;
        } else if (color === 2) {
          if (cellHasColor2[cellId])
            return eliminateColor(2, "A_Cell", { r, c });
          cellHasColor2[cellId] = 1;
        }
      }

      cellColors[cellId] |= color;

      // Update killed masks using the BigInt PEER_MAP
      let pm = PEER_MAP[cellId];
      let idx = 0;
      while (pm !== 0n) {
        if (pm & 1n) killedMasks[color][idx] |= digitBit;
        pm >>= 1n;
        idx++;
      }
    }

    // --- Rule A: Invalid Color (Color sees itself via Peers) ---
    for (const id of componentNodes) {
      const color = coloring[id];
      const { r, c, n } = parseCandId(id);
      const cellId = r * 9 + c;
      const digitBit = bitFor(n);

      if ((killedMasks[color][cellId] & digitBit) !== 0) {
        return eliminateColor(color, "A_Peer", { r, c, n });
      }
    }

    if (!isSimpleColoring) {
      // --- Rule B: Bad Color (Color empties a cell entirely) ---
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (board[r][c] !== 0) continue;
          const cellIdx = r * 9 + c;

          let cellMask = 0;
          for (const d of pencils[r][c]) cellMask |= bitFor(d);
          if (cellMask === 0) continue;

          // If a color eliminates all possible candidates in a cell, that color is false
          if ((cellMask & ~killedMasks[1][cellIdx]) === 0)
            return eliminateColor(1, "B_Cell", { r, c });
          if ((cellMask & ~killedMasks[2][cellIdx]) === 0)
            return eliminateColor(2, "B_Cell", { r, c });
        }
      }

      // --- Rule B: Bad Color (Color empties a house of a specific digit) ---
      for (let i = 0; i < 27; i++) {
        let unitType = i < 9 ? "row" : i < 18 ? "col" : "box";
        let idx = i < 9 ? i : i < 18 ? i - 9 : i - 18;
        const cells = techniques._getUnitCells(unitType, idx);

        for (let d = 1; d <= 9; d++) {
          const dBit = bitFor(d);
          let hasD = false;
          let c1KillsAll = true;
          let c2KillsAll = true;

          for (const [hr, hc] of cells) {
            if (board[hr][hc] !== 0 || !pencils[hr][hc].has(d)) continue;
            hasD = true;
            const hCellId = hr * 9 + hc;

            const c1PlacesOther =
              cellColors[hCellId] & 1 && coloring[getCandId(hr, hc, d)] !== 1;
            const c1SeesD = (killedMasks[1][hCellId] & dBit) !== 0;
            if (!c1PlacesOther && !c1SeesD) c1KillsAll = false;

            const c2PlacesOther =
              cellColors[hCellId] & 2 && coloring[getCandId(hr, hc, d)] !== 2;
            const c2SeesD = (killedMasks[2][hCellId] & dBit) !== 0;
            if (!c2PlacesOther && !c2SeesD) c2KillsAll = false;
          }

          if (hasD) {
            if (c1KillsAll)
              return eliminateColor(1, "B_House", { unitType, idx, d });
            if (c2KillsAll)
              return eliminateColor(2, "B_House", { unitType, idx, d });
          }
        }
      }
    }

    // --- Rule C: Color Trap (Eliminations generated by BOTH colors) ---
    const removals = [];
    const trapDetails = [];

    const findSource = (targetR, targetC, targetN, targetColor) => {
      for (const id of componentNodes) {
        if (coloring[id] !== targetColor) continue;
        const { r, c, n } = parseCandId(id);
        // Source from within the cell (Medusa only)
        if (r === targetR && c === targetC && n !== targetN)
          return `(${n})r${r + 1}c${c + 1}`;
        // Source from peers
        if (
          n === targetN &&
          (r === targetR ||
            c === targetC ||
            (Math.floor(r / 3) === Math.floor(targetR / 3) &&
              Math.floor(c / 3) === Math.floor(targetC / 3)))
        ) {
          return `(${n})r${r + 1}c${c + 1}`;
        }
      }
      return null;
    };

    const addTrap = (r, c, d) => {
      removals.push({ r, c, num: d });
      trapDetails.push({
        r,
        c,
        num: d,
        c1Source: findSource(r, c, d, 1),
        c2Source: findSource(r, c, d, 2),
      });
    };

    if (!isSimpleColoring) {
      // Cell contains both colors for different digits, trapping uncolored candidates
      for (let i = 0; i < 81; i++) {
        if (cellColors[i] === 3) {
          const r = Math.floor(i / 9);
          const c = i % 9;
          for (const cand of pencils[r][c]) {
            if (coloring[getCandId(r, c, cand)] === 0) addTrap(r, c, cand);
          }
        }
      }
    }

    // Candidate sees both colors, trapping it (Twice-seen or seen + intra-cell colored)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const cellIdx = r * 9 + c;

        for (const d of pencils[r][c]) {
          if (coloring[getCandId(r, c, d)] !== 0) continue;

          const dBit = bitFor(d);
          const seesC1 = (killedMasks[1][cellIdx] & dBit) !== 0;
          const seesC2 = (killedMasks[2][cellIdx] & dBit) !== 0;

          if (seesC1 && seesC2) {
            addTrap(r, c, d);
            continue;
          }

          if (!isSimpleColoring) {
            if (seesC1 && cellColors[cellIdx] & 2) addTrap(r, c, d);
            else if (seesC2 && cellColors[cellIdx] & 1) addTrap(r, c, d);
          }
        }
      }
    }

    if (removals.length > 0) return { removals, rule: "C", trapDetails };
    return { removals: [] };
  },

  // Helper: Handles BFS clustering and delegates rule checking
  _solveColoring: (board, pencils, singleDigit = null, findAll = false) => {
    const results = [];
    const graph = techniques._buildColoringGraph(pencils, singleDigit);
    const visited = new Int8Array(729).fill(0);
    const coloring = new Int8Array(729).fill(0); // 0=None, 1=ColorA, 2=ColorB

    for (let startId = 0; startId < 729; startId++) {
      if (graph[startId].length === 0 || visited[startId]) continue;

      const component = [];
      const queue = [startId];
      visited[startId] = 1;
      coloring[startId] = 1;
      component.push(startId);

      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        const currColor = coloring[curr];
        const nextColor = 3 - currColor;

        for (const neighbor of graph[curr]) {
          if (coloring[neighbor] === 0) {
            coloring[neighbor] = nextColor;
            visited[neighbor] = 1;
            component.push(neighbor);
            queue.push(neighbor);
          }
        }
      }

      // Check the finalized component for logical eliminations
      const result = techniques._applyColoringRules(
        component,
        coloring,
        pencils,
        board,
        singleDigit !== null,
      );

      if (result.removals && result.removals.length > 0) {
        const uniqueElims = _getUniqueRemovals(result.removals);

        if (uniqueElims.length > 0) {
          const name =
            singleDigit !== null ? t("teks_msg_166") : t("teks_msg_167");
          const startCand = techniques._parseCandId(startId);
          const info =
            singleDigit !== null
              ? t("teks_msg_168", singleDigit)
              : t(
                  "teks_msg_169",
                  startCand.n,
                  startCand.r + 1,
                  startCand.c + 1,
                );

          let detail = t(
            "teks_msg_170",
            startCand.n,
            startCand.r + 1,
            startCand.c + 1,
          );

          if (result.rule === "A_Cell") {
            detail += t(
              "teks_msg_171",
              result.targetColor,
              result.data.r + 1,
              result.data.c + 1,
            );
          } else if (result.rule === "A_Peer") {
            detail += t(
              "teks_msg_172",
              result.data.n,
              result.targetColor,
              result.data.r + 1,
              result.data.c + 1,
            );
          } else if (result.rule === "B_Cell") {
            detail += t(
              "teks_msg_173",
              result.data.r + 1,
              result.data.c + 1,
              result.targetColor,
            );
          } else if (result.rule === "B_House") {
            const uType = result.data.unitType;
            const uName =
              uType === "row"
                ? t("teks_msg_174", result.data.idx + 1)
                : uType === "col"
                  ? t("teks_msg_175", result.data.idx + 1)
                  : t("teks_msg_176", result.data.idx + 1);
            detail += t(
              "teks_msg_177",
              result.targetColor,
              uName,
              result.data.d,
            );
          } else if (result.rule === "C") {
            const c1Sources = new Set();
            const c2Sources = new Set();
            for (const t of result.trapDetails) {
              if (t.c1Source) c1Sources.add(t.c1Source);
              if (t.c2Source) c2Sources.add(t.c2Source);
            }
            const c1Str =
              c1Sources.size > 0
                ? t("teks_msg_178", Array.from(c1Sources).join(", "))
                : "";
            const c2Str =
              c2Sources.size > 0
                ? t("teks_msg_179", Array.from(c2Sources).join(", "))
                : "";
            const sources = [c1Str, c2Str].filter(Boolean).join(", ");
            detail += t("teks_msg_180", sources);
          }

          const cellColors = [];
          const candidateColors = [];
          for (const id of component) {
            const { r, c, n } = techniques._parseCandId(id);
            const colorVal = coloring[id];
            if (singleDigit !== null) {
              cellColors.push({
                r,
                c,
                color: colorVal === 1 ? 6 : 7,
                mode: "add",
              });
            }
            if (pencils[r][c].has(n)) {
              candidateColors.push({
                r,
                c,
                num: n,
                color: colorVal === 1 ? 4 : 5,
                mode: "add",
              });
            }
          }

          const links = [];
          if (result.rule === "B_Cell") {
            const { r, c } = result.data;
            cellColors.push({ r, c, color: 1, mode: "add" });
            for (const d of pencils[r][c]) {
              let foundSource = null;
              for (const id of component) {
                if (coloring[id] !== result.targetColor) continue;
                const source = techniques._parseCandId(id);
                if (source.r === r && source.c === c && source.n !== d) {
                  foundSource = source;
                  break;
                }
                if (
                  source.n === d &&
                  (source.r === r ||
                    source.c === c ||
                    (Math.floor(source.r / 3) === Math.floor(r / 3) &&
                      Math.floor(source.c / 3) === Math.floor(c / 3)))
                ) {
                  foundSource = source;
                  break;
                }
              }
              if (foundSource) {
                links.push({
                  r1: r,
                  c1: c,
                  n1: d,
                  r2: foundSource.r,
                  c2: foundSource.c,
                  n2: foundSource.n,
                  color: 1,
                  style: "dash",
                });
              }
            }
          } else if (result.rule === "B_House") {
            for (const [r, c] of techniques._getUnitCells(
              result.data.unitType,
              result.data.idx,
            )) {
              cellColors.push({ r, c, color: 1, mode: "add" });
            }
          }

          const resObj = {
            change: true,
            type: "remove",
            cells: uniqueElims,
            hint: { name, mainInfo: info, detail },
            visualPlan: {
              highlight: {
                digit: singleDigit,
                state: singleDigit !== null ? 1 : 2,
              },
              cellColors,
              candidateColors,
              candidateMarks: uniqueElims.map(({ r, c, num }) => ({
                r,
                c,
                num,
                marker: "slash",
                color: 0,
              })),
              links,
            },
          };

          if (!findAll) return resObj;
          results.push(resObj);
        }
      }

      // Cleanup local coloring for the next BFS component start point
      for (const id of component) coloring[id] = 0;
    }

    return findAll ? results : { change: false };
  },

  // --- Exposed Handlers ---

  simpleColoring: (board, pencils, findAll = false) => {
    const results = [];
    for (let d = 1; d <= 9; d++) {
      const res = techniques._solveColoring(board, pencils, d, findAll);
      if (!findAll) {
        if (res.change) return res;
      } else {
        if (res.length > 0) results.push(...res);
      }
    }
    return findAll ? results : { change: false };
  },

  medusa3D: (board, pencils, findAll = false) => {
    return techniques._solveColoring(board, pencils, null, findAll);
  },

});
