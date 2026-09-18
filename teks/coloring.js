// --- Unified Coloring / Medusa Helper ---
const COLORING_BUF = {
  killed1: new Int32Array(81),
  killed2: new Int32Array(81),
  cellColors: new Int8Array(81),
  cellHasColor1: new Int8Array(81),
  cellHasColor2: new Int8Array(81),
};

Object.assign(techniques, {

  // Helper: Parse the 0-728 ID back into { r, c, n }
  _parseCandId: (id) => {
    const cellIdx = Math.floor(id / 9);
    return { r: Math.floor(cellIdx / 9), c: cellIdx % 9, n: (id % 9) + 1 };
  },

  _buildColoringGraph: (pencils, singleDigit = null, grid = null) => {
    const g = grid || buildGrid(pencils);
    const adj = new Int16Array(729 * 4);
    const deg = new Uint8Array(729);
    const addLink = (id1, id2) => {
      adj[id1 * 4 + deg[id1]++] = id2;
      adj[id2 * 4 + deg[id2]++] = id1;
    };

    const startK = singleDigit ? singleDigit - 1 : 0;
    const endK = singleDigit ? singleDigit - 1 : 8;

    for (let k = startK; k <= endK; k++) {
      for (let u = 0; u < 27; u++) {
        const m =
          u < 9
            ? g.row[k * 9 + u]
            : u < 18
              ? g.col[k * 9 + u - 9]
              : g.box[k * 9 + u - 18];
        if (pop(m) !== 2) continue;
        const ids = UNIT_IDS[u];
        addLink(ids[lowest(m)] * 9 + k, ids[lowest(m & (m - 1))] * 9 + k);
      }
    }

    if (singleDigit === null) {
      for (let id = 0; id < 81; id++) {
        const cm = g.cand[id];
        if (pop(cm) !== 2) continue;
        addLink(id * 9 + lowest(cm), id * 9 + lowest(cm & (cm - 1)));
      }
    }

    return { adj, deg };
  },

  _applyColoringRules: (
    componentNodes,
    coloring,
    pencils,
    board,
    isSimpleColoring,
    grid = null,
  ) => {
    const g = grid || buildGrid(pencils);
    const parseCandId = techniques._parseCandId;
    const bitFor = techniques._bits.bitFor;

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

    const killed1 = COLORING_BUF.killed1.fill(0);
    const killed2 = COLORING_BUF.killed2.fill(0);
    const killedMasks = [null, killed1, killed2];
    const cellColors = COLORING_BUF.cellColors.fill(0);
    const cellHasColor1 = COLORING_BUF.cellHasColor1.fill(0);
    const cellHasColor2 = COLORING_BUF.cellHasColor2.fill(0);

    for (const id of componentNodes) {
      const color = coloring[id];
      const cellId = (id / 9) | 0;
      const digitBit = bitFor((id % 9) + 1);

      // --- Rule A: Invalid Color (Color appears twice in the same cell) ---
      if (!isSimpleColoring) {
        const r = (cellId / 9) | 0;
        const c = cellId % 9;
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

      const killed = killedMasks[color];
      for (let part = 0; part < 3; part++) {
        let m = PEER[cellId * 3 + part];
        const base = part * 27;
        while (m) {
          killed[base + lowest(m)] |= digitBit;
          m &= m - 1;
        }
      }
    }

    // --- Rule A: Invalid Color (Color sees itself via Peers) ---
    for (const id of componentNodes) {
      const color = coloring[id];
      const cellId = (id / 9) | 0;
      const n = (id % 9) + 1;

      if ((killedMasks[color][cellId] & bitFor(n)) !== 0) {
        return eliminateColor(color, "A_Peer", {
          r: (cellId / 9) | 0,
          c: cellId % 9,
          n,
        });
      }
    }

    if (!isSimpleColoring) {
      // --- Rule B: Bad Color (Color empties a cell entirely) ---
      for (let cellIdx = 0; cellIdx < 81; cellIdx++) {
        const r = (cellIdx / 9) | 0;
        const c = cellIdx % 9;
        if (board[r][c] !== 0) continue;

        const cellMask = g.cand[cellIdx];
        if (cellMask === 0) continue;

        if ((cellMask & ~killed1[cellIdx]) === 0)
          return eliminateColor(1, "B_Cell", { r, c });
        if ((cellMask & ~killed2[cellIdx]) === 0)
          return eliminateColor(2, "B_Cell", { r, c });
      }

      // --- Rule B: Bad Color (Color empties a house of a specific digit) ---
      for (let u = 0; u < 27; u++) {
        const ids = UNIT_IDS[u];

        for (let d = 1; d <= 9; d++) {
          const dBit = bitFor(d);
          let hasD = false;
          let c1KillsAll = true;
          let c2KillsAll = true;

          for (let i = 0; i < 9; i++) {
            const hCellId = ids[i];
            if (
              board[(hCellId / 9) | 0][hCellId % 9] !== 0 ||
              (g.cand[hCellId] & dBit) === 0
            )
              continue;
            hasD = true;
            const candColor = coloring[hCellId * 9 + d - 1];

            const c1PlacesOther = cellColors[hCellId] & 1 && candColor !== 1;
            const c1SeesD = (killed1[hCellId] & dBit) !== 0;
            if (!c1PlacesOther && !c1SeesD) c1KillsAll = false;

            const c2PlacesOther = cellColors[hCellId] & 2 && candColor !== 2;
            const c2SeesD = (killed2[hCellId] & dBit) !== 0;
            if (!c2PlacesOther && !c2SeesD) c2KillsAll = false;

            if (!c1KillsAll && !c2KillsAll) break;
          }

          if (hasD && (c1KillsAll || c2KillsAll)) {
            const unitType = u < 9 ? "row" : u < 18 ? "col" : "box";
            const idx = u - UNIT_OFFSET[unitType];
            if (c1KillsAll)
              return eliminateColor(1, "B_House", { unitType, idx, d });
            return eliminateColor(2, "B_House", { unitType, idx, d });
          }
        }
      }
    }

    // --- Rule C: Color Trap (Eliminations generated by BOTH colors) ---
    const removals = [];
    const trapDetails = [];

    const findSource = (targetR, targetC, targetN, targetColor) => {
      const targetId = targetR * 9 + targetC;
      for (const id of componentNodes) {
        if (coloring[id] !== targetColor) continue;
        const { r, c, n } = parseCandId(id);
        // Source from within the cell (Medusa only)
        if (r === targetR && c === targetC && n !== targetN)
          return `(${n})r${r + 1}c${c + 1}`;
        // Source from peers
        if (n === targetN && seesId(r * 9 + c, targetId)) {
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
      for (let i = 0; i < 81; i++) {
        if (cellColors[i] === 3) {
          const r = (i / 9) | 0;
          const c = i % 9;
          for (const k of bits9(g.cand[i])) {
            if (coloring[i * 9 + k] === 0) addTrap(r, c, k + 1);
          }
        }
      }
    }

    for (let cellIdx = 0; cellIdx < 81; cellIdx++) {
      const r = (cellIdx / 9) | 0;
      const c = cellIdx % 9;
      if (board[r][c] !== 0) continue;

      for (const k of bits9(g.cand[cellIdx])) {
        if (coloring[cellIdx * 9 + k] !== 0) continue;

        const dBit = bitFor(k + 1);
        const seesC1 = (killed1[cellIdx] & dBit) !== 0;
        const seesC2 = (killed2[cellIdx] & dBit) !== 0;

        if (seesC1 && seesC2) {
          addTrap(r, c, k + 1);
          continue;
        }

        if (!isSimpleColoring) {
          if (seesC1 && cellColors[cellIdx] & 2) addTrap(r, c, k + 1);
          else if (seesC2 && cellColors[cellIdx] & 1) addTrap(r, c, k + 1);
        }
      }
    }

    if (removals.length > 0) return { removals, rule: "C", trapDetails };
    return { removals: [] };
  },

  _solveColoring: (
    board,
    pencils,
    singleDigit = null,
    findAll = false,
    grid = null,
  ) => {
    const results = [];
    if (!grid) grid = buildGrid(pencils);
    const graph = techniques._buildColoringGraph(pencils, singleDigit, grid);
    const visited = new Int8Array(729).fill(0);
    const coloring = new Int8Array(729).fill(0); // 0=None, 1=ColorA, 2=ColorB

    for (let startId = 0; startId < 729; startId++) {
      if (graph.deg[startId] === 0 || visited[startId]) continue;

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

        const edgeBase = curr * 4;
        const edgeCount = graph.deg[curr];
        for (let e = 0; e < edgeCount; e++) {
          const neighbor = graph.adj[edgeBase + e];
          if (coloring[neighbor] === 0) {
            coloring[neighbor] = nextColor;
            visited[neighbor] = 1;
            component.push(neighbor);
            queue.push(neighbor);
          }
        }
      }

      const result = techniques._applyColoringRules(
        component,
        coloring,
        pencils,
        board,
        singleDigit !== null,
        grid,
      );

      if (result.removals && result.removals.length > 0) {
        const uniqueElims = _getUniqueRemovals(result.removals);

        if (uniqueElims.length > 0) {
          const name =
            singleDigit !== null ? t("teks_SimpleColor") : t("teks_Medusa");
          const startCand = techniques._parseCandId(startId);
          const info =
            singleDigit !== null
              ? t("teks_SimpleColor_digit", singleDigit)
              : t(
                  "teks_start_color_1_with_r_c",
                  startCand.n,
                  startCand.r + 1,
                  startCand.c + 1,
                );

          let detail = t(
            "teks_start_color_c1_with_r_c",
            startCand.n,
            startCand.r + 1,
            startCand.c + 1,
          );

          if (result.rule === "A_Cell") {
            detail += t(
              "teks_invalid_color_c_appears_twice_in_r_c",
              result.targetColor,
              result.data.r + 1,
              result.data.c + 1,
            );
          } else if (result.rule === "A_Peer") {
            detail += t(
              "teks_invalid_color_c_for_digit_sees_itself_at_r_c",
              result.data.n,
              result.targetColor,
              result.data.r + 1,
              result.data.c + 1,
            );
          } else if (result.rule === "B_Cell") {
            detail += t(
              "teks_bad_color_c_emptied_cell_r_c",
              result.data.r + 1,
              result.data.c + 1,
              result.targetColor,
            );
          } else if (result.rule === "B_House") {
            const uType = result.data.unitType;
            const uName =
              uType === "row"
                ? t("teks_SimpleColor_row", result.data.idx + 1)
                : uType === "col"
                  ? t("teks_SimpleColor_col", result.data.idx + 1)
                  : t("teks_SimpleColor_box", result.data.idx + 1);
            detail += t(
              "teks_bad_color_c_removed_all_in",
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
                ? t("teks_c1_at", Array.from(c1Sources).join(", "))
                : "";
            const c2Str =
              c2Sources.size > 0
                ? t("teks_c2_at", Array.from(c2Sources).join(", "))
                : "";
            const sources = [c1Str, c2Str].filter(Boolean).join(", ");
            detail += t("teks_color_trap", sources);
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

      for (const id of component) coloring[id] = 0;
    }

    return findAll ? results : { change: false };
  },

  simpleColoring: (board, pencils, findAll = false) => {
    const results = [];
    const grid = buildGrid(pencils);
    for (let d = 1; d <= 9; d++) {
      const res = techniques._solveColoring(board, pencils, d, findAll, grid);
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
