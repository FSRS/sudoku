var TLE = globalThis.TLE || (globalThis.TLE = {});
var MW = 23;
TLE.g = TLE.g || {};

TLE.state_defaults = function (g) {
  if (g.g_unknown === undefined) g.g_unknown = 0;
};
TLE.state_defaults(TLE.g);

// p_set_set: static 9-candidate lists of the 324 base sets
TLE.p_set_set = function () {
  const PSET = TLE.g.PSET;
  for (let row = 0; row < 9; row++) for (let d = 0; d < 9; d++) { const l = PSET[row * 9 + d].list9; for (let j = 0; j < 9; j++) l[j] = row * 81 + d + 9 * j; }
  for (let col = 0; col < 9; col++) for (let d = 0; d < 9; d++) { const l = PSET[81 + col * 9 + d].list9; for (let j = 0; j < 9; j++) l[j] = col * 9 + d + 81 * j; }
  for (let cell = 0; cell < 81; cell++) { const l = PSET[162 + cell].list9; for (let j = 0; j < 9; j++) l[j] = cell * 9 + j; }
  for (let b = 0; b < 9; b++) for (let d = 0; d < 9; d++) {
    const l = PSET[243 + b * 9 + d].list9;
    for (let k = 0; k < 9; k++) l[k] = (((b / 3) | 0) * 3 + ((k / 3) | 0)) * 81 + ((b % 3) * 3 + (k % 3)) * 9 + d;
  }
};

// clear_prob_and_sets: containing sets of each candidate: row, col, cell, box; then p_set_set
TLE.clear_prob_and_sets = function () {
  const g = TLE.g;
  for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) for (let d = 0; d < 9; d++) {
    const cand = row * 81 + col * 9 + d;
    const s = g.PROB_sets[cand];
    s[0] = row * 9 + d;
    s[1] = 81 + col * 9 + d;
    s[2] = 162 + row * 9 + col;
    s[3] = 243 + (((row / 3) | 0) * 3 + ((col / 3) | 0)) * 9 + d;
  }
  TLE.p_set_set();
};

// p_set_prob: present-candidate lists of the 324 base sets from G99
TLE.p_set_prob = function () {
  const g = TLE.g, G99 = g.G99, PSET = g.PSET;
  let unknown = 0, anyUnknown = false;
  for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) {
    const s = 162 + row * 9 + col, e = PSET[s];
    let n = 0;
    for (let d = 0; d < 9; d++) {
      const cand = row * 81 + col * 9 + d, v = G99[cand];
      if (v === 2) { unknown += 1; anyUnknown = true; }
      if (v & 2) { e.probs[n] = cand; e.list[n] = cand; n += 1; }
    }
    e.row = row; e.col = col; e.digit = 0xff; e.box = ((row / 3) | 0) * 3 + ((col / 3) | 0); e.count = n;
  }
  if (anyUnknown) g.g_unknown = unknown;
  for (let row = 0; row < 9; row++) for (let d = 0; d < 9; d++) {
    const s = row * 9 + d, e = PSET[s];
    let n = 0;
    for (let col = 0; col < 9; col++) {
      const cand = row * 81 + col * 9 + d;
      if (G99[cand] & 2) { e.probs[n] = cand; e.list[n] = cand; n += 1; }
    }
    e.row = row; e.col = 0xff; e.digit = d; e.box = 0xff; e.count = n;
  }
  for (let col = 0; col < 9; col++) for (let d = 0; d < 9; d++) {
    const s = 81 + col * 9 + d, e = PSET[s];
    let n = 0;
    for (let row = 0; row < 9; row++) {
      const cand = row * 81 + col * 9 + d;
      if (G99[cand] & 2) { e.probs[n] = cand; e.list[n] = cand; n += 1; }
    }
    e.row = 0xff; e.col = col; e.digit = d; e.box = 0xff; e.count = n;
  }
  for (let b = 0; b < 9; b++) for (let d = 0; d < 9; d++) {
    const s = 243 + b * 9 + d, e = PSET[s];
    let n = 0;
    for (let k = 0; k < 9; k++) {
      const cand = (((b / 3) | 0) * 3 + ((k / 3) | 0)) * 81 + ((b % 3) * 3 + (k % 3)) * 9 + d;
      if (G99[cand] & 2) { e.probs[n] = cand; e.list[n] = cand; n += 1; }
    }
    e.row = 0xff; e.col = 0xff; e.digit = d; e.box = b; e.count = n;
  }
  return 0;
};

// cube_to_psets: compact indices p_index/r_index, SET masks, setnp, g_inode, g_assign
TLE.cube_to_psets = function () {
  const g = TLE.g;
  g.p_index.fill(0x2da);
  g.setnp.fill(0);
  g.SET.fill(0);
  g.g_inode = 0;
  g.g_assign = 0;
  let k = 0, nassign = 0, any = false, anyAssign = false;
  for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) for (let d = 0; d < 9; d++) {
    const cand = row * 81 + col * 9 + d, v = g.G99[cand];
    if (v === 0) continue;
    if (v === 1) { nassign += 1; anyAssign = true; continue; }
    if (!(v & 2)) continue;
    any = true;
    g.p_index[cand] = k;
    g.r_index[k] = cand;
    const sets = [row * 9 + d, 81 + col * 9 + d, 162 + row * 9 + col, 243 + (((row / 3) | 0) * 3 + ((col / 3) | 0)) * 9 + d];
    for (const s of sets) { g.setnp[s] += 1; g.SET[s * MW + (k >> 5)] |= 1 << (k & 31); }
    k += 1;
  }
  if (anyAssign) g.g_assign = nassign;
  if (any) g.g_inode = k;
  return k;
};

// perm_load_sets: rebuild the compact candidate indices
TLE.perm_load_sets = function () {
  const g = TLE.g;
  /* @edition-slot state-001 */
  TLE.cube_to_psets();
  /* @edition-slot state-002 */
  g.SIW = (g.g_inode + 31) >> 5;
  /* @edition-slot state-003 */
  return g.g_inode;
};

TLE.new_path = function (truthSets, linkSets) {
  const g = TLE.g;
  const i = g.sudpath.length;
  const tstart = i === 0 ? 0 : g.sudpath[i - 1].tend;
  const lstart = i === 0 ? 0 : g.sudpath[i - 1].lend;
  for (let j = 0; j < truthSets.length; j++) g.ssd[tstart + j] = truthSets[j];
  for (let j = 0; j < linkSets.length; j++) g.lsd[lstart + j] = linkSets[j];
  g.sudpath.push({
    flags: 0, lstart, tstart, tend: tstart + truthSets.length, lend: lstart + linkSets.length,
    nT: truthSets.length, nL: linkSets.length, nlsat: 0, nspan: 0, ncand: 0, nkill: 0, nlive: 0, ndkill: 0, nperm: 0, rank: 0x1000,
  });
  /* @edition-slot state-004 */
  return i;
};
