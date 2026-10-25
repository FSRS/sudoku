Object.assign(techniques, {
  // Gurth's Symmetrical Placement
  _gspSymmetries: {
    diagonal: {
      partner: (r, c) => [c, r],
      axis: Array.from({ length: 9 }, (_, i) => [i, i]),
      maxSelfPaired: 3,
      dirKey: "teks_top_left",
      labelKey: "teks_diagonal",
    },
    antiDiagonal: {
      partner: (r, c) => [8 - c, 8 - r],
      axis: Array.from({ length: 9 }, (_, i) => [i, 8 - i]),
      maxSelfPaired: 3,
      dirKey: "teks_top_right",
      labelKey: "teks_antidiagonal",
    },
    xAxis: {
      partner: (r, c) => [8 - r, c],
      axis: Array.from({ length: 9 }, (_, i) => [4, i]),
      maxSelfPaired: 0,
      dirKey: null,
      labelKey: "teks_x_axis",
    },
    yAxis: {
      partner: (r, c) => [r, 8 - c],
      axis: Array.from({ length: 9 }, (_, i) => [i, 4]),
      maxSelfPaired: 0,
      dirKey: null,
      labelKey: "teks_y_axis",
    },
    central: {
      partner: (r, c) => [8 - r, 8 - c],
      axis: [[4, 4]],
      maxSelfPaired: 1,
      dirKey: null,
      labelKey: "teks_central",
    },
  },

  _gspBuildMapping: (board, partner, broken = null) => {
    const mapping = new Array(10).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const [pr, pc] = partner(r, c);
        if (r * 9 + c >= pr * 9 + pc) continue;
        const d1 = board[r][c];
        const d2 = board[pr][pc];
        if ((d1 === 0) !== (d2 === 0)) {
          if (!broken || broken.length) return null;
          broken.push({ r, c }, { r: pr, c: pc });
          continue;
        }
        if (d1 === 0) continue;
        if (d1 === d2) {
          if (mapping[d1] === 0) mapping[d1] = d1;
          else if (mapping[d1] !== d1) return null;
        } else {
          if ((mapping[d1] === 0) !== (mapping[d2] === 0)) return null;
          if (mapping[d1] === 0) {
            mapping[d1] = d2;
            mapping[d2] = d1;
          } else if (mapping[d1] !== d2 || mapping[d2] !== d1) return null;
        }
      }
    }
    return mapping;
  },

  _gspSelfPairedDigits: (mapping) => {
    const selfPaired = new Set();
    for (let d = 1; d <= 9; d++) {
      if (mapping[d] === 0 || mapping[d] === d) selfPaired.add(d);
    }
    return selfPaired;
  },

  _gspMappingText: (mapping) => {
    const seen = new Set();
    const parts = [];
    for (let d = 1; d <= 9; d++) {
      if (seen.has(d)) continue;
      const other = mapping[d] === 0 ? d : mapping[d];
      parts.push(`${d}<=>${other}`);
      seen.add(d);
      seen.add(other);
    }
    return parts.join(" ");
  },

  _gspCellGroups: (board, mapping) => {
    const groupOf = new Array(10).fill(-1);
    let groups = 0;
    for (let d = 1; d <= 9; d++) {
      if (groupOf[d] !== -1) continue;
      groupOf[d] = groups;
      if (mapping[d] !== 0 && mapping[d] !== d) groupOf[mapping[d]] = groups;
      groups++;
    }
    const cells = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] !== 0)
          cells.push({ r, c, group: groupOf[board[r][c]] });
      }
    }
    return cells;
  },

  _buildGspVisualPlan: (cellGroups, kept, removals) => ({
    highlight: { digit: null, state: 0 },
    cellColors: cellGroups.map(({ r, c, group }) => ({
      r,
      c,
      color: group,
    })),
    candidateColors: kept.map(({ r, c, num }) => ({
      r,
      c,
      num,
      color: 4,
    })),
    candidateMarks: removals.map(({ r, c, num }) => ({
      r,
      c,
      num,
      marker: "slash",
      color: 0,
    })),
  }),

  _applyGspVisuals: (cellGroups, kept, removals) => {
    techniques._applyVisualPlan(
      techniques._buildGspVisualPlan(cellGroups, kept, removals),
    );
  },

  _spsNames: [
    "Diagonal",
    "Antidiagonal",
    "Central",
    "Sticks Symmetry Type 1",
    "Sticks Symmetry Type 2",
  ],

  _spsLabelKeys: [
    "teks_diagonal",
    "teks_antidiagonal",
    "teks_central",
    "teks_SPS_sym_sticks_1",
    "teks_SPS_sym_sticks_2",
  ],

  _spsTables: null,
  _spsCache: new Map(),
  _spsCacheLimit: 64,

  _spsPermKey: (p) => {
    let key = 0;
    for (let i = 0; i < 9; i++) key = key * 9 + p[i];
    return key;
  },

  _spsBuildTables: () => {
    const permKey = techniques._spsPermKey;
    const bandOrders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
    ];
    const s3 = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];

    const perms = [];
    const permIndex = new Map();
    for (const b of bandOrders) {
      for (const w0 of s3) {
        for (const w1 of s3) {
          for (const w2 of s3) {
            const ws = [w0, w1, w2];
            const perm = new Int8Array(9);
            for (let k = 0; k < 3; k++) {
              for (let j = 0; j < 3; j++) perm[3 * k + j] = 3 * b[k] + ws[k][j];
            }
            permIndex.set(permKey(perm), perms.length);
            perms.push(perm);
          }
        }
      }
    }

    const rev = [8, 7, 6, 5, 4, 3, 2, 1, 0];
    const rowInv = [
      null,
      null,
      rev,
      [0, 1, 2, 6, 7, 8, 3, 4, 5],
      [2, 1, 0, 3, 5, 4, 6, 8, 7],
    ];
    const colInv = [
      null,
      null,
      rev,
      [0, 2, 1, 3, 5, 4, 6, 8, 7],
      [7, 8, 6, 3, 4, 5, 2, 0, 1],
    ];

    const groupBy = (inv) => {
      const groups = [];
      const of = new Int16Array(perms.length);
      const byKey = new Map();
      perms.forEach((P, i) => {
        const a = new Int8Array(9);
        for (let k = 0; k < 9; k++) a[P[k]] = P[inv[k]];
        const key = permKey(a);
        let g = byKey.get(key);
        if (g === undefined) {
          g = groups.length;
          byKey.set(key, g);
          groups.push({ inv: a, members: [] });
        }
        groups[g].members.push(i);
        of[i] = g;
      });
      return { groups, of };
    };

    const product = [];
    for (let s = 2; s < 5; s++) {
      product[s] = { rows: groupBy(rowInv[s]), cols: groupBy(colInv[s]) };
    }

    const sigma = [];
    const fixed = [];
    for (let s = 0; s < 5; s++) {
      const map = new Int8Array(81);
      const fx = [];
      for (let R = 0; R < 9; R++) {
        for (let C = 0; C < 9; C++) {
          let r2;
          let c2;
          if (s === 0) {
            r2 = C;
            c2 = R;
          } else if (s === 1) {
            r2 = 8 - C;
            c2 = 8 - R;
          } else {
            r2 = rowInv[s][R];
            c2 = colInv[s][C];
          }
          map[R * 9 + C] = r2 * 9 + c2;
          if (r2 === R && c2 === C) fx.push(R * 9 + C);
        }
      }
      sigma.push(map);
      fixed.push(fx);
    }

    const bijections = [];
    for (const sb of s3) {
      for (const w0 of s3) {
        for (const w1 of s3) {
          for (const w2 of s3) {
            const ws = [w0, w1, w2];
            const f = new Int8Array(9);
            const inv = new Int8Array(9);
            for (let i = 0; i < 3; i++) {
              for (let j = 0; j < 3; j++) {
                f[3 * i + j] = 3 * sb[i] + ws[i][j];
                inv[3 * sb[i] + ws[i][j]] = 3 * i + j;
              }
            }
            bijections.push({ f, inv });
          }
        }
      }
    }

    const popcount = new Uint8Array(512);
    for (let m = 1; m < 512; m++) popcount[m] = popcount[m >> 1] + (m & 1);

    return { perms, permIndex, product, sigma, fixed, bijections, popcount };
  },

  _spsAnalyze: (sol) => {
    const T =
      techniques._spsTables ||
      (techniques._spsTables = techniques._spsBuildTables());
    const { perms, permIndex, product, popcount } = T;
    const permKey = techniques._spsPermKey;

    for (let r = 0; r < 9; r++) {
      let seen = 0;
      for (let c = 0; c < 9; c++) {
        const v = sol[r * 9 + c];
        if (!(v >= 1 && v <= 9)) return null;
        seen |= 1 << (v - 1);
      }
      if (seen !== 511) return null;
    }

    const M = new Int8Array(10);
    const isInvolution = () => {
      for (let d = 1; d <= 9; d++) if (M[M[d]] !== d) return false;
      return true;
    };

    const validF = [];
    for (const { f, inv } of T.bijections) {
      for (let c = 0; c < 9; c++) M[sol[c]] = sol[inv[c] * 9 + f[0]];
      if (!isInvolution()) continue;
      let ok = true;
      for (let r = 1; r < 9 && ok; r++) {
        const fr = f[r];
        for (let c = 0; c < 9; c++) {
          if (M[sol[r * 9 + c]] !== sol[inv[c] * 9 + fr]) {
            ok = false;
            break;
          }
        }
      }
      if (ok) validF.push(f);
    }

    const validCols = [];
    for (let s = 2; s < 5; s++) {
      const { rows, cols } = product[s];
      validCols[s] = rows.groups.map(({ inv: a }) => {
        const list = [];
        cols.groups.forEach(({ inv: b }, gj) => {
          const a0 = a[0] * 9;
          for (let c = 0; c < 9; c++) M[sol[c]] = sol[a0 + b[c]];
          if (!isInvolution()) return;
          for (let r = 1; r < 9; r++) {
            const ar = a[r] * 9;
            for (let c = 0; c < 9; c++) {
              if (M[sol[r * 9 + c]] !== sol[ar + b[c]]) return;
            }
          }
          list.push(gj);
        });
        return list;
      });
    }

    const masks = new Uint8Array(perms.length);
    const touched = [];
    const p = new Int8Array(9);
    const mark = (pi, bit) => {
      if (masks[pi] === 0) touched.push(pi);
      masks[pi] |= bit;
    };
    let bestMask = 0;
    let bestCount = 0;
    let bestQ = -1;
    let bestP = -1;
    let done = false;
    for (let qi = 0; qi < perms.length && !done; qi++) {
      const q = perms[qi];
      for (const f of validF) {
        for (let k = 0; k < 9; k++) p[k] = f[q[k]];
        let pi = permIndex.get(permKey(p));
        if (pi !== undefined) mark(pi, 1);
        for (let k = 0; k < 9; k++) p[k] = f[q[8 - k]];
        pi = permIndex.get(permKey(p));
        if (pi !== undefined) mark(pi, 2);
      }
      for (let s = 2; s < 5; s++) {
        const { rows, cols } = product[s];
        for (const gj of validCols[s][rows.of[qi]]) {
          for (const pi of cols.groups[gj].members) mark(pi, 1 << s);
        }
      }
      if (touched.length === 0) continue;
      touched.sort((a, b) => a - b);
      for (const pi of touched) {
        const mask = masks[pi];
        masks[pi] = 0;
        if (done) continue;
        const count = popcount[mask];
        if (count > bestCount || (bestMask === 2 && mask !== 2)) {
          bestMask = mask;
          bestCount = count;
          bestQ = qi;
          bestP = pi;
        }
        if (count === 3) done = true;
      }
      touched.length = 0;
    }

    if (bestMask === 0) return { syms: [] };

    const q = perms[bestQ];
    const pp = perms[bestP];
    const cellOf = new Int8Array(81);
    for (let R = 0; R < 9; R++) {
      for (let C = 0; C < 9; C++) cellOf[R * 9 + C] = q[R] * 9 + pp[C];
    }
    const syms = [];
    for (let s = 0; s < 5; s++) {
      if (!(bestMask & (1 << s))) continue;
      const map = new Int8Array(10);
      for (let j = 0; j < 9; j++) {
        map[sol[cellOf[j]]] = sol[cellOf[T.sigma[s][j]]];
      }
      let self = 0;
      for (let d = 1; d <= 9; d++) if (map[d] === d) self |= 1 << (d - 1);
      syms.push({ s, M: map, self, fixed: T.fixed[s] });
    }
    return {
      syms,
      cellOf,
      rowPerm: bestQ === 0 ? [] : Array.from(q),
      colPerm: bestP === 0 ? [] : Array.from(pp),
    };
  },

  _spsAnalysisFor: (sol) => {
    const key = sol.join("");
    const cache = techniques._spsCache;
    if (cache.has(key)) return cache.get(key);
    const analysis = techniques._spsAnalyze(sol);
    if (cache.size >= techniques._spsCacheLimit) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, analysis);
    return analysis;
  },

  _spsEliminations: (analysis, sym, cand) => {
    const { cellOf } = analysis;
    const { s, M, self } = sym;
    const popcount = techniques._spsTables.popcount;
    const hit = new Uint8Array(729);
    const elims = [];
    const conjugate = [];
    const evidence = [];
    const remove = (cell, mask) => {
      let added = false;
      for (let m = cand[cell] & mask; m; m &= m - 1) {
        const d = 31 - Math.clz32(m & -m);
        const id = cell * 9 + d;
        if (!hit[id]) {
          hit[id] = 1;
          elims.push(id);
        }
        added = true;
      }
      return added;
    };
    const keep = (cell, mask) => {
      for (let m = cand[cell] & mask; m; m &= m - 1) {
        evidence.push(cell * 9 + 31 - Math.clz32(m & -m));
      }
    };

    for (const x of sym.fixed) remove(cellOf[x], ~self & 511);
    if (s !== 2) return { elims, conjugate, evidence };

    for (let i = 0; i < 3; i++) {
      const corners = [
        i * 9 + i,
        i * 9 + 8 - i,
        (8 - i) * 9 + i,
        (8 - i) * 9 + 8 - i,
      ].map((x) => cellOf[x]);
      if (corners.some((cell) => cand[cell] === 0)) continue;
      const union = corners.reduce((m, cell) => m | cand[cell], 0);
      if (popcount[union] !== 3) continue;
      let added = false;
      for (let j = 0; j < 9; j++) {
        if (j === i || j === 8 - i) continue;
        for (const x of [i * 9 + j, (8 - i) * 9 + j, j * 9 + i, j * 9 + 8 - i]) {
          if (remove(cellOf[x], self)) added = true;
        }
      }
      if (added) for (const cell of corners) keep(cell, self);
    }

    for (let R = 0; R < 4; R++) {
      for (let C = 0; C < 9; C++) {
        if (C === 4 || (R === 3 && C >= 3 && C <= 5)) continue;
        const cx = cellOf[R * 9 + C];
        const cy = cellOf[80 - R * 9 - C];
        if (cand[cx] === 0 || cand[cy] === 0) continue;
        const union = cand[cx] | cand[cy];
        if (popcount[union] !== 2 || union & self) continue;
        const a = remove(cellOf[R * 9 + 8 - C], union);
        const b = remove(cellOf[(8 - R) * 9 + C], union);
        if (a || b) {
          keep(cx, union);
          keep(cy, union);
        }
      }
    }

    const rowCnt = new Uint8Array(81);
    const colCnt = new Uint8Array(81);
    const rowPos = new Int8Array(162);
    const colPos = new Int8Array(162);
    for (let x = 0; x < 81; x++) {
      const m0 = cand[cellOf[x]];
      if (m0 === 0) continue;
      const R = (x / 9) | 0;
      const C = x % 9;
      for (let m = m0; m; m &= m - 1) {
        const d = 31 - Math.clz32(m & -m);
        const ri = R * 9 + d;
        const ci = C * 9 + d;
        if (rowCnt[ri] < 2) rowPos[ri * 2 + rowCnt[ri]] = x;
        rowCnt[ri]++;
        if (colCnt[ci] < 2) colPos[ci * 2 + colCnt[ci]] = x;
        colCnt[ci]++;
      }
    }
    const conjHit = new Uint8Array(729);
    const markConj = (cell, d) => {
      const id = cell * 9 + d;
      if (!conjHit[id]) {
        conjHit[id] = 1;
        conjugate.push(id);
      }
      if (!hit[id]) {
        hit[id] = 1;
        elims.push(id);
      }
    };
    for (let d = 0; d < 9; d++) {
      const e = M[d + 1] - 1;
      if (e === d) continue;
      for (let h = 0; h < 9; h++) {
        if (h === 4) continue;
        for (const isRow of [true, false]) {
          const idx = h * 9 + d;
          if ((isRow ? rowCnt : colCnt)[idx] !== 2) continue;
          const pos = isRow ? rowPos : colPos;
          const x1 = pos[idx * 2];
          const x2 = pos[idx * 2 + 1];
          const mirrored = isRow
            ? (x1 % 9) + (x2 % 9) === 8
            : ((x1 / 9) | 0) + ((x2 / 9) | 0) === 8;
          if (!mirrored) continue;
          let added = false;
          for (const x of [x1, x2]) {
            const cell = cellOf[x];
            if (!(cand[cell] & (1 << e))) continue;
            markConj(cell, e);
            added = true;
            const mirror = cellOf[80 - x];
            if (cand[mirror] & (1 << d)) markConj(mirror, d);
          }
          if (added) {
            evidence.push(cellOf[x1] * 9 + d, cellOf[x2] * 9 + d);
          }
        }
      }
    }
    return { elims, conjugate, evidence };
  },

  _spsMappingText: (M) => {
    const seen = new Set();
    const parts = [];
    for (let d = 1; d <= 9; d++) {
      if (seen.has(d)) continue;
      parts.push(`${d}<=>${M[d]}`);
      seen.add(d);
      seen.add(M[d]);
    }
    return parts.join(" ");
  },

  _spsBuildHint: (analysis, sym, found, board, pencils) => {
    const { s, M, self } = sym;
    const byCand = (a, b) => a - b;
    const elims = [...found.elims].sort(byCand);
    const conjugate = [...found.conjugate].sort(byCand);
    const toCand = (id) => ({
      r: Math.floor(id / 81),
      c: Math.floor(id / 9) % 9,
      num: (id % 9) + 1,
    });
    const cells = elims.map(toCand);

    const group = new Array(10).fill(-1);
    let groups = 0;
    for (let d = 1; d <= 9; d++) {
      if (group[d] !== -1) continue;
      group[d] = groups;
      group[M[d]] = groups;
      groups++;
    }
    const cellColors = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = board[r][c];
        if (v !== 0) cellColors.push({ r, c, color: group[v], mode: "add" });
      }
    }

    const fixedCells = sym.fixed.map((x) => analysis.cellOf[x]);
    const candidateColors = [];
    const colored = new Set();
    for (const cell of fixedCells) {
      const r = Math.floor(cell / 9);
      const c = cell % 9;
      if (board[r][c] !== 0) continue;
      for (const num of pencils[r][c]) {
        if (!(self & (1 << (num - 1)))) continue;
        colored.add(cell * 9 + num - 1);
        candidateColors.push({ r, c, num, color: 4 });
      }
    }
    for (const id of found.evidence) {
      if (colored.has(id)) continue;
      colored.add(id);
      candidateColors.push({ ...toCand(id), color: 1 });
    }

    const selfDigits = [];
    for (let d = 1; d <= 9; d++) if (M[d] === d) selfDigits.push(d);
    const label = t(techniques._spsLabelKeys[s]);
    const rearranged = analysis.rowPerm.length || analysis.colPerm.length;
    const permText = (perm) =>
      perm.length ? perm.map((v) => v + 1).join("") : "123456789";
    const parts = [
      t("teks_cand_s_mapping_in", label, techniques._spsMappingText(M)),
      t(
        "teks_SPS_self",
        selfDigits.join(""),
        techniques._formatCellsRC(fixedCells),
      ),
    ];
    if (conjugate.length) {
      const byDigit = new Map();
      for (const id of conjugate) {
        const num = (id % 9) + 1;
        if (!byDigit.has(num)) byDigit.set(num, []);
        byDigit.get(num).push(Math.floor(id / 9));
      }
      const text = [...byDigit]
        .map(([num, ids]) => `${techniques._formatCellsRC(ids)}<>${num}`)
        .join(", ");
      parts.push(t("teks_SPS_conjugate", text));
    }

    return {
      change: true,
      type: "remove",
      cells,
      hint: {
        name: t("teks_GSP"),
        mainInfo:
          (s === 0 || s === 1
            ? t(
                "teks_puzzle_is_diagonally_symmetric_in_the_direction",
                t(s === 0 ? "teks_top_left" : "teks_top_right"),
              )
            : s === 2
              ? t("teks_puzzle_is_centrally_symmetric")
              : t("teks_puzzle_is_sticks_symmetric", label)) +
          (rearranged
            ? " " +
              t(
                "teks_SPS_rearranged",
                permText(analysis.rowPerm),
                permText(analysis.colPerm),
              )
            : ""),
        detail: parts.join(", "),
      },
      visualPlan: {
        highlight: { digit: null, state: 0 },
        cellColors,
        candidateColors,
        candidateMarks: cells.map(({ r, c, num }) => ({
          r,
          c,
          num,
          marker: "slash",
          color: 0,
        })),
        links: [],
      },
      meta: {
        kind: "gsp",
        symmetry: techniques._spsNames[s],
        mapping: Array.from(M.subarray(1)),
        rowPerm: analysis.rowPerm.slice(),
        colPerm: analysis.colPerm.slice(),
        elims,
        conjugate,
      },
    };
  },

  gurthSymmetricalPlacement: (board, pencils, findAll = false) => {
    const none = findAll ? [] : { change: false };
    const sol = techniques._solution;
    if (!sol) return none;

    const cand = new Uint16Array(81);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const id = r * 9 + c;
        const v = board[r][c];
        if (v !== 0) {
          if (v !== sol[id]) return none;
          continue;
        }
        let m = 0;
        for (const d of pencils[r][c]) m |= 1 << (d - 1);
        if (!(m & (1 << (sol[id] - 1)))) return none;
        cand[id] = m;
      }
    }

    const analysis = techniques._spsAnalysisFor(sol);
    if (!analysis) return none;

    const results = [];
    for (const sym of analysis.syms) {
      const found = techniques._spsEliminations(analysis, sym, cand);
      if (found.elims.length === 0) continue;
      const hint = techniques._spsBuildHint(analysis, sym, found, board, pencils);
      if (!findAll) return hint;
      results.push(hint);
    }
    return findAll ? results : { change: false };
  },

  antiGurthSymmetricalPlacement: (board, pencils, findAll = false) => {
    const results = [];

    for (const key of [
      "diagonal",
      "antiDiagonal",
      "xAxis",
      "yAxis",
      "central",
    ]) {
      const symmetry = techniques._gspSymmetries[key];
      const broken = [];
      const mapping = techniques._gspBuildMapping(
        board,
        symmetry.partner,
        broken,
      );
      if (!mapping || broken.length === 0) continue;

      const empty =
        board[broken[0].r][broken[0].c] === 0 ? broken[0] : broken[1];
      const filled = empty === broken[0] ? broken[1] : broken[0];
      const num = mapping[board[filled.r][filled.c]];
      if (num === 0) continue;

      const selfPaired = techniques._gspSelfPairedDigits(mapping);
      let axisHolds = true;
      let axisRulesOutSymmetry = false;
      for (const [r, c] of symmetry.axis) {
        if (board[r][c] !== 0) {
          if (!selfPaired.has(board[r][c])) {
            axisHolds = false;
            break;
          }
          continue;
        }
        let hasSelfPaired = false;
        for (const candidate of pencils[r][c]) {
          if (selfPaired.has(candidate)) {
            hasSelfPaired = true;
            break;
          }
        }
        if (!hasSelfPaired) axisRulesOutSymmetry = true;
      }
      if (!axisHolds) continue;

      if (selfPaired.size <= symmetry.maxSelfPaired && !axisRulesOutSymmetry) {
        continue;
      }

      if (!pencils[empty.r][empty.c].has(num)) continue;

      const removals = [{ r: empty.r, c: empty.c, num }];
      const cellGroups = techniques._gspCellGroups(board, mapping);
      const result = {
        change: true,
        type: "remove",
        cells: removals,
        hint: {
          name: t("teks_anti_GSP"),
          mainInfo: t("teks_puzzle_cannot_have_symmetry", t(symmetry.labelKey)),
          detail: t(
            "teks_mapping_required_for_symmetry",
            t(symmetry.labelKey),
            techniques._gspMappingText(mapping),
          ),
        },
        visualPlan: techniques._buildGspVisualPlan(cellGroups, [], removals),
      };
      if (!findAll) return result;
      results.push(result);
    }

    return findAll ? results : { change: false };
  },
});
