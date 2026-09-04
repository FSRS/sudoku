Object.assign(techniques, {
  brokenWing: (board, pencils, findAll = false) => {
    const results = [];

    const getCompactLoc = (cellIds) => {
      if (cellIds.length === 0) return "";
      if (cellIds.length === 1)
        return `r${Math.floor(cellIds[0] / 9) + 1}c${(cellIds[0] % 9) + 1}`;

      const rows = new Set(cellIds.map((id) => Math.floor(id / 9)));
      const cols = new Set(cellIds.map((id) => id % 9));

      // Group by the dimension that produces fewer groups
      const groupByRow = rows.size <= cols.size;
      const groups = new Map();

      for (const id of cellIds) {
        const r = Math.floor(id / 9);
        const c = id % 9;
        const key = groupByRow ? r : c;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(groupByRow ? c : r);
      }

      return Array.from(groups.entries())
        .sort(([k1], [k2]) => k1 - k2)
        .map(([key, values]) => {
          const positions = values
            .sort((a, b) => a - b)
            .map((value) => value + 1)
            .join("");
          return groupByRow
            ? `r${key + 1}c${positions}`
            : `r${positions}c${key + 1}`;
        })
        .join(",");
    };

    // The odd-length loop itself may use at most two cells from each house.
    // Guardians are deliberately excluded: they are tracked separately and can
    // share houses with the loop (or with other guardians).
    const canExtendOddLoop = (path, id) => {
      const row = Math.floor(id / 9);
      const col = id % 9;
      const box = techniques._getBoxIndex(row, col);
      let rowCount = 0;
      let colCount = 0;
      let boxCount = 0;

      for (const pathId of path) {
        const pathRow = Math.floor(pathId / 9);
        const pathCol = pathId % 9;
        if (pathRow === row) rowCount++;
        if (pathCol === col) colCount++;
        if (techniques._getBoxIndex(pathRow, pathCol) === box) boxCount++;
      }

      return rowCount < 2 && colCount < 2 && boxCount < 2;
    };

    // Check all candidates at the shortest valid odd loop length before
    // considering loops that are two cells longer.
    const maxLen = 11;
    for (let pathLength = 5; pathLength <= maxLen; pathLength += 2) {
      for (let num = 1; num <= 9; num++) {
        const templating = techniques._getTemplating(board, pencils, num);
        const { cellsWithNum, allNumMask, units } = templating;

        if (cellsWithNum.length < 5) continue;

        const adj = {};
        for (let i = 0; i < cellsWithNum.length; i++) {
          adj[cellsWithNum[i]] = [];
        }

        // --- TEMPLATING STEP (Optimization) ---
        for (let i = 0; i < 27; i++) {
          const present = units[i];
          if (present.length >= 2) {
            for (let p1 = 0; p1 < present.length; p1++) {
              for (let p2 = p1 + 1; p2 < present.length; p2++) {
                const u = present[p1];
                const v = present[p2];
                const guards = present.filter((id) => id !== u && id !== v);
                adj[u].push({ to: v, guardians: guards });
                adj[v].push({ to: u, guardians: guards });
              }
            }
          }
        }

        for (const start of cellsWithNum) {
          const stack = [
            {
              current: start,
              path: [start],
              guards: new Set(),
              targets: allNumMask,
            },
          ];

          while (stack.length > 0) {
            const { current, path, guards, targets } = stack.pop();
            if (path.length > pathLength) continue;

            for (const edge of adj[current]) {
              let edgeTargets = targets;

              for (const g of edge.guardians) {
                edgeTargets &= PEER_MAP[g];
              }

              // --- Pruning Step ---
              if (edgeTargets === 0n) continue;

              if (edge.to === start && path.length === pathLength) {
                const cycleGuards = new Set(guards);
                edge.guardians.forEach((g) => cycleGuards.add(g));

                if (cycleGuards.size > 0) {
                  const removals = [];
                  let tempTargets = edgeTargets;
                  let i = 0;
                  while (tempTargets > 0n) {
                    if ((tempTargets & 1n) !== 0n) {
                      removals.push({ r: Math.floor(i / 9), c: i % 9, num });
                    }
                    tempTargets >>= 1n;
                    i++;
                  }

                  if (removals.length > 0) {
                    const cycleGuardsArr = Array.from(cycleGuards);
                    const guardCells = Array.from(cycleGuards).map((id) =>
                      techniques._idToCell(id),
                    );
                    const pathStr =
                      path
                        .map(
                          (id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`,
                        )
                        .join("-") + "-";
                    const guardStr = getCompactLoc(cycleGuardsArr);

                    const res = {
                      change: true,
                      type: "remove",
                      cells: removals,
                      hint: {
                        name: t("teks_msg_190"),
                        mainInfo: t("teks_msg_191", num),
                        detail: t("teks_msg_192", num, pathStr, guardStr),
                      },
                      visualPlan: {
                        highlight: { digit: num, state: 1 },
                        cellColors: [
                          ...path.map((id) => ({
                            r: Math.floor(id / 9),
                            c: id % 9,
                            color: 6,
                            mode: "add",
                          })),
                          ...guardCells.map(([r, c]) => ({
                            r,
                            c,
                            color: 4,
                            mode: "add",
                          })),
                        ],
                        candidateColors: [
                          ...path.map((id) => ({
                            r: Math.floor(id / 9),
                            c: id % 9,
                            num,
                            color: 4,
                          })),
                          ...guardCells.map(([r, c]) => ({
                            r,
                            c,
                            num,
                            color: 3,
                          })),
                        ],
                        candidateMarks: removals.map(({ r, c }) => ({
                          r,
                          c,
                          num,
                          marker: "slash",
                          color: 0,
                        })),
                      },
                    };

                    const removalKey = removals
                      .map((r) => `${r.r},${r.c},${r.num}`)
                      .sort()
                      .join(";");
                    const exists = results.some(
                      (r) =>
                        r.cells
                          .map((x) => `${x.r},${x.c},${x.num}`)
                          .sort()
                          .join(";") === removalKey,
                    );
                    if (!exists) {
                      if (!findAll) return res;
                      results.push(res);
                    }
                  }
                }
              } else if (
                path.length < pathLength &&
                !path.includes(edge.to) &&
                edge.to > start &&
                canExtendOddLoop(path, edge.to)
              ) {
                const newGuards = new Set(guards);
                edge.guardians.forEach((g) => newGuards.add(g));
                stack.push({
                  current: edge.to,
                  path: [...path, edge.to],
                  guards: newGuards,
                  targets: edgeTargets,
                });
              }
            }
          }
        }
      }
    }
    return findAll ? results : { change: false };
  },
});
