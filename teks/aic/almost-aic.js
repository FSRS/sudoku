Object.assign(techniques, {
  // --- Almost AIC ---
  _almostAicMaxBranchNodes: 16,
  _buildAlmostAicGraph: (board, pencils, alsOnly = false) => {
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

    const cacheKey = alsOnly ? "DeathBlossomGraph" : "AlmostAicGraph";
    if (cache[cacheKey] && cache[cacheKey].nodeCount === allNodes.length) {
      return cache[cacheKey];
    }

    // 1. Every OR gate the AIC core knows how to build.
    let orMap = new Map();
    allNodes.forEach((n) => orMap.set(n, new Set()));

    if (!alsOnly) {
      if (cache.BilocationOrMap.size === 0) {
        cache.BilocationOrMap = techniques.buildBilocationOrMap(allNodes);
      }
      orMap = techniques.mergeOrMaps(orMap, cache.BilocationOrMap);
    }

    if (cache.BivalueOrMap.size === 0) {
      cache.BivalueOrMap = techniques.buildBivalueOrMap(allNodes);
    }
    orMap = techniques.mergeOrMaps(orMap, cache.BivalueOrMap);

    if (!alsOnly) {
      if (cache.GroupedOrMap.size === 0) {
        cache.GroupedOrMap = techniques.buildGroupedOrMap(
          pencils,
          (cells, d) => getNode(cells, [d]),
          cache.GroupedLinkRegistry,
        );
      }
      orMap = techniques.mergeOrMaps(orMap, cache.GroupedOrMap);
    }

    if (cache.AlsMap.size === 0) {
      cache.AlsMap = techniques.buildAlsOrMap(
        board,
        pencils,
        (cells, d) => getNode(cells, [d]),
        cache.AlsLinkRegistry,
      );
    }
    orMap = techniques.mergeOrMaps(orMap, cache.AlsMap);

    if (!alsOnly) {
      if (cache.FishMap.size === 0) {
        cache.FishMap = techniques.buildFishOrMap(
          board,
          pencils,
          (cells, d) => getNode(cells, [d]),
          cache.FishLinkRegistry,
        );
      }
      orMap = techniques.mergeOrMaps(orMap, cache.FishMap);
    }

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
    const basicNodes = new Array(81 * 9);

    for (const node of nodes) {
      if (node.digits.length !== 1) continue;
      nodesByDigit[node.digits[0]].push(node);
      if (node.cells.length === 1) {
        singleCellNodes[node.cells[0]].push(node);
        basicNodes[node.cells[0] * 9 + node.digits[0] - 1] = node;
      }
    }

    const weakTargets = (node) => {
      if (node.digits.length !== 1) return Int32Array.from([]);

      const digit = node.digits[0];
      const targets = new Set();

      // Every node in the bucket carries only `digit`, so three words decide
      // whether it sits inside this node's weak-link set.
      const nand = node.NandBitset[digit - 1];
      for (const other of nodesByDigit[digit]) {
        if (other === node) continue;
        const bits = other.NodeBitset[digit - 1];
        if (
          (bits[0] & nand[0]) === bits[0] &&
          (bits[1] & nand[1]) === bits[1] &&
          (bits[2] & nand[2]) === bits[2]
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
    };

    const nandAdj = new Array(nodes.length);
    const nandOf = (index) => {
      if (!nandAdj[index]) nandAdj[index] = weakTargets(nodes[index]);
      return nandAdj[index];
    };

    const seers = new Map();
    const seersOf = (digit, cell) => {
      const key = (digit - 1) * 81 + cell;
      let list = seers.get(key);
      if (!list) {
        const part = Math.floor(cell / 27);
        const bit = 1 << (cell % 27);
        const found = [];
        nodes.forEach((node, index) => {
          if (node.NandBitset[digit - 1][part] & bit) found.push(index);
        });
        list = Int32Array.from(found);
        seers.set(key, list);
      }
      return list;
    };

    const graph = {
      nodeCount: allNodes.length,
      nodes,
      nodeIndex,
      orAdj,
      nandOf,
      seersOf,
      maxBranchNodes: alsOnly ? 3 : techniques._almostAicMaxBranchNodes,
      basicNode: (cell, digit) => basicNodes[cell * 9 + digit - 1],
      alsLinkRegistry: cache.AlsLinkRegistry,
      groupedLinkRegistry: cache.GroupedLinkRegistry,
      fishLinkRegistry: cache.FishLinkRegistry,
      walkCache: new Map(),
      maskCache: new Map(),
    };

    cache[cacheKey] = graph;
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

    const { nodes, nodeIndex, orAdj, nandOf } = graph;
    const startIndex = nodeIndex.get(startNode);
    const size = nodes.length;
    const maxNodes = graph.maxBranchNodes;

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
      const neighbors = parity === 0 ? nandOf(source) : orAdj[source];
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
    alsOnly = false,
  ) => {
    const results = [];
    const recordedEliminations = findAll
      ? (seenEliminations ?? new Set())
      : null;
    const isAals = focusKind === "aals";
    const isCell = !isRegion && !isAals;

    const graph = techniques._buildAlmostAicGraph(board, pencils, alsOnly);
    const alsLinkRegistry = graph.alsLinkRegistry;
    const groupedLinkRegistry = graph.groupedLinkRegistry;
    const fishLinkRegistry = graph.fishLinkRegistry;

    const getLoc = techniques._formatAicLocation;

    const getFishLoc = techniques._formatFishNodeLocation;

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
          text: `(${fish.d})(${getFishLoc(fish, u)}=${getFishLoc(
            fish,
            v,
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

    const groupNodes = new Map();
    const groupNode = (cells, digit) => {
      const sorted = [...cells].sort((a, b) => a - b);
      const key = `${digit}:${sorted.join(",")}`;
      let node = groupNodes.get(key);
      if (!node) {
        node = new AICNode(sorted, [digit]);
        groupNodes.set(key, node);
      }
      return node;
    };

    // 1. Collect stems. Cell candidates never share a weak link, so only
    // cell stems are capped here.
    const potentialStems = techniques._collectBlossomStems(
      board,
      pencils,
      isCell ? "cell" : isRegion ? "region" : "aals",
      isCell ? 4 : Infinity,
      Infinity,
    );

    // 2. Every stem candidate grows one branch; an elimination has to survive
    // all of them.
    const commonMask = Array.from({ length: 9 }, () => [0, 0, 0]);
    for (const stem of potentialStems) {
      const startNodes = isCell
        ? stem.startDigits.map((d) => graph.basicNode(stem.cellId, d))
        : isRegion
          ? stem.cells.map((cId) => graph.basicNode(cId, stem.digit))
          : stem.startDigits.flatMap((digit) =>
              stem.cellsByDigit[digit].map((id) => graph.basicNode(id, digit)),
            );

      if (startNodes.some((node) => !node)) continue;

      let hasCommon = true;
      for (let i = 0; hasCommon && i < startNodes.length; i++) {
        const mask = techniques._almostAicMask(graph, startNodes[i]);
        hasCommon = false;
        for (let d = 0; d < 9; d++) {
          for (let p = 0; p < 3; p++) {
            const bits = i === 0 ? mask[d][p] : commonMask[d][p] & mask[d][p];
            commonMask[d][p] = bits;
            if (bits !== 0) hasCommon = true;
          }
        }
      }
      if (!hasCommon) continue;

      const stemCellSet = isRegion ? new Set(stem.cells) : null;
      const stemCandidates = isAals
        ? new Set(
            startNodes.map((node) => node.cells[0] * 9 + node.digits[0] - 1),
          )
        : null;

      const maskToElims = (mask) => {
        const found = [];
        for (let d = 0; d < 9; d++) {
          for (const id of techniques._getCellBits(mask[d])) {
            const er = Math.floor(id / 9);
            const ec = id % 9;
            const num = d + 1;

            let isStemCandidate = false;
            if (isCell) {
              if (er === stem.r && ec === stem.c) isStemCandidate = true;
            } else if (isRegion) {
              if (num === stem.digit && stemCellSet.has(id))
                isStemCandidate = true;
            } else if (stemCandidates.has(id * 9 + num - 1)) {
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
        return stemCandidates.has(node.cells[0] * 9 + node.digits[0] - 1);
      };

      const branchesFor = (startNode, digit, part, bit) => {
        const sees = (node) =>
          (node.NandBitset[digit - 1][part] & (1 << bit)) !== 0;
        const paths = [];
        const byWeak = new Map();
        const add = (path, listed = true) => {
          if (listed && paths.length < 6) paths.push(path);
          const key = path.length > 1 ? path[1] : null;
          const list = byWeak.get(key);
          if (!list) byWeak.set(key, [path]);
          else if (list.length < 6) list.push(path);
        };
        if (alsOnly) {
          // Not the walk: it keeps one parent per node, which may be a stem
          // candidate while another weak link reaches the same node.
          if (sees(startNode)) add([startNode]);
          const reached = new Set([startNode]);
          for (const weak of graph.nandOf(graph.nodeIndex.get(startNode))) {
            const n = graph.nodes[weak];
            if (isStemNode(n)) continue;
            for (const strong of graph.orAdj[weak]) {
              const o = graph.nodes[strong];
              const fresh = !reached.has(o);
              reached.add(o);
              if (o !== startNode && sees(o)) add([startNode, n, o], fresh);
            }
          }
          return { paths, byWeak };
        }
        const walk = techniques._almostAicWalk(graph, startNode);
        const reached = graph
          .seersOf(digit, part * 27 + bit)
          .filter((index) => walk.trueState[index] !== -1)
          .sort((a, b) => walk.trueState[a] - walk.trueState[b]);
        // A path that asserts the target cannot remove it.
        const asserts = (node) =>
          (node.NodeBitset[digit - 1][part] & (1 << bit)) !== 0;
        for (const index of reached) {
          const path = techniques._almostAicPath(graph, walk, index);
          if (!path) continue;
          if (
            path.some(
              (entry, position) =>
                position > 0 &&
                (isStemNode(entry) || (position % 2 === 0 && asserts(entry))),
            )
          )
            continue;
          add(path);
        }
        return { paths, byWeak };
      };

      // Candidates of one digit whose branches start with the same weak link
      // (or that all see the target) form one group node. Takes the fewest
      // groups, at most four.
      const groupBranches = (branches) => {
        let best = null;
        const chosen = [];
        const covered = startNodes.map(() => false);
        const search = () => {
          if (best && chosen.length >= best.length) return;
          const first = covered.indexOf(false);
          if (first === -1) {
            best = chosen.slice();
            return;
          }
          if (chosen.length === 4 || (best && chosen.length + 1 >= best.length))
            return;
          const digit = startNodes[first].digits[0];
          const options = [];
          for (const key of branches[first].byWeak.keys()) {
            const members = [];
            for (let i = first; i < startNodes.length; i++) {
              if (
                !covered[i] &&
                startNodes[i].digits[0] === digit &&
                branches[i].byWeak.has(key)
              ) {
                members.push(i);
              }
            }
            const id = members.join();
            if (members.length > 1 && !options.some((m) => m.join() === id)) {
              options.push(members);
            }
          }
          options.sort((a, b) => b.length - a.length);
          options.push([first]);
          for (const members of options) {
            for (const i of members) covered[i] = true;
            chosen.push(members);
            search();
            chosen.pop();
            for (const i of members) covered[i] = false;
          }
        };
        search();
        return best;
      };

      const buildGroup = (members, branches) => {
        if (members.length === 1) {
          return {
            node: startNodes[members[0]],
            paths: branches[members[0]].paths,
          };
        }
        const node = groupNode(
          members.flatMap((i) => startNodes[i].cells),
          startNodes[members[0]].digits[0],
        );
        const paths = [];
        for (const [key, list] of branches[members[0]].byWeak) {
          if (!members.every((i) => branches[i].byWeak.has(key))) continue;
          for (const path of list) {
            if (paths.length < 6) paths.push([node, ...path.slice(1)]);
          }
        }
        return { node, paths };
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

      // Normal mode needs the first writable proof. findAll retains every
      // proof that contributes at least one previously unreported elimination.
      const candidateProofs = [];

      for (const candidate of reachableElims) {
        const id = candidate.r * 9 + candidate.c;
        const part = Math.floor(id / 27);
        const bit = id % 27;
        const branches = [];
        for (const node of startNodes) {
          const branch = branchesFor(node, candidate.num, part, bit);
          if (branch.paths.length === 0) break;
          branches.push(branch);
        }
        if (branches.length < startNodes.length) continue;

        const grouping = groupBranches(branches);
        if (!grouping || grouping.length < 2) continue;
        const groups = grouping.map((members) => buildGroup(members, branches));
        const starts = groups.map((group) => group.node);
        // A written chain may not pass through one of its own grouped starts.
        const merged = starts.filter((node) => node.cells.length > 1);
        const isMergedStart = (node) =>
          merged.some(
            (start) =>
              node.digits[0] === start.digits[0] &&
              node.cells.length === start.cells.length &&
              node.cells.every((id) => start.cells.includes(id)),
          );
        const lists = groups.map((group) =>
          group.paths.filter(
            (path) =>
              !path.some(
                (node, position) =>
                  position > 0 &&
                  !(alsOnly && position === path.length - 1) &&
                  isMergedStart(node),
              ),
          ),
        );
        if (lists.some((list) => list.length === 0)) continue;

        const firstPair = pickPair(lists[0], lists[1]);

        let paths;
        if (groups.length === 2) {
          paths = firstPair;
        } else if (groups.length === 3) {
          paths = [firstPair[0], firstPair[1], lists[2][0]];
        } else {
          const secondPair = pickPair(lists[2], lists[3]);
          paths = [firstPair[0], firstPair[1], secondPair[0], secondPair[1]];
        }

        const proven = provenElims(paths);
        if (proven.length === 0) continue;

        if (findAll) {
          // Deduplicate before continuing the target loop. If this proof is
          // already known, a later target from the same stem may still add a
          // different conclusion.
          const novelElims = proven.filter((el) => {
            const key = `${el.r}:${el.c}:${el.num}`;
            if (recordedEliminations.has(key)) return false;
            recordedEliminations.add(key);
            return true;
          });
          if (novelElims.length === 0) continue;

          candidateProofs.push({
            chosenPaths: paths,
            starts,
            elims: novelElims,
          });
          continue;
        }

        candidateProofs.push({ chosenPaths: paths, starts, elims: proven });
        break;
      }

      if (candidateProofs.length === 0) continue;

      for (const { chosenPaths, starts, elims } of candidateProofs) {
        // 4. Eureka notation: one single chain built out of two almost AICs
        // (three branches leave the last one as a plain AIC tail, and two
        // branches are a plain AIC).
        const stemDigitsUnique =
          new Set(starts.map((node) => node.digits[0])).size === starts.length;

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

        const almostChain = (indexA, indexB) => {
          const state = { lastDigit: null };
          const terms = reverseTerms(chosenPaths[indexA], state);
          terms.push(stemGate([starts[indexA]], [starts[indexB]]));
          state.lastDigit = starts[indexB].digits[0];
          terms.push(...forwardTerms(chosenPaths[indexB], state));
          return terms.join("-");
        };

        let eurekaStr;
        if (starts.length === 2) {
          eurekaStr = almostChain(0, 1);
        } else if (starts.length === 3) {
          const state = { lastDigit: starts[2].digits[0] };
          const tail = [stemGate(starts.slice(0, 2), [starts[2]])];
          tail.push(...forwardTerms(chosenPaths[2], state));
          eurekaStr = `[${almostChain(0, 1)}] + ${tail.join("-")}`;
        } else {
          eurekaStr = [
            `[${almostChain(0, 1)}]`,
            stemGate(starts.slice(0, 2), starts.slice(2)),
            `[${almostChain(2, 3)}]`,
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

        const techniqueName = alsOnly
          ? isAals
            ? t("teks_AALS_DB")
            : isRegion
              ? t("teks_region_DB")
              : t("teks_cell_DB")
          : isAals
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

        for (let i = 0; i < starts.length - 1; i++) {
          const [from, to] = getClosestCells(starts[i], starts[i + 1]);
          links.push({
            r1: from[0],
            c1: from[1],
            n1: starts[i].digits[0],
            r2: to[0],
            c2: to[1],
            n2: starts[i + 1].digits[0],
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
    }

    return findAll ? results : { change: false };
  },

  almostAic: (board, pencils, findAll = false) => {
    if (findAll) {
      return [
        ...techniques.cellAlmostAic(board, pencils, true),
        ...techniques.regionAlmostAic(board, pencils, true),
        ...techniques.aalsAlmostAic(board, pencils, true),
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
