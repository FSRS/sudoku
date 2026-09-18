var UR7_RECTANGLE_GEOMETRIES = (() => {
  const geometries = [];
  for (let r1 = 0; r1 < 8; r1++) {
    for (let r2 = r1 + 1; r2 < 9; r2++) {
      for (let c1 = 0; c1 < 8; c1++) {
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const sameBand = Math.floor(r1 / 3) === Math.floor(r2 / 3);
          const sameStack = Math.floor(c1 / 3) === Math.floor(c2 / 3);
          if (sameBand === sameStack) continue;

          const rectIds = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
          geometries.push({
            rectIds,
            edges: [
              { type: "row", index: r1, ids: [rectIds[0], rectIds[1]] },
              { type: "row", index: r2, ids: [rectIds[2], rectIds[3]] },
              { type: "col", index: c1, ids: [rectIds[0], rectIds[2]] },
              { type: "col", index: c2, ids: [rectIds[1], rectIds[3]] },
            ],
          });
        }
      }
    }
  }
  return geometries;
})();

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
    if (avoidable && !filledValues) return findAll ? [] : { change: false };
    const proofs = techniques._findUniqueRectangleType7(
      board,
      pencils,
      filledValues,
      !findAll,
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
    const formatCellIds = techniques._formatCellsRC;
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
        bivalueCells.length
          ? t("teks_UR_type_7_bivalue_cells", bivalueCells.join(","))
          : null,
        conjugatePairs.length
          ? t("teks_UR_type_7_ConPairs", conjugatePairs.join(","))
          : null,
        groupedPairs.length
          ? t("teks_UR_type_7_grouped_ConPairs", groupedPairs.join(","))
          : null,
      ]
        .filter(Boolean)
        .join(", ");
    };
    const buildVisualPlan = (cells, d1, d2, links, removals, placedCells) => {
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

  _findUniqueRectangleType7: (
    board,
    pencils,
    filledValues = null,
    firstOnly = false,
  ) => {
    const results = [];
    if (filledValues && !filledValues.some(Boolean)) return results;
    const rectangleGeometries = filledValues ? [] : UR7_RECTANGLE_GEOMETRIES;
    if (filledValues) {
      for (const geometry of UR7_RECTANGLE_GEOMETRIES) {
        const placedIds = geometry.rectIds.filter(
          (id) => filledValues[id] !== 0,
        );
        if (placedIds.length === 1) {
          rectangleGeometries.push({ geometry, placedIds });
        }
      }
    }
    const g = buildGrid(pencils);
    let cellMask = g.cand;
    if (filledValues) {
      cellMask = new Uint16Array(g.cand);
      for (let id = 0; id < 81; id++) {
        const value = filledValues[id];
        if (value) cellMask[id] = 1 << (value - 1);
      }
    }
    const pairBuckets = new Array(81);
    for (const entry of rectangleGeometries) {
      const ids = (filledValues ? entry.geometry : entry).rectIds;
      const m0 = cellMask[ids[0]];
      const m1 = cellMask[ids[1]];
      const m2 = cellMask[ids[2]];
      const m3 = cellMask[ids[3]];
      let shared = (m0 | m1) & (m2 | m3) & (m0 | m2) & (m1 | m3);
      while (shared) {
        const low = lowest(shared);
        shared &= shared - 1;
        let rest = shared;
        while (rest) {
          const high = lowest(rest);
          rest &= rest - 1;
          const pair = (1 << low) | (1 << high);
          if (!(m0 & pair) || !(m1 & pair) || !(m2 & pair) || !(m3 & pair)) {
            continue;
          }
          const index = low * 9 + high;
          const bucket = pairBuckets[index];
          if (bucket) bucket.push(entry);
          else pairBuckets[index] = [entry];
        }
      }
    }

    const seen = new Set();
    const candidateKey = (cellId, digit) => cellId * 10 + digit;
    const nodeKey = (members, digit) =>
      members.length === 1
        ? candidateKey(members[0], digit)
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
    });
    const hasCandidate = (id, digit) => {
      const placed = filledValues && filledValues[id];
      return placed
        ? placed === digit
        : pencils[Math.floor(id / 9)][id % 9].has(digit);
    };

    const closesDeadlyRectangle = (rectIds, digits, links, targetKey) => {
      const falseCandidates = new Set();
      const trueCandidates = new Set();
      const trueGroups = new Set();
      const trueCandidateQueue = [];
      const trueGroupQueue = [];
      let candidateHead = 0;
      let groupHead = 0;
      let linksDirty = true;
      let contradiction = false;

      const nodeIsFalse = (node) =>
        node.members.every((id) =>
          falseCandidates.has(candidateKey(id, node.digit)),
        );
      const setFalse = (key) => {
        if (trueCandidates.has(key)) contradiction = true;
        if (falseCandidates.has(key)) return false;
        falseCandidates.add(key);
        linksDirty = true;
        return true;
      };
      const setCandidateTrue = (key) => {
        if (falseCandidates.has(key)) contradiction = true;
        if (trueCandidates.has(key)) return false;
        trueCandidates.add(key);
        trueCandidateQueue.push(key);
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
        trueGroupQueue.push(node);
        return true;
      };

      for (const id of rectIds) {
        for (const digit of digits) {
          if (!hasCandidate(id, digit)) {
            falseCandidates.add(candidateKey(id, digit));
          }
        }
        if (filledValues && filledValues[id]) {
          setCandidateTrue(candidateKey(id, filledValues[id]));
        }
      }
      setCandidateTrue(targetKey);
      while (
        (candidateHead < trueCandidateQueue.length ||
          groupHead < trueGroupQueue.length ||
          linksDirty) &&
        !contradiction
      ) {
        while (candidateHead < trueCandidateQueue.length && !contradiction) {
          const key = trueCandidateQueue[candidateHead++];
          const digit = key % 10;
          const id = Math.floor(key / 10);
          for (const otherDigit of digits) {
            if (otherDigit !== digit) {
              setFalse(candidateKey(id, otherDigit));
            }
          }
          for (let part = 0; part < 3; part++) {
            let peers = PEER[id * 3 + part] & g.pos[(digit - 1) * 3 + part];
            while (peers) {
              setFalse(candidateKey(part * 27 + lowest(peers), digit));
              peers &= peers - 1;
            }
          }
        }

        while (groupHead < trueGroupQueue.length && !contradiction) {
          const node = trueGroupQueue[groupHead++];
          const { members, digit } = node;
          for (let part = 0; part < 3; part++) {
            let peers = g.pos[(digit - 1) * 3 + part];
            for (const memberId of members) peers &= PEER[memberId * 3 + part];
            while (peers) {
              setFalse(candidateKey(part * 27 + lowest(peers), digit));
              peers &= peers - 1;
            }
          }
        }

        if (!linksDirty || contradiction) continue;
        linksDirty = false;
        for (const link of links) {
          const [left, right] = link.nodes;
          if (nodeIsFalse(left)) setNodeTrue(right);
          if (nodeIsFalse(right)) setNodeTrue(left);
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

    const patterns = filledValues
      ? [
          [2, 0, 0],
          [1, 1, 0],
          [0, 2, 0],
          [1, 0, 1],
          [0, 1, 1],
          [0, 0, 2],
        ]
      : [
          [2, 1, 0],
          [1, 2, 0],
          [0, 3, 0],
          [2, 0, 1],
          [1, 1, 1],
          [0, 2, 1],
        ];

    for (let d1 = 1; d1 <= 8; d1++) {
      for (let d2 = d1 + 1; d2 <= 9; d2++) {
        const bucket = pairBuckets[(d1 - 1) * 9 + (d2 - 1)];
        if (!bucket) continue;
        const pairMask = (1 << (d1 - 1)) | (1 << (d2 - 1));
        for (const entry of bucket) {
          const geometry = filledValues ? entry.geometry : entry;
          const { rectIds, edges } = geometry;
          const placedIds = filledValues ? entry.placedIds : [];
          const biCellLinks = [];
          for (const id of rectIds) {
            if (cellMask[id] === pairMask) biCellLinks.push(id);
          }
          if (biCellLinks.length >= 3) continue;
          for (let i = 0; i < biCellLinks.length; i++) {
            const id = biCellLinks[i];
            biCellLinks[i] = makeLink("biCell", d2, [id], [id], {
              leftDigit: d1,
            });
          }
          const conjugateLinks = [];
          const groupedLinks = [];

          for (const edge of edges) {
            const [idA, idB] = edge.ids;
            const isRow = edge.type === "row";
            for (let which = 0; which < 2; which++) {
              const digit = which === 0 ? d1 : d2;
              const digitBit = 1 << (digit - 1);
              if (!(cellMask[idA] & digitBit) || !(cellMask[idB] & digitBit)) {
                continue;
              }
              const houseBits = isRow
                ? g.row[(digit - 1) * 9 + edge.index]
                : g.col[(digit - 1) * 9 + edge.index];
              const edgeBits = isRow
                ? (1 << (idA % 9)) | (1 << (idB % 9))
                : (1 << ((idA / 9) | 0)) | (1 << ((idB / 9) | 0));
              if (houseBits === edgeBits) {
                conjugateLinks.push(makeLink("conjugate", digit, [idA], [idB]));
                continue;
              }

              const groups = new Map();
              let houseRest = houseBits;
              while (houseRest) {
                const offset = lowest(houseRest);
                houseRest &= houseRest - 1;
                const r = isRow ? edge.index : offset;
                const c = isRow ? offset : edge.index;
                const id = r * 9 + c;
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
            for (const bs of techniques.combinations(biCellLinks, bCount)) {
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
                        links.every(
                          (unused, index) =>
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
                    cells: rectIds.map((id) => [Math.floor(id / 9), id % 9]),
                    digits: [d1, d2],
                    links,
                    combination,
                    removals: uniqueRemovals,
                    placedCells: placedIds.map((id) => [
                      Math.floor(id / 9),
                      id % 9,
                    ]),
                  });
                  if (firstOnly) return results;
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
