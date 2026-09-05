Object.assign(techniques, {
  _buildBlossomVisualPlan: (blossom, removals, pencils) => {
    const usedAlses = blossom.alses;
    const burrNodes = blossom.burr;
    const paths = [blossom.mainPath, ...blossom.branches];
    const alsColorIndices = [6, 7, 2, 3, 4, 5, 8, 1];
    const cellColors = [];
    const candidateColors = [];
    const links = [];
    usedAlses.forEach((als, index) => {
      const color = alsColorIndices[index % alsColorIndices.length];
      for (const [r, c] of als.cells) {
        cellColors.push({ r, c, color, mode: "add" });
      }
    });

    for (const node of burrNodes) {
      for (const id of node.cells) {
        const r = Math.floor(id / 9);
        const c = id % 9;
        if (pencils[r][c].has(node.digits[0])) {
          candidateColors.push({
            r,
            c,
            num: node.digits[0],
            color: 6,
            mode: "add",
          });
        }
      }
    }

    const drawnGroupedNodeKeys = new Set();
    const closest = (left, right) => {
      let pair = [left.cells[0], right.cells[0]];
      let distance = Infinity;
      for (const x of left.cells) {
        for (const y of right.cells) {
          const next =
            Math.abs(Math.floor(x / 9) - Math.floor(y / 9)) +
            Math.abs((x % 9) - (y % 9));
          if (next < distance) {
            distance = next;
            pair = [x, y];
          }
        }
      }
      return pair;
    };

    paths.forEach((path, pathIndex) => {
      const isBurringLoop = pathIndex === 0;
      const pathColorIndices = isBurringLoop ? [4, 2] : [7, 5, 8, 3];
      const lineColorIndex = isBurringLoop
        ? 0
        : 1 + ((pathIndex - 1) % 8);
      path.forEach((node, nodeIndex) => {
        const color = pathColorIndices[nodeIndex % pathColorIndices.length];
        for (const id of node.cells) {
          const r = Math.floor(id / 9);
          const c = id % 9;
          if (pencils[r][c].has(node.digits[0])) {
            candidateColors.push({
              r,
              c,
              num: node.digits[0],
              color,
              mode: "add",
            });
          }
        }
      });

      path.forEach((node, nodeIndex) => {
        if (node.cells.length < 2) return;
        const key = `${node.digits[0]}:${[...node.cells]
          .sort((a, b) => a - b)
          .join(",")}`;
        if (drawnGroupedNodeKeys.has(key)) return;
        drawnGroupedNodeKeys.add(key);

        const groupLineColorIndex = nodeIndex % 2 === 0 ? 5 : 4;
        for (let i = 0; i + 1 < node.cells.length; i++) {
          const left = node.cells[i];
          const right = node.cells[i + 1];
          links.push({
            r1: Math.floor(left / 9),
            c1: left % 9,
            n1: node.digits[0],
            r2: Math.floor(right / 9),
            c2: right % 9,
            n2: node.digits[0],
            color: groupLineColorIndex,
            style: "solid",
            role: isBurringLoop ? "blossom-main-group" : "blossom-branch-group",
          });
        }
      });
      for (let i = 0; i + 1 < path.length; i++) {
        const [x, y] = closest(path[i], path[i + 1]);
        links.push({
          r1: Math.floor(x / 9),
          c1: x % 9,
          n1: path[i].digits[0],
          r2: Math.floor(y / 9),
          c2: y % 9,
          n2: path[i + 1].digits[0],
          color: lineColorIndex,
          style: i % 2 === 0 ? "dash" : "solid",
          role: isBurringLoop ? "blossom-main" : "blossom-branch",
        });
      }
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
      links,
    };
  },

  _blossomLoopCore: (
    board,
    pencils,
    isRegion,
    findAll = false,
    focusKindOverride = null,
  ) => {
    const focusKind = focusKindOverride || (isRegion ? "region" : "cell");
    techniques._useSharedAICCache(board, pencils);
    const cache = techniques._aicCache;
    if (cache.AllNodes.length === 0) {
      const bitsets = techniques.buildCandidateBitsets(board, pencils);
      const baseNodes = techniques.generateBasicNodesFromBitsets(bitsets);
      for (const node of baseNodes) {
        const key = `${node.digits.join(",")}_${node.cells.join(",")}`;
        cache.NodeCache.set(key, node);
        cache.AllNodes.push(node);
      }
    }

    const allNodes = cache.AllNodes;
    const nodeCache = cache.NodeCache;
    const getNode = (cells, digit) => {
      const sortedCells = [...cells].sort((a, b) => a - b);
      const key = `${digit}_${sortedCells.join(",")}`;
      if (nodeCache.has(key)) return nodeCache.get(key);
      const node = new AICNode(sortedCells, [digit]);
      nodeCache.set(key, node);
      allNodes.push(node);
      return node;
    };

    let orMap = new Map();
    for (const node of allNodes) orMap.set(node, new Set());

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
        (cells, digit) => getNode(cells, digit),
        cache.GroupedLinkRegistry,
      );
    }
    orMap = techniques.mergeOrMaps(orMap, cache.GroupedOrMap);

    const blossomAlsPolicyKey = "blossom-full-sectors";
    let blossomAlsPolicy = cache.AlsPolicyCache.get(blossomAlsPolicyKey);
    if (!blossomAlsPolicy) {
      const registry = new Map();
      const map = techniques.buildAlsOrMap(
        board,
        pencils,
        (cells, digit) => getNode(cells, digit),
        registry,
        {
          preferSmallestAls: true,
          requireAlsCellSubsetForDominance: false,
        },
      );
      blossomAlsPolicy = { map, registry };
      cache.AlsPolicyCache.set(blossomAlsPolicyKey, blossomAlsPolicy);
    }
    const blossomAlsMap = blossomAlsPolicy.map;
    const blossomAlsLinkRegistry = blossomAlsPolicy.registry;
    orMap = techniques.mergeOrMaps(orMap, blossomAlsMap);

    const candidateCode = (id, digit) => (digit - 1) * 81 + id;
    const candidateId = (code) => code % 81;
    const candidateDigit = (code) => Math.floor(code / 81) + 1;
    const actualCandidate = (id, digit) => {
      const r = Math.floor(id / 9);
      const c = id % 9;
      return board[r][c] === 0 && pencils[r][c]?.has(digit);
    };

    const forEachBitsetCandidate = (bitset, visit) => {
      for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
        const base = digitIndex * 81;
        for (let part = 0; part < 3; part++) {
          let bits = bitset[digitIndex][part] >>> 0;
          while (bits !== 0) {
            const low = bits & -bits;
            const id = part * 27 + (31 - Math.clz32(low));
            if (id < 81) visit(base + id);
            bits = (bits & (bits - 1)) >>> 0;
          }
        }
      }
    };

    let search = cache.BlossomSearchCache;
    if (!search || search.nodeCount !== allNodes.length) {
      const nodeCount = allNodes.length;
      const indexOf = new Map();
      for (let index = 0; index < nodeCount; index++) {
        indexOf.set(allNodes[index], index);
      }

      const strongOffsets = new Int32Array(nodeCount + 1);
      const strongLists = new Array(nodeCount);
      let strongTotal = 0;
      for (let index = 0; index < nodeCount; index++) {
        const neighbors = orMap.get(allNodes[index]);
        if (!neighbors || neighbors.size === 0) {
          strongLists[index] = null;
          continue;
        }
        const list = [];
        for (const neighbor of neighbors) {
          const other = indexOf.get(neighbor);
          if (other !== undefined && other !== index) list.push(other);
        }
        if (list.length === 0) {
          strongLists[index] = null;
          continue;
        }
        list.sort((left, right) => left - right);
        strongLists[index] = list;
        strongTotal += list.length;
      }
      const strongTargets = new Int32Array(strongTotal);
      let strongCursor = 0;
      for (let index = 0; index < nodeCount; index++) {
        strongOffsets[index] = strongCursor;
        const list = strongLists[index];
        if (list) {
          for (let i = 0; i < list.length; i++) {
            strongTargets[strongCursor++] = list[i];
          }
        }
      }
      strongOffsets[nodeCount] = strongCursor;

      const nodesByCandidate = Array.from({ length: 729 }, () => []);
      for (let index = 0; index < nodeCount; index++) {
        if (!strongLists[index]) continue;
        forEachBitsetCandidate(allNodes[index].NodeBitset, (code) => {
          nodesByCandidate[code].push(index);
        });
      }

      const weakOffsets = new Int32Array(nodeCount + 1);
      const weakLists = new Array(nodeCount);
      let weakTotal = 0;
      const touched = new Int32Array(nodeCount).fill(-1);
      for (let index = 0; index < nodeCount; index++) {
        const source = allNodes[index];
        const list = [];
        forEachBitsetCandidate(source.NandBitset, (code) => {
          const bucket = nodesByCandidate[code];
          for (let i = 0; i < bucket.length; i++) {
            const other = bucket[i];
            if (touched[other] === index || other === index) continue;
            touched[other] = index;
            if (
              techniques.isBitsetSubset(
                allNodes[other].NodeBitset,
                source.NandBitset,
              )
            ) {
              list.push(other);
            }
          }
        });
        list.sort((left, right) => left - right);
        weakLists[index] = list;
        weakTotal += list.length;
      }
      const weakTargets = new Int32Array(weakTotal);
      let weakCursor = 0;
      for (let index = 0; index < nodeCount; index++) {
        weakOffsets[index] = weakCursor;
        const list = weakLists[index];
        for (let i = 0; i < list.length; i++) {
          weakTargets[weakCursor++] = list[i];
        }
      }
      weakOffsets[nodeCount] = weakCursor;

      const candidateNode = new Int32Array(729).fill(-1);
      for (let index = 0; index < nodeCount; index++) {
        const node = allNodes[index];
        if (node.cells.length === 1 && node.digits.length === 1) {
          candidateNode[candidateCode(node.cells[0], node.digits[0])] = index;
        }
      }

      const nodeHouses = new Array(nodeCount);
      for (let index = 0; index < nodeCount; index++) {
        const node = allNodes[index];
        if (node.digits.length !== 1) {
          nodeHouses[index] = [];
          continue;
        }
        const cells = node.cells;
        const firstRow = Math.floor(cells[0] / 9);
        const firstColumn = cells[0] % 9;
        const firstBox =
          Math.floor(firstRow / 3) * 3 + Math.floor(firstColumn / 3);
        let sameRow = true;
        let sameColumn = true;
        let sameBox = true;
        for (let i = 1; i < cells.length; i++) {
          const r = Math.floor(cells[i] / 9);
          const c = cells[i] % 9;
          if (r !== firstRow) sameRow = false;
          if (c !== firstColumn) sameColumn = false;
          if (Math.floor(r / 3) * 3 + Math.floor(c / 3) !== firstBox) {
            sameBox = false;
          }
        }
        const houses = [];
        if (sameRow) houses.push(firstRow);
        if (sameColumn) houses.push(9 + firstColumn);
        if (sameBox) houses.push(18 + firstBox);
        nodeHouses[index] = houses.map((house) => {
          let mask = 0;
          for (const id of cells) {
            const r = Math.floor(id / 9);
            const c = id % 9;
            mask |=
              1 << (house < 9 ? c : house < 18 ? r : (r % 3) * 3 + (c % 3));
          }
          return { house, mask };
        });
      }

      search = {
        nodeCount,
        strongOffsets,
        strongTargets,
        weakOffsets,
        weakTargets,
        candidateNode,
        nodeHouses,
        stampOn: new Int32Array(nodeCount),
        stampOff: new Int32Array(nodeCount),
        parentOn: new Int32Array(nodeCount),
        parentOff: new Int32Array(nodeCount),
        depthOn: new Int32Array(nodeCount),
        depthOff: new Int32Array(nodeCount),
        queueOn: new Int32Array(nodeCount + 1),
        queueOff: new Int32Array(nodeCount + 1),
        runId: 0,
        onCount: 0,
        reachOffsets: null,
        reachNodes: null,
        reachDepth: null,
      };
      cache.BlossomSearchCache = search;
    }

    const {
      nodeCount,
      strongOffsets,
      strongTargets,
      weakOffsets,
      weakTargets,
      candidateNode,
      nodeHouses,
      stampOn,
      stampOff,
      parentOn,
      parentOff,
      depthOn,
      depthOff,
      queueOn,
      queueOff,
    } = search;

    const runForcingChain = (startIndex) => {
      const runId = ++search.runId;
      let onHead = 0;
      let onTail = 0;
      let offHead = 0;
      let offTail = 0;
      queueOn[onTail++] = startIndex;
      depthOn[startIndex] = 0;
      while (onHead < onTail || offHead < offTail) {
        if (onHead < onTail) {
          const current = queueOn[onHead++];
          const end = weakOffsets[current + 1];
          const nextDepth = depthOn[current] + 1;
          for (let i = weakOffsets[current]; i < end; i++) {
            const next = weakTargets[i];
            if (stampOn[next] === runId) {
              search.onCount = onTail;
              return runId;
            }
            if (stampOff[next] === runId) continue;
            stampOff[next] = runId;
            parentOff[next] = current;
            depthOff[next] = nextDepth;
            queueOff[offTail++] = next;
          }
          continue;
        }
        const current = queueOff[offHead++];
        const end = strongOffsets[current + 1];
        const nextDepth = depthOff[current] + 1;
        for (let i = strongOffsets[current]; i < end; i++) {
          const next = strongTargets[i];
          if (stampOff[next] === runId) {
            search.onCount = onTail;
            return runId;
          }
          if (stampOn[next] === runId) continue;
          stampOn[next] = runId;
          parentOn[next] = current;
          depthOn[next] = nextDepth;
          queueOn[onTail++] = next;
        }
      }
      search.onCount = onTail;
      return runId;
    };

    if (!search.reachOffsets) {
      const offsets = new Int32Array(730);
      const nodesOut = [];
      const depthsOut = [];
      for (let code = 0; code < 729; code++) {
        offsets[code] = nodesOut.length;
        const startIndex = candidateNode[code];
        if (startIndex < 0) continue;
        const runId = runForcingChain(startIndex);
        for (let i = 1; i < search.onCount; i++) {
          const index = queueOn[i];
          if (stampOn[index] !== runId) continue;
          nodesOut.push(index);
          depthsOut.push(depthOn[index]);
        }
      }
      offsets[729] = nodesOut.length;
      search.reachOffsets = offsets;
      search.reachNodes = Int32Array.from(nodesOut);
      search.reachDepth = Int32Array.from(depthsOut);
    }
    const { reachOffsets, reachNodes, reachDepth } = search;

    const rebuildChain = (startIndex, endIndex, runId) => {
      const path = [];
      let current = endIndex;
      let isOn = true;
      for (let guard = 0; guard <= 2 * nodeCount + 2; guard++) {
        path.push(allNodes[current]);
        if (isOn && current === startIndex) {
          path.reverse();
          return path;
        }
        if (isOn) {
          if (stampOn[current] !== runId) return null;
          current = parentOn[current];
          isOn = false;
        } else {
          if (stampOff[current] !== runId) return null;
          current = parentOff[current];
          isOn = true;
        }
      }
      return null;
    };

    const burrSets = [];
    if (focusKind === "cell") {
      for (let id = 0; id < 81; id++) {
        const r = Math.floor(id / 9);
        const c = id % 9;
        if (board[r][c] !== 0) continue;
        const digits = [...pencils[r][c]].sort((a, b) => a - b);
        if (digits.length < 3) continue;
        burrSets.push({
          kind: "cell",
          cells: [id],
          digits,
          nodes: digits.map((digit) => getNode([id], digit)),
          candidates: digits.map((digit) => candidateCode(id, digit)),
          homeCells: [id],
          homeUnit: -1,
        });
      }
    } else if (focusKind === "region") {
      for (let digit = 1; digit <= 9; digit++) {
        for (let unit = 0; unit < 27; unit++) {
          const cells = [];
          for (let id = 0; id < 81; id++) {
            const part = Math.floor(id / 27);
            const bit = id % 27;
            if ((UNIT_BITSETS[unit][part] & (1 << bit)) === 0) continue;
            const r = Math.floor(id / 9);
            const c = id % 9;
            if (board[r][c] === 0 && pencils[r][c].has(digit)) cells.push(id);
          }
          if (cells.length < 3) continue;
          burrSets.push({
            kind: "region",
            unit,
            cells,
            digits: [digit],
            nodes: cells.map((id) => getNode([id], digit)),
            candidates: cells.map((id) => candidateCode(id, digit)),
            homeCells: cells,
            homeUnit: unit,
          });
        }
      }
    } else {
      const seenAals = new Set();
      const aalsUnitOrder = [
        ...Array.from({ length: 9 }, (_, index) => 9 + index),
        ...Array.from({ length: 9 }, (_, index) => index),
        ...Array.from({ length: 9 }, (_, index) => 18 + index),
      ];
      for (const unit of aalsUnitOrder) {
        const eligibleCells = [];
        for (let id = 0; id < 81; id++) {
          const part = Math.floor(id / 27);
          const bit = id % 27;
          if ((UNIT_BITSETS[unit][part] & (1 << bit)) === 0) continue;
          const r = Math.floor(id / 9);
          const c = id % 9;
          if (board[r][c] === 0 && pencils[r][c].size >= 2) {
            eligibleCells.push(id);
          }
        }
        if (eligibleCells.length < 5) continue;

        const maximumSize = eligibleCells.length - 2;
        const choose = (start, size, cells) => {
          if (cells.length === size) {
            let unionMask = 0;
            const digitCounts = Array(10).fill(0);
            const digitCells = Array(10).fill(-1);
            for (const id of cells) {
              const r = Math.floor(id / 9);
              const c = id % 9;
              for (const digit of pencils[r][c]) {
                unionMask |= 1 << digit;
                digitCounts[digit]++;
                digitCells[digit] = id;
              }
            }
            if (techniques._bits.popcount(unionMask) !== size + 2) return;

            const onlyDigits = [];
            for (let digit = 1; digit <= 9; digit++) {
              if (digitCounts[digit] === 1) onlyDigits.push(digit);
            }
            if (onlyDigits.length !== 3) return;

            const key = [...cells].sort((a, b) => a - b).join(",");
            if (seenAals.has(key)) return;
            seenAals.add(key);
            const allDigits = [];
            for (let digit = 1; digit <= 9; digit++) {
              if (unionMask & (1 << digit)) allDigits.push(digit);
            }
            const alsCells = cells.map((id) => [Math.floor(id / 9), id % 9]);
            burrSets.push({
              kind: "aals",
              unit,
              cells: [...cells],
              digits: onlyDigits,
              allDigits,
              nodes: onlyDigits.map((digit) =>
                getNode([digitCells[digit]], digit),
              ),
              candidates: onlyDigits.map((digit) =>
                candidateCode(digitCells[digit], digit),
              ),
              homeCells: [...cells],
              homeUnit: unit,
              als: {
                cells: alsCells,
                candidates: unionMask,
                mask: unionMask,
                size,
                candMap: Object.fromEntries(
                  allDigits.map((digit) => [
                    digit,
                    alsCells.filter(([r, c]) => pencils[r][c].has(digit)),
                  ]),
                ),
                unitName: `AALS ${unit + 1}`,
              },
            });
            return;
          }
          const needed = size - cells.length;
          for (
            let index = start;
            index <= eligibleCells.length - needed;
            index++
          ) {
            cells.push(eligibleCells[index]);
            choose(index + 1, size, cells);
            cells.pop();
          }
        };

        for (let size = 3; size <= maximumSize; size++) {
          choose(0, size, []);
        }
      }
    }

    if (burrSets.length === 0) return findAll ? [] : { change: false };

    const elimFlags = new Uint8Array(729);
    let elimCodes = [];
    const addElim = (code) => {
      if (elimFlags[code]) return;
      elimFlags[code] = 1;
      elimCodes.push(code);
    };
    const resetElims = () => {
      for (let i = 0; i < elimCodes.length; i++) elimFlags[elimCodes[i]] = 0;
      elimCodes = [];
    };
    const addMaskCandidates = (parts, digitIndex) => {
      const base = digitIndex * 81;
      for (let part = 0; part < 3; part++) {
        let bits = parts[part] >>> 0;
        while (bits !== 0) {
          const low = bits & -bits;
          const id = part * 27 + (31 - Math.clz32(low));
          if (id < 81) addElim(base + id);
          bits = (bits & (bits - 1)) >>> 0;
        }
      }
    };

    const addLinkEliminations = (left, right) => {
      const leftMask = left.NandBitset;
      const rightMask = right.NandBitset;
      for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
        const leftParts = leftMask[digitIndex];
        const rightParts = rightMask[digitIndex];
        addMaskCandidates(
          [
            leftParts[0] & rightParts[0],
            leftParts[1] & rightParts[1],
            leftParts[2] & rightParts[2],
          ],
          digitIndex,
        );
      }
    };

    const addAlsLoopEliminations = (als, digitLeft, digitRight) => {
      for (const textDigit of Object.keys(als.candMap)) {
        const digit = Number(textDigit);
        if (digit === digitLeft || digit === digitRight) continue;
        const ids = als.candMap[digit].map(([r, c]) => r * 9 + c);
        if (ids.length === 0) continue;
        let part0 = PEER_BITSETS[ids[0]][0];
        let part1 = PEER_BITSETS[ids[0]][1];
        let part2 = PEER_BITSETS[ids[0]][2];
        for (let i = 1; i < ids.length; i++) {
          part0 &= PEER_BITSETS[ids[i]][0];
          part1 &= PEER_BITSETS[ids[i]][1];
          part2 &= PEER_BITSETS[ids[i]][2];
        }
        addMaskCandidates([part0, part1, part2], digit - 1);
      }
    };

    const addExitEliminations = (exitNodes) => {
      let common = null;
      for (const node of exitNodes) {
        const mask = node.NandBitset;
        if (common === null) {
          common = mask.map((parts) => [parts[0], parts[1], parts[2]]);
          continue;
        }
        for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
          common[digitIndex][0] &= mask[digitIndex][0];
          common[digitIndex][1] &= mask[digitIndex][1];
          common[digitIndex][2] &= mask[digitIndex][2];
        }
      }
      if (common === null) return;
      for (let digitIndex = 0; digitIndex < 9; digitIndex++) {
        addMaskCandidates(common[digitIndex], digitIndex);
      }
    };

    const getLoc = (cells, preferBox = false) => {
      const ids = [...new Set(cells)].sort((a, b) => a - b);
      if (ids.length === 0) return "";

      if (ids.length === 1) {
        const r = Math.floor(ids[0] / 9);
        const c = ids[0] % 9;
        if (preferBox) {
          const box = Math.floor(r / 3) * 3 + Math.floor(c / 3) + 1;
          const position = (r % 3) * 3 + (c % 3) + 1;
          return `b${box}p${position}`;
        }
        return `r${r + 1}c${c + 1}`;
      }

      const rows = [...new Set(ids.map((id) => Math.floor(id / 9) + 1))];
      const cols = [...new Set(ids.map((id) => (id % 9) + 1))];
      const boxes = [
        ...new Set(
          ids.map(
            (id) =>
              Math.floor(Math.floor(id / 9) / 3) * 3 +
              Math.floor((id % 9) / 3) +
              1,
          ),
        ),
      ];
      if (preferBox && boxes.length === 1) {
        const positions = ids.map((id) => {
          const r = Math.floor(id / 9) % 3;
          const c = (id % 9) % 3;
          return r * 3 + c + 1;
        });
        return `b${boxes[0]}p${positions.join("")}`;
      }
      if (rows.length === 1) return `r${rows[0]}c${cols.join("")}`;
      if (cols.length === 1) return `r${rows.join("")}c${cols[0]}`;
      return ids
        .map((id) => `r${Math.floor(id / 9) + 1}c${(id % 9) + 1}`)
        .join("");
    };

    const getAlsForLink = (left, right) =>
      blossomAlsLinkRegistry.get(left)?.get(right) || null;

    const getAlsText = (left, right, als) => {
      const ids = als.cells.map(([r, c]) => r * 9 + c);
      const preferBox = als.unitName && als.unitName.includes(t("teks_unit_box"));
      return `(${left.digits[0]}=${right.digits[0]})${getLoc(ids, preferBox)}`;
    };

    const getPlainNodeText = (node, previousDigit = null) => {
      const digit = node.digits[0];
      return `${previousDigit === digit ? "" : `(${digit})`}${getLoc(node.cells)}`;
    };

    const buildBlossomEureka = (
      path,
      initialText = null,
      initialDigit = null,
    ) => {
      if (path.length === 0) return "";
      let text = initialText || getPlainNodeText(path[0]);
      let lastDigit = initialDigit ?? path[0].digits[0];
      for (let i = 0; i + 1 < path.length; i += 2) {
        const nandEnd = path[i + 1];
        const orEnd = path[i + 2];
        text += "-";

        if (!orEnd) {
          text += getPlainNodeText(nandEnd, lastDigit);
          break;
        }

        const als = getAlsForLink(nandEnd, orEnd);
        const isBivalueCell =
          !als &&
          nandEnd.digits[0] !== orEnd.digits[0] &&
          nandEnd.cells.length === 1 &&
          orEnd.cells.length === 1 &&
          nandEnd.cells[0] === orEnd.cells[0];

        if (als) {
          text += getAlsText(nandEnd, orEnd, als);
        } else if (isBivalueCell) {
          text += `(${nandEnd.digits[0]}=${orEnd.digits[0]})${getLoc(nandEnd.cells)}`;
        } else {
          text += `${getPlainNodeText(nandEnd, lastDigit)}=${getPlainNodeText(
            orEnd,
            nandEnd.digits[0],
          )}`;
        }
        lastDigit = orEnd.digits[0];
      }
      return `${text}-`;
    };

    const buildBurrBranchEureka = (burr, path, peerRoots = null) => {
      const root = path[0];
      const rootDigit = root.digits[0];
      const peers = peerRoots || burr.nodes.filter((node) => node !== root);
      if (burr.kind === "cell" || burr.kind === "aals") {
        const otherDigits = peers
          .map((node) => node.digits[0])
          .sort((a, b) => a - b)
          .join("");
        const gate = `(${otherDigits}=${rootDigit})${getLoc(
          burr.cells,
          burr.kind === "aals" && burr.unit >= 18,
        )}`;
        return buildBlossomEureka(path, gate, rootDigit);
      }
      const otherCells = peers.flatMap((node) => node.cells);
      const gate = `(${rootDigit})${getLoc(otherCells)}=${getLoc(root.cells)}`;
      return buildBlossomEureka(path, gate, rootDigit);
    };

    const buildMultiBurrGate = (burr, mainPath, branches) => {
      const mainRoots = [mainPath[0], mainPath[mainPath.length - 1]];
      const branchRoots = branches.map((path) => path[0]);
      if (burr.kind === "cell" || burr.kind === "aals") {
        const mainDigits = mainRoots
          .map((node) => node.digits[0])
          .sort((a, b) => a - b)
          .join("");
        const branchDigits = branchRoots
          .map((node) => node.digits[0])
          .sort((a, b) => a - b)
          .join("");
        return `(${mainDigits}=${branchDigits})${getLoc(
          burr.cells,
          burr.kind === "aals" && burr.unit >= 18,
        )}`;
      }

      const digit = mainRoots[0].digits[0];
      return `(${digit})${getLoc(mainRoots.flatMap((node) => node.cells))}=${getLoc(
        branchRoots.flatMap((node) => node.cells),
      )}`;
    };

    const getUsedAlses = (paths) => {
      const used = [];
      const seen = new Set();
      for (const path of paths) {
        for (let i = 1; i + 1 < path.length; i += 2) {
          const als = getAlsForLink(path[i], path[i + 1]);
          if (!als) continue;
          const key = als.cells
            .map(([r, c]) => r * 9 + c)
            .sort((a, b) => a - b)
            .join(",");
          if (!seen.has(key)) {
            seen.add(key);
            used.push(als);
          }
        }
      }
      return used;
    };

    const results = [];
    const bestByRemoval = new Map();
    const chosenExits = [];

    const assignExits = (adjacency, index, usedMask, budget) => {
      if (index === adjacency.length) return true;
      const options = adjacency[index];
      for (let i = 0; i < options.length; i++) {
        if (budget.left <= 0) return false;
        const option = options[i];
        if (usedMask & option.mask) continue;
        budget.left--;
        chosenExits[index] = option;
        if (assignExits(adjacency, index + 1, usedMask | option.mask, budget)) {
          return true;
        }
      }
      return false;
    };

    for (const burr of burrSets) {
      const branchCount = burr.candidates.length;
      if (branchCount < 3) continue;
      const fullMask = branchCount >= 31 ? -1 : (1 << branchCount) - 1;
      if (fullMask === -1) continue;
      const entryCandidateSet = new Set(burr.candidates);
      const homeCellSet = new Set(burr.homeCells);

      const cellGroups = new Map();
      const houseGroups = new Map();
      const addToGroup = (groups, key, entryIndex, option) => {
        let group = groups.get(key);
        if (!group) {
          group = { mask: 0, byEntry: [] };
          for (let i = 0; i < branchCount; i++) group.byEntry.push([]);
          groups.set(key, group);
        }
        group.byEntry[entryIndex].push(option);
        group.mask |= 1 << entryIndex;
      };

      const addExitOptions = (entryIndex, startCode, nodeIndex, depth) => {
        const node = allNodes[nodeIndex];
        if (node.digits.length !== 1) return;
        const digit = node.digits[0];
        for (const id of node.cells) {
          const code = candidateCode(id, digit);
          if (code !== startCode && entryCandidateSet.has(code)) return;
        }

        if (node.cells.length === 1 && !homeCellSet.has(node.cells[0])) {
          addToGroup(cellGroups, node.cells[0], entryIndex, {
            nodeIndex,
            depth,
            mask: 1 << (digit - 1),
          });
        }
        for (const { house, mask } of nodeHouses[nodeIndex]) {
          if (house === burr.homeUnit) continue;
          addToGroup(houseGroups, house * 9 + (digit - 1), entryIndex, {
            nodeIndex,
            depth,
            mask,
          });
        }
      };

      for (let entryIndex = 0; entryIndex < branchCount; entryIndex++) {
        const startCode = burr.candidates[entryIndex];
        const startIndex = candidateNode[startCode];
        if (startIndex >= 0)
          addExitOptions(entryIndex, startCode, startIndex, 0);
        const end = reachOffsets[startCode + 1];
        for (let i = reachOffsets[startCode]; i < end; i++) {
          addExitOptions(entryIndex, startCode, reachNodes[i], reachDepth[i]);
        }
      }

      const candidateGroups = [];
      for (const [key, group] of [...cellGroups.entries()].sort(
        (left, right) => left[0] - right[0],
      )) {
        if (group.mask === fullMask) {
          candidateGroups.push({ exitKind: "cell", key, group });
        }
      }
      for (const [key, group] of [...houseGroups.entries()].sort(
        (left, right) => left[0] - right[0],
      )) {
        if (group.mask === fullMask) {
          candidateGroups.push({ exitKind: "house", key, group });
        }
      }
      if (candidateGroups.length === 0) continue;

      let branchRuns = null;
      const ensureBranchRuns = () => {
        if (branchRuns) return branchRuns;
        branchRuns = [];
        for (let entryIndex = 0; entryIndex < branchCount; entryIndex++) {
          const startIndex = candidateNode[burr.candidates[entryIndex]];
          const runId = runForcingChain(startIndex);
          branchRuns.push({
            startIndex,
            runId,
            parentOn: Int32Array.from(parentOn),
            parentOff: Int32Array.from(parentOff),
            stampOn: Int32Array.from(stampOn),
            stampOff: Int32Array.from(stampOff),
          });
        }
        return branchRuns;
      };

      for (const { exitKind, key, group } of candidateGroups) {
        const adjacency = group.byEntry.map((options) => {
          const bestByNode = new Map();
          for (const option of options) {
            const existing = bestByNode.get(option.nodeIndex);
            if (!existing || existing.depth > option.depth) {
              bestByNode.set(option.nodeIndex, option);
            }
          }
          return [...bestByNode.values()].sort(
            (left, right) =>
              left.depth - right.depth || left.nodeIndex - right.nodeIndex,
          );
        });
        chosenExits.length = branchCount;
        if (!assignExits(adjacency, 0, 0, { left: 20000 })) continue;
        const exitOptions = chosenExits.slice(0, branchCount);

        const runs = ensureBranchRuns();
        const paths = [];
        let broken = false;
        for (let entryIndex = 0; entryIndex < branchCount; entryIndex++) {
          const run = runs[entryIndex];
          stampOn.set(run.stampOn);
          stampOff.set(run.stampOff);
          parentOn.set(run.parentOn);
          parentOff.set(run.parentOff);
          const path = rebuildChain(
            run.startIndex,
            exitOptions[entryIndex].nodeIndex,
            run.runId,
          );
          if (!path) {
            broken = true;
            break;
          }
          paths.push(path);
        }
        if (broken) continue;
        let chainedBranches = 0;
        for (const path of paths) if (path.length >= 3) chainedBranches++;
        if (chainedBranches < 2) continue;
        paths.sort((left, right) => right.length - left.length);

        resetElims();
        for (const path of paths) {
          for (let i = 0; i + 1 < path.length; i++) {
            addLinkEliminations(path[i], path[i + 1]);
          }
          for (let i = 1; i + 1 < path.length; i += 2) {
            const als = getAlsForLink(path[i], path[i + 1]);
            if (als) {
              addAlsLoopEliminations(
                als,
                path[i].digits[0],
                path[i + 1].digits[0],
              );
            }
          }
        }
        addExitEliminations(paths.map((path) => path[path.length - 1]));
        if (burr.kind === "aals") {
          const onlyDigits = new Set(burr.digits);
          for (const digit of burr.allDigits) {
            if (onlyDigits.has(digit)) continue;
            for (let id = 0; id < 81; id++) {
              const part = Math.floor(id / 27);
              const bit = id % 27;
              if ((UNIT_BITSETS[burr.unit][part] & (1 << bit)) === 0) continue;
              addElim(candidateCode(id, digit));
            }
          }
        }

        const structureKeys = new Set(burr.candidates);
        if (burr.kind === "aals") {
          for (const id of burr.cells) {
            const r = Math.floor(id / 9);
            const c = id % 9;
            for (const digit of pencils[r][c]) {
              structureKeys.add(candidateCode(id, digit));
            }
          }
        }
        for (const path of paths) {
          for (const node of path) {
            for (const id of node.cells) {
              structureKeys.add(candidateCode(id, node.digits[0]));
            }
          }
        }

        const removals = [];
        for (const code of elimCodes) {
          if (structureKeys.has(code)) continue;
          const id = candidateId(code);
          const digit = candidateDigit(code);
          if (!actualCandidate(id, digit)) continue;
          removals.push({ r: Math.floor(id / 9), c: id % 9, num: digit });
        }
        if (removals.length === 0) continue;
        removals.sort((a, b) => a.r - b.r || a.c - b.c || a.num - b.num);

        const removalKey = removals
          .map((el) => `${el.r}:${el.c}:${el.num}`)
          .join("|");
        let weight = 0;
        let alsLinks = 0;
        for (const path of paths) {
          weight += path.length;
          for (let i = 1; i + 1 < path.length; i += 2) {
            if (getAlsForLink(path[i], path[i + 1])) alsLinks++;
          }
        }
        const previous = bestByRemoval.get(removalKey);
        if (!previous) {
          bestByRemoval.set(removalKey, {
            order: bestByRemoval.size,
            burr,
            paths,
            removals,
            weight,
            alsLinks,
          });
        } else if (
          weight < previous.weight ||
          (weight === previous.weight && alsLinks < previous.alsLinks)
        ) {
          previous.burr = burr;
          previous.paths = paths;
          previous.removals = removals;
          previous.weight = weight;
          previous.alsLinks = alsLinks;
        }
      }
    }

    for (const chosen of [...bestByRemoval.values()].sort(
      (left, right) => left.order - right.order,
    )) {
      {
        const burr = chosen.burr;
        const paths = chosen.paths;
        const removals = chosen.removals;

        const burrText =
          burr.kind === "cell"
            ? `(${burr.digits.join("")})${getLoc(burr.cells)}`
            : burr.kind === "region"
              ? `(${burr.digits[0]})${getLoc(burr.cells)}`
              : `AALS(${burr.allDigits.join("")})${getLoc(
                  burr.cells,
                  burr.unit >= 18,
                )}`;

        const loopHead = paths[0];
        const loopTail = paths[paths.length - 1];
        const mainPath = [...loopHead, ...loopTail.slice().reverse()];
        const visibleBranches = paths
          .slice(1, paths.length - 1)
          .filter((path) => path.length > 1);

        const usedAlses = getUsedAlses([mainPath, ...visibleBranches]);
        if (burr.kind === "aals") usedAlses.unshift(burr.als);

        const eurekaParts = [`[${buildBlossomEureka(mainPath)}]`];
        if (visibleBranches.length > 1) {
          eurekaParts.push(buildMultiBurrGate(burr, mainPath, visibleBranches));
          for (const path of visibleBranches) {
            const peers = visibleBranches
              .map((branch) => branch[0])
              .filter((root) => root !== path[0]);
            eurekaParts.push(`[${buildBurrBranchEureka(burr, path, peers)}]`);
          }
        } else {
          eurekaParts.push(
            ...visibleBranches.map((path) => buildBurrBranchEureka(burr, path)),
          );
        }
        const eurekaText = eurekaParts.join(" + ");
        const blossom = {
          kind: burr.kind,
          burrText,
          burr: burr.nodes,
          mainPath,
          branches: visibleBranches,
          alses: usedAlses,
          rank: 0,
        };

        const result = {
          change: true,
          type: "remove",
          cells: removals,
          hint: {
            name:
              burr.kind === "cell"
                ? t("teks_cell_BLo")
                : burr.kind === "region"
                  ? t("teks_region_BLo")
                  : t("teks_AALS_BLo"),
            mainInfo: t("teks_burr_on", burrText),
            detail: eurekaText,
          },
          blossom,
          visualPlan: techniques._buildBlossomVisualPlan(
            blossom,
            removals,
            pencils,
          ),
        };

        results.push(result);
      }
      if (!findAll) break;
    }

    return findAll ? results : results[0] || { change: false };
  },

  blossomLoop: (board, pencils, findAll = false) => {
    if (findAll) {
      return [
        ...techniques.cellBlossomLoop(board, pencils, true),
        ...techniques.regionBlossomLoop(board, pencils, true),
        ...techniques.aalsBlossomLoop(board, pencils, true),
      ];
    }
    const cell = techniques.cellBlossomLoop(board, pencils, false);
    if (cell.change) return cell;
    const region = techniques.regionBlossomLoop(board, pencils, false);
    if (region.change) return region;
    return techniques.aalsBlossomLoop(board, pencils, false);
  },

  cellBlossomLoop: (board, pencils, findAll = false) => {
    return techniques._blossomLoopCore(board, pencils, false, findAll);
  },

  regionBlossomLoop: (board, pencils, findAll = false) => {
    return techniques._blossomLoopCore(board, pencils, true, findAll);
  },

  aalsBlossomLoop: (board, pencils, findAll = false) => {
    return techniques._blossomLoopCore(board, pencils, false, findAll, "aals");
  },
});
