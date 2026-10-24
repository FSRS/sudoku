var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  var pat = TLE.pat || (TLE.pat = {});
  var tag = TLE.putTag;
  var NW = TLE.NW;
  var cSets = TLE.cSets;

  var P1 = [0, 4, 3, 1, 0, 2, 2, 2, 1];
  var P2 = [0, 2, 2, 0, 0, 2, 3, 3, 1];

  function bitCount9(x) {
    return TLE.bitCount(x & 0x1ff);
  }

  function kill0(st) {
    return st.kills.length > 0 ? st.kills[0] : 0;
  }

  function kill0Neighbors(st) {
    var N = new Uint32Array(NW);
    var k0 = kill0(st);
    if (st.cs[k0] !== 1) return N;
    for (var q = 0; q < 4; q++) {
      var s = cSets[k0 * 4 + q];
      for (var w = 0; w < NW; w++) N[w] |= st.setMask[s * NW + w];
    }
    N[k0 >> 5] &= ~(1 << (k0 & 31));
    return N;
  }

  function blindKind(st) {
    var N = kill0Neighbors(st);
    for (var i = 0; i < st.nT; i++) {
      var t = st.truths[i];
      var hit = false;
      for (var k = st.setOff[t]; k < st.setOff[t] + st.setLen[t]; k++) {
        var c = st.setList[k];
        if (N[c >> 5] & (1 << (c & 31))) {
          hit = true;
          break;
        }
      }
      if (!hit) return TLE.setKind(t);
    }
    return -1;
  }

  function clip7(v) {
    return v >>> 0 > 7 ? 7 : v;
  }

  function derive(st) {
    var nT = st.nT;
    st.sameType = st.tRow === nT || st.tCol === nT || st.tCell === nT || st.tBox === nT;
    st.sameLinkType = st.lRow === nT || st.lCol === nT || st.lCell === nT || st.lBox === nT;
    st.first = st.truths[0];
    var U = st.U;
    var v = new Int32Array(9);
    v[0] = U[1] & 7;
    v[1] = (nT - U[2]) & 7;
    v[2] = U[3] & 7;
    v[3] = U[4] & 7;
    v[4] = U[5] & 7;
    v[5] = clip7(st.rank);
    v[6] = clip7(st.kMin);
    v[7] = clip7(st.kMax);
    v[8] = st.ovl > 3 ? 3 : st.ovl;
    st.vec = v;
    st.pro = st.rank === 1 && st.nlsat !== 0 && st.ovl !== 0 && st.kMin === 1 ? 1 : 0;
  }

  function vecIs(st, tuple, n) {
    for (var i = 0; i < n; i++) if (st.vec[i] !== tuple[i]) return false;
    return true;
  }

  pat.bitCount9 = bitCount9;
  pat.kill0 = kill0;
  pat.kill0Neighbors = kill0Neighbors;
  pat.blindKind = blindKind;
  pat.derive = derive;
  pat.vecIs = vecIs;

  function markG(st) {
    st.CF |= 0x20000;
    if (st.B[0] !== st.nT) {
      tag(st, 10);
      st.CF |= 0x2;
    }
  }

  function rank2Tail(st, red) {
    if (st.kMax === 3) tag(st, 50);
    else if (red) {
      tag(st, 51);
      st.CF |= 0x1000;
    } else {
      tag(st, 52);
      st.CF |= 0x1000;
    }
  }

  function rank2(st) {
    var nT = st.nT;
    var U = st.U;
    var red = st.kMin <= 2 && st.ovl !== 0;
    if (U[2] === nT) {
      if (pat.endR2(st)) return;
      if (st.kMax === 3) tag(st, 50);
      else if (red) tag(st, 51);
      else tag(st, 52);
      return;
    }
    if (st.tCell === nT) {
      var allCell = false;
      if (pat.alsCover(st, 7) === 0) allCell = true;
      else {
        var best = pat.bestCover(st);
        if (best === -1 || st.coverShape <= 3 || !red) allCell = true;
      }
      if (allCell) tag(st, 53);
      else pat.alsPro(st);
      return;
    }
    if (pat.aux5(st)) return;
    if (red) {
      if (vecIs(st, P1, 9)) {
        tag(st, 54);
        if (st.rank + nT + 2 === st.nL && st.nkill > 1 && st.nlsat === 0) tag(st, 11);
        return;
      }
    } else if (vecIs(st, P2, 9)) {
      tag(st, 50);
      return;
    }
    var shape = (U[2] === nT - 1 && U[3] === 1) || (U[1] === 0 && ((U[2] === nT - 2 && U[3] === 2) || (U[2] === nT - 1 && U[3] === 0 && U[4] === 1)));
    if (shape) {
      rank2Tail(st, red);
      return;
    }
    if (U[3] <= 2 && U[3] + 2 * U[4] <= 2) {
      if (pat.endR2(st)) return;
      if (red) tag(st, 55);
      else tag(st, 56);
      return;
    }
    rank2Tail(st, red);
  }

  function rankN(st) {
    if (st.rank === 1 && pat.rank1(st)) return;
    var r = st.rank;
    if (r === 2) {
      rank2(st);
      return;
    }
    if (r <= 2) {
      tag(st, 57);
      return;
    }
    if (r === 3) {
      if (st.kMax === 4) {
        tag(st, 58);
        return;
      }
      if (st.kMax === 3 && st.kMin <= 3 && st.ovl !== 0) {
        tag(st, 50);
        return;
      }
    }
    if (st.kMin <= r && st.ovl !== 0) tag(st, 14, [r]);
    else tag(st, 15, [r]);
  }

  function coverFlags(st) {
    if (st.coverKinds & 7) st.CF |= 0x4;
    if (st.coverKinds & 0x38) st.CF |= 0x8;
  }

  function rank0Cells(st) {
    var nT = st.nT;
    if (st.oneLine && nT >= 2 && nT <= 6) {
      var house = st.nRowsT === 1 ? 0 : st.nColsT === 1 ? 1 : st.nBoxesT === 1 ? 2 : 3;
      tag(st, 16, [nT, house, st.nlsat - st.nspan > 0 ? 1 : 0]);
      return;
    }
    if (st.T[2] === nT && st.U[2] === nT) {
      if (nT === 4) {
        tag(st, 59);
        st.CF |= 0x1000000;
      } else tag(st, 60);
      return;
    }
    var sdq = pat.aux3(st);
    if (sdq === 2) {
      if (st.ovl !== 0) tag(st, 61);
      else tag(st, 62);
      return;
    }
    if (pat.alsCover(st, 7) === 0) {
      tag(st, 63);
      return;
    }
    var best = pat.bestCover(st);
    if (best === -1 || st.coverShape <= 3) {
      tag(st, 63);
      return;
    }
    var f = (st.coverShape - 4) & 255;
    if (f > 11) tag(st, 64);
    else if (f === 0) tag(st, 65);
    else if (f === 1) {
      if (sdq === 2) tag(st, 62);
      else tag(st, 66);
    } else if (f === 3) tag(st, 67);
    else if (f === 8) {
      if (st.coverAls === 2) {
        if (sdq === 2) tag(st, 62);
        else tag(st, 68);
      } else if (st.coverAls === 3) tag(st, 69);
      else tag(st, 70);
    } else if (f === 9 || f === 11) tag(st, 71);
    else tag(st, 64);
    coverFlags(st);
  }

  function rank0Mixed(st) {
    var nT = st.nT;
    var U = st.U;
    var T = st.T;
    var B0 = st.B[0];
    var mi = Math.min(nT - 2, 4);
    if (nT === 4 && st.tCell === 2 && st.lCell === 0 && st.Tn[2] === 2) {
      tag(st, st.nL === 4 ? 17 : 18);
      if (B0 !== 4) {
        tag(st, 10);
        st.CF |= 0x2;
      }
      st.CF |= 0x10000;
      return true;
    }
    if (nT <= 6) {
      var house = st.nRowsT === 1 ? 0 : st.nColsT === 1 ? 1 : st.nBoxesT === 1 ? 2 : -1;
      if (house >= 0) {
        tag(st, 19, [mi, house]);
        st.CF |= 0x4000000;
        return true;
      }
    }
    if (U[2] === nT) {
      if (B0 === nT) {
        tag(st, 72);
        st.CF |= 0x2;
      } else tag(st, 73);
      return true;
    }
    if (T[2] === nT - 1 && T[3] === 1 && U[1] === 0 && U[2] === nT - 3 && U[3] === 2 && U[4] === 1) {
      if (B0 === nT) {
        tag(st, 74);
        st.CF |= 0x2;
      } else tag(st, 75);
      return true;
    }
    return false;
  }

  function rank0Als(st) {
    if (pat.alsCover(st, 0) === 0) {
      tag(st, 76);
      return;
    }
    pat.bestCover(st);
    var als = (st.coverKinds & 7) !== 0;
    var ahs = (st.coverKinds & 0x38) !== 0;
    var sizes = (st.setSizes << 16) >> 16;
    var mixed = false;
    if (st.coverAls === 1) {
      if (sizes > 7) mixed = true;
      else if (ahs) tag(st, 77);
      else if (!als) tag(st, 78);
      else tag(st, 79);
    } else if (st.coverAls === 2) {
      if (!als) tag(st, 80);
      else if (ahs) tag(st, 81);
      else tag(st, 82);
    } else mixed = true;
    if (mixed) {
      if (als && ahs) tag(st, 83);
      else if (ahs) tag(st, 84);
      else if (als) tag(st, 85);
      else tag(st, 86);
    }
    coverFlags(st);
  }

  function rank0(st) {
    var nT = st.nT;
    var first = st.first;
    var mi = Math.min(nT - 2, 4);
    if (nT === 3) {
      if (st.L[2] === 3 && st.tCell === 1 && st.lCell === 1) {
        var key = -1;
        if (st.tBox === 2) {
          if (st.lRow === 2) key = 0;
          else if (st.lCol === 2) key = 1;
        }
        if (key < 0 && st.lBox === 2) {
          if (st.tRow === 2) key = 2;
          else if (st.tCol === 2) key = 3;
        }
        if (key >= 0) {
          tag(st, 20, [key]);
          st.CF |= 0x20000;
          return;
        }
      }
      if (st.tOver === 0 && st.tCell === 1 && st.nDig === 2 && st.lCell !== 0) {
        var sh = pat.aux2(st).sh;
        if (sh !== 3) {
          var b1 = sh & 1;
          var b2 = sh & 2;
          if (sh === 0) {
            if (st.tBox === 0) tag(st, 87);
            else tag(st, 88);
          } else if (st.tRow === 2 && b1) tag(st, 20, [2]);
          else if (st.tCol === 2 && b2) tag(st, 20, [st.tRow === 2 ? 2 : 3]);
          else if ((st.tRow !== 0 && b1) || (st.tCol !== 0 && b2)) tag(st, 89);
          else if ((st.tRow === 0 && b1) || (st.tCol === 0 && b2)) {
            if (st.lRow === 2) tag(st, 20, [0]);
            else if (st.lCol === 2) tag(st, 20, [1]);
            else tag(st, 90);
          } else tag(st, 88);
          markG(st);
          return;
        }
      }
    } else if (nT === 5) {
      if (st.L[2] !== 5 && st.tCell === 2 && st.lCell === 2) {
        var k3 = -1;
        if (st.tBox === 3) {
          if (st.lRow === 3) k3 = 0;
          else if (st.lCol === 3) k3 = 1;
        }
        if (k3 < 0 && st.lBox === 3) {
          if (st.tRow === 3) k3 = 2;
          else if (st.tCol === 3) k3 = 3;
        }
        if (k3 >= 0) {
          tag(st, 21, [k3]);
          st.CF |= 0x8000;
          return;
        }
      }
    }
    if (st.sameType) {
      if (first <= 80) {
        if (nT <= 6 && st.nRowsT === 1) tag(st, 22, [mi, 0]);
        else tag(st, 91);
      } else if (first >= 81 && first <= 161) {
        if (nT <= 6 && st.nColsT === 1) tag(st, 22, [mi, 1]);
        else tag(st, 92);
      } else if (first > 242) {
        if (nT <= 6 && st.nBoxesT === 1) tag(st, 22, [mi, 2]);
        else tag(st, 93);
      } else rank0Cells(st);
      return;
    }
    if (rank0Mixed(st)) return;
    rank0Als(st);
  }

  function mainPath(st) {
    var nT = st.nT;
    var first = st.first;
    if (nT === 1) {
      if (st.setLen[first] === 1) {
        pat.oneCand(st, false);
        return;
      }
      if (TLE.setKind(first) !== 2 && st.nspan === 1) {
        if (first > 242) tag(st, 94);
        else tag(st, 95);
        return;
      }
      tag(st, 13);
      return;
    }
    if (st.T[1] === nT) {
      pat.oneCand(st, true);
      return;
    }
    if (st.tCell === 0 && st.lCell === 0) {
      pat.oneDigit(st);
      return;
    }
    if (nT === 2 && TLE.setKind(st.truths[0]) === TLE.setKind(st.truths[1])) {
      if (TLE.setKind(first) === 2) {
        tag(st, st.nspan > 2 ? 100 : 101);
        return;
      }
      if (st.nspan > 2) tag(st, 96);
      else if (first <= 80) tag(st, 97);
      else if (first <= 161) tag(st, 98);
      else if (first > 242) tag(st, 99);
      return;
    }
    if (st.rank !== 0) rankN(st);
    else rank0(st);
  }

  pat.main = function (st) {
    derive(st);
    mainPath(st);
    pat.highlight(st);
  };
})();
