Object.assign(techniques, {
  uniqueRectangleType7: (
    board,
    pencils,
    optionsOrFindAll = false,
    requestedFindAll = false,
  ) => {
    const options =
      optionsOrFindAll && typeof optionsOrFindAll === "object"
        ? optionsOrFindAll
        : {};
    const findAll =
      typeof optionsOrFindAll === "boolean"
        ? optionsOrFindAll
        : requestedFindAll;
    const avoidable = options.avoidable === true;
    const filledValues = avoidable
      ? techniques._getAvoidableFilledValues(board)
      : null;
    if (avoidable && !filledValues)
      return findAll ? [] : { change: false };
    const proofs = techniques._findUniqueRectangleType7(
      board,
      pencils,
      filledValues,
    );
    if (proofs.length === 0) return findAll ? [] : { change: false };

    const formatBasePosition = techniques._formatRectangleBounds;
    const formatGuardians = (cells, d1, d2) =>
      cells
        .flatMap(([r, c]) => {
          const guardians = [...pencils[r][c]]
            .filter((digit) => digit !== d1 && digit !== d2)
            .sort((a, b) => a - b)
            .join("");
          return guardians ? [`(${guardians})r${r + 1}c${c + 1}`] : [];
        })
        .join(",");
    const formatCellIds = (ids) => {
      const rows = [...new Set(ids.map((id) => Math.floor(id / 9) + 1))];
      const columns = [...new Set(ids.map((id) => (id % 9) + 1))];
      if (rows.length === 1) return `r${rows[0]}c${columns.join("")}`;
      if (columns.length === 1) return `r${rows.join("")}c${columns[0]}`;
      return ids
        .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
        .join(",");
    };
    const formatLinkDetails = (links) => {
      const bivalueCells = links
        .filter(({ kind }) => kind === "biCell")
        .map(({ endpoints }) => formatCellIds(endpoints[0]));
      const conjugatePairs = links
        .filter(({ kind }) => kind === "conjugate")
        .map(({ digit, endpoints }) => {
          const [leftId, rightId] = endpoints.flat();
          const leftRow = Math.floor(leftId / 9);
          const leftColumn = leftId % 9;
          const rightRow = Math.floor(rightId / 9);
          return `(${digit})${leftRow === rightRow ? "r" : "c"}${
            leftRow === rightRow ? leftRow + 1 : leftColumn + 1
          }`;
        });
      const groupedPairs = links
        .filter(({ kind }) => kind === "grouped")
        .map(({ endpoints }) => endpoints.map(formatCellIds).join(","));
      return [
        bivalueCells.length ? t("teks_UR_type_7_bivalue_cells", bivalueCells.join(",")) : null,
        conjugatePairs.length
          ? t("teks_UR_type_7_ConPairs", conjugatePairs.join(","))
          : null,
        groupedPairs.length ? t("teks_UR_type_7_grouped_ConPairs", groupedPairs.join(",")) : null,
      ]
        .filter(Boolean)
        .join(", ");
    };
    const buildVisualPlan = (
      cells,
      d1,
      d2,
      links,
      removals,
      placedCells,
    ) => {
      const placedIds = new Set(placedCells.map(([r, c]) => r * 9 + c));
      const cellColors = cells.map(([r, c]) => ({
        r,
        c,
        color: placedIds.has(r * 9 + c) ? 6 : 7,
      }));
      const candidateColors = cells.flatMap(([r, c]) =>
        Array.from(pencils[r][c], (num) => ({
          r,
          c,
          num,
          color: num === d1 || num === d2 ? 7 : 3,
        })),
      );
      const visualLinks = [];
      const coloredAuxiliary = new Set();
      links.forEach((link) => {
        if (link.kind === "biCell") return;

        if (link.kind === "grouped") {
          link.auxiliaryCells.forEach(([r, c]) => {
            const key = r * 9 + c;
            if (coloredAuxiliary.has(key)) return;
            coloredAuxiliary.add(key);
            cellColors.push({ r, c, color: 6 });
            if (pencils[r][c].has(link.digit)) {
              candidateColors.push({ r, c, num: link.digit, color: 4 });
            }
          });
        }

        const [left, right] = link.endpoints;
        if (right.length > 1) {
          for (let i = 0; i < right.length - 1; i++) {
            visualLinks.push({
              r1: Math.floor(right[i] / 9),
              c1: right[i] % 9,
              n1: link.digit,
              r2: Math.floor(right[i + 1] / 9),
              c2: right[i + 1] % 9,
              n2: link.digit,
              color: 4,
              style: "solid",
            });
          }
        }

        const leftId = left[0];
        const leftRow = Math.floor(leftId / 9);
        const leftColumn = leftId % 9;
        const rightId = right.reduce((nearest, id) => {
          if (nearest === null) return id;
          const distance =
            Math.abs(Math.floor(id / 9) - leftRow) +
            Math.abs((id % 9) - leftColumn);
          const nearestDistance =
            Math.abs(Math.floor(nearest / 9) - leftRow) +
            Math.abs((nearest % 9) - leftColumn);
          return distance < nearestDistance ? id : nearest;
        }, null);
        visualLinks.push({
          r1: leftRow,
          c1: leftColumn,
          n1: link.leftDigit,
          r2: Math.floor(rightId / 9),
          c2: rightId % 9,
          n2: link.digit,
          color: 0,
          style: "solid",
        });
      });

      return {
        highlight: { digit: null, state: 0 },
        cellColors,
        candidateColors,
        candidateMarks: removals.map(({ r, c, num }) => ({
          r,
          c,
          num,
          marker: "slash",
          color: 0,
        })),
        links: visualLinks,
      };
    };

    const results = proofs.map((proof) => {
      const { cells, digits, links, removals, placedCells = [] } = proof;
      const [d1, d2] = digits;
      return {
        change: true,
        type: "remove",
        cells: removals,
        hint: {
          name: t(avoidable ? "teks_AUR_type_7" : "teks_UR_type_7"),
          mainInfo: t(avoidable ? "teks_AR_digits" : "teks_UR_digits", d1, d2),
          detail: t(
            "teks_UR_type_7_base_guardians",
            d1,
            d2,
            formatBasePosition(cells),
            formatGuardians(cells, d1, d2),
            formatLinkDetails(links),
          ),
        },
        visualPlan: buildVisualPlan(
          cells,
          d1,
          d2,
          links,
          removals,
          placedCells,
        ),
      };
    });

    return findAll ? results : results[0];
  },

  avoidableRectangleType7: (board, pencils, findAll = false) =>
    techniques.uniqueRectangleType7(
      board,
      pencils,
      { avoidable: true },
      findAll,
    ),

  _findUniqueRectangleType7: (board, pencils, filledValues = null) => {
    const results = [];
    const seen = new Set();
    const rowCandidates = Array.from({ length: 10 }, () =>
      Array.from({ length: 9 }, () => []),
    );
    const colCandidates = Array.from({ length: 10 }, () =>
      Array.from({ length: 9 }, () => []),
    );
    const digitCandidates = Array.from({ length: 10 }, () => []);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const id = r * 9 + c;
        for (const digit of pencils[r][c]) {
          rowCandidates[digit][r].push(id);
          colCandidates[digit][c].push(id);
          digitCandidates[digit].push(id);
        }
      }
    }

    const candidateKey = (cellId, digit) => cellId * 10 + digit;
    const nodeKey = (members, digit) =>
      members.length === 1
        ? `c:${candidateKey(members[0], digit)}`
        : `g:${digit}:${[...members].sort((a, b) => a - b).join(".")}`;
    const makeNode = (members, digit) => ({
      id: nodeKey(members, digit),
      members: [...members],
      digit,
    });
    const makeLink = (kind, digit, leftMembers, rightMembers, data = {}) => ({
      kind,
      digit,
      leftDigit: data.leftDigit || digit,
      endpoints: [leftMembers, rightMembers],
      nodes: [
        makeNode(leftMembers, data.leftDigit || digit),
        makeNode(rightMembers, digit),
      ],
      auxiliaryCells: data.auxiliaryCells || [],
      label: data.label || "",
    });
    const hasCandidate = (id, digit) => {
      const placed = filledValues && filledValues[id];
      return placed
        ? placed === digit
        : pencils[Math.floor(id / 9)][id % 9].has(digit);
    };
    const isExactPair = (id, d1, d2) => {
      if (filledValues && filledValues[id]) return false;
      const cellPencils = pencils[Math.floor(id / 9)][id % 9];
      return (
        cellPencils.size === 2 && cellPencils.has(d1) && cellPencils.has(d2)
      );
    };
    const formatCell = (id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`;
    const formatHouse = (type, index, digit) =>
      `${digit}${type === "row" ? "r" : "c"}${index + 1}`;
    const sameMembers = (left, right) =>
      left.length === right.length && left.every((id) => right.includes(id));

    const closesDeadlyRectangle = (rectIds, digits, links, targetKey) => {
      const falseCandidates = new Set();
      const trueCandidates = new Set();
      const trueGroups = new Set();
      let contradiction = false;

      for (const id of rectIds) {
        for (const digit of digits) {
          if (!hasCandidate(id, digit)) {
            falseCandidates.add(candidateKey(id, digit));
          }
        }
        if (filledValues && filledValues[id]) {
          trueCandidates.add(candidateKey(id, filledValues[id]));
        }
      }

      const nodeIsFalse = (node) =>
        node.members.every((id) =>
          falseCandidates.has(candidateKey(id, node.digit)),
        );
      const setFalse = (key) => {
        if (trueCandidates.has(key)) contradiction = true;
        if (falseCandidates.has(key)) return false;
        falseCandidates.add(key);
        return true;
      };
      const setCandidateTrue = (key) => {
        if (falseCandidates.has(key)) contradiction = true;
        if (trueCandidates.has(key)) return false;
        trueCandidates.add(key);
        return true;
      };
      const setNodeTrue = (node) => {
        if (nodeIsFalse(node)) {
          contradiction = true;
          return false;
        }
        if (node.members.length === 1) {
          return setCandidateTrue(candidateKey(node.members[0], node.digit));
        }
        if (trueGroups.has(node.id)) return false;
        trueGroups.add(node.id);
        return true;
      };

      setCandidateTrue(targetKey);
      let changed = true;
      while (changed && !contradiction) {
        changed = false;

        for (const key of [...trueCandidates]) {
          const digit = key % 10;
          const id = Math.floor(key / 10);
          for (const otherDigit of digits) {
            if (otherDigit !== digit) {
              changed = setFalse(candidateKey(id, otherDigit)) || changed;
            }
          }
          for (const peerId of digitCandidates[digit]) {
            if (
              peerId !== id &&
              techniques._sees(
                [Math.floor(id / 9), id % 9],
                [Math.floor(peerId / 9), peerId % 9],
              )
            ) {
              changed = setFalse(candidateKey(peerId, digit)) || changed;
            }
          }
        }

        for (const link of links) {
          for (const node of link.nodes) {
            if (!trueGroups.has(node.id)) continue;
            for (const peerId of digitCandidates[node.digit]) {
              if (
                node.members.includes(peerId) ||
                !node.members.every((memberId) =>
                  techniques._sees(
                    [Math.floor(peerId / 9), peerId % 9],
                    [Math.floor(memberId / 9), memberId % 9],
                  ),
                )
              ) {
                continue;
              }
              changed = setFalse(candidateKey(peerId, node.digit)) || changed;
            }
          }
        }

        for (const link of links) {
          const [left, right] = link.nodes;
          if (nodeIsFalse(left)) changed = setNodeTrue(right) || changed;
          if (nodeIsFalse(right)) changed = setNodeTrue(left) || changed;
        }
      }

      if (contradiction) return false;
      const isTrue = (cellOffset, digit) =>
        trueCandidates.has(candidateKey(rectIds[cellOffset], digit));
      const [d1, d2] = digits;
      return (
        (isTrue(0, d1) && isTrue(1, d2) && isTrue(2, d2) && isTrue(3, d1)) ||
        (isTrue(0, d2) && isTrue(1, d1) && isTrue(2, d1) && isTrue(3, d2))
      );
    };

    // A placed corner supplies one of UR7's three propagation steps.
    const patterns = filledValues ? [
      [2, 0, 0],
      [1, 1, 0],
      [0, 2, 0],
      [1, 0, 1],
      [0, 1, 1],
      [0, 0, 2],
    ] : [
      [2, 1, 0],
      [1, 2, 0],
      [0, 3, 0],
      [2, 0, 1],
      [1, 1, 1],
      [0, 2, 1],
    ];

    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        for (let r1 = 0; r1 < 8; r1++) {
          for (let r2 = r1 + 1; r2 < 9; r2++) {
            for (let c1 = 0; c1 < 8; c1++) {
              for (let c2 = c1 + 1; c2 < 9; c2++) {
                const sameBand = Math.floor(r1 / 3) === Math.floor(r2 / 3);
                const sameStack = Math.floor(c1 / 3) === Math.floor(c2 / 3);
                if (sameBand === sameStack) continue;

                const rectIds = [
                  r1 * 9 + c1,
                  r1 * 9 + c2,
                  r2 * 9 + c1,
                  r2 * 9 + c2,
                ];
                const placedIds = filledValues
                  ? rectIds.filter((id) => filledValues[id] !== 0)
                  : [];
                if (filledValues && placedIds.length !== 1) {
                  continue;
                }
                if (
                  rectIds.some(
                    (id) => !hasCandidate(id, d1) && !hasCandidate(id, d2),
                  )
                ) {
                  continue;
                }

                const edges = [
                  { type: "row", index: r1, ids: [rectIds[0], rectIds[1]] },
                  { type: "row", index: r2, ids: [rectIds[2], rectIds[3]] },
                  { type: "col", index: c1, ids: [rectIds[0], rectIds[2]] },
                  { type: "col", index: c2, ids: [rectIds[1], rectIds[3]] },
                ];
                if (
                  edges.some((edge) =>
                    [d1, d2].some(
                      (digit) =>
                        !edge.ids.some((id) => hasCandidate(id, digit)),
                    ),
                  )
                ) {
                  continue;
                }

                const exactCount = rectIds.filter((id) =>
                  isExactPair(id, d1, d2),
                ).length;
                if (exactCount >= 3) continue;

                const biCellLinks = rectIds
                  .filter((id) => isExactPair(id, d1, d2))
                  .map((id) =>
                    makeLink("biCell", d2, [id], [id], {
                      leftDigit: d1,
                      label: `biCell ${formatCell(id)}`,
                    }),
                  );
                const conjugateLinks = [];
                const groupedLinks = [];

                for (const edge of edges) {
                  for (const digit of [d1, d2]) {
                    if (!edge.ids.every((id) => hasCandidate(id, digit))) {
                      continue;
                    }
                    const houseCandidates =
                      edge.type === "row"
                        ? rowCandidates[digit][edge.index]
                        : colCandidates[digit][edge.index];
                    if (sameMembers(houseCandidates, edge.ids)) {
                      conjugateLinks.push(
                        makeLink(
                          "conjugate",
                          digit,
                          [edge.ids[0]],
                          [edge.ids[1]],
                          { label: formatHouse(edge.type, edge.index, digit) },
                        ),
                      );
                      continue;
                    }

                    const groups = new Map();
                    for (const id of houseCandidates) {
                      const r = Math.floor(id / 9);
                      const c = id % 9;
                      const box = techniques._getBoxIndex(r, c);
                      if (!groups.has(box)) groups.set(box, []);
                      groups.get(box).push(id);
                    }
                    if (groups.size !== 2) continue;
                    const parts = [...groups.values()];
                    const singletonIndex = parts.findIndex(
                      (part) => part.length === 1,
                    );
                    if (singletonIndex < 0) continue;
                    const singleton = parts[singletonIndex];
                    const group = parts[1 - singletonIndex];
                    if (
                      group.length < 2 ||
                      !edge.ids.includes(singleton[0]) ||
                      !edge.ids.some((id) => group.includes(id))
                    ) {
                      continue;
                    }

                    groupedLinks.push(
                      makeLink("grouped", digit, singleton, group, {
                        auxiliaryCells: group
                          .filter((id) => !rectIds.includes(id))
                          .map((id) => [Math.floor(id / 9), id % 9]),
                        label:
                          `${formatHouse(edge.type, edge.index, digit)} grouped(` +
                          `${singleton.map(formatCell).join("")}|` +
                          `${group.map(formatCell).join("")})`,
                      }),
                    );
                  }
                }

                for (const combination of patterns) {
                  const [bCount, cCount, gCount] = combination;
                  if (
                    biCellLinks.length < bCount ||
                    conjugateLinks.length < cCount ||
                    groupedLinks.length < gCount
                  ) {
                    continue;
                  }
                  for (const bs of techniques.combinations(
                    biCellLinks,
                    bCount,
                  )) {
                    for (const cs of techniques.combinations(
                      conjugateLinks,
                      cCount,
                    )) {
                      for (const gs of techniques.combinations(
                        groupedLinks,
                        gCount,
                      )) {
                        const links = [...bs, ...cs, ...gs];
                        const removals = [];
                        for (const id of rectIds) {
                          if (filledValues && filledValues[id]) continue;
                          for (const digit of [d1, d2]) {
                            if (
                              hasCandidate(id, digit) &&
                              closesDeadlyRectangle(
                                rectIds,
                                [d1, d2],
                                links,
                                candidateKey(id, digit),
                              ) &&
                              // Every displayed link must be necessary for this
                              // target's proof, not merely present nearby.
                              links.every((unused, index) =>
                                !closesDeadlyRectangle(
                                  rectIds,
                                  [d1, d2],
                                  links.filter((link, i) => i !== index),
                                  candidateKey(id, digit),
                                ),
                              )
                            ) {
                              removals.push({
                                r: Math.floor(id / 9),
                                c: id % 9,
                                num: digit,
                              });
                            }
                          }
                        }
                        if (removals.length === 0) continue;
                        const uniqueRemovals = _getUniqueRemovals(removals);
                        const signature =
                          `${d1}${d2}:${rectIds.join(".")}:` +
                          uniqueRemovals
                            .map(({ r, c, num }) => `${r * 9 + c}.${num}`)
                            .sort()
                            .join("|");
                        if (seen.has(signature)) continue;
                        seen.add(signature);
                        results.push({
                          cells: rectIds.map((id) => [
                            Math.floor(id / 9),
                            id % 9,
                          ]),
                          digits: [d1, d2],
                          links,
                          combination,
                          removals: uniqueRemovals,
                          placedCells: placedIds.map((id) => [
                            Math.floor(id / 9),
                            id % 9,
                          ]),
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return results;
  },
});
