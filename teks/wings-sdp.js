Object.assign(techniques, {
  xyWing: (board, pencils, findAll = false) => {
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          bivalueCells.push({ r, c, cands: [...pencils[r][c]].sort() });
        }
      }
    }

    if (bivalueCells.length < 3) return { change: false };
    const results = [];
    for (const pivot of bivalueCells) {
      const [x, y] = pivot.cands;
      const pincer1Candidates = bivalueCells.filter(
        (cell) =>
          (cell.r !== pivot.r || cell.c !== pivot.c) &&
          techniques._sees([cell.r, cell.c], [pivot.r, pivot.c]) &&
          cell.cands.includes(x) &&
          !cell.cands.includes(y),
      );
      const pincer2Candidates = bivalueCells.filter(
        (cell) =>
          (cell.r !== pivot.r || cell.c !== pivot.c) &&
          techniques._sees([cell.r, cell.c], [pivot.r, pivot.c]) &&
          cell.cands.includes(y) &&
          !cell.cands.includes(x),
      );

      for (const pincer1 of pincer1Candidates) {
        const z = pincer1.cands.find((c) => c !== x);
        if (z === undefined) continue;
        for (const pincer2 of pincer2Candidates) {
          if (
            pincer2.cands.includes(z) &&
            !techniques._sees([pincer1.r, pincer1.c], [pincer2.r, pincer2.c])
          ) {
            const removals = [];
            const commonSeers = techniques._commonVisibleCells(
              [pincer1.r, pincer1.c],
              [pincer2.r, pincer2.c],
            );
            for (const [r, c] of commonSeers) {
              if (pencils[r][c].has(z) && !(r === pivot.r && c === pivot.c)) {
                removals.push({ r, c, num: z });
              }
            }
            if (removals.length > 0) {
              const allCands = [x, y, z].sort().join("");

              const res = {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: t("teks_msg_50"),
                  mainInfo: t("teks_msg_51", pivot.r + 1, pivot.c + 1),
                  detail: t(
                    "teks_msg_52",
                    allCands,
                    pivot.r + 1,
                    pivot.c + 1,
                    pincer1.r + 1,
                    pincer1.c + 1,
                    pincer2.r + 1,
                    pincer2.c + 1,
                  ),
                },
                visualPlan: {
                  highlight: { digit: null, state: 2 },
                  cellColors: [
                    { r: pivot.r, c: pivot.c, color: 6 },
                    { r: pincer1.r, c: pincer1.c, color: 7 },
                    { r: pincer2.r, c: pincer2.c, color: 7 },
                  ],
                  candidateColors: [
                    { r: pincer1.r, c: pincer1.c, num: z, color: 7 },
                    { r: pincer2.r, c: pincer2.c, num: z, color: 7 },
                    { r: pivot.r, c: pivot.c, num: x, color: 4 },
                    { r: pincer1.r, c: pincer1.c, num: x, color: 4 },
                    { r: pivot.r, c: pivot.c, num: y, color: 5 },
                    { r: pincer2.r, c: pincer2.c, num: y, color: 5 },
                  ],
                  candidateMarks: removals.map(({ r, c, num }) => ({
                    r,
                    c,
                    num,
                    marker: "slash",
                    color: 0,
                  })),
                },
              };
              if (!findAll) return res;
              results.push(res);
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  xyzWing: (board, pencils, findAll = false) => {
    let results = [];

    const trivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 3) {
          trivalueCells.push({ r, c, cands: new Set(pencils[r][c]) });
        }
      }
    }
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          bivalueCells.push({ r, c, cands: new Set(pencils[r][c]) });
        }
      }
    }

    for (const pivot of trivalueCells) {
      const wings = bivalueCells.filter(
        (cell) =>
          techniques._sees([cell.r, cell.c], [pivot.r, pivot.c]) &&
          [...cell.cands].every((cand) => pivot.cands.has(cand)),
      );
      if (wings.length < 2) continue;

      for (const wingCombo of techniques.combinations(wings, 2)) {
        const [wing1, wing2] = wingCombo;

        if (techniques._sees([wing1.r, wing1.c], [wing2.r, wing2.c])) {
          continue;
        }

        const intersection = new Set(
          [...wing1.cands].filter((c) => wing2.cands.has(c)),
        );
        if (intersection.size === 1) {
          const z = intersection.values().next().value;
          const removals = [];
          for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
              if (
                (r === pivot.r && c === pivot.c) ||
                (r === wing1.r && c === wing1.c) ||
                (r === wing2.r && c === wing2.c)
              ) {
                continue;
              }

              if (
                pencils[r][c].has(z) &&
                techniques._sees([r, c], [pivot.r, pivot.c]) &&
                techniques._sees([r, c], [wing1.r, wing1.c]) &&
                techniques._sees([r, c], [wing2.r, wing2.c])
              ) {
                removals.push({ r, c, num: z });
              }
            }
          }
          if (removals.length > 0) {
            const pivotCands = [...pivot.cands].sort().join("");
            const x = [...wing1.cands].find((candidate) => candidate !== z);
            const y = [...wing2.cands].find((candidate) => candidate !== z);
            const resultObj = {
              change: true,
              type: "remove",
              cells: removals,
              hint: {
                name: t("teks_msg_53"),
                mainInfo: t("teks_msg_51", pivot.r + 1, pivot.c + 1),
                detail: t(
                  "teks_msg_52",
                  pivotCands,
                  pivot.r + 1,
                  pivot.c + 1,
                  wing1.r + 1,
                  wing1.c + 1,
                  wing2.r + 1,
                  wing2.c + 1,
                ),
              },
              visualPlan: {
                highlight: { digit: null, state: 2 },
                cellColors: [
                  { r: pivot.r, c: pivot.c, color: 6 },
                  { r: wing1.r, c: wing1.c, color: 7 },
                  { r: wing2.r, c: wing2.c, color: 7 },
                ],
                candidateColors: [
                  { r: pivot.r, c: pivot.c, num: z, color: 7 },
                  { r: wing1.r, c: wing1.c, num: z, color: 7 },
                  { r: wing2.r, c: wing2.c, num: z, color: 7 },
                  ...(x === undefined
                    ? []
                    : [
                        { r: pivot.r, c: pivot.c, num: x, color: 4 },
                        { r: wing1.r, c: wing1.c, num: x, color: 4 },
                      ]),
                  ...(y === undefined
                    ? []
                    : [
                        { r: pivot.r, c: pivot.c, num: y, color: 5 },
                        { r: wing2.r, c: wing2.c, num: y, color: 5 },
                      ]),
                ],
                candidateMarks: removals.map(({ r, c, num }) => ({
                  r,
                  c,
                  num,
                  marker: "slash",
                  color: 0,
                })),
              },
            };
            if (!findAll) return resultObj;
            results.push(resultObj);
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  // --- Unified Helper for W-Wing & Grouped W-Wing ---
  _wWingCore: (board, pencils, isGrouped, findAll = false) => {
    const g = buildGrid(pencils);
    const results = [];

    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const id = r * 9 + c;
        if (pop(g.cand[id]) === 2)
          bivalueCells.push({ r, c, id, mask: g.cand[id] });
      }
    }
    if (bivalueCells.length < 2) return findAll ? results : { change: false };

    for (const pair of techniques.combinations(bivalueCells, 2)) {
      const [cell1, cell2] = pair;
      if (cell1.mask !== cell2.mask) continue;
      if (seesId(cell1.id, cell2.id)) continue;

      const x = lowest(cell1.mask) + 1;
      const y = lowest(cell1.mask & (cell1.mask - 1)) + 1;

      const wingBits = [0, 0, 0];
      wingBits[CELL_PART[cell1.id]] |= CELL_BIT[cell1.id];
      wingBits[CELL_PART[cell2.id]] |= CELL_BIT[cell2.id];

      for (const linkDigit of [x, y]) {
        const elimDigit = linkDigit === x ? y : x;
        const lk = linkDigit - 1;
        const ek = elimDigit - 1;

        for (let u = 0; u < 27; u++) {
          let unitType, unitIndex;
          if (u < 9) {
            unitType = "row";
            unitIndex = u;
          } else if (u < 18) {
            unitType = "col";
            unitIndex = u - 9;
          } else {
            unitType = "box";
            unitIndex = u - 18;
          }

          if (
            (UNIT_POS[u * 3] & wingBits[0]) !== 0 ||
            (UNIT_POS[u * 3 + 1] & wingBits[1]) !== 0 ||
            (UNIT_POS[u * 3 + 2] & wingBits[2]) !== 0
          ) {
            continue;
          }

          const x_cells_in_unit = [];
          for (const id of UNIT_IDS[u]) {
            if ((g.cand[id] & (1 << lk)) !== 0) x_cells_in_unit.push(id);
          }
          if (x_cells_in_unit.length === 0) continue;
          if (!isGrouped && x_cells_in_unit.length !== 2) continue;

          const group1 = [];
          const group2 = [];
          let isValid = true;

          for (const id of x_cells_in_unit) {
            const sees1 = seesId(id, cell1.id);
            const sees2 = seesId(id, cell2.id);

            if (!isGrouped) {
              if (sees1 === sees2) {
                isValid = false;
                break;
              }
            } else if (!sees1 && !sees2) {
              isValid = false;
              break;
            }
            if (sees1) group1.push([(id / 9) | 0, id % 9]);
            if (sees2) group2.push([(id / 9) | 0, id % 9]);
          }

          if (!isValid || group1.length === 0 || group2.length === 0) continue;

          const removals = [];
          for (const id of commonPeers(g, cell1.id, cell2.id, ek)) {
            removals.push({ r: (id / 9) | 0, c: id % 9, num: elimDigit });
          }
          if (removals.length === 0) continue;

          const formatGroup = (cells, uType, uIdx) => {
            if (uType === "box") {
              const pts = [...new Set(cells.map(([r, c]) => pointOf(r, c) + 1))]
                .sort((a, b) => a - b)
                .join("");
              return `b${uIdx + 1}p${pts}`;
            }
            const rs = [...new Set(cells.map(([r]) => r + 1))]
              .sort((a, b) => a - b)
              .join("");
            const cs = [...new Set(cells.map(([, c]) => c + 1))]
              .sort((a, b) => a - b)
              .join("");
            return `r${rs}c${cs}`;
          };

          const linkStr1 = formatGroup(group1, unitType, unitIndex);
          const linkStr2 = formatGroup(group2, unitType, unitIndex);
          const strongLinkDetail = `(${linkDigit})(${linkStr1}=${linkStr2})`;

          const res = {
            change: true,
            type: "remove",
            cells: removals,
            hint: {
              name: isGrouped ? t("teks_msg_56") : t("teks_msg_57"),
              mainInfo: t("teks_msg_58", elimDigit, linkDigit),
              detail: t(
                "teks_msg_59",
                elimDigit,
                linkDigit,
                cell1.r + 1,
                cell1.c + 1,
                cell2.r + 1,
                cell2.c + 1,
                unitType.slice(0, 1),
                unitIndex + 1,
                strongLinkDetail,
              ),
            },
            visualPlan: {
              highlight: { digit: null, state: 2 },
              cellColors: [
                { r: cell1.r, c: cell1.c, color: 6 },
                { r: cell2.r, c: cell2.c, color: 6 },
                ...[...group1, ...group2].map(([r, c]) => ({
                  r,
                  c,
                  color: 7,
                })),
              ],
              candidateColors: [
                { r: cell1.r, c: cell1.c, num: linkDigit, color: 5 },
                { r: cell2.r, c: cell2.c, num: linkDigit, color: 5 },
                { r: cell1.r, c: cell1.c, num: elimDigit, color: 7 },
                { r: cell2.r, c: cell2.c, num: elimDigit, color: 7 },
                ...[...group1, ...group2].map(([r, c]) => ({
                  r,
                  c,
                  num: linkDigit,
                  color: 4,
                })),
              ],
              candidateMarks: removals.map(({ r, c, num }) => ({
                r,
                c,
                num,
                marker: "slash",
                color: 0,
              })),
            },
          };

          if (!findAll) return res;
          results.push(res);
        }
      }
    }
    return findAll ? results : { change: false };
  },
  wWing: (board, pencils, findAll = false) => {
    return techniques._wWingCore(board, pencils, false, findAll);
  },

  groupedWWing: (board, pencils, findAll = false) => {
    return techniques._wWingCore(board, pencils, true, findAll);
  },

  remotePair: (board, pencils, findAll = false) => {
    const results = [];
    const bivalueCells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (pencils[r][c].size === 2) {
          const cands = [...pencils[r][c]].sort().join("");
          bivalueCells.push({ r, c, cands });
        }
      }
    }

    const pairGroups = new Map();
    for (const cell of bivalueCells) {
      if (!pairGroups.has(cell.cands)) {
        pairGroups.set(cell.cands, []);
      }
      pairGroups.get(cell.cands).push([cell.r, cell.c]);
    }

    for (const [pairStr, cells] of pairGroups.entries()) {
      if (cells.length < 4) continue;
      const pair = pairStr.split("").map(Number);
      const adj = new Map();
      cells.forEach((cell) => adj.set(JSON.stringify(cell), []));

      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          if (techniques._sees(cells[i], cells[j])) {
            adj.get(JSON.stringify(cells[i])).push(cells[j]);
            adj.get(JSON.stringify(cells[j])).push(cells[i]);
          }
        }
      }

      // AFTER
      const seenChains = new Set(); // deduplicate bidirectional chains across all startNodes

      for (const startNode of cells) {
        const queue = [[startNode, [startNode]]]; // [node, path]
        const visitedPaths = new Set();
        visitedPaths.add(JSON.stringify([startNode]));

        while (queue.length > 0) {
          const [current, path] = queue.shift();

          if (path.length >= 4 && path.length % 2 === 0) {
            const end1 = path[0];
            const end2 = path[path.length - 1];
            const commonSeers = techniques._commonVisibleCells(end1, end2);
            const removals = [];

            for (const [r, c] of commonSeers) {
              if (!path.some((p) => p[0] === r && p[1] === c)) {
                if (pencils[r][c].has(pair[0]))
                  removals.push({ r, c, num: pair[0] });
                if (pencils[r][c].has(pair[1]))
                  removals.push({ r, c, num: pair[1] });
              }
            }
            if (removals.length > 0) {
              // Canonicalize: always represent the chain with the lexicographically
              // smaller endpoint first, so A→…→B and B→…→A map to the same key.
              const nodeKey = ([r, c]) => `${r},${c}`;
              const firstKey = nodeKey(path[0]);
              const lastKey = nodeKey(path[path.length - 1]);
              const chainKey =
                firstKey < lastKey
                  ? `${firstKey}|${lastKey}|${path.length}`
                  : `${lastKey}|${firstKey}|${path.length}`;

              if (findAll && seenChains.has(chainKey)) continue; // skip the reverse duplicate
              seenChains.add(chainKey);

              const pathStr = path
                .map(([r, c]) => `r${r + 1}c${c + 1}`)
                .join("-");
              const res = {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: t("teks_msg_60"),
                  mainInfo: t("teks_msg_61", pair[0], pair[1]),
                  detail: t("teks_msg_62", pair[0], pair[1], pathStr),
                },
                visualPlan: {
                  highlight: { digit: null, state: 2 },
                  cellColors: path.map(([r, c], index) => ({
                    r,
                    c,
                    color: index % 2 === 0 ? 6 : 7,
                  })),
                  candidateColors: path.flatMap(([r, c], index) => {
                    const isEven = index % 2 === 0;
                    return [
                      { r, c, num: pair[0], color: isEven ? 4 : 5 },
                      { r, c, num: pair[1], color: isEven ? 5 : 4 },
                    ];
                  }),
                  candidateMarks: removals.map(({ r, c, num }) => ({
                    r,
                    c,
                    num,
                    marker: "slash",
                    color: 0,
                  })),
                },
              };
              if (!findAll) return res;
              results.push(res);
            }
          }

          const currentStr = JSON.stringify(current);
          for (const neighbor of adj.get(currentStr)) {
            if (
              !path.some((p) => p[0] === neighbor[0] && p[1] === neighbor[1])
            ) {
              const newPath = [...path, neighbor];
              const newPathStr = JSON.stringify(
                newPath.map((p) => p.join(",")).sort(),
              ); // Path invariant to direction
              if (!visitedPaths.has(newPathStr)) {
                queue.push([neighbor, newPath]);
                visitedPaths.add(newPathStr);
              }
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  skyscraper: (board, pencils, findAll = false) => {
    const g = buildGrid(pencils);

    const skyscraperLogic = (isRowBased) => {
      const results = [];
      const lineMasks = isRowBased ? g.row : g.col;

      for (let num = 1; num <= 9; num++) {
        const k = num - 1;
        const strongLinks = [];
        for (let i = 0; i < 9; i++) {
          const m = lineMasks[k * 9 + i];
          if (pop(m) !== 2) continue;
          const a = lowest(m);
          const b = lowest(m & (m - 1));
          if (((a / 3) | 0) !== ((b / 3) | 0)) {
            strongLinks.push({ line: i, locs: [a, b] });
          }
        }
        if (strongLinks.length < 2) continue;

        for (const linkPair of techniques.combinations(strongLinks, 2)) {
          const [link1, link2] = linkPair;

          const sharedLocs = new Set(link1.locs);
          const baseLoc = link2.locs.find((loc) => sharedLocs.has(loc));
          if (baseLoc === undefined) continue;

          const peak1Loc = link1.locs.find((loc) => loc !== baseLoc);
          const peak2Loc = link2.locs.find((loc) => loc !== baseLoc);

          const p1 = isRowBased
            ? [link1.line, peak1Loc]
            : [peak1Loc, link1.line];
          const p2 = isRowBased
            ? [link2.line, peak2Loc]
            : [peak2Loc, link2.line];

          if (peak1Loc === peak2Loc) continue;

          const removals = [];
          for (const id of commonPeers(
            g,
            p1[0] * 9 + p1[1],
            p2[0] * 9 + p2[1],
            k,
          )) {
            removals.push({ r: (id / 9) | 0, c: id % 9, num });
          }
          if (removals.length === 0) continue;

          let link1Str = "";
          let link2Str = "";
          if (isRowBased) {
            link1Str = `r${link1.line + 1}c${peak1Loc + 1}=r${link1.line + 1}c${baseLoc + 1}`;
            link2Str = `r${link2.line + 1}c${baseLoc + 1}=r${link2.line + 1}c${peak2Loc + 1}`;
          } else {
            link1Str = `r${peak1Loc + 1}c${link1.line + 1}=r${baseLoc + 1}c${link1.line + 1}`;
            link2Str = `r${baseLoc + 1}c${link2.line + 1}=r${peak2Loc + 1}c${link2.line + 1}`;
          }

          const base1 = isRowBased
            ? [link1.line, baseLoc]
            : [baseLoc, link1.line];
          const base2 = isRowBased
            ? [link2.line, baseLoc]
            : [baseLoc, link2.line];

          const resultObj = {
            change: true,
            type: "remove",
            cells: removals,
            hint: {
              name: t("teks_msg_63"),
              mainInfo: t("teks_msg_48", num),
              detail: `(${num})(${link1Str})-(${link2Str})`,
            },
            visualPlan: techniques._buildSingleDigitChainVisualPlan(
              num,
              [
                { cells: [p1] },
                { cells: [base1] },
                { cells: [base2] },
                { cells: [p2] },
              ],
              removals,
            ),
          };
          if (!findAll) return { change: true, res: resultObj };
          results.push(resultObj);
        }
      }
      return findAll ? results : { change: false };
    };

    if (!findAll) {
      let result = skyscraperLogic(true);
      if (result.change) return result.res;
      result = skyscraperLogic(false);
      return result.change ? result.res : { change: false };
    }
    return [...skyscraperLogic(true), ...skyscraperLogic(false)];
  },
  twoStringKite: (board, pencils, findAll = false) => {
    const g = buildGrid(pencils);
    const results = [];

    for (let num = 1; num <= 9; num++) {
      const k = num - 1;

      const rowLinks = [];
      for (let r = 0; r < 9; r++) {
        const m = g.row[k * 9 + r];
        if (pop(m) === 2) rowLinks.push({ r, locs: bits9(m) });
      }
      const colLinks = [];
      for (let c = 0; c < 9; c++) {
        const m = g.col[k * 9 + c];
        if (pop(m) === 2) colLinks.push({ c, locs: bits9(m) });
      }
      if (rowLinks.length === 0 || colLinks.length === 0) continue;

      for (const rLink of rowLinks) {
        for (const cLink of colLinks) {
          const r_base = rLink.r;
          const [c1, c2] = rLink.locs;
          const c_base = cLink.c;
          const [rA, rB] = cLink.locs;

          if (
            r_base === rA ||
            r_base === rB ||
            c_base === c1 ||
            c_base === c2
          ) {
            continue;
          }

          const rowLinkCells = [
            [rLink.r, rLink.locs[0]],
            [rLink.r, rLink.locs[1]],
          ];
          const colLinkCells = [
            [cLink.locs[0], cLink.c],
            [cLink.locs[1], cLink.c],
          ];

          for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
              if (
                boxOf(rowLinkCells[i][0], rowLinkCells[i][1]) !==
                boxOf(colLinkCells[j][0], colLinkCells[j][1])
              ) {
                continue;
              }

              const p1 = rowLinkCells[1 - i];
              const p2 = colLinkCells[1 - j];
              const pBox1 = rowLinkCells[i];
              const pBox2 = colLinkCells[j];

              if (p1[0] === p2[0] && p1[1] === p2[1]) continue;

              const removals = [];
              for (const id of commonPeers(
                g,
                p1[0] * 9 + p1[1],
                p2[0] * 9 + p2[1],
                k,
              )) {
                removals.push({ r: (id / 9) | 0, c: id % 9, num });
              }
              if (removals.length === 0) continue;

              const link1Str = `r${p1[0] + 1}c${p1[1] + 1}=r${pBox1[0] + 1}c${pBox1[1] + 1}`;
              const link2Str = `r${pBox2[0] + 1}c${pBox2[1] + 1}=r${p2[0] + 1}c${p2[1] + 1}`;

              const resultObj = {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: t("teks_msg_65"),
                  mainInfo: t("teks_msg_48", num),
                  detail: `(${num})(${link1Str})-(${link2Str})`,
                },
                visualPlan: techniques._buildSingleDigitChainVisualPlan(
                  num,
                  [
                    { cells: [p1] },
                    { cells: [pBox1] },
                    { cells: [pBox2] },
                    { cells: [p2] },
                  ],
                  removals,
                ),
              };
              if (!findAll) return resultObj;
              results.push(resultObj);
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },
  crane: (board, pencils, findAll = false) => {
    const g = buildGrid(pencils);

    const turbotLogic = (isRowBased) => {
      const results = [];
      for (let num = 1; num <= 9; num++) {
        const k = num - 1;
        for (let b = 0; b < 9; b++) {
          const bm = g.box[k * 9 + b];
          if (pop(bm) !== 2) continue;

          const sr = ((b / 3) | 0) * 3;
          const sc = (b % 3) * 3;
          const boxLocs = bits9(bm).map((p) => [
            sr + ((p / 3) | 0),
            sc + (p % 3),
          ]);

          const [pA_init, pB_init] = boxLocs;
          if (pA_init[0] === pB_init[0] || pA_init[1] === pB_init[1]) continue;

          for (const startNode of [pA_init, pB_init]) {
            const pA = startNode === pA_init ? pB_init : pA_init;
            const pB = startNode;

            const weakIdx = isRowBased ? pB[1] : pB[0];
            let wm = isRowBased
              ? g.col[k * 9 + weakIdx]
              : g.row[k * 9 + weakIdx];
            while (wm) {
              const i = lowest(wm);
              wm &= wm - 1;
              const pC = isRowBased ? [i, weakIdx] : [weakIdx, i];
              if (boxOf(pC[0], pC[1]) === b) continue;

              const strongIdx = isRowBased ? pC[0] : pC[1];
              const sm = isRowBased
                ? g.row[k * 9 + strongIdx]
                : g.col[k * 9 + strongIdx];
              if (pop(sm) !== 2) continue;

              const locs = bits9(sm);
              const selfLoc = isRowBased ? pC[1] : pC[0];
              const otherLoc = locs[0] === selfLoc ? locs[1] : locs[0];
              if (otherLoc === selfLoc) continue;
              const pD = isRowBased
                ? [strongIdx, otherLoc]
                : [otherLoc, strongIdx];

              const removals = [];
              for (const id of commonPeers(
                g,
                pA[0] * 9 + pA[1],
                pD[0] * 9 + pD[1],
                k,
              )) {
                const r = (id / 9) | 0;
                const c = id % 9;
                if (
                  !(r === pA[0] && c === pA[1]) &&
                  !(r === pD[0] && c === pD[1])
                ) {
                  removals.push({ r, c, num });
                }
              }
              if (removals.length === 0) continue;

              const p1BoxIndex = pointOf(pA[0], pA[1]) + 1;
              const p2BoxIndex = pointOf(pB[0], pB[1]) + 1;
              const link1Str = `b${b + 1}p${p1BoxIndex}=b${b + 1}p${p2BoxIndex}`;
              const link2Str = `r${pC[0] + 1}c${pC[1] + 1}=r${pD[0] + 1}c${pD[1] + 1}`;

              const resultObj = {
                change: true,
                type: "remove",
                cells: removals,
                hint: {
                  name: t("teks_msg_67"),
                  mainInfo: t("teks_msg_48", num),
                  detail: `(${num})(${link1Str})-(${link2Str})`,
                },
                visualPlan: techniques._buildSingleDigitChainVisualPlan(
                  num,
                  [
                    { cells: [pA] },
                    { cells: [pB] },
                    { cells: [pC] },
                    { cells: [pD] },
                  ],
                  removals,
                ),
              };
              if (!findAll) return { change: true, res: resultObj };
              results.push(resultObj);
            }
          }
        }
      }
      return findAll ? results : { change: false };
    };

    if (!findAll) {
      let result = turbotLogic(true);
      if (result.change) return result.res;
      result = turbotLogic(false);
      return result.change ? result.res : { change: false };
    }
    return [...turbotLogic(true), ...turbotLogic(false)];
  },
  groupedKite: (board, pencils, findAll = false) => {
    const g = buildGrid(pencils);
    const results = [];

    for (let num = 1; num <= 9; num++) {
      const k = num - 1;
      for (let b = 0; b < 9; b++) {
        const bm = g.box[k * 9 + b];
        if (bm === 0) continue;

        const sr = ((b / 3) | 0) * 3;
        const sc = (b % 3) * 3;
        const box_n_cells = bits9(bm).map((p) => [
          sr + ((p / 3) | 0),
          sc + (p % 3),
        ]);

        const box_rows = [...new Set(box_n_cells.map(([r]) => r))].sort(
          (a, b) => a - b,
        );
        const box_cols = [...new Set(box_n_cells.map(([, c]) => c))].sort(
          (a, b) => a - b,
        );

        for (const r1 of box_rows) {
          const stackMask = 0b111 << ((b % 3) * 3);
          const outside = g.row[k * 9 + r1] & ~stackMask;
          if (pop(outside) !== 1) continue;
          const c2 = lowest(outside);

          for (const c1 of box_cols) {
            if ((g.cand[r1 * 9 + c1] & (1 << k)) !== 0) continue;

            const bandMask = 0b111 << (((b / 3) | 0) * 3);
            const outsideCol = g.col[k * 9 + c1] & ~bandMask;
            if (pop(outsideCol) !== 1) continue;
            const r2 = lowest(outsideCol);

            if ((g.cand[r2 * 9 + c2] & (1 << k)) === 0) continue;

            const rowGroupCols = [
              ...new Set(
                box_n_cells.filter(([r]) => r === r1).map(([, c]) => c + 1),
              ),
            ]
              .sort((a, b) => a - b)
              .join("");
            const colGroupRows = [
              ...new Set(
                box_n_cells.filter(([, c]) => c === c1).map(([r]) => r + 1),
              ),
            ]
              .sort((a, b) => a - b)
              .join("");

            const link1Str = `r${r1 + 1}c${c2 + 1}=r${r1 + 1}c${rowGroupCols}`;
            const link2Str = `r${colGroupRows}c${c1 + 1}=r${r2 + 1}c${c1 + 1}`;
            const group1 = box_n_cells.filter(([r]) => r === r1);
            const group2 = box_n_cells.filter(([, c]) => c === c1);

            const resultObj = {
              change: true,
              type: "remove",
              cells: [{ r: r2, c: c2, num }],
              hint: {
                name: t("teks_msg_69"),
                mainInfo: t("teks_msg_48", num),
                detail: `(${num})(${link1Str})-(${link2Str})`,
              },
              visualPlan: techniques._buildSingleDigitChainVisualPlan(
                num,
                [
                  { cells: [[r1, c2]] },
                  { cells: group1 },
                  { cells: group2 },
                  { cells: [[r2, c1]] },
                ],
                [{ r: r2, c: c2, num }],
                true,
              ),
            };
            if (!findAll) return resultObj;
            results.push(resultObj);
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },
  emptyRectangle: (board, pencils, findAll = false) => {
    const g = buildGrid(pencils);

    const logic = (isRowVersion) => {
      const results = [];
      for (let num = 1; num <= 9; num++) {
        const k = num - 1;
        for (let b = 0; b < 9; b++) {
          const bm = g.box[k * 9 + b];
          if (pop(bm) < 2) continue;

          const sr = ((b / 3) | 0) * 3;
          const sc = (b % 3) * 3;
          const box_n_cells = bits9(bm).map((p) => [
            sr + ((p / 3) | 0),
            sc + (p % 3),
          ]);

          const rows = [...new Set(box_n_cells.map(([r]) => r))].sort(
            (a, b) => a - b,
          );
          const cols = [...new Set(box_n_cells.map(([, c]) => c))].sort(
            (a, b) => a - b,
          );
          if (rows.length === 1 || cols.length === 1) continue;

          for (const r1 of rows) {
            for (const c1 of cols) {
              const coversAll = box_n_cells.every(
                ([r, c]) => r === r1 || c === c1,
              );
              if (!coversAll) continue;

              for (let idx2 = 0; idx2 < 9; idx2++) {
                const unit1 = isRowVersion ? r1 : c1;
                if (((idx2 / 3) | 0) === ((unit1 / 3) | 0)) continue;

                const br = isRowVersion ? idx2 : r1;
                const bc = isRowVersion ? c1 : idx2;
                if ((g.cand[br * 9 + bc] & (1 << k)) === 0) continue;

                const scanMask = isRowVersion
                  ? g.row[k * 9 + idx2]
                  : g.col[k * 9 + idx2];
                if (pop(scanMask) !== 2) continue;

                const expectedBaseLoc = isRowVersion ? c1 : r1;
                if ((scanMask & (1 << expectedBaseLoc)) === 0) continue;
                const targetLoc = lowest(scanMask & ~(1 << expectedBaseLoc));
                if (((targetLoc / 3) | 0) === ((expectedBaseLoc / 3) | 0)) {
                  continue;
                }

                const r2 = isRowVersion ? idx2 : targetLoc;
                const c2 = isRowVersion ? targetLoc : idx2;

                const elimR = isRowVersion ? r1 : r2;
                const elimC = isRowVersion ? c2 : c1;

                if ((g.cand[elimR * 9 + elimC] & (1 << k)) === 0) continue;

                const groupCells = box_n_cells.filter(([r, c]) =>
                  isRowVersion ? r === r1 : c === c1,
                );
                const baseCells = box_n_cells.filter(([r, c]) =>
                  isRowVersion ? c === c1 : r === r1,
                );

                const pGroup = [
                  ...new Set(groupCells.map(([r, c]) => pointOf(r, c) + 1)),
                ]
                  .sort()
                  .join("");
                const pBase = [
                  ...new Set(baseCells.map(([r, c]) => pointOf(r, c) + 1)),
                ]
                  .sort()
                  .join("");

                const link1Str = `b${b + 1}p${pGroup}=b${b + 1}p${pBase}`;
                const link2Str = isRowVersion
                  ? `r${r2 + 1}c${c1 + 1}=r${r2 + 1}c${c2 + 1}`
                  : `r${r1 + 1}c${c2 + 1}=r${r2 + 1}c${c2 + 1}`;

                const resultObj = {
                  change: true,
                  type: "remove",
                  cells: [{ r: elimR, c: elimC, num }],
                  hint: {
                    name: t("teks_msg_71"),
                    mainInfo: t("teks_msg_48", num),
                    detail: `(${num})(${link1Str})-(${link2Str})`,
                  },
                  visualPlan: techniques._buildSingleDigitChainVisualPlan(
                    num,
                    [
                      { cells: groupCells },
                      { cells: baseCells },
                      { cells: isRowVersion ? [[r2, c1]] : [[r1, c2]] },
                      { cells: [[r2, c2]] },
                    ],
                    [{ r: elimR, c: elimC, num }],
                    true,
                  ),
                };
                if (!findAll) return { change: true, res: resultObj };
                results.push(resultObj);
              }
            }
          }
        }
      }
      return findAll ? results : { change: false };
    };

    if (!findAll) {
      let result = logic(true);
      if (result.change) return result.res;
      result = logic(false);
      return result.change ? result.res : { change: false };
    }
    return [...logic(true), ...logic(false)];
  },

  // Gurth's Symmetrical Placement
});
