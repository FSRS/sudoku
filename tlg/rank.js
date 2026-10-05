var TLE = globalThis.TLE || (globalThis.TLE = {});
var MW = 23;
TLE.g = TLE.g || {};
TLE.log = TLE.log || function () {};

TLE.rank_defaults = function (g) {
  if (g.nset === undefined) g.nset = 0;
  if (g.nspan === undefined) g.nspan = 0;
  if (g.nlspan === undefined) g.nlspan = 0;
  if (!g.lspan) g.lspan = new Int16Array(400);
  if (!g.Ps) g.Ps = new Uint8Array(9);
  if (g.overlap === undefined) g.overlap = 0;
  if (!g.CMASK) g.CMASK = new Uint32Array(MW);
  if (!g.SMASK) g.SMASK = new Uint32Array(MW);
  if (!g.SET) g.SET = new Uint32Array(326 * MW);
  if (!g.fco) g.fco = new Uint8Array(326);
  if (!g.setnp) g.setnp = new Int8Array(326);
  if (!g.Lflag) g.Lflag = new Int16Array(326);
  if (!g.PSET) {
    g.PSET = new Array(326);
    for (let s = 0; s < 326; s++) {
      g.PSET[s] = { row: 0, col: 0, digit: 0, box: 0xff, probs: new Int32Array(9), list9: new Int32Array(9), list: new Int32Array(10), count: 0 };
    }
  }
  if (!g.PROB_sets) {
    g.PROB_sets = new Array(729);
    for (let c = 0; c < 729; c++) g.PROB_sets[c] = new Int16Array(4);
  }
  if (!g.ssd) g.ssd = new Int16Array(40000);
  if (!g.lsd) g.lsd = new Int16Array(200000);
  if (g.exitflag === undefined) g.exitflag = 0;
  if (g.icode2 === undefined) g.icode2 = 0x20000003;
  if (g.dlx_maxcover === undefined) g.dlx_maxcover = 0;
  if (g.d_covers === undefined) g.d_covers = 0;
  if (g.d_mincover === undefined) g.d_mincover = 0;
  if (g.d_rows === undefined) g.d_rows = 0;
  if (g.d_cols === undefined) g.d_cols = 0;
  if (g.d_cans === undefined) g.d_cans = 0;
  if (g.d_sets === undefined) g.d_sets = 0;
  if (!g.r_sid) g.r_sid = new Int16Array(336);
  if (!g.d_sid) g.d_sid = new Int16Array(336);
  if (g.soln === undefined) g.soln = null;
  if (g.soln_size === undefined) g.soln_size = 0;
  if (!g.Xcover4) g.Xcover4 = new Uint32Array(1000 * 8);
  if (!g.Xcover8) g.Xcover8 = new Uint32Array(1000 * 16);
  if (!g.Xcover) g.Xcover = g.Xcover4;
  if (g.pb_nsol === undefined) g.pb_nsol = 0;
  if (g.pb_64ls === undefined) g.pb_64ls = 0;
  if (g.pb_128ls === undefined) g.pb_128ls = 0;
  if (g._show === undefined) g._show = 0;
  if (g.nsols === undefined) g.nsols = 0;
  if (!g.xqset) g.xqset = new Int16Array(112);
  if (!g.xqlev) g.xqlev = new Int16Array(112);
  if (!g.Xsets) g.Xsets = new Int16Array(128);
  if (!g.xqsma) g.xqsma = new Uint32Array(100 * 2);
  if (!g.xqsma4) g.xqsma4 = new Uint32Array(100 * 8);
  if (!g.xqcov) g.xqcov = new Uint32Array(100 * MW);
  if (!g.USMAP) g.USMAP = new Uint32Array(2);
  if (!g.USMAP4) g.USMAP4 = new Uint32Array(8);
  if (!g.USMAP8) g.USMAP8 = new Uint32Array(16);
  if (!g.XMASK) g.XMASK = new Uint32Array(256 * MW);
  if (!g.T) g.T = new Uint32Array(MW);
  if (!g.D) g.D = new Uint32Array(MW);
  if (!g.S) g.S = new Uint32Array(MW);
  if (!g.SUM) g.SUM = new Uint32Array(MW);
  if (!g.COVER) g.COVER = new Uint32Array(MW);
  if (g.nclet === undefined) g.nclet = 0;
  if (!g.clets) g.clets = new Int16Array(608);
};

const rk_A = new Uint32Array(MW);
const rk_B = new Uint32Array(MW);
const rk_C = new Uint32Array(MW);
const rk_M = new Uint32Array(MW);
const rk_SC = new Uint32Array(MW);
const rk_SU = new Uint32Array(8);

function rk_any(m) {
  let a = 0;
  for (let w = 0; w < MW; w++) a |= m[w];
  return a !== 0;
}

function rk_eq(a, ao, b, bo, n) {
  for (let w = 0; w < n; w++) if (a[ao + w] !== b[bo + w]) return false;
  return true;
}

function rk_hit32(map, i) {
  const q = i >> 5, b = i & 31;
  return (map[2 * q] & (1 << b)) !== 0 || (b === 31 && (map[2 * q + 1] | 0) !== 0);
}

function rk_set32(map, i) {
  const q = i >> 5, b = i & 31;
  map[2 * q] |= (1 << b);
  if (b === 31) map[2 * q + 1] |= 0xffffffff;
}

function rk_xmask(lspan, nlspan) {
  const g = TLE.g, XMASK = g.XMASK, SMASK = g.SMASK, SET = g.SET;
  for (let i = 0; i < nlspan; i++) {
    const s = lspan[i], so = s * MW, xo = i * MW;
    for (let w = 0; w < MW; w++) XMASK[xo + w] = SMASK[w] & SET[so + w];
  }
}

function rk_target() {
  const g = TLE.g;
  if (rk_any(g.S)) return g.S;
  if (rk_any(g.D)) return g.D;
  return g.T;
}

function rk_over(nlspan, used) {
  const g = TLE.g, XMASK = g.XMASK;
  const A = rk_A, B = rk_B, C = rk_C;
  A.fill(0); B.fill(0); C.fill(0);
  for (let i = 0; i < nlspan; i++) {
    if (used(i)) continue;
    const o = i * MW;
    for (let w = 0; w < MW; w++) {
      const x = XMASK[o + w];
      C[w] |= B[w] & x;
      B[w] |= A[w] & x;
      A[w] |= x;
    }
  }
  const COVER = g.COVER, SUM = g.SUM, S = g.S, D = g.D, T = g.T;
  let any = 0;
  for (let w = 0; w < MW; w++) {
    const nc = ~COVER[w];
    const sum = A[w] & nc;
    SUM[w] = sum;
    S[w] = sum & ~B[w];
    D[w] = B[w] & ~C[w] & nc;
    T[w] = C[w] & nc;
    any |= sum;
  }
  return any === 0 ? 1 : 0;
}

TLE.get_rank_cover = function (sp, flag) {
  const g = TLE.g;
  if (sp.nT > 25) return -1;
  sp.flags = (sp.flags | 0x40000) >>> 0;
  g.overlap = 0;
  if (g.nset === 1) {
    if (g.Ps[1] === 1) return 0;
  }
  const d = (g.nspan - g.nset) | 0;
  if (d === 0) return 0;
  if (g.nset <= 1) return d;
  let r = TLE.DLX_cover_sp(sp, flag);
  if (r !== 0) return (r - g.nset) | 0;
  g.overlap = 1;
  if (flag !== 0) return -1;
  r = TLE.PB_cover_easy(sp, g.CMASK, g.lspan, g.nlspan, 0, d);
  if (r === -1) return -1;
  if (r !== 0) return (r - g.nset) | 0;
  if (d > 8) return -1;
  return d;
};

TLE.DLX_cover_sp = function (sp, flag) {
  const g = TLE.g;
  return TLE.DLX_cover(g.ssd, sp.tstart, sp.nT, g.lsd, sp.lstart, sp.nL, flag);
};

TLE.DLX_cover = function (ssd, tstart, nT, lsd, lstart, nL, flag) {
  const g = TLE.g, fco = g.fco, setnp = g.setnp;
  g.icode2 = (g.icode2 + 1) | 0;
  g.d_covers = 0;
  g.d_mincover = 0x3e7;
  fco.fill(0);
  g.d_rows = 0;
  let nrows;
  if (nT > 0) {
    let c = 0;
    for (let i = 0; i < nT; i++) {
      const s = ssd[tstart + i];
      fco[s] |= 1;
      c = (c + setnp[s]) | 0;
    }
    nrows = (c + 1) | 0;
  } else {
    nrows = 1;
  }
  g.d_rows = nrows;
  let ncols;
  if (nL > 0) {
    let n = 0;
    for (let a = 0; a < nL; a++) {
      const s = lsd[lstart + a];
      if (g.Lflag[s] < 0) {
        fco[s] |= 2;
        n = (n + 1) | 0;
      }
    }
    ncols = (n + 1) | 0;
  } else {
    ncols = 1;
  }
  g.d_cols = ncols;
  const ctx = TLE.exact_alloc(nrows, ncols);
  g.dlx_maxcover = (flag + nT) | 0;
  g.d_cans = 0;
  g.d_sets = 0;
  for (let i = 0; i < nT; i++) {
    const s = ssd[tstart + i];
    const cnt = setnp[s];
    const probs = g.PSET[s].probs;
    for (let j = 0; j < cnt; j++) {
      const cand = probs[j];
      TLE.exact_declare_row(ctx, g.d_sets + 1, 1);
      const sets = g.PROB_sets[cand];
      for (let q = 0; q < 4; q++) {
        const s2 = sets[q];
        const f = fco[s2];
        if (f & 1) continue;
        if (!(f & 2)) continue;
        let col;
        if (!(f & 0x10)) {
          TLE.exact_declare_col(ctx, g.d_cans + 1, 1);
          fco[s2] |= 0x10;
          col = g.d_cans;
          g.r_sid[col] = s2;
          g.d_sid[s2] = col;
          g.d_cans = (col + 1) | 0;
          if (!(g.d_cans < g.d_cols)) TLE.log(0x1003, 'DLX_cover: cover set count exceeds d_cols');
        } else {
          col = g.d_sid[s2];
        }
        TLE.exact_declare_entry(ctx, g.d_sets + 1, col + 1);
      }
      g.d_sets = (g.d_sets + 1) | 0;
    }
  }
  for (;;) {
    const res = TLE.exact_solve(ctx);
    g.soln = res;
    if (res === null) break;
    g.soln_size = ctx.soln_size;
    g.d_covers = (g.d_covers + 1) | 0;
    if (g.soln_size < g.d_mincover) g.d_mincover = g.soln_size;
  }
  TLE.exact_free(ctx);
  g.dlx_maxcover = 0;
  return g.d_covers !== 0 ? g.d_mincover : 0;
};

TLE.PB_cover_easy = function (sp, cmask, lspan, nlspan, kstart, kend) {
  const g = TLE.g;
  const nT = sp.nT;
  g.Xcover = g.Xcover4;
  for (let w = 0; w < MW; w++) g.SMASK[w] = cmask[w];
  g.pb_nsol = 0;
  g.pb_64ls = 0;
  g.pb_128ls = 0;
  if (nlspan > 0x7f) g.pb_128ls = 1;
  else if (nlspan > 0x3f) g.pb_64ls = 1;
  let k = kstart;
  let size = (nT + kstart) | 0;
  while (k <= kend) {
    let r;
    if (g.pb_128ls !== 0) r = TLE.PB_cover_path8(lspan, nlspan, size, 1);
    else if (g.pb_64ls !== 0) r = TLE.PB_cover_path4(lspan, nlspan, size, 1);
    else r = TLE.PB_cover_path(lspan, nlspan, size, 1);
    if (r === -1) {
      TLE.log(0, 'PB_cover_easy: cover path returned ' + r);
      return r;
    }
    if (g.nsols > 0) return (nT + k) | 0;
    k = (k + 1) | 0; size = (size + 1) | 0;
  }
  return g.nsols !== 0 ? (nT + k) | 0 : 0;
};

TLE.PB_cover_path = function (lspan, nlspan, size, maxsol) {
  const g = TLE.g, XMASK = g.XMASK, SMASK = g.SMASK, COVER = g.COVER, USMAP = g.USMAP;
  if (nlspan > 0x40) {
    TLE.log(0x1003, 'PB_cover_path: more than 64 link sets');
    g.nsols = 0;
    return 0;
  }
  const xqsma = g.xqsma, xqcov = g.xqcov, xqset = g.xqset, xqlev = g.xqlev, Xsets = g.Xsets;
  const M = rk_M, SC = rk_SC;
  const used = (i) => (i < 32 ? (USMAP[0] & (1 << i)) !== 0 : i < 64 ? (USMAP[1] & (1 << (i - 32))) !== 0 : false);
  rk_xmask(lspan, nlspan);
  USMAP[0] = 0; USMAP[1] = 0;
  COVER.fill(0);
  let nq = 0, level = -1, qi = 0;
  TLE.get_over_nodes(nlspan, 0);
  g.nsols = 0;
  let minlev = 0x3e6, npush = 0;
  let expand = true, ok = true;
  for (;;) {
    if (expand) {
      if (TLE.get_over_nodes(nlspan, 0) === 0) {
        const tgt = rk_target();
        if (nlspan > 0) {
          level = (level + 1) | 0;
          const u0 = USMAP[0], u1 = USMAP[1];
          for (let w = 0; w < MW; w++) SC[w] = COVER[w];
          for (let i = 0; i < nlspan; i++) {
            if (used(i)) continue;
            const xo = i * MW;
            let any = 0;
            for (let w = 0; w < MW; w++) { M[w] = tgt[w] & XMASK[xo + w]; any |= M[w]; }
            if (any === 0) continue;
            npush = (npush + 1) | 0;
            nq = (nq + 1) | 0;
            for (let w = 0; w < MW; w++) tgt[w] = M[w];
            xqsma[qi * 2] = u0; xqsma[qi * 2 + 1] = u1;
            for (let w = 0; w < MW; w++) xqcov[qi * MW + w] = SC[w];
            xqset[qi] = i;
            xqlev[qi] = level;
            qi = nq;
          }
        }
      }
      ok = npush <= 0x2faf07f;
      expand = false;
    }
    if (nq === 0 || !ok) {
      if (npush <= 0x2faf07f) return (minlev + 1) | 0;
      TLE.log(0, 'PB_cover_path: push count ' + npush + ' exceeds ' + 0x2faf080);
      TLE.log(0x1001, 'PB_cover_path: search aborted');
      return -1;
    }
    if (g.exitflag !== 0) return -1;
    nq = (nq - 1) | 0;
    qi = nq;
    level = xqlev[qi];
    const set = xqset[qi];
    USMAP[0] = xqsma[qi * 2]; USMAP[1] = xqsma[qi * 2 + 1];
    for (let w = 0; w < MW; w++) COVER[w] = xqcov[qi * MW + w];
    if (level >= size) continue;
    Xsets[level] = set;
    const xo = set * MW;
    for (let w = 0; w < MW; w++) COVER[w] |= XMASK[xo + w];
    const b = set & 63;
    if (b < 32) USMAP[0] |= (1 << b); else USMAP[1] |= (1 << (b - 32));
    if (!rk_eq(COVER, 0, SMASK, 0, MW)) { expand = true; continue; }
    let n = (g.pb_nsol + g.nsols) | 0;
    if (n > 0) {
      let dup = false;
      for (let j = 0; j < n; j++) {
        if (g.Xcover[2 * j] === USMAP[0] && g.Xcover[2 * j + 1] === USMAP[1]) { dup = true; break; }
      }
      if (dup) continue;
    }
    g.Xcover[2 * n] = USMAP[0]; g.Xcover[2 * n + 1] = USMAP[1];
    if (minlev > level) minlev = level;
    if (g._show !== 0) {
      TLE.PB_show_cover(lspan, level);
      n = (g.pb_nsol + g.nsols) | 0;
    }
    g.nsols = (g.nsols + 1) | 0;
    if (n > 0x3e6) return (minlev + 1) | 0;
    maxsol = (maxsol - 1) | 0;
    if (maxsol > 0) continue;
    return (minlev + 1) | 0;
  }
};

TLE.PB_cover_path4 = function (lspan, nlspan, size, maxsol) {
  const g = TLE.g, XMASK = g.XMASK, SMASK = g.SMASK, COVER = g.COVER, USMAP4 = g.USMAP4;
  if (nlspan > 0x80) {
    TLE.log(0x1004, 'PB_cover_path4: more than 128 link sets');
    g.nsols = 0;
    return 0;
  }
  const xqsma4 = g.xqsma4, xqcov = g.xqcov, xqset = g.xqset, xqlev = g.xqlev, Xsets = g.Xsets, Xcover4 = g.Xcover4;
  const M = rk_M, SC = rk_SC, SU = rk_SU;
  const used = (i) => rk_hit32(USMAP4, i);
  rk_xmask(lspan, nlspan);
  USMAP4.fill(0);
  COVER.fill(0);
  let nq = 0, level = -1, qi = 0;
  TLE.get_over_nodes(nlspan, 1);
  g.nsols = 0;
  let minlev = 0x3e6, npush = 0;
  let expand = true, ok = true;
  for (;;) {
    if (expand) {
      if (TLE.get_over_nodes(nlspan, 1) === 0) {
        const tgt = rk_target();
        if (nlspan > 0) {
          level = (level + 1) | 0;
          for (let w = 0; w < 8; w++) SU[w] = USMAP4[w];
          for (let w = 0; w < MW; w++) SC[w] = COVER[w];
          for (let i = 0; i < nlspan; i++) {
            if (used(i)) continue;
            const xo = i * MW;
            let any = 0;
            for (let w = 0; w < MW; w++) { M[w] = tgt[w] & XMASK[xo + w]; any |= M[w]; }
            if (any === 0) continue;
            npush = (npush + 1) | 0;
            nq = (nq + 1) | 0;
            for (let w = 0; w < MW; w++) tgt[w] = M[w];
            for (let w = 0; w < 8; w++) xqsma4[qi * 8 + w] = SU[w];
            for (let w = 0; w < MW; w++) xqcov[qi * MW + w] = SC[w];
            xqset[qi] = i;
            xqlev[qi] = level;
            qi = nq;
          }
        }
      }
      ok = npush <= 0x2faf07f;
      expand = false;
    }
    if (nq === 0 || !ok) {
      if (npush > 0x2faf07f) {
        TLE.log(0x1004, 'PB_cover_path4: push count exceeds limit');
        return -1;
      }
      return (minlev + 1) | 0;
    }
    if (g.exitflag !== 0) return -1;
    nq = (nq - 1) | 0;
    qi = nq;
    level = xqlev[qi];
    const set = xqset[qi];
    for (let w = 0; w < MW; w++) COVER[w] = xqcov[qi * MW + w];
    for (let w = 0; w < 8; w++) USMAP4[w] = xqsma4[qi * 8 + w];
    if (level >= size) continue;
    Xsets[level] = set;
    const xo = set * MW;
    for (let w = 0; w < MW; w++) COVER[w] |= XMASK[xo + w];
    rk_set32(USMAP4, set);
    if (!rk_eq(COVER, 0, SMASK, 0, MW)) { expand = true; continue; }
    let n = (g.pb_nsol + g.nsols) | 0;
    if (n > 0) {
      let dup = false;
      for (let j = 0; j < n; j++) {
        if (rk_eq(Xcover4, j * 8, USMAP4, 0, 8)) { dup = true; break; }
      }
      if (dup) continue;
    }
    for (let w = 0; w < 8; w++) Xcover4[n * 8 + w] = USMAP4[w];
    if (minlev > level) minlev = level;
    if (g._show !== 0) {
      TLE.PB_show_cover(lspan, level);
      n = (g.pb_nsol + g.nsols) | 0;
    }
    g.nsols = (g.nsols + 1) | 0;
    if (n > 0x3e6) return (minlev + 1) | 0;
    maxsol = (maxsol - 1) | 0;
    if (maxsol > 0) continue;
    return (minlev + 1) | 0;
  }
};

TLE.PB_cover_path8 = function (lspan, nlspan, size, maxsol) {
  const g = TLE.g, XMASK = g.XMASK, SMASK = g.SMASK, COVER = g.COVER, USMAP8 = g.USMAP8;
  if (nlspan > 0x100) {
    TLE.log(0x1004, 'PB_cover_path8: more than 256 link sets');
    g.nsols = 0;
    return 0;
  }
  const xqsma4 = g.xqsma4, xqcov = g.xqcov, xqset = g.xqset, xqlev = g.xqlev, Xsets = g.Xsets, Xcover8 = g.Xcover8;
  const M = rk_M, SC = rk_SC;
  rk_xmask(lspan, nlspan);
  const i0 = USMAP8[14], i1 = USMAP8[15];
  for (let q = 0; q < 7; q++) { USMAP8[2 * q] = i0; USMAP8[2 * q + 1] = i1; }
  COVER.fill(0);
  let nq = 0, level = -1, qi = 0;
  TLE.get_over_nodes8(nlspan);
  g.nsols = 0;
  let minlev = 0x3e6, npush = 0;
  let expand = true, ok = true;
  for (;;) {
    if (expand) {
      if (TLE.get_over_nodes8(nlspan) === 0) {
        const tgt = rk_target();
        if (nlspan > 0) {
          const lev = (level + 1) | 0;
          for (let w = 0; w < MW; w++) SC[w] = COVER[w];
          for (let i = 0; i < nlspan; i++) {
            if (rk_hit32(USMAP8, i)) continue;
            const xo = i * MW;
            let any = 0;
            for (let w = 0; w < MW; w++) { M[w] = tgt[w] & XMASK[xo + w]; any |= M[w]; }
            if (any === 0) continue;
            npush = (npush + 1) | 0;
            nq = (nq + 1) | 0;
            for (let w = 0; w < MW; w++) tgt[w] = M[w];
            for (let w = 0; w < MW; w++) xqcov[qi * MW + w] = SC[w];
            xqset[qi] = i;
            xqlev[qi] = lev;
            qi = nq;
          }
        }
      }
      ok = npush <= 0x2faf07f;
      expand = false;
    }
    if (nq === 0 || !ok) {
      if (npush > 0x2faf07f) {
        TLE.log(0x1004, 'PB_cover_path8: push count exceeds limit');
        return -1;
      }
      return (minlev + 1) | 0;
    }
    if (g.exitflag !== 0) return -1;
    nq = (nq - 1) | 0;
    qi = nq;
    level = xqlev[qi];
    const set = xqset[qi];
    for (let w = 0; w < MW; w++) COVER[w] = xqcov[qi * MW + w];
    for (let w = 0; w < 8; w++) USMAP8[w] = xqsma4[qi * 8 + w];
    if (level >= size) continue;
    Xsets[level] = set;
    const xo = set * MW;
    for (let w = 0; w < MW; w++) COVER[w] |= XMASK[xo + w];
    rk_set32(USMAP8, set);
    if (!rk_eq(COVER, 0, SMASK, 0, MW)) { expand = true; continue; }
    let n = (g.pb_nsol + g.nsols) | 0;
    if (n > 0) {
      let dup = false;
      for (let j = 0; j < n; j++) {
        if (rk_eq(Xcover8, j * 16, USMAP8, 0, 16)) { dup = true; break; }
      }
      if (dup) continue;
    }
    for (let w = 0; w < 16; w++) Xcover8[n * 16 + w] = USMAP8[w];
    if (minlev > level) minlev = level;
    if (g._show !== 0) {
      TLE.PB_show_cover(lspan, level);
      n = (g.pb_nsol + g.nsols) | 0;
    }
    g.nsols = (g.nsols + 1) | 0;
    if (n > 0x3e6) return (minlev + 1) | 0;
    maxsol = (maxsol - 1) | 0;
    if (maxsol > 0) continue;
    return (minlev + 1) | 0;
  }
};

TLE.get_over_nodes = function (nlspan, mode) {
  const g = TLE.g;
  const USMAP = g.USMAP, USMAP4 = g.USMAP4;
  const used = mode !== 0
    ? (i) => rk_hit32(USMAP4, i)
    : (i) => { const b = i & 63; return b < 32 ? (USMAP[0] & (1 << b)) !== 0 : (USMAP[1] & (1 << (b - 32))) !== 0; };
  return rk_over(nlspan, used);
};

TLE.get_over_nodes8 = function (nlspan) {
  const g = TLE.g;
  const USMAP8 = g.USMAP8;
  return rk_over(nlspan, (i) => rk_hit32(USMAP8, i));
};

TLE.PB_show_cover = function (lspan, level) {
  const g = TLE.g;
  TLE.log(0x1000, 'Cover ' + level);
  if (level >= 0) {
    for (let i = 0; i <= level; i++) {
      const s = lspan[g.Xsets[i]];
      let name = String(s);
      /* @edition-slot rank-001 */
      TLE.log(((s / 81) | 0) | 0x1000, ' ' + name);
    }
  }
  TLE.log(0x1000, '');
};

TLE.PB_retrieve_cover = function (n) {
  const g = TLE.g;
  if (g.pb_nsol < n) return;
  const nclet = g.nclet;
  if (nclet <= 0) return;
  for (let i = 0; i < nclet; i++) {
    const s = g.clets[i];
    let hit;
    if (g.pb_64ls === 0) {
      const b = i & 63;
      hit = b < 32 ? (g.Xcover[2 * n] & (1 << b)) !== 0 : (g.Xcover[2 * n + 1] & (1 << (b - 32))) !== 0;
    } else {
      const q = i >> 5, b = i & 31;
      hit = (g.Xcover4[8 * n + 2 * q] & (1 << b)) !== 0 || (b === 31 && g.Xcover4[8 * n + 2 * q + 1] !== 0);
    }
    if (hit) g.Lflag[s] |= 0x8000;
    else g.Lflag[s] &= 0x7fff;
  }
};
TLE.rank_defaults(TLE.g);
