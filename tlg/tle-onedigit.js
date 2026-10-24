var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  var pat = TLE.pat || (TLE.pat = {});
  var tag = TLE.putTag;

  var NW = 23;

  function andAny(m, offA, n, offB) {
    for (var w = 0; w < NW; w++) if (m[offA + w] & n[offB + w]) return true;
    return false;
  }

  function aux1Calc(st) {
    if (st.nkill === 0) return 0;
    var cSets = TLE.cSets;
    var role = st.role;
    var mask = st.setMask;
    var dup = st.DUP;
    var truths = st.truths;
    for (var k = 0; k < st.kills.length; k++) {
      var c = st.kills[k];
      for (var q = 0; q < 4; q++) {
        var s = cSets[c * 4 + q];
        if (!(role[s] & 2)) continue;
        var so = s * NW;
        if (!andAny(mask, so, dup, 0)) continue;
        for (var i = 0; i < truths.length; i++) {
          var to = truths[i] * NW;
          var inDup = false;
          var outDup = false;
          for (var w = 0; w < NW; w++) {
            var v = mask[so + w] & mask[to + w];
            if (v & dup[w]) inDup = true;
            if (v & ~dup[w]) outDup = true;
          }
          if (inDup && outDup) return 1;
        }
      }
    }
    return 0;
  }

  function aux1(st) {
    if (!st.aux1Done) {
      st.aux1Done = 1;
      st.aux1V = aux1Calc(st);
    }
    return st.aux1V;
  }

  function aux1Value(st) {
    return st.aux1Done ? st.aux1V : 0;
  }

  function oneBand(m) {
    return (m & ~7) === 0 || (m & ~0x38) === 0 || (m & ~0x1c0) === 0;
  }

  function bandCount(m) {
    return (m & 7 ? 1 : 0) + (m & 0x38 ? 1 : 0) + (m & 0x1c0 ? 1 : 0);
  }

  function aux2(st) {
    if (!st.aux2Done) {
      st.aux2Done = 1;
      var sh = 0;
      if (st.nRowsT <= 3 && oneBand(st.rowsT)) sh |= 1;
      if (st.nColsT <= 3 && oneBand(st.colsT)) sh |= 2;
      st.aux2Sh = sh;
      st.aux2R = bandCount(st.rowsT);
      st.aux2C = bandCount(st.colsT);
    }
    return { sh: st.aux2Sh, bandsR: st.aux2R, bandsC: st.aux2C };
  }

  var EMPTY = -1;
  var MIXED = -2;
  var NONE = -3;

  function aux3Calc(st) {
    var sh = aux2(st).sh;
    if (sh === 0 || sh === 3) return 0;
    var nT = st.nT;
    if (nT > 63 || nT <= 0) return 1;
    var A = new Int32Array(16).fill(EMPTY);
    var mix = 0;
    for (var i = 0; i < nT; i++) {
      var t = st.truths[i];
      var kind = (t / 81) | 0;
      var k, w;
      if (kind === 0) {
        k = 15;
        w = sh === 2 ? NONE : (t / 9) | 0;
      } else if (kind === 1) {
        k = 15;
        w = sh === 2 ? ((t - 81) / 9) | 0 : 15;
      } else if (kind === 2) {
        var cell = t - 162;
        var row = (cell / 9) | 0;
        var col = cell % 9;
        k = ((row / 3) | 0) * 3 + ((col / 3) | 0);
        w = sh === 2 ? col : row;
      } else if (kind === 3) {
        k = ((t - 243) / 9) | 0;
        w = sh === 2 ? NONE : 15;
      } else {
        k = 15;
        w = sh === 2 ? NONE : 15;
      }
      var a = A[k];
      if (a === EMPTY) {
        if (w !== NONE) A[k] = w;
      } else if (a === MIXED || a === w) {
        continue;
      } else {
        mix++;
        A[k] = MIXED;
      }
    }
    if (mix !== 1) return 1;
    var seen = -1;
    for (var b = 0; b < 9; b++) {
      var x = A[b];
      if (x < 0 || x > 10) continue;
      if (seen < 0) seen = x;
      else if (x !== seen) return 1;
    }
    return 2;
  }

  function aux3(st) {
    if (!st.aux3Done) {
      st.aux3Done = 1;
      st.aux3V = aux3Calc(st);
    }
    return st.aux3V;
  }

  function aux4Calc(st) {
    if (st.nT <= 2 || st.rank <= 0 || st.nkill > 3) return 0;
    if (st.nkill === 0) return 1;
    var cSets = TLE.cSets;
    var role = st.role;
    var mask = st.setMask;
    var TU = st.TU;
    for (var k = 0; k < st.kills.length; k++) {
      var c = st.kills[k];
      var x = -1;
      var y = -1;
      var n = 0;
      for (var q = 0; q < 4; q++) {
        var s = cSets[c * 4 + q];
        if (!(role[s] & 2)) continue;
        n++;
        if (x < 0) x = s;
        else y = s;
      }
      if (n !== 2) return 0;
      var ax = (role[x] & 8) !== 0;
      var ay = (role[y] & 8) !== 0;
      if (ax === ay) return 0;
      var xo = x * NW;
      var yo = y * NW;
      for (var w = 0; w < NW; w++) if (mask[xo + w] & mask[yo + w] & TU[w]) return 0;
    }
    return 1;
  }

  function aux4(st) {
    if (!st.aux4Done) {
      st.aux4Done = 1;
      st.aux4V = aux4Calc(st);
    }
    return st.aux4V;
  }

  function aux5Calc(st) {
    var nT = st.nT;
    if (st.U[2] !== nT - 1 || st.U[3] !== 1) return -1;
    var s = -1;
    for (var i = 0; i < nT; i++) {
      if (st.setSize[st.truths[i]] === 3) {
        s = st.truths[i];
        break;
      }
    }
    if (s < 0) return -1;
    var y = (s / 81) | 0;
    if (st.rank === 1) {
      if (st.kMax !== 2) return -1;
      var f = nT >= 2 && nT <= 6 ? aux1(st) : aux1Value(st);
      if (st.rankOverlap === 1 && f === 1) return st.nDig <= 1 ? 140 : 141;
      if (y === 0) return 142;
      if (y === 1) return 143;
      if (y === 2) return 144;
      if (y === 3) return 145;
      return -1;
    }
    if (st.rank === 2) {
      if (st.kMax !== 3) return -1;
      if (y === 0) return 146;
      if (y === 1) return 147;
      if (y === 2) return 148;
      if (y === 3) return 149;
      return -1;
    }
    return -1;
  }

  function aux5(st) {
    if (!st.aux5Done) {
      st.aux5Done = 1;
      st.aux5V = aux5Calc(st);
    }
    var k = st.aux5V;
    if (k < 0) return false;
    tag(st, k);
    return true;
  }

  function oneDigit(st) {
    var nT = st.nT;
    var nL = st.nL;
    var i = Math.min(nT - 2, 6);
    var fr = [i, st.truths, st.links];
    var T = st.T;
    var U = st.U;
    var L = st.L;
    var B = st.B;

    function close(bits) {
      st.CF |= bits | 0x800;
    }
    function done(k, bits, a) {
      tag(st, k, a);
      close(bits);
    }

    if (st.tOver !== 0) {
      if (nT === 3 && st.tRow + st.tCol === 3 && st.lBox === 2 && B[0] <= 2) done(112, 0);
      else if (nT >= 7) done(113, 0);
      else done(23, 0, fr);
      return;
    }

    var tRow = st.tRow;
    var tCol = st.tCol;
    var tBox = st.tBox;
    var lRow = st.lRow;
    var lCol = st.lCol;
    var lBox = st.lBox;
    var rank = st.rank;
    var ovl = st.ovl;
    var nkill = st.nkill;
    var sameType = tRow === nT || tCol === nT || st.tCell === nT || tBox === nT;
    var sameLinkType = lRow === nT || lCol === nT || st.lCell === nT || lBox === nT;
    var first = st.truths[0];
    var firstKind = (first / 81) | 0;
    var cx = nkill === 1 && nT + rank < nL;

    if (rank === 0) {
      if (nT >= 7) return done(114, 0);
      if (sameType && sameLinkType) {
        if (nT > 2 && U[2] === nT && L[2] === nT) {
          tag(st, 102);
          if (B[0] !== nT) {
            tag(st, 10);
            st.CF |= 0x2;
          }
          return close(0);
        }
        if (firstKind === 0) {
          if (lCol === nL) return done(24, 0, fr);
          if (lBox === nL) return done(25, 0x80, fr);
        } else if (firstKind === 1) {
          if (lRow === nL) return done(26, 0, fr);
          if (lBox === nL) return done(27, 0x80, fr);
        } else if (firstKind === 3 && (lCol === nL || lRow === nL)) {
          return done(28, 0x80, fr);
        }
        if (cx) return done(29, 0x80, fr);
        return done(30, 0x80, fr);
      }
      if (nT === 3 && tBox === 2 && B[0] <= 2) return done(115, 0);
      if (nT >= 3 && U[2] === nT && L[2] === nT) {
        if (B[0] === nT) return done(116, 0);
        st.CF |= 0x2;
        return done(117, 0);
      }
      if (
        (tRow === nT && lCol + lBox === nT) ||
        (tCol === nT && lRow + lBox === nT) ||
        (tRow + tBox === nT && lCol === nT) ||
        (tBox + tCol === nT && lRow === nT)
      ) {
        return done(28, 0x80, fr);
      }
      tag(st, cx ? 31 : 32, fr);
      if (st.nlsat > st.nspan) tag(st, 12);
      return close(0x100);
    }

    var f1 = nT >= 2 && nT <= 8 ? aux1(st) : aux1Value(st);

    if (rank < 0) return done(118, 0);

    if (rank === 1 && nT === 2) {
      if (tRow === 2 || tCol === 2) {
        var rows = tRow === 2;
        if (T[2] === 2) {
          tag(st, rows ? 108 : 109);
          if (nL === 5 && nkill > 1 && st.nlsat === 0) tag(st, 11);
          return;
        }
        if (ovl !== 0 && f1 === 1) return done(rows ? 136 : 137, 0x200);
        return done(rows ? 138 : 139, 0x400);
      }
      if (tBox === 2) return done(119, 0);
      if (tRow === 1 && tCol === 1) {
        if (B[0] === 2) return tag(st, 103);
        st.CF |= 0x2;
        return tag(st, 104);
      }
      if (tBox !== 1) return tag(st, 105);
      if (st.Tb[2] === 1) {
        if (B[0] === 2) return tag(st, 106);
        st.CF |= 0x2;
        return tag(st, 107);
      }
      return tag(st, ovl === 1 ? 110 : 111);
    }

    if (rank === 1) {
      if (ovl === 0 && aux4(st) === 1) {
        if (nT === 4) {
          if (tRow === 3 && st.Tr[2] <= 3) return done(120, 0);
          if (tCol === 3 && st.Tc[2] <= 3) return done(121, 0);
        } else if (nT === 5) {
          if (T[2] <= 4) return done(122, 0);
          return close(0);
        } else if (nT === 3) {
          if (tRow === 2 && st.Tr[2] <= 2) return done(123, 0);
          if (tCol === 2 && st.Tc[2] <= 2) return done(124, 0);
          if (tBox === 2 && st.Tb[2] <= 2) return done(125, 0x100);
        }
      }
      if (U[2] === nT) {
        if (nT === 3 && tBox === 3) {
          if (T[1] + T[2] !== 0) return done(126, 0);
          return done(127, 0);
        }
        if (B[0] === nT) {
          if (T[2] === nT) return done(128, 0);
        } else if (T[2] === nT || (B[0] === nT - 1 && T[2] === nT - 1) || B[0] === T[2]) {
          st.CF |= 0x2;
          return done(129, 0);
        }
      }
      return follow();
    }

    if (rank === 2) {
      if (nT < 3 || nT > 6) {
        if (st.kMin <= 2 && ovl !== 0) return done(130, 0);
        return done(131, 0);
      }
      if (st.kMax === 3) {
        if ((ovl === 0 || f1 === 0) && aux5(st)) return;
        return done(33, 0, fr);
      }
      if (st.kMin > 2 || ovl === 0) return done(34, 0, fr);
      return done(35, 0, fr);
    }

    if (nT >= 7) {
      if (st.kMin > rank || ovl === 0) return done(131, 0);
      return done(130, 0);
    }
    if (st.kMin > rank || ovl === 0) return done(34, 0, fr);
    return done(35, 0, fr);

    function complex() {
      st.CF |= 0x4000000;
      if (sameType) {
        if (nT <= 6) {
          if (tRow !== 0) return done(36, 0, fr);
          if (tCol !== 0) return done(37, 0, fr);
          if (tBox === 0) return done(118, 0);
          return done(38, 0, fr);
        }
        if (tRow !== 0) return done(132, 0);
        if (tCol !== 0) return done(133, 0);
        if (tBox === 0) return done(118, 0);
        return done(134, 0);
      }
      if (nT <= 6) return done(39, 0, fr);
      return done(135, 0);
    }

    function follow() {
      if (cx || !sameType) return complex();
      var slim = st.nlsat !== 0 && ovl !== 0 && st.kMin === 1;
      var v = -1;
      if (firstKind === 0) {
        if (lCol + lBox === nT + 1) v = 0;
        else if (lCol + lBox === nT + 3) v = 1;
      } else if (firstKind === 1) {
        if (lRow + lBox === nT + 1) v = 2;
        else if (lRow + lBox === nT + 3) v = 3;
      } else if (firstKind === 3) {
        if (lBox === nT && lRow + lCol === nT + 1) v = 4;
      }
      if (v < 0) return complex();
      if (nT !== 0 && L[2] === nT - 1 && L[3] === 1 && st.rankOverlap === 1) return done(slim ? 41 : 40, 0x200, [v]);
      var fz = st.rankOverlap === 1 && f1 === 1;
      var va = [v, i, st.truths, st.links];
      if (slim) return done(fz ? 44 : 45, 0, va);
      return done(fz ? 42 : 43, fz ? 0x200 : 0x400, va);
    }
  }

  pat.oneDigit = oneDigit;
  pat.aux1 = aux1;
  pat.aux1Value = aux1Value;
  pat.aux2 = aux2;
  pat.aux3 = aux3;
  pat.aux4 = aux4;
  pat.aux5 = aux5;
})();
