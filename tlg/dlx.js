var TLE = globalThis.TLE || (globalThis.TLE = {});
var MW = 23; // 729-bit masks; the original 10-word mask stopped at 320 candidates
TLE.MW = MW;
TLE.g = TLE.g || {};
TLE.log = TLE.log || function () {};

TLE.dlx_defaults = function (g) {
  const u32 = (n) => new Uint32Array(n);
  if (g.SIW === undefined) g.SIW = MW;
  if (g.a_options === undefined) g.a_options = 0;
  if (g.g_dispmode === undefined) g.g_dispmode = 0;
  if (g.g_inode === undefined) g.g_inode = 0;
  if (g.SMASK === undefined) g.SMASK = u32(MW);
  if (g.LMASK === undefined) g.LMASK = u32(MW);
  if (g.XY === undefined) g.XY = u32(MW);
  if (g.X === undefined) g.X = u32(MW);
  if (g.PERO === undefined) g.PERO = u32(MW);
  if (g.DKILL === undefined) g.DKILL = u32(MW);
  if (g.DLIVE === undefined) g.DLIVE = u32(MW);
  if (g.kzbit === undefined) g.kzbit = new Uint8Array(729);
  if (g.fco === undefined) g.fco = new Uint8Array(326);
  if (g.Lflag === undefined) g.Lflag = new Int16Array(326);
  if (g.d_sid === undefined) g.d_sid = new Int16Array(326);
  if (g.dp_index === undefined) g.dp_index = new Int16Array(729);
  if (g.dr_index === undefined) g.dr_index = new Int16Array(736);
  if (g.ic_index === undefined) g.ic_index = new Int32Array(729);
  if (g.icode2 === undefined) g.icode2 = 0x20000003;
  if (g.p_index === undefined) g.p_index = new Int16Array(729).fill(0x2da);
  if (g.r_index === undefined) g.r_index = new Int16Array(730);
  if (g.SET === undefined) g.SET = u32(326 * MW);
  if (g.setnp === undefined) g.setnp = new Int8Array(326);
  if (g.PSET === undefined) g.PSET = Array.from({ length: 326 }, () => ({ row: 0xff, col: 0xff, digit: 0xff, box: 0xff, probs: new Int16Array(9), list9: new Int16Array(9), list: new Int16Array(10), count: 0 }));
  if (g.PROB_sets === undefined) g.PROB_sets = Array.from({ length: 729 }, () => new Int16Array(4));
  if (g.G99 === undefined) g.G99 = new Uint8Array(729);
  if (g.ssd === undefined) g.ssd = new Int16Array(4096);
  if (g.lsd === undefined) g.lsd = new Int16Array(4096);
  if (g.sudpath === undefined) g.sudpath = [];
  if (g.P === undefined) g.P = u32(1024 * MW);
  for (const k of ['dead', 'd_perms', 'd_cans', 'd_sets', 'd_rows', 'd_cols', 'chkmode', 'nP', 'nPe', 'nPo', 'nPbase',
    'soln_size', 'exitflag', 'maxmaxd', 'perm_accummed', 'nperms', 'dlx_maxcover',
    'g_kill', 'g_live', 'have_solution', 'g_assign', 'nspan', 'nset', 'nlspan', 'm_rows', 'm_cols']) {
    if (g[k] === undefined) g[k] = 0;
  }
  if (g.soln === undefined) g.soln = null;
};
TLE.dlx_defaults(TLE.g);

TLE.P_ensure = function (n) {
  const g = TLE.g;
  if ((n + 1) * MW <= g.P.length) return;
  let cap = g.P.length / MW;
  while (cap <= n) cap *= 2;
  const np = new Uint32Array(cap * MW);
  np.set(g.P);
  g.P = np;
};

// bit729: popcount of the first g_inode bits
TLE.bit729 = function (m, off) {
  const n = TLE.g.g_inode;
  let c = 0;
  const full = n >> 5;
  for (let w = 0; w < full; w++) { let v = m[off + w]; v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); c += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
  const rest = n & 31;
  if (rest) { let v = m[off + full] & ((1 << rest) - 1); v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); c += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
  return c;
};

/* @edition-slot dlx-001 */

TLE.clear_Lflags = function (mask) {
  const L = TLE.g.Lflag;
  for (let s = 0; s < 326; s++) L[s] &= ~mask;
};

TLE.DLX_clear = function (full) {
  const g = TLE.g;
  g.nPe = 0; g.nPo = 0; g.nP = 0; g.nPbase = 0;
  if (!full) return;
  g.fco.fill(0);
  g.SMASK.fill(0);
  g.LMASK.fill(0);
  g.kzbit.fill(0);
  g.dead = 0; g.d_perms = 0; g.d_cans = 0; g.d_sets = 0; g.chkmode = 0;
};

// DLX_relax: slack column for a link row
TLE.DLX_relax = function (ctx, s) {
  const g = TLE.g;
  /* @edition-slot dlx-002 */
  if (TLE.exact_declare_col(ctx, g.d_cans + 1, 1) !== 0) return 1;
  g.dr_index[g.d_cans] = -1;
  if (TLE.exact_declare_entry(ctx, g.d_sid[s], g.d_cans + 1) !== 0) return 1;
  g.d_cans += 1;
  return 0;
};

// DLX_addset: flags & 8 = link row: only SMASK candidates
TLE.DLX_addset = function (ctx, s, flags) {
  const g = TLE.g;
  if (g.d_sets + 1 >= g.d_rows) return 1;
  let list = null, nb;
  /* @edition-slot dlx-003 */
  {
    if (TLE.exact_declare_row(ctx, g.d_sets + 1, 1) !== 0) { TLE.log(0x1003, 'DLX_addset: declare_row'); return 1; }
    g.d_sid[s] = g.d_sets + 1;
    list = g.PSET[s].list;
    nb = g.PSET[s].count;
  }
  for (let i = 0; i < nb; i++) {
    let cand;
    /* @edition-slot dlx-004 */
    cand = list[i];
    /* @edition-slot dlx-005 */
    let colidx;
    if (g.ic_index[cand] === g.icode2) {
      colidx = g.dp_index[cand];
    } else {
      if (flags & 8) {
        const k = g.p_index[cand];
        if (!(g.SMASK[k >> 5] & (1 << (k & 31)))) {
          if (g.chkmode === 0) continue;
          if (!(g.DKILL[k >> 5] & (1 << (k & 31))) && !(g.DLIVE[k >> 5] & (1 << (k & 31)))) continue;
        }
      }
      g.ic_index[cand] = g.icode2;
      if (TLE.exact_declare_col(ctx, g.d_cans + 1, 1) !== 0) { TLE.log(0x1003, 'DLX_addset: declare_col'); return 1; }
      colidx = g.d_cans;
      g.dp_index[cand] = colidx;
      g.d_cans = colidx + 1;
      g.dr_index[colidx] = cand;
      if (colidx + 2 >= g.d_cols) { TLE.log(0x1003, 'DLX_addset: too many columns'); return 1; }
    }
    if (TLE.exact_declare_entry(ctx, g.d_sets + 1, colidx + 1) !== 0) { TLE.log(0x1003, 'DLX_addset: declare_entry'); return 1; }
  }
  g.d_sets += 1;
  return 0;
};

// DLX_run: enumerate permutations into P[]
TLE.DLX_run = function (ctx, flags) {
  const g = TLE.g;
  g.dlx_maxcover = 0;
  /* @edition-slot dlx-006 */
  const flag5 = (flags >> 5) & 1;
  let count = 0;
  for (;;) {
    const soln = TLE.exact_solve(ctx);
    g.soln_size = ctx.soln_size;
    g.soln = soln;
    if (!soln) {
      g.perm_accummed = g.d_perms;
      if (g.d_perms === 0) return 0x4000000;
      g.nperms = g.d_perms;
      g.sp.nperm = g.d_perms;
      return 0;
    }
    if (g.exitflag) return 0;
    /* @edition-slot dlx-007 */
    g.PERO.fill(0);
    for (let j = 0; j < g.soln_size; j++) {
      const cand = g.dr_index[soln[j] - 1];
      if (cand === -1) continue;
      const k = g.p_index[cand];
      g.PERO[k >> 5] |= 1 << (k & 31);
    }
    let nP = g.nP;
    TLE.P_ensure(nP);
    for (let w = 0; w < MW; w++) g.P[nP * MW + w] = g.PERO[w] & g.SMASK[w];
    /* @edition-slot dlx-008 */
    if (nP > 0x7ffffe) nP = g.nPbase; else nP += 1;
    g.nP = nP;
    if (g.chkmode) {
      let bad = 0;
      for (let w = 0; w < MW; w++) bad |= g.PERO[w] & g.DKILL[w];
      if (bad) return 0x8000000;
      for (let w = 0; w < MW; w++) bad |= ~g.PERO[w] & g.DLIVE[w];
      if (bad) return 0x8000000;
    }
    g.d_perms += 1;
    if (g.d_perms > g.maxmaxd) g.maxmaxd = g.d_perms;
    if (g.d_perms > 0x7ffffe) { TLE.log(0x1003, 'DLX_run: too many permutations'); return 0x20000000; }
    if (flag5 && g.d_perms > 0xc34ff) { TLE.log(0x1003, 'DLX_run: permutation limit'); return 0x20000000; }
    count += 1;
  }
};

// DLX_anal: T-mode evaluation of path i: matrix, permutations, kills, saturation
TLE.DLX_anal = function (pathIndex, flags) {
  const g = TLE.g;
  const sp = g.sudpath[pathIndex];
  g.sp = sp;
  const tstart = sp.tstart;
  const nT = sp.nT;
  const nL = sp.nL & 0xffff;
  const lstart = sp.lstart;
  const dispflag = (g.g_dispmode & 8) ? (flags & 1) : 0;
  TLE.DLX_clear(1);
  if (nT === 0) {
    sp.flags = (sp.flags | 0x1000000) >>> 0;
    return sp.flags | 0;
  }
  let overlapMode = 0;
  let ctx = null;
  const fail = () => {
    TLE.log(0x1004, 'DLX_anal: matrix error');
    sp.flags = (sp.flags | 0x20000000 | 0x1000000) >>> 0;
    if (ctx) TLE.exact_free(ctx);
    return -999999;
  };
  if (nT > 7) {
    overlapMode = 0;
    if (nT - nL > 5
      /* @edition-slot dlx-009 */
    ) {
      g.XY.fill(0);
      if (nL > 0) {
        let anyLink = false;
        const acc = new Uint32Array(MW);
        for (let i = 0; i < nL; i++) {
          const s = g.lsd[lstart + i];
          if (g.Lflag[s] >= 0) continue;
          anyLink = true;
          for (let w = 0; w < MW; w++) acc[w] |= g.SET[s * MW + w];
        }
        if (anyLink) g.XY.set(acc);
      }
      overlapMode = 1;
    }
    g.icode2 = (g.icode2 + 1) | 0;
    sp.nspan = 0;
  } else {
    g.icode2 = (g.icode2 + 1) | 0;
    sp.nspan = 0;
    g.d_cols = 0;
    if (nT <= 0) {
      g.d_cols = nL + 2;
      g.d_rows = nT + nL + 2;
      ctx = TLE.exact_alloc(g.d_rows, g.d_cols);
      return TLE.DLX_anal_links(ctx, sp, pathIndex, flags, dispflag, lstart, nL);
    }
    overlapMode = 0;
  }
  let ncols = 0;
  for (let i = 0; i < nT; i++) ncols += g.setnp[g.ssd[tstart + i]];
  g.d_cols = ncols + nL + 2;
  g.d_rows = nT + nL + 2;
  ctx = TLE.exact_alloc(g.d_rows, g.d_cols);
  let skipped = 0;
  for (let i = 0; i < nT; i++) {
    const s = g.ssd[tstart + i];
    if (overlapMode !== 0) {
      let touches = 0;
      for (let w = 0; w < MW; w++) touches |= g.SET[s * MW + w] & g.XY[w];
      if (touches === 0) {
        let overlaps = false;
        for (let j = 0; j < nT; j++) {
          if (j === i) continue;
          const t = g.ssd[tstart + j];
          let o = 0;
          for (let w = 0; w < MW; w++) o |= g.SET[s * MW + w] & g.SET[t * MW + w];
          if (o !== 0) { overlaps = true; break; }
        }
        if (!overlaps) { skipped += 1; continue; }
      }
    }
    if (TLE.DLX_addset(ctx, s, 4) !== 0) return fail();
    for (let w = 0; w < MW; w++) g.SMASK[w] |= g.SET[s * MW + w];
    if (dispflag) { const l9 = g.PSET[s].list9; for (let m = 0; m < 9; m++) g.kzbit[l9[m]] |= 0x20; }
    g.fco[s] |= 1;
  }
  if (overlapMode !== 0 || skipped !== 0) {
    if (g.d_sets <= 1) { TLE.log(0x1004, 'DLX_anal: nothing left'); sp.flags = (sp.flags | 0x20000000 | 0x1000000) >>> 0; TLE.exact_free(ctx); return -999999; }
  }
  return TLE.DLX_anal_links(ctx, sp, pathIndex, flags, dispflag, lstart, nL);
};

// DLX_anal: link rows, slack, run, kills, saturation
TLE.DLX_anal_links = function (ctx, sp, pathIndex, flags, dispflag, lstart, nL) {
  const g = TLE.g;
  const fail = () => {
    TLE.log(0x1004, 'DLX_anal: matrix error');
    sp.flags = (sp.flags | 0x20000000 | 0x1000000) >>> 0;
    TLE.exact_free(ctx);
    return -999999;
  };
  for (let i = 0; i < nL; i++) {
    const s = g.lsd[lstart + i];
    if (g.Lflag[s] >= 0) continue;
    for (let w = 0; w < MW; w++) g.LMASK[w] |= g.SET[s * MW + w];
    if (TLE.DLX_addset(ctx, s, 8) !== 0) return fail();
    g.fco[s] |= 0xa;
    sp.nspan = (sp.nspan + 1) & 0xffff;
    if (dispflag) { const l9 = g.PSET[s].list9; for (let m = 0; m < 9; m++) g.kzbit[l9[m]] |= 0x10; }
  }
  for (let i = 0; i < nL; i++) {
    const s = g.lsd[lstart + i];
    if (g.Lflag[s] >= 0) continue;
    if (TLE.DLX_relax(ctx, s) !== 0) return fail();
  }
  if (g.d_cans >= g.d_cols) TLE.log(0x1003, 'DLX_anal: columns at limit');
  if (g.d_sets >= g.d_rows) TLE.log(0x1003, 'DLX_anal: rows at limit');
  const r = TLE.DLX_run(ctx, flags);
  if (r === 0x20000000) return fail();
  if (g.exitflag) { TLE.exact_free(ctx); return g.exitflag; }
  sp.ncand = TLE.bit729(g.SMASK, 0);
  /* @edition-slot dlx-010 */
  if (g.d_perms === 0) {
    TLE.log(0x1004, 'DLX_anal: Illegal Logic');
    /* @edition-slot dlx-011 */
    sp.flags = (sp.flags | 0x80000000) >>> 0;
    TLE.exact_free(ctx);
    return -999999;
  }
  /* @edition-slot dlx-012 */
  TLE.PB_mark_dead(sp, dispflag);
  /* @edition-slot dlx-013 */
  if (flags !== 0) {
    sp.nlsat = TLE.PB_saturate(g.lsd, lstart, nL);
    /* @edition-slot dlx-014 */
  }
  TLE.exact_free(ctx);
  return 0;
};

TLE.anal_path = function (pathIndex, flags) {
  const g = TLE.g;
  if (flags) g.exitflag = 0;
  const sp = g.sudpath[pathIndex];
  sp.flags = (sp.flags & 0x90000) >>> 0;
  sp.nkill = 0; sp.nlive = 0; sp.ndkill = 0; sp.nperm = 0;
  /* @edition-slot dlx-015 */
  TLE.clear_Lflags(0x4000);
  return TLE.DLX_anal(pathIndex, flags);
};
