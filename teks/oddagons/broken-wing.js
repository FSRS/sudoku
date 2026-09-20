Object.assign(techniques, {
  brokenWing: (board, pencils, findAll = false) => {
    const results = [];
    const getCompactLoc = techniques._formatCellsRC;
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

    const maxLen = 11;
    for (let pathLength = 5; pathLength <= maxLen; pathLength += 2) {
      for (let num = 1; num <= 9; num++) {
        const templating = techniques._getTemplating(board, pencils, num);
        const { cellsWithNum, allNumMask, units } = templating;

        if (cellsWithNum.length < 5) continue;

        // Templating Step
        const { impossibleMask } = techniques._getTemplatePatterns(
          board,
          pencils,
          num,
        );
        if (impossibleMask === 0n) continue;

        const adj = {};
        for (let i = 0; i < cellsWithNum.length; i++) {
          adj[cellsWithNum[i]] = [];
        }

        // Link Graph
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
              targets: allNumMask & impossibleMask,
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

              // Pruning Step
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
                        name: t("teks_BW"),
                        mainInfo: t("teks_BW_digit", num),
                        detail: t("teks_BW_guardians", num, pathStr, guardStr),
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
