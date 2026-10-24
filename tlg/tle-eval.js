var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  var NW = TLE.NW;
  var ABORT = -999999;
  var SOL_LIMIT = 8388606;

  function ensureSols(st, need) {
    var buf = st.sols;
    if (buf.length >= need) return buf;
    var len = buf.length * 2;
    while (len < need) len *= 2;
    var nb = new Uint32Array(len);
    nb.set(buf);
    st.sols = nb;
    return nb;
  }

  function resetEval(st) {
    st.flags = 0;
    st.nkill = 0;
    st.nlive = 0;
    st.ndkill = 0;
    st.nsol = 0;
    st.nlsat = 0;
    st.nspan = 0;
    st.ncand = 0;
    st.rc = 0;
    st.rankField = 4096;
    var ls = st.linkState;
    for (var s = 0; s < 326; s++) {
      ls[s] &= 0x8000;
      st.linkTc[s] = 0;
      st.anaMark[s] = 0;
    }
    st.kz.fill(0);
    st.TC.fill(0);
    st.LC.fill(0);
    st.killMask.fill(0);
    st.kills = [];
    st.lives = [];
    st.tcLocal.fill(-1);
    st.tcList = [];
    st.aurFailed = 0;
    st.aurCause = 0;
    st.failSols = null;
    /* @edition-slot eval-001 */
  }

  function buildAndRun(st) {
    var truths = st.truths;
    var links = st.links;
    var nT = st.nT;
    var nL = st.nL;
    if (nT === 0) {
      st.flags |= 0x1000000;
      st.rc = st.flags >>> 0;
      return;
    }
    var setOff = st.setOff;
    var setLen = st.setLen;
    var setList = st.setList;
    var setMask = st.setMask;
    var linkState = st.linkState;
    var kz = st.kz;
    var tc = st.TC;
    var lc = st.LC;
    var i, j, k, w, s, c;
    var excluding = nT > 7 && nT - nL > 5;
    var mult = st.extraMult;
    if (st.aurList.length > 0 && st.applyAur) excluding = false;
    /* @edition-slot eval-002 */
    var lu = null;
    var shared = null;
    if (excluding) {
      lu = new Uint32Array(NW);
      for (j = 0; j < nL; j++) {
        s = links[j];
        if (linkState[s] & 0x8000) for (w = 0; w < NW; w++) lu[w] |= setMask[s * NW + w];
      }
      shared = new Uint8Array(729);
      for (i = 0; i < nT; i++) {
        s = truths[i];
        for (k = setOff[s], j = k + setLen[s]; k < j; k++) {
          c = setList[k];
          if (shared[c] < 2) shared[c]++;
        }
      }
    }
    var sizeSum = 0;
    for (i = 0; i < nT; i++) sizeSum += st.setSize[truths[i]];
    var cover = new TLE.Cover(nT + nL + 2, sizeSum + nL + 2);
    var optOf = new Int32Array(729);
    var optCand = [-1];
    var lastItem = new Int32Array(326);
    var itemId = 0;
    var bad = false;
    for (i = 0; i < nT; i++) {
      s = truths[i];
      var off = setOff[s];
      var len = setLen[s];
      if (excluding) {
        var drop = true;
        if (len > 0) {
          for (w = 0; w < NW; w++) {
            if (setMask[s * NW + w] & lu[w]) {
              drop = false;
              break;
            }
          }
          if (drop) {
            for (k = off; k < off + len; k++) {
              if (shared[setList[k]] >= 2) {
                drop = false;
                break;
              }
            }
          }
        }
        if (drop) continue;
      }
      var need = s === 324 ? mult : 1;
      itemId++;
      if (cover.addItem(itemId, need) !== 0) bad = true;
      lastItem[s] = itemId;
      for (k = off; k < off + len; k++) {
        c = setList[k];
        /* @edition-slot eval-004 */
        var o = optOf[c];
        if (o === 0) {
          o = optCand.length;
          optCand.push(c);
          optOf[c] = o;
          if (cover.addOption(o, 1) !== 0) bad = true;
        }
        if (cover.addEntry(itemId, o) !== 0) bad = true;
      }
      for (w = 0; w < NW; w++) tc[w] |= setMask[s * NW + w];
      st.anaMark[s] |= 1;
    }
    if (excluding && itemId <= 1) {
      st.flags |= 0x20000000 | 0x1000000;
      st.rc = ABORT;
      return;
    }
    for (j = 0; j < nL; j++) {
      s = links[j];
      if (!(linkState[s] & 0x8000)) continue;
      for (w = 0; w < NW; w++) lc[w] |= setMask[s * NW + w];
      itemId++;
      var needL = s === 324 ? mult : 1;
      if (cover.addItem(itemId, needL) !== 0) bad = true;
      lastItem[s] = itemId;
      var offL = setOff[s];
      var endL = offL + setLen[s];
      for (k = offL; k < endL; k++) {
        c = setList[k];
        /* @edition-slot eval-006 */
        var oL = optOf[c];
        if (oL === 0) {
          if ((tc[c >> 5] & (1 << (c & 31))) === 0) continue;
          oL = optCand.length;
          optCand.push(c);
          optOf[c] = oL;
          if (cover.addOption(oL, 1) !== 0) bad = true;
        }
        if (cover.addEntry(itemId, oL) !== 0) bad = true;
      }
      st.anaMark[s] |= 2;
      st.nspan++;
    }
    for (j = 0; j < nL; j++) {
      s = links[j];
      if (!(linkState[s] & 0x8000)) continue;
      /* @edition-slot eval-007 */
      var os = optCand.length;
      optCand.push(-1);
      if (cover.addOption(os, 1) !== 0) bad = true;
      if (cover.addEntry(lastItem[s], os) !== 0) bad = true;
    }
    if (bad) {
      st.flags |= 0x20000000 | 0x1000000;
      st.rc = ABORT;
      return;
    }

    var tcList = [];
    var tcLocal = st.tcLocal;
    for (w = 0; w < NW; w++) {
      var x = tc[w];
      while (x !== 0) {
        var low = x & -x;
        c = (w << 5) + 31 - Math.clz32(low);
        tcLocal[c] = tcList.length;
        tcList.push(c);
        x ^= low;
      }
    }
    st.tcList = tcList;
    var W = (tcList.length + 31) >> 5;
    if (W === 0) W = 1;
    st.solW = W;
    if (!st.sols || st.sols.length < 64 * W) st.sols = new Uint32Array(64 * W);

    var optLocal = new Int32Array(optCand.length);
    for (k = 0; k < optCand.length; k++) optLocal[k] = optCand[k] >= 0 ? tcLocal[optCand[k]] : -1;

    var forcedFail = false;
    /* @edition-slot eval-008 */
    var filt = TLE.permFilter(st);

    var overflow = false;
    if (!forcedFail) {
      var count = 0;
      cover.run(function (sel, depth) {
        var base = count * W;
        var buf = st.sols;
        if (buf.length < base + W) buf = ensureSols(st, base + W);
        for (var q = 0; q < W; q++) buf[base + q] = 0;
        for (var t = 0; t < depth; t++) {
          var li = optLocal[sel[t]];
          if (li >= 0) buf[base + (li >> 5)] |= 1 << (li & 31);
        }
        if (filt !== null && !filt(st, buf, base)) return false;
        count++;
        if (count > SOL_LIMIT) {
          overflow = true;
          return true;
        }
        return false;
      });
      st.nsol = count;
    }

    if (overflow) {
      st.nsol = 0;
      st.flags |= 0x20000000 | 0x1000000;
      st.rc = ABORT;
      return;
    }
    st.ncand = tcList.length;
    if (forcedFail) {
      st.flags |= 0x200000;
      st.rc = ABORT;
      return;
    }
    if (st.nsol === 0) {
      st.flags |= 0x80000000;
      TLE.putTag(st, 0);
      st.rc = ABORT;
      return;
    }
    st.rc = 0;
  }

  function sweepCounts(st, sols, nsol, record) {
    var W = st.solW;
    var tc = st.TC;
    var lc = st.LC;
    var tcLocal = st.tcLocal;
    var tcList = st.tcList;
    var linkState = st.linkState;
    var setOff = st.setOff;
    var setLen = st.setLen;
    var setList = st.setList;
    var cSets = TLE.cSets;
    var kz = st.kz;
    var nk = 0;
    var nl = 0;
    var xm = new Uint32Array(W);
    var w, p, k;
    for (w = 0; w < NW; w++) {
      var ext = lc[w] & ~tc[w];
      while (ext !== 0) {
        var low = ext & -ext;
        var c = (w << 5) + 31 - Math.clz32(low);
        ext ^= low;
        xm.fill(0);
        var any = false;
        for (var q = 0; q < 4; q++) {
          var s = cSets[c * 4 + q];
          if (!(linkState[s] & 0x8000)) continue;
          for (k = setOff[s], p = k + setLen[s]; k < p; k++) {
            var y = setList[k];
            if (y === c) continue;
            var li = tcLocal[y];
            if (li >= 0) {
              xm[li >> 5] |= 1 << (li & 31);
              any = true;
            }
          }
        }
        if (!any) continue;
        var killed = true;
        for (p = 0; p < nsol && killed; p++) {
          var base = p * W;
          var hit = false;
          for (k = 0; k < W; k++) {
            if (sols[base + k] & xm[k]) {
              hit = true;
              break;
            }
          }
          if (!hit) killed = false;
        }
        if (killed) {
          nk++;
          if (record) {
            kz[c] |= 1;
            st.killMask[c >> 5] |= 1 << (c & 31);
            st.kills.push(c);
          }
        }
      }
    }
    var uni = new Uint32Array(W);
    var all = new Uint32Array(W).fill(0xffffffff);
    for (p = 0; p < nsol; p++) {
      for (k = 0; k < W; k++) {
        uni[k] |= sols[p * W + k];
        all[k] &= sols[p * W + k];
      }
    }
    for (var t = 0; t < tcList.length; t++) {
      var bit = 1 << (t & 31);
      var cc = tcList[t];
      if ((uni[t >> 5] & bit) === 0) {
        nk++;
        if (record) {
          kz[cc] |= 3;
          st.killMask[cc >> 5] |= 1 << (cc & 31);
          st.kills.push(cc);
        }
      }
      if ((all[t >> 5] & bit) !== 0) {
        if (nl < 81) nl++;
        if (record) {
          kz[cc] |= 4;
          if (st.lives.length < 81) st.lives.push(cc);
        }
      }
    }
    return [nk, nl];
  }

  function eliminate(st) {
    st.kills = [];
    st.lives = [];
    st.killMask.fill(0);
    sweepCounts(st, st.sols, st.nsol, true);
    st.nkill = st.kills.length;
    st.nlive = st.lives.length;
    if (st.nkill > 0) st.flags |= 0x40000000;
  }

  function saturate(st) {
    var W = st.solW;
    var sols = st.sols;
    var nsol = st.nsol;
    var links = st.links;
    var linkState = st.linkState;
    var tcLocal = st.tcLocal;
    var setOff = st.setOff;
    var setLen = st.setLen;
    var setList = st.setList;
    var m = new Uint32Array(W);
    var nlsat = 0;
    for (var j = 0; j < links.length; j++) {
      var s = links[j];
      m.fill(0);
      var n = 0;
      for (var k = setOff[s], e = k + setLen[s]; k < e; k++) {
        var li = tcLocal[setList[k]];
        if (li >= 0) {
          n++;
          m[li >> 5] |= 1 << (li & 31);
        }
      }
      st.linkTc[s] = n & 255;
      if (n === 1) linkState[s] |= 0x1000;
      if (n === st.setSize[s]) linkState[s] |= 0x2000;
      if (!(linkState[s] & 0x8000)) continue;
      var sat = true;
      for (var p = 0; p < nsol && sat; p++) {
        var hit = false;
        for (var q = 0; q < W; q++) {
          if (sols[p * W + q] & m[q]) {
            hit = true;
            break;
          }
        }
        if (!hit) sat = false;
      }
      if (sat) {
        linkState[s] |= 0x4000;
        nlsat++;
      }
    }
    st.nlsat = nlsat;
  }

  function runEval(st, F) {
    resetEval(st);
    buildAndRun(st);
    if (st.rc !== 0) return st.rc;
    var pre = TLE.aurPreMeasure(st);
    eliminate(st);
    TLE.aurPostMeasure(st, pre);
    if (F !== 0) saturate(st);
    if ((F & 1) !== 0 && (F & 8) === 0) TLE.vsetMeasure(st);
    st.rc = 0;
    return 0;
  }

  TLE.runEval = runEval;
  TLE.sweepCounts = sweepCounts;
})();
