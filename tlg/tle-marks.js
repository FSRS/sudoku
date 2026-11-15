var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  var NW = TLE.NW;
  var bitCount = TLE.bitCount;
  var cRow = TLE.cRow;
  var cCol = TLE.cCol;
  var cD0 = TLE.cD0;
  var cSets = TLE.cSets;

  TLE.loadMarks = function (st, input, truths) {
    var o = input.options || {};
    if (o.uniqueSolution !== undefined) st.uniqueSolution = !!o.uniqueSolution;
    st.applyAur = !!o.applyAur;
    st.highlightAls = !!o.highlightAls;
    st.wantPerms = input.wantPerms;
    st.givens = input.givens || null;
    st.vapply = !!input.vapply;
    st.vcount = input.vcount | 0;
    st.vN = st.vcount & 15;
    var cs = st.cs;
    var marks = st.marks;
    var i, c;
    if (input.aurMarks) for (i = 0; i < input.aurMarks.length; i++) marks[input.aurMarks[i]] |= 1;
    if (input.aurGroups) {
      st.aurGroups = [];
      for (var g = 0; g < input.aurGroups.length; g++) {
        var src = input.aurGroups[g];
        var flag = new Uint8Array(729);
        for (i = 0; i < src.length; i++) {
          flag[src[i]] = 1;
          marks[src[i]] |= 1;
        }
        var group = [];
        for (c = 0; c < 729; c++) if (flag[c]) group.push(c);
        if (group.length > 0) st.aurGroups.push(group);
      }
    }
    if (input.vset) {
      var kept = 0;
      for (i = 0; i < input.vset.length; i++) {
        c = input.vset[i];
        if (!(c >= 0 && c < 729) || cs[c] !== 1 || (marks[c] & 2)) continue;
        marks[c] |= 2;
        kept++;
      }
      if (kept >= 10) throw new Error("Unsupported TLG input: vset");
    }
    for (c = 0; c < 729; c++) if (marks[c] !== 0 && cs[c] === 2) st.solvedCount--;
    var nv = 0;
    var members = [];
    var aurMarks = [];
    var off = st.setOff[324];
    var len = 0;
    for (c = 0; c < 729; c++) {
      if (marks[c] & 2) {
        nv++;
        members.push(c);
        if (cs[c] === 1) {
          st.setList[off + len++] = c;
          st.setMask[324 * NW + (c >> 5)] |= 1 << (c & 31);
        }
      }
      if (marks[c] & 1) aurMarks.push(c);
    }
    st.nv = nv;
    st.extraMembers = members;
    st.setLen[324] = len;
    st.setSize[324] = len;
    st.aurMarks = aurMarks;
    st.applyMode = st.vapply && st.vN !== 0 && nv !== 0;
    st.extraMult = st.applyMode ? st.vN : 1;
    if (st.applyMode && truths.indexOf(324) < 0) truths = truths.concat([324]);
    return truths;
  };

  TLE.buildAur = function (st) {
    st.aurList = [];
    var groups = st.aurGroups || [st.aurMarks];
    for (var g = 0; g < groups.length; g++) {
      var marks = groups[g];
      var n = marks.length;
      if (n <= 1) continue;
      if (!st.uniqueSolution) return;
      if (st.aurList.length >= 32) return;
      if (n <= 9) classicAur(st, marks);
      else generalAur(st, marks);
    }
  };

  function addGeneral(st, cands, thr) {
    var mask = maskOf(cands);
    for (var k = 0; k < st.aurList.length; k++) {
      var e = st.aurList[k];
      if (!e.nominal && e.thr === thr && sameMask(e.mask, mask)) return;
    }
    st.aurList.push({ cands: cands, mask: mask, thr: thr });
  }

  function maskOf(cands) {
    var m = new Uint32Array(NW);
    for (var i = 0; i < cands.length; i++) m[cands[i] >> 5] |= 1 << (cands[i] & 31);
    return m;
  }

  function sameMask(a, b) {
    for (var w = 0; w < NW; w++) if (a[w] !== b[w]) return false;
    return true;
  }

  function solvedDigit(cs, cell) {
    for (var d = 0; d < 9; d++) if (cs[cell * 9 + d] === 2) return d;
    return -1;
  }

  function byNumber(p, q) {
    return p - q;
  }

  function classicAur(st, marks) {
    var n = marks.length;
    var cs = st.cs;
    var givens = st.givens;
    for (var i = 0; i < n - 1; i++) {
      for (var j = i + 1; j < n; j++) {
        var a = marks[i];
        var b = marks[j];
        if (cRow[a] === cRow[b] || cCol[a] === cCol[b]) continue;
        if (cD0[a] === cD0[b]) continue;
        var V = [];
        var U = [];
        var fixed = 0;
        var rs = [cRow[a], cRow[b]];
        var ks = [cCol[a], cCol[b]];
        var ds = [cD0[a], cD0[b]];
        var okAll = true;
        for (var x = 0; x < 2; x++) {
          for (var y = 0; y < 2; y++) {
            var cell = rs[x] * 9 + ks[y];
            var v = givens ? solvedDigit(cs, cell) : -1;
            var any = false;
            for (var z = 0; z < 2; z++) {
              var c = cell * 9 + ds[z];
              V.push(c);
              if (cs[c] === 1) {
                U.push(c);
                any = true;
              } else if (!givens) okAll = false;
            }
            if (v >= 0) {
              if (givens[cell] || (v !== ds[0] && v !== ds[1])) okAll = false;
              else fixed++;
            } else if (!any) okAll = false;
          }
        }
        if (!okAll || fixed === 4) continue;
        V.sort(byNumber);
        U.sort(byNumber);
        var nominal = maskOf(V);
        var dup = false;
        for (var k = 0; k < st.aurList.length; k++) {
          if (st.aurList[k].nominal && sameMask(st.aurList[k].nominal, nominal)) {
            dup = true;
            break;
          }
        }
        if (dup) continue;
        var seen = {};
        var ns = 0;
        for (k = 0; k < 8; k++) {
          for (var q = 0; q < 4; q++) {
            var s = cSets[V[k] * 4 + q];
            if (!seen[s]) {
              seen[s] = 1;
              ns++;
            }
          }
        }
        if (ns !== 16) continue;
        st.aurList.push({ cands: U, mask: maskOf(U), nominal: nominal, thr: 3 - fixed });
        if (st.aurList.length === 32) return;
      }
    }
  }

  function generalAur(st, marks) {
    var size;
    if (!st.givens) {
      size = generalSize(st, st, marks);
      if (size >= 0) addGeneral(st, marks.slice(), size - 1);
      return;
    }
    var cs = st.cs;
    var givens = st.givens;
    var cellMarks = new Int32Array(81);
    var values = new Array(81);
    var cands = new Array(81);
    var fixed = 0;
    var i, cell, d;
    for (i = 0; i < marks.length; i++) cellMarks[TLE.cCell[marks[i]]] |= 1 << cD0[marks[i]];
    for (cell = 0; cell < 81; cell++) {
      var v = -1;
      var bits = 0;
      for (d = 0; d < 9; d++) {
        if (cs[cell * 9 + d] === 2) v = d;
        else if (cs[cell * 9 + d] === 1) bits |= 1 << d;
      }
      var mk = cellMarks[cell];
      values[cell] = 0;
      cands[cell] = bits | mk;
      if (mk === 0) {
        values[cell] = v + 1;
      } else if (v >= 0) {
        if (givens[cell] || !(mk & (1 << v))) return;
        fixed++;
      } else if (!(bits & mk)) {
        return;
      }
    }
    var b = TLE.newState();
    TLE.loadBoard(b, values, cands);
    size = generalSize(st, b, marks);
    if (size < 0 || size - 1 - fixed < 0) return;
    var U = [];
    for (i = 0; i < marks.length; i++) if (cs[marks[i]] === 1) U.push(marks[i]);
    addGeneral(st, U, size - 1 - fixed);
  }

  function generalSize(st, b, marks) {
    var n = marks.length;
    var cs = b.cs;
    var i, k, q, s;
    for (i = 0; i < n; i++) if (cs[marks[i]] !== 1) return -1;
    var P = maskOf(marks);
    var L = [];
    var cntIn = new Int32Array(324);
    for (i = 0; i < n; i++) {
      for (q = 0; q < 4; q++) {
        s = cSets[marks[i] * 4 + q];
        if (cntIn[s] === 0) L.push(s);
        cntIn[s]++;
      }
    }
    var typeCount = [0, 0, 0, 0];
    for (k = 0; k < L.length; k++) typeCount[(L[k] / 81) | 0]++;
    for (s = 0; s < 324; s++) if (cntIn[s] === 1) return -1;
    var m = Math.min(typeCount[0], typeCount[1], typeCount[2], typeCount[3]);
    var setOff = b.setOff;
    var setLen = b.setLen;
    var setList = b.setList;
    var setMask = b.setMask;
    function inP(c) {
      return (P[c >> 5] & (1 << (c & 31))) !== 0;
    }
    function subsetOfP(s) {
      for (var w = 0; w < NW; w++) if (setMask[s * NW + w] & ~P[w]) return false;
      return true;
    }
    function declare(cover, order, relaxedBits) {
      var optOf = new Int32Array(729);
      var optCand = [-1];
      for (var t = 0; t < order.length; t++) {
        var ss = order[t];
        cover.addItem(t + 1, 1);
        for (var kk = setOff[ss]; kk < setOff[ss] + setLen[ss]; kk++) {
          var c = setList[kk];
          if (!inP(c)) continue;
          var o = optOf[c];
          if (o === 0) {
            o = optCand.length;
            optCand.push(c);
            optOf[c] = o;
            cover.addOption(o, 1);
          }
          cover.addEntry(t + 1, o);
        }
      }
      return optCand;
    }
    var orderA = [];
    for (k = 0; k < L.length; k++) if (subsetOfP(L[k])) orderA.push(L[k]);
    for (k = 0; k < L.length; k++) if (!subsetOfP(L[k])) orderA.push(L[k]);
    var coverA = new TLE.Cover(orderA.length + 1, n + 1);
    declare(coverA, orderA);
    var A = 0;
    var sA = -1;
    var sizesDiffer = false;
    coverA.run(function (sel, depth) {
      if (A === 0) sA = depth;
      else if (depth !== sA) sizesDiffer = true;
      A++;
      return false;
    });
    if (sizesDiffer) return -1;
    var kind = 0;
    var B = 0;
    var sB = -1;
    if (A >= 2) kind = 2;
    else if (A === 0) {
      var relaxed = [];
      var isRelaxed = new Uint8Array(324);
      for (k = 0; k < L.length; k++) {
        if (typeCount[(L[k] / 81) | 0] > m) {
          relaxed.push(L[k]);
          isRelaxed[L[k]] = 1;
        }
      }
      if (relaxed.length <= 64) {
        var orderB = [];
        for (k = 0; k < L.length; k++) if (!isRelaxed[L[k]] && subsetOfP(L[k])) orderB.push(L[k]);
        for (k = 0; k < L.length; k++) if (!isRelaxed[L[k]] && !subsetOfP(L[k])) orderB.push(L[k]);
        for (k = 0; k < relaxed.length; k++) orderB.push(relaxed[k]);
        var coverB = new TLE.Cover(orderB.length + 1, n + relaxed.length + 1);
        var optCand = declare(coverB, orderB);
        var nPatOpt = optCand.length - 1;
        var nextOpt = optCand.length;
        var relaxedIdx = new Int32Array(324).fill(-1);
        for (k = 0; k < relaxed.length; k++) relaxedIdx[relaxed[k]] = k;
        for (k = 0; k < relaxed.length; k++) {
          s = relaxed[k];
          /* @edition-slot marks-001 */
          coverB.addOption(nextOpt, 1);
          coverB.addEntry(orderB.indexOf(s) + 1, nextOpt);
          nextOpt++;
        }
        var fpLo = new Int32Array(nPatOpt + 1);
        var fpHi = new Int32Array(nPatOpt + 1);
        for (k = 1; k <= nPatOpt; k++) {
          var cc = optCand[k];
          for (q = 0; q < 4; q++) {
            var ri = relaxedIdx[cSets[cc * 4 + q]];
            if (ri < 0) continue;
            if (ri < 32) fpLo[k] |= 1 << ri;
            else fpHi[k] |= 1 << (ri - 32);
          }
        }
        var firstT = -1;
        var multiShape = false;
        var fps = new Map();
        var stopped = false;
        var count = 0;
        coverB.run(function (sel, depth) {
          var t = 0;
          var lo = 0;
          var hi = 0;
          for (var z = 0; z < depth; z++) {
            var id = sel[z];
            if (id <= nPatOpt) {
              t++;
              lo |= fpLo[id];
              hi |= fpHi[id];
            }
          }
          if (firstT < 0) firstT = t;
          else if (t !== firstT) multiShape = true;
          var key = (hi >>> 0) + ":" + (lo >>> 0);
          var prev = fps.get(key);
          if (prev === undefined) {
            fps.set(key, 0);
            if (fps.size === 4000) {
              stopped = true;
              return true;
            }
          } else {
            fps.set(key, prev + 1);
          }
          count++;
          return false;
        });
        var open = false;
        if (!stopped) {
          fps.forEach(function (v) {
            if (v === 0) open = true;
          });
        }
        if (multiShape) return -1;
        if (open) return -1;
        B = count;
        if (B >= 1) sB = firstT;
      }
      if (B >= 2) kind = 3;
    }
    var cells = typeCount[2];
    var r = A !== 0 ? A : B;
    if (2 * cells === n) {
      var ok = true;
      for (k = 0; k < L.length; k++) {
        s = L[k];
        if (setLen[s] !== 2) {
          var cntP = 0;
          for (var z = setOff[s]; z < setOff[s] + setLen[s]; z++) if (inP(setList[z])) cntP++;
          if (cntP !== 2) {
            ok = false;
            break;
          }
        }
      }
      if (ok) {
        kind = 4;
        var used = 0;
        for (var cell = 0; cell < 81; cell++) if (setLen[162 + cell] > 0) used++;
        if (used === cells) kind = 5;
        if (r === 0) kind |= 0x100;
      }
    }
    if (kind === 0) return -1;
    return A >= 1 ? sA : B >= 1 ? sB : m;
  }

  function localMask(st, mask) {
    var W = st.solW;
    var out = new Uint32Array(W);
    var tcList = st.tcList;
    for (var t = 0; t < tcList.length; t++) {
      var c = tcList[t];
      if (mask[c >> 5] & (1 << (c & 31))) out[t >> 5] |= 1 << (t & 31);
    }
    return out;
  }

  TLE.aurOf = function (st, s) {
    var hit = -1;
    for (var a = 0; a < st.aurList.length; a++) {
      var m = st.aurList[a].mask;
      for (var w = 0; w < NW; w++) {
        if (st.setMask[s * NW + w] & m[w]) {
          if (hit >= 0) return -2;
          hit = a;
          break;
        }
      }
    }
    return hit;
  };

  TLE.permFilter = function (st, lone) {
    var useAur = st.aurList.length > 0 && st.applyAur;
    var useExtra = st.applyMode;
    if (!useAur && !useExtra) return null;
    var W = st.solW;
    var tcLocal = st.tcLocal;
    var nA = useAur ? st.aurList.length : 0;
    var aurLoc = [];
    var thr = [];
    var ways = [];
    var floor = new Int32Array(nA);
    var low = new Int32Array(nA).fill(0x7fffffff);
    var seen = new Int32Array(nA);
    var free = 1;
    var sets = [];
    var a, d, k;
    for (a = 0; a < nA; a++) {
      aurLoc.push(localMask(st, st.aurList[a].mask));
      thr.push(st.aurList[a].thr);
      ways.push([1]);
    }
    for (var i = 0; i < lone.length; i++) {
      var s = lone[i];
      a = TLE.aurOf(st, s);
      var cands = [];
      var inside = [];
      var nIn = 0;
      for (k = st.setOff[s]; k < st.setOff[s] + st.setLen[s]; k++) {
        var li = tcLocal[st.setList[k]];
        var hit = a >= 0 && (aurLoc[a][li >> 5] & (1 << (li & 31))) !== 0 ? 1 : 0;
        cands.push(li);
        inside.push(hit);
        nIn += hit;
      }
      var all = nIn === cands.length ? 1 : 0;
      sets.push({ aur: a, cands: cands, inside: inside, min: all });
      if (a < 0) {
        free *= cands.length;
        continue;
      }
      var g = ways[a];
      var h = new Array(g.length + 1).fill(0);
      for (k = 0; k < g.length; k++) {
        h[k] += g[k] * (cands.length - nIn);
        h[k + 1] += g[k] * nIn;
      }
      ways[a] = h;
      floor[a] += all;
    }
    var upTo = [];
    var above = [];
    for (a = 0; a < nA; a++) {
      var n = ways[a].length;
      var lo = new Array(n + 1).fill(0);
      var hi = new Array(n + 1).fill(0);
      for (d = 0; d < n; d++) lo[d + 1] = lo[d] + ways[a][d];
      for (d = n - 1; d >= 0; d--) hi[d] = hi[d + 1] + ways[a][d];
      upTo.push(lo);
      above.push(hi);
    }
    if (sets.length > 0) st.lone = { sets: sets, aurLoc: aurLoc, thr: thr, floor: floor, low: low };
    if (useAur) st.failSols = new Uint32Array(16 * W);
    var vLoc = useExtra ? localMask(st, st.setMask.subarray(324 * NW, 325 * NW)) : null;
    var N = st.vN;
    var fails = 0;
    return function (buf, base) {
      var q;
      var ok = free;
      var bad = 0;
      for (var a = 0; a < nA; a++) {
        var um = aurLoc[a];
        var n = 0;
        for (q = 0; q < W; q++) n += bitCount(buf[base + q] & um[q]);
        seen[a] = n;
        var cut = Math.min(Math.max(thr[a] - n + 1, 0), ways[a].length);
        bad = bad * upTo[a][ways[a].length] + ok * above[a][cut];
        ok *= upTo[a][cut];
      }
      fails += bad;
      st.aurFailed = fails < 1000 ? fails : 1000;
      var pass = ok > 0;
      if (pass && useExtra) {
        var nw = 0;
        for (q = 0; q < W; q++) nw += bitCount(buf[base + q] & vLoc[q]);
        if (N === 1 ? nw === 0 : nw < N) pass = false;
      }
      if (!pass) {
        if (bad > 0 && st.nfail < 1000) {
          var need = (st.nfail + 1) * W;
          if (st.failSols.length < need) {
            var nb = new Uint32Array(Math.max(need, st.failSols.length * 2));
            nb.set(st.failSols);
            st.failSols = nb;
          }
          for (q = 0; q < W; q++) st.failSols[st.nfail * W + q] = buf[base + q];
          st.nfail++;
        }
        return 0;
      }
      for (a = 0; a < nA; a++) if (seen[a] < low[a]) low[a] = seen[a];
      return ok;
    };
  };

  TLE.loneMasks = function (st, open) {
    var lone = st.lone;
    if (lone === null) return null;
    var W = st.solW;
    var uni = new Uint32Array(W);
    var all = new Uint32Array(W);
    for (var i = 0; i < lone.sets.length; i++) {
      var set = lone.sets[i];
      var a = set.aur;
      var room = open || a < 0 ? 1 : lone.thr[a] - lone.low[a] - lone.floor[a] + set.min;
      var alive = -1;
      var count = 0;
      for (var k = 0; k < set.cands.length; k++) {
        if (set.inside[k] > room) continue;
        alive = set.cands[k];
        uni[alive >> 5] |= 1 << (alive & 31);
        count++;
      }
      if (count === 1) all[alive >> 5] |= 1 << (alive & 31);
    }
    return [uni, all];
  };

  TLE.aurPreMeasure = function (st) {
    if (!(st.aurList.length > 0 && st.applyAur && st.aurFailed > 0)) return null;
    var W = st.solW;
    var n = st.nsol + st.nfail;
    var ext = new Uint32Array(n * W);
    ext.set(st.sols.subarray(0, st.nsol * W));
    ext.set(st.failSols.subarray(0, st.nfail * W), st.nsol * W);
    var saveKz = st.kz.slice();
    var r = TLE.sweepCounts(st, ext, n, false, TLE.loneMasks(st, true));
    st.kz.set(saveKz);
    return r;
  };

  TLE.aurPostMeasure = function (st, pre) {
    if (!pre) return;
    if (pre[0] !== st.nkill) st.aurCause |= 1;
    if (pre[1] !== st.nlive) st.aurCause |= 2;
  };

  TLE.vsetMeasure = function (st) {
    st.isvir = 0;
    st.visnp = 0;
    st.visnn = 0;
    if (st.vN === 0) return;
    if (st.nv % 256 === 0) return;
    if (!st.vapply) return;
    if (st.nsol < 1) return;
    var vm = st.setMask.subarray(324 * NW, 325 * NW);
    for (var w = 0; w < NW; w++) if (vm[w] & ~st.TC[w]) return;
    var W = st.solW;
    var vLoc = localMask(st, vm);
    var vCount = 0;
    for (w = 0; w < W; w++) vCount += bitCount(vLoc[w]);
    var r = 5;
    var minP = 1 << 30;
    var minN = 1 << 30;
    var sols = st.sols;
    for (var p = 0; p < st.nsol; p++) {
      var inter = 0;
      for (w = 0; w < W; w++) inter += bitCount(sols[p * W + w] & vLoc[w]);
      if (inter === 0) r = 4;
      if (inter < minP) minP = inter;
      if (vCount - inter < minN) minN = vCount - inter;
    }
    for (p = 0; p < st.nsol; p++) {
      var inter2 = 0;
      for (w = 0; w < W; w++) inter2 += bitCount(sols[p * W + w] & vLoc[w]);
      if (inter2 === vCount) r &= ~4;
    }
    st.isvir = r;
    if (r & 1) st.visnp = minP;
    if (r & 4) st.visnn = minN;
  };
})();
