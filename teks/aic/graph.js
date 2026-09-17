Object.assign(techniques, {
  buildCandidateBitsets: (board, pencils) => {
    const candidateBitsets = Array.from({ length: 9 }, () => [0, 0, 0]);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          const id = r * 9 + c;
          for (const d of pencils[r][c]) {
            techniques._setCellBit(candidateBitsets[d - 1], id);
          }
        }
      }
    }
    return candidateBitsets;
  },

  generateBasicNodesFromBitsets: (candidateBitsets) => {
    const nodes = [];
    for (let d = 1; d <= 9; d++) {
      const bitset = candidateBitsets[d - 1];
      for (const id of techniques._getCellBits(bitset)) {
        nodes.push(new AICNode([id], [d]));
      }
    }

    return nodes;
  },

  isBitsetSubset: (bitset1, bitset2) => {
    for (let d = 0; d < 9; d++) {
      for (let p = 0; p < 3; p++) {
        if ((bitset1[d][p] & bitset2[d][p]) !== bitset1[d][p]) {
          return false;
        }
      }
    }
    return true;
  },

  getBitsetIntersection: (bitset1, bitset2) => {
    const intersection = Array.from({ length: 9 }, () => [0, 0, 0]);
    let hasOverlap = false;

    for (let d = 0; d < 9; d++) {
      for (let p = 0; p < 3; p++) {
        intersection[d][p] = bitset1[d][p] & bitset2[d][p];
        if (intersection[d][p] !== 0) {
          hasOverlap = true;
        }
      }
    }
    return { hasOverlap, intersection };
  },

  buildBilocationOrMap: (nodes) => {
    const orMap = new Map();
    nodes.forEach((n) => orMap.set(n, new Set()));

    for (let d = 1; d <= 9; d++) {
      const dNodes = nodes.filter(
        (n) =>
          n.cells.length === 1 && n.digits.length === 1 && n.digits[0] === d,
      );

      for (let u = 0; u < 27; u++) {
        const parts = UNIT_BITSETS[u];
        const unitNodes = [];

        for (let i = 0; i < dNodes.length; i++) {
          const id = dNodes[i].cells[0];
          const p = Math.floor(id / 27);
          const b = id % 27;
          if ((parts[p] & (1 << b)) !== 0) {
            unitNodes.push(dNodes[i]);
          }
        }

        if (unitNodes.length === 2) {
          orMap.get(unitNodes[0]).add(unitNodes[1]);
          orMap.get(unitNodes[1]).add(unitNodes[0]);
        }
      }
    }
    return orMap;
  },

  buildGroupedOrMap: (pencils, getNode, groupedLinkRegistry) => {
    const orMap = new Map();
    const addLink = (cellsA, cellsB, digit, gateType) => {
      const nodeA = getNode(cellsA, digit);
      const nodeB = getNode(cellsB, digit);
      if (nodeA !== nodeB) {
        if (!orMap.has(nodeA)) orMap.set(nodeA, new Set());
        if (!orMap.has(nodeB)) orMap.set(nodeB, new Set());
        orMap.get(nodeA).add(nodeB);
        orMap.get(nodeB).add(nodeA);
        if (groupedLinkRegistry) {
          if (!groupedLinkRegistry.has(nodeA))
            groupedLinkRegistry.set(nodeA, new Map());
          if (!groupedLinkRegistry.has(nodeB))
            groupedLinkRegistry.set(nodeB, new Map());
          groupedLinkRegistry.get(nodeA).set(nodeB, gateType);
          groupedLinkRegistry.get(nodeB).set(nodeA, gateType);
        }
      }
    };

    for (let d = 1; d <= 9; d++) {
      for (let u = 0; u < 27; u++) {
        const presence = [];
        for (let i = 0; i < 81; i++) {
          const p = Math.floor(i / 27);
          const b = i % 27;
          if ((UNIT_BITSETS[u][p] & (1 << b)) !== 0) {
            const r = Math.floor(i / 9);
            const c = i % 9;
            if (pencils[r][c] && pencils[r][c].has(d)) {
              presence.push(i);
            }
          }
        }

        if (presence.length <= 2) continue;

        if (u < 18) {
          const boxMap = new Map();
          presence.forEach((id) => {
            const bId =
              Math.floor(Math.floor(id / 9) / 3) * 3 + Math.floor((id % 9) / 3);
            if (!boxMap.has(bId)) boxMap.set(bId, []);
            boxMap.get(bId).push(id);
          });

          if (boxMap.size === 2) {
            const groups = Array.from(boxMap.values());
            addLink(groups[0], groups[1], d);
          }
        } else {
          const rowMap = new Map();
          const colMap = new Map();
          presence.forEach((id) => {
            const r = Math.floor(id / 9);
            const c = id % 9;
            if (!rowMap.has(r)) rowMap.set(r, []);
            rowMap.get(r).push(id);
            if (!colMap.has(c)) colMap.set(c, []);
            colMap.get(c).push(id);
          });

          if (rowMap.size === 2) {
            const groups = Array.from(rowMap.values());
            addLink(groups[0], groups[1], d);
          }
          if (colMap.size === 2) {
            const groups = Array.from(colMap.values());
            addLink(groups[0], groups[1], d);
          }
          if (rowMap.size >= 2 && colMap.size >= 2) {
            let foundCross = false;
            for (const r of rowMap.keys()) {
              if (foundCross) break;
              for (const c of colMap.keys()) {
                const covered = presence.every(
                  (id) => Math.floor(id / 9) === r || id % 9 === c,
                );
                if (covered) {
                  const groupA = presence.filter(
                    (id) => Math.floor(id / 9) === r,
                  );
                  const groupB = presence.filter((id) => id % 9 === c);
                  if (groupA.length > 0 && groupB.length > 0) {
                    addLink(groupA, groupB, d);
                    foundCross = true;
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }
    return orMap;
  },

  buildBivalueOrMap: (nodes) => {
    const orMap = new Map();
    nodes.forEach((n) => orMap.set(n, new Set()));

    const cellMap = new Map();
    for (const node of nodes) {
      if (node.cells.length !== 1 || node.digits.length !== 1) continue;

      const cId = node.cells[0];
      if (!cellMap.has(cId)) cellMap.set(cId, []);
      cellMap.get(cId).push(node);
    }

    for (const [_, cellNodes] of cellMap.entries()) {
      if (cellNodes.length === 2) {
        orMap.get(cellNodes[0]).add(cellNodes[1]);
        orMap.get(cellNodes[1]).add(cellNodes[0]);
      }
    }
    return orMap;
  },

  buildAlsOrMap: (board, pencils, getNode, alsLinkRegistry, options = {}) => {
    const normalizedOptions =
      options && typeof options === "object" ? options : {};

    const preferSmallestAls = normalizedOptions.preferSmallestAls === true;
    const requireAlsCellSubsetForDominance =
      normalizedOptions.requireAlsCellSubsetForDominance === true;

    const alses = techniques._collectAllALS(board, pencils);
    const candidateLinks = [];

    const hasNandCandidates = (node) =>
      techniques._hasNandCandidates(node, pencils);

    for (const als of alses) {
      const digits = Object.keys(als.candMap).map(Number);

      for (let i = 0; i < digits.length; i++) {
        for (let j = i + 1; j < digits.length; j++) {
          const d1 = digits[i];
          const d2 = digits[j];

          const cells1 = als.candMap[d1].map(([r, c]) => r * 9 + c);
          const cells2 = als.candMap[d2].map(([r, c]) => r * 9 + c);

          const node1 = getNode(cells1, d1);
          const node2 = getNode(cells2, d2);

          if (!hasNandCandidates(node1) || !hasNandCandidates(node2)) {
            continue;
          }

          candidateLinks.push({
            nodeA: node1,
            nodeB: node2,
            als,
          });
        }
      }
    }

    const isSubset = (subNode, superNode) => {
      if (subNode.digits[0] !== superNode.digits[0]) {
        return false;
      }

      return subNode.cells.every((id) => superNode.cells.includes(id));
    };

    const finalLinks = [];
    const linksByDigitPair = new Map();
    for (const link of candidateLinks) {
      const left = link.nodeA.digits[0];
      const right = link.nodeB.digits[0];
      const pairKey = left < right ? left * 10 + right : right * 10 + left;
      let bucket = linksByDigitPair.get(pairKey);
      if (!bucket) {
        bucket = [];
        linksByDigitPair.set(pairKey, bucket);
      }
      bucket.push(link);
    }

    for (let i = 0; i < candidateLinks.length; i++) {
      const candidate = candidateLinks[i];
      const { nodeA, nodeB, als } = candidate;

      let isDominated = false;

      const digitLeft = nodeA.digits[0];
      const digitRight = nodeB.digits[0];
      const peers =
        linksByDigitPair.get(
          digitLeft < digitRight
            ? digitLeft * 10 + digitRight
            : digitRight * 10 + digitLeft,
        ) || [];

      for (let j = 0; j < peers.length; j++) {
        const other = peers[j];
        if (other === candidate) continue;

        const directlyDominated =
          isSubset(other.nodeA, nodeA) && isSubset(other.nodeB, nodeB);

        const reverseDominated =
          isSubset(other.nodeA, nodeB) && isSubset(other.nodeB, nodeA);

        if (!directlyDominated && !reverseDominated) continue;

        const differentNodeSizes =
          other.nodeA.cells.length !== nodeA.cells.length ||
          other.nodeB.cells.length !== nodeB.cells.length;
        if (!differentNodeSizes) continue;

        const otherAlsCellsAreSubset =
          !requireAlsCellSubsetForDominance ||
          other.als.cells.every(([r, c]) =>
            als.cells.some(
              ([alsRow, alsColumn]) => alsRow === r && alsColumn === c,
            ),
          );

        if (otherAlsCellsAreSubset) {
          isDominated = true;
          break;
        }
      }

      if (!isDominated) {
        finalLinks.push(candidate);
      }
    }

    const alsMap = new Map();

    const registerAls = (nodeA, nodeB, als) => {
      if (!alsLinkRegistry.has(nodeA)) {
        alsLinkRegistry.set(nodeA, new Map());
      }

      const pairMap = alsLinkRegistry.get(nodeA);
      const existing = pairMap.get(nodeB);

      if (!existing) {
        pairMap.set(nodeB, als);
        return;
      }

      if (preferSmallestAls) {
        if (als.cells.length < existing.cells.length) pairMap.set(nodeB, als);
        return;
      }

      pairMap.set(nodeB, als);
    };

    for (const { nodeA, nodeB, als } of finalLinks) {
      if (als.cells.length <= 1) continue;

      if (!alsMap.has(nodeA)) alsMap.set(nodeA, new Set());
      if (!alsMap.has(nodeB)) alsMap.set(nodeB, new Set());

      alsMap.get(nodeA).add(nodeB);
      alsMap.get(nodeB).add(nodeA);

      if (alsLinkRegistry) {
        registerAls(nodeA, nodeB, als);
        registerAls(nodeB, nodeA, als);
      }
    }

    return alsMap;
  },

  buildFishOrMap: (board, pencils, getNode, fishLinkRegistry) => {
    const orMap = new Map();

    const getCombinations = techniques.combinations;

    const hasNandCandidates = (node) =>
      techniques._hasNandCandidates(node, pencils);

    const addLink = (nodeA, nodeB, fish) => {
      if (nodeA === nodeB) return;
      if (!orMap.has(nodeA)) orMap.set(nodeA, new Set());
      if (!orMap.has(nodeB)) orMap.set(nodeB, new Set());
      orMap.get(nodeA).add(nodeB);
      orMap.get(nodeB).add(nodeA);

      if (fishLinkRegistry) {
        if (!fishLinkRegistry.has(nodeA))
          fishLinkRegistry.set(nodeA, new Map());
        if (!fishLinkRegistry.has(nodeB))
          fishLinkRegistry.set(nodeB, new Map());
        fishLinkRegistry.get(nodeA).set(nodeB, fish);
        fishLinkRegistry.get(nodeB).set(nodeA, fish);
      }
    };

    const getUnitName = (isRow, indices) => {
      const label = isRow ? "r" : "c";
      return (
        label +
        indices
          .map((i) => i + 1)
          .sort((a, b) => a - b)
          .join("")
      );
    };

    const placedCounts = Array(10).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) placedCounts[board[r][c]]++;
      }
    }

    for (let d = 1; d <= 9; d++) {
      if (9 - placedCounts[d] < 4) continue; // Early prune: Min fish size 2 needs 4 open slots

      const rowCells = Array.from({ length: 9 }, () => []);
      const colCells = Array.from({ length: 9 }, () => []);

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (pencils[r][c] && pencils[r][c].has(d)) {
            const id = r * 9 + c;
            rowCells[r].push(id);
            colCells[c].push(id);
          }
        }
      }

      for (let n = 2; n <= 4; n++) {
        if (9 - placedCounts[d] < 2 * n) continue;

        for (let baseType = 0; baseType <= 1; baseType++) {
          const isBaseRow = baseType === 0;
          const baseHouses = isBaseRow ? rowCells : colCells;

          const validBaseHouses = [];
          for (let i = 0; i < 9; i++) {
            if (baseHouses[i].length > 0) validBaseHouses.push(i);
          }

          if (validBaseHouses.length < n) continue;
          const baseCombos = getCombinations(validBaseHouses, n);

          for (const bases of baseCombos) {
            const firstChute = Math.floor(bases[0] / 3);
            const spansSingleChute = bases.every(
              (b) => Math.floor(b / 3) === firstChute,
            );
            if (spansSingleChute) continue;

            const baseCells = [];
            for (const b of bases) {
              baseCells.push(...baseHouses[b]);
            }

            const occupiedCovers = new Set();
            for (const id of baseCells) {
              const coverIdx = isBaseRow ? id % 9 : Math.floor(id / 9);
              occupiedCovers.add(coverIdx);
            }

            if (occupiedCovers.size < n) continue;

            const coverCombos = getCombinations(Array.from(occupiedCovers), n);

            for (const covers of coverCombos) {
              const coverSet = new Set(covers);
              const fins = [];

              const bodyPartsByCover = new Map();
              for (const cv of covers) {
                bodyPartsByCover.set(cv, []);
              }

              for (const id of baseCells) {
                const coverIdx = isBaseRow ? id % 9 : Math.floor(id / 9);
                if (coverSet.has(coverIdx)) {
                  bodyPartsByCover.get(coverIdx).push(id);
                } else {
                  fins.push(id);
                }
              }

              if (fins.length === 0 || fins.length > 4) continue;

              const fishBody = [];
              for (const part of bodyPartsByCover.values()) {
                fishBody.push(...part);
              }

              const basesStr = getUnitName(isBaseRow, bases);
              const coversStr = getUnitName(!isBaseRow, covers);

              // --- Rank-1 check ---
              let isRank1 = false;
              if (fins.length > 0) {
                const finRows = new Set(fins.map((id) => Math.floor(id / 9)));
                const finCols = new Set(fins.map((id) => id % 9));
                const finBoxes = new Set(
                  fins.map(
                    (id) =>
                      Math.floor(Math.floor(id / 9) / 3) * 3 +
                      Math.floor((id % 9) / 3),
                  ),
                );
                isRank1 =
                  finRows.size === 1 ||
                  finCols.size === 1 ||
                  finBoxes.size === 1;
              }

              const coverBodyNodes = [];
              for (const cv of covers) {
                const bodyPart = bodyPartsByCover.get(cv);
                if (bodyPart.length > 0) {
                  coverBodyNodes.push(getNode(bodyPart, d));
                }
              }

              const fishObj = {
                d,
                basesStr,
                coversStr,
                allCells: [...fins, ...fishBody],
                isRank1,
                coverBodyNodes,
              };

              const finNode = getNode(fins, d);
              if (!hasNandCandidates(finNode)) continue;
              for (const bodyNode of coverBodyNodes) {
                if (hasNandCandidates(bodyNode)) {
                  addLink(finNode, bodyNode, fishObj);
                }
              }
            }
          }
        }
      }
    }
    return orMap;
  },

  mergeOrMaps: (map1, map2) => {
    const merged = new Map();

    if (map1) {
      for (const [node, set1] of map1.entries()) {
        merged.set(node, new Set(set1));
      }
    }

    if (map2) {
      for (const [node, set2] of map2.entries()) {
        if (!merged.has(node)) {
          merged.set(node, new Set(set2));
        } else {
          const existingSet = merged.get(node);
          for (const val of set2) {
            existingSet.add(val);
          }
        }
      }
    }

    return merged;
  },

  // --- Global Cache for AIC Graph ---
  _aicCache: {
    signature: null,
    AllNodes: [],
    NodeCache: new Map(),
    BasicNodeByCandidate: null,
    BivalueOrMap: new Map(),
    BilocationOrMap: new Map(),
    GroupedOrMap: new Map(),
    AlsMap: new Map(),
    AlsPolicyCache: new Map(),
    FishMap: new Map(),
    GroupedLinkRegistry: new Map(),
    AlsLinkRegistry: new Map(),
    FishLinkRegistry: new Map(),
    DeathBlossomOrMap: null,
    NandSubsetMemo: null,
    BlossomSearchCache: null,
    AlmostAicGraph: null,
  },

  _getTemplating: (board, pencils, num) => {
    if (!techniques._templatingCache) techniques._templatingCache = {};
    if (techniques._templatingCache[num])
      return techniques._templatingCache[num];

    let cb = [0, 0, 0];
    const cellsWithNum = [];
    let allNumMask = 0n;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0 && pencils[r][c].has(num)) {
          const id = r * 9 + c;
          cellsWithNum.push(id);
          techniques._setCellBit(cb, id);
          allNumMask |= CELL_MASK[id];
        }
      }
    }

    const units = Array.from({ length: 27 }, () => []);

    for (let i = 0; i < 27; i++) {
      const inter = techniques._cellBitsetAnd(cb, UNIT_BITSETS[i]);
      units[i] = techniques._getCellBits(inter);
    }

    techniques._templatingCache[num] = {
      cb,
      cellsWithNum,
      allNumMask,
      units,
    };

    return techniques._templatingCache[num];
  },

  _solvedBoardCache: { signature: null, board: null },
  _sharedAICCache: { signature: null, cache: null },

  _positionSignature: (board, pencils) => {
    let signature = "";
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) {
          signature += board[r][c];
          continue;
        }
        let mask = 0;
        for (const digit of pencils[r][c]) mask |= 1 << digit;
        signature += "." + mask.toString(36);
      }
    }
    return signature;
  },

  _useSharedAICCache: (board, pencils) => {
    const signature = techniques._positionSignature(board, pencils);
    const shared = techniques._sharedAICCache;
    if (shared.signature === signature && shared.cache) {
      techniques._aicCache = shared.cache;
      return;
    }
    shared.signature = signature;
    shared.cache = techniques._aicCache;
  },

  _getSolvedBoard: (board) => {
    const signature = board.map((row) => row.join("")).join("");
    const cache = techniques._solvedBoardCache;
    if (cache.signature === signature) return cache.board;

    const grid = new Int8Array(81);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) grid[r * 9 + c] = board[r][c];
    }
    const rowMasks = new Int32Array(9);
    const colMasks = new Int32Array(9);
    const boxMasks = new Int32Array(9);
    const boxOf = (id) =>
      Math.floor(Math.floor(id / 9) / 3) * 3 + Math.floor((id % 9) / 3);
    for (let id = 0; id < 81; id++) {
      const digit = grid[id];
      if (!digit) continue;
      const bit = 1 << digit;
      rowMasks[Math.floor(id / 9)] |= bit;
      colMasks[id % 9] |= bit;
      boxMasks[boxOf(id)] |= bit;
    }

    const allDigits = 0x3fe;
    const fill = () => {
      let bestId = -1;
      let bestMask = 0;
      let bestCount = 10;
      for (let id = 0; id < 81; id++) {
        if (grid[id]) continue;
        const mask =
          allDigits &
          ~(
            rowMasks[Math.floor(id / 9)] |
            colMasks[id % 9] |
            boxMasks[boxOf(id)]
          );
        let count = 0;
        let bits = mask;
        while (bits !== 0) {
          bits &= bits - 1;
          count++;
        }
        if (count === 0) return false;
        if (count < bestCount) {
          bestCount = count;
          bestId = id;
          bestMask = mask;
          if (count === 1) break;
        }
      }
      if (bestId < 0) return true;

      const row = Math.floor(bestId / 9);
      const col = bestId % 9;
      const box = boxOf(bestId);
      let bits = bestMask;
      while (bits !== 0) {
        const low = bits & -bits;
        grid[bestId] = 31 - Math.clz32(low);
        rowMasks[row] |= low;
        colMasks[col] |= low;
        boxMasks[box] |= low;
        if (fill()) return true;
        grid[bestId] = 0;
        rowMasks[row] &= ~low;
        colMasks[col] &= ~low;
        boxMasks[box] &= ~low;
        bits &= bits - 1;
      }
      return false;
    };

    cache.signature = signature;
    cache.board = fill()
      ? Array.from({ length: 9 }, (_, r) =>
          Array.from({ length: 9 }, (_, c) => grid[r * 9 + c]),
        )
      : null;
    return cache.board;
  },

  _resetAICCache: () => {
    techniques._templatingCache = null;
    techniques._aicCache = {
      signature: null,

      AllNodes: [],
      NodeCache: new Map(),
      BasicNodeByCandidate: null,
      BivalueOrMap: new Map(),
      BilocationOrMap: new Map(),
      GroupedOrMap: new Map(),
      AlsMap: new Map(),
      AlsPolicyCache: new Map(),
      FishMap: new Map(),
      GroupedLinkRegistry: new Map(),
      AlsLinkRegistry: new Map(),
      FishLinkRegistry: new Map(),
      DeathBlossomOrMap: null,
      NandSubsetMemo: null,
      BlossomSearchCache: null,
      AlmostAicGraph: null,
    };
  },

  _releaseAICCache: () => {
    techniques._sharedAICCache.signature = null;
    techniques._sharedAICCache.cache = null;
    techniques._resetAICCache();
  },

  _addLink: (map, u, v) => {
    if (!map.has(u.key)) map.set(u.key, []);
    map.get(u.key).push(v);
  },

  _mergeMaps: (...maps) => {
    const result = new Map();
    for (const m of maps) {
      for (const [key, neighbors] of m) {
        if (!result.has(key)) result.set(key, []);
        const target = result.get(key);
        for (const n of neighbors) target.push(n);
      }
    }
    return result;
  },
});
