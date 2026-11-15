var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  var NW = TLE.NW;
  var bitCount = TLE.bitCount;
  var ABORT = -999999;
  var SOL_LIMIT = 8388606;
  var tag = TLE.putTag;

  var INPUT_KEYS = ["values", "candidates", "truths", "links", "options", "aurMarks", "aurGroups", "vset", "vapply", "vcount", "wantPerms", "givens"];
  var OPTION_KEYS = ["uniqueSolution", "applyAur", "highlightAls"];
  /* @edition-slot api-001 */

  function checkInput(input) {
    var keys = Object.keys(input);
    for (var i = 0; i < keys.length; i++) {
      if (INPUT_KEYS.indexOf(keys[i]) < 0) throw new Error("Unsupported TLG input: " + keys[i]);
    }
    if (input.aurGroups && input.aurMarks && input.aurMarks.length > 0) throw new Error("Unsupported TLG input: aurGroups");
    if (input.options) {
      var ok = Object.keys(input.options);
      for (i = 0; i < ok.length; i++) {
        if (OPTION_KEYS.indexOf(ok[i]) < 0) throw new Error("Unsupported TLG input: options." + ok[i]);
      }
    }
  }

  function convertSets(refs) {
    var out = [];
    if (!refs) return out;
    for (var i = 0; i < refs.length; i++) {
      out.push(TLE.setNumber(refs[i]));
    }
    return out;
  }

  function prepare(input) {
    checkInput(input);
    var truths = convertSets(input.truths);
    var links = convertSets(input.links);
    var st = TLE.newState();
    TLE.loadBoard(st, input.values, input.candidates);
    truths = TLE.loadMarks(st, input, truths);
    /* @edition-slot api-002 */
    TLE.buildAur(st);
    return { st: st, truths: truths, links: links };
  }

  function gateStats(st) {
    var truths = st.truths;
    var setOff = st.setOff;
    var setLen = st.setLen;
    var setList = st.setList;
    var setMask = st.setMask;
    var TU = st.TU;
    var T = st.T;
    var seen = new Uint8Array(729);
    var over = 0;
    TU.fill(0);
    for (var k = 0; k < 9; k++) T[k] = 0;
    for (var i = 0; i < st.nT; i++) {
      var s = truths[i];
      if (s === 324) continue;
      for (var w = 0; w < NW; w++) TU[w] |= setMask[s * NW + w];
      T[setLen[s]]++;
      for (k = setOff[s]; k < setOff[s] + setLen[s]; k++) {
        var c = setList[k];
        if (seen[c]) over = (over + 1) & 255;
        else seen[c] = 1;
      }
    }
    st.tOver = over;
    var span = [];
    for (var j = 0; j < st.nL; j++) {
      if (st.linkState[st.links[j]] & 0x8000) span.push(st.links[j]);
    }
    st.spanList = span;
    st.spanCount = span.length;
  }

  function seal(st, cf) {
    if (st.nDig === 1) cf |= 0x2000;
    st.CF = cf;
    st.flags |= 0x100000;
    st.pathCF = cf;
    /* @edition-slot api-021 */
  }

  function gate(st) {
    var nT = st.nT;
    if (nT > 24 && !(st.aurCause & 3)) return;
    st.CF = 0;
    st.pathCF = 0;
    st.bestAls = -1;
    st.alsCells.fill(0);
    st.alsSets.fill(0);
    /* @edition-slot api-003 */
    st.nset = nT;
    if (st.solvedCount === 81) {
      tag(st, 1);
      st.bestAls = -1;
      seal(st, 0);
      return;
    }
    if (nT === 0) {
      tag(st, 2);
      st.bestAls = -1;
      seal(st, 0);
      return;
    }
    if (st.nkill === 0 && st.nlive === 0) {
      tag(st, 2);
      return;
    }
    if (st.aurCause & 3) {
      tag(st, st.aurCause & 1 ? 3 : 4);
      seal(st, 0);
      return;
    }
    gateStats(st);
    TLE.pathStats(st);
    var w;
    for (w = 0; w < NW; w++) {
      if (st.TU[w] & st.killMask[w]) {
        tag(st, 5);
        seal(st, st.CF);
        return;
      }
    }
    st.CF |= 0x40;
    st.oneLine = st.nRowsT === 1 || st.nColsT === 1 || st.nBoxesT === 1;
    if (nT === 1 && st.nL === 0 && st.setSize[st.truths[0]] === 1) {
      tag(st, 6);
      st.rankField = 0;
      seal(st, st.CF);
      return;
    }
    if (st.tOver !== 0) {
      st.CF |= 0x20000000;
      if (nT === 4 && st.nL === 0 && st.T[1] === 4) {
        tag(st, 7);
        seal(st, st.CF);
        return;
      }
      if (st.tCell === 0 && st.lCell === 0 && nT <= 8) {
        TLE.pat.oneDigit(st);
        seal(st, st.CF);
        return;
      }
      tag(st, 8);
      return;
    }
    for (w = 0; w < NW; w++) {
      if (st.TU[w] & ~st.LC[w]) {
        tag(st, 9);
        st.CF |= 0x40000;
        seal(st, st.CF);
        return;
      }
    }
    TLE.killStats(st);
    var r = TLE.computeRank(st, 0);
    st.rank = r;
    st.rankField = (r << 16) >> 16;
    if (r > 99) return;
    TLE.pat.main(st);
    seal(st, st.CF);
  }

  function evaluateState(st) {
    TLE.runEval(st, 1);
    if (st.rc !== ABORT) {
      gate(st);
      /* @edition-slot api-017 */
    }
  }

  function solsAsLists(st, limit) {
    var W = st.solW;
    var sols = st.sols;
    var tcList = st.tcList;
    var nsol = st.nsol;
    var lone = st.lone;
    var max = limit >= 0 && limit < SOL_LIMIT ? limit : SOL_LIMIT;
    var out = [];
    var order = new Int32Array(nsol);
    var i, k, a, q;
    for (i = 0; i < nsol; i++) order[i] = i;
    order.sort(function (x, y) {
      for (var w = 0; w < W; w++) {
        var d = sols[x * W + w] ^ sols[y * W + w];
        if (d !== 0) return (sols[x * W + w] & d & -d) !== 0 ? -1 : 1;
      }
      return 0;
    });
    if (lone === null) {
      for (i = 0; i < nsol && out.length < max; i++) {
        var arr = [];
        for (var w = 0; w < W; w++) {
          var v = sols[order[i] * W + w];
          while (v !== 0) {
            var low = v & -v;
            arr.push(tcList[(w << 5) + 31 - Math.clz32(low)]);
            v ^= low;
          }
        }
        out.push(arr);
      }
      return out;
    }
    var nA = lone.thr.length;
    var nSets = lone.sets.length;
    var own = new Int32Array(tcList.length).fill(-1);
    var slot = new Int32Array(tcList.length);
    var least = new Int32Array(nSets);
    var taken = new Uint8Array(nSets);
    var inside = new Int32Array(nA);
    for (i = 0; i < nSets; i++) {
      var set = lone.sets[i];
      for (k = 0; k < set.cands.length; k++) {
        own[set.cands[k]] = i;
        slot[set.cands[k]] = k;
      }
      least[i] = set.min;
      if (set.aur >= 0) inside[set.aur] += set.min;
    }
    var path = [];

    function fits(lo, hi) {
      for (var p = lo; p < hi; p++) {
        var base = order[p] * W;
        for (a = 0; a < nA; a++) {
          var n = inside[a];
          for (q = 0; q < W; q++) n += bitCount(sols[base + q] & lone.aurLoc[a][q]);
          if (n > lone.thr[a]) break;
        }
        if (a === nA) return true;
      }
      return false;
    }

    function walk(t, lo, hi) {
      if (out.length >= max) return;
      if (t === tcList.length) {
        for (var p = lo; p < hi && out.length < max; p++) out.push(path.slice());
        return;
      }
      var j = own[t];
      if (j < 0) {
        var bit = 1 << (t & 31);
        var from = lo;
        var to = hi;
        while (from < to) {
          var mid = (from + to) >> 1;
          if (sols[order[mid] * W + (t >> 5)] & bit) from = mid + 1;
          else to = mid;
        }
        if (from > lo && fits(lo, from)) {
          path.push(tcList[t]);
          walk(t + 1, lo, from);
          path.pop();
        }
        if (hi > from && fits(from, hi)) walk(t + 1, from, hi);
        return;
      }
      if (taken[j]) {
        walk(t + 1, lo, hi);
        return;
      }
      var set = lone.sets[j];
      var au = set.aur;
      var was = least[j];
      var k = slot[t];
      var now = set.inside[k];
      if (au >= 0) inside[au] += now - was;
      if (au < 0 || fits(lo, hi)) {
        taken[j] = 1;
        path.push(tcList[t]);
        walk(t + 1, lo, hi);
        path.pop();
        taken[j] = 0;
      }
      if (au >= 0) inside[au] += was - now;
      if (k + 1 === set.cands.length) return;
      now = 1;
      for (var r = k + 1; r < set.cands.length; r++) if (set.inside[r] === 0) now = 0;
      least[j] = now;
      if (au >= 0) inside[au] += now - was;
      if (au < 0 || fits(lo, hi)) walk(t + 1, lo, hi);
      if (au >= 0) inside[au] += was - now;
      least[j] = was;
    }

    if (nsol > 0) walk(0, 0, nsol);
    return out;
  }
  TLE.solsAsLists = solsAsLists;

  function buildResult(st) {
    var flags = st.flags >>> 0;
    var rankOk = (flags & 0x40000) !== 0 && st.rankField !== -1;
    var kills = [];
    for (var i = 0; i < st.kills.length; i++) {
      var c = st.kills[i];
      kills.push({ cand: c, kind: (st.kz[c] & 2) !== 0 ? "cannibal" : "external" });
    }
    var linkInfo = [];
    for (i = 0; i < st.links.length; i++) {
      var s = st.links[i];
      var lf = st.linkState[s];
      linkInfo.push({ set: s, lflag: lf, lnc: st.linkTc[s], saturated: (lf & 0x4000) !== 0 });
    }
    var res = {
      ok: st.rc === 0,
      rc: st.rc,
      flags: flags,
      rank: rankOk ? st.rankField : null,
      rankText: rankOk ? String.fromCharCode(48 + st.rankField) : "?",
      nperm: st.nperm,
      nT: st.nT,
      nL: st.nL,
      ncand: st.ncand,
      nspan: st.nspan,
      nlsat: st.nlsat,
      kills: kills,
      lives: st.lives.slice(),
      linkInfo: linkInfo,
      truths: st.truths.slice()
    };
    /* @edition-slot api-018 */
    res.aur = { count: st.aurList.length, applied: st.applyAur, cause: st.aurCause, failed: st.aurFailed };
    res.virtual = { nvset: st.nv, applied: st.vapply && st.vN > 0, n: st.vN, isvir: st.isvir, visnp: st.visnp, visnn: st.visnn };
    res.als = { cells: Array.from(st.alsCells), sets: Array.from(st.alsSets) };
    if (st.wantPerms !== undefined) {
      var want = typeof st.wantPerms === "number" ? Math.ceil(Math.max(0, st.wantPerms)) : -1;
      var list = st.nsol > 0 ? solsAsLists(st, want) : [];
      if (typeof st.wantPerms === "number") list = list.slice(0, Math.max(0, st.wantPerms));
      res.perms = list;
    }
    return res;
  }

  TLE.evaluate = function (input) {
    var p = prepare(input);
    var st = p.st;
    TLE.setPath(st, p.truths, p.links);
    evaluateState(st);
    return buildResult(st);
  };

  TLE.removeUnusedLinks = function (input) {
    var p = prepare(input);
    var st = p.st;
    var links = p.links;
    TLE.setPath(st, p.truths, links);
    var rc = TLE.runEval(st, 2);
    if (rc === ABORT) return { aborted: true };
    var base = ((st.nlive & 0xffff) << 16) | (st.nkill & 0xffff);
    var keep = [];
    for (var j = 0; j < links.length; j++) keep.push(true);
    for (j = 0; j < links.length; j++) {
      keep[j] = false;
      var trial = [];
      for (var k = 0; k < links.length; k++) if (keep[k]) trial.push(links[k]);
      TLE.setPath(st, p.truths, trial);
      rc = TLE.runEval(st, 4);
      if (rc === ABORT) return { aborted: true };
      var v = ((st.nlive & 0xffff) << 16) | (st.nkill & 0xffff);
      if (rc !== 0 || v !== base) keep[j] = true;
    }
    var out = [];
    for (j = 0; j < links.length; j++) if (keep[j]) out.push(j);
    return { keep: out };
  };

  TLE.evaluateState = evaluateState;
  TLE.buildResult = buildResult;
  TLE.gateStatsBase = gateStats;
})();
