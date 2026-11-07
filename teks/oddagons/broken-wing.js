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
});
