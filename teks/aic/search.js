Object.assign(techniques, {
  _findAic: (board, pencils, config, findAll = false) => {
    const results = [];
    const {
      singleDigit,
      bivalueOnly,
      useGrouped,
      useAlsXZ,
      useWxyz,
      useAls,
      useFish,
      maxCycle,
      nameOverride,
      pathFilter,
      useAlsOnly = false,
      endSameDigits = false,
      allowedOrLinkTypes = null,
      preserveAlsSizes = null,
      preferredAlsSize = null,
    } = config;
    const techniqueName = nameOverride || t("teks_AIC_name");

    let cache = techniques._aicCache;

    let AlsOnly = useAlsXZ || useAlsOnly;
    let SameDigits = bivalueOnly || useAlsXZ || endSameDigits;

    // 1. Initialize & Cache Base Nodes
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

    let aicOrMap = new Map();
    allNodes.forEach((n) => aicOrMap.set(n, new Set()));

    const getNode = (cells, digits) => {
      const dArr = Array.isArray(digits) ? digits : [digits];
      const key = `${dArr.join(",")}_${cells
        .slice()
        .sort((a, b) => a - b)
        .join(",")}`;
      if (nodeCache.has(key)) return nodeCache.get(key);

      const newNode = new AICNode(cells, dArr);
      nodeCache.set(key, newNode);
      allNodes.push(newNode);
      aicOrMap.set(newNode, new Set()); // Important: Register immediately
      return newNode;
    };

    // 2. Map Generation & Cache Hydration
    if (singleDigit || (!singleDigit && !bivalueOnly && !AlsOnly)) {
      if (cache.BilocationOrMap.size === 0) {
        cache.BilocationOrMap = techniques.buildBilocationOrMap(allNodes);
      }
      aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.BilocationOrMap);
    }

    if (bivalueOnly || (!singleDigit && !bivalueOnly)) {
      if (cache.BivalueOrMap.size === 0) {
        cache.BivalueOrMap = techniques.buildBivalueOrMap(allNodes);
      }
      aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.BivalueOrMap);
    }

    if (useGrouped) {
      if (cache.GroupedOrMap.size === 0) {
        cache.GroupedOrMap = techniques.buildGroupedOrMap(
          pencils,
          (cells, d) => getNode(cells, [d]),
          cache.GroupedLinkRegistry,
        );
      }
      aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.GroupedOrMap);
    }
    let activeAlsLinkRegistry = cache.AlsLinkRegistry;
    const activeGroupedLinkRegistry = cache.GroupedLinkRegistry;

    if (useAls) {
      const normalizedPreserveSizes = Array.isArray(preserveAlsSizes)
        ? [...new Set(preserveAlsSizes)].sort((a, b) => a - b)
        : [];

      const usesTechniqueAlsPolicy =
        normalizedPreserveSizes.length > 0 || preferredAlsSize !== null;

      if (usesTechniqueAlsPolicy) {
        const policyKey =
          `${normalizedPreserveSizes.join(",")}|` +
          `${preferredAlsSize ?? "none"}`;

        let policyEntry = cache.AlsPolicyCache.get(policyKey);

        if (!policyEntry) {
          const registry = new Map();

          const map = techniques.buildAlsOrMap(
            board,
            pencils,
            (cells, d) => getNode(cells, [d]),
            registry,
            {
              preserveAlsSizes: normalizedPreserveSizes,
              preferredAlsSize,
            },
          );

          policyEntry = {
            map,
            registry,
          };

          cache.AlsPolicyCache.set(policyKey, policyEntry);
        }

        activeAlsLinkRegistry = policyEntry.registry;

        aicOrMap = techniques.mergeOrMaps(aicOrMap, policyEntry.map);
      } else {
        // Existing generic optimized ALS map.
        if (cache.AlsMap.size === 0) {
          cache.AlsMap = techniques.buildAlsOrMap(
            board,
            pencils,
            (cells, d) => getNode(cells, [d]),
            cache.AlsLinkRegistry,
          );
        }

        aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.AlsMap);
      }
    }

    let activeFishLinkRegistry = cache.FishLinkRegistry;
    if (useFish) {
      if (cache.FishMap.size === 0) {
        cache.FishMap = techniques.buildFishOrMap(
          board,
          pencils,
          (cells, d) => getNode(cells, [d]),
          cache.FishLinkRegistry,
        );
      }
      aicOrMap = techniques.mergeOrMaps(aicOrMap, cache.FishMap);
    }

    const getAlsForLink = (u, v) =>
      activeAlsLinkRegistry.get(u)?.get(v) || null;

    const getOrLinkType = (u, v) => {
      // Multi-cell intra-ALS link.
      if (getAlsForLink(u, v)) {
        return "als";
      }

      // One-cell ALS: two candidates in the same bivalue cell.
      if (
        u.cells.length === 1 &&
        v.cells.length === 1 &&
        u.cells[0] === v.cells[0] &&
        u.digits[0] !== v.digits[0]
      ) {
        return "bivalue";
      }

      // Bilocation or grouped single-digit intra-region link.
      if (
        u.digits.length === 1 &&
        v.digits.length === 1 &&
        u.digits[0] === v.digits[0]
      ) {
        return "region";
      }

      return "other";
    };

    if (allowedOrLinkTypes) {
      const allowed = new Set(allowedOrLinkTypes);
      const filteredOrMap = new Map();

      allNodes.forEach((node) => filteredOrMap.set(node, new Set()));

      for (const [u, neighbors] of aicOrMap) {
        if (!filteredOrMap.has(u)) {
          filteredOrMap.set(u, new Set());
        }

        for (const v of neighbors) {
          if (allowed.has(getOrLinkType(u, v))) {
            filteredOrMap.get(u).add(v);
          }
        }
      }

      aicOrMap = filteredOrMap;
    }

    const baseOrMap = new Map();
    allNodes.forEach((n) => baseOrMap.set(n, new Set(aicOrMap.get(n))));

    const acceptsConfiguredPath = (path, kind) =>
      !pathFilter ||
      pathFilter(path, cache, {
        kind,
        isRing: kind === "ring",
        getOrLinkType,
        getAlsForLink,
      });

    const interestedNodes = allNodes.filter(
      (n) => aicOrMap.has(n) && aicOrMap.get(n).size > 0,
    );

    interestedNodes.forEach((node, idx) => {
      node.index = idx;

      node.OrNodes = new Set(aicOrMap.get(node));
      node.OrNandNodes = new Set();
      node.NandNodes = new Set();

      node.OrFrontier = new Set(node.OrNodes);
      node.OrNandFrontier = new Set();
    });

    // Index nodes so NAND construction does not scan every node pair.
    const nodesByDigit = Array.from({ length: 10 }, () => []);
    const singleCellNodesByCell = Array.from({ length: 81 }, () => []);

    for (const n of interestedNodes) {
      if (n.digits.length !== 1) continue;

      const d = n.digits[0];
      nodesByDigit[d].push(n);

      if (n.cells.length === 1) {
        singleCellNodesByCell[n.cells[0]].push(n);
      }
    }

    for (const A of interestedNodes) {
      if (A.digits.length !== 1) continue;

      const aDigit = A.digits[0];

      // Same-digit weak links: peers/common-peers/grouped-node visibility.
      for (const B of nodesByDigit[aDigit]) {
        if (A === B) continue;

        if (techniques.isBitsetSubset(B.NodeBitset, A.NandBitset)) {
          A.NandNodes.add(B);
        }
      }

      if (!singleDigit && !bivalueOnly && A.cells.length === 1) {
        const sameCellNodes = singleCellNodesByCell[A.cells[0]];

        for (const B of sameCellNodes) {
          if (A !== B && B.digits[0] !== aDigit) {
            A.NandNodes.add(B);
          }
        }
      }
    }

    let maxCycles = maxCycle;

    // cycle 0 => 4 nodes
    // cycle 1 => 8 nodes
    // cycle 2 => 16 nodes
    const getMaxPathLenForCycle = (cycle) => {
      return 1 << (cycle + 2);
    };

    const stringifiedFoundRemovals = new Set();
    const deadRings = new Set();

    const canonicalRemovalPack = (removals) => {
      const seen = new Uint8Array(4096);
      const unique = [];

      for (const el of removals) {
        const key = (el.r << 8) | (el.c << 4) | el.num;

        if (seen[key] === 0) {
          seen[key] = 1;
          unique.push(el);
        }
      }

      unique.sort((a, b) => a.r - b.r || a.c - b.c || a.num - b.num);

      let key = "";
      for (const el of unique) {
        key += `${el.r}${el.c}${el.num};`;
      }

      return { removals: unique, key };
    };

    const extractRemovals = (maskArray) => {
      const removals = [];
      for (let d = 0; d < 9; d++) {
        for (let p = 0; p < 3; p++) {
          let mask = maskArray[d][p];
          let bitPos = 0;
          while (mask > 0) {
            if ((mask & 1) !== 0) {
              const id = p * 27 + bitPos;
              const r = Math.floor(id / 9);
              const c = id % 9;
              const num = d + 1;
              if (pencils[r][c] && pencils[r][c].has(num)) {
                if (
                  !removals.some(
                    (rem) => rem.r === r && rem.c === c && rem.num === num,
                  )
                ) {
                  removals.push({ r, c, num });
                }
              }
            }
            mask >>>= 1;
            bitPos++;
          }
        }
      }
      return removals;
    };

    const findAICPath = (startNode, endNode, maxNodes, kind = "chain") => {
      // A path is reconstructed only when an endpoint is reached.
      const EMPTY_NEIGHBORS = new Set();

      const states = [
        {
          node: startNode,
          isNextOr: true,
          parent: -1,
          depth: 1,
        },
      ];

      let head = 0;

      const reconstructPath = (stateIndex) => {
        const path = [];

        while (stateIndex !== -1) {
          const state = states[stateIndex];
          path.push(state.node);
          stateIndex = state.parent;
        }

        path.reverse();
        return path;
      };

      const ancestorContains = (stateIndex, targetNode) => {
        while (stateIndex !== -1) {
          const state = states[stateIndex];

          if (state.node === targetNode) {
            return true;
          }

          stateIndex = state.parent;
        }

        return false;
      };

      const bestDepth = pathFilter
        ? null
        : new Map([[`${startNode.index}:1`, 1]]);

      while (head < states.length) {
        const stateIndex = head++;
        const state = states[stateIndex];

        const { node, isNextOr, depth } = state;

        if (node === endNode && depth > 1) {
          // A valid chain ends immediately after an OR link.
          if (!isNextOr) {
            const path = reconstructPath(stateIndex);

            if (acceptsConfiguredPath(path, kind)) {
              return path;
            }
          }

          continue;
        }

        if (depth >= maxNodes) {
          continue;
        }

        const nextNodes = isNextOr
          ? baseOrMap.get(node) || EMPTY_NEIGHBORS
          : node.NandNodes || EMPTY_NEIGHBORS;

        const nextIsOr = !isNextOr;
        const nextDepth = depth + 1;

        for (const nxt of nextNodes) {
          // Repeating a node is forbidden except when closing a ring back
          // onto its starting node.
          const closesRing = startNode === endNode && nxt === endNode;

          if (ancestorContains(stateIndex, nxt) && !closesRing) {
            continue;
          }

          // The destination is checked before dominance pruning so a ring can
          // return to its starting node.
          if (bestDepth && nxt !== endNode) {
            const stateKey = `${nxt.index}:${nextIsOr ? 1 : 0}`;
            const previousDepth = bestDepth.get(stateKey);

            if (previousDepth !== undefined && previousDepth <= nextDepth) {
              continue;
            }

            bestDepth.set(stateKey, nextDepth);
          }

          states.push({
            node: nxt,
            isNextOr: nextIsOr,
            parent: stateIndex,
            depth: nextDepth,
          });
        }
      }

      return null;
    };

    const getLoc = techniques._formatAicLocation;
    const getCompactFinLoc = techniques._formatCompactAicLocation;

    const buildCompactEureka = (path, isRing) => {
      let str = "";
      let lastDigit = null;

      for (let i = 0; i < path.length; i += 2) {
        const u = path[i];
        const v = path[(i + 1) % path.length];

        let orGateStr = "";
        const als = useAls ? activeAlsLinkRegistry.get(u)?.get(v) : null;
        const fish = useFish ? activeFishLinkRegistry.get(u)?.get(v) : null;

        if (als) {
          const alsIds = als.cells.map((c) => c[0] * 9 + c[1]);
          const preferBox =
            als.unitName && als.unitName.includes(t("teks_unit_box"));
          orGateStr = `(${u.digits[0]}=${v.digits[0]})${getLoc(alsIds, preferBox)}`;
          lastDigit = v.digits[0];
        } else if (fish) {
          orGateStr = `(${fish.d})(${getCompactFinLoc(u.cells)}=${getCompactFinLoc(v.cells)})(${fish.basesStr}\\${fish.coversStr})`;
          lastDigit = fish.d;
        } else if (
          u.digits[0] !== v.digits[0] &&
          u.cells.length === 1 &&
          v.cells.length === 1 &&
          u.cells[0] === v.cells[0]
        ) {
          orGateStr = `(${u.digits[0]}=${v.digits[0]})${getLoc(u.cells)}`;
          lastDigit = v.digits[0];
        } else {
          const d = u.digits[0];
          const prefix = lastDigit === d ? "" : `(${d})`;
          const gateType = activeGroupedLinkRegistry?.get(u)?.get(v);
          const preferBoxGate = gateType === "box";
          orGateStr = `${prefix}${getLoc(u.cells, preferBoxGate)}=${getLoc(v.cells, preferBoxGate)}`;
          lastDigit = d;
        }

        if (i === 0) str += orGateStr;
        else str += "-" + orGateStr;
      }

      if (isRing) str += "-";
      return str;
    };

    const buildResult = (
      removals,
      name,
      path,
      isRing = false,
      placement = null,
    ) => {
      const eurekaStr = buildCompactEureka(path, isRing);

      const usedAlses = [];
      const usedFishes = [];

      const fishNodes = new Set();

      const fullVisualChain = isRing ? [...path, path[0]] : path;

      for (let i = 0; i < fullVisualChain.length - 1; i += 2) {
        const u = fullVisualChain[i];
        const v = fullVisualChain[i + 1];

        const als = useAls ? activeAlsLinkRegistry.get(u)?.get(v) : null;

        const fish = useFish ? activeFishLinkRegistry.get(u)?.get(v) : null;

        if (als) {
          usedAlses.push(als.cells);
        } else if (fish) {
          usedFishes.push(fish);
          fishNodes.add(u);
          fishNodes.add(v);
        }
      }

      const candidateColors = [];
      path.forEach((node, idx) => {
        if (fishNodes.has(node)) return;
        const color = idx % 2 === 0 ? 5 : 4;
        for (const id of node.cells) {
          const r = Math.floor(id / 9);
          const c = id % 9;
          for (const num of node.digits) {
            if (pencils[r][c].has(num)) {
              candidateColors.push({ r, c, num, color });
            }
          }
        }
      });

      const cellColors = [];
      const candidateMarks = removals.map(({ r, c, num }) => ({
        r,
        c,
        num,
        marker: "slash",
        color: 0,
      }));
      const colorCodes = [6, 7, 2, 3, 4, 1, 8];
      let colorCount = -1;

      if (useAls) {
        for (const cells of usedAlses) {
          colorCount++;
          const color = colorCodes[colorCount % 8];
          for (const [r, c] of cells) {
            cellColors.push({ r, c, color, mode: "add" });
          }
        }
      }

      if (useFish) {
        for (const fish of usedFishes) {
          colorCount++;
          const color = colorCodes[colorCount % colorCodes.length];
          for (const id of fish.allCells) {
            const r = Math.floor(id / 9);
            const c = id % 9;
            if (pencils[r][c].has(fish.d)) {
              candidateMarks.push({
                r,
                c,
                num: fish.d,
                marker: "circle",
                color,
              });
            }
          }
        }
      }

      const links = [];
      const getClosestCells = (nodeA, nodeB) => {
        let minD = Infinity;
        let bestA = nodeA.cells[0],
          bestB = nodeB.cells[0];
        for (const a of nodeA.cells) {
          const ar = Math.floor(a / 9),
            ac = a % 9;
          for (const b of nodeB.cells) {
            const br = Math.floor(b / 9),
              bc = b % 9;
            const distance = Math.abs(ar - br) + Math.abs(ac - bc);
            if (distance < minD) {
              minD = distance;
              bestA = a;
              bestB = b;
            }
          }
        }
        return [
          [Math.floor(bestA / 9), bestA % 9],
          [Math.floor(bestB / 9), bestB % 9],
        ];
      };
      const drawGroup = (node, idx) => {
        if (fishNodes.has(node) || node.cells.length < 2) return;
        const color = idx % 2 === 0 ? 5 : 4;
        for (let i = 0; i < node.cells.length - 1; i++) {
          links.push({
            r1: Math.floor(node.cells[i] / 9),
            c1: node.cells[i] % 9,
            n1: node.digits[0],
            r2: Math.floor(node.cells[i + 1] / 9),
            c2: node.cells[i + 1] % 9,
            n2: node.digits[0],
            color,
            style: "solid",
          });
        }
      };

      for (let i = 0; i < fullVisualChain.length - 1; i++) {
        const u = fullVisualChain[i];
        const v = fullVisualChain[i + 1];
        if (i === 0) drawGroup(u, 0);
        if (i < path.length) drawGroup(v, (i + 1) % path.length);

        const skipLine =
          useFish &&
          i % 2 === 0 &&
          activeFishLinkRegistry.get(u)?.get(v);
        if (!skipLine) {
          const [cA, cB] = getClosestCells(u, v);
          links.push({
            r1: cA[0],
            c1: cA[1],
            n1: u.digits[0],
            r2: cB[0],
            c2: cB[1],
            n2: v.digits[0],
            color: 0,
            style: i % 2 === 0 ? "solid" : "dash",
          });
        }
      }

      return {
        change: true,
        type: "remove",
        cells: removals,
        placement,
        hint: {
          name: name,
          mainInfo: t("teks_start_with", eurekaStr.split("-")[0]),
          detail: `[${path.length}] ${eurekaStr}`,
        },
        visualPlan: {
          highlight: {
            digit: singleDigit ? path[0].digits[0] : null,
            state: singleDigit ? 1 : bivalueOnly ? 2 : 0,
          },
          cellColors,
          candidateColors,
          candidateMarks,
          links,
        },
      };
    };

    for (let cycle = 0; cycle < maxCycles; cycle++) {
      let anyExpansion = false;

      // Expand NAND links only from newly discovered OR nodes.
      for (const A of interestedNodes) {
        const nextFrontier = new Set();

        for (const B of A.OrFrontier) {
          for (const C of B.NandNodes) {
            if (!A.OrNandNodes.has(C)) {
              A.OrNandNodes.add(C);
              nextFrontier.add(C);
              anyExpansion = true;
            }
          }
        }

        A.OrNandFrontier = nextFrontier;
      }

      // Expand OR links only from newly discovered OR-NAND nodes.
      for (const A of interestedNodes) {
        const nextFrontier = new Set();

        for (const C of A.OrNandFrontier) {
          for (const D of C.OrNodes) {
            if (!A.OrNodes.has(D)) {
              A.OrNodes.add(D);
              nextFrontier.add(D);
              anyExpansion = true;
            }
          }
        }

        A.OrFrontier = nextFrontier;
      }

      if (!anyExpansion) {
        break;
      }

      if (
        techniqueName === t("teks_ALS_XY_Wing") ||
        techniqueName === t("teks_ALS_W_Wing")
      ) {
        if (cycle !== 1) continue;
      }

      let maxPathLen = getMaxPathLenForCycle(cycle);

      // Priority 1: AIC Ring
      for (const A of interestedNodes) {
        for (const D of A.OrNodes) {
          if (D.index <= A.index || !A.NandNodes.has(D)) continue;
          if (SameDigits && A.digits[0] !== D.digits[0]) continue;
          if (deadRings.has(`${A.index}_${D.index}`)) continue;

          const path = findAICPath(A, D, maxPathLen, "ring");

          if (path) {
            let ringRemovals = [];
            for (let i = 1; i < path.length - 1; i += 2) {
              const { hasOverlap, intersection } =
                techniques.getBitsetIntersection(
                  path[i].NandBitset,
                  path[i + 1].NandBitset,
                );
              if (hasOverlap)
                ringRemovals.push(...extractRemovals(intersection));
            }
            const { hasOverlap, intersection } =
              techniques.getBitsetIntersection(
                path[path.length - 1].NandBitset,
                path[0].NandBitset,
              );
            if (hasOverlap) ringRemovals.push(...extractRemovals(intersection));

            if (useAls) {
              for (let i = 0; i < path.length; i += 2) {
                const u = path[i];
                const v = path[(i + 1) % path.length];

                if (u.digits[0] !== v.digits[0]) {
                  const als = activeAlsLinkRegistry.get(u)?.get(v);
                  if (als) {
                    const d1 = u.digits[0];
                    const d2 = v.digits[0];
                    const otherDigits = Object.keys(als.candMap)
                      .map(Number)
                      .filter((d) => d !== d1 && d !== d2);
                    const alsCellIds = new Set(
                      als.cells.map((c) => c[0] * 9 + c[1]),
                    );

                    for (const z of otherDigits) {
                      const cellsZ = als.candMap[z].map(([r, c]) => r * 9 + c);
                      const nodeZ = getNode(cellsZ, z);

                      for (let p = 0; p < 3; p++) {
                        let mask = nodeZ.NandBitset[z - 1][p];
                        let bitPos = 0;
                        while (mask > 0) {
                          if ((mask & 1) !== 0) {
                            const id = p * 27 + bitPos;
                            const r = Math.floor(id / 9);
                            const c = id % 9;
                            if (
                              pencils[r][c] &&
                              pencils[r][c].has(z) &&
                              !alsCellIds.has(id)
                            ) {
                              ringRemovals.push({ r, c, num: z });
                            }
                          }
                          mask >>>= 1;
                          bitPos++;
                        }
                      }
                    }
                  }
                }
              }
            }

            if (useFish) {
              // Collect all fish OR-gate node pairs in this ring
              const ringFishCoverNodesInRing = new Set(); // body/fin nodes that ARE in ring OR gates
              const ringFishObjs = []; // { fish, linkedNodes: Set<node> } per fish used in ring

              // fullVisualChain is path + path[0] for ring, but here we build from `path`
              for (let i = 0; i < path.length; i += 2) {
                const u = path[i];
                const v = path[(i + 1) % path.length];
                const fish = activeFishLinkRegistry.get(u)?.get(v);
                if (fish && fish.isRank1) {
                  ringFishCoverNodesInRing.add(u);
                  ringFishCoverNodesInRing.add(v);
                  ringFishObjs.push({ fish, linkedNodes: new Set([u, v]) });
                }
              }

              for (const { fish, linkedNodes } of ringFishObjs) {
                // For each cover-body node of this fish NOT in the ring's OR gate:
                for (const coverNode of fish.coverBodyNodes) {
                  if (linkedNodes.has(coverNode)) continue; // This cover participates in the ring link — skip
                  // XOR forces exactly one cell in coverNode to be true for digit d,
                  // so eliminate d from all cells that see ALL cells of coverNode (i.e., apply NandBitset).
                  const d = fish.d;
                  for (let p = 0; p < 3; p++) {
                    let mask = coverNode.NandBitset[d - 1][p];
                    let bitPos = 0;
                    while (mask > 0) {
                      if ((mask & 1) !== 0) {
                        const id = p * 27 + bitPos;
                        const r = Math.floor(id / 9);
                        const c = id % 9;
                        if (pencils[r][c] && pencils[r][c].has(d)) {
                          ringRemovals.push({ r, c, num: d });
                        }
                      }
                      mask >>>= 1;
                      bitPos++;
                    }
                  }
                }
              }
            }

            if (ringRemovals.length > 0) {
              const { removals: uniqueRingRemovals, key: removalsKey } =
                canonicalRemovalPack(ringRemovals);

              if (!stringifiedFoundRemovals.has(removalsKey)) {
                stringifiedFoundRemovals.add(removalsKey);

                const chainStr = t("teks_msg_chain_term");
                const aicStr = t("teks_msg_aic_term");
                const ringName =
                  techniqueName === t("teks_AIC_name")
                    ? t("teks_msg_aic_ring")
                    : techniqueName.includes(aicStr)
                      ? techniqueName + t("teks_msg_ring_suffix")
                      : techniqueName.includes(chainStr)
                        ? techniqueName.replace(
                            chainStr,
                            t("teks_msg_ring_term"),
                          )
                        : useAlsXZ || techniqueName === t("teks_ALS_W_Wing")
                          ? t("teks_msg_doubly_linked") + techniqueName
                          : techniqueName === t("teks_ALS_XY_Wing")
                            ? t("teks_msg_triply_linked") + techniqueName
                            : techniqueName + t("teks_msg_ring_suffix");

                const res = buildResult(
                  uniqueRingRemovals,
                  ringName,
                  path,
                  true,
                );

                if (!findAll) return res;
                results.push(res);
              }
            } else {
              deadRings.add(`${A.index}_${D.index}`);
            }
          }
        }
      }
      if (results.length > 0 && !findAll) return results[0];

      if (techniqueName === t("teks_ALS_W_Wing")) maxPathLen = 6;

      // Priority 2: DN Loop
      if (!bivalueOnly && !useWxyz) {
        for (const A of interestedNodes) {
          for (const D of A.OrNodes) {
            if (D.index < A.index) continue;
            if (SameDigits && A.digits[0] !== D.digits[0]) continue;
            // Strict equality (original): A and D are the same node
            const isEqual = D.index === A.index;

            const aSubsetOfD =
              !isEqual && techniques.isBitsetSubset(A.NodeBitset, D.NodeBitset);

            const dSubsetOfA =
              !isEqual &&
              !aSubsetOfD &&
              techniques.isBitsetSubset(D.NodeBitset, A.NodeBitset);

            if (!isEqual && !aSubsetOfD && !dSubsetOfA) continue;

            // Choose which end's NandBitset to eliminate from:
            const trueNode = aSubsetOfD ? D : A;
            const removalBitset = trueNode.NandBitset;
            let dnRemovals = extractRemovals(removalBitset);
            if (endSameDigits) {
              dnRemovals = dnRemovals.filter(
                (removal) => removal.num === A.digits[0],
              );
            }

            // A basic node proven true is a placement. In the subset cases the
            // proven node is always the superset, so it is never basic there.
            const dnPlacement =
              isEqual && trueNode.isSingleCell && trueNode.isSingleDigit
                ? {
                    r: Math.floor(trueNode.cells[0] / 9),
                    c: trueNode.cells[0] % 9,
                    num: trueNode.digits[0],
                  }
                : null;

            if (dnRemovals.length > 0) {
              const removalsKey = JSON.stringify(
                dnRemovals.sort(
                  (a, b) => a.r - b.r || a.c - b.c || a.num - b.num,
                ),
              );

              if (!stringifiedFoundRemovals.has(removalsKey)) {
                const path = findAICPath(A, D, maxPathLen, "dnLoop");

                if (!path) continue;

                stringifiedFoundRemovals.add(removalsKey);

                const chainStr = t("teks_msg_chain_term");
                const aicStr = t("teks_msg_aic_term");
                const DNLName =
                  techniqueName === t("teks_AIC_name")
                    ? t("teks_DNL")
                    : techniqueName.includes(aicStr)
                      ? techniqueName.replace(aicStr, t("teks_msg_dnloop_term"))
                      : techniqueName.includes(chainStr)
                        ? techniqueName.replace(
                            chainStr,
                            t("teks_msg_dnloop_term"),
                          )
                        : techniqueName;

                const res = buildResult(
                  dnRemovals,
                  DNLName,
                  path,
                  false,
                  dnPlacement,
                );

                if (!findAll) return res;
                results.push(res);
              }
            }
          }
        }

        if (results.length > 0 && !findAll) return results[0];
      }

      // Priority 3: Standard AIC
      for (const A of interestedNodes) {
        for (const D of A.OrNodes) {
          if (D.index <= A.index) continue;
          if (deadRings.has(`${A.index}_${D.index}`)) continue;
          if (SameDigits && A.digits[0] !== D.digits[0]) continue;

          const { hasOverlap, intersection } = techniques.getBitsetIntersection(
            A.NandBitset,
            D.NandBitset,
          );
          if (hasOverlap) {
            const aicRemovals = extractRemovals(intersection);

            if (aicRemovals.length > 0) {
              const removalsKey = JSON.stringify(
                aicRemovals.sort(
                  (a, b) => a.r - b.r || a.c - b.c || a.num - b.num,
                ),
              );

              if (!stringifiedFoundRemovals.has(removalsKey)) {
                const path = findAICPath(A, D, maxPathLen, "chain");

                if (!path) continue;

                stringifiedFoundRemovals.add(removalsKey);

                const res = buildResult(
                  aicRemovals,
                  techniqueName,
                  path,
                  false,
                );

                if (!findAll) return res;
                results.push(res);
              }
            }
          }
        }
      }
      if (results.length > 0 && !findAll) return results[0];
    }

    return findAll ? results : { change: false };
  },

  // --- Technique Wrappers ---

  xChain: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: true,
        bivalueOnly: false,
        useGrouped: false,
        useAls: false,
        maxCycle: 2,
        nameOverride: t("teks_X_Chain"),
      },
      findAll,
    );
  },

  groupedXChain: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: true,
        bivalueOnly: false,
        useGrouped: true,
        useAls: false,
        maxCycle: 2,
        nameOverride: t("teks_grouped_X_Chain"),
      },
      findAll,
    );
  },

  xyChain: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: true,
        useGrouped: false,
        useAls: false,
        maxCycle: 3,
        nameOverride: t("teks_XY_Chain"),
      },
      findAll,
    );
  },

  alternatingInferenceChain: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: false,
        useAls: false,
        maxCycle: 3,
      },
      findAll,
    );
  },

  groupedAIC: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: true,
        useAls: false,
        maxCycle: 3,
        nameOverride: t("teks_Grouped_AIC"),
      },
      findAll,
    );
  },

  wxyzWing: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: false,
        useAlsXZ: true,
        useWxyz: true,
        useAls: true,
        maxCycle: 1,
        nameOverride: t("teks_WXYZ_Wing"),
        preserveAlsSizes: [3],
        preferredAlsSize: 3,
        allowedOrLinkTypes: ["als", "bivalue"],

        pathFilter: (path, cache, { getOrLinkType, getAlsForLink }) => {
          if (path.length !== 4) {
            return false;
          }

          const isBivalue = (nodeA, nodeB) =>
            getOrLinkType(nodeA, nodeB) === "bivalue";

          const isThreeCellAls = (nodeA, nodeB) => {
            const als = getAlsForLink(nodeA, nodeB);

            return (
              getOrLinkType(nodeA, nodeB) === "als" && als?.cells.length === 3
            );
          };

          const firstIsBivalue = isBivalue(path[0], path[1]);
          const firstIsAls3 = isThreeCellAls(path[0], path[1]);

          const secondIsBivalue = isBivalue(path[2], path[3]);
          const secondIsAls3 = isThreeCellAls(path[2], path[3]);

          return (
            (firstIsBivalue && secondIsAls3) || (secondIsBivalue && firstIsAls3)
          );
        },
      },
      findAll,
    );
  },

  alsXZ: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: false,
        useAlsXZ: true,
        useAls: true,
        endSameDigits: true,
        maxCycle: 1,
        nameOverride: t("teks_ALS_XZ"),
      },
      findAll,
    );
  },

  alsXYWing: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: false,
        useAls: true,
        useAlsOnly: true,
        endSameDigits: true,
        maxCycle: 2,
        nameOverride: t("teks_ALS_XY_Wing"),
        allowedOrLinkTypes: ["als", "bivalue"],

        pathFilter: (path, cache, { kind, getOrLinkType }) => {
          if (path.length !== 6) return false;

          for (let i = 0; i < path.length; i += 2) {
            const type = getOrLinkType(path[i], path[i + 1]);

            if (type !== "als" && type !== "bivalue") {
              return false;
            }
          }

          return true;
        },
      },
      findAll,
    );
  },

  alsWWing: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: true,
        useAls: true,
        endSameDigits: true,
        maxCycle: 2,
        nameOverride: t("teks_ALS_W_Wing"),
        allowedOrLinkTypes: ["als", "bivalue", "region"],

        pathFilter: (path, cache, { kind, getOrLinkType }) => {
          const isIntraAls = (type) => type === "als" || type === "bivalue";

          const orTypes = [];

          for (let i = 0; i < path.length; i += 2) {
            orTypes.push(getOrLinkType(path[i], path[i + 1]));
          }

          if (path.length === 6) {
            return (
              isIntraAls(orTypes[0]) &&
              orTypes[1] === "region" &&
              isIntraAls(orTypes[2])
            );
          } else if (kind === "ring" && path.length === 8) {
            const phase0 = orTypes.every((type, index) =>
              index % 2 === 0 ? isIntraAls(type) : type === "region",
            );

            return phase0;
          }

          return false;
        },
      },
      findAll,
    );
  },

  alsAic: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: true,
        useAls: true,
        maxCycle: 3,
        nameOverride: t("teks_ALS_AIC"),
      },
      findAll,
    );
  },

  complexAic: (board, pencils, findAll = false) => {
    return techniques._findAic(
      board,
      pencils,
      {
        singleDigit: false,
        bivalueOnly: false,
        useGrouped: true,
        useAls: true,
        useFish: true,
        maxCycle: 3,
        nameOverride: t("teks_Complex_AIC"),
      },
      findAll,
    );
  },

  // --- BITWISE HELPERS ---
  _bits: {
    bitFor: (digit) => 1 << (digit - 1),
    popcount: (n) => {
      // Handle BigInt (used for 81-cell position masks)
      if (typeof n === "bigint") {
        let count = 0;
        while (n !== 0n) {
          n &= n - 1n; // Brian Kernighan's algorithm: clears the least significant bit set
          count++;
        }
        return count;
      }

      // Handle Number (used for 9-digit candidate masks)
      // SWAR algorithm for 32-bit integers
      n = n - ((n >> 1) & 0x55555555);
      n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
      return (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
    },
    maskToDigits: (n) => {
      const res = [];
      // Assumes n is a Number (candidate mask)
      for (let i = 1; i <= 9; i++) if ((n >> (i - 1)) & 1) res.push(i);
      return res;
    },
    maskFromSet: (set) => {
      let m = 0;
      for (const d of set) m |= 1 << (d - 1);
      return m;
    },
  },

  // --- ALS COLLECTION ENGINE ---
});
