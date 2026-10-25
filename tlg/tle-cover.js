var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  function Cover(mI, mO) {
    this.mI = mI;
    this.mO = mO;
    this.itemIdx = new Int32Array(mI + 1).fill(-1);
    this.optIdx = new Int32Array(mO + 1).fill(-1);
    this.itemIds = [];
    this.itemNeeds = [];
    this.optIds = [];
    this.optLefts = [];
    this.declItem = [];
    this.declOpt = [];
    this.keys = null;
    this.keySet = null;
    this.closed = false;
    this.inNext = false;
    this.built = false;
    this.limit = 0;
    this.cb = null;
    this.sel = null;
  }

  var P = Cover.prototype;

  P.keyUsed = function (k) {
    if (this.keys === null && this.keySet === null) {
      var size = (this.mI + 1) * this.mO + 1;
      if (size <= 4000000) this.keys = new Uint8Array(size);
      else this.keySet = new Set();
    }
    if (this.keys !== null) return this.keys[k] !== 0;
    return this.keySet.has(k);
  };

  P.keyMark = function (k) {
    if (this.keys !== null) this.keys[k] = 1;
    else this.keySet.add(k);
  };

  P.addItem = function (id, need) {
    if (this.closed) return 0x10;
    if (id < 0 || id > this.mI) return 0x16;
    if (this.itemIdx[id] >= 0) return 0x11;
    this.itemIdx[id] = this.itemIds.length;
    this.itemIds.push(id);
    this.itemNeeds.push(need);
    this.built = false;
    return this.itemIds.length <= this.mI ? 0 : 0xc;
  };

  P.addOption = function (id, left) {
    if (this.closed) return 0x10;
    if (id < 0 || id > this.mO) return 0x16;
    if (this.optIdx[id] >= 0) return 0x11;
    this.optIdx[id] = this.optIds.length;
    this.optIds.push(id);
    this.optLefts.push(left);
    this.built = false;
    return this.optIds.length <= this.mO ? 0 : 0xc;
  };

  P.addEntry = function (i, o) {
    if (this.closed) return 0x10;
    if (i < 0 || i > this.mI) return 0x16;
    if (o < 0 || o > this.mO) return 0x16;
    var key = i * this.mO + o;
    if (this.keyUsed(key)) return 0x11;
    var ii = this.itemIdx[i];
    if (ii < 0) return 2;
    var oi = this.optIdx[o];
    if (oi < 0) return 2;
    this.declItem.push(ii);
    this.declOpt.push(oi);
    this.keyMark(key);
    this.built = false;
    return 0;
  };

  P.build = function () {
    var nI = this.itemIds.length;
    var nO = this.optIds.length;
    var nE = this.declItem.length;
    var need = new Int32Array(nI);
    var left = new Int32Array(nO);
    var iAct = new Uint8Array(nI);
    var avail = new Int32Array(nI);
    var iOff = new Int32Array(nI + 1);
    var oOff = new Int32Array(nO + 1);
    var entItem = new Int32Array(nE);
    var entOpt = new Int32Array(nE);
    var present = new Uint8Array(nE);
    var posInItem = new Int32Array(nE);
    var posInOpt = new Int32Array(nE);
    var i, e;
    for (i = 0; i < nI; i++) {
      need[i] = this.itemNeeds[i];
      iAct[i] = 1;
    }
    for (i = 0; i < nO; i++) left[i] = this.optLefts[i];
    for (e = 0; e < nE; e++) {
      entItem[e] = this.declItem[e];
      entOpt[e] = this.declOpt[e];
      present[e] = 1;
      iOff[entItem[e] + 1]++;
      oOff[entOpt[e] + 1]++;
    }
    for (i = 0; i < nI; i++) iOff[i + 1] += iOff[i];
    for (i = 0; i < nO; i++) oOff[i + 1] += oOff[i];
    var iEnt = new Int32Array(nE);
    var oEnt = new Int32Array(nE);
    var iFill = iOff.slice(0, nI);
    var oFill = oOff.slice(0, nO);
    for (e = 0; e < nE; e++) {
      var it = entItem[e];
      posInItem[e] = iFill[it] - iOff[it];
      iEnt[iFill[it]++] = e;
      posInOpt[e] = oFill[entOpt[e]] - oOff[entOpt[e]];
      oEnt[oFill[entOpt[e]]++] = e;
      avail[it]++;
    }
    this.nI = nI;
    this.nO = nO;
    this.need = need;
    this.left = left;
    this.iAct = iAct;
    this.avail = avail;
    this.iOff = iOff;
    this.oOff = oOff;
    this.iEnt = iEnt;
    this.oEnt = oEnt;
    this.entItem = entItem;
    this.entOpt = entOpt;
    this.present = present;
    this.posInItem = posInItem;
    this.posInOpt = posInOpt;
    this.nActive = nI;
    var sumNeed = 0;
    for (i = 0; i < nI; i++) if (need[i] > 0) sumNeed += need[i];
    var sumLeft = 0;
    for (i = 0; i < nO; i++) if (left[i] > 0) sumLeft += left[i];
    this.trail = new Int32Array(nE + 2 * nI + 2 * nO + sumNeed + sumLeft + 16);
    this.tlen = 0;
    this.sel = new Int32Array(nO + nE + 2);
    this.built = true;
  };

  P.push = function (v) {
    if (this.tlen === this.trail.length) {
      var t = new Int32Array(this.trail.length * 2 + 16);
      t.set(this.trail);
      this.trail = t;
    }
    this.trail[this.tlen++] = v;
  };

  P.undoTo = function (mark) {
    var trail = this.trail;
    var present = this.present;
    var avail = this.avail;
    var entItem = this.entItem;
    while (this.tlen > mark) {
      var v = trail[--this.tlen];
      var t = v & 7;
      var x = v >> 3;
      if (t === 0) {
        present[x] = 1;
        avail[entItem[x]]++;
      } else if (t === 1) {
        this.iAct[x] = 1;
        this.nActive++;
      } else if (t === 3) {
        this.need[x]++;
      } else {
        this.left[x]++;
      }
    }
  };

  P.apply = function (B, O) {
    var present = this.present;
    var avail = this.avail;
    var entItem = this.entItem;
    var entOpt = this.entOpt;
    var need = this.need;
    var iOff = this.iOff;
    var oOff = this.oOff;
    var iEnt = this.iEnt;
    var oEnt = this.oEnt;
    var base = avail[B] + 1;
    var rec = -1;
    var dead = false;
    this.left[O]--;
    this.push((O << 3) | 4);
    var removeO = this.left[O] === 0;
    var o0 = oOff[O];
    var o1 = oOff[O + 1];
    for (var q = o0; q < o1; q++) {
      var e = oEnt[q];
      var X = entItem[e];
      need[X]--;
      this.push((X << 3) | 3);
      if (need[X] !== 0) continue;
      this.iAct[X] = 0;
      this.nActive--;
      this.push((X << 3) | 1);
      var x0 = iOff[X];
      var x1 = iOff[X + 1];
      var xl = x1 - x0;
      var ep = this.posInItem[e];
      for (var u = 1; u < xl; u++) {
        var b = iEnt[x0 + ((ep + u) % xl)];
        if (present[b] === 0) continue;
        var C = entOpt[b];
        var c0 = oOff[C];
        var cl = oOff[C + 1] - c0;
        var bp = this.posInOpt[b];
        for (var w = 1; w < cl; w++) {
          var d = oEnt[c0 + ((bp + w) % cl)];
          var Y = entItem[d];
          present[d] = 0;
          var a = --avail[Y];
          this.push((d << 3) | 0);
          if (a === 0) dead = true;
          if (a < base) {
            base = a;
            rec = Y;
          }
        }
      }
      removeO = true;
    }
    if (removeO) {
      for (q = o0; q < o1; q++) {
        var dd = oEnt[q];
        if (present[dd] === 0) continue;
        present[dd] = 0;
        avail[entItem[dd]]--;
        this.push((dd << 3) | 0);
      }
    }
    this.rec = rec;
    this.dead = dead;
  };

  P.visit = function (depth, rec, last) {
    if (this.limit !== 0 && depth > this.limit) return false;
    if (this.nActive === 0) return this.cb(this.sel, depth) === true;
    var need = this.need;
    var avail = this.avail;
    var present = this.present;
    var I = -1;
    var start = 0;
    if (depth > 0 && last >= 0 && need[this.entItem[last]] !== 0) {
      I = this.entItem[last];
      start = this.posInItem[last];
    } else if (rec >= 0 && need[rec] !== 0) {
      I = rec;
    } else {
      var best = 0x7fffffff;
      var iAct = this.iAct;
      for (var i = 0, n = this.nI; i < n; i++) {
        if (iAct[i] !== 0 && avail[i] < best) {
          best = avail[i];
          I = i;
        }
      }
    }
    var off = this.iOff[I];
    var end = this.iOff[I + 1];
    var iEnt = this.iEnt;
    var sel = this.sel;
    var optIds = this.optIds;
    for (var p = off + start; p < end; p++) {
      var e = iEnt[p];
      if (present[e] === 0) continue;
      var O = this.entOpt[e];
      sel[depth] = optIds[O];
      var mark = this.tlen;
      this.apply(I, O);
      if (!this.dead) {
        if (this.visit(depth + 1, this.rec, e)) {
          this.undoTo(mark);
          return true;
        }
      }
      this.undoTo(mark);
    }
    return false;
  };

  P.run = function (cb) {
    if (this.inNext) return false;
    if (!this.built) this.build();
    this.closed = true;
    this.inNext = true;
    this.cb = cb;
    var stopped = this.visit(0, -1, -1);
    this.cb = null;
    this.inNext = false;
    this.closed = false;
    return stopped;
  };

  TLE.Cover = Cover;
})();
