var TLE = globalThis.TLE || (globalThis.TLE = {});
TLE.g = TLE.g || {};
TLE.log = TLE.log || function () {};

// exact_alloc: rows = items to cover, cols = options
TLE.exact_alloc = function (nrows, ncols) {
  const g = TLE.g;
  g.m_cols = ncols;
  g.m_rows = nrows;
  const nn = 1 + (nrows + ncols + 2) + (nrows + 1) * (ncols + 1);
  const ctx = {
    nodes: {
      L: new Int32Array(nn), R: new Int32Array(nn), U: new Int32Array(nn), D: new Int32Array(nn),
      ROW: new Int32Array(nn), COL: new Int32Array(nn), ID: new Int32Array(nn), SIZE: new Int32Array(nn), COUNT: new Int32Array(nn),
    },
    hdrBase: 1,
    entBase: 1 + (nrows + ncols + 2),
    rowTable: new Int32Array(nrows + 2),
    colTable: new Int32Array(ncols + 2),
    declared: new Uint8Array((nrows + 2) * (ncols + 2)),
    pushlist: new Int32Array(ncols * 2 + 4),
    stack: new Int32Array(nrows * 2 + ncols + 4),
    levels: new Int32Array(nrows * 2 + ncols + 4),
    filtered: new Int32Array((nrows + 2) * (ncols + 2)),
  };
  TLE.exact_reset(ctx);
  return ctx;
};

TLE.exact_reset = function (ctx) {
  const g = TLE.g, N = ctx.nodes;
  ctx.ncol = 0; ctx.nrow = 0; ctx.npush = 0; ctx.nrow2 = 0; ctx.flag7c = 1;
  ctx.m_rows = g.m_rows; ctx.m_cols = g.m_cols;
  ctx.nhdr = 0; ctx.nent = 0;
  ctx.declOpen = 1; ctx.solving = 0; ctx.busy = 0; ctx.savedDepth = 0;
  ctx.rowTable.fill(-1); ctx.colTable.fill(-1); ctx.declared.fill(0);
  ctx.solCb = null; ctx.solData = null; ctx.filterCb = null; ctx.filterData = null;
  ctx.best = -1; ctx.minsize = 0; ctx.soln_size = 0;
  N.L[0] = N.R[0] = N.U[0] = N.D[0] = 0; N.ROW[0] = 0; N.COL[0] = 0; N.ID[0] = 0; N.SIZE[0] = 0; N.COUNT[0] = 0;
};

TLE.exact_free = function (ctx) {};

// exact_declare_row: item; count = times it must be covered
TLE.exact_declare_row = function (ctx, id, count) {
  const N = ctx.nodes;
  if (!ctx.declOpen) return 0x10;
  if (id < 0 || id > TLE.g.m_rows) return 0x16;
  if (ctx.rowTable[id] !== -1) return 0x11;
  const n = ctx.hdrBase + ctx.nhdr++;
  N.ID[n] = id; N.SIZE[n] = 0; N.COUNT[n] = count;
  ctx.rowTable[id] = n;
  N.ROW[n] = n; N.U[n] = N.U[0]; N.COL[n] = 0; N.L[n] = n; N.R[n] = n; N.D[n] = 0;
  N.D[N.U[0]] = n; N.U[0] = n;
  ctx.nrow += 1;
  ctx.nrow2 += 1;
  return ctx.nrow2 <= ctx.m_rows ? 0 : 0xc;
};

// exact_declare_col: option; count = times it may be chosen
TLE.exact_declare_col = function (ctx, id, count) {
  const N = ctx.nodes;
  if (!ctx.declOpen) return 0x10;
  if (id < 0 || id > TLE.g.m_cols) return 0x16;
  if (ctx.colTable[id] !== -1) return 0x11;
  const n = ctx.hdrBase + ctx.nhdr++;
  N.ID[n] = id; N.SIZE[n] = 0; N.COUNT[n] = count;
  ctx.colTable[id] = n;
  N.ROW[n] = 0; N.L[n] = N.L[0]; N.COL[n] = n; N.U[n] = n; N.D[n] = n; N.R[n] = 0;
  N.R[N.L[0]] = n; N.L[0] = n;
  ctx.ncol += 1;
  return ctx.ncol <= ctx.m_cols ? 0 : 0xc;
};

TLE.exact_declare_entry = function (ctx, rowid, colid) {
  const g = TLE.g, N = ctx.nodes;
  if (!ctx.declOpen) return 0x10;
  if (rowid < 0 || rowid > g.m_rows) return 0x16;
  if (colid < 0 || colid > g.m_cols) return 0x16;
  const idx = rowid * g.m_cols + colid;
  if (ctx.declared[idx]) return 0x11;
  const row = ctx.rowTable[rowid];
  if (row === -1) return 2;
  const col = ctx.colTable[colid];
  if (col === -1) return 2;
  N.SIZE[row] += 1; N.SIZE[col] += 1;
  const e = ctx.entBase + ctx.nent++;
  N.L[e] = N.L[row]; N.ROW[e] = row; N.COL[e] = col; N.R[e] = row;
  N.R[N.L[row]] = e; N.L[row] = e;
  N.D[e] = col; N.U[e] = N.U[col];
  N.D[N.U[col]] = e; N.U[col] = e;
  ctx.declared[idx] = 1;
  return 0;
};

// exact_push: force an option before solving
TLE.exact_push = function (ctx, colid) {
  const N = ctx.nodes;
  if (ctx.solving) return 0x10;
  if (colid < 0 || colid > TLE.g.m_cols) return 0x16;
  const col = ctx.colTable[colid];
  if (col === -1) return 2;
  if (N.R[N.L[col]] !== col) return 0x16;
  if (N.SIZE[col] === 0) return 0x16;
  ctx.pushlist[ctx.npush++] = colid;
  TLE.push_col_update(ctx, N.ROW[col], col, 0);
  ctx.declOpen = 0;
  return 0;
};

// push_col_update: cover: choose option colhdr once
TLE.push_col_update = function (ctx, rowhdr, colhdr, flag) {
  const N = ctx.nodes;
  ctx.minsize = flag ? N.SIZE[rowhdr] + 1 : 0;
  ctx.best = -1;
  let done = (--N.COUNT[colhdr] === 0) ? 1 : 0;
  let ret = 0;
  const hide = (d) => {
    const it = N.ROW[d];
    const sz = --N.SIZE[it];
    if (sz === 0) ret = 1;
    if (sz < ctx.minsize) { ctx.minsize = sz; ctx.best = it; }
    N.R[N.L[d]] = N.R[d]; N.L[N.R[d]] = N.L[d];
  };
  for (let e = N.D[colhdr]; e !== colhdr; e = N.D[e]) {
    const it = N.ROW[e];
    if (--N.COUNT[it] !== 0) continue;
    N.D[N.U[it]] = N.D[it]; N.U[N.D[it]] = N.U[it];
    for (let b = N.R[e]; b !== e; b = N.R[b]) {
      if (b === it) continue;
      const c = N.COL[b];
      for (let d = N.D[b]; d !== c; d = N.D[d]) hide(d);
      N.R[N.L[c]] = N.R[c]; N.L[N.R[c]] = N.L[c];
      for (let d = N.D[c]; d !== b; d = N.D[d]) hide(d);
    }
    done = 1;
  }
  if (done) {
    N.R[N.L[colhdr]] = N.R[colhdr]; N.L[N.R[colhdr]] = N.L[colhdr];
    for (let d = N.D[colhdr]; d !== colhdr; d = N.D[d]) {
      N.SIZE[N.ROW[d]] -= 1;
      N.R[N.L[d]] = N.R[d]; N.L[N.R[d]] = N.L[d];
    }
  }
  return ret;
};

// pop_col_update: uncover
TLE.pop_col_update = function (ctx, colhdr) {
  const N = ctx.nodes;
  const unhide = (d) => { N.R[N.L[d]] = d; N.L[N.R[d]] = d; N.SIZE[N.ROW[d]] += 1; };
  if (N.L[N.R[colhdr]] !== colhdr) {
    for (let a = N.U[colhdr]; a !== colhdr; a = N.U[a]) unhide(a);
    N.R[N.L[colhdr]] = colhdr; N.L[N.R[colhdr]] = colhdr;
  }
  for (let a = N.U[colhdr]; a !== colhdr; a = N.U[a]) {
    const it = N.ROW[a];
    const cnt = N.COUNT[it];
    if (cnt === 0) {
      for (let b = N.L[a]; b !== a; b = N.L[b]) {
        if (b === it) continue;
        const c = N.COL[b];
        for (let d = N.U[b]; d !== c; d = N.U[d]) unhide(d);
        N.R[N.L[c]] = c; N.L[N.R[c]] = c;
        for (let d = N.U[c]; d !== b; d = N.U[d]) unhide(d);
      }
      N.D[N.U[it]] = it; N.U[N.D[it]] = it;
    }
    N.COUNT[it] = cnt + 1;
  }
  N.COUNT[N.COL[colhdr]] += 1;
};

TLE.unfilter = function (ctx, level) {
  const N = ctx.nodes, lv = ctx.levels;
  const lo = lv[level - 1];
  for (let k = lv[level]; k > lo; k--) {
    const c = ctx.filtered[k - 1];
    N.R[N.L[c]] = c; N.L[N.R[c]] = c;
    for (let a = N.U[c]; a !== c; a = N.U[a]) { N.R[N.L[a]] = a; N.L[N.R[a]] = a; N.SIZE[N.ROW[a]] += 1; }
  }
};

// exact_solve: resumable: each call returns the next solution's pushlist, or null; depth in ctx.soln_size
TLE.exact_solve = function (ctx) {
  const g = TLE.g, N = ctx.nodes;
  if (ctx.busy) return null;
  ctx.busy = 1;
  let depth, node = -1, state;
  if (!ctx.solving) {
    depth = ctx.npush;
    ctx.levels[depth] = 0;
    ctx.declOpen = 0; ctx.solving = 1; ctx.best = -1;
    state = 2;
  } else {
    depth = ctx.savedDepth;
    state = 0;
  }
  for (;;) {
    if (state === 0) {
      if (depth === ctx.npush) {
        ctx.solving = 0;
        if (depth === 0) ctx.declOpen = 1;
        ctx.busy = 0;
        return null;
      }
      if (ctx.filterCb) TLE.unfilter(ctx, depth);
      depth -= 1;
      node = ctx.stack[depth];
      TLE.pop_col_update(ctx, N.COL[node]);
      node = N.R[node];
      state = 1;
    }
    if (state === 1) {
      if (node === N.ROW[node]) { state = 0; continue; }
      ctx.pushlist[depth] = N.ID[N.COL[node]];
      ctx.stack[depth] = node;
      if (TLE.push_col_update(ctx, N.ROW[node], N.COL[node], ctx.flag7c) !== 0) {
        TLE.pop_col_update(ctx, N.COL[node]);
        node = N.R[node];
        continue;
      }
      depth += 1;
      if (ctx.filterCb) {
        let nfilt = ctx.levels[depth - 1], dead = 0;
        for (let opt = N.R[0]; opt !== 0; opt = N.R[opt]) {
          if (ctx.filterCb(ctx.filterData, depth, ctx.pushlist, N.ID[N.COL[opt]]) !== 0) continue;
          for (let a = N.D[opt]; a !== opt; a = N.D[a]) {
            const it = N.ROW[a];
            const sz = --N.SIZE[it];
            if (sz === 0) dead = 1;
            if (sz < ctx.minsize) { ctx.minsize = sz; ctx.best = it; }
            N.R[N.L[a]] = N.R[a]; N.L[N.R[a]] = N.L[a];
          }
          N.R[N.L[opt]] = N.R[opt]; N.L[N.R[opt]] = N.L[opt];
          ctx.filtered[nfilt++] = opt;
        }
        ctx.levels[depth] = nfilt;
        if (dead) { state = 0; continue; }
      }
      state = 2;
    }
    if (state === 2) {
      if (ctx.solCb && ctx.solCb(ctx.solData, depth, ctx.pushlist) === 0) { state = 0; continue; }
      if (g.dlx_maxcover !== 0 && depth > g.dlx_maxcover) { state = 0; continue; }
      if (N.D[0] === 0) {
        ctx.savedDepth = depth;
        ctx.soln_size = depth;
        ctx.busy = 0;
        return ctx.pushlist;
      }
      let picked = false;
      if (depth > ctx.npush) {
        const last = ctx.stack[depth - 1];
        if (N.COUNT[N.ROW[last]] !== 0) {
          let x = last, back = false;
          for (;;) {
            const r = N.R[x];
            if (N.L[r] === x) break;
            if (r === N.ROW[r]) { back = true; break; }
            x = r;
          }
          if (back) { state = 0; continue; }
          node = x;
          picked = true;
        }
      }
      if (!picked) {
        let it = ctx.best;
        if (!(it !== -1 && N.COUNT[it] !== 0)) {
          let min = ctx.ncol + 1;
          it = -1;
          for (let a = N.D[0]; a !== 0; a = N.D[a]) {
            const sz = N.SIZE[N.ROW[a]];
            if (sz < min) { min = sz; it = a; }
          }
        }
        node = N.R[it];
      }
      state = 1;
    }
  }
};
