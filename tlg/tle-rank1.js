var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  var pat = TLE.pat || (TLE.pat = {});
  var tag = TLE.putTag;
  var NW = TLE.NW;
  var bitCount = TLE.bitCount;
  var cRow = TLE.cRow;
  var cCol = TLE.cCol;
  var cD0 = TLE.cD0;
  var cCell = TLE.cCell;
  var cBox = TLE.cBox;
  var cSets = TLE.cSets;

  var GROUP_SETS = new Int16Array(54 * 9);
  (function () {
    for (var t = 0; t < 6; t++) {
      for (var i = 0; i < 9; i++) {
        for (var p = 0; p < 9; p++) {
          var s;
          if (t === 0) s = 162 + i * 9 + p;
          else if (t === 1) s = 162 + p * 9 + i;
          else if (t === 2) s = 162 + (((i / 3) | 0) * 3 + ((p / 3) | 0)) * 9 + (i % 3) * 3 + (p % 3);
          else if (t === 3) s = i * 9 + p;
          else if (t === 4) s = 81 + i * 9 + p;
          else s = 243 + i * 9 + p;
          GROUP_SETS[(t * 9 + i) * 9 + p] = s;
        }
      }
    }
  })();

  function memo(st) {
    var m = st.k8;
    if (!m) {
      m = st.k8 = {
        list: null,
        gStart: null,
        gCount: null,
        coverMode: -1,
        covers: [],
        coverSets: [],
        coverPicked: [],
        bestDone: false,
        best: -1
      };
      st.nCovers = 0;
      st.coverAls = 0;
      st.coverKinds = 0;
      st.coverShape = 0;
      st.setSizes = 0;
    }
    return m;
  }

  function hasBit(mask, off, c) {
    return (mask[off + (c >> 5)] & (1 << (c & 31))) !== 0;
  }

  function setHits(st, s, mask) {
    var sm = st.setMask;
    var off = s * NW;
    for (var w = 0; w < NW; w++) if (sm[off + w] & mask[w]) return true;
    return false;
  }

  function kindOf(s) {
    return s < 324 ? (s / 81) | 0 : 4;
  }

  var VEC_A = [0, 4, 4, 0, 0, 1, 2, 2];
  var VEC_B = [0, 1, 1, 0, 0, 1, 2, 2];
  var VEC_C = [1, 1, 0, 0, 0, 1, 2, 2];
  var VEC_D = [0, 3, 2, 1, 0, 1, 2, 2];

  function oneCand(st, byOne) {
    var s;
    if (!byOne) {
      s = st.truths[0];
    } else {
      s = st.truths[st.nT - 1];
      for (var i = 0; i < st.nT; i++) {
        if (st.setLen[st.truths[i]] === 1) {
          s = st.truths[i];
          break;
        }
      }
    }
    if (st.setLen[s] !== 1) return false;
    var c = st.setList[st.setOff[s]];
    var d = cD0[c];
    var solved = 0;
    for (var cell = 0; cell < 81; cell++) {
      var x = cell * 9 + d;
      if (st.cs[x] === 2 && st.marks[x] === 0) solved++;
    }
    if (solved === 8) {
      tag(st, 150);
      return true;
    }
    var r = cRow[c];
    var k = cCol[c];
    var b = cBox[c];
    var dd;
    var zero = 0;
    for (dd = 0; dd < 9; dd++) if (st.setLen[r * 9 + dd] === 0) zero++;
    if (zero === 8) {
      tag(st, 151);
      return true;
    }
    zero = 0;
    for (dd = 0; dd < 9; dd++) if (st.setLen[81 + k * 9 + dd] === 0) zero++;
    if (zero === 8) {
      tag(st, 152);
      return true;
    }
    zero = 0;
    for (dd = 0; dd < 9; dd++) if (st.setLen[243 + b * 9 + dd] === 0) zero++;
    if (zero === 8) {
      tag(st, 153);
      return true;
    }
    var n = 0;
    var which = -1;
    for (var q = 0; q < 4; q++) {
      if (st.setLen[cSets[c * 4 + q]] === 1) {
        n++;
        if (which < 0) which = q;
      }
    }
    if (n === 1) {
      if (which === 0) tag(st, 154);
      else if (which === 1) tag(st, 155);
      else if (which === 2) tag(st, 156);
      else tag(st, 157);
    } else if (n === 3) tag(st, 158);
    else if (n === 4) tag(st, 159);
    else if (n === 2) tag(st, 160);
    else tag(st, 161);
    return true;
  }

  function nb3(st) {
    var nb = pat.kill0Neighbors(st);
    var n = 0;
    for (var w = 0; w < NW; w++) n += bitCount(nb[w] & st.TU[w]);
    return n >= 3 ? n - 2 : 0;
  }

  function posBits(st, t, s) {
    var bits = 0;
    var off = st.setOff[s];
    for (var k = off; k < off + st.setLen[s]; k++) {
      var c = st.setList[k];
      if (t < 3) bits |= 1 << cD0[c];
      else if (t === 3) bits |= 1 << cCol[c];
      else if (t === 4) bits |= 1 << cRow[c];
      else bits |= 1 << ((cRow[c] % 3) * 3 + (cCol[c] % 3));
    }
    return bits;
  }

  function sameMask(a, b) {
    for (var w = 0; w < NW; w++) if (a[w] !== b[w]) return false;
    return true;
  }

  function enumerate(st, m) {
    var list = [];
    var gStart = new Int32Array(54);
    var gCount = new Int32Array(54);
    var stopped = false;
    var sm = st.setMask;
    for (var g = 0; g < 54; g++) {
      gStart[g] = list.length;
      if (stopped) continue;
      var t = (g / 9) | 0;
      var part = [];
      var bits = [];
      for (var p = 0; p < 9; p++) {
        var s = GROUP_SETS[g * 9 + p];
        var n = st.setLen[s];
        if (n >= 2 && n <= 7) {
          part.push(s);
          bits.push(posBits(st, t, s));
        }
      }
      var mm = part.length;
      var full = 1 << mm;
      var F = [];
      var start = list.length;
      for (var x = 0; x < full; x++) {
        var skip = false;
        for (var f = 0; f < F.length; f++) {
          if ((F[f] & x) === F[f]) {
            skip = true;
            break;
          }
        }
        if (skip || x === 0) continue;
        var k = bitCount(x);
        if (k < 2 || k > 6) continue;
        var u = 0;
        for (var b = 0; b < mm; b++) if (x & (1 << b)) u |= bits[b];
        var e = bitCount(u) - k;
        if (e === 0) {
          F.push(x);
          list.length = start;
          if (F.length === 8) break;
          x = -1;
          continue;
        }
        if (e !== 1) continue;
        var sets = [];
        var mask = new Uint32Array(NW);
        var sum = 0;
        for (b = 0; b < mm; b++) {
          if (!(x & (1 << b))) continue;
          var ss = part[b];
          sets.push(ss);
          sum += st.setLen[ss];
          for (var w = 0; w < NW; w++) mask[w] |= sm[ss * NW + w];
        }
        if (k <= 3 && t === 2 && list.length > 0) {
          var dup = false;
          for (var z = 0; z < list.length; z++) {
            if (sameMask(list[z].mask, mask)) {
              dup = true;
              break;
            }
          }
          if (dup) continue;
        }
        var cands = [];
        for (w = 0; w < NW; w++) {
          var v = mask[w];
          while (v !== 0) {
            var low = v & -v;
            cands.push((w << 5) + 31 - Math.clz32(low));
            v ^= low;
          }
        }
        list.push({ type: t, house: g % 9, sets: sets, n: k, sum: sum, mask: mask, cands: cands });
        if (list.length === 799) {
          stopped = true;
          break;
        }
      }
      gCount[g] = list.length - start;
    }
    m.list = list;
    m.gStart = gStart;
    m.gCount = gCount;
  }

  function maskSubset(a, b) {
    for (var w = 0; w < NW; w++) if (a[w] & ~b[w]) return false;
    return true;
  }

  function alsCover(st, mode) {
    var m = memo(st);
    if (m.coverMode === mode) return st.nCovers;
    m.coverMode = mode;
    m.covers = [];
    m.coverSets = [];
    m.coverPicked = [];
    st.nCovers = 0;
    var md = mode;
    if (md === 0) {
      md = st.tCell - st.Tn[1] >= 2 ? 7 : 0;
      if (st.tRow - st.Tr[1] >= 2) md |= 8;
      if (st.tCol - st.Tc[1] >= 2) md |= 16;
      if (st.tBox - st.Tb[1] >= 2) md |= 32;
      if (md === 0) return 0;
    }
    if (!m.list) enumerate(st, m);
    var list = m.list;
    if (list.length === 0) return 0;
    var TU = st.TU;
    var A = TU.slice();
    var picked = [];
    var t, j, a, w;
    for (t = 0; t < 6; t++) {
      if (!(md & (1 << t))) continue;
      for (j = 0; j < 9; j++) {
        var g = t * 9 + j;
        for (a = m.gStart[g]; a < m.gStart[g] + m.gCount[g]; a++) {
          var al = list[a];
          if (!maskSubset(al.mask, TU)) continue;
          picked.push(a);
          if (picked.length === 50) return 0;
          for (w = 0; w < NW; w++) A[w] &= al.mask[w];
        }
      }
    }
    if (picked.length === 0) return 0;
    var sets = [];
    for (var i = 0; i < st.nT; i++) {
      var s = st.truths[i];
      if (setHits(st, s, A)) continue;
      sets.push(s);
      if (sets.length === 50) return 0;
    }
    var itemOf = new Int32Array(729);
    var n = 0;
    var candList = st.candList;
    for (i = 0; i < candList.length; i++) {
      var c = candList[i];
      if (hasBit(TU, 0, c)) itemOf[c] = ++n;
    }
    var ns = sets.length;
    var na = picked.length;
    var cv = new TLE.Cover(n + 1, ns + na + 1);
    cv.limit = 0;
    for (i = 1; i <= n; i++) cv.addItem(i, 1);
    for (j = 0; j < ns; j++) {
      cv.addOption(j + 1, 1);
      s = sets[j];
      var off = st.setOff[s];
      for (var k = off; k < off + st.setLen[s]; k++) {
        c = st.setList[k];
        if (itemOf[c] !== 0) cv.addEntry(itemOf[c], j + 1);
      }
    }
    for (a = 0; a < na; a++) {
      cv.addOption(ns + a + 1, 1);
      var cands = list[picked[a]].cands;
      for (k = 0; k < cands.length; k++) cv.addEntry(itemOf[cands[k]], ns + a + 1);
    }
    var covers = [];
    var total = 0;
    cv.run(function (sel, depth) {
      if (total + depth > 49997) return true;
      var hasAls = false;
      for (var z = 0; z < depth; z++) {
        if (sel[z] > ns) {
          hasAls = true;
          break;
        }
      }
      if (!hasAls) return false;
      var el = new Int32Array(depth);
      for (z = 0; z < depth; z++) el[z] = sel[z];
      covers.push(el);
      total += depth;
      return covers.length === 2999;
    });
    m.covers = covers;
    m.coverSets = sets;
    m.coverPicked = picked;
    st.nCovers = covers.length;
    return covers.length;
  }

  function coverAls(m, id, ns0) {
    return m.list[m.coverPicked[id - ns0 - 1] & ~0x200];
  }

  function bestCover(st) {
    var m = memo(st);
    if (m.bestDone) return m.best;
    m.bestDone = true;
    m.best = -1;
    st.coverShape = 0;
    var covers = m.covers;
    if (st.nCovers === 0) {
      st.bestAls = -1;
      return -1;
    }
    var ns0 = m.coverSets.length;
    var min = 999;
    for (var ci = 0; ci < covers.length; ci++) {
      st.setSizes = 0;
      var el = covers[ci];
      var ns = 0;
      var na = 0;
      var ty = 0;
      var fm = 0;
      var pr = 0;
      var last = null;
      for (var z = 0; z < el.length; z++) {
        var id = el[z];
        if (id > ns0) {
          var al = coverAls(m, id, ns0);
          na++;
          ty |= 1 << al.type;
          fm |= fm & 4 ? 8 : 4;
          last = al;
        } else {
          var s = m.coverSets[id - 1];
          ns++;
          fm |= fm & 1 ? 2 : 1;
          if (!(st.role[s] & 4)) pr |= 1 << st.setLen[s];
        }
      }
      if (fm <= 3) continue;
      if (na === 1 && last.sum === 2 * last.n) continue;
      var score = 2 * (ns + na);
      if (score < min) {
        min = score;
        m.best = ci;
        st.coverAls = na;
        st.coverKinds = ty;
        st.coverShape = fm;
        st.setSizes = pr;
      }
    }
    st.bestAls = m.best;
    return m.best;
  }

  function stemCover(st) {
    var m = memo(st);
    var ns0 = m.coverSets.length;
    var role = st.role;
    for (var ci = 0; ci < m.covers.length; ci++) {
      var el = m.covers[ci];
      var als = [];
      var nset = 0;
      var stem = -1;
      for (var z = 0; z < el.length; z++) {
        var id = el[z];
        if (id > ns0) {
          if (als.length < 10) als.push(coverAls(m, id, ns0));
        } else {
          nset++;
          stem = m.coverSets[id - 1];
        }
      }
      if (nset !== 1) continue;
      var a = als.length;
      if (a < 2 || stem > 323 || st.setLen[stem] !== a) continue;
      var off = st.setOff[stem];
      var bad = false;
      var k;
      for (k = off; k < off + a; k++) {
        if (st.killDigits & (1 << cD0[st.setList[k]])) {
          bad = true;
          break;
        }
      }
      if (bad) continue;
      var match = 0;
      for (k = off; k < off + a; k++) {
        var p = st.setList[k];
        for (var q = 0; q < 4; q++) {
          var L = cSets[p * 4 + q];
          if (!(role[L] & 2)) continue;
          for (var j = 0; j < a; j++) if (setHits(st, L, als[j].mask)) match |= 1 << j;
        }
      }
      if (match === (1 << a) - 1) {
        m.best = ci;
        st.bestAls = ci;
        return true;
      }
    }
    return false;
  }

  function endR1(st) {
    var U = st.U;
    if (U[1] === 0 && U[2] === st.nT - 1 && U[3] === 1 && st.P[1] !== 0 && pat.aux4(st) === 1) {
      st.CF |= 0x4000000;
      tag(st, 162);
      return true;
    }
    return false;
  }

  function endR2(st) {
    if (pat.aux4(st) === 0) return false;
    if (st.kMax === 3) {
      tag(st, 163);
      return true;
    }
    if (st.kMax === 2 && st.kMin <= st.rank && st.ovl !== 0) {
      tag(st, 164);
      return true;
    }
    return false;
  }

  function hasAlsKind(st) {
    return (st.coverKinds & 7) !== 0;
  }

  function hasAhsKind(st) {
    return (st.coverKinds & 0x38) !== 0;
  }

  function alsPro(st) {
    if (st.nT > 4 && (st.nkill !== 1 || st.ovl === 0) && stemCover(st)) {
      tag(st, 165);
    } else {
      var f = (st.coverShape - 4) & 255;
      if (f === 0) tag(st, 65);
      else if (f === 1) tag(st, 166);
      else if (f === 3) tag(st, 167);
      else if (f === 8) {
        if (st.coverAls === 2) tag(st, 168);
        else if (st.coverAls === 3) tag(st, 169);
        else tag(st, 170);
      } else if (f === 9) tag(st, 171);
      else if (f === 11) tag(st, 172);
      else {
        st.CF |= 0x80000000;
        tag(st, 173);
      }
    }
    st.CF |= hasAlsKind(st) ? 5 : 1;
    if (hasAhsKind(st)) st.CF |= 8;
    return true;
  }

  function rank1(st) {
    if (st.rank !== 1) return false;
    var nT = st.nT;
    var nL = st.nL;
    var rank = st.rank;
    var nkill = st.nkill;
    var U = st.U;
    var B0 = st.B[0];
    var DE = rank + nT + 2 === nL && nkill >= 2 && st.nlsat === 0;
    var pro = st.pro;

    function fz() {
      if (pat.aux1Value(st) === 1) st.CF |= 0x200;
      return true;
    }
    function dx() {
      if (DE) tag(st, 11);
    }
    function gx() {
      if (nT !== B0) {
        tag(st, 10);
        st.CF |= 2;
      }
    }
    function wx(k) {
      tag(st, k);
      dx();
      gx();
      return fz();
    }

    function stepS(sh, ob, bl) {
      var tRow = st.tRow;
      var tCol = st.tCol;
      var tBox = st.tBox;
      function unknown() {
        st.CF |= 0x40000000;
        return wx(213);
      }
      function t4b() {
        if (nkill >= 2) return wx(214);
        if (nb3(st) === 0) return wx(214);
        return wx(215);
      }
      if (sh !== 0) {
        if (ob === 2) {
          if (tCol + tRow === 1) return wx(216);
          if (tRow === 1) {
            if (tCol === 1) return wx(216);
            if (tCol === 2) return t4b();
            return unknown();
          }
          if (tRow === 2) return t4b();
          if (tCol === 2) return t4b();
          return unknown();
        }
        if (ob === 3) {
          if (tBox === 2) {
            if (nb3(st) !== 0) return wx(217);
            return wx(218);
          }
          if (tBox === 1 && tRow + tCol === 1) return wx(219);
          if (tRow === 1 && tCol === 1) return wx(219);
          return unknown();
        }
        return unknown();
      }
      if (ob === 3) {
        if (tRow === 2 || tCol === 2) {
          if (bl === nT) return wx(220);
          return wx(221);
        }
        if (tBox === 1) return wx(222);
        if (tRow === 1 && tCol === 1) return wx(223);
        return unknown();
      }
      if (ob === 4) {
        if (tBox === 0) {
          if (tRow === 1 && tCol === 1) {
            if (bl === nT) return wx(224);
            return wx(225);
          }
          if (tRow === 2 || tCol === 2) return wx(226);
          return unknown();
        }
        if (tBox === 1) {
          if (nkill >= 2) return wx(227);
          var n3 = nb3(st);
          if (n3 === 0) return wx(227);
          if (n3 === 1 && st.ovl !== 0) return wx(227);
          return wx(228);
        }
        return unknown();
      }
      if (ob === 5) {
        if (tBox !== 0) return unknown();
        if (tRow === 1 && tCol === 1) return wx(229);
        if (tRow === 2 || tCol === 2) return wx(230);
        return unknown();
      }
      return unknown();
    }

    function stepM(sh, ob, bl, ot, rc3) {
      var tRow = st.tRow;
      var tCol = st.tCol;
      var tBox = st.tBox;
      function unknown() {
        st.CF |= 0x40000000;
        return wx(231);
      }
      if (sh !== 0) {
        if (ob === 2) {
          if ((tRow !== 0 && sh & 1) || (tCol !== 0 && sh & 2)) return wx(232);
          return wx(233);
        }
        if (ob !== 3) return unknown();
        if (tRow === 2 || tCol === 2) return wx(234);
        if (tCol > 1 || tRow > 1 || tBox > 1) return unknown();
        return wx(235);
      }
      if (rc3) {
        if (tRow === 2 || tCol === 2) return wx(236);
        return wx(237);
      }
      if (ob === 4) {
        if (bl === nT) return wx(238);
        return wx(239);
      }
      if (st.boxesT & (1 << cBox[pat.kill0(st)])) {
        if (ob !== 3) return unknown();
        if (tRow === 2 || tCol === 2) {
          if (bl === nT) return wx(240);
          return wx(241);
        }
        return wx(242);
      }
      var tc = -1;
      var lc = -1;
      var i;
      for (i = 0; i < nT; i++) {
        if (kindOf(st.truths[i]) === 2) {
          tc = st.truths[i] - 162;
          break;
        }
      }
      for (i = 0; i < nL; i++) {
        if (kindOf(st.links[i]) === 2) {
          lc = st.links[i] - 162;
          break;
        }
      }
      function t2a() {
        if (nL > 4 || nkill >= 2) return wx(243);
        return wx(244);
      }
      if (((tc % 9) / 3 | 0) === ((lc % 9) / 3 | 0) || ((tc / 9 | 0) / 3 | 0) === ((lc / 9 | 0) / 3 | 0)) {
        if (tRow === 1 && tCol === 1) return wx(245);
        if (ot === 3 || tRow === 2 || tCol === 2) return wx(246);
        return t2a();
      }
      if (ot === 3) return unknown();
      return t2a();
    }

    function stepA() {
      if (U[2] === nT - 1 && U[3] === 1 && st.Q[2] === nT) {
        if (nT > 1) pat.aux1(st);
        if (pat.aux1Value(st) === 1) {
          st.CF |= 0x200;
          tag(st, 174);
          dx();
          return true;
        }
        return stepB();
      }
      if (U[2] !== nT) return stepB();
      if (nT !== st.tCell) {
        if (endR1(st)) return fz();
        if (st.P[1] === 0 && st.kMin === 2 && st.ovl !== 0) {
          st.CF |= 0x200;
          tag(st, 141);
          dx();
          return fz();
        }
        if (nT === 3) {
          st.CF |= 0x10000000;
          tag(st, 175);
          if (rank + 5 === nL && nkill >= 2 && st.nlsat === 0) tag(st, 11);
          return fz();
        }
        if (nT !== B0) {
          st.CF |= 0x10000002;
          tag(st, 176);
          dx();
          return fz();
        }
        st.CF |= 0x10000000;
        tag(st, 177);
        dx();
        return fz();
      }
      if (nT !== 3) {
        if (st.R[2] !== nT - 2) return stepC();
        if (DE) tag(st, 178);
        else tag(st, 179);
        return fz();
      }
      if (st.T[2] === 3) {
        st.CF |= 0x400000;
        tag(st, 180);
        return fz();
      }
      if (st.T[2] === 2 && st.T[3] === 1 && st.lBox > 0 && st.lRow + st.lCol > 1) {
        tag(st, 181);
        st.CF |= 0x400000;
        return fz();
      }
      return stepC();
    }

    function stepB() {
      if (st.tCell === nT) return stepC();
      var cnt = alsCover(st, 0);
      var best = -1;
      if (cnt > 0) best = bestCover(st);
      if (cnt > 0 && best !== -1) return stepD();
      if (pat.aux5(st)) return fz();
      var ke = pat.aux4(st);
      if (!pat.vecIs(st, VEC_A, 8) && ke === 1 && (pat.vecIs(st, VEC_B, 8) || pat.vecIs(st, VEC_C, 8))) {
        tag(st, 162);
        dx();
        return fz();
      }
      if (pat.vecIs(st, VEC_A, 8) || pat.vecIs(st, VEC_D, 8)) {
        tag(st, 182);
        dx();
        return fz();
      }
      if (U[1] === 0 && ((U[2] === nT - 2 && U[3] === 2) || (U[2] === nT - 1 && U[3] === 0 && U[4] === 1))) {
        if (st.tCell === nT && nT === 3) {
          tag(st, 181);
          return fz();
        }
        var red = st.nlsat !== 0 && st.ovl !== 0;
        if (U[3] === 2 && U[2] === nT - 2) {
          if (red) tag(st, 183);
          else tag(st, 184);
          return fz();
        }
        if (red) tag(st, 54);
        else tag(st, 184);
        return fz();
      }
      return stepD();
    }

    function stepD() {
      var best = st.nCovers > 0 ? bestCover(st) : -1;
      if (st.nCovers > 0 && best !== -1) {
        var als = hasAlsKind(st);
        var ahs = hasAhsKind(st);
        if (pro) {
          if (st.coverAls === 1) {
            if (ahs) {
              tag(st, 185);
              gx();
            } else if (als) {
              tag(st, 186);
              gx();
            } else tag(st, 187);
          } else {
            if (als && ahs) {
              tag(st, 188);
              gx();
            } else if (ahs) {
              tag(st, 189);
              gx();
            } else if (!als) tag(st, 190);
            else {
              tag(st, 191);
              gx();
            }
          }
          st.CF |= 1;
          if (als) st.CF |= 5;
          if (ahs) st.CF |= 8;
          return fz();
        }
        if (st.coverAls === 1) {
          if (ahs) {
            tag(st, 192);
            gx();
          } else if (als) {
            tag(st, 193);
            gx();
          } else {
            tag(st, 194);
            return fz();
          }
        } else {
          if (als && ahs) {
            tag(st, (st.coverShape & 3) === 0 ? 211 : 212);
            gx();
          } else if (ahs) {
            tag(st, 195);
            gx();
          } else if (!als) {
            tag(st, 196);
            return fz();
          } else {
            tag(st, 197);
            gx();
          }
        }
        if (als) st.CF |= 4;
        if (ahs) st.CF |= 8;
        return fz();
      }
      if (endR1(st)) return fz();
      if (st.kMin <= rank && st.ovl !== 0) tag(st, 198);
      else tag(st, 199);
      return fz();
    }

    function stepC() {
      if (st.lBox <= 0 || st.lRow + st.lCol <= 1) return stepN();
      var Tn = st.Tn;
      if (nT === 3) {
        if (st.nDig === 3 && Tn[2] === 2 && Tn[3] === 1 && st.lBox === 2) {
          tag(st, 181);
          return fz();
        }
        return stepN();
      }
      if (nT === 4) {
        if (st.nDig === 4 && Tn[2] !== 0 && pat.aux3(st) === 2) {
          if (pro) tag(st, 200);
          else if (Tn[2] === 3 && Tn[4] === 1) tag(st, 201);
          else if (Tn[4] === 1) tag(st, 202);
          else tag(st, 203);
          return fz();
        }
        return stepN();
      }
      return stepN();
    }

    function stepN() {
      var cnt = alsCover(st, 7);
      if (cnt === 0) {
        tag(st, 204);
        return fz();
      }
      var best = bestCover(st);
      if (best === -1 || st.coverShape <= 3) {
        tag(st, 204);
        return fz();
      }
      if (pro) {
        alsPro(st);
        return fz();
      }
      if (nT > 4 && (nkill !== 1 || st.ovl === 0) && stemCover(st)) {
        tag(st, 205);
      } else {
        var f = (st.coverShape - 4) & 255;
        if (f === 0) tag(st, 65);
        else if (f === 1) tag(st, 206);
        else if (f === 3) tag(st, 207);
        else if (f === 8) {
          if (st.coverAls === 2) tag(st, 208);
          else if (st.coverAls === 3) tag(st, 209);
          else tag(st, 210);
        } else if (f === 9) tag(st, 171);
        else if (f === 11) tag(st, 172);
        else {
          st.CF |= 0x80000000;
          tag(st, 173);
        }
      }
      if (hasAlsKind(st)) st.CF |= 4;
      if (hasAhsKind(st)) st.CF |= 8;
      return fz();
    }

    if (st.kMin <= 1) return stepB();
    if (nT !== 3 || st.tCell > 2) return stepA();
    if (st.tOver !== 0) return stepA();
    if (st.tCell === 2 && st.lCell === 0 && st.nDig === 2) return wx(247);
    var bd = pat.aux2(st);
    var sh = bd.sh;
    if (sh === 3) return stepA();
    if (st.ovl !== 0 && nkill >= 2 && nL !== 4 && nL !== 6) return stepA();
    if (sh === 0) {
      if (st.nDig === 2) {
        if (st.tRow === 3 && st.lCell === 2) return wx(248);
        if (st.tCol === 3 && st.lCell === 2) return wx(249);
      } else if (st.nDig === 3 && st.tBox === 0) {
        if (st.tCell === 2) return wx(250);
        if (st.tCell === 1) return wx(251);
        if (st.tCell === 0) return wx(252);
      }
    }
    if (st.tCell !== 1 || st.nDig !== 2) return stepA();
    var ot = pat.blindKind(st);
    if (ot === -1) return stepA();
    var ob = st.nBoxesT;
    var bl = B0;
    var rc3 = bd.bandsR === 3 || bd.bandsC === 3;
    if (ot === 2) return stepS(sh, ob, bl);
    if (st.lCell !== 1) return stepA();
    return stepM(sh, ob, bl, ot, rc3);
  }

  function highlight(st) {
    if (st.bestAls === -1 || !st.highlightAls || !(st.CF & 0xc)) return;
    var m = memo(st);
    var el = m.covers[st.bestAls];
    if (!el) return;
    var ns0 = m.coverSets.length;
    var cells = st.alsCells;
    var sets = st.alsSets;
    var color = 1;
    for (var z = 0; z < el.length; z++) {
      var id = el[z];
      if (id <= ns0) continue;
      var al = coverAls(m, id, ns0);
      for (var i = 0; i < al.sets.length; i++) {
        var s = al.sets[i];
        if (s >= 162 && s < 243) {
          sets[s] = color;
          cells[s - 162] = color;
        } else {
          var off = st.setOff[s];
          for (var k = off; k < off + st.setLen[s]; k++) {
            var x = cCell[st.setList[k]];
            if (cells[x] === 0) cells[x] = color;
            else if (cells[x] !== color) cells[x] = 9;
          }
          sets[s] = color;
        }
      }
      color++;
    }
  }

  pat.oneCand = oneCand;
  pat.rank1 = rank1;
  pat.endR1 = endR1;
  pat.endR2 = endR2;
  pat.alsCover = alsCover;
  pat.bestCover = bestCover;
  pat.alsPro = alsPro;
  pat.stemCover = stemCover;
  pat.nb3 = nb3;
  pat.highlight = highlight;
})();
