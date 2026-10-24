var TLE = globalThis.TLE || (globalThis.TLE = {});

(function () {
  if (!TLE.ext) TLE.ext = {};
  if (!TLE.log) TLE.log = function () {};

  TLE.putTag = function (st, k, a) {
    var f = TLE.ext.tag;
    if (f) f(st, k, a);
  };

  var NW = 23;
  TLE.NW = NW;

  var cRow = new Uint8Array(729);
  var cCol = new Uint8Array(729);
  var cD0 = new Uint8Array(729);
  var cCell = new Uint8Array(729);
  var cBox = new Uint8Array(729);
  var cSets = new Int16Array(729 * 4);
  for (var c = 0; c < 729; c++) {
    var r = (c / 81) | 0;
    var k = ((c / 9) | 0) % 9;
    var d = c % 9;
    var b = ((r / 3) | 0) * 3 + ((k / 3) | 0);
    cRow[c] = r;
    cCol[c] = k;
    cD0[c] = d;
    cCell[c] = r * 9 + k;
    cBox[c] = b;
    cSets[c * 4] = r * 9 + d;
    cSets[c * 4 + 1] = 81 + k * 9 + d;
    cSets[c * 4 + 2] = 162 + r * 9 + k;
    cSets[c * 4 + 3] = 243 + b * 9 + d;
  }

  var setSlots = new Int16Array(324 * 9);
  for (var s = 0; s < 324; s++) {
    for (var p = 0; p < 9; p++) {
      var cand;
      if (s < 81) cand = ((s / 9) | 0) * 81 + p * 9 + (s % 9);
      else if (s < 162) cand = p * 81 + (((s - 81) / 9) | 0) * 9 + ((s - 81) % 9);
      else if (s < 243) cand = (s - 162) * 9 + p;
      else {
        var bx = ((s - 243) / 9) | 0;
        var dd = (s - 243) % 9;
        var rr = ((bx / 3) | 0) * 3 + ((p / 3) | 0);
        var cc = (bx % 3) * 3 + (p % 3);
        cand = rr * 81 + cc * 9 + dd;
      }
      setSlots[s * 9 + p] = cand;
    }
  }

  TLE.cRow = cRow;
  TLE.cCol = cCol;
  TLE.cD0 = cD0;
  TLE.cCell = cCell;
  TLE.cBox = cBox;
  TLE.cSets = cSets;
  TLE.setSlots = setSlots;

  TLE.setKind = function (s) {
    return s < 324 ? (s / 81) | 0 : 4;
  };

  function bitCount(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  TLE.bitCount = bitCount;

  TLE.maskCount = function (m, off, n) {
    var t = 0;
    for (var i = 0; i < n; i++) t += bitCount(m[off + i]);
    return t;
  };

  TLE.candNumber = function (row, col, digit) {
    return row * 81 + col * 9 + digit - 1;
  };

  TLE.candOf = function (cand) {
    return { row: cRow[cand], col: cCol[cand], digit: cD0[cand] + 1 };
  };

  function badSet(ref) {
    return new Error("unknown set " + JSON.stringify(ref));
  }

  function isIdx(v, n) {
    return typeof v === "number" && v === Math.floor(v) && v >= 0 && v < n;
  }

  TLE.setNumber = function (ref) {
    if (typeof ref === "number") {
      if (!isIdx(ref, 326)) throw badSet(ref);
      return ref;
    }
    if (!ref || typeof ref !== "object") throw badSet(ref);
    var kind = ref.kind;
    if (kind === "row" || kind === "col" || kind === "box") {
      if (!isIdx(ref.index, 9) || !isIdx(ref.digit - 1, 9)) throw badSet(ref);
      var base = kind === "row" ? 0 : kind === "col" ? 81 : 243;
      return base + ref.index * 9 + ref.digit - 1;
    }
    if (kind === "cell") {
      if (ref.cell !== undefined) {
        if (!isIdx(ref.cell, 81)) throw badSet(ref);
        return 162 + ref.cell;
      }
      if (!isIdx(ref.row, 9) || !isIdx(ref.col, 9)) throw badSet(ref);
      return 162 + ref.row * 9 + ref.col;
    }
    if (kind === "virtual") return 324;
    throw badSet(ref);
  };

  TLE.setOf = function (s) {
    if (s < 81) return { kind: "row", index: (s / 9) | 0, digit: (s % 9) + 1 };
    if (s < 162) return { kind: "col", index: ((s - 81) / 9) | 0, digit: ((s - 81) % 9) + 1 };
    if (s < 243) return { kind: "cell", cell: s - 162, row: ((s - 162) / 9) | 0, col: (s - 162) % 9 };
    if (s < 324) return { kind: "box", index: ((s - 243) / 9) | 0, digit: ((s - 243) % 9) + 1 };
    if (s === 324) return { kind: "virtual" };
    return { kind: "kill" };
  };
})();
