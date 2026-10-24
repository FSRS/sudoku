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
    st.vapply = !!input.vapply;
    st.vcount = input.vcount | 0;
    st.vN = st.vcount & 15;
    var cs = st.cs;
    var marks = st.marks;
    var i, c;
    if (input.aurMarks) for (i = 0; i < input.aurMarks.length; i++) marks[input.aurMarks[i]] |= 1;
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
      if ((marks[c] & 1) && aurMarks.length < 64) aurMarks.push(c);
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
    var marks = st.aurMarks;
    var n = marks.length;
    if (n <= 1) return;
    if (!st.uniqueSolution) return;
    if (n <= 9) classicAur(st, marks);
    else generalAur(st, marks);
  };

  function maskOf(cands) {
    var m = new Uint32Array(NW);
    for (var i = 0; i < cands.length; i++) m[cands[i] >> 5] |= 1 << (cands[i] & 31);
    return m;
  }

  function sameMask(a, b) {
    for (var w = 0; w < NW; w++) if (a[w] !== b[w]) return false;
    return true;
  }

  function classicAur(st, marks) {
    var n = marks.length;
    var cs = st.cs;
    var cnt = 0;
    for (var i = 0; i < n - 1; i++) {
      for (var j = i + 1; j < n; j++) {
        var a = marks[i];
        var b = marks[j];
        if (cRow[a] === cRow[b] || cCol[a] === cCol[b]) continue;
        if (cD0[a] === cD0[b]) continue;
        var U = [];
        var rs = [cRow[a], cRow[b]];
        var ks = [cCol[a], cCol[b]];
        var ds = [cD0[a], cD0[b]];
        var okAll = true;
        for (var x = 0; x < 2; x++) {
          for (var y = 0; y < 2; y++) {
            for (var z = 0; z < 2; z++) {
              var c = rs[x] * 81 + ks[y] * 9 + ds[z];
              if (cs[c] !== 1) okAll = false;
              U.push(c);
            }
          }
        }
        if (!okAll) continue;
        U.sort(function (p, q) {
          return p - q;
        });
        var m = maskOf(U);
        var dup = false;
        for (var k = 0; k < st.aurList.length; k++) {
          if (sameMask(st.aurList[k].mask, m)) {
            dup = true;
            break;
          }
        }
        if (dup) continue;
        var seen = {};
        var ns = 0;
        for (k = 0; k < 8; k++) {
          for (var q = 0; q < 4; q++) {
            var s = cSets[U[k] * 4 + q];
            if (!seen[s]) {
              seen[s] = 1;
              ns++;
            }
          }
        }
        if (ns !== 16) continue;
        st.aurList.push({ cands: U, mask: m, thr: 3 });
        cnt++;
        if (cnt === 32) return;
      }
    }
  }

  function generalAur(st, marks) {
    var n = marks.length;
    var cs = st.cs;
    var i, k, q, s;
    for (i = 0; i < n; i++) if (cs[marks[i]] !== 1) return;
    var P = maskOf(marks);
    var L = [];
    var cntIn = new Int32Array(324);
    for (i = 0; i < n; i++) {
      for (q = 0; q < 4; q++) {
        s = cSets[marks[i] * 4 + q];
        if (cntIn[s] === 0) {
          if (L.length === 200) return;
          L.push(s);
        }
        cntIn[s]++;
      }
    }
    var typeCount = [0, 0, 0, 0];
    for (k = 0; k < L.length; k++) typeCount[(L[k] / 81) | 0]++;
    for (s = 0; s < 324; s++) if (cntIn[s] === 1) return;
    var m = Math.min(typeCount[0], typeCount[1], typeCount[2], typeCount[3]);
    var setOff = st.setOff;
    var setLen = st.setLen;
    var setList = st.setList;
    var setMask = st.setMask;
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
    if (sizesDiffer) return;
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
        if (multiShape) return;
        if (open) return;
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
    if (kind === 0) return;
    var size = A >= 1 ? sA : B >= 1 ? sB : m;
    st.aurList.push({ cands: marks.slice(), mask: P, thr: size - 1 });
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

  TLE.permFilter = function (st) {
    var useAur = st.aurList.length > 0 && st.applyAur;
    var useExtra = st.applyMode;
    if (!useAur && !useExtra) return null;
    var W = st.solW;
    var aurLoc = [];
    var thr = [];
    if (useAur) {
      for (var k = 0; k < st.aurList.length; k++) {
        aurLoc.push(localMask(st, st.aurList[k].mask));
        thr.push(st.aurList[k].thr);
      }
      st.failSols = new Uint32Array(16 * W);
    }
    var vLoc = useExtra ? localMask(st, st.setMask.subarray(324 * NW, 325 * NW)) : null;
    var N = st.vN;
    return function (st2, buf, base) {
      var q;
      if (useAur) {
        for (var a = 0; a < aurLoc.length; a++) {
          var um = aurLoc[a];
          var n = 0;
          for (q = 0; q < W; q++) n += bitCount(buf[base + q] & um[q]);
          if (n > thr[a]) {
            if (st.aurFailed < 1000) {
              var need = (st.aurFailed + 1) * W;
              if (st.failSols.length < need) {
                var nb = new Uint32Array(Math.max(need, st.failSols.length * 2));
                nb.set(st.failSols);
                st.failSols = nb;
              }
              for (q = 0; q < W; q++) st.failSols[st.aurFailed * W + q] = buf[base + q];
              st.aurFailed++;
            }
            return false;
          }
        }
      }
      if (useExtra) {
        var nw = 0;
        for (q = 0; q < W; q++) nw += bitCount(buf[base + q] & vLoc[q]);
        if (N === 1 ? nw === 0 : nw < N) return false;
      }
      return true;
    };
  };

  TLE.aurPreMeasure = function (st) {
    if (!(st.aurList.length > 0 && st.applyAur && st.aurFailed > 0)) return null;
    var W = st.solW;
    var n = st.nsol + st.aurFailed;
    var ext = new Uint32Array(n * W);
    ext.set(st.sols.subarray(0, st.nsol * W));
    ext.set(st.failSols.subarray(0, st.aurFailed * W), st.nsol * W);
    var saveKz = st.kz.slice();
    var r = TLE.sweepCounts(st, ext, n, false);
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
