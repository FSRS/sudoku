var TLE = globalThis.TLE || (globalThis.TLE = {});
var MW = 23;
TLE.g = TLE.g || {};

TLE.pb_defaults = function (g) {
  const u32 = (n) => new Uint32Array(n);
  if (g.AUX === undefined) g.AUX = u32(MW);
  if (g.E1 === undefined) g.E1 = u32(MW);
  if (g.A1 === undefined) g.A1 = u32(MW);
  if (g.A0 === undefined) g.A0 = u32(MW);
  if (g.killlist === undefined) g.killlist = new Int16Array(729);
  if (g.livelist === undefined) g.livelist = new Int16Array(82);
  if (g.LNC === undefined) g.LNC = new Uint8Array(326);
};
TLE.pb_defaults(TLE.g);

// make_xs_can: union of the active links containing compact candidate k, minus k
TLE.make_xs_can = function (out, k) {
  const g = TLE.g, SIW = g.SIW;
  out.fill(0);
  const sets = g.PROB_sets[g.r_index[k]];
  for (let i = 0; i < 4; i++) {
    const s = sets[i];
    if (!(g.fco[s] & 8)) continue;
    for (let w = 0; w < SIW; w++) out[w] |= g.SET[s * MW + w];
  }
  out[k >> 5] &= ~(1 << (k & 31));
};

// make_rl_can: same by candidate number, without removing itself
TLE.make_rl_can = function (out, cand) {
  const g = TLE.g, SIW = g.SIW;
  out.fill(0);
  const sets = g.PROB_sets[cand];
  for (let i = 0; i < 4; i++) {
    const s = sets[i];
    if (!(g.fco[s] & 8)) continue;
    for (let w = 0; w < SIW; w++) out[w] |= g.SET[s * MW + w];
  }
};

// PB_mark_dead: kills: external = 1, cannibal = 3; lives = 4
TLE.PB_mark_dead = function (sp, mode) {
  const g = TLE.g;
  const P = () => g.P;
  g.AUX.fill(0);
  g.g_live = 0;
  g.g_kill = 0;
  for (let w = 0; w < MW; w++) g.SET[325 * MW + w] = 0;
  const LO = new Uint32Array(MW);
  let anyLO = 0;
  for (let w = 0; w < MW; w++) { LO[w] = g.LMASK[w] & ~g.SMASK[w]; anyLO |= LO[w]; }
  const xs = new Uint32Array(MW);
  if (anyLO !== 0 && g.g_inode > 0) {
    for (let k = 0; k < g.g_inode; k++) {
      if (!(LO[k >> 5] & (1 << (k & 31)))) continue;
      TLE.make_xs_can(xs, k);
      let p = g.nPe, last = -1, survived = false;
      while (p !== g.nP) {
        const base = p * MW;
        let any = 0;
        for (let w = 0; w < MW; w++) any |= P()[base + w] & xs[w];
        last = p;
        if (any === 0) { survived = true; break; }
        p = (p >= 0x7fffff) ? g.nPbase : p + 1;
      }
      if (survived) {
        for (let w = 0; w < MW; w++) g.X[w] = P()[p * MW + w] & g.SMASK[w];
        continue;
      }
      if (last !== -1) for (let w = 0; w < MW; w++) g.X[w] = P()[last * MW + w] & g.SMASK[w];
      const cand = g.r_index[k];
      g.kzbit[cand] |= 1;
      g.AUX[k >> 5] |= 1 << (k & 31);
      g.SET[325 * MW + (k >> 5)] |= 1 << (k & 31);
      if (g.g_kill <= 728) g.killlist[g.g_kill++] = cand;
    }
  }
  g.E1.fill(0);
  g.A1.fill(0xffffffff);
  {
    let p = g.nPe;
    while (p !== g.nP) {
      const base = p * MW;
      for (let w = 0; w < MW; w++) { g.E1[w] |= P()[base + w]; g.A1[w] &= P()[base + w]; }
      p = (p > 0x7ffffe) ? g.nPbase : p + 1;
    }
  }
  for (let w = 0; w < MW; w++) g.A0[w] = ~g.E1[w] & g.SMASK[w];
  for (let k = 0; k < g.g_inode; k++) {
    const cand = g.r_index[k];
    const bit = 1 << (k & 31), w = k >> 5;
    if (g.A0[w] & bit) {
      g.SET[325 * MW + w] |= bit;
      g.kzbit[cand] |= 3;
      if (g.g_kill <= 728) g.killlist[g.g_kill++] = cand;
    }
    if (g.A1[w] & bit) {
      g.kzbit[cand] |= 4;
      if (g.g_live <= 80) g.livelist[g.g_live++] = cand;
    }
  }
  /* @edition-slot pb-001 */
  let count3 = 0;
  if (mode !== 0) {
    for (let cand = 0; cand < 729; cand++) {
      if (g.G99[cand] & 2) continue;
      if ((g.kzbit[cand] & 0x30) !== 0x10) continue;
      TLE.make_rl_can(xs, cand);
      let p = g.nPe, survived = false;
      while (p !== g.nP) {
        const base = p * MW;
        let any = 0;
        for (let w = 0; w < MW; w++) any |= P()[base + w] & xs[w];
        if (any === 0) { survived = true; break; }
        p = (p >= 0x7fffff) ? g.nPbase : p + 1;
      }
      if (survived) continue;
      g.kzbit[cand] |= 9;
      count3 += 1;
    }
  }
  let add = g.g_kill !== 0 ? 0x40000000 : 0;
  sp.nkill = g.g_kill;
  sp.ndkill = count3 & 0xffff;
  sp.nlive = g.g_live;
  if (count3 !== 0) add |= 0x2000000;
  g.PSET[325].count = g.g_kill;
  sp.flags = (sp.flags | add) >>> 0;
  return add;
};

// PB_saturate: Lflag 0x1000 one truth candidate, 0x2000 all truth candidates, 0x4000 occupied in every permutation
TLE.PB_saturate = function (lsd, lstart, nL) {
  const g = TLE.g;
  if (nL <= 0) return 0;
  let count = 0;
  for (let i = 0; i < nL; i++) {
    const s = lsd[lstart + i] & 0x1ff;
    for (let w = 0; w < MW; w++) g.X[w] = g.SMASK[w] & g.SET[s * MW + w];
    const n = TLE.bit729(g.X, 0);
    g.LNC[s] = n;
    if (n === 1) g.Lflag[s] |= 0x1000;
    let f = g.Lflag[s];
    if (g.PSET[s].count === n) { f |= 0x2000; g.Lflag[s] = f; }
    if (f >= 0) continue;
    let p = g.nPe, saturated = true;
    while (p !== g.nP) {
      const base = p * MW;
      let any = 0;
      for (let w = 0; w < MW; w++) any |= g.P[base + w] & g.SET[s * MW + w];
      if (any === 0) { saturated = false; break; }
      p = (p >= 0x7fffff) ? g.nPbase : p + 1;
    }
    if (!saturated) continue;
    g.Lflag[s] = f | 0x4000;
    count += 1;
  }
  return count;
};
