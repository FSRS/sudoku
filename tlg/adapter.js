var TLE = globalThis.TLE || (globalThis.TLE = {});

TLE.resetState = function () {
  TLE.g = {};
  for (const k of Object.keys(TLE)) if (/_defaults$/.test(k) && typeof TLE[k] === 'function') TLE[k](TLE.g);
  return TLE.g;
};

TLE.candNumber = function (row, col, digit) { return row * 81 + col * 9 + (digit - 1); };
TLE.candOf = function (cand) { return { row: Math.floor(cand / 81), col: Math.floor((cand % 81) / 9), digit: (cand % 9) + 1 }; };

TLE.setNumber = function (s) {
  if (typeof s === 'number') return s;
  const d = (s.digit | 0) - 1;
  if (s.kind === 'row') return s.index * 9 + d;
  if (s.kind === 'col') return 81 + s.index * 9 + d;
  if (s.kind === 'cell') return 162 + (s.cell !== undefined ? s.cell : s.row * 9 + s.col);
  if (s.kind === 'box') return 243 + s.index * 9 + d;
  /* @edition-slot adapter-001 */
  throw new Error('unknown set ' + JSON.stringify(s));
};

TLE.setOf = function (s) {
  if (s < 81) return { kind: 'row', index: Math.floor(s / 9), digit: (s % 9) + 1 };
  if (s < 162) return { kind: 'col', index: Math.floor((s - 81) / 9), digit: ((s - 81) % 9) + 1 };
  if (s < 243) return { kind: 'cell', cell: s - 162, row: Math.floor((s - 162) / 9), col: (s - 162) % 9 };
  if (s < 324) return { kind: 'box', index: Math.floor((s - 243) / 9), digit: ((s - 243) % 9) + 1 };
  /* @edition-slot adapter-002 */
  return { kind: 'kill' };
};

// Rank text: '0'+rank when path flag 0x40000 is set and rank != -1, else '?'
TLE.rankText = function (sp) {
  if ((sp.flags & 0x40000) && sp.rank !== -1) return String.fromCharCode(48 + sp.rank);
  return '?';
};

const INPUT_KEYS = ['values', 'candidates', 'truths', 'links', 'options'];
const OPTION_KEYS = ['uniqueSolution'];
const REJECTED_SETS = [0x144];
/* @edition-slot adapter-003 */

function checkInput(input) {
  for (const k of Object.keys(input)) if (!INPUT_KEYS.includes(k)) throw new Error('Unsupported TLG input: ' + k);
  for (const k of Object.keys(input.options || {})) if (!OPTION_KEYS.includes(k)) throw new Error('Unsupported TLG input: options.' + k);
}

function setup(input) {
  checkInput(input);
  const g = TLE.resetState();
  const opt = input.options || {};
  const values = input.values || [];
  const cands = input.candidates || [];
  for (let cell = 0; cell < 81; cell++) {
    const v = values[cell] | 0;
    if (v > 0) { g.G99[cell * 9 + v - 1] = 1; continue; }
    const m = cands[cell] | 0;
    for (let d = 0; d < 9; d++) if (m & (1 << d)) g.G99[cell * 9 + d] = 2;
  }
  /* @edition-slot adapter-004 */
  g.g_dispmode = 0;
  g.have_solution = opt.uniqueSolution === false ? 2 : 1;
  TLE.clear_prob_and_sets();
  TLE.p_set_prob();
  /* @edition-slot adapter-005 */
  TLE.perm_load_sets();
  /* @edition-slot adapter-006 */
  const truths = (input.truths || []).map(TLE.setNumber);
  const links = (input.links || []).map(TLE.setNumber);
  for (const s of truths.concat(links)) if (REJECTED_SETS.includes(s)) throw new Error('Unsupported TLG input: set ' + s);
  /* @edition-slot adapter-007 */
  return { g, truths, links };
}

TLE.evaluate = function (input) {
  const { g, truths, links } = setup(input);
  for (const s of links) g.Lflag[s] |= 0x8000;
  const pi = TLE.new_path(truths, links);
  const rc = TLE.anal_path(pi, 1);
  const sp = g.sudpath[pi];
  if (rc !== -999999 && rc !== -9) TLE.evaluate_path(pi);
  const kills = [];
  for (let i = 0; i < g.g_kill; i++) {
    const c = g.killlist[i];
    kills.push({ cand: c, kind: (g.kzbit[c] & 2) ? 'cannibal' : 'external' });
  }
  const lives = Array.from(g.livelist.subarray(0, g.g_live));
  const linkInfo = links.map((s) => ({ set: s, lflag: g.Lflag[s] & 0xffff, lnc: g.LNC[s], saturated: !!(g.Lflag[s] & 0x4000) }));
  const result = {
    ok: rc === 0,
    rc,
    flags: sp.flags >>> 0,
    /* @edition-slot adapter-008 */
    rank: ((sp.flags & 0x40000) && sp.rank !== -1) ? sp.rank : null,
    rankText: TLE.rankText(sp),
    nperm: sp.nperm,
    nT: sp.nT, nL: sp.nL, ncand: sp.ncand, nspan: sp.nspan, nlsat: sp.nlsat,
    kills, lives, linkInfo,
    truths,
    /* @edition-slot adapter-009 */
  };
  /* @edition-slot adapter-010 */
  return result;
};

// Remove Unused Links: drop each link in turn and leave it out while the kill/live
// counts stay the same (a replay of remove_coversets_dlx with anal_path).
TLE.removeUnusedLinks = function (input) {
  const { g, truths, links } = setup(input);
  const run = (active, flags) => {
    TLE.clear_Lflags(0x8000);
    for (const s of active) g.Lflag[s] |= 0x8000;
    const pi = TLE.new_path(truths, active);
    const rc = TLE.anal_path(pi, flags);
    const sp = g.sudpath[pi];
    return { rc, count: ((sp.nlive & 0xffff) << 16) + (sp.nkill & 0xffff) };
  };
  const base = run(links, 2);
  if (base.rc === -999999) return { aborted: true };
  const keep = links.map(() => true);
  for (let i = 0; i < links.length; i++) {
    keep[i] = false;
    const trial = run(links.filter((_, j) => keep[j]), 4);
    if (trial.rc === -999999) return { aborted: true };
    if (trial.rc !== 0 || trial.count !== base.count) keep[i] = true;
  }
  return { keep: keep.flatMap((k, i) => (k ? [i] : [])) };
};
