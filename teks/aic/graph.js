Object.assign(techniques, {
  buildCandidateBitsets: (board, pencils) => {
    // 9 arrays, each with 3 integers (representing 27 bits each)
    const candidateBitsets = Array.from({ length: 9 }, () => [0, 0, 0]);

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          // If it's an unsolved cell
          const id = r * 9 + c;
          const part = Math.floor(id / 27);
          const bit = id % 27;

          for (const d of pencils[r][c]) {
            candidateBitsets[d - 1][part] |= 1 << bit;
          }
        }
      }
    }

    return candidateBitsets;
  },

  /**
   * Generates the basic "one cell, one digit" nodes straight from the bitset
   */
  generateBasicNodesFromBitsets: (candidateBitsets) => {
    const nodes = [];

    for (let d = 1; d <= 9; d++) {
      const bitset = candidateBitsets[d - 1]; // The three 27-bit parts for this digit

      for (let part = 0; part < 3; part++) {
        let mask = bitset[part];
        let bitPos = 0;

        // Iterate through the set bits using shifting
        while (mask > 0) {
          if ((mask & 1) !== 0) {
            const id = part * 27 + bitPos;

            // Generate a basic node: single cell, single digit
            // Because we pass arrays with a length of 1, both processes trigger in the constructor.
            nodes.push(new AICNode([id], [d]));
          }
          mask >>>= 1; // Zero-fill right shift to safely proceed to the next bit
          bitPos++;
        }
      }
    }

    return nodes;
  },

  /**
   * Checks if bitset1 is completely covered by (is a subset of) bitset2.
   */
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

  /**
   * Returns the intersection (bitwise AND) of two bitsets.
   * Returns both a boolean (if any overlap exists) and the resulting bitset.
   */
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

  // Updated to use UNIT_BITSETS
  buildBilocationOrMap: (nodes) => {
    const orMap = new Map();
    nodes.forEach((n) => orMap.set(n, new Set()));

    for (let d = 1; d <= 9; d++) {
      const dNodes = nodes.filter(
        (n) => n.digits.includes(d) && n.cells.length === 1,
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

        if (presence.length <= 2) continue; // Pure Bilocation handles this

        if (u < 18) {
          // Line (Row or Col) -> Check Box Intersections
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
          // Box -> Check Line Intersections
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
            // 1 Row + 1 Col (5 cell overlap case)
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

  /**
   * Constructs Bivalue OR Map (Same cell, exactly 2 digits)
   */
  buildBivalueOrMap: (nodes) => {
    const orMap = new Map();
    nodes.forEach((n) => orMap.set(n, new Set()));

    const cellMap = new Map();
    for (const node of nodes) {
      const cId = node.cells[0];
      if (!cellMap.has(cId)) cellMap.set(cId, []);
      cellMap.get(cId).push(node);
    }

    for (const [_, cellNodes] of cellMap.entries()) {
      if (cellNodes.length === 2) {
        // Bivalue!
        orMap.get(cellNodes[0]).add(cellNodes[1]);
        orMap.get(cellNodes[1]).add(cellNodes[0]);
      }
    }
    return orMap;
  },

  buildAlsOrMap: (board, pencils, getNode, alsLinkRegistry, options = {}) => {
    const normalizedOptions =
      options && typeof options === "object" ? options : {};

    // ALS sizes that must not be removed by subset reduction.
    const preserveAlsSizes = new Set(normalizedOptions.preserveAlsSizes || []);

    // When several ALSs generate the same node pair, prefer this size.
    const preferredAlsSize = normalizedOptions.preferredAlsSize ?? null;
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

    // Subset-reduction stage. isSubset() only holds between nodes of the
    // same digit, so a link can only be dominated by one carrying the same
    // unordered digit pair - bucket by that pair instead of scanning all.
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

      /*
       * WXYZ-Wing requires the actual three-cell ALS provenance.
       * Keep requested ALS sizes even when another ALS supplies a
       * smaller equivalent OR-link representation.
       */
      if (preserveAlsSizes.has(als.cells.length)) {
        finalLinks.push(candidate);
        continue;
      }

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

    /*
     * Register an ALS for a node pair.
     *
     * In the generic map this retains the previous last-write behavior.
     * In the WXYZ-specific map, a three-cell ALS takes priority over
     * an equivalent larger ALS.
     */
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

      if (preferredAlsSize !== null) {
        const existingIsPreferred = existing.cells.length === preferredAlsSize;
        const newIsPreferred = als.cells.length === preferredAlsSize;

        if (newIsPreferred && !existingIsPreferred) {
          pairMap.set(nodeB, als);
          return;
        }

        if (existingIsPreferred && !newIsPreferred) {
          return;
        }
      }

      // Original behavior when no ALS size has priority.
      pairMap.set(nodeB, als);
    };

    for (const { nodeA, nodeB, als } of finalLinks) {
      // One-cell ALS links are represented by BivalueOrMap.
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

    // Precompute placed counts
    const placedCounts = Array(10).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) placedCounts[board[r][c]]++;
      }
    }

    for (let d = 1; d <= 9; d++) {
      if (9 - placedCounts[d] < 4) continue; // Early prune: Min fish size 2 needs 4 open slots

      // Group candidate cell IDs by row and column for digit d
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

        // Base Types: 0 = Rows, 1 = Cols
        for (let baseType = 0; baseType <= 1; baseType++) {
          const isBaseRow = baseType === 0;
          const baseHouses = isBaseRow ? rowCells : colCells;

          // Pre-collect ONLY houses that actually contain candidate d
          const validBaseHouses = [];
          for (let i = 0; i < 9; i++) {
            if (baseHouses[i].length > 0) validBaseHouses.push(i);
          }

          if (validBaseHouses.length < n) continue;
          const baseCombos = getCombinations(validBaseHouses, n);

          for (const bases of baseCombos) {
            // Skip if all base units are in the same chute
            const firstChute = Math.floor(bases[0] / 3);
            const spansSingleChute = bases.every(
              (b) => Math.floor(b / 3) === firstChute,
            );
            if (spansSingleChute) continue;

            const baseCells = [];
            for (const b of bases) {
              baseCells.push(...baseHouses[b]);
            }

            // Find unique cover units intersected by these base cells
            const occupiedCovers = new Set();
            for (const id of baseCells) {
              const coverIdx = isBaseRow ? id % 9 : Math.floor(id / 9);
              occupiedCovers.add(coverIdx);
            }

            // If base cells span fewer cover houses than n, it can't form an size-n finned fish
            if (occupiedCovers.size < n) continue;

            // Generate cover combinations ONLY from occupied cover houses
            const coverCombos = getCombinations(Array.from(occupiedCovers), n);

            for (const covers of coverCombos) {
              const coverSet = new Set(covers);
              const fins = [];

              // Map to group body parts on a single pass
              const bodyPartsByCover = new Map();
              for (const cv of covers) {
                bodyPartsByCover.set(cv, []);
              }

              // Distribute base cells into body parts or fins
              for (const id of baseCells) {
                const coverIdx = isBaseRow ? id % 9 : Math.floor(id / 9);
                if (coverSet.has(coverIdx)) {
                  bodyPartsByCover.get(coverIdx).push(id);
                } else {
                  fins.push(id);
                }
              }

              // Finned fish constraint check
              if (fins.length === 0 || fins.length > 4) continue;

              // Extract fish body cells from grouped parts
              const fishBody = [];
              for (const part of bodyPartsByCover.values()) {
                fishBody.push(...part);
              }

              const basesStr = getUnitName(isBaseRow, bases);
              const coversStr = getUnitName(!isBaseRow, covers);

              // --- Rank-1 check: do all fins share a common house? ---
              let isRank1 = false;
              if (fins.length > 0) {
                // Check row
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

              // Build all valid cover-body nodes for this fish configuration
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
                coverBodyNodes, // All body-part nodes indexed by cover (for XOR ring elim)
              };

              const finNode = getNode(fins, d);
              if (!hasNandCandidates(finNode)) continue;

              // Process each cover unit's body parts (only link covers with valid NAND candidates)
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

  /**
   * Merges maps for the generic AIC (combining Bilocation and Bivalue)
   */
  mergeOrMaps: (map1, map2) => {
    const merged = new Map();

    // 1. Copy all keys and sets from map1
    if (map1) {
      for (const [node, set1] of map1.entries()) {
        merged.set(node, new Set(set1));
      }
    }

    // 2. Merge in keys and sets from map2
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
          cb[Math.floor(id / 27)] |= 1 << (id % 27);
          allNumMask |= CELL_MASK[id];
        }
      }
    }

    const units = Array.from({ length: 27 }, () => []);

    for (let i = 0; i < 27; i++) {
      const inter = [
        cb[0] & UNIT_BITSETS[i][0],
        cb[1] & UNIT_BITSETS[i][1],
        cb[2] & UNIT_BITSETS[i][2],
      ];
      const res = [];
      for (let p = 0; p < 3; p++) {
        let m = inter[p];
        let bit = 0;
        while (m > 0) {
          if (m & 1) res.push(p * 27 + bit);
          m >>= 1;
          bit++;
        }
      }
      units[i] = res;
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

  /**
   * Signature of the current position, covering placed digits and pencilmarks.
   * Used to decide whether a cached node/link graph is still valid.
   */
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

  /**
   * Restores the node/link graph built for this exact position, so that the
   * three blossom variants (and any later call on the same position) share
   * one build instead of repeating it.
   */
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

  /**
   * Solves the given board with a bitmask solver and caches the result by
   * board signature, so repeated technique calls on the same position solve
   * only once.
   */
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

  // --- Map Merger Helper ---
  _mergeMaps: (...maps) => {
    const result = new Map();
    for (const m of maps) {
      for (const [key, neighbors] of m) {
        if (!result.has(key)) result.set(key, []);
        const target = result.get(key);
        // Avoid duplicates if necessary, though simpler to just push
        for (const n of neighbors) target.push(n);
      }
    }
    return result;
  },

});
