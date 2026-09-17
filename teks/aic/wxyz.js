(() => {
  const UNITS = [];
  for (const type of ["box", "row", "col"]) {
    for (let i = 0; i < 9; i++) {
      UNITS.push({ type, cells: UNIT_IDS[UNIT_OFFSET[type] + i] });
    }
  }
  const boxOf = (id) =>
    Math.floor(Math.floor(id / 9) / 3) * 3 + Math.floor((id % 9) / 3);

  const collectThreeCellAls = (cellMask) => {
    const popcount = techniques._bits.popcount;
    const alses = [];
    for (const unit of UNITS) {
      const empty = [];
      for (const id of unit.cells) if (cellMask[id] !== 0) empty.push(id);
      const n = empty.length;
      if (n < 4) continue;
      for (let i = 0; i < n - 2; i++) {
        const a = empty[i];
        const ma = cellMask[a];
        for (let j = i + 1; j < n - 1; j++) {
          const b = empty[j];
          const mb = cellMask[b];
          if (popcount(ma | mb) === 2) continue;
          for (let k = j + 1; k < n; k++) {
            const c = empty[k];
            const mc = cellMask[c];
            const union = ma | mb | mc;
            if (popcount(union) !== 4) continue;
            if (popcount(ma | mc) === 2 || popcount(mb | mc) === 2) continue;
            if (
              unit.type !== "box" &&
              boxOf(a) === boxOf(b) &&
              boxOf(b) === boxOf(c)
            ) {
              continue;
            }
            const cells = [a, b, c];
            const pos = [0, 0, 0];
            for (const id of cells) pos[CELL_PART[id]] |= CELL_BIT[id];
            const posOf = new Array(10);
            const commonPeers = new Array(10);
            let digits = union;
            while (digits !== 0) {
              const d = lowest(digits);
              digits &= digits - 1;
              const p = [0, 0, 0];
              let c0 = -1;
              let c1 = -1;
              let c2 = -1;
              for (const id of cells) {
                if (cellMask[id] & (1 << d)) {
                  p[CELL_PART[id]] |= CELL_BIT[id];
                  const pb = PEER_BITSETS[id];
                  c0 &= pb[0];
                  c1 &= pb[1];
                  c2 &= pb[2];
                }
              }
              posOf[d] = p;
              commonPeers[d] = [c0, c1, c2];
            }
            alses.push({ cells, mask: union, pos, posOf, commonPeers, unit });
          }
        }
      }
    }
    return alses;
  };

  const wxyzWing = (board, pencils, findAll = false) => {
    const cellMask = new Int32Array(81);
    const cand0 = new Int32Array(10);
    const cand1 = new Int32Array(10);
    const cand2 = new Int32Array(10);
    const bivaluesByPair = new Array(100);
    let bivalueCount = 0;
    for (let id = 0; id < 81; id++) {
      const r = Math.floor(id / 9);
      const c = id % 9;
      if (board[r][c] !== 0) continue;
      let m = 0;
      const part = CELL_PART[id];
      const bit = CELL_BIT[id];
      for (const d of pencils[r][c]) {
        m |= 1 << d;
        if (part === 0) cand0[d] |= bit;
        else if (part === 1) cand1[d] |= bit;
        else cand2[d] |= bit;
      }
      cellMask[id] = m;
      if (techniques._bits.popcount(m) === 2) {
        const key = lowest(m) * 10 + (31 - Math.clz32(m));
        (bivaluesByPair[key] || (bivaluesByPair[key] = [])).push(id);
        bivalueCount++;
      }
    }
    if (bivalueCount === 0) return findAll ? [] : { change: false };

    const alses = collectThreeCellAls(cellMask);
    if (alses.length === 0) return findAll ? [] : { change: false };

    const collect = (out, d, b0, b1, b2) => {
      b0 &= cand0[d];
      b1 &= cand1[d];
      b2 &= cand2[d];
      for (let part = 0; part < 3; part++) {
        let mask = part === 0 ? b0 : part === 1 ? b1 : b2;
        while (mask !== 0) {
          const low = mask & -mask;
          const id = part * 27 + (31 - Math.clz32(low));
          out.push({ r: Math.floor(id / 9), c: id % 9, num: d });
          mask ^= low;
        }
      }
    };

    const hits = [];
    for (const als of alses) {
      const { mask, pos, posOf, commonPeers } = als;
      const np0 = ~pos[0];
      const np1 = ~pos[1];
      const np2 = ~pos[2];
      let rest = mask;
      while (rest !== 0) {
        const x = lowest(rest);
        rest &= rest - 1;
        let rest2 = rest;
        while (rest2 !== 0) {
          const z = lowest(rest2);
          rest2 &= rest2 - 1;
          const bucket = bivaluesByPair[x * 10 + z];
          if (!bucket) continue;
          const px = posOf[x];
          const pz = posOf[z];
          for (const a of bucket) {
            if ((pos[CELL_PART[a]] & CELL_BIT[a]) !== 0) continue;
            const pb = PEER_BITSETS[a];
            const nb0 = ~pb[0];
            const nb1 = ~pb[1];
            const nb2 = ~pb[2];
            if (((pos[0] & nb0) | (pos[1] & nb1) | (pos[2] & nb2)) === 0) {
              continue;
            }
            const xLinked =
              ((px[0] & nb0) | (px[1] & nb1) | (px[2] & nb2)) === 0;
            const zLinked =
              ((pz[0] & nb0) | (pz[1] & nb1) | (pz[2] & nb2)) === 0;
            if (!xLinked && !zLinked) continue;
            const removals = [];
            if (xLinked && zLinked) {
              const cz = commonPeers[z];
              const cx = commonPeers[x];
              collect(removals, z, pb[0] & cz[0], pb[1] & cz[1], pb[2] & cz[2]);
              collect(removals, x, pb[0] & cx[0], pb[1] & cx[1], pb[2] & cx[2]);
              let others = mask & ~((1 << x) | (1 << z));
              while (others !== 0) {
                const w = lowest(others);
                others &= others - 1;
                const cw = commonPeers[w];
                collect(removals, w, cw[0] & np0, cw[1] & np1, cw[2] & np2);
              }
              if (removals.length > 0) {
                hits.push({ removals, a, als, x, z, ring: true });
              }
            } else if (xLinked) {
              const cz = commonPeers[z];
              collect(removals, z, pb[0] & cz[0], pb[1] & cz[1], pb[2] & cz[2]);
              if (removals.length > 0) {
                hits.push({ removals, a, als, x, z, ring: false });
              }
            } else {
              const cx = commonPeers[x];
              collect(removals, x, pb[0] & cx[0], pb[1] & cx[1], pb[2] & cx[2]);
              if (removals.length > 0) {
                hits.push({ removals, a, als, x: z, z: x, ring: false });
              }
            }
          }
        }
      }
    }
    if (hits.length === 0) return findAll ? [] : { change: false };

    const seen = new Set();
    const results = [];
    const name = t("teks_WXYZ_Wing");
    const getLoc = techniques._formatAicLocation;
    const toRC = (id) => [Math.floor(id / 9), id % 9];
    const holders = (als, d) => {
      const list = [];
      for (const id of als.cells) if (cellMask[id] & (1 << d)) list.push(id);
      return list;
    };

    const build = (hit) => {
      const removals = hit.removals;
      removals.sort((p, q) => p.r - q.r || p.c - q.c || p.num - q.num);
      let key = "";
      for (const el of removals) key += `${el.r}${el.c}${el.num};`;
      if (seen.has(key)) return null;
      seen.add(key);

      const { a, als, x, z, ring } = hit;
      const preferBox = als.unit.type === "box";
      const eureka =
        `(${z}=${x})${getLoc([a])}-(${x}=${z})${getLoc(als.cells, preferBox)}` +
        (ring ? "-" : "");
      const nodes = [
        { cells: [a], digit: z },
        { cells: [a], digit: x },
        { cells: holders(als, x), digit: x },
        { cells: holders(als, z), digit: z },
      ];

      const candidateColors = [];
      nodes.forEach((node, idx) => {
        const color = idx % 2 === 0 ? 5 : 4;
        for (const id of node.cells) {
          const [r, c] = toRC(id);
          candidateColors.push({ r, c, num: node.digit, color });
        }
      });
      const cellColors = als.cells.map((id) => {
        const [r, c] = toRC(id);
        return { r, c, color: 6, mode: "add" };
      });
      const candidateMarks = removals.map(({ r, c, num }) => ({
        r,
        c,
        num,
        marker: "slash",
        color: 0,
      }));

      const links = [];
      const closestCells = (nodeA, nodeB) => {
        let minD = Infinity;
        let bestA = nodeA.cells[0];
        let bestB = nodeB.cells[0];
        for (const p of nodeA.cells) {
          const [ar, ac] = toRC(p);
          for (const q of nodeB.cells) {
            const [br, bc] = toRC(q);
            const distance = Math.abs(ar - br) + Math.abs(ac - bc);
            if (distance < minD) {
              minD = distance;
              bestA = p;
              bestB = q;
            }
          }
        }
        return [toRC(bestA), toRC(bestB)];
      };
      const drawGroup = (node, idx) => {
        if (node.cells.length < 2) return;
        const color = idx % 2 === 0 ? 5 : 4;
        for (let i = 0; i < node.cells.length - 1; i++) {
          const [r1, c1] = toRC(node.cells[i]);
          const [r2, c2] = toRC(node.cells[i + 1]);
          links.push({
            r1,
            c1,
            n1: node.digit,
            r2,
            c2,
            n2: node.digit,
            color,
            style: "solid",
          });
        }
      };
      const chain = ring ? [...nodes, nodes[0]] : nodes;
      for (let i = 0; i < chain.length - 1; i++) {
        const u = chain[i];
        const v = chain[i + 1];
        if (i === 0) drawGroup(u, 0);
        if (i < nodes.length) drawGroup(v, (i + 1) % nodes.length);
        const [cA, cB] = closestCells(u, v);
        links.push({
          r1: cA[0],
          c1: cA[1],
          n1: u.digit,
          r2: cB[0],
          c2: cB[1],
          n2: v.digit,
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
          name: ring ? t("teks_msg_doubly_linked") + name : name,
          mainInfo: t("teks_start_with", eureka.split("-")[0]),
          detail: eureka,
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

    for (const hit of hits) {
      if (!hit.ring) continue;
      const res = build(hit);
      if (!res) continue;
      if (!findAll) return res;
      results.push(res);
    }
    for (const hit of hits) {
      if (hit.ring) continue;
      const res = build(hit);
      if (!res) continue;
      if (!findAll) return res;
      results.push(res);
    }
    return findAll ? results : { change: false };
  };

  Object.assign(techniques, { wxyzWing });
})();
