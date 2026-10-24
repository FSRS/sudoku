var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  var NW = TLE.NW;
  var bitCount = TLE.bitCount;
  var cRow = TLE.cRow;
  var cCol = TLE.cCol;
  var cD0 = TLE.cD0;
  var cBox = TLE.cBox;
  var cSets = TLE.cSets;

  function neighbors(st, p) {
    if (!st.nbCache) st.nbCache = new Array(729);
    var nb = st.nbCache[p];
    if (nb) return nb;
    if (st.cs[p] !== 1) return (st.nbCache[p] = new Int16Array(0));
    var setOff = st.setOff;
    var setLen = st.setLen;
    var setList = st.setList;
    var tmp = [];
    for (var q = 0; q < 4; q++) {
      var s = cSets[p * 4 + q];
      for (var k = setOff[s]; k < setOff[s] + setLen[s]; k++) {
        var c = setList[k];
        if (c !== p) tmp.push(c * 4 + q);
      }
    }
    tmp.sort(function (a, b) {
      return a - b;
    });
    nb = new Int16Array(tmp.length * 2);
    for (var i = 0; i < tmp.length; i++) {
      nb[i * 2] = tmp[i] >> 2;
      nb[i * 2 + 1] = cSets[p * 4 + (tmp[i] & 3)];
    }
    st.nbCache[p] = nb;
    return nb;
  }
  TLE.neighbors = neighbors;

  TLE.initStats = function (st) {
    st.Tr = new Int32Array(16);
    st.Tc = new Int32Array(16);
    st.Tn = new Int32Array(16);
    st.Tb = new Int32Array(16);
    st.tRow = 0;
    st.tCol = 0;
    st.tCell = 0;
    st.tBox = 0;
    st.nBival = 0;
    st.nBiloc = 0;
    st.nDig = 0;
    st.digUse = new Int32Array(9);
    st.rowsT = 0;
    st.colsT = 0;
    st.digsT = 0;
    st.boxesT = 0;
    st.nRowsT = 0;
    st.nColsT = 0;
    st.nBoxesT = 0;
    st.oneLine = false;
    st.lRow = 0;
    st.lCol = 0;
    st.lCell = 0;
    st.lBox = 0;
    st.ltn = new Uint8Array(326);
    st.P = new Int32Array(16);
    st.Pr = new Int32Array(16);
    st.Pc = new Int32Array(16);
    st.Pn = new Int32Array(16);
    st.Pb = new Int32Array(16);
    st.hits = new Uint8Array(729);
    st.DUP = new Uint32Array(NW);
    st.ovl = 0;
    st.U = new Int32Array(16);
    st.R = new Int32Array(16);
    st.B = new Int32Array(16);
    st.L = new Int32Array(16);
    st.Q = new Int32Array(16);
    st.minR = 0;
    st.maxR = 0;
    st.kMin = 99;
    st.kMax = 0;
    st.killDigits = 0;
  };

  TLE.pathStats = function (st) {
    var x = st;
    if (!st.nbCache) st.nbCache = new Array(729);
    var role = st.role;
    role.fill(0);
    var truths = st.truths;
    var setOff = st.setOff;
    var setLen = st.setLen;
    var setList = st.setList;
    var TU = st.TU;
    var i, k, s, c, q;
    for (i = 0; i < st.nT; i++) {
      s = truths[i];
      if (s === 324) continue;
      role[s] |= 1;
      var n = setLen[s];
      var kind = (s / 81) | 0;
      if (n === 2) {
        if (kind === 2) x.nBival++;
        else x.nBiloc++;
      }
      if (kind === 2) {
        x.tCell++;
        x.Tn[n]++;
      } else if (kind === 0) {
        x.tRow++;
        x.Tr[n]++;
      } else if (kind === 1) {
        x.tCol++;
        x.Tc[n]++;
      } else {
        x.tBox++;
        x.Tb[n]++;
      }
      for (k = setOff[s]; k < setOff[s] + n; k++) {
        c = setList[k];
        x.rowsT |= 1 << cRow[c];
        x.colsT |= 1 << cCol[c];
        x.digsT |= 1 << cD0[c];
        x.boxesT |= 1 << cBox[c];
        if (x.digUse[cD0[c]] === 0) x.nDig++;
        x.digUse[cD0[c]]++;
      }
    }
    x.nRowsT = bitCount(x.rowsT);
    x.nColsT = bitCount(x.colsT);
    x.nBoxesT = bitCount(x.boxesT);
    var hits = x.hits;
    var ovl = 0;
    for (var j = 0; j < st.nL; j++) {
      s = st.links[j];
      if (!(st.linkState[s] & 0x8000)) continue;
      role[s] |= 2;
      var nt = 0;
      if (s === 324) {
        if (TU[0] & 1) {
          for (k = 0; k < st.nv; k++) {
            nt++;
            var f0 = hits[0];
            if (f0 > ovl) ovl = f0;
            hits[0] = f0 + 1;
            if (f0 + 1 >= 2) x.DUP[0] |= 1;
          }
        }
      } else {
        for (k = setOff[s]; k < setOff[s] + setLen[s]; k++) {
          c = setList[k];
          if ((TU[c >> 5] & (1 << (c & 31))) === 0) continue;
          nt++;
          var f = hits[c];
          if (f > ovl) ovl = f;
          hits[c] = f + 1;
          if (f + 1 >= 2) x.DUP[c >> 5] |= 1 << (c & 31);
        }
      }
      var ntx = nt & 15;
      if (s < 81) {
        x.lRow++;
        x.Pr[ntx]++;
      } else if (s < 162) {
        x.lCol++;
        x.Pc[ntx]++;
      } else if (s < 243) {
        x.lCell++;
        x.Pn[ntx]++;
      } else {
        x.lBox++;
        x.Pb[ntx]++;
      }
      x.ltn[s] = nt;
      x.P[ntx]++;
    }
    x.ovl = ovl;
    var killMask = st.killMask;
    var mark = new Int32Array(326);
    var minR = 0;
    var maxR = 0;
    for (i = 0; i < st.nT; i++) {
      var t0 = truths[i];
      var m = i + 1;
      var self = 0;
      var cross = 0;
      var sharedN = 0;
      var crossCand = 0;
      var other = 0;
      var prev = 0;
      var killedCand = 0;
      for (k = setOff[t0]; k < setOff[t0] + setLen[t0]; k++) {
        var p = setList[k];
        var nb = neighbors(st, p);
        if (nb.length === 0) continue;
        var newT = 0;
        var killed = 0;
        for (var e = 0; e < nb.length; e += 2) {
          var qc = nb[e];
          var s2 = nb[e + 1];
          if (!(role[s2] & 2)) continue;
          if (x.ltn[s2] > 1 && mark[s2] !== m) {
            sharedN++;
            mark[s2] = m;
          }
          if (killMask[qc >> 5] & (1 << (qc & 31))) {
            killed++;
            continue;
          }
          for (q = 0; q < 4; q++) {
            var t = cSets[qc * 4 + q];
            if (t === s2 || !(role[t] & 1)) continue;
            if (t === t0) {
              role[t0] |= 4;
              self++;
              role[s2] |= 4;
            } else {
              role[s2] |= 8;
              cross++;
              if (mark[t] !== m) {
                newT++;
                mark[t] = m;
              }
            }
          }
        }
        if (newT !== 0) other += newT;
        if (cross === prev) {
          if (killed !== 0) killedCand++;
        } else {
          crossCand++;
          prev = cross;
        }
      }
      var u = killedCand !== 0 ? other + 1 : other;
      x.B[(self >> 1) & 15]++;
      x.R[prev & 15]++;
      x.L[sharedN & 15]++;
      x.Q[crossCand & 15]++;
      x.U[u & 15]++;
      if (i === 0 || prev < minR) minR = prev;
      if (i === 0 || prev > maxR) maxR = prev;
    }
    x.minR = minR;
    x.maxR = maxR;
  };

  TLE.killStats = function (st) {
    var x = st;
    var kMin = 99;
    var kMax = 0;
    var digits = 0;
    for (var i = 0; i < st.kills.length; i++) {
      var c = st.kills[i];
      digits |= 1 << cD0[c];
      var n = 0;
      for (var q = 0; q < 4; q++) if (st.role[cSets[c * 4 + q]] & 2) n++;
      if (n < kMin) kMin = n;
      if (n > kMax) kMax = n;
    }
    x.kMin = kMin;
    x.kMax = kMax;
    x.killDigits = digits;
  };
})();
