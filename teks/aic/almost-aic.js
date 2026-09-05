Object.assign(techniques, {
  _almostAicMaxBranchNodes: 16,
  _buildAlmostAicGraph: (board, pencils) => {
    techniques._useSharedAICCache(board, pencils);
    const cache = techniques._aicCache;

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
      return newNode;
    };

    if (
      cache.AlmostAicGraph &&
      cache.AlmostAicGraph.nodeCount === allNodes.length
    ) {
      return cache.AlmostAicGraph;
    }

    // 1. Every OR gate the AIC core knows how to build.
    let orMap = new Map();
    allNodes.forEach((n) => orMap.set(n, new Set()));

    if (cache.BilocationOrMap.size === 0) {
      cache.BilocationOrMap = techniques.buildBilocationOrMap(allNodes);
    }
    orMap = techniques.mergeOrMaps(orMap, cache.BilocationOrMap);

    if (cache.BivalueOrMap.size === 0) {
      cache.BivalueOrMap = techniques.buildBivalueOrMap(allNodes);
    }
    orMap = techniques.mergeOrMaps(orMap, cache.BivalueOrMap);

    if (cache.GroupedOrMap.size === 0) {
      cache.GroupedOrMap = techniques.buildGroupedOrMap(
        pencils,
        (cells, d) => getNode(cells, [d]),
        cache.GroupedLinkRegistry,
      );
    }
    orMap = techniques.mergeOrMaps(orMap, cache.GroupedOrMap);

    if (cache.AlsMap.size === 0) {
      cache.AlsMap = techniques.buildAlsOrMap(
        board,
        pencils,
        (cells, d) => getNode(cells, [d]),
        cache.AlsLinkRegistry,
      );
    }
    orMap = techniques.mergeOrMaps(orMap, cache.AlsMap);

    if (cache.FishMap.size === 0) {
      cache.FishMap = techniques.buildFishOrMap(
        board,
        pencils,
        (cells, d) => getNode(cells, [d]),
        cache.FishLinkRegistry,
      );
    }
    orMap = techniques.mergeOrMaps(orMap, cache.FishMap);

    // 2. Flatten to index based adjacency so a branch walk stays cheap.
    const nodes = [];
    for (const node of allNodes) {
      const neighbors = orMap.get(node);
      if (
        (neighbors && neighbors.size > 0) ||
        (node.isSingleCell && node.isSingleDigit)
      ) {
        nodes.push(node);
      }
    }

    const nodeIndex = new Map();
    nodes.forEach((node, index) => nodeIndex.set(node, index));

    const orAdj = nodes.map((node) => {
      const list = [];
      const neighbors = orMap.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const index = nodeIndex.get(neighbor);
          if (index !== undefined) list.push(index);
        }
      }
      return Int32Array.from(list);
    });

    const nodesByDigit = Array.from({ length: 10 }, () => []);
    const singleCellNodes = Array.from({ length: 81 }, () => []);

    for (const node of nodes) {
      if (node.digits.length !== 1) continue;
      nodesByDigit[node.digits[0]].push(node);
      if (node.cells.length === 1) singleCellNodes[node.cells[0]].push(node);
    }

    const nandAdj = nodes.map((node) => {
      if (node.digits.length !== 1) return Int32Array.from([]);

      const digit = node.digits[0];
      const targets = new Set();

      for (const other of nodesByDigit[digit]) {
        if (
          other !== node &&
          techniques.isBitsetSubset(other.NodeBitset, node.NandBitset)
        ) {
          targets.add(nodeIndex.get(other));
        }
      }

      if (node.cells.length === 1) {
        for (const other of singleCellNodes[node.cells[0]]) {
          if (other !== node && other.digits[0] !== digit) {
            targets.add(nodeIndex.get(other));
          }
        }
      }

      return Int32Array.from(targets);
    });

    const graph = {
      nodeCount: allNodes.length,
      nodes,
      nodeIndex,
      orAdj,
      nandAdj,
      getNode,
      alsLinkRegistry: cache.AlsLinkRegistry,
      groupedLinkRegistry: cache.GroupedLinkRegistry,
      fishLinkRegistry: cache.FishLinkRegistry,
      walkCache: new Map(),
      maskCache: new Map(),
    };

    cache.AlmostAicGraph = graph;
    return graph;
  },

  /**
   * Propagates one branch: the start node is assumed TRUE, so the walk leaves
   * it through a weak link and then alternates. Nodes reached through an OR
   * gate are TRUE and are the ones a branch may conclude with.
   */
  _almostAicWalk: (graph, startNode) => {
    const cached = graph.walkCache.get(startNode);
    if (cached) return cached;

    const { nodes, nodeIndex, orAdj, nandAdj } = graph;
    const startIndex = nodeIndex.get(startNode);
    const size = nodes.length;
    const maxNodes = techniques._almostAicMaxBranchNodes;

    // parity 0: node is TRUE  (arrived through an OR gate, leaves weakly)
    // parity 1: node is FALSE (arrived through a weak link, leaves strongly)
    const capacity = 2 * size + 1;
    const stateNode = new Int32Array(capacity);
    const stateParent = new Int32Array(capacity);
    const stateParity = new Uint8Array(capacity);
    const stateDepth = new Int16Array(capacity);
    const bestDepth = new Int16Array(2 * size);
    const trueState = new Int32Array(size).fill(-1);
    const reachOrder = [];

    stateNode[0] = startIndex;
    stateParent[0] = -1;
    stateParity[0] = 0;
    stateDepth[0] = 1;
    bestDepth[startIndex * 2] = 1;
    trueState[startIndex] = 0;
    reachOrder.push(startIndex);

    let count = 1;
    let head = 0;

    while (head < count) {
      const current = head++;
      const depth = stateDepth[current];
      if (depth >= maxNodes) continue;

      const parity = stateParity[current];
      const source = stateNode[current];
      const neighbors = parity === 0 ? nandAdj[source] : orAdj[source];
      const nextParity = parity === 0 ? 1 : 0;
      const nextDepth = depth + 1;

      for (let i = 0; i < neighbors.length; i++) {
        const next = neighbors[i];
        const key = next * 2 + nextParity;
        const previous = bestDepth[key];
        if (previous !== 0 && previous <= nextDepth) continue;

        // A chain may never reuse a node.
        let ancestor = current;
        let repeated = false;
        while (ancestor !== -1) {
          if (stateNode[ancestor] === next) {
            repeated = true;
            break;
          }
          ancestor = stateParent[ancestor];
        }
        if (repeated) continue;

        bestDepth[key] = nextDepth;
        const pushed = count++;
        stateNode[pushed] = next;
        stateParent[pushed] = current;
        stateParity[pushed] = nextParity;
        stateDepth[pushed] = nextDepth;

        if (nextParity === 0 && trueState[next] === -1) {
          trueState[next] = pushed;
          reachOrder.push(next);
        }
      }
    }

    // Union of what every TRUE node of the branch removes.
    const mask = Array.from({ length: 9 }, () => [0, 0, 0]);
    for (const index of reachOrder) {
      const nand = nodes[index].NandBitset;
      for (let d = 0; d < 9; d++) {
        mask[d][0] |= nand[d][0];
        mask[d][1] |= nand[d][1];
        mask[d][2] |= nand[d][2];
      }
    }

    const walk = { stateNode, stateParent, trueState, reachOrder, mask };

    if (graph.walkCache.size >= 96) {
      const oldest = graph.walkCache.keys().next().value;
      graph.walkCache.delete(oldest);
    }
    graph.walkCache.set(startNode, walk);
    graph.maskCache.set(startNode, mask);

    return walk;
  },

  _almostAicMask: (graph, startNode) => {
    const cached = graph.maskCache.get(startNode);
    if (cached) return cached;
    return techniques._almostAicWalk(graph, startNode).mask;
  },

  _almostAicPath: (graph, walk, nodeIndex) => {
    const state = walk.trueState[nodeIndex];
    if (state === -1) return null;

    const path = [];
    let current = state;
    while (current !== -1) {
      path.push(graph.nodes[walk.stateNode[current]]);
      current = walk.stateParent[current];
    }
    path.reverse();
    return path;
  },

  _almostAicCore: (
    board,
    pencils,
    isRegion,
    findAll = false,
    focusKind = null,
    seenEliminations = null,
  ) => {
    const results = [];
    const recordedEliminations = findAll
      ? (seenEliminations ?? new Set())
      : null;
    const isAals = focusKind === "aals";
    const isCell = !isRegion && !isAals;

    const graph = techniques._buildAlmostAicGraph(board, pencils);
    const getNode = graph.getNode;
    const alsLinkRegistry = graph.alsLinkRegistry;
    const groupedLinkRegistry = graph.groupedLinkRegistry;
    const fishLinkRegistry = graph.fishLinkRegistry;

    const getLoc = techniques._formatAicLocation;

    const getCompactFinLoc = techniques._formatCompactAicLocation;

    // One Eureka term per strong link, following the AIC core formatting.
    const strongTerm = (u, v, lastDigit) => {
      const als = alsLinkRegistry.get(u)?.get(v);
      if (als) {
        const alsIds = als.cells.map((cell) => cell[0] * 9 + cell[1]);
        const preferBox =
          als.unitName && als.unitName.includes(t("teks_unit_box"));
        return {
          text: `(${u.digits[0]}=${v.digits[0]})${getLoc(alsIds, preferBox)}`,
          digit: v.digits[0],
        };
      }

      const fish = fishLinkRegistry.get(u)?.get(v);
      if (fish) {
        return {
          text: `(${fish.d})(${getCompactFinLoc(u.cells)}=${getCompactFinLoc(
            v.cells,
          )})(${fish.basesStr}\\${fish.coversStr})`,
          digit: fish.d,
        };
      }

      if (
        u.digits[0] !== v.digits[0] &&
        u.cells.length === 1 &&
        v.cells.length === 1 &&
        u.cells[0] === v.cells[0]
      ) {
        return {
          text: `(${u.digits[0]}=${v.digits[0]})${getLoc(u.cells)}`,
          digit: v.digits[0],
        };
      }

      const digit = u.digits[0];
      const prefix = lastDigit === digit ? "" : `(${digit})`;
      const preferBoxGate = groupedLinkRegistry.get(u)?.get(v) === "box";
      return {
        text: `${prefix}${getLoc(u.cells, preferBoxGate)}=${getLoc(
          v.cells,
          preferBoxGate,
        )}`,
        digit,
      };
    };

    const getClosestCells = (nodeA, nodeB) => {
      let minDistance = Infinity;
      let bestA = nodeA.cells[0];
      let bestB = nodeB.cells[0];
      for (const a of nodeA.cells) {
        for (const b of nodeB.cells) {
          const distance =
            Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) +
            Math.abs((a % 9) - (b % 9));
          if (distance < minDistance) {
            minDistance = distance;
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

    // 1. Collect stems. Death Blossom allows up to six branches; Almost AIC
    // stops at four because each branch reaches far further.
    const potentialStems = techniques._collectBlossomStems(
      board,
      pencils,
      isCell ? "cell" : isRegion ? "region" : "aals",
      4,
      4,
    );

    // 2. Every stem candidate grows one branch; an elimination has to survive
    // all of them, exactly as in Death Blossom.
    for (const stem of potentialStems) {
      const startNodes = isCell
        ? stem.startDigits.map((d) => getNode([stem.cellId], [d]))
        : isRegion
          ? stem.cells.map((cId) => getNode([cId], [stem.digit]))
          : stem.startCandidates.map(({ id, digit }) => getNode([id], [digit]));

      if (startNodes.some((node) => !graph.nodeIndex.has(node))) continue;

      const stemCellSet = isRegion ? new Set(stem.cells) : null;
      const branchMasks = startNodes.map((node) =>
        techniques._almostAicMask(graph, node),
      );

      const commonMask = Array.from({ length: 9 }, () => [0, 0, 0]);
      let hasCommon = false;
      for (let d = 0; d < 9; d++) {
        for (let p = 0; p < 3; p++) {
          let bits = branchMasks[0][d][p];
          for (let i = 1; i < branchMasks.length; i++) {
            bits &= branchMasks[i][d][p];
          }
          commonMask[d][p] = bits;
          if (bits !== 0) hasCommon = true;
        }
      }
      if (!hasCommon) continue;

      const maskToElims = (mask) => {
        const found = [];
        for (let d = 0; d < 9; d++) {
          for (let p = 0; p < 3; p++) {
            let bits = mask[d][p];
            let bitPos = 0;
            while (bits > 0) {
              if (bits & 1) {
                const id = p * 27 + bitPos;
                const er = Math.floor(id / 9);
                const ec = id % 9;
                const num = d + 1;

                let isStemCandidate = false;
                if (isCell) {
                  if (er === stem.r && ec === stem.c) isStemCandidate = true;
                } else if (isRegion) {
                  if (num === stem.digit && stemCellSet.has(id))
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
              bits >>>= 1;
              bitPos++;
            }
          }
        }
        return found;
      };

      // Candidates the blossom as a whole can reach. They are only the pool
      // of targets to try; what gets reported is what the written chain
      // proves on its own.
      const reachableElims = maskToElims(commonMask);

      if (reachableElims.length === 0) continue;

      // 3. Rebuild the branches as writable chains. A branch may not run
      // through the stem itself, otherwise the single-chain notation would
      // contradict its own OR gate.
      const isStemNode = (node) => {
        if (node.cells.length !== 1) return false;
        if (isCell) return node.cells[0] === stem.cellId;
        if (isRegion)
          return (
            node.digits[0] === stem.digit && stemCellSet.has(node.cells[0])
          );
        return stem.startCandidateKeys.has(
          `${node.cells[0]}:${node.digits[0]}`,
        );
      };

      const cleanPathsFor = (startNode, digit, part, bit) => {
        const walk = techniques._almostAicWalk(graph, startNode);
        const paths = [];
        for (const index of walk.reachOrder) {
          const node = graph.nodes[index];
          if ((node.NandBitset[digit - 1][part] & (1 << bit)) === 0) continue;
          const path = techniques._almostAicPath(graph, walk, index);
          if (!path) continue;
          if (path.some((entry, position) => position > 0 && isStemNode(entry)))
            continue;
          paths.push(path);
          if (paths.length >= 6) break;
        }
        return paths;
      };

      const pickPair = (listA, listB) => {
        for (const a of listA) {
          const usedA = new Set(a);
          for (const b of listB) {
            if (b.every((node) => !usedA.has(node))) return [a, b];
          }
        }
        return [listA[0], listB[0]];
      };

      const provenElims = (paths) => {
        const mask = Array.from({ length: 9 }, () => [0, 0, 0]);
        const last = paths.map((path) => path[path.length - 1]);

        for (let d = 0; d < 9; d++) {
          for (let p = 0; p < 3; p++) {
            let bits = last[0].NandBitset[d][p];
            for (let i = 1; i < last.length; i++) {
              bits &= last[i].NandBitset[d][p];
            }
            mask[d][p] = bits;
          }
        }

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

      for (const candidate of reachableElims) {
        const id = candidate.r * 9 + candidate.c;
        const part = Math.floor(id / 27);
        const bit = id % 27;
        const lists = startNodes.map((node) =>
          cleanPathsFor(node, candidate.num, part, bit),
        );
        if (lists.some((list) => list.length === 0)) continue;

        const firstPair = pickPair(lists[0], lists[1]);

        let paths;
        if (startNodes.length === 3) {
          paths = [firstPair[0], firstPair[1], lists[2][0]];
        } else {
          const secondPair = pickPair(lists[2], lists[3]);
          paths = [firstPair[0], firstPair[1], secondPair[0], secondPair[1]];
        }

        const proven = provenElims(paths);
        if (proven.length === 0) continue;

        chosenPaths = paths;
        elims = proven;
        break;
      }

      if (!chosenPaths) continue;

      if (findAll) {
        elims = elims.filter((el) => {
          const key = `${el.r}:${el.c}:${el.num}`;
          if (recordedEliminations.has(key)) return false;
          recordedEliminations.add(key);
          return true;
        });
        if (elims.length === 0) continue;
      }

      // 4. Eureka notation: one single chain built out of two almost AICs
      // (three branches leave the last one as a plain AIC tail).
      const stemDigitsUnique =
        new Set(startNodes.map((node) => node.digits[0])).size ===
        startNodes.length;

      const stemGate = (left, right) => {
        if (isCell) {
          const leftDigits = left
            .map((node) => node.digits[0])
            .sort((a, b) => a - b)
            .join("");
          const rightDigits = right
            .map((node) => node.digits[0])
            .sort((a, b) => a - b)
            .join("");
          return `(${leftDigits}=${rightDigits})${getLoc([stem.cellId])}`;
        }

        if (isRegion) {
          return `(${stem.digit})${getLoc(
            left.flatMap((node) => node.cells),
          )}=${getLoc(right.flatMap((node) => node.cells))}`;
        }

        const alsLoc = getLoc(stem.cells, stem.unit >= 18);
        if (stemDigitsUnique) {
          const leftDigits = left
            .map((node) => node.digits[0])
            .sort((a, b) => a - b)
            .join("");
          const rightDigits = right
            .map((node) => node.digits[0])
            .sort((a, b) => a - b)
            .join("");
          return `(${leftDigits}=${rightDigits})${alsLoc}`;
        }

        const describe = (list) =>
          list
            .map((node) => `${node.digits[0]}${getLoc(node.cells)}`)
            .join(",");
        return `(${describe(left)}=${describe(right)})${alsLoc}`;
      };

      const emit = (state, u, v) => {
        const term = strongTerm(u, v, state.lastDigit);
        state.lastDigit = term.digit;
        return term.text;
      };

      const reverseTerms = (path, state) => {
        const terms = [];
        for (let i = path.length - 1; i >= 2; i -= 2) {
          terms.push(emit(state, path[i], path[i - 1]));
        }
        return terms;
      };

      const forwardTerms = (path, state) => {
        const terms = [];
        for (let i = 1; i + 1 < path.length; i += 2) {
          terms.push(emit(state, path[i], path[i + 1]));
        }
        return terms;
      };

      const almostBracket = (indexA, indexB) => {
        const state = { lastDigit: null };
        const terms = reverseTerms(chosenPaths[indexA], state);
        terms.push(stemGate([startNodes[indexA]], [startNodes[indexB]]));
        state.lastDigit = startNodes[indexB].digits[0];
        terms.push(...forwardTerms(chosenPaths[indexB], state));
        return `[${terms.join("-")}]`;
      };

      let eurekaStr;
      if (startNodes.length === 3) {
        const state = { lastDigit: startNodes[2].digits[0] };
        const tail = [stemGate(startNodes.slice(0, 2), [startNodes[2]])];
        tail.push(...forwardTerms(chosenPaths[2], state));
        eurekaStr = `${almostBracket(0, 1)} + ${tail.join("-")}`;
      } else {
        eurekaStr = [
          almostBracket(0, 1),
          stemGate(startNodes.slice(0, 2), startNodes.slice(2)),
          almostBracket(2, 3),
        ].join(" + ");
      }

      // 5. Structures the chains leaned on, for the AIC style visuals.
      const usedAlses = [];
      const usedFishes = [];
      const fishNodes = new Set();
      const seenAlsKeys = new Set();
      const seenFishKeys = new Set();

      for (const path of chosenPaths) {
        for (let i = 1; i + 1 < path.length; i += 2) {
          const u = path[i];
          const v = path[i + 1];

          const als = alsLinkRegistry.get(u)?.get(v);
          if (als) {
            const key = als.cells
              .map((cell) => cell[0] * 9 + cell[1])
              .sort((a, b) => a - b)
              .join(",");
            if (!seenAlsKeys.has(key)) {
              seenAlsKeys.add(key);
              usedAlses.push(als.cells);
            }
            continue;
          }

          const fish = fishLinkRegistry.get(u)?.get(v);
          if (fish) {
            const key = `${fish.d}:${fish.basesStr}\\${fish.coversStr}`;
            if (!seenFishKeys.has(key)) {
              seenFishKeys.add(key);
              usedFishes.push(fish);
            }
            fishNodes.add(u);
            fishNodes.add(v);
          }
        }
      }

      const techniqueName = isAals
        ? t("teks_AALS_AAIC")
        : isRegion
          ? t("teks_region_AAIC")
          : t("teks_cell_AAIC");
      const mainInfoStr = isAals
        ? t("teks_stem_AALS", stem.startDigits.join(""), stem.houseName)
        : isRegion
          ? t("teks_blossom_house_stem", stem.digit, stem.houseName)
          : t("teks_blossom_cell_stem", stem.r + 1, stem.c + 1);

      const cellColors = [];
      const candidateColors = [];
      const candidateMarks = [];
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

      const colorCodes = [6, 7, 2, 3, 4, 1, 8];
      let colorCount = -1;
      for (const cells of usedAlses) {
        colorCount++;
        const color = colorCodes[colorCount % colorCodes.length];
        for (const [r, c] of cells) {
          cellColors.push({ r, c, color, mode: "add" });
        }
      }
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

      for (const path of chosenPaths) {
        path.forEach((node, index) => {
          if (fishNodes.has(node)) return;
          const color = index % 2 === 0 ? 4 : 5;
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

        path.forEach((node, index) => {
          if (fishNodes.has(node) || node.cells.length < 2) return;
          const color = index % 2 === 0 ? 4 : 5;
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
        });

        for (let i = 0; i < path.length - 1; i++) {
          if (
            i % 2 === 1 &&
            fishLinkRegistry.get(path[i])?.get(path[i + 1])
          ) {
            continue;
          }
          const [from, to] = getClosestCells(path[i], path[i + 1]);
          links.push({
            r1: from[0],
            c1: from[1],
            n1: path[i].digits[0],
            r2: to[0],
            c2: to[1],
            n2: path[i + 1].digits[0],
            color: 0,
            style: i % 2 === 0 ? "dash" : "solid",
          });
        }
      }

      for (let i = 0; i < startNodes.length - 1; i++) {
        const [from, to] = getClosestCells(startNodes[i], startNodes[i + 1]);
        links.push({
          r1: from[0],
          c1: from[1],
          n1: startNodes[i].digits[0],
          r2: to[0],
          c2: to[1],
          n2: startNodes[i + 1].digits[0],
          color: 1,
          style: "solid",
        });
      }
      candidateMarks.push(
        ...elims.map(({ r, c, num }) => ({
          r,
          c,
          num,
          marker: "slash",
          color: 0,
        })),
      );

      const resultObj = {
        change: true,
        type: "remove",
        cells: elims,
        hint: {
          name: techniqueName,
          mainInfo: mainInfoStr,
          detail: eurekaStr,
        },
        visualPlan: {
          highlight: { digit: null, state: 0 },
          cellColors,
          candidateColors,
          candidateMarks,
          links,
        },
      };

      if (!findAll) return resultObj;
      results.push(resultObj);
    }

    return findAll ? results : { change: false };
  },

  almostAic: (board, pencils, findAll = false) => {
    if (findAll) {
      const seenEliminations = new Set();
      return [
        ...techniques.cellAlmostAic(board, pencils, true, seenEliminations),
        ...techniques.regionAlmostAic(board, pencils, true, seenEliminations),
        ...techniques.aalsAlmostAic(board, pencils, true, seenEliminations),
      ];
    }
    const cell = techniques.cellAlmostAic(board, pencils, false);
    if (cell.change) return cell;
    const region = techniques.regionAlmostAic(board, pencils, false);
    if (region.change) return region;
    return techniques.aalsAlmostAic(board, pencils, false);
  },

  cellAlmostAic: (board, pencils, findAll = false, seenEliminations = null) => {
    return techniques._almostAicCore(
      board,
      pencils,
      false,
      findAll,
      null,
      seenEliminations,
    );
  },

  regionAlmostAic: (
    board,
    pencils,
    findAll = false,
    seenEliminations = null,
  ) => {
    return techniques._almostAicCore(
      board,
      pencils,
      true,
      findAll,
      null,
      seenEliminations,
    );
  },

  aalsAlmostAic: (board, pencils, findAll = false, seenEliminations = null) => {
    return techniques._almostAicCore(
      board,
      pencils,
      false,
      findAll,
      "aals",
      seenEliminations,
    );
  },
});
