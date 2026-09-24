(() => {
  // Eureka strings mark HLS nodes as "{hls}"; set to false to hide the tag.
  techniques._ahsEurekaHlsTag = true;
  // HLS reasoning (odd-cell nodes, HLS views, pivots) is opt-in. Without it
  // the graph holds only the AHS cell nodes and their OR gates.
  techniques._ahsUseHls = false;

  // Assign an object to collect per-phase timings (ms) and counts.
  techniques._ahsProfile = null;

  const now = () =>
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  const tick = (label, start) => {
    const prof = techniques._ahsProfile;
    if (prof) prof[label] = (prof[label] || 0) + (now() - start);
  };
  const count = (label, n) => {
    const prof = techniques._ahsProfile;
    if (prof) prof[label] = (prof[label] || 0) + n;
  };

  const BIT = techniques._bits.bitFor;
  const maskDigits = techniques._bits.maskToDigits;
  const digitMaskOf = (node) => {
    if (node.digitMask === undefined) {
      let m = 0;
      for (const d of node.digits) m |= BIT(d);
      node.digitMask = m;
    }
    return node.digitMask;
  };
  const houseType = (u) => (u < 9 ? "row" : u < 18 ? "col" : "box");
  const houseIndex = (u) => (u < 9 ? u : u < 18 ? u - 9 : u - 18);
  const nodeKey = (cells, digits) =>
    `${digits.join(",")}_${cells
      .slice()
      .sort((a, b) => a - b)
      .join(",")}`;
  const cellBitsOf = (ids) => {
    const bits = [0, 0, 0];
    for (const id of ids) bits[CELL_PART[id]] |= CELL_BIT[id];
    return bits;
  };
  const commonPeersOfBits = (bits) => {
    const cp = [-1, -1, -1];
    for (let part = 0; part < 3; part++) {
      let m = bits[part];
      while (m) {
        const pb = PEER_BITSETS[part * 27 + lowest(m)];
        cp[0] &= pb[0];
        cp[1] &= pb[1];
        cp[2] &= pb[2];
        m &= m - 1;
      }
    }
    return cp;
  };
  const partSubset = (sub, sup) =>
    (sub[0] & ~sup[0]) === 0 &&
    (sub[1] & ~sup[1]) === 0 &&
    (sub[2] & ~sup[2]) === 0;
  const partNonZero = (bits) => (bits[0] | bits[1] | bits[2]) !== 0;
  const emptyNand = () => Array.from({ length: 9 }, () => [0, 0, 0]);
  const orInto = (target, source) => {
    for (let k = 0; k < 9; k++) {
      target[k][0] |= source[k][0];
      target[k][1] |= source[k][1];
      target[k][2] |= source[k][2];
    }
  };
  const nandDigitsOf = (nand) => {
    let m = 0;
    for (let k = 0; k < 9; k++) if (partNonZero(nand[k])) m |= 1 << k;
    return m;
  };

  // A "side" is one justification of a node: its NandBitset and, for an HLS,
  // the per-digit cells the digits are locked into.
  //   { nand, nandDigits, dCells | null, dMask }
  const plainSideOf = (node) => {
    if (!node.ahsPlainSide) {
      node.ahsPlainSide = {
        nand: node.NandBitset,
        nandDigits: nandDigitsOf(node.NandBitset),
        dCells: null,
        dMask: 0,
      };
    }
    return node.ahsPlainSide;
  };
  // Every justification a node offers: its own NandBitset first, then one
  // side per HLS it stands for.
  const sidesOf = (node) => {
    if (!node.ahsSides) {
      node.ahsSides = [plainSideOf(node)];
      if (node.hlsRefs)
        for (const ref of node.hlsRefs) node.ahsSides.push(ref.h.side);
    }
    return node.ahsSides;
  };

  // x (justified by sx) and y (justified by sy) cannot both hold.
  const nodeForbidden = (y, sx) => {
    if ((y.digitMask & ~sx.nandDigits) !== 0) return false;
    for (const d of y.digits) {
      if (!partSubset(y.NodeBitset[d - 1], sx.nand[d - 1])) return false;
    }
    return true;
  };
  const positionsForbidden = (sx, sy) => {
    if (!sx.dCells) return false;
    let m = sx.dMask & sy.nandDigits;
    while (m) {
      const k = lowest(m);
      m &= m - 1;
      if (partSubset(sx.dCells[k], sy.nand[k])) return true;
    }
    return false;
  };
  const sidesNand = (x, sx, y, sy) =>
    nodeForbidden(y, sx) ||
    nodeForbidden(x, sy) ||
    positionsForbidden(sx, sy) ||
    positionsForbidden(sy, sx);

  const hallSeen = new Int32Array(512);
  let hallStamp = 0;
  const hasPerfectMatching = (cellMasks) => {
    if (cellMasks.length <= 2) return true;
    let reach = [0];
    for (const cm of cellMasks) {
      hallStamp++;
      const next = [];
      for (let i = 0; i < reach.length; i++) {
        const s = reach[i];
        let m = cm & ~s;
        while (m) {
          const low = m & -m;
          const state = s | low;
          if (hallSeen[state] !== hallStamp) {
            hallSeen[state] = hallStamp;
            next.push(state);
          }
          m ^= low;
        }
      }
      if (next.length === 0) return false;
      reach = next;
    }
    return true;
  };

  const ensureBasicNodes = (board, pencils, cache) => {
    if (cache.AllNodes.length !== 0) return;
    const candidateBitsets = techniques.buildCandidateBitsets(board, pencils);
    const baseNodes =
      techniques.generateBasicNodesFromBitsets(candidateBitsets);
    baseNodes.forEach((n) => {
      cache.NodeCache.set(nodeKey(n.cells, n.digits), n);
      cache.AllNodes.push(n);
    });
  };

  const sharedGetNode = (cache) => (cells, digits) => {
    const dArr = Array.isArray(digits) ? digits : [digits];
    const key = nodeKey(cells, dArr);
    const found = cache.NodeCache.get(key);
    if (found) return found;
    const node = new AICNode(cells, dArr);
    cache.NodeCache.set(key, node);
    cache.AllNodes.push(node);
    return node;
  };

  // --- Position-level graph ---
  const buildAhsGraph = (board, pencils) => {
    const cache = techniques._aicCache;
    if (cache.AhsGraph) return cache.AhsGraph;

    let t0 = now();
    ensureBasicNodes(board, pencils, cache);
    const nodeCache = cache.NodeCache;
    const ownCache = new Map();
    const ownNodes = [];
    const getNode = (cells, digits) => {
      const key = nodeKey(cells, digits);
      const shared = nodeCache.get(key);
      if (shared) return shared;
      let node = ownCache.get(key);
      if (!node) {
        node = new AICNode(cells, digits);
        ownCache.set(key, node);
        ownNodes.push(node);
      }
      return node;
    };
    const peekNode = (cells, digits) => {
      const key = nodeKey(cells, digits);
      return nodeCache.get(key) || ownCache.get(key) || null;
    };

    const cand = new Int32Array(81);
    const candBits = emptyNand();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0) continue;
        const id = r * 9 + c;
        let m = 0;
        for (const d of pencils[r][c]) {
          m |= BIT(d);
          candBits[d - 1][CELL_PART[id]] |= CELL_BIT[id];
        }
        cand[id] = m;
      }
    }

    const posMask = new Int32Array(27 * 9);
    for (let u = 0; u < 27; u++) {
      const ids = UNIT_IDS[u];
      for (let p = 0; p < 9; p++) {
        let m = cand[ids[p]];
        while (m) {
          posMask[u * 9 + lowest(m)] |= 1 << p;
          m &= m - 1;
        }
      }
    }
    tick("graph.masks", t0);
    t0 = now();

    // 1. AHS enumeration: n digits (n >= 2) confined to n + 1 cells of a house.
    const ahses = [];
    const union = new Int32Array(512);
    const cellUnion = new Int32Array(512);
    for (let u = 0; u < 27; u++) {
      const ids = UNIT_IDS[u];
      let emptyMask = 0;
      let deadDigits = 0;
      for (let k = 0; k < 9; k++) {
        const pm = posMask[u * 9 + k];
        emptyMask |= pm;
        if (pm === 0) deadDigits |= 1 << k;
      }
      if (pop(emptyMask) < 3) continue;

      union[0] = 0;
      for (let m = 1; m < 512; m++) {
        const low = m & -m;
        union[m] = union[m ^ low] | posMask[u * 9 + lowest(low)];
        if (m & deadDigits) continue;
        const n = pop(m);
        if (n < 2) continue;
        const cellsMask = union[m];
        if (pop(cellsMask) !== n + 1) continue;

        let reducible = false;
        for (let s = (m - 1) & m; s !== 0; s = (s - 1) & m) {
          if (pop(union[s]) === pop(s)) {
            reducible = true;
            break;
          }
        }
        if (reducible) continue;
        const cellIds = [];
        let pm = cellsMask;
        while (pm) {
          cellIds.push(ids[lowest(pm)]);
          pm &= pm - 1;
        }
        const cellCount = cellIds.length;
        const subLimit = 1 << cellCount;
        cellUnion[0] = 0;
        for (let sub = 1; sub < subLimit; sub++) {
          const low = sub & -sub;
          cellUnion[sub] = cellUnion[sub ^ low] | cand[cellIds[lowest(low)]];
          const size = pop(sub);
          if (size < 2 || size >= cellCount) continue;
          if (pop(cellUnion[sub]) === size) {
            reducible = true;
            break;
          }
        }
        if (reducible) continue;

        ahses.push({
          id: ahses.length,
          unit: u,
          type: houseType(u),
          index: houseIndex(u),
          digitMask: m,
          cellIds,
          cellBits: cellBitsOf(cellIds),
          cellDigitMask: cellIds.map((id) => cand[id] & m),
          cellNodes: null,
          // valid HLS subsets: { mask (over cellIds), digits, cells, dCells,
          //                      side, view }
          hls: [],
        });
      }
    }
    tick("graph.ahsEnum", t0);
    count("graph.ahsCount", ahses.length);
    t0 = now();

    // 2. Cell nodes, HLS entries (with their NandBitsets) and the cell-cell
    //    OR links.
    const orMap = new Map();
    const ahsReg = new Map();
    const ahsOf = new Map();
    const tag = (node, ahs) => {
      let list = ahsOf.get(node);
      if (!list) {
        list = [];
        ahsOf.set(node, list);
      }
      if (!list.includes(ahs)) list.push(ahs);
    };
    const addOr = (a, b, ahs) => {
      if (a === b) return;
      let sa = orMap.get(a);
      if (!sa) orMap.set(a, (sa = new Set()));
      let sb = orMap.get(b);
      if (!sb) orMap.set(b, (sb = new Set()));
      sa.add(b);
      sb.add(a);
      if (ahs) {
        let ra = ahsReg.get(a);
        if (!ra) ahsReg.set(a, (ra = new Map()));
        let rb = ahsReg.get(b);
        if (!rb) ahsReg.set(b, (rb = new Map()));
        if (!ra.has(b)) ra.set(b, ahs);
        if (!rb.has(a)) rb.set(a, ahs);
      }
    };

    const useHls = techniques._ahsUseHls === true;
    let hlsCandidates = 0;
    let hlsEntries = 0;
    const hlsUnion = new Int32Array(512);
    for (const ahs of ahses) {
      const { cellIds, cellDigitMask } = ahs;
      const cellNodes = cellIds.map((id, i) =>
        getNode([id], maskDigits(cellDigitMask[i])),
      );
      ahs.cellNodes = cellNodes;
      for (let i = 0; i < cellNodes.length; i++) {
        tag(cellNodes[i], ahs);
        for (let j = i + 1; j < cellNodes.length; j++) {
          addOr(cellNodes[i], cellNodes[j], ahs);
        }
      }

      if (!useHls) continue;
      const k = cellIds.length;
      const limit = 1 << k;
      hlsUnion[0] = 0;
      for (let sub = 1; sub < limit; sub++) {
        const low = sub & -sub;
        hlsUnion[sub] = hlsUnion[sub ^ low] | cellDigitMask[lowest(low)];
        const size = pop(sub);
        if (size < 2 || size >= k) continue;
        const digitUnion = hlsUnion[sub];
        if (pop(digitUnion) !== size) continue;
        hlsCandidates++;
        const subIds = [];
        const subMasks = [];
        let s = sub;
        while (s) {
          const i = lowest(s);
          subIds.push(cellIds[i]);
          subMasks.push(cellDigitMask[i]);
          s &= s - 1;
        }
        if (!hasPerfectMatching(subMasks)) continue;
        hlsEntries++;
        const dCells = emptyNand();
        for (let i = 0; i < subIds.length; i++) {
          let dm = subMasks[i];
          while (dm) {
            dCells[lowest(dm)][CELL_PART[subIds[i]]] |= CELL_BIT[subIds[i]];
            dm &= dm - 1;
          }
        }
        const nand = emptyNand();
        let dm = digitUnion;
        while (dm) {
          const kd = lowest(dm);
          dm &= dm - 1;
          const cp = commonPeersOfBits(dCells[kd]);
          nand[kd][0] |= cp[0];
          nand[kd][1] |= cp[1];
          nand[kd][2] |= cp[2];
        }
        for (let i = 0; i < subIds.length; i++) {
          if (pop(subMasks[i]) !== 1) continue;
          const pb = PEER_BITSETS[subIds[i]];
          const kd = lowest(subMasks[i]);
          nand[kd][0] |= pb[0];
          nand[kd][1] |= pb[1];
          nand[kd][2] |= pb[2];
        }
        ahs.hls.push({
          mask: sub,
          digits: digitUnion,
          cells: subIds,
          dCells,
          side: {
            nand,
            nandDigits: nandDigitsOf(nand),
            dCells,
            dMask: digitUnion,
          },
          view: null,
        });
      }
    }
    tick("graph.nodesHls", t0);
    count("graph.hlsCandidates", hlsCandidates);
    count("graph.hlsEntries", hlsEntries);
    t0 = now();

    const negNodes = [];
    const negCache = new Map();
    const getNegNode = (id, compMask) => {
      const key = id * 512 + compMask;
      let node = negCache.get(key);
      if (!node) {
        node = new AICNode([id], maskDigits(compMask));
        node.isNeg = true;
        node.hlsRefs = [];
        node.ahsNand = emptyNand();
        negCache.set(key, node);
        ownNodes.push(node);
        negNodes.push(node);
      }
      return node;
    };
    for (const [cellNode, ahsList] of ahsOf) {
      const id = cellNode.cells[0];
      const s = digitMaskOf(cellNode);
      const comp = cand[id] & ~s;
      if (comp === 0) continue;
      for (const ahs of ahsList) {
        const cellIdx = ahs.cellIds.indexOf(id);
        const bitIdx = 1 << cellIdx;
        const excluding = ahs.hls.filter((h) => (h.mask & bitIdx) === 0);
        if (excluding.length === 0) continue;
        const neg = getNegNode(id, comp);
        for (const h of excluding) {
          neg.hlsRefs.push({ ahs, cellIdx, h });
          orInto(neg.ahsNand, h.side.nand);
        }
        addOr(cellNode, neg, ahs);
      }
    }
    for (const neg of negNodes) neg.ahsNandDigits = nandDigitsOf(neg.ahsNand);
    tick("graph.neg", t0);
    count("graph.negCount", negNodes.length);
    t0 = now();

    let pivotCount = 0;
    // With HLS off, intra-cell OR gates come only from the bivalue map.
    if (useHls) {
      const pivotDigits = new Int32Array(81);
      const forbidMasks = Array.from({ length: 81 }, () => []);
      const pivotPairs = [];
      const seenPairs = new Set();
      for (const ahs of ahses) {
        const excluded = ahs.cellBits;
        for (const h of ahs.hls) {
          const touched = [];
          let dm = h.digits;
          while (dm) {
            const k = lowest(dm);
            dm &= dm - 1;
            const nb = h.side.nand[k];
            const cb = candBits[k];
            for (let part = 0; part < 3; part++) {
              let m = nb[part] & cb[part] & ~excluded[part];
              while (m) {
                const id = part * 27 + lowest(m);
                if (pivotDigits[id] === 0) touched.push(id);
                pivotDigits[id] |= 1 << k;
                m &= m - 1;
              }
            }
          }
          for (const id of touched) {
            const s = pivotDigits[id];
            pivotDigits[id] = 0;
            if (s === cand[id]) continue;
            const key = id * 512 + s;
            if (seenPairs.has(key)) continue;
            seenPairs.add(key);
            forbidMasks[id].push(s);
            pivotPairs.push(id, s);
          }
        }
      }
      for (let i = 0; i < pivotPairs.length; i += 2) {
        const id = pivotPairs[i];
        const s = pivotPairs[i + 1];
        const comp = cand[id] & ~s;
        const compDigits = maskDigits(comp);
        let useful =
          compDigits.length === 1 || peekNode([id], compDigits) !== null;
        if (!useful) {
          for (const m of forbidMasks[id]) {
            if ((comp & ~m) === 0) {
              useful = true;
              break;
            }
          }
        }
        if (!useful) continue;
        const pivot = getNode([id], maskDigits(s));
        const other = getNode([id], compDigits);
        if (orMap.get(pivot)?.has(other)) continue;
        addOr(pivot, other, null);
        pivotCount++;
      }
    }
    tick("graph.pivots", t0);
    count("graph.pivotCount", pivotCount);
    count("graph.ownNodes", ownNodes.length);
    t0 = now();

    if (cache.BilocationOrMap.size === 0) {
      cache.BilocationOrMap = techniques.buildBilocationOrMap(cache.AllNodes);
    }
    if (cache.BivalueOrMap.size === 0) {
      cache.BivalueOrMap = techniques.buildBivalueOrMap(cache.AllNodes);
    }
    if (cache.GroupedOrMap.size === 0) {
      cache.GroupedOrMap = techniques.buildGroupedOrMap(
        pencils,
        sharedGetNode(cache),
        cache.GroupedLinkRegistry,
      );
    }
    const linked = new Set();
    for (const map of [
      cache.BilocationOrMap,
      cache.BivalueOrMap,
      cache.GroupedOrMap,
      orMap,
    ]) {
      for (const [u, set] of map) if (set.size > 0) linked.add(u);
    }
    const universe = [...cache.AllNodes, ...ownNodes].filter((n) =>
      linked.has(n),
    );
    universe.forEach((node, idx) => {
      node.uIndex = idx;
      digitMaskOf(node);
      if (!node.hlsRefs) node.ahsNandDigits = plainSideOf(node).nandDigits;
    });
    const nandAdj = new Map();
    universe.forEach((n) => nandAdj.set(n, []));
    const link = (a, b) => {
      nandAdj.get(a).push(b);
      nandAdj.get(b).push(a);
    };

    const singleByDigit = Array.from({ length: 10 }, () => []);
    const byCell = Array.from({ length: 81 }, () => []);
    const nodesAt = Array.from({ length: 81 * 9 }, () => []);
    for (const n of universe) {
      for (let k = 0; k < 9; k++) {
        if (((n.digitMask >> k) & 1) === 0) continue;
        const nb = n.NodeBitset[k];
        for (let part = 0; part < 3; part++) {
          let m = nb[part];
          while (m) {
            nodesAt[(part * 27 + lowest(m)) * 9 + k].push(n);
            m &= m - 1;
          }
        }
      }
      if (n.digits.length === 1) singleByDigit[n.digits[0]].push(n);
      if (n.cells.length === 1) byCell[n.cells[0]].push(n);
    }

    // Rule 1: same digit, every cell of B sees every cell of A.
    for (const A of universe) {
      if (A.digits.length !== 1) continue;
      const k = A.digits[0] - 1;
      const aNand = A.NandBitset[k];
      for (const B of singleByDigit[k + 1]) {
        if (A === B) continue;
        if (partSubset(B.NodeBitset[k], aNand)) nandAdj.get(A).push(B);
      }
    }
    // Rule 2: same cell, disjoint digits.
    for (let id = 0; id < 81; id++) {
      const list = byCell[id];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if ((list[i].digitMask & list[j].digitMask) === 0) {
            link(list[i], list[j]);
          }
        }
      }
    }
    // Rules 3/4: a neg node against the nodes living where one of its HLSes
    // forbids a digit; a link needs one HLS justification on at least one
    // side, so it can always be shown as that HLS.
    const negNand = (N, B) => {
      // Everything a side could prove is bounded by the union of the sides;
      // most candidates fail these masks and never reach the per-side tests.
      const bNandDigits = B.ahsNandDigits;
      const mayForbidB = (B.digitMask & ~N.ahsNandDigits) === 0;
      const mayForbidN = (N.digitMask & ~bNandDigits) === 0;
      if (!mayForbidB && !mayForbidN && (N.ahsNandDigits & bNandDigits) === 0) {
        return false;
      }
      const nSides = sidesOf(N);
      const bSides = sidesOf(B);
      for (let i = 1; i < nSides.length; i++) {
        if (nodeForbidden(B, nSides[i])) return true;
      }
      for (let j = nSides.length > 1 ? 0 : 1; j < bSides.length; j++) {
        if (nodeForbidden(N, bSides[j])) return true;
      }
      if (bSides.length > 1 && nodeForbidden(B, nSides[0])) return true;
      // Only an HLS side locks digits into cells, so a plain side never
      // forbids by position and is only tested as the other side.
      for (let i = 1; i < nSides.length; i++) {
        const sn = nSides[i];
        if (positionsForbidden(sn, bSides[0])) return true;
        for (let j = 1; j < bSides.length; j++) {
          const sb = bSides[j];
          if (positionsForbidden(sn, sb) || positionsForbidden(sb, sn)) {
            return true;
          }
        }
      }
      for (let j = 1; j < bSides.length; j++) {
        if (positionsForbidden(bSides[j], nSides[0])) return true;
      }
      return false;
    };
    const stamp = new Int32Array(universe.length);
    let stampId = 0;
    let tests = 0;
    for (const N of negNodes) {
      if (N.uIndex === undefined) continue;
      stampId++;
      stamp[N.uIndex] = stampId;
      let digits = N.ahsNandDigits;
      while (digits) {
        const k = lowest(digits);
        digits &= digits - 1;
        const nb = N.ahsNand[k];
        for (let part = 0; part < 3; part++) {
          let m = nb[part];
          while (m) {
            const id = part * 27 + lowest(m);
            m &= m - 1;
            const list = nodesAt[id * 9 + k];
            for (let i = 0; i < list.length; i++) {
              const B = list[i];
              if (stamp[B.uIndex] === stampId) continue;
              stamp[B.uIndex] = stampId;
              // Same-cell pairs are rule 2's business.
              if (B.cells.length === 1 && B.cells[0] === N.cells[0]) continue;
              tests++;
              if (negNand(N, B)) link(N, B);
            }
          }
        }
      }
    }
    count("graph.negPairTests", tests);
    tick("graph.nand", t0);
    count("graph.universe", universe.length);

    // --- HLS views: a concrete HLS as it is shown and reasoned with ---
    const viewOf = (ahs, h) => {
      if (!h.view) {
        h.view = {
          cells: h.cells,
          digits: maskDigits(h.digits),
          digitMask: h.digits,
          isHls: true,
          ahs,
          cellBits: cellBitsOf(h.cells),
          NodeBitset: h.dCells,
          side: h.side,
        };
      }
      return h.view;
    };

    cache.AhsGraph = {
      ahses,
      negNodes,
      orMap,
      ahsReg,
      ahsOf,
      ownNodes,
      universe,
      nandAdj,
      viewOf,
      cand,
      candBits,
    };
    return cache.AhsGraph;
  };

  // --- Search ---
  // Removal packs dedupe on (row, column, digit); the stamp keeps the scratch
  // across packs, as the Hall check does.
  const packSeen = new Int32Array(4096);
  let packStamp = 0;

  const findAhsAic = (board, pencils, config, findAll = false) => {
    const {
      kind,
      useGrouped = false,
      maxCycle,
      searchCycles = null,
      nameOverride,
      pathFilter = null,
      allowedOrLinkTypes = null,
      maxPathNodes = null,
      maxRingNodes = null,
      // Pattern kinds: the OR link type gate i must have ("ahs" | "cell" |
      // null for any) and the ring lengths (node counts) the pattern allows.
      orRole = null,
      ringLengths = null,
      requireAhs = false,
      // How gate i is shown: "ahs" forces an HLS view, "cell" keeps the
      // intra-cell form, "auto" uses the cell form when it already proves
      // the step and an HLS view otherwise.
      gateRole = () => "auto",
    } = config;
    const techniqueName = nameOverride || t("teks_AHS_AIC");
    const results = [];

    let t0 = now();
    const cache = techniques._aicCache;
    const graph = buildAhsGraph(board, pencils);
    const { ahsReg, cand, candBits, nandAdj } = graph;
    tick("call.graph", t0);
    t0 = now();

    const sameCell = (u, v) =>
      u.cells.length === 1 && v.cells.length === 1 && u.cells[0] === v.cells[0];
    // A digit with two positions in a house is the smallest AHS, so its
    // bilocation link is an AHS gate for the wing shapes (as a bivalue cell,
    // the smallest ALS, is an ALS link for the ALS wings).
    const isBilocationGate = (u, v) =>
      u.cells.length === 1 &&
      v.cells.length === 1 &&
      u.digits.length === 1 &&
      v.digits.length === 1 &&
      u.digits[0] === v.digits[0] &&
      cache.BilocationOrMap.get(u)?.has(v) === true;
    const isRegisteredAhsGate = (u, v) => ahsReg.get(u)?.get(v) !== undefined;
    const isAhsGate = (u, v) =>
      isRegisteredAhsGate(u, v) || isBilocationGate(u, v);
    const getOrLinkType = (u, v) => {
      if (sameCell(u, v)) return "cell";
      if (isAhsGate(u, v)) return "ahs";
      if (
        u.digits.length === 1 &&
        v.digits.length === 1 &&
        u.digits[0] === v.digits[0]
      ) {
        return "region";
      }
      return "other";
    };

    // Direct OR links for this configuration. Bilocation and grouped maps
    // only hold region links, the bivalue map only cell links, so a technique
    // that excludes a type never has to look at that map.
    const allowed = allowedOrLinkTypes ? new Set(allowedOrLinkTypes) : null;
    const wants = (type) => !allowed || allowed.has(type);
    const direct = new Map();
    const addDirect = (u, v, check) => {
      if (u === v) return;
      if (
        check &&
        allowed &&
        !allowed.has(getOrLinkType(u, v)) &&
        !(allowed.has("ahs") && isAhsGate(u, v))
      ) {
        return;
      }
      let list = direct.get(u);
      if (!list) direct.set(u, (list = []));
      if (!list.includes(v)) list.push(v);
    };
    const mergeMap = (map, check) => {
      for (const [u, set] of map) {
        for (const v of set) addDirect(u, v, check);
      }
    };
    if (wants("region") || wants("ahs")) {
      mergeMap(cache.BilocationOrMap, !wants("region"));
    }
    if (wants("region") && useGrouped) mergeMap(cache.GroupedOrMap, false);
    if (wants("cell")) mergeMap(cache.BivalueOrMap, false);
    mergeMap(graph.orMap, allowed !== null);

    const interestedNodes = graph.universe.filter((n) => direct.has(n));
    const wordCount = (interestedNodes.length + 31) >>> 5;
    const interestedMark = new Uint8Array(graph.universe.length);
    for (const n of interestedNodes) interestedMark[n.uIndex] = 1;

    interestedNodes.forEach((node, idx) => {
      node.index = idx;
      node.NandNodes = new Set();
      for (const other of nandAdj.get(node)) {
        if (interestedMark[other.uIndex]) node.NandNodes.add(other);
      }
      node.OrList0 = direct.get(node);
      node.OrList = node.OrList0.slice();
      node.OrFrontier = node.OrList.slice();
      node.OrNandFrontier = [];
      node.OrBits = new Uint32Array(wordCount);
      node.OrNandBits = new Uint32Array(wordCount);
    });
    for (const node of interestedNodes) {
      for (const other of node.OrList) {
        node.OrBits[other.index >>> 5] |= 1 << (other.index & 31);
      }
    }
    // A pattern kind walks only the OR links of the type its gate index
    // allows; a same-cell AHS gate is both an "ahs" and a "cell" link.
    if (orRole) {
      for (const node of interestedNodes) {
        node.OrAhs = node.OrList0.filter((v) => isAhsGate(node, v));
        node.OrCell = node.OrList0.filter(
          (v) => getOrLinkType(node, v) === "cell",
        );
      }
    }
    if (ringLengths) {
      const bitsOf = (list) => {
        const bits = new Uint32Array(wordCount);
        for (const v of list) bits[v.index >>> 5] |= 1 << (v.index & 31);
        return bits;
      };
      for (const node of interestedNodes) {
        node.NandBitsW = bitsOf(node.NandNodes);
        node.Or0Bits = bitsOf(node.OrList0);
        node.OrAhsBits = bitsOf(node.OrAhs);
        node.OrCellBits = bitsOf(node.OrCell);
      }
    }
    const roleList = (node, orIndex) => {
      const role = orRole ? orRole(orIndex) : null;
      return role === "ahs"
        ? node.OrAhs
        : role === "cell"
          ? node.OrCell
          : node.OrList0;
    };
    tick("call.orMap", t0);
    count("call.interested", interestedNodes.length);

    // --- helpers shared with the AIC core ---
    const getMaxPathLenForCycle = (cycle) => 1 << (cycle + 2);
    const stringifiedFoundRemovals = new Set();
    const deadRings = new Set();

    const canonicalRemovalPack = (removals) => {
      if (packStamp === 0x7fffffff) {
        packSeen.fill(0);
        packStamp = 0;
      }
      packStamp++;
      const unique = [];
      for (const el of removals) {
        const key = (el.r << 8) | (el.c << 4) | el.num;
        if (packSeen[key] !== packStamp) {
          packSeen[key] = packStamp;
          unique.push(el);
        }
      }
      unique.sort((a, b) => a.r - b.r || a.c - b.c || a.num - b.num);
      let key = "";
      for (const el of unique) key += `${el.r}${el.c}${el.num};`;
      return { removals: unique, key };
    };

    // Candidates of digit d that both bitsets hold.
    const pushBoth = (out, x, y, d) => {
      const cb = candBits[d - 1];
      for (let part = 0; part < 3; part++) {
        let m = x[part] & y[part] & cb[part];
        while (m) {
          const id = part * 27 + lowest(m);
          out.push({ r: Math.floor(id / 9), c: id % 9, num: d });
          m &= m - 1;
        }
      }
    };
    // Candidates forbidden by both sides.
    const intersectionRemovals = (sa, sd, out) => {
      let common = sa.nandDigits & sd.nandDigits;
      while (common) {
        const k = lowest(common);
        common &= common - 1;
        pushBoth(out, sa.nand[k], sd.nand[k], k + 1);
      }
    };
    // What pushBoth would push, asked of as cheaply as the caller allows:
    // whether anything is forbidden, or how much. All three must stay in step.
    const hasIntersection = (sa, sd) => {
      let common = sa.nandDigits & sd.nandDigits;
      while (common) {
        const k = lowest(common);
        common &= common - 1;
        const x = sa.nand[k];
        const y = sd.nand[k];
        const cb = candBits[k];
        const m =
          (x[0] & y[0] & cb[0]) | (x[1] & y[1] & cb[1]) | (x[2] & y[2] & cb[2]);
        if (m !== 0) return true;
      }
      return false;
    };
    const intersectionCount = (sa, sd) => {
      let n = 0;
      let common = sa.nandDigits & sd.nandDigits;
      while (common) {
        const k = lowest(common);
        common &= common - 1;
        const x = sa.nand[k];
        const y = sd.nand[k];
        const cb = candBits[k];
        n +=
          pop(x[0] & y[0] & cb[0]) +
          pop(x[1] & y[1] & cb[1]) +
          pop(x[2] & y[2] & cb[2]);
      }
      return n;
    };
    // Search-time view of a graph node: everything it can justify at once.
    // Both parts are built once per graph, so the wrapper is kept as well.
    const unionSideOf = (node) => {
      if (!node.hlsRefs) return plainSideOf(node);
      if (!node.ahsUnionSide) {
        node.ahsUnionSide = {
          nand: node.ahsNand,
          nandDigits: node.ahsNandDigits,
        };
      }
      return node.ahsUnionSide;
    };

    const acceptsPath = (path, kind_) =>
      !pathFilter ||
      pathFilter(path, {
        kind: kind_,
        isRing: kind_ === "ring",
        getOrLinkType,
        isAhsGate,
      });

    // After c + 1 closure passes, OrBits/OrNandBits of a node hold every node
    // reachable by an alternating walk of up to this many links.
    let coverageLinks = 0;

    const findPath = (startNode, endNode, maxNodes, kind_) => {
      const endOrBits = endNode.OrBits;
      const endOrNandBits = endNode.OrNandBits;
      const EMPTY = new Set();
      const states = [
        { node: startNode, isNextOr: true, parent: -1, depth: 1, ahs: 0 },
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
          if (states[stateIndex].node === targetNode) return true;
          stateIndex = states[stateIndex].parent;
        }
        return false;
      };

      // Dominance pruning keys on (node, parity, used an AHS gate yet).
      const bestDepth = pathFilter
        ? null
        : new Map([[startNode.index * 4 + 2, 1]]);

      while (head < states.length) {
        const stateIndex = head++;
        const state = states[stateIndex];
        const { node, isNextOr, depth } = state;

        if (node === endNode) {
          if (!isNextOr && (!requireAhs || state.ahs === 1)) {
            const path = reconstructPath(stateIndex);
            if (acceptsPath(path, kind_)) return path;
          }
          continue;
        }
        if (depth >= maxNodes) continue;

        const nextNodes = isNextOr
          ? roleList(node, (depth - 1) >> 1)
          : node.NandNodes || EMPTY;
        const nextIsOr = !isNextOr;
        const nextDepth = depth + 1;

        for (const nxt of nextNodes) {
          if (ancestorContains(stateIndex, nxt)) continue;
          // The rest of the path is a walk from nxt to endNode; the closure
          // bitsets of endNode bound what such a walk can reach.
          if (nxt !== endNode) {
            const remaining = maxNodes - nextDepth;
            if (remaining <= 0) continue;
            if (remaining <= coverageLinks) {
              const bits = nextIsOr ? endOrBits : endOrNandBits;
              if ((bits[nxt.index >>> 5] & (1 << (nxt.index & 31))) === 0) {
                continue;
              }
            }
          }
          // The AIC kind must use at least one AHS with two or more digits;
          // a bilocation alone would make it an ordinary AIC.
          const nextAhs =
            state.ahs === 1 || (isNextOr && isRegisteredAhsGate(node, nxt))
              ? 1
              : 0;

          if (bestDepth && nxt !== endNode) {
            const stateKey = nxt.index * 4 + (nextIsOr ? 2 : 0) + nextAhs;
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
            ahs: nextAhs,
          });
        }
      }
      return null;
    };

    const findRingsFrom = (A, targets, lengths) => {
      const maxNodes = Math.max(...lengths);
      const layers = new Map();
      for (const L of lengths) {
        const arr = new Array(L);
        let prev = new Uint32Array(wordCount);
        for (const target of targets) {
          prev[target.index >>> 5] |= 1 << (target.index & 31);
        }
        arr[1] = prev;
        for (let j = 2; j < L; j++) {
          const next = new Uint32Array(wordCount);
          const isNand = (j & 1) === 1;
          const role = isNand ? null : orRole(L / 2 - j / 2);
          for (let w = 0; w < wordCount; w++) {
            let m = prev[w];
            while (m) {
              const b = lowest(m);
              m &= m - 1;
              const node = interestedNodes[w * 32 + b];
              const bits = isNand
                ? node.NandBitsW
                : role === "ahs"
                  ? node.OrAhsBits
                  : role === "cell"
                    ? node.OrCellBits
                    : node.Or0Bits;
              for (let k = 0; k < wordCount; k++) next[k] |= bits[k];
            }
          }
          arr[j] = next;
          prev = next;
        }
        layers.set(L, arr);
      }
      const canClose = (nxt, nextDepth) => {
        for (const L of lengths) {
          const j = L - nextDepth + 1;
          if (j < 1) continue;
          if (layers.get(L)[j][nxt.index >>> 5] & (1 << (nxt.index & 31))) {
            return true;
          }
        }
        return false;
      };

      const targetSet = new Set(targets);
      const resolved = new Map();
      const states = [{ node: A, isNextOr: true, parent: -1, depth: 1 }];
      let head = 0;
      const reconstructPath = (stateIndex) => {
        const path = [];
        while (stateIndex !== -1) {
          path.push(states[stateIndex].node);
          stateIndex = states[stateIndex].parent;
        }
        path.reverse();
        return path;
      };
      const ancestorContains = (stateIndex, targetNode) => {
        while (stateIndex !== -1) {
          if (states[stateIndex].node === targetNode) return true;
          stateIndex = states[stateIndex].parent;
        }
        return false;
      };
      while (head < states.length) {
        const stateIndex = head++;
        const { node, isNextOr, depth } = states[stateIndex];
        if (
          depth > 1 &&
          !isNextOr &&
          targetSet.has(node) &&
          !resolved.has(node)
        ) {
          const path = reconstructPath(stateIndex);
          if (acceptsPath(path, "ring")) {
            resolved.set(node, path);
            if (resolved.size === targets.length) return resolved;
          }
        }
        if (depth >= maxNodes) continue;
        const nextNodes = isNextOr
          ? roleList(node, (depth - 1) >> 1)
          : node.NandNodes;
        const nextIsOr = !isNextOr;
        const nextDepth = depth + 1;
        for (const nxt of nextNodes) {
          if (ancestorContains(stateIndex, nxt)) continue;
          if (!canClose(nxt, nextDepth)) continue;
          states.push({
            node: nxt,
            isNextOr: nextIsOr,
            parent: stateIndex,
            depth: nextDepth,
          });
        }
      }
      return resolved;
    };

    // --- instantiation: one concrete justification per node ---
    // A display item wraps a graph node with the side that proves its links:
    //   { node, cells, digits, digitMask, NodeBitset, side, isHls, ahs }
    const plainItems = new Map();
    const plainItemOf = (node) => {
      let item = plainItems.get(node);
      if (!item) {
        item = {
          node,
          cells: node.cells,
          digits: node.digits,
          digitMask: node.digitMask,
          NodeBitset: node.NodeBitset,
          side: plainSideOf(node),
          isHls: false,
          ahs: null,
        };
        plainItems.set(node, item);
      }
      return item;
    };
    const viewItem = (node, view) => ({
      node,
      cells: view.cells,
      digits: view.digits,
      digitMask: view.digitMask,
      NodeBitset: view.NodeBitset,
      side: view.side,
      isHls: true,
      ahs: view.ahs,
    });
    const itemsNand = (a, b) => sidesNand(a, a.side, b, b.side);

    const negItemCache = new Map();
    const negItemsOf = (node, partner, role) => {
      const key =
        (node.index * 4096 + partner.index) * 4 + (role === "auto" ? 1 : 0);
      let items = negItemCache.get(key);
      if (items === undefined) {
        const refs = node.hlsRefs.filter((ref) =>
          ref.ahs.cellNodes.includes(partner),
        );
        if (refs.length === 0) items = null;
        else {
          items = [];
          if (role === "auto") items.push(plainItemOf(node));
          refs.sort((a, b) => pop(a.h.mask) - pop(b.h.mask));
          for (const ref of refs)
            items.push(viewItem(node, graph.viewOf(ref.ahs, ref.h)));
        }
        negItemCache.set(key, items);
      }
      return items;
    };
    const candidateOptions = (path) => {
      const L = path.length;
      const options = new Array(L);
      for (let g = 0; g < L; g += 2) {
        const i = g;
        const j = (g + 1) % L;
        const a = path[i];
        const b = path[j];
        options[i] = [plainItemOf(a)];
        options[j] = [plainItemOf(b)];
        if (!sameCell(a, b) || !isRegisteredAhsGate(a, b)) continue;
        const role = gateRole(g >> 1);
        if (role === "cell") continue;
        if (a.hlsRefs) {
          const items = negItemsOf(a, b, role);
          if (items) options[i] = items;
        } else if (b.hlsRefs) {
          const items = negItemsOf(b, a, role);
          if (items) options[j] = items;
        }
      }
      return options;
    };

    const gateAhs = (a, b) => {
      if (a.isHls) return a.ahs;
      if (b.isHls) return b.ahs;
      return ahsReg.get(a.node)?.get(b.node) || null;
    };
    const itemsSameCell = (a, b) =>
      a.cells.length === 1 && b.cells.length === 1 && a.cells[0] === b.cells[0];

    const ringExtraRemovals = (items, out) => {
      const L = items.length;
      for (let i = 0; i < L; i += 2) {
        const u = items[i];
        const v = items[(i + 1) % L];
        const ahs = gateAhs(u, v);
        if (!ahs || itemsSameCell(u, v)) continue;
        // Exactly one side is false, so every other AHS cell holds an AHS digit.
        const used = cellBitsOf([...u.cells, ...v.cells]);
        for (const id of ahs.cellIds) {
          if (used[CELL_PART[id]] & CELL_BIT[id]) continue;
          for (const d of maskDigits(cand[id] & ~ahs.digitMask)) {
            out.push({ r: Math.floor(id / 9), c: id % 9, num: d });
          }
        }
      }
      const weak = [];
      for (let i = 1; i < L - 1; i += 2) weak.push([items[i], items[i + 1]]);
      weak.push([items[L - 1], items[0]]);
      for (const [u, v] of weak) {
        if (u.isHls && v.isHls) {
          // Exactly one holds, so the digit sits in one of the two cell sets.
          let m = u.side.dMask & v.side.dMask;
          while (m) {
            const k = lowest(m);
            m &= m - 1;
            const cpu = commonPeersOfBits(u.side.dCells[k]);
            if (!partSubset(v.side.dCells[k], cpu)) continue;
            const cpv = commonPeersOfBits(v.side.dCells[k]);
            pushBoth(out, cpu, cpv, k + 1);
          }
        } else if (u.isHls || v.isHls) {
          const H = u.isHls ? u : v;
          const P = u.isHls ? v : u;
          if (P.cells.length !== 1 || P.digitMask !== H.digitMask) continue;
          const pb = PEER_BITSETS[P.cells[0]];
          let seesAll = true;
          let dm = H.digitMask;
          while (dm && seesAll) {
            const k = lowest(dm);
            dm &= dm - 1;
            if (!partSubset(H.NodeBitset[k], pb)) seesAll = false;
          }
          if (!seesAll) continue;
          const cp = commonPeersOfBits(H.cellBits || cellBitsOf(H.cells));
          for (const d of maskDigits(H.digitMask)) pushBoth(out, pb, cp, d);
        }
      }
    };
    const removalsForItems = (items, isRing) => {
      const out = [];
      if (isRing) {
        for (let i = 1; i < items.length - 1; i += 2) {
          intersectionRemovals(items[i].side, items[i + 1].side, out);
        }
        intersectionRemovals(items[items.length - 1].side, items[0].side, out);
        ringExtraRemovals(items, out);
      } else {
        intersectionRemovals(items[0].side, items[items.length - 1].side, out);
      }
      return canonicalRemovalPack(out);
    };

    const ringMayEliminate = (path) => {
      const L = path.length;
      for (let i = 1; i < L - 1; i += 2) {
        if (hasIntersection(unionSideOf(path[i]), unionSideOf(path[i + 1]))) {
          return true;
        }
      }
      if (hasIntersection(unionSideOf(path[L - 1]), unionSideOf(path[0]))) {
        return true;
      }
      for (let i = 0; i < L; i += 2) {
        const u = path[i];
        const v = path[(i + 1) % L];
        const ahs = ahsReg.get(u)?.get(v);
        if (!ahs || sameCell(u, v)) continue;
        const used = cellBitsOf([...u.cells, ...v.cells]);
        for (const id of ahs.cellIds) {
          if (used[CELL_PART[id]] & CELL_BIT[id]) continue;
          if (cand[id] & ~ahs.digitMask) return true;
        }
      }
      const weak = [];
      for (let i = 1; i < L - 1; i += 2) weak.push([path[i], path[i + 1]]);
      weak.push([path[L - 1], path[0]]);
      for (const [u, v] of weak) {
        if (u.hlsRefs && v.hlsRefs) {
          for (const ru of u.hlsRefs) {
            for (const rv of v.hlsRefs) {
              let m = ru.h.digits & rv.h.digits;
              while (m) {
                const k = lowest(m);
                m &= m - 1;
                const cpu = commonPeersOfBits(ru.h.dCells[k]);
                if (!partSubset(rv.h.dCells[k], cpu)) continue;
                const cpv = commonPeersOfBits(rv.h.dCells[k]);
                if (
                  (cpu[0] & cpv[0] & candBits[k][0]) |
                  (cpu[1] & cpv[1] & candBits[k][1]) |
                  (cpu[2] & cpv[2] & candBits[k][2])
                ) {
                  return true;
                }
              }
            }
          }
        } else if (u.hlsRefs || v.hlsRefs) {
          const N = u.hlsRefs ? u : v;
          const P = u.hlsRefs ? v : u;
          if (P.cells.length !== 1) continue;
          // Some HLS of N with exactly the pivot's digits could trigger DOF 1.
          for (const ref of N.hlsRefs) {
            if (ref.h.digits === P.digitMask) return true;
          }
        }
      }
      return false;
    };

    const instantiate = (path, isRing) => {
      const L = path.length;
      const options = candidateOptions(path);
      const chosen = new Array(L).fill(null);
      const weak = [];
      for (let i = 1; i < L - 1; i += 2) weak.push([i, i + 1]);
      if (isRing) weak.push([L - 1, 0]);
      for (const [i, j] of weak) {
        let found = false;
        for (const a of options[i]) {
          for (const b of options[j]) {
            if (itemsNand(a, b)) {
              chosen[i] = a;
              chosen[j] = b;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (!found) {
          count("call.instFailLink", 1);
          return null;
        }
      }
      if (!isRing) {
        // Free ends: the pair with the most eliminations, smallest first.
        let best = null;
        for (const a of options[0]) {
          for (const b of options[L - 1]) {
            // One intersection cannot repeat a candidate, so the canonical
            // pack would only sort it: the count is the same.
            const n = intersectionCount(a.side, b.side);
            if (!best || n > best.n) best = { a, b, n };
          }
        }
        if (!best || best.n === 0) {
          count("call.instFailEnds", 1);
          return null;
        }
        chosen[0] = best.a;
        chosen[L - 1] = best.b;
      }
      for (let i = 0; i < L; i++) if (!chosen[i]) chosen[i] = options[i][0];
      const { removals, key } = removalsForItems(chosen, isRing);
      if (removals.length === 0) {
        count("call.instFailEmpty", 1);
        return null;
      }
      count("call.instOk", 1);
      return { items: chosen, removals, key };
    };

    // --- presentation ---
    const getLoc = techniques._formatAicLocation;
    const showHls = techniques._ahsEurekaHlsTag;
    const itemLoc = (item, preferBox) =>
      getLoc(item.cells, preferBox) + (item.isHls && showHls ? "{hls}" : "");

    const buildEureka = (items, isRing) => {
      let str = "";
      let lastDigit = null;
      for (let i = 0; i < items.length; i += 2) {
        const u = items[i];
        const v = items[(i + 1) % items.length];
        let gate;
        const ahs = gateAhs(u, v);
        if (itemsSameCell(u, v)) {
          gate = `(${u.digits.join("")}=${v.digits.join("")})${getLoc(u.cells)}`;
          lastDigit = v.digits.length === 1 ? v.digits[0] : null;
        } else if (ahs) {
          const preferBox = ahs.type === "box";
          gate = `(${maskDigits(ahs.digitMask).join("")})(${itemLoc(u, preferBox)}=${itemLoc(v, preferBox)})`;
          lastDigit = null;
        } else {
          const d = u.digits[0];
          const prefix = lastDigit === d ? "" : `(${d})`;
          const gateType = cache.GroupedLinkRegistry?.get(u.node)?.get(v.node);
          const preferBoxGate = gateType === "box";
          gate = `${prefix}${getLoc(u.cells, preferBoxGate)}=${getLoc(v.cells, preferBoxGate)}`;
          lastDigit = d;
        }
        str += i === 0 ? gate : "-" + gate;
      }
      if (isRing) str += "-";
      return str;
    };

    const buildResult = (removals, name, items, isRing) => {
      const eurekaStr = buildEureka(items, isRing);
      const fullChain = isRing ? [...items, items[0]] : items;

      const usedAhs = [];
      const ahsGateItems = new Set();
      for (let i = 0; i < fullChain.length - 1; i += 2) {
        const u = fullChain[i];
        const v = fullChain[i + 1];
        if (itemsSameCell(u, v)) continue;
        const ahs = gateAhs(u, v);
        if (!ahs) continue;
        if (!usedAhs.includes(ahs)) usedAhs.push(ahs);
        ahsGateItems.add(u);
        ahsGateItems.add(v);
      }

      // AHS digits get the AHS colour; only the cells of an HLS actually used
      // in the chain are filled with it.
      const colorCodes = [6, 7, 2, 3, 4, 1, 8];
      const ahsColor = (ahs) =>
        colorCodes[usedAhs.indexOf(ahs) % colorCodes.length];
      const cellColors = [];
      const candidateColors = [];
      for (const ahs of usedAhs) {
        const color = ahsColor(ahs);
        for (const id of ahs.cellIds) {
          const r = Math.floor(id / 9);
          const c = id % 9;
          // "add" so a digit shared by two AHSes shows both colours.
          for (const num of maskDigits(cand[id] & ahs.digitMask)) {
            candidateColors.push({ r, c, num, color, mode: "add" });
          }
        }
      }
      for (const item of items) {
        if (!item.isHls || !usedAhs.includes(item.ahs)) continue;
        const color = ahsColor(item.ahs);
        for (const id of item.cells) {
          cellColors.push({
            r: Math.floor(id / 9),
            c: id % 9,
            color,
            mode: "add",
          });
        }
      }
      items.forEach((item, idx) => {
        if (ahsGateItems.has(item)) return;
        const color = idx % 2 === 0 ? 5 : 4;
        for (const id of item.cells) {
          const r = Math.floor(id / 9);
          const c = id % 9;
          for (const num of item.digits) {
            if (cand[id] & BIT(num)) candidateColors.push({ r, c, num, color });
          }
        }
      });

      const candidateMarks = removals.map(({ r, c, num }) => ({
        r,
        c,
        num,
        marker: "slash",
        color: 0,
      }));

      const links = [];
      const pickEnds = (u, v) => {
        let best = null;
        for (const a of u.cells) {
          const ar = Math.floor(a / 9);
          const ac = a % 9;
          for (const da of u.digits) {
            if (!(cand[a] & BIT(da))) continue;
            for (const b of v.cells) {
              const br = Math.floor(b / 9);
              const bc = b % 9;
              for (const db of v.digits) {
                if (!(cand[b] & BIT(db))) continue;
                const score =
                  (Math.abs(ar - br) + Math.abs(ac - bc)) * 2 +
                  (da === db ? 0 : 1);
                if (!best || score < best.score) {
                  best = {
                    score,
                    r1: ar,
                    c1: ac,
                    n1: da,
                    r2: br,
                    c2: bc,
                    n2: db,
                  };
                }
              }
            }
          }
        }
        return best;
      };
      const drawGroup = (item, idx) => {
        if (item.isHls || ahsGateItems.has(item)) return;
        const color = idx % 2 === 0 ? 5 : 4;
        // A multi-digit node in one cell (a pivot) is grouped by linking its
        // digits, as a multi-cell node is by linking its cells.
        if (item.cells.length === 1 && item.digits.length > 1) {
          const r = Math.floor(item.cells[0] / 9);
          const c = item.cells[0] % 9;
          for (let i = 0; i < item.digits.length - 1; i++) {
            links.push({
              r1: r,
              c1: c,
              n1: item.digits[i],
              r2: r,
              c2: c,
              n2: item.digits[i + 1],
              color,
              style: "solid",
            });
          }
          return;
        }
        if (item.cells.length < 2 || item.digits.length !== 1) return;
        for (let i = 0; i < item.cells.length - 1; i++) {
          links.push({
            r1: Math.floor(item.cells[i] / 9),
            c1: item.cells[i] % 9,
            n1: item.digits[0],
            r2: Math.floor(item.cells[i + 1] / 9),
            c2: item.cells[i + 1] % 9,
            n2: item.digits[0],
            color,
            style: "solid",
          });
        }
      };
      for (let i = 0; i < fullChain.length - 1; i++) {
        const u = fullChain[i];
        const v = fullChain[i + 1];
        if (i === 0) drawGroup(u, 0);
        if (i < items.length) drawGroup(v, (i + 1) % items.length);
        // Intra-AHS strong links are implied by the colouring and not drawn.
        if (i % 2 === 0 && !itemsSameCell(u, v) && gateAhs(u, v)) continue;
        const ends = pickEnds(u, v);
        if (!ends) continue;
        links.push({
          r1: ends.r1,
          c1: ends.c1,
          n1: ends.n1,
          r2: ends.r2,
          c2: ends.c2,
          n2: ends.n2,
          color: 0,
          style: i % 2 === 0 ? "solid" : "dash",
        });
      }

      return {
        change: true,
        type: "remove",
        cells: removals,
        placement: null,
        hint: {
          name,
          mainInfo: t("teks_start_with", eurekaStr.split("-")[0]),
          detail: `[${items.length}] ${eurekaStr}`,
        },
        visualPlan: {
          highlight: { digit: null, state: 0 },
          cellColors,
          candidateColors,
          candidateMarks,
          links,
        },
      };
    };

    const ringName =
      kind === "XZ" || kind === "W-Wing"
        ? t("teks_msg_doubly_linked") + techniqueName
        : kind === "XY-Wing"
          ? t("teks_msg_triply_linked") + techniqueName
          : techniqueName + t("teks_msg_ring_suffix");

    // --- closure + search cycles ---
    let searched = false;
    for (let cycle = 0; cycle < maxCycle; cycle++) {
      t0 = now();
      let anyExpansion = false;
      for (const A of interestedNodes) {
        const nextFrontier = [];
        const bits = A.OrNandBits;
        for (const B of A.OrFrontier) {
          for (const C of B.NandNodes) {
            const word = C.index >>> 5;
            const mask = 1 << (C.index & 31);
            if ((bits[word] & mask) === 0) {
              bits[word] |= mask;
              nextFrontier.push(C);
              anyExpansion = true;
            }
          }
        }
        A.OrNandFrontier = nextFrontier;
      }
      for (const A of interestedNodes) {
        const nextFrontier = [];
        const bits = A.OrBits;
        const orList = A.OrList;
        for (const C of A.OrNandFrontier) {
          const candidates = C.OrList;
          for (let i = 0; i < candidates.length; i++) {
            const D = candidates[i];
            const word = D.index >>> 5;
            const mask = 1 << (D.index & 31);
            if ((bits[word] & mask) === 0) {
              bits[word] |= mask;
              orList.push(D);
              nextFrontier.push(D);
              anyExpansion = true;
            }
          }
        }
        A.OrFrontier = nextFrontier;
      }
      tick("call.closure", t0);
      coverageLinks = 2 * (cycle + 1) + 1;

      const isLast = !anyExpansion || cycle === maxCycle - 1;
      const wantsSearch = searchCycles
        ? searchCycles.includes(cycle) || (isLast && !searched)
        : true;
      if (!wantsSearch) continue;
      searched = true;

      const effectiveCycle = searchCycles
        ? Math.max(cycle, searchCycles[0])
        : cycle;
      const maxPathLen = getMaxPathLenForCycle(effectiveCycle);
      let ringLen = maxPathLen;
      let chainLen = maxPathLen;
      if (maxPathNodes) chainLen = Math.min(chainLen, maxPathNodes);
      if (maxRingNodes) ringLen = Math.min(ringLen, maxRingNodes);
      else if (maxPathNodes) ringLen = Math.min(ringLen, maxPathNodes);

      // Priority 1: rings
      const ringResult = (pairKey, path) => {
        // A two-node ring is a hidden subset in disguise; leave it to them.
        if (path.length < 4 || !ringMayEliminate(path)) {
          deadRings.add(pairKey);
          return null;
        }
        const inst = instantiate(path, true);
        if (!inst) {
          deadRings.add(pairKey);
          return null;
        }
        if (stringifiedFoundRemovals.has(inst.key)) return null;
        stringifiedFoundRemovals.add(inst.key);
        return buildResult(inst.removals, ringName, inst.items, true);
      };
      t0 = now();
      if (ringLengths) {
        const lengths = ringLengths.filter((L) => L <= ringLen);
        for (const A of interestedNodes) {
          // The first gate must exist; a target needs the last gate of some
          // allowed length (gate index L / 2 - 1).
          if (lengths.length === 0 || roleList(A, 0).length === 0) continue;
          const targets = [];
          for (const D of A.OrList) {
            if (D.index <= A.index || !A.NandNodes.has(D)) continue;
            if (deadRings.has(A.index * 65536 + D.index)) continue;
            if (!lengths.some((L) => roleList(D, L / 2 - 1).length > 0))
              continue;
            targets.push(D);
          }
          if (targets.length === 0) continue;
          const found = findRingsFrom(A, targets, lengths);
          for (const D of targets) {
            const path = found.get(D);
            if (!path) continue;
            const res = ringResult(A.index * 65536 + D.index, path);
            if (!res) continue;
            if (!findAll) {
              tick("call.rings", t0);
              return res;
            }
            results.push(res);
          }
        }
      } else {
        for (const A of interestedNodes) {
          for (const D of A.OrList) {
            if (D.index <= A.index || !A.NandNodes.has(D)) continue;
            const pairKey = A.index * 65536 + D.index;
            if (deadRings.has(pairKey)) continue;
            const path = findPath(A, D, ringLen, "ring");
            if (!path) continue;
            const res = ringResult(pairKey, path);
            if (!res) continue;
            if (!findAll) {
              tick("call.rings", t0);
              return res;
            }
            results.push(res);
          }
        }
      }
      tick("call.rings", t0);

      // Priority 2: chains
      t0 = now();
      for (const A of interestedNodes) {
        const sa = unionSideOf(A);
        for (const D of A.OrList) {
          if (D.index <= A.index) continue;
          if (deadRings.has(A.index * 65536 + D.index)) continue;
          const sd = unionSideOf(D);
          if (!hasIntersection(sa, sd)) continue;
          const probe = [];
          intersectionRemovals(sa, sd, probe);
          // The union proves at least this much; skip pairs seen already.
          const { key: probeKey } = canonicalRemovalPack(probe);
          if (stringifiedFoundRemovals.has(probeKey)) continue;

          const path = findPath(A, D, chainLen, "chain");
          if (!path) continue;
          const inst = instantiate(path, false);
          if (!inst) continue;
          if (stringifiedFoundRemovals.has(inst.key)) continue;
          stringifiedFoundRemovals.add(inst.key);
          stringifiedFoundRemovals.add(probeKey);
          const res = buildResult(
            inst.removals,
            techniqueName,
            inst.items,
            false,
          );
          if (!findAll) {
            tick("call.chains", t0);
            return res;
          }
          results.push(res);
        }
      }
      tick("call.chains", t0);
      if (results.length > 0 && !findAll) return results[0];
      if (!anyExpansion) break;
    }

    return findAll ? results : { change: false };
  };

  const allAhsGates = (path, isAhsGate) => {
    for (let i = 0; i < path.length; i += 2) {
      if (!isAhsGate(path[i], path[i + 1])) return false;
    }
    return true;
  };

  Object.assign(techniques, {
    _buildAhsGraph: buildAhsGraph,
    _findAhsAic: findAhsAic,

    ahsXZ: (board, pencils, findAll = false) =>
      findAhsAic(
        board,
        pencils,
        {
          kind: "XZ",
          maxCycle: 1,
          nameOverride: t("teks_AHS_XZ"),
          allowedOrLinkTypes: ["ahs"],
          maxPathNodes: 4,
          gateRole: () => "ahs",
          orRole: () => "ahs",
          ringLengths: [4],
          pathFilter: (path, { isAhsGate }) =>
            path.length === 4 && allAhsGates(path, isAhsGate),
        },
        findAll,
      ),

    ahsXYWing: (board, pencils, findAll = false) =>
      findAhsAic(
        board,
        pencils,
        {
          kind: "XY-Wing",
          maxCycle: 2,
          searchCycles: [1],
          nameOverride: t("teks_AHS_XY_Wing"),
          allowedOrLinkTypes: ["ahs"],
          maxPathNodes: 6,
          gateRole: () => "ahs",
          orRole: () => "ahs",
          ringLengths: [6],
          pathFilter: (path, { isAhsGate }) =>
            path.length === 6 && allAhsGates(path, isAhsGate),
        },
        findAll,
      ),

    ahsWWing: (board, pencils, findAll = false) =>
      findAhsAic(
        board,
        pencils,
        {
          kind: "W-Wing",
          maxCycle: 2,
          searchCycles: [1],
          nameOverride: t("teks_AHS_W_Wing"),
          allowedOrLinkTypes: ["ahs", "cell"],
          maxPathNodes: 6,
          maxRingNodes: 8,
          gateRole: (gate) => (gate % 2 === 0 ? "ahs" : "cell"),
          orRole: (orIndex) => (orIndex % 2 === 0 ? "ahs" : "cell"),
          ringLengths: [6, 8],
          pathFilter: (path, { kind, getOrLinkType, isAhsGate }) => {
            if (path.length !== 6 && !(kind === "ring" && path.length === 8)) {
              return false;
            }
            for (let i = 0; i < path.length; i += 2) {
              const u = path[i];
              const v = path[i + 1];
              const ok =
                (i >> 1) % 2 === 0
                  ? isAhsGate(u, v)
                  : getOrLinkType(u, v) === "cell";
              if (!ok) return false;
            }
            return true;
          },
        },
        findAll,
      ),

    ahsAic: (board, pencils, findAll = false) =>
      findAhsAic(
        board,
        pencils,
        {
          kind: "AIC",
          useGrouped: true,
          maxCycle: 3,
          requireAhs: true,
          nameOverride: t("teks_AHS_AIC"),
        },
        findAll,
      ),
  });
})();
