var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  var NW = TLE.NW;
  var PUSH_LIMIT = 49999999;

  function exactMin(st, limit) {
    var truths = st.truths;
    var nT = st.nT;
    var linkState = st.linkState;
    var setOff = st.setOff;
    var setLen = st.setLen;
    var setList = st.setList;
    var cSets = TLE.cSets;
    var isTruth = new Uint8Array(326);
    var i, k, q, s;
    for (i = 0; i < nT; i++) isTruth[truths[i]] = 1;
    var nItems = 0;
    for (i = 0; i < nT; i++) nItems += setLen[truths[i]];
    var cover = new TLE.Cover(nItems + 1, 326);
    var optDone = new Uint8Array(326);
    var item = 0;
    for (i = 0; i < nT; i++) {
      s = truths[i];
      for (k = setOff[s]; k < setOff[s] + setLen[s]; k++) {
        var c = setList[k];
        item++;
        cover.addItem(item, 1);
        for (q = 0; q < 4; q++) {
          var o = cSets[c * 4 + q];
          if (!(linkState[o] & 0x8000) || isTruth[o]) continue;
          if (!optDone[o]) {
            optDone[o] = 1;
            cover.addOption(o + 1, 1);
          }
          cover.addEntry(item, o + 1);
        }
      }
    }
    cover.limit = limit;
    var count = 0;
    var best = 0;
    cover.run(function (sel, depth) {
      count++;
      if (best === 0 || depth < best) best = depth;
      return false;
    });
    st.nExact = count;
    return best;
  }

  function fallback(st, d) {
    var nset = st.nset;
    var span = st.spanList;
    var n = span.length;
    if (n > 256) return 0;
    var uList = [];
    var uLocal = new Int16Array(729).fill(-1);
    var tu = st.TU;
    var w, i, k;
    for (w = 0; w < NW; w++) {
      var x = tu[w];
      while (x !== 0) {
        var low = x & -x;
        var c = (w << 5) + 31 - Math.clz32(low);
        uLocal[c] = uList.length;
        uList.push(c);
        x ^= low;
      }
    }
    var UW = (uList.length + 31) >> 5;
    if (UW === 0) UW = 1;
    var full = new Uint32Array(UW);
    for (i = 0; i < uList.length; i++) full[i >> 5] |= 1 << (i & 31);
    var X = new Uint32Array(n * UW);
    var setOff = st.setOff;
    var setLen = st.setLen;
    var setList = st.setList;
    for (i = 0; i < n; i++) {
      var s = span[i];
      for (k = setOff[s]; k < setOff[s] + setLen[s]; k++) {
        var li = uLocal[setList[k]];
        if (li >= 0) X[i * UW + (li >> 5)] |= 1 << (li & 31);
      }
    }
    var variantB = n >= 128;
    var UsW = variantB ? 8 : (n + 31) >> 5;
    if (UsW === 0) UsW = 1;
    if (variantB && !st.fallbackUsed) st.fallbackUsed = new Uint32Array(8);
    for (k = 0; k <= d; k++) {
      var r = search(nset + k);
      if (r === -1) return -1;
      if (r === 1) return nset + k;
    }
    return 0;

    function search(size) {
      var used;
      if (variantB) {
        used = st.fallbackUsed;
        for (var qq = 0; qq < 7; qq++) used[qq] = used[7];
      } else {
        used = new Uint32Array(UsW);
      }
      var cover = new Uint32Array(UW);
      var c1 = new Uint32Array(UW);
      var c2 = new Uint32Array(UW);
      var c3 = new Uint32Array(UW);
      var tgt = new Uint32Array(UW);
      var cap = 64;
      var stI = new Int32Array(cap);
      var stLv = new Int32Array(cap);
      var stCv = new Uint32Array(cap * UW);
      var stUs = variantB ? null : new Uint32Array(cap * UsW);
      var top = 0;
      var level = -1;
      var pushes = 0;
      var ok = true;
      var expand = true;
      var a, b, ww;
      for (;;) {
        if (expand) {
          c1.fill(0);
          c2.fill(0);
          c3.fill(0);
          for (a = 0; a < n; a++) {
            if (used[a >> 5] & (1 << (a & 31))) continue;
            for (ww = 0; ww < UW; ww++) {
              var xv = X[a * UW + ww];
              c3[ww] |= c2[ww] & xv;
              c2[ww] |= c1[ww] & xv;
              c1[ww] |= xv;
            }
          }
          var anySum = false;
          for (ww = 0; ww < UW; ww++) if (c1[ww] & ~cover[ww]) anySum = true;
          if (anySum) {
            var anyOnce = false;
            var anyTwice = false;
            for (ww = 0; ww < UW; ww++) {
              if (c1[ww] & ~cover[ww] & ~c2[ww]) anyOnce = true;
              if (c2[ww] & ~c3[ww] & ~cover[ww]) anyTwice = true;
            }
            for (ww = 0; ww < UW; ww++) {
              if (anyOnce) tgt[ww] = c1[ww] & ~cover[ww] & ~c2[ww];
              else if (anyTwice) tgt[ww] = c2[ww] & ~c3[ww] & ~cover[ww];
              else tgt[ww] = c3[ww] & ~cover[ww];
            }
            level++;
            for (a = 0; a < n; a++) {
              if (used[a >> 5] & (1 << (a & 31))) continue;
              var nonEmpty = false;
              for (ww = 0; ww < UW; ww++) if (tgt[ww] & X[a * UW + ww]) nonEmpty = true;
              if (!nonEmpty) continue;
              pushes++;
              if (top === cap) {
                cap *= 2;
                var nI = new Int32Array(cap);
                nI.set(stI);
                stI = nI;
                var nL = new Int32Array(cap);
                nL.set(stLv);
                stLv = nL;
                var nC = new Uint32Array(cap * UW);
                nC.set(stCv);
                stCv = nC;
                if (stUs) {
                  var nU = new Uint32Array(cap * UsW);
                  nU.set(stUs);
                  stUs = nU;
                }
              }
              stI[top] = a;
              stLv[top] = level;
              for (ww = 0; ww < UW; ww++) stCv[top * UW + ww] = cover[ww];
              if (stUs) for (ww = 0; ww < UsW; ww++) stUs[top * UsW + ww] = used[ww];
              top++;
              for (ww = 0; ww < UW; ww++) tgt[ww] &= X[a * UW + ww];
            }
          }
          ok = pushes <= PUSH_LIMIT;
          expand = false;
        }
        if (top === 0 || !ok) return ok ? 0 : -1;
        top--;
        var pi = stI[top];
        level = stLv[top];
        for (ww = 0; ww < UW; ww++) cover[ww] = stCv[top * UW + ww];
        if (variantB) {
          used[0] = used[1] = used[2] = used[3] = 0;
        } else {
          for (ww = 0; ww < UsW; ww++) used[ww] = stUs[top * UsW + ww];
        }
        if (level >= size) continue;
        for (ww = 0; ww < UW; ww++) cover[ww] |= X[pi * UW + ww];
        used[pi >> 5] |= 1 << (pi & 31);
        var same = true;
        for (ww = 0; ww < UW; ww++) {
          if (cover[ww] !== full[ww]) {
            same = false;
            break;
          }
        }
        if (!same) {
          expand = true;
          continue;
        }
        return 1;
      }
    }
  }

  function computeRank(st, flag) {
    var nset = st.nset;
    if (st.nT > 25) return -1;
    st.flags |= 0x40000;
    st.rankOverlap = 0;
    if (nset === 1 && st.T[1] === 1) return 0;
    var d = st.nspan - nset;
    if (d === 0) return 0;
    if (nset <= 1) return d;
    var e = exactMin(st, nset + flag);
    if (e > 0) return e - nset;
    st.rankOverlap = 1;
    if (flag !== 0) return -1;
    var c = fallback(st, d);
    if (c === -1) return -1;
    if (c > 0) return c - nset;
    if (d > 8) return -1;
    return d;
  }

  TLE.computeRank = computeRank;
  TLE.exactMin = exactMin;
})();
