Object.assign(techniques, {
  _brokenWingLink: (house, houseIds, left, right, targets) => {
    const overlap = left.mask & right.mask;
    if (overlap !== 0n && house < 18) return null;
    if ((left.mask & ~overlap) === 0n ||
        (right.mask & ~overlap) === 0n) return null;

    const houseMask = houseIds.reduce((mask, id) => mask | CELL_MASK[id], 0n);
    const guardMask = (houseMask & ~(left.mask | right.mask)) | overlap;
    const guardians = houseIds.filter((id) =>
      (guardMask & CELL_MASK[id]) !== 0n);
    for (const id of guardians) targets &= PEER_MAP[id];
    return targets === 0n ? null : { house, guardians, guardMask, targets };
  },

  _brokenWingSearch: (board, pencils, grouped, findAll) => {
    const results = [];
    const seenRemovals = new Set();
    const graphs = [];
    const maxLength = 11;

    const canExtendClassic = (path, nodes, id) => {
      const row = Math.floor(id / 9);
      const col = id % 9;
      const box = techniques._getBoxIndex(row, col);
      let rowCount = 0;
      let colCount = 0;
      let boxCount = 0;
      for (const index of path) {
        const pathId = nodes[index].ids[0];
        const pathRow = Math.floor(pathId / 9);
        const pathCol = pathId % 9;
        if (pathRow === row) rowCount++;
        if (pathCol === col) colCount++;
        if (techniques._getBoxIndex(pathRow, pathCol) === box) boxCount++;
      }
      return rowCount < 2 && colCount < 2 && boxCount < 2;
    };

    for (let num = 1; num <= 9; num++) {
      const { units, cellsWithNum } = techniques._getTemplating(board, pencils, num);
      if (cellsWithNum.length < 5) continue;
      const { impossibleMask } = techniques._getTemplatePatterns(board, pencils, num);
      if (impossibleMask === 0n) continue;

      const nodes = [];
      const seenNodes = new Set();
      const addNode = (ids) => {
        const sorted = [...ids].sort((a, b) => a - b);
        const key = sorted.join(",");
        if (seenNodes.has(key)) return;
        seenNodes.add(key);
        nodes.push({
          ids: sorted,
          mask: sorted.reduce((mask, id) => mask | CELL_MASK[id], 0n),
          grouped: sorted.length > 1,
        });
      };
      for (const id of cellsWithNum) addNode([id]);
      if (grouped) {
        for (let box = 0; box < 9; box++) {
          for (let line = 0; line < 18; line++) {
            const intersection = units[18 + box].filter((id) =>
              line < 9 ? Math.floor(id / 9) === line : id % 9 === line - 9);
            if (intersection.length > 1) addNode(intersection);
          }
        }
      }

      const adjacency = nodes.map(() => []);
      const seenEdges = new Set();
      for (let house = 0; house < 27; house++) {
        const houseIds = units[house];
        if (houseIds.length < 2) continue;
        const houseMask = houseIds.reduce((mask, id) => mask | CELL_MASK[id], 0n);
        const members = nodes.map((node, index) => ({ node, index }))
          .filter(({ node }) => (node.mask & houseMask) === node.mask);
        for (let a = 0; a < members.length; a++) {
          for (let b = a + 1; b < members.length; b++) {
            const left = members[a];
            const right = members[b];
            // A shared box-line candidate is a guardian. Neither effective
            // loop node contains it when all guardians are false.
            const edge = techniques._brokenWingLink(
              house, houseIds, left.node, right.node, impossibleMask);
            if (!edge) continue;
            const key = `${left.index}:${right.index}:${edge.guardMask}`;
            if (grouped && seenEdges.has(key)) continue;
            seenEdges.add(key);
            adjacency[left.index].push({ to: right.index, ...edge });
            adjacency[right.index].push({ to: left.index, ...edge });
          }
        }
      }

      const makeResult = (path, links, guardsMask, targets) => {
        const cells = cellsWithNum.filter((id) =>
          (targets & CELL_MASK[id]) !== 0n)
          .map((id) => ({ r: Math.floor(id / 9), c: id % 9, num }));
        if (cells.length === 0) return null;
        const key = cells.map(({ r, c }) => `${r},${c}`).join(";") + `:${num}`;
        if (seenRemovals.has(key)) return null;
        seenRemovals.add(key);

        const guardIds = cellsWithNum.filter((id) =>
          (guardsMask & CELL_MASK[id]) !== 0n);
        const pathIds = path.flatMap((index) => nodes[index].ids);
        const pathText = path.map((index) =>
          techniques._formatCellsRC(nodes[index].ids)).join("-") + "-";
        const tlg = techniques._tlgBuilder(cells);
        for (const { house } of links) {
          const kind = ["row", "col", "box"][Math.floor(house / 9)];
          tlg.truth({ kind, index: house % 9, digit: num });
        }
        const guardians = guardIds.map((id) => [id, num]);
        for (const { r, c } of cells) {
          tlg.connect([[r * 9 + c, num]], guardians);
        }
        const result = {
          change: true,
          type: "remove",
          cells,
          hint: {
            name: t(grouped ? "teks_grouped_BW" : "teks_BW"),
            mainInfo: t("teks_BW_digit", num),
            detail: t("teks_BW_guardians", num, pathText,
              techniques._formatCellsRC(guardIds)),
          },
          visualPlan: {
            highlight: { digit: num, state: 1 },
            cellColors: [
              ...pathIds.map((id) => ({
                r: Math.floor(id / 9), c: id % 9, color: 6, mode: "add",
              })),
              ...guardIds.map((id) => ({
                r: Math.floor(id / 9), c: id % 9, color: 4, mode: "add",
              })),
            ],
            candidateColors: [
              ...pathIds.map((id) => ({
                r: Math.floor(id / 9), c: id % 9, num, color: 4,
              })),
              ...guardIds.map((id) => ({
                r: Math.floor(id / 9), c: id % 9, num, color: 3,
              })),
            ],
            candidateMarks: cells.map(({ r, c }) => ({
              r, c, num, marker: "slash", color: 0,
            })),
          },
          tlg: tlg.logic(),
        };
        if (grouped) {
          result.groupedBrokenWing = {
            digit: num,
            nodes: path.map((index) => nodes[index].ids),
            links: links.map((edge) => ({
              house: edge.house,
              guardians: edge.guardians,
            })),
            guardians: guardIds,
          };
        }
        return result;
      };

      graphs.push({ nodes, adjacency, impossibleMask, makeResult });
    }

    // Search lengths globally so the first explanation has the fewest nodes.
    for (let pathLength = 5; pathLength <= maxLength; pathLength += 2) {
      for (const { nodes, adjacency, impossibleMask, makeResult } of graphs) {
        for (let start = 0; start < nodes.length; start++) {
          if (adjacency[start].length < 2) continue;
          const stack = [{ path: [start], targets: impossibleMask,
            links: [], guardsMask: 0n, hasGroup: nodes[start].grouped }];
          while (stack.length) {
            const state = stack.pop();
            const current = state.path.at(-1);
            for (const edge of adjacency[current]) {
              const targets = state.targets & edge.targets;
              if (targets === 0n) continue;
              const guardsMask = state.guardsMask | edge.guardMask;
              if (edge.to === start) {
                if (state.path.length !== pathLength ||
                    (grouped && !state.hasGroup) || guardsMask === 0n) continue;
                const result = makeResult(state.path, [...state.links, edge],
                  guardsMask, targets);
                if (result) {
                  if (!findAll) return result;
                  results.push(result);
                }
                continue;
              }
              if (state.path.length >= pathLength || edge.to <= start ||
                  state.path.includes(edge.to)) continue;
              if (grouped) {
                // Nonadjacent nodes must be disjoint. Adjacent overlap is
                // allowed only on a box edge and becomes a guardian.
                const nextMask = nodes[edge.to].mask;
                if (state.path.slice(0, -1).some((index) =>
                  (nodes[index].mask & nextMask) !== 0n)) continue;
              } else if (!canExtendClassic(state.path, nodes,
                nodes[edge.to].ids[0])) continue;
              stack.push({ path: [...state.path, edge.to],
                links: [...state.links, edge], targets, guardsMask,
                hasGroup: state.hasGroup || nodes[edge.to].grouped });
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },

  brokenWing: (board, pencils, findAll = false) =>
    techniques._brokenWingSearch(board, pencils, false, findAll),

  groupedBrokenWing: (board, pencils, findAll = false) =>
    techniques._brokenWingSearch(board, pencils, true, findAll),

  // An odd loop of nodes, each link a different house, proves one of its
  // guardians true. One loop is kept per distinct guardian set.
  _brokenWingGuardianPatterns: (board, pencils) => {
    const patterns = [];
    const maxLength = 11;
    const lowestCell = (m0, m1, m2) =>
      m0 ? lowest(m0) : m1 ? 27 + lowest(m1) : 54 + lowest(m2);
    const unitOf = new Uint8Array(243);
    for (let id = 0; id < 81; id++) {
      unitOf[id * 3] = Math.floor(id / 9) * 3;
      unitOf[id * 3 + 1] = (9 + (id % 9)) * 3;
      unitOf[id * 3 + 2] = (18 + boxOf(Math.floor(id / 9), id % 9)) * 3;
    }
    const inOneHouse = (m0, m1, m2) => {
      if ((m0 | m1 | m2) === 0) return true;
      const id = lowestCell(m0, m1, m2);
      for (let kind = 0; kind < 3; kind++) {
        const u = unitOf[id * 3 + kind];
        if (
          ((m0 & ~UNIT_POS[u]) | (m1 & ~UNIT_POS[u + 1]) | (m2 & ~UNIT_POS[u + 2])) ===
          0
        ) {
          return true;
        }
      }
      return false;
    };
    const coverable = (m0, m1, m2) => {
      if ((m0 | m1 | m2) === 0) return true;
      const id = lowestCell(m0, m1, m2);
      for (let kind = 0; kind < 3; kind++) {
        const u = unitOf[id * 3 + kind];
        if (inOneHouse(m0 & ~UNIT_POS[u], m1 & ~UNIT_POS[u + 1], m2 & ~UNIT_POS[u + 2])) {
          return true;
        }
      }
      return false;
    };

    for (let num = 1; num <= 9; num++) {
      const pos = [0, 0, 0];
      const single = [0, 0, 0];
      let count = 0;
      for (let id = 0; id < 81; id++) {
        const r = Math.floor(id / 9);
        const c = id % 9;
        if (board[r][c] !== 0 || !pencils[r][c].has(num)) continue;
        pos[CELL_PART[id]] |= CELL_BIT[id];
        if (pencils[r][c].size === 1) single[CELL_PART[id]] |= CELL_BIT[id];
        count++;
      }
      if (count < 5) continue;
      const house = new Int32Array(81);
      for (let h = 0; h < 27; h++) {
        for (let p = 0; p < 3; p++) house[h * 3 + p] = UNIT_POS[h * 3 + p] & pos[p];
      }
      // A guardian set holding a whole house of the digit, or a cell's last
      // candidate, is true without the loop.
      const trivial = (m0, m1, m2) => {
        if ((m0 & single[0]) | (m1 & single[1]) | (m2 & single[2])) return true;
        for (let h = 0; h < 27; h++) {
          const a = house[h * 3];
          const b = house[h * 3 + 1];
          const c = house[h * 3 + 2];
          if ((a | b | c) !== 0 && (a & ~m0) === 0 && (b & ~m1) === 0 && (c & ~m2) === 0) {
            return true;
          }
        }
        return false;
      };

      const nodeMask = [];
      const seenNodes = new Set();
      const addNode = (m0, m1, m2) => {
        const key = `${m0},${m1},${m2}`;
        if (seenNodes.has(key)) return;
        seenNodes.add(key);
        nodeMask.push(m0, m1, m2);
      };
      for (let id = 0; id < 81; id++) {
        if (pos[CELL_PART[id]] & CELL_BIT[id]) {
          const m = [0, 0, 0];
          m[CELL_PART[id]] = CELL_BIT[id];
          addNode(m[0], m[1], m[2]);
        }
      }
      for (let box = 0; box < 9; box++) {
        for (let line = 0; line < 18; line++) {
          const b = (18 + box) * 3;
          const l = line * 3;
          const m0 = house[b] & house[l];
          const m1 = house[b + 1] & house[l + 1];
          const m2 = house[b + 2] & house[l + 2];
          if (pop(m0) + pop(m1) + pop(m2) > 1) addNode(m0, m1, m2);
        }
      }
      const nodeCount = nodeMask.length / 3;

      const adjacency = Array.from({ length: nodeCount }, () => []);
      const seenEdges = new Set();
      for (let h = 0; h < 27; h++) {
        const h0 = house[h * 3];
        const h1 = house[h * 3 + 1];
        const h2 = house[h * 3 + 2];
        if (pop(h0) + pop(h1) + pop(h2) < 2) continue;
        const members = [];
        for (let n = 0; n < nodeCount; n++) {
          if (
            (nodeMask[n * 3] & ~h0) === 0 &&
            (nodeMask[n * 3 + 1] & ~h1) === 0 &&
            (nodeMask[n * 3 + 2] & ~h2) === 0
          ) {
            members.push(n);
          }
        }
        for (let i = 0; i < members.length; i++) {
          for (let j = i + 1; j < members.length; j++) {
            const a = members[i] * 3;
            const b = members[j] * 3;
            const o0 = nodeMask[a] & nodeMask[b];
            const o1 = nodeMask[a + 1] & nodeMask[b + 1];
            const o2 = nodeMask[a + 2] & nodeMask[b + 2];
            if ((o0 | o1 | o2) !== 0 && h < 18) continue;
            if (
              ((nodeMask[a] & ~o0) | (nodeMask[a + 1] & ~o1) | (nodeMask[a + 2] & ~o2)) === 0 ||
              ((nodeMask[b] & ~o0) | (nodeMask[b + 1] & ~o1) | (nodeMask[b + 2] & ~o2)) === 0
            ) {
              continue;
            }
            const g0 = (h0 & ~(nodeMask[a] | nodeMask[b])) | o0;
            const g1 = (h1 & ~(nodeMask[a + 1] | nodeMask[b + 1])) | o1;
            const g2 = (h2 & ~(nodeMask[a + 2] | nodeMask[b + 2])) | o2;
            const key = `${members[i]}:${members[j]}:${g0},${g1},${g2}`;
            if (seenEdges.has(key)) continue;
            seenEdges.add(key);
            adjacency[members[i]].push({ to: members[j], house: h, g0, g1, g2 });
            adjacency[members[j]].push({ to: members[i], house: h, g0, g1, g2 });
          }
        }
      }

      const found = new Set();
      const path = [];
      const houses = [];
      const record = (g0, g1, g2) => {
        const key = `${g0},${g1},${g2}`;
        if (found.has(key)) return;
        found.add(key);
        const ids = [];
        const guardians = [];
        const baseCands = [];
        const seen = new Set();
        for (const n of path) {
          for (let p = 0; p < 3; p++) {
            for (let m = nodeMask[n * 3 + p]; m; m &= m - 1) {
              const id = p * 27 + lowest(m);
              if (seen.has(id)) continue;
              seen.add(id);
              ids.push(id);
              if (!((p === 0 ? g0 : p === 1 ? g1 : g2) & (1 << (id - p * 27)))) {
                baseCands.push([id, num]);
              }
            }
          }
        }
        for (let p = 0; p < 3; p++) {
          for (let m = p === 0 ? g0 : p === 1 ? g1 : g2; m; m &= m - 1) {
            guardians.push([p * 27 + lowest(m), num]);
          }
        }
        patterns.push({
          kind: "BW",
          digits: [num],
          cells: ids,
          houses: houses.slice(),
          guardians,
          baseCands,
        });
      };

      const extend = (start, current, used, i0, i1, i2, g0, g1, g2) => {
        for (const edge of adjacency[current]) {
          if ((used >> edge.house) & 1) continue;
          const n0 = g0 | edge.g0;
          const n1 = g1 | edge.g1;
          const n2 = g2 | edge.g2;
          if (edge.to === start) {
            if (path.length < 5 || path.length % 2 === 0) continue;
            if ((n0 | n1 | n2) === 0) continue;
          } else {
            if (path.length >= maxLength || edge.to < start) continue;
            const t = edge.to * 3;
            if ((i0 & nodeMask[t]) | (i1 & nodeMask[t + 1]) | (i2 & nodeMask[t + 2])) {
              continue;
            }
          }
          if (
            (n0 !== g0 || n1 !== g1 || n2 !== g2) &&
            (!coverable(n0, n1, n2) || trivial(n0, n1, n2))
          ) {
            continue;
          }
          houses.push(edge.house);
          if (edge.to === start) {
            record(n0, n1, n2);
          } else {
            const c = current * 3;
            path.push(edge.to);
            extend(
              start,
              edge.to,
              used | (1 << edge.house),
              i0 | nodeMask[c],
              i1 | nodeMask[c + 1],
              i2 | nodeMask[c + 2],
              n0,
              n1,
              n2,
            );
            path.pop();
          }
          houses.pop();
        }
      };

      for (let start = 0; start < nodeCount; start++) {
        if (adjacency[start].length < 2) continue;
        path.push(start);
        extend(start, start, 0, 0, 0, 0, 0, 0, 0);
        path.pop();
      }
    }
    return patterns;
  },
});
