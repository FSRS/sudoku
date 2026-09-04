Object.assign(techniques, {
  _deathBlossomCore: (
    board,
    pencils,
    isRegion,
    findAll = false,
    focusKind = null,
  ) => {
    const results = [];
    techniques._useSharedAICCache(board, pencils);
    const cache = techniques._aicCache;
    const isAals = focusKind === "aals";
    const isCell = !isRegion && !isAals;

    // Ensure base nodes are generated
    if (cache.AllNodes.length === 0) {
      const candidateBitsets = techniques.buildCandidateBitsets(board, pencils);
      const baseNodes =
        techniques.generateBasicNodesFromBitsets(candidateBitsets);
      baseNodes.forEach((n) => {
        const key = `${n.digits.join(",")}_${n.cells
          .slice()
          .sort((a, b) => a - b)
          .join(",")}`;
        cache.NodeCache.set(key, n);
        cache.AllNodes.push(n);
      });
    }

    const allNodes = cache.AllNodes;
    const nodeCache = cache.NodeCache;
    if (!cache.BasicNodeByCandidate) {
      cache.BasicNodeByCandidate = new Array(81 * 9);
      for (const node of allNodes) {
        if (node.cells.length === 1 && node.digits.length === 1) {
          cache.BasicNodeByCandidate[node.cells[0] * 9 + node.digits[0] - 1] =
            node;
        }
      }
    }

    const getNode = (cells, digits) => {
      const dArr = Array.isArray(digits) ? digits : [digits];
      if (cells.length === 1 && dArr.length === 1) {
        const basic = cache.BasicNodeByCandidate[cells[0] * 9 + dArr[0] - 1];
        if (basic) return basic;
      }
      const key = `${dArr.join(",")}_${cells
        .slice()
        .sort((a, b) => a - b)
        .join(",")}`;
      if (nodeCache.has(key)) return nodeCache.get(key);
      const newNode = new AICNode(cells, dArr);
      nodeCache.set(key, newNode);
      allNodes.push(newNode);
      return newNode;
    };

    // 1. Prepare OR Gate Maps (Only Bivalue and ALS)
    if (cache.BivalueOrMap.size === 0) {
      cache.BivalueOrMap = techniques.buildBivalueOrMap(allNodes);
    }

    let alsLinkRegistry = cache.AlsLinkRegistry;
    if (cache.AlsMap.size === 0) {
      cache.AlsMap = techniques.buildAlsOrMap(
        board,
        pencils,
        getNode,
        alsLinkRegistry,
        false,
      );
    }
    if (!cache.DeathBlossomOrMap) {
      cache.DeathBlossomOrMap = techniques.mergeOrMaps(
        cache.BivalueOrMap,
        cache.AlsMap,
      );
    }
    const orMap = cache.DeathBlossomOrMap;

    // Helper for location string
    const getLoc = techniques._formatAicLocation;

    // 2. Collect and sort potential stems (3 to 6 candidates)
    const potentialStems = techniques._collectBlossomStems(
      board,
      pencils,
      isCell ? "cell" : isRegion ? "region" : "aals",
      6,
      5,
    );

    // Start candidates repeat across stems and across the three Blossom
    // variants. The bitset subset test depends only on the start node, so
    // cache it for the lifetime of this position's shared AIC graph.
    let memoStore = cache.NandSubsetMemo;
    if (
      !memoStore ||
      memoStore.nodes !== allNodes ||
      memoStore.length !== allNodes.length
    ) {
      memoStore = { nodes: allNodes, length: allNodes.length, map: new Map() };
      cache.NandSubsetMemo = memoStore;
    }
    const scanNandSubset = (startNode) => {
      let hits = memoStore.map.get(startNode);
      if (hits !== undefined) return hits;
      hits = allNodes.filter(
        (node) =>
          node !== startNode &&
          techniques.isBitsetSubset(node.NodeBitset, startNode.NandBitset),
      );
      memoStore.map.set(startNode, hits);
      return hits;
    };

    const branchMask = Array.from({ length: 9 }, () => [0, 0, 0]);
    const commonMask = Array.from({ length: 9 }, () => [0, 0, 0]);

    // 3. Iterate through sorted stem cells/regions
    for (const stem of potentialStems) {
      const startNodes = isCell
        ? stem.startDigits.map((d) => getNode([stem.cellId], [d]))
        : isRegion
          ? stem.cells.map((cId) => getNode([cId], [stem.digit]))
          : stem.startCandidates.map(({ id, digit }) => getNode([id], [digit]));

      const reachMap = new Map();
      let live = false;

      // 4. Collect NandNodes and NandOrNodes
      for (
        let branchIndex = 0;
        branchIndex < startNodes.length;
        branchIndex++
      ) {
        const s = startNodes[branchIndex];
        const reachable = [{ node: s, path: [s] }];
        for (let d = 0; d < 9; d++) {
          branchMask[d][0] = s.NandBitset[d][0];
          branchMask[d][1] = s.NandBitset[d][1];
          branchMask[d][2] = s.NandBitset[d][2];
        }

        // Evaluate NandNodes via NandBitset
        for (const n of scanNandSubset(s)) {
          // Preserve the existing Cell/Region exclusion for a different
          // candidate in the same start cell.
          if (!isAals && n.cells.length === 1 && n.cells[0] === s.cells[0]) {
            continue;
          }

          // Exclude the digit from the different cell of the stem house (Applies to Region only)
          if (
            isRegion &&
            n.digits.length === 1 &&
            n.digits[0] === stem.digit &&
            n.cells.length === 1 &&
            stem.cells.includes(n.cells[0])
          )
            continue;

          // AALS start candidates belong to the same OR gate, so a branch
          // cannot use another start candidate as its first NAND node.
          if (
            isAals &&
            n.cells.length === 1 &&
            stem.startCandidateKeys.has(`${n.cells[0]}:${n.digits[0]}`)
          ) {
            continue;
          }

          const orNodes = orMap.get(n);
          if (orNodes) {
            for (const o of orNodes) {
              reachable.push({ node: o, path: [s, n, o] });
              for (let d = 0; d < 9; d++) {
                branchMask[d][0] |= o.NandBitset[d][0];
                branchMask[d][1] |= o.NandBitset[d][1];
                branchMask[d][2] |= o.NandBitset[d][2];
              }
            }
          }
        }
        reachMap.set(s, reachable);

        live = false;
        for (let d = 0; d < 9; d++) {
          for (let p = 0; p < 3; p++) {
            const bits =
              branchIndex === 0
                ? branchMask[d][p]
                : commonMask[d][p] & branchMask[d][p];
            commonMask[d][p] = bits;
            if (bits !== 0) live = true;
          }
        }
        // Intersections can only lose bits, so later branches cannot revive
        // an empty common mask.
        if (!live) break;
      }
      if (!live) continue;

      // 6. Extract eliminations
      const maskToElims = (mask) => {
        const found = [];
        for (let d = 0; d < 9; d++) {
          for (let p = 0; p < 3; p++) {
            let m = mask[d][p];
            let bitPos = 0;
            while (m > 0) {
              if (m & 1) {
                const id = p * 27 + bitPos;
                const er = Math.floor(id / 9);
                const ec = id % 9;
                const num = d + 1;

                // Ensure it's not the stem itself
                let isStemCandidate = false;
                if (isCell) {
                  if (er === stem.r && ec === stem.c) isStemCandidate = true;
                } else if (isRegion) {
                  if (num === stem.digit && stem.cells.includes(id))
                    isStemCandidate = true;
                } else if (stem.startCandidateKeys.has(`${id}:${num}`)) {
                  isStemCandidate = true;
                }

                if (
                  pencils[er][ec] &&
                  pencils[er][ec].has(num) &&
                  !isStemCandidate
                ) {
                  found.push({ r: er, c: ec, num });
                }
              }
              m >>>= 1;
              bitPos++;
            }
          }
        }
        return found;
      };

      const reachableElims = maskToElims(commonMask);

      // A branch concludes with the last node of its chain, so the chains
      // prove exactly the candidates those conclusions all see.
      const provenElims = (paths) => {
        const last = paths.map((path) => path[path.length - 1]);
        const mask = Array.from({ length: 9 }, () => [0, 0, 0]);

        for (let d = 0; d < 9; d++) {
          for (let p = 0; p < 3; p++) {
            let bits = last[0].NandBitset[d][p];
            for (let i = 1; i < last.length; i++) {
              bits &= last[i].NandBitset[d][p];
            }
            mask[d][p] = bits;
          }
        }

        // A branch that asserts a candidate cannot also be shown removing
        // it, so those candidates are left to another blossom.
        const asserted = new Set();
        for (const path of paths) {
          for (let i = 0; i < path.length; i += 2) {
            for (const id of path[i].cells) {
              asserted.add(`${id}:${path[i].digits[0]}`);
            }
          }
        }

        return maskToElims(mask).filter(
          (el) => !asserted.has(`${el.r * 9 + el.c}:${el.num}`),
        );
      };

      let chosenPaths = null;
      let elims = null;

      for (const target of reachableElims) {
        const targetDigit = target.num;
        const targetId = target.r * 9 + target.c;
        const targetPart = Math.floor(targetId / 27);
        const targetBit = targetId % 27;

        const paths = [];
        for (const s of startNodes) {
          const reachList = reachMap.get(s);
          const validReach = reachList.find((rObj) => {
            return (
              (rObj.node.NandBitset[targetDigit - 1][targetPart] &
                (1 << targetBit)) !==
              0
            );
          });
          if (validReach) paths.push(validReach.path);
        }

        // Every stem candidate has to contribute a branch.
        if (paths.length !== startNodes.length) continue;

        const proven = provenElims(paths);
        if (proven.length === 0) continue;

        chosenPaths = paths;
        elims = proven;
        break;
      }

      if (chosenPaths) {
        const chainStrs = chosenPaths.map((path) => {
          const startNode = path[0];
          let str = `(${startNode.digits[0]})r${Math.floor(startNode.cells[0] / 9) + 1}c${(startNode.cells[0] % 9) + 1}`;
          if (path.length === 3) {
            const n = path[1];
            const o = path[2];
            const als = alsLinkRegistry.get(n)?.get(o);

            if (als) {
              const preferBox =
                als.unitName && als.unitName.includes(t("teks_msg_7"));
              const alsLoc = getLoc(
                als.cells.map((ac) => ac[0] * 9 + ac[1]),
                preferBox,
              );
              str += `-(${n.digits[0]}=${o.digits[0]})${alsLoc}`;
            } else {
              str += `-(${n.digits[0]}=${o.digits[0]})${getLoc(n.cells)}`;
            }
          }
          return str;
        });

        const blossomName = isAals
          ? t("teks_msg_197")
          : isRegion
            ? t("teks_msg_165")
            : t("teks_msg_164");
        const mainInfoStr = isAals
          ? t("teks_msg_198", stem.startDigits.join(""), stem.houseName)
          : isRegion
            ? t("teks_msg_157", stem.digit, stem.houseName)
            : t("teks_msg_158", stem.r + 1, stem.c + 1);

        const cellColors = [];
        const candidateColors = [];
        const links = [];
        if (isAals) {
          for (const id of stem.cells) {
            cellColors.push({
              r: Math.floor(id / 9),
              c: id % 9,
              color: 5,
              mode: "add",
            });
          }
        }

        chosenPaths.forEach((path, branchIdx) => {
          const branchColor = [6, 7, 2, 3, 4, 8][branchIdx % 6];
          if (path.length !== 3) return;
          const [u, v, w] = path;
          if (isCell) {
            candidateColors.push({
              r: stem.r,
              c: stem.c,
              num: u.digits[0],
              color: branchColor,
            });
          } else {
            candidateColors.push({
              r: Math.floor(u.cells[0] / 9),
              c: u.cells[0] % 9,
              num: isRegion ? stem.digit : u.digits[0],
              color: branchColor,
            });
          }

          const als = alsLinkRegistry.get(v)?.get(w);
          const coloredCells = als
            ? als.cells
            : v.cells.map((id) => [Math.floor(id / 9), id % 9]);
          for (const [r, c] of coloredCells) {
            cellColors.push({ r, c, color: branchColor, mode: "add" });
          }

          for (const node of [v, w]) {
            for (const id of node.cells) {
              const r = Math.floor(id / 9);
              const c = id % 9;
              if (pencils[r][c].has(node.digits[0])) {
                candidateColors.push({
                  r,
                  c,
                  num: node.digits[0],
                  color: branchColor,
                  mode: "add",
                });
              }
            }
          }

          links.push({
            r1: Math.floor(u.cells[0] / 9),
            c1: u.cells[0] % 9,
            n1: u.digits[0],
            r2: Math.floor(v.cells[0] / 9),
            c2: v.cells[0] % 9,
            n2: v.digits[0],
            color: 1,
            style: "dash",
          });
          links.push({
            r1: Math.floor(v.cells[0] / 9),
            c1: v.cells[0] % 9,
            n1: v.digits[0],
            r2: Math.floor(w.cells[0] / 9),
            c2: w.cells[0] % 9,
            n2: w.digits[0],
            color: 0,
            style: "solid",
          });
          for (const node of [v, w]) {
            for (let i = 0; i < node.cells.length - 1; i++) {
              links.push({
                r1: Math.floor(node.cells[i] / 9),
                c1: node.cells[i] % 9,
                n1: node.digits[0],
                r2: Math.floor(node.cells[i + 1] / 9),
                c2: node.cells[i + 1] % 9,
                n2: node.digits[0],
                color: branchColor,
                style: "solid",
              });
            }
          }
        });

        const resultObj = {
          change: true,
          type: "remove",
          cells: elims,
          hint: {
            name: blossomName,
            mainInfo: mainInfoStr,
            detail: chainStrs.join(", "),
          },
          visualPlan: {
            highlight: { digit: null, state: 0 },
            cellColors,
            candidateColors,
            candidateMarks: elims.map(({ r, c, num }) => ({
              r,
              c,
              num,
              marker: "slash",
              color: 0,
            })),
            links,
          },
        };

        if (!findAll) return resultObj;
        results.push(resultObj);
      }
    }

    return findAll ? results : { change: false };
  },

  deathBlossom: (board, pencils, findAll = false) => {
    if (findAll) {
      return [
        ...techniques.cellDeathBlossom(board, pencils, true),
        ...techniques.regionDeathBlossom(board, pencils, true),
        ...techniques.aalsDeathBlossom(board, pencils, true),
      ];
    }
    const cell = techniques.cellDeathBlossom(board, pencils, false);
    if (cell.change) return cell;
    const region = techniques.regionDeathBlossom(board, pencils, false);
    if (region.change) return region;
    return techniques.aalsDeathBlossom(board, pencils, false);
  },

  cellDeathBlossom: (board, pencils, findAll = false) => {
    return techniques._deathBlossomCore(board, pencils, false, findAll);
  },

  regionDeathBlossom: (board, pencils, findAll = false) => {
    return techniques._deathBlossomCore(board, pencils, true, findAll);
  },

  aalsDeathBlossom: (board, pencils, findAll = false) => {
    return techniques._deathBlossomCore(board, pencils, false, findAll, "aals");
  },

  // --- Almost AIC ---
});
