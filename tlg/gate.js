var TLE = globalThis.TLE || (globalThis.TLE = {});
var MW = 23;
TLE.g = TLE.g || {};
TLE.log = TLE.log || function () {};

TLE.gate_defaults = function (g) {
  if (g.MAXANALPATH === undefined) g.MAXANALPATH = 0x18;
  if (g.mcode === undefined) g.mcode = 3;
  if (g.snode === undefined) g.snode = new Int32Array(729);
  if (g.CMASK === undefined) g.CMASK = new Uint32Array(MW);
  if (g.lspan === undefined) g.lspan = new Int16Array(400);
  if (g.Ps === undefined || g.Ps.length < 16) g.Ps = new Uint8Array(16);
  for (const k of ["gm_nopath", "train_running", "get_r0", "nset", "nspan", "nlspan", "tripsets", "rank"]) {
    if (g[k] === undefined) g[k] = 0;
  }
};
TLE.gate_defaults(TLE.g);

// rank_gate: computes the rank when the truths are disjoint, covered by the links and the path
// eliminates or places something; returns 1 or 0 when it stops before that or the rank exceeds arg2
TLE.rank_gate = function (pathIndex, arg2, arg3) {
  const g = TLE.g;
  const sp = g.sudpath[pathIndex];
  const nT = sp.nT;
  if (nT > g.MAXANALPATH) return 0;
  /* @edition-slot gate-001 */
  g.nset = nT;
  if (g.gm_nopath !== 0) return 0;
  /* @edition-slot gate-002 */
  if (g.g_assign === 0x51) {
    /* @edition-slot gate-003 */
    return 1;
  }
  if (nT === 0) {
    /* @edition-slot gate-004 */
    return 1;
  }
  if (g.g_kill === 0 && g.g_live === 0) {
    /* @edition-slot gate-005 */
    return 0;
  }
  /* @edition-slot gate-006 */
  const lstart = sp.lstart,
    tstart = sp.tstart;
  const nlet = (sp.nL << 16) >> 16;
  g.nspan = (sp.nspan << 16) >> 16;
  g.nlspan = 0;
  g.CMASK.fill(0);
  for (let d = 0; d < 9; d++) g.Ps[d] = 0;
  g.mcode = (g.mcode + 1) | 0;
  g.tripsets = 0;
  for (let i = 0; i < nT; i++) {
    const s = g.ssd[tstart + i];
    /* @edition-slot gate-007 */
    for (let w = 0; w < MW; w++) g.CMASK[w] |= g.SET[s * MW + w];
    const e = g.PSET[s];
    const count = (e.count << 16) >> 16;
    g.Ps[count]++;
    for (let j = 0; j < count; j++) {
      const cand = e.list[j];
      if (g.snode[cand] === g.mcode) g.tripsets = (g.tripsets + 1) & 0xff;
      else g.snode[cand] = g.mcode;
    }
  }
  for (let i = 0; i < nlet; i++) {
    const s = g.lsd[lstart + i];
    if (g.Lflag[s] >= 0) continue;
    g.lspan[g.nlspan] = s;
    g.nlspan = ((g.nlspan + 1) << 16) >> 16;
  }
  /* @edition-slot gate-008 */
  {
    let any = 0;
    for (let w = 0; w < MW; w++) any |= g.CMASK[w] & g.SET[325 * MW + w];
    if (any !== 0) {
      /* @edition-slot gate-009 */
      return 1;
    }
  }
  /* @edition-slot gate-010 */
  if (nT === 1 && nlet === 0 && g.setnp[g.ssd[tstart]] === 1) {
    /* @edition-slot gate-011 */
    return 1;
  }
  if (g.tripsets !== 0) {
    /* @edition-slot gate-012 */
    return 0;
  }
  {
    let any = 0;
    for (let w = 0; w < MW; w++) any |= g.CMASK[w] & ~g.LMASK[w];
    if (any !== 0) {
      /* @edition-slot gate-013 */
      return 1;
    }
  }
  /* @edition-slot gate-014 */
  if (g.nlspan !== g.nspan) TLE.log(0x1004, "nlspan!=nspan\n");
  let rank;
  if (g.train_running !== 0 && g.get_r0 !== 0) {
    rank = TLE.get_rank_cover(sp, 1) | 0;
    g.rank = rank;
    sp.rank = (rank << 16) >> 16;
    if (rank === -1) {
      /* @edition-slot gate-015 */
      return 0;
    }
  } else {
    rank = TLE.get_rank_cover(sp, 0) | 0;
    g.rank = rank;
    sp.rank = (rank << 16) >> 16;
  }
  if (arg2 < rank) {
    /* @edition-slot gate-016 */
    return 0;
  }
};

TLE.evaluate_path = function (pathIndex) {
  TLE.rank_gate(pathIndex, 0x63, 1);
};
