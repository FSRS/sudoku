(function (root) {
  "use strict";

  const Math = root.Math, Float32Array = root.Float32Array, Float64Array = root.Float64Array;
  const Int32Array = root.Int32Array, Uint8Array = root.Uint8Array, Map = root.Map, Object = root.Object;
  const Int8Array = root.Int8Array, Int16Array = root.Int16Array, DataView = root.DataView, WeakMap = root.WeakMap;

  const VERSION = "0.8.1";

  const DEFAULTS = {
    maxSide: 1600,
    minBoard: 180,
    minProbe: 90,
    adaptWinDiv: 40,
    adaptWinWide: 12,
    wideMin: 0.4,
    adaptOffset: 0.05,
    faintRidge: 0.02,
    faintStep: 0.15,
    edgeStep: 0.03,
    componentFill: 0.8,
    tileAspect: 1.43,
    tileSizeTol: 0.25,
    tileGroup: 30,
    familyTol: 0.03,
    familySpan: 0.08,
    candAspect: 2.5,
    mergeIou: 0.8,
    memberIou: 0.95,
    skipInside: 0.8,
    skipAround: 0.9,
    skipSmaller: 0.75,
    verifyMargin: 0.15,
    workSide: 640,
    ridgeQuantile: 0.6,
    strictQuantile: 0.3,
    snapRadius: 0.12,
    squareTol: 0.02,
    cellAspectMin: 0.625,
    cellAspectMax: 1.6,
    nearMin: 0.85,
    nearMax: 1.18,
    harmonicScore: 0.5,
    spacingCv: 0.1,
    outerSpMin: 0.75,
    outerSpMax: 1.25,
    minContrast: 0.015,
    thinShare: 0.5,
    bandOutlier: 2,
    extentLevel: 0.4,
    extentOn: 0.6,
    extentSlack: 0.5,
    extentOver: 0.9,
    crossMax: 0.35,
    beyondRatio: 2,
    faintMin: 0.85,
    faintMax: 1.18,
    finerQuantile: 0.3,
    finerRatio: 0.5,
    finerStepRatio: 1.25,
    finerStepMin: 0.05,
    inkStep: 0.1,
    inkShare: 0.015,
    inkCells: 17,
    multipleArea: 0.3,
    multipleOverlap: 0.05,
    measureSide: 1600,
    outerReach: 0.1,
    bandTau: 0.03,
    bandTauRel: 0.05,
    outerRamp: 0.06,
    outerRampMin: 5,
    rampStart: 0.5,
    outerMax: 0.5,
    outerOdd: 0.2,
    oddWidth: 2,
    outerCut: 0.12,
    outerRatio: 2.5,
    colourTol: 0.04,
    colourTolRel: 0.06,
    cellInset: 0.06,
    cellEdge: 0.1,
    inkRank: 500,
    flatContrast: 0.1,
    inkLevel: 0.5,
    roleColour: 55,
    roleShare: 0.1,
    roleOutlier: 3,
    roleGivens: 17,
    roleNeutral: 0.2,
    roleColoured: 0.3,
    roleBlueChroma: 60,
    roleBlueMin: 195,
    roleBlueMax: 260,
    roleDimStep: 250,
    roleDimLight: 190,
    roleDimDark: 200,
    roleDimBright: 1.4,
    roleInkFloor: 0.04,
    roleGroupWidth: 1.2,
    roleGroupContrast: 1.25,
    roleWidth: 1.25,
    roleWidthGap: 1.08,
    roleHeightTol: 0.3,
    roleFillTight: 10,
    roleFillGap: 8,
    roleFillMost: 0.5,
    roleFillFew: 0.15,
    roleSlack: 5,
    roleFillShare: 0.6,
    roleFillOther: 16,
    bandEdge: 0.9,
    bandStrip: 0.25,
    bandCorner: 0.3,
    glyphLevel: 0.3,
    glyphRatio: 0.7,
    glyphTall: 0.75,
    confidenceA: 2,
    confidenceB: 2,
    lowConfidence: 0.9,
    fewClues: 17,
  };
  let P = DEFAULTS;

  function areaWeights(a, b, on, limit) {
    const k = (b - a) / on;
    const start = new Int32Array(on), count = new Int32Array(on), ws = [];
    for (let o = 0; o < on; o++) {
      const lo = a + o * k, hi = lo + k;
      let i0 = Math.max(0, Math.floor(lo)), i1 = Math.min(limit, Math.ceil(hi - 1e-9));
      if (i1 <= i0) { i0 = Math.min(limit - 1, Math.max(0, Math.floor(lo))); i1 = i0 + 1; }
      start[o] = i0; count[o] = i1 - i0;
      const base = ws.length;
      let tot = 0;
      for (let i = i0; i < i1; i++) {
        const w = Math.max(0, Math.min(i + 1, hi) - Math.max(i, lo));
        ws.push(w); tot += w;
      }
      for (let j = base; j < ws.length; j++) ws[j] = tot > 0 ? ws[j] / tot : 1 / (i1 - i0);
    }
    return { start, count, w: Float32Array.from(ws) };
  }

  function resampleLuma(img, x0, y0, x1, y1, ow, oh) {
    const W = img.width, d = img.data;
    const ax = areaWeights(x0, x1, ow, W), ay = areaWeights(y0, y1, oh, img.height);
    const sx0 = ax.start[0], sx1 = ax.start[ow - 1] + ax.count[ow - 1];
    const sy0 = ay.start[0], sy1 = ay.start[oh - 1] + ay.count[oh - 1];
    const rw = sx1 - sx0, rows = sy1 - sy0;
    const tmp = new Float32Array(rows * ow), row = new Float32Array(rw);
    for (let y = 0; y < rows; y++) {
      let p = ((sy0 + y) * W + sx0) * 4;
      for (let x = 0; x < rw; x++, p += 4) {
        let v = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        const a = d[p + 3];
        if (a !== 255) v = 255 - (255 - v) * a / 255;
        row[x] = v / 255;
      }
      const t = y * ow;
      for (let o = 0, q = 0; o < ow; o++) {
        const st = ax.start[o] - sx0, n = ax.count[o];
        let s = 0;
        for (let c = 0; c < n; c++, q++) s += row[st + c] * ax.w[q];
        tmp[t + o] = s;
      }
    }
    const out = new Float32Array(ow * oh);
    for (let o = 0, q = 0; o < oh; o++) {
      const st = ay.start[o] - sy0, n = ay.count[o], base = o * ow;
      for (let c = 0; c < n; c++, q++) {
        const w = ay.w[q], src = (st + c) * ow;
        for (let x = 0; x < ow; x++) out[base + x] += tmp[src + x] * w;
      }
    }
    return out;
  }

  function adaptiveMasks(g, w, h, win, off) {
    const W1 = w + 1, I = new Float64Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let run = 0;
      for (let x = 0; x < w; x++) { run += g[y * w + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + run; }
    }
    const r = win >> 1, dark = new Uint8Array(w * h), light = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const ya = Math.max(0, y - r), yb = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const xa = Math.max(0, x - r), xb = Math.min(w, x + r + 1);
        const mean = (I[yb * W1 + xb] - I[ya * W1 + xb] - I[yb * W1 + xa] + I[ya * W1 + xa]) / ((xb - xa) * (yb - ya));
        const v = g[y * w + x];
        if (v < mean - off) dark[y * w + x] = 1; else if (v > mean + off) light[y * w + x] = 1;
      }
    }
    return { dark, light };
  }

  function dilate1(m, w, h) {
    const t = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (m[row + x] || (x > 0 && m[row + x - 1]) || (x < w - 1 && m[row + x + 1])) t[row + x] = 1;
      }
    }
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (t[row + x] || (y > 0 && t[row - w + x]) || (y < h - 1 && t[row + w + x])) out[row + x] = 1;
      }
    }
    return out;
  }

  function components(m, w, h, val, conn8, minW, minH) {
    const lab = new Uint8Array(w * h), stack = new Int32Array(w * h), out = [];
    for (let s = 0; s < w * h; s++) {
      if (lab[s] || m[s] !== val) continue;
      let sp = 0, n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
      stack[sp++] = s; lab[s] = 1;
      while (sp) {
        const p = stack[--sp], y = (p / w) | 0, x = p - y * w;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const l = x > 0, r = x < w - 1, u = y > 0, d = y < h - 1;
        let q;
        if (l && !lab[q = p - 1] && m[q] === val) { lab[q] = 1; stack[sp++] = q; }
        if (r && !lab[q = p + 1] && m[q] === val) { lab[q] = 1; stack[sp++] = q; }
        if (u && !lab[q = p - w] && m[q] === val) { lab[q] = 1; stack[sp++] = q; }
        if (d && !lab[q = p + w] && m[q] === val) { lab[q] = 1; stack[sp++] = q; }
        if (conn8) {
          if (u && l && !lab[q = p - w - 1] && m[q] === val) { lab[q] = 1; stack[sp++] = q; }
          if (u && r && !lab[q = p - w + 1] && m[q] === val) { lab[q] = 1; stack[sp++] = q; }
          if (d && l && !lab[q = p + w - 1] && m[q] === val) { lab[q] = 1; stack[sp++] = q; }
          if (d && r && !lab[q = p + w + 1] && m[q] === val) { lab[q] = 1; stack[sp++] = q; }
        }
      }
      if (x1 - x0 + 1 >= minW && y1 - y0 + 1 >= minH) out.push({ x0, y0, x1, y1, n });
    }
    return out;
  }

  function gridComponentCands(mask, w, h, minSide, out) {
    const comps = components(dilate1(mask, w, h), w, h, 1, true, minSide, minSide);
    for (const c of comps) {
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      if (bw > P.candAspect * bh || bh > P.candAspect * bw) continue;
      if (c.n / (bw * bh) > P.componentFill) continue;
      out.push({ x: c.x0, y: c.y0, width: bw, height: bh, method: "component" });
    }
  }

  function tileCands(mask, w, h, minCell, maxCell, out) {
    const comps = components(mask, w, h, 0, false, minCell, minCell);
    const tiles = [];
    for (const c of comps) {
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      if (bw > maxCell || bh > maxCell || bw > P.tileAspect * bh || bh > P.tileAspect * bw) continue;
      if (c.n / (bw * bh) < 0.5) continue;
      tiles.push({ cx: (c.x0 + c.x1) / 2, cy: (c.y0 + c.y1) / 2, w: bw, h: bh, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 });
    }
    if (tiles.length < P.tileGroup) return;
    const parent = tiles.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const B = maxCell * 1.7, buckets = new Map();
    tiles.forEach((t, i) => {
      const k = Math.floor(t.cx / B) + "," + Math.floor(t.cy / B);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    });
    tiles.forEach((t, i) => {
      const bx = Math.floor(t.cx / B), by = Math.floor(t.cy / B);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const list = buckets.get((bx + dx) + "," + (by + dy));
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
          const u = tiles[j];
          const mw = (t.w + u.w) / 2, mh = (t.h + u.h) / 2;
          if (Math.abs(t.w - u.w) > P.tileSizeTol * mw || Math.abs(t.h - u.h) > P.tileSizeTol * mh) continue;
          const ax = Math.abs(u.cx - t.cx), ay = Math.abs(u.cy - t.cy);
          const horiz = ay <= 0.3 * mh && ax >= 0.85 * mw && ax <= 1.7 * mw;
          const vert = ax <= 0.3 * mw && ay >= 0.85 * mh && ay <= 1.7 * mh;
          if (horiz || vert) parent[find(i)] = find(j);
        }
      }
    });
    const groups = new Map();
    tiles.forEach((t, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); });
    for (const g of groups.values()) {
      if (g.length < P.tileGroup) continue;
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (const t of g) { x0 = Math.min(x0, t.x0); y0 = Math.min(y0, t.y0); x1 = Math.max(x1, t.x1); y1 = Math.max(y1, t.y1); }
      out.push({ x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1, method: "tiles" });
    }
  }

  function longRuns(mask, w, h, horizontal, minLen, gap) {
    const lanes = horizontal ? h : w, start = new Int32Array(lanes).fill(-1), last = new Int32Array(lanes);
    const byLane = [];
    for (let i = 0; i < lanes; i++) byLane.push([]);
    const close = (lane) => {
      if (start[lane] >= 0 && last[lane] - start[lane] + 1 >= minLen) byLane[lane].push({ a: start[lane], b: last[lane], pos: lane, n: 1 });
      start[lane] = -1;
    };
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const lane = horizontal ? y : x, j = horizontal ? x : y;
        if (mask[row + x]) { if (start[lane] < 0) start[lane] = j; last[lane] = j; } else if (start[lane] >= 0 && j - last[lane] > gap) close(lane);
      }
      if (horizontal) close(y);
    }
    if (!horizontal) for (let x = 0; x < w; x++) close(x);
    const segs = [];
    let prev = [];
    for (let i = 0; i < lanes; i++) {
      const cur = byLane[i];
      for (const r of cur) {
        const tol = Math.max(2, 0.01 * (r.b - r.a));
        const m = prev.find((p) => p.pos + p.n === i && Math.abs(p.a - r.a) <= tol && Math.abs(p.b - r.b) <= tol);
        if (m) { m.n++; r.merged = m; } else segs.push(r);
      }
      prev = cur.map((r) => r.merged || r);
    }
    return segs.map((s) => ({ a: s.a, b: s.b, pos: s.pos + (s.n - 1) / 2 }));
  }

  function segmentFamilies(segs) {
    const byEnds = new Map();
    for (const t of segs) {
      const k = t.a + "," + t.b, u = byEnds.get(k);
      if (u) { u.n++; u.lo = Math.min(u.lo, t.pos); u.hi = Math.max(u.hi, t.pos); } else byEnds.set(k, { a: t.a, b: t.b, n: 1, lo: t.pos, hi: t.pos });
    }
    const ends = [...byEnds.values()].sort((u, v) => u.a - v.a), fams = [], seen = new Set();
    const wmed = (mem, key, n) => {
      mem.sort((u, v) => u[key] - v[key]);
      let c = 0;
      for (const u of mem) { c += u.n; if (c > n >> 1) return u[key]; }
      return mem[mem.length - 1][key];
    };
    let lo = 0;
    for (const s of ends) {
      const tol = Math.max(3, P.familyTol * (s.b - s.a));
      while (ends[lo].a < s.a - tol) lo++;
      const mem = [];
      let n = 0, pmin = Infinity, pmax = -Infinity;
      for (let i = lo; i < ends.length && ends[i].a <= s.a + tol; i++) {
        const t = ends[i];
        if (Math.abs(t.b - s.b) > tol) continue;
        mem.push(t); n += t.n;
        if (t.lo < pmin) pmin = t.lo;
        if (t.hi > pmax) pmax = t.hi;
      }
      if (n < 4) continue;
      const f = { a: wmed(mem, "a", n), b: wmed(mem, "b", n), lo: pmin, hi: pmax, n }, key = f.a + "," + f.b + "," + f.lo + "," + f.hi + "," + n;
      if (!seen.has(key)) { seen.add(key); fams.push(f); }
    }
    return fams;
  }

  function lineCands(hmask, vmask, w, h, minLen, out) {
    const hs = segmentFamilies(longRuns(hmask, w, h, true, minLen, 2));
    const vs = segmentFamilies(longRuns(vmask, w, h, false, minLen, 2));
    for (const H of hs) for (const V of vs) {
      const bw = H.b - H.a, bh = V.b - V.a, tx = P.familySpan * bw, ty = P.familySpan * bh;
      if (Math.abs(V.lo - H.a) > tx || Math.abs(V.hi - H.b) > tx || Math.abs(H.lo - V.a) > ty || Math.abs(H.hi - V.b) > ty) continue;
      out.push({ x: H.a, y: V.a, width: bw + 1, height: bh + 1, method: "lines" });
    }
  }

  function ridgeMasks(g, w, h, delta, step) {
    const hm = new Uint8Array(w * h), vm = new Uint8Array(w * h);
    const on = (v, a, b) => (a - v >= delta && b - v >= delta) || (v - a >= delta && v - b >= delta) || Math.abs(a - b) >= step;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, v = g[p];
      for (const d of [2, 4]) {
        if (!hm[p] && y >= d && y + d < h && on(v, g[p - d * w], g[p + d * w])) hm[p] = 1;
        if (!vm[p] && x >= d && x + d < w && on(v, g[p - d], g[p + d])) vm[p] = 1;
      }
    }
    return { hm, vm };
  }

  function edgeMask(g, w, h, step) {
    const m = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (Math.abs(g[p + 1] - g[p - 1]) >= step || Math.abs(g[p + w] - g[p - w]) >= step) m[p] = 1;
    }
    return m;
  }

  function iou(a, b) {
    const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const inter = ix * iy, uni = a.width * a.height + b.width * b.height - inter;
    return uni > 0 ? inter / uni : 0;
  }

  function inside(a, b) {
    const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return a.width * a.height > 0 ? (ix * iy) / (a.width * a.height) : 0;
  }

  function mergeCandidates(list) {
    const out = [];
    list.sort((a, b) => b.width * b.height - a.width * a.height);
    for (const c of list) {
      const o = out.find((k) => iou(k, c) >= P.mergeIou);
      if (!o) out.push(Object.assign({ members: [] }, c));
      else if (iou(o, c) < P.memberIou && o.members.every((m) => iou(m, c) < P.memberIou)) o.members.push(c);
    }
    return out;
  }

  // Reorders a in place; pass a copy when a is still needed.
  function select(a, n, k) {
    let l = 0, r = n - 1;
    while (r > l) {
      const pv = a[(l + r) >> 1];
      let i = l, j = r;
      while (i <= j) {
        while (a[i] < pv) i++;
        while (a[j] > pv) j--;
        if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
      }
      if (k <= j) r = j; else if (k >= i) l = i; else break;
    }
    return a[k];
  }

  function prepare(W) {
    const g = W.g, gw = W.gw, gh = W.gh, n = gw * gh;
    const lq = new Uint8Array(n), rv = new Uint8Array(n), rh = new Uint8Array(n);
    const d1 = Math.max(1, Math.round(W.R / 2)), d2 = W.R;
    const two = (v, a, b) => {
      if (a !== a) return b !== b ? 0 : b - v;
      if (b !== b) return a - v;
      const ra = a - v, rb = b - v;
      return ra > 0 && rb > 0 ? (ra < rb ? ra : rb) : ra < 0 && rb < 0 ? (ra > rb ? ra : rb) : 0;
    };
    const q = (r) => (r >= 1 ? 255 : Math.round(r * 255));
    for (let y = 0; y < gh; y++) {
      const row = y * gw;
      const u1 = y >= d1, n1 = y + d1 < gh, u2 = y >= d2, n2 = y + d2 < gh;
      for (let x = 0; x < gw; x++) {
        const p = row + x, v = g[p];
        const a1 = two(v, x >= d1 ? g[p - d1] : NaN, x + d1 < gw ? g[p + d1] : NaN);
        const a2 = two(v, x >= d2 ? g[p - d2] : NaN, x + d2 < gw ? g[p + d2] : NaN);
        const b1 = two(v, u1 ? g[p - d1 * gw] : NaN, n1 ? g[p + d1 * gw] : NaN);
        const b2 = two(v, u2 ? g[p - d2 * gw] : NaN, n2 ? g[p + d2 * gw] : NaN);
        lq[p] = Math.round(v * 255);
        rv[p] = q(Math.max(Math.abs(a1), Math.abs(a2)));
        rh[p] = q(Math.max(Math.abs(b1), Math.abs(b2)));
      }
    }
    W.lq = lq; W.rv = rv; W.rh = rh;
  }

  function quantileProfile(a, gw, gh, vertical, lo, hi, q) {
    const n = vertical ? gw : gh, m = hi - lo, k = Math.min(m - 1, Math.floor(m * q)), out = new Float32Array(n);
    const pickBin = (hist, base) => {
      let c = 0, bin = 0;
      for (; bin < 255; bin++) { c += hist[base + bin]; if (c > k) break; }
      return bin / 255;
    };
    if (vertical) {
      const hist = new Int32Array(gw * 256);
      for (let y = lo; y < hi; y++) {
        const row = y * gw;
        for (let x = 0; x < gw; x++) hist[x * 256 + a[row + x]]++;
      }
      for (let x = 0; x < gw; x++) out[x] = pickBin(hist, x * 256);
    } else {
      const hist = new Int32Array(256);
      for (let y = 0; y < gh; y++) {
        hist.fill(0);
        const row = y * gw;
        for (let x = lo; x < hi; x++) hist[a[row + x]]++;
        out[y] = pickBin(hist, 0);
      }
    }
    return out;
  }

  function maxFilter(a, R) {
    const n = a.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let v = a[i];
      for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) if (a[j] > v) v = a[j];
      out[i] = v;
    }
    return out;
  }

  function sampler(L) {
    const n = L.length;
    return (x) => {
      if (!(x >= 0) || x > n - 1) return 0;
      const i = Math.floor(x), f = x - i;
      return i + 1 < n ? L[i] + (L[i + 1] - L[i]) * f : L[i];
    };
  }

  function latticeScore(S, a, p) {
    let s = 0.5 * (S(a) + S(a + 9 * p)) - 0.5 * (S(a - p) + S(a + 10 * p));
    for (let k = 1; k <= 8; k++) s += S(a + k * p);
    return s;
  }

  function searchLattice(L, pmin, pmax) {
    const n = L.length;
    if (pmax < pmin) return null;
    const S2 = sampler(maxFilter(L, 2)), S = sampler(L);
    let best = null;
    const dp = Math.max(0.2, pmin * 0.004);
    for (let p = pmin; p <= pmax; p += dp) {
      for (let a = -0.3 * p; a + 9 * p <= n - 1 + 0.3 * p; a += 1) {
        const s = latticeScore(S2, a, p);
        if (!best || s > best.score) best = { a, p, score: s };
      }
    }
    if (!best) return null;
    let { a, p } = best, sc = latticeScore(S, a, p);
    for (let it = 0; it < 2; it++) {
      const a0 = a, p0 = p;
      for (let pp = p0 - dp; pp <= p0 + dp; pp += dp / 8) for (let aa = a0 - 1.5; aa <= a0 + 1.5; aa += 0.25) {
        const s = latticeScore(S, aa, pp);
        if (s > sc) { sc = s; a = aa; p = pp; }
      }
    }
    return { a, p, score: sc };
  }

  function snapLine(L, x, R) {
    const n = L.length;
    let bi = -1, bs = 0;
    for (let i = Math.max(0, Math.round(x - R)); i <= Math.min(n - 1, Math.round(x + R)); i++) {
      const q = (i - x) / R, sc = L[i] * (1 - 0.5 * q * q);
      if (sc > bs) { bs = sc; bi = i; }
    }
    const bv = bi < 0 ? 0 : L[bi];
    if (bi < 0) return { pos: x, peak: 0, lo: x, hi: x };
    const half = bv * 0.5;
    let lo = bi, hi = bi;
    while (lo > 0 && L[lo - 1] >= half) lo--;
    while (hi < n - 1 && L[hi + 1] >= half) hi++;
    let sw = 0, sx = 0;
    for (let i = lo; i <= hi; i++) { const wt = L[i] - half * 0.5; sw += wt; sx += wt * i; }
    return { pos: sx / sw, peak: bv, lo, hi };
  }

  function median(arr) {
    const a = Float32Array.from(arr);
    return a.length ? select(a, a.length, a.length >> 1) : 0;
  }

  function profiles(W, x0, x1, y0, y1, q = P.ridgeQuantile) {
    const c0 = Math.max(0, Math.floor(x0)), c1 = Math.min(W.gw, Math.ceil(x1) + 1);
    const r0 = Math.max(0, Math.floor(y0)), r1 = Math.min(W.gh, Math.ceil(y1) + 1);
    if (c1 - c0 < 9 || r1 - r0 < 9) return null;
    const qp = (a, vertical, lo, hi, q) => quantileProfile(a, W.gw, W.gh, vertical, lo, hi, q);
    return {
      x: { M: qp(W.lq, true, r0, r1, 0.5), L: qp(W.rv, true, r0, r1, q), dark: W.dark },
      y: { M: qp(W.lq, false, c0, c1, 0.5), L: qp(W.rh, false, c0, c1, q), dark: W.dark },
    };
  }

  function fitLattice(W, q) {
    const pmin = Math.max(P.minProbe / 9 * 0.5, 0.5 * W.pe), pmax = 1.2 * W.pe;
    let pr = profiles(W, 0, W.gw, 0, W.gh, q);
    let fx = searchLattice(pr.x.L, pmin, Math.min(pmax, (W.gw - 1) / 9 * 1.05));
    let fy = searchLattice(pr.y.L, pmin, Math.min(pmax, (W.gh - 1) / 9 * 1.05));
    if (!fx || !fy) return null;
    if (fx.p / fy.p < P.cellAspectMin || fx.p / fy.p > P.cellAspectMax) {
      const near = (L, q, n) => searchLattice(L, Math.max(pmin, q * P.nearMin), Math.min(pmax, q * P.nearMax, (n - 1) / 9 * 1.05));
      const fy2 = near(pr.y.L, fx.p, W.gh), fx2 = near(pr.x.L, fy.p, W.gw);
      const a = fy2 ? fx.score + fy2.score : -1, b = fx2 ? fx2.score + fy.score : -1;
      if (a >= b && a > 0) fy = fy2; else if (b > 0) fx = fx2;
    }
    pr = profiles(W, fx.a, fx.a + 9 * fx.p, fy.a, fy.a + 9 * fy.p, q);
    if (!pr) return null;
    const again = (L, f, n) => searchLattice(L, Math.max(pmin, f.p * 0.9), Math.min(pmax, f.p * 1.1, (n - 1) / 9 * 1.05)) || f;
    fx = again(pr.x.L, fx, W.gw); fy = again(pr.y.L, fy, W.gh);
    const square = (L, q, n) => searchLattice(L, Math.max(pmin, q * (1 - P.squareTol)), Math.min(pmax, q * (1 + P.squareTol), (n - 1) / 9 * 1.05));
    const alt = [];
    if (Math.abs(fx.p / fy.p - 1) > P.squareTol) {
      const fy2 = square(pr.y.L, fx.p, W.gh), fx2 = square(pr.x.L, fy.p, W.gw);
      if (fy2) alt.push({ fx, fy: fy2 });
      if (fx2) alt.push({ fx: fx2, fy });
    }
    const third = (L, f, n) => searchLattice(L, Math.max(pmin, f.p * (2 / 3) * (1 - P.squareTol)), Math.min(pmax, f.p * (2 / 3) * (1 + P.squareTol), (n - 1) / 9 * 1.05));
    const shape = (u, v) => u.p / v.p >= P.cellAspectMin && u.p / v.p <= P.cellAspectMax;
    const fy3 = third(pr.y.L, fy, W.gh), fx3 = third(pr.x.L, fx, W.gw);
    if (fy3 && fy3.score >= P.harmonicScore * fy.score && shape(fx, fy3)) alt.push({ fx, fy: fy3 });
    if (fx3 && fx3.score >= P.harmonicScore * fx.score && shape(fx3, fy)) alt.push({ fx: fx3, fy });
    return { fx, fy, alt };
  }

  function lineExtent(W, alongX, perp, A) {
    const n = alongX ? W.gw : W.gh, m = alongX ? W.gh : W.gw, g = W.g, gw = W.gw;
    const at = (i, j) => (alongX ? g[j * gw + i] : g[i * gw + j]);
    const rows = [], dist = [];
    for (let k = 1; k <= 8; k++) {
      const b = perp.band[k], half = b ? (b.hi - b.lo + 1) / 2 : 0.5;
      rows.push(Math.round(perp.pos[k]));
      dist.push(Math.min(Math.max(2, Math.ceil(half) + 1), Math.round(0.3 * perp.f.p)));
    }
    const e = new Float32Array(n), e3 = new Float32Array(n), vals = new Float32Array(8);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 8; k++) {
        let v = 0;
        for (let j = rows[k] - 1; j <= rows[k] + 1; j++) {
          const d = dist[k];
          if (j - d < 0 || j + d >= m) continue;
          const u = at(i, j);
          v = Math.max(v, Math.abs(u - (at(i, j - d) + at(i, j + d)) / 2), Math.min(Math.abs(u - at(i, j - d)), Math.abs(u - at(i, j + d))));
        }
        vals[k] = v;
      }
      e3[i] = select(vals, 8, 5);
      e[i] = select(vals, 8, 3);
    }
    const p = A.f.p, i2 = Math.max(0, Math.round(A.pos[2])), i7 = Math.min(n - 1, Math.round(A.pos[7]));
    const ref = median(Array.from(e.subarray(i2, i7 + 1)));
    const gap = Math.max(2, Math.round(0.15 * p));
    const cross = new Uint8Array(n);
    for (let k = 1; k <= 8; k++) {
      const b = A.band[k], r = 0.15 * p;
      for (let i = Math.max(0, Math.floor(Math.min(b.lo, A.pos[k] - r))); i <= Math.min(n - 1, Math.ceil(Math.max(b.hi, A.pos[k] + r))); i++) cross[i] = 1;
    }
    const walk = (from, step, v, lim) => {
      let last = from, miss = 0;
      for (let i = from; i >= 0 && i < n; i += step) {
        if (v[i] >= lim) { last = i; miss = 0; } else if (!cross[i] && ++miss > gap) break;
      }
      return last;
    };
    const onGrid = (i) => {
      if (cross[i]) return true;
      const u = i < A.pos[0] ? (A.pos[0] - i) / p : i > A.pos[9] ? (i - A.pos[9]) / p : -1;
      return u >= 0 && Math.abs(u - Math.round(u)) <= 0.15;
    };
    const walkOn = (from, step, lim, grid = onGrid) => {
      let last = from, miss = 0;
      for (let i = from; i >= 0 && i < n; i += step) {
        if (e[i] >= lim) { last = i; miss = 0; } else if (!grid(i) && (i < A.pos[0] || i > A.pos[9] ? true : ++miss > gap)) break;
      }
      return last;
    };
    const c = Math.round((A.pos[4] + A.pos[5]) / 2), a = P.extentLevel * Math.min(ref, perp.inner), b = P.extentOn * ref;
    const half = [];
    for (let k = 1; k <= 8; k++) {
      const c0 = Math.round(A.pos[k]);
      let l = c0, r = c0;
      if (c0 < 0 || c0 >= n || e[c0] >= a) { half.push(0); continue; }
      while (l - 1 >= 0 && c0 - (l - 1) <= P.crossMax * p && e[l - 1] < a) l--;
      while (r + 1 < n && r + 1 - c0 <= P.crossMax * p && e[r + 1] < a) r++;
      half.push(Math.max(c0 - l, r - c0) + 1);
    }
    const tol = Math.max(0.15, Math.min(P.crossMax, median(half) / p));
    const onFurther = (i) => {
      if (cross[i]) return true;
      const u = i < A.pos[0] ? (A.pos[1] - i) / p - 1 : i > A.pos[9] ? (i - A.pos[8]) / p - 1 : -9;
      return u >= -tol && Math.abs(u - Math.round(u)) <= tol;
    };
    return { lo: walk(c, -1, e3, a), hi: walk(c, 1, e3, a), loOn: walkOn(c, -1, b), hiOn: walkOn(c, 1, b),
      loF: walkOn(c, -1, a, onFurther), hiF: walkOn(c, 1, a, onFurther), tol, e, e3, a, b, cross };
  }

  function settleAxis(W, alongX, A, perp, pf) {
    let ext = lineExtent(W, alongX, perp, A);
    const p = A.f.p, n = ext.e.length;
    const frac = (v, lim, x0, x1) => {
      let k = 0, c = 0;
      for (let i = Math.max(0, Math.ceil(x0)); i <= Math.min(n - 1, Math.floor(x1)); i++) {
        if (ext.cross[i]) continue;
        c++;
        if (v[i] >= lim) k++;
      }
      return c ? k / c : 0;
    };
    const fit = (x0) => frac(ext.e3, ext.a, x0, x0 + 9 * p) -
      0.5 * (frac(ext.e, ext.b, x0 - p, x0) + frac(ext.e, ext.b, x0 + 9 * p, x0 + 10 * p));
    let shift = 0, best = fit(A.pos[0]);
    for (const s of [-2, -1, 1, 2]) {
      const x0 = A.pos[0] + s * p;
      if (x0 < -0.3 * p || x0 + 9 * p > n - 1 + 0.3 * p) continue;
      const v = fit(x0);
      if (v > best + 0.1) { best = v; shift = s; }
    }
    if (shift) {
      A = axisLines(pf, { a: A.f.a + shift * p, p, score: A.f.score }, false);
      ext = lineExtent(W, alongX, perp, A);
    }
    const sl = (A.pos[0] - ext.lo) / p, sr = (ext.hi - A.pos[9]) / p;
    const ol = (A.pos[0] - ext.loOn) / p, or = (ext.hiOn - A.pos[9]) / p;
    const reach = (u, w) => { const k = Math.round(w); return k >= 1 && Math.abs(w - k) <= ext.tol ? Math.max(u, k) : u; };
    const faint = [reach((A.pos[0] - ext.loF) / p, (A.pos[1] - ext.loF) / p - 1), reach((ext.hiF - A.pos[9]) / p, (ext.hiF - A.pos[8]) / p - 1)];
    return { A, short: Math.min(sl, sr), over: Math.max(ol, or), faint };
  }

  function linesBeyond(W, alongX, A, perp, side) {
    const p = A.f.p, n = alongX ? W.gw : W.gh, m = alongX ? W.gh : W.gw, rr = alongX ? W.rh : W.rv, gw = W.gw;
    const x0 = side ? A.pos[9] + 0.25 * p : A.pos[0] - 0.75 * p;
    const i0 = Math.max(0, Math.ceil(x0)), i1 = Math.min(n - 1, Math.floor(x0 + 0.5 * p)), cnt = i1 - i0 + 1;
    if (cnt < Math.max(2, 0.4 * p)) return false;
    const strip = new Float32Array(cnt);
    const level = (j) => {
      for (let i = i0; i <= i1; i++) strip[i - i0] = (alongX ? rr[j * gw + i] : rr[i * gw + j]) / 255;
      return select(strip, cnt, cnt >> 1);
    };
    const lines = new Float32Array(8), between = [];
    for (let k = 1; k <= 8; k++) {
      const j = Math.round(perp.pos[k]);
      let v = 0;
      for (let jj = j - 1; jj <= j + 1; jj++) if (jj >= 0 && jj < m) v = Math.max(v, level(jj));
      lines[k - 1] = v;
    }
    for (let r = 0; r < 9; r++) {
      const c = perp.pos[r + 1] - perp.pos[r];
      for (let j = Math.ceil(perp.pos[r] + 0.25 * c); j <= Math.floor(perp.pos[r + 1] - 0.25 * c); j++) if (j >= 0 && j < m) between.push(level(j));
    }
    const on = select(lines, 8, 3), bv = Float32Array.from(between);
    const off = bv.length ? select(bv, bv.length, Math.min(bv.length - 1, Math.floor(bv.length * 0.75))) : 0;
    return on >= P.beyondRatio * off && on >= P.minContrast;
  }

  function axisLines(pf, f, withBands) {
    const L = pf.L, M = pf.M, n = L.length, p = f.p;
    const pos = [], peak = [], band = [];
    for (let k = 0; k <= 9; k++) {
      const s = snapLine(L, f.a + k * p, P.snapRadius * p);
      pos.push(s.pos); peak.push(s.peak); band.push(s);
    }
    const inner = median(peak.slice(1, 9));
    const at = (x) => M[Math.min(n - 1, Math.max(0, Math.round(x)))];
    const cellLevel = (x0, x1) => {
      const a = Math.max(0, Math.round(Math.min(x0, x1))), b = Math.min(n - 1, Math.round(Math.max(x0, x1)));
      return b > a ? median(Array.from(M.subarray(a, b + 1))) : at(x0);
    };
    for (let k = 1; k <= 8; k++) {
      const c = Math.round(pos[k]), lv = at(c), lim = 0.3 * p;
      const walk = (dir, cell) => {
        const thr = (lv + cell) / 2;
        let i = c;
        if (Math.abs(lv - cell) < P.minContrast) return i;
        while (Math.abs(i + dir - c) <= lim && i + dir >= 0 && i + dir < n && (M[i + dir] - thr) * (lv - thr) > 0) i += dir;
        return i;
      };
      band[k] = { pos: pos[k], peak: peak[k], lo: Math.min(band[k].lo, walk(-1, cellLevel(pos[k] - p, pos[k]))), hi: Math.max(band[k].hi, walk(1, cellLevel(pos[k], pos[k] + p))) };
    }
    for (const ks of [[3, 6], [1, 2, 4, 5, 7, 8]]) {
      const wk = median(ks.map((k) => band[k].hi - band[k].lo + 1));
      for (const k of ks) {
        if (band[k].hi - band[k].lo + 1 <= P.bandOutlier * wk + 2) continue;
        const c = Math.round(pos[k]), h = (wk - 1) / 2;
        band[k] = Object.assign({}, band[k], { lo: Math.round(c - h), hi: Math.round(c + h) });
      }
    }
    const ws = [];
    for (let k = 1; k < 8; k++) ws.push(band[k + 1].lo - band[k].hi - 1);
    const wIn = Math.max(1, median(ws));
    const o = [outerSide(pf, pos, band, wIn, 0, p), outerSide(pf, pos, band, wIn, 1, p)];
    const A = { pos, peak, band, inner, lo: 0, hi: 0, f, outer: o };
    if (!withBands) for (const side of [0, 1]) setOuter(A, side, null);
    return A;
  }

  function setOuter(A, side, bd, w) {
    const o = A.outer[side], k = side ? 9 : 0, dir = side ? 1 : -1;
    if (bd) { A.pos[k] = bd.pos; A.band[k] = bd; A.peak[k] = bd.peak; }
    else if (w) { A.pos[k] = o.plain + dir * w / 2; A.band[k] = { lo: Math.min(o.plain, o.plain + dir * w), hi: Math.max(o.plain, o.plain + dir * w), peak: 0 }; A.peak[k] = 0; }
    else { A.pos[k] = o.plain; A.band[k] = null; A.peak[k] = 0; }
    const edge = bd ? bd.outer : o.plain + dir * (w || 0);
    if (side) A.hi = edge; else A.lo = edge;
  }

  function outerSide(pf, pos, band, wIn, side, p) {
    const M = pf.M, n = M.length, dir = side ? 1 : -1;
    const clampI = (i) => Math.min(n - 1, Math.max(0, Math.round(i)));
    const boundary = side ? band[8].hi + wIn + 0.5 : band[1].lo - wIn - 0.5;
    const c0 = side ? band[8].hi + 1 : Math.round(boundary + 0.5), cv = [];
    for (let i = Math.round(c0 + 0.2 * wIn); i <= Math.round(c0 + 0.8 * wIn); i++) cv.push(M[clampI(i)]);
    const C = median(cv), sgn = pf.dark ? -1 : 1;
    const res = { plain: edgeNear(M, boundary, Math.max(2.5, 0.06 * p)), band: null, bad: null };
    if (boundary - dir * 0.5 < 0 || boundary - dir * 0.5 > n - 1) { res.bad = "outside"; return res; }
    const lines = [];
    for (let k = 1; k <= 8; k++) lines.push(M[clampI(pos[k])]);
    const ref = median(lines.map((v) => sgn * (v - C)));
    if (!(ref > 0)) { res.bad = "none"; return res; }
    const reach = Math.max(3, P.outerReach * p), jb = Math.round(boundary + dir * 0.5);
    const lineLike = (j) => j >= 0 && j < n && sgn * (M[j] - C) >= 0.5 * ref;
    let js = -1;
    for (let d = 0; d <= reach && js < 0; d++) {
      if (lineLike(jb + dir * d)) js = jb + dir * d; else if (d && lineLike(jb - dir * d)) js = jb - dir * d;
    }
    if (js < 0) { res.bad = "none"; return res; }
    while (lineLike(js - dir) && Math.abs(js - dir - jb) <= reach) js -= dir;
    const cdist = (v) => Math.min(...lines.map((u) => Math.abs(u - v)));
    const away = Math.sign(M[js] - C), rampMax = Math.max(P.outerRampMin, Math.round(P.outerRamp * p));
    const inImg = (j) => j >= 0 && j < n;
    const steep = (j, k) => inImg(j) && inImg(k) && away * (M[k] - M[j]) > Math.max(P.bandTau, P.bandTauRel * Math.abs(M[k] - C));
    let rs = js, jr = js;
    while (Math.abs(js - rs) < rampMax && steep(rs - dir, rs) && Math.abs(M[rs - dir] - C) > P.bandTau) rs -= dir;
    for (let r = 0; r < rampMax && steep(jr, jr + dir); r++) jr += dir;
    if (jr !== js && inImg(jr + dir) && away * (M[jr + dir] - M[jr]) > 0) jr += dir;
    let j0 = js;
    const j1 = js + dir, j2 = js + 2 * dir;
    if (jr !== js && Math.abs(M[rs] - C) <= P.rampStart * Math.abs(M[jr] - C)) j0 = jr;
    else if (j2 >= 0 && j2 < n && (M[js] - C) * (M[j1] - M[js]) > 0 && Math.abs(M[j2] - M[j1]) < Math.abs(M[j1] - M[js])) j0 = j1;
    const B = M[j0];
    const tau = Math.max(P.bandTau, P.bandTauRel * Math.abs(B - C)), cap = P.outerMax * p;
    const bridge = Math.max(1, Math.round(0.04 * p));
    let i = j0, miss = 0, ended = false;
    for (let j = j0 + dir; j >= 0 && j < n; j += dir) {
      if (Math.abs(M[j] - B) > tau) { if (++miss > bridge) { ended = true; break; } continue; }
      if (Math.abs(j - js) >= cap) { res.bad = "wide"; return res; }
      i = j; miss = 0;
    }
    let inner = js - dir * 0.5;
    const mid = (C + B) / 2, q = js - dir;
    const crosses = (a) => a >= 0 && a < n && a + dir >= 0 && a + dir < n && M[a] !== M[a + dir] && (M[a] - mid) * (M[a + dir] - mid) <= 0;
    const crossAt = (a) => a + dir * (mid - M[a]) / (M[a + dir] - M[a]);
    if (crosses(q)) inner = crossAt(q);
    else if (crosses(q - dir)) inner = crossAt(q - dir);
    else for (let a = js; a !== j0; a += dir) if (crosses(a)) { inner = crossAt(a); break; }
    let outer = i + dir * 0.5;
    if (i + dir >= 0 && i + dir < n) {
      const u = M[i], v = M[i + dir], G = M[clampI(i + 2 * dir)], m2 = (B + G) / 2;
      if (v !== u) outer = i + dir * Math.min(1, Math.max(0, (m2 - u) / (v - u)));
    }
    const w = Math.abs(outer - inner);
    const tol = Math.max(P.colourTol, P.colourTolRel * Math.abs(B - C));
    let colour = cdist(B) <= tol;
    if (pf.rgb) {
      const bc = pf.rgb(j0), dist = (u) => Math.sqrt(((u[0] - bc[0]) ** 2 + (u[1] - bc[1]) ** 2 + (u[2] - bc[2]) ** 2) / 3);
      colour = false;
      for (let k = 1; k <= 8 && !colour; k++) colour = dist(pf.rgb(pos[k])) <= tol;
    }
    res.band = { pos: (inner + outer) / 2, inner, outer, w, lo: Math.min(i, js), hi: Math.max(i, js), peak: sgn * (B - C),
      cut: !ended && miss === 0, colour };
    return res;
  }

  function chooseOuter(X, Y) {
    const sides = [[X, 0], [X, 1], [Y, 0], [Y, 1]].map(([A, side]) => {
      const o = A.outer[side], p = A.f.p, b = o.band;
      let wLine = 0;
      for (let k = 1; k <= 8; k++) wLine = Math.max(wLine, A.band[k].hi - A.band[k].lo + 1);
      let kind = o.bad === "outside" ? "unknown" : o.bad === "wide" ? "wide" : "none";
      if (b) {
        if (b.cut) kind = b.w <= P.outerCut * p ? "cut" : "cut-wide";
        else if (b.colour || b.w <= Math.min(P.outerOdd * p, P.oddWidth * wLine + 1)) kind = "band";
      }
      return { A, side, o, kind, w: b ? b.w : 0 };
    });
    const bands = sides.filter((x) => x.kind === "band");
    let ok = [];
    if (bands.length) {
      const wmin = Math.min(...bands.map((x) => x.w));
      ok = bands.filter((x) => x.w <= P.outerRatio * wmin + 2);
    }
    for (const x of sides) if (x.kind === "cut-wide") x.kind = ok.some((y) => y.w >= x.w) ? "cut" : "none";
    const cuts = sides.filter((x) => x.kind === "cut");
    const open = sides.filter((x) => x.kind === "unknown").length, against = 4 - ok.length - cuts.length - open;
    if (ok.length >= 3 || (ok.length >= 2 && against === 0)) ok = ok.concat(cuts);
    else if (cuts.length && against === 0) ok = ok.concat(cuts);
    else ok = [];
    const full = ok.filter((x) => x.kind === "band"), wm = full.length ? median(full.map((x) => x.w)) : 0;
    for (const x of sides) {
      if (ok.includes(x)) setOuter(x.A, x.side, x.o.band);
      else if (ok.length && (x.kind === "wide" || x.kind === "band")) setOuter(x.A, x.side, null, wm);
      else setOuter(x.A, x.side, null);
    }
  }

  function edgeNear(M, x, r) {
    const n = M.length, at = (i) => M[Math.min(n - 1, Math.max(0, i))];
    let bi = -1, bs = 0, bv = 0;
    for (let i = Math.max(1, Math.floor(x - r)); i <= Math.min(n - 1, Math.ceil(x + r)); i++) {
      const v = Math.abs(at(i) + at(i + 1) - at(i - 1) - at(i - 2)) / 2, q = (i - 0.5 - x) / (r + 1), sc = v * (1 - 0.5 * q * q);
      if (sc > bs) { bs = sc; bv = v; bi = i; }
    }
    if (bi < 0 || bv < P.minContrast) return x;
    const a = M[Math.max(0, bi - 2)], b = M[Math.min(n - 1, bi + 1)], mid = (a + b) / 2;
    for (let i = Math.max(1, bi - 1); i <= Math.min(n - 1, bi + 1); i++) {
      const u = M[i - 1], v = M[i];
      if ((u - mid) * (v - mid) <= 0 && u !== v) return i - 1 + (mid - u) / (v - u);
    }
    return bi - 0.5;
  }

  function finerLines(W, A, B, alongX) {
    const lo = Math.max(0, Math.floor(B.pos[0])), hi = Math.min(alongX ? W.gh : W.gw, Math.ceil(B.pos[9]) + 1);
    if (hi - lo < 9) return 0;
    const L = quantileProfile(alongX ? W.rv : W.rh, W.gw, W.gh, alongX, lo, hi, P.finerQuantile);
    const ref = A.inner;
    let worst = 0;
    for (let k = 0; k < 9; k++) {
      const c = A.pos[k + 1] - A.pos[k];
      for (let i = Math.ceil(A.pos[k] + 0.2 * c); i <= Math.floor(A.pos[k + 1] - 0.2 * c); i++) if (i >= 0 && i < L.length) worst = Math.max(worst, L[i]);
    }
    return ref > 0 ? worst / ref : worst > 0 ? Infinity : 0;
  }

  function finerSteps(W, A, B, alongX) {
    const lo = Math.max(0, Math.floor(B.pos[0])), hi = Math.min(alongX ? W.gh : W.gw, Math.ceil(B.pos[9]) + 1);
    if (hi - lo < 9) return 0;
    const g = W.g, gw = W.gw, d = Math.max(1, Math.round(W.R / 2)), n = alongX ? W.gw : W.gh, m = hi - lo;
    const k0 = Math.min(m - 1, Math.floor(m * P.finerQuantile)), hist = new Int32Array(256);
    let worst = 0;
    for (let k = 1; k < 8; k++) {
      const c = A.pos[k + 1] - A.pos[k];
      for (let i = Math.max(d, Math.ceil(A.pos[k] + 0.3 * c)); i <= Math.min(n - 1 - d, Math.floor(A.pos[k + 1] - 0.3 * c)); i++) {
        hist.fill(0);
        for (let j = lo; j < hi; j++) {
          const v = alongX ? Math.abs(g[j * gw + i + d] - g[j * gw + i - d]) : Math.abs(g[(i + d) * gw + j] - g[(i - d) * gw + j]);
          hist[Math.min(255, Math.round(v * 255))]++;
        }
        let cnt = 0, bin = 0;
        for (; bin < 255; bin++) { cnt += hist[bin]; if (cnt > k0) break; }
        worst = Math.max(worst, bin / 255);
      }
    }
    if (worst < P.finerStepMin) return 0;
    return A.inner > 0 ? worst / A.inner : Infinity;
  }

  function innerPitch(A) {
    return median(A.pos.slice(2, 9).map((v, i) => v - A.pos[i + 1]));
  }

  function outerSpacing(A, side) {
    return (side ? A.pos[9] - A.pos[8] : A.pos[1] - A.pos[0]) / innerPitch(A);
  }

  function outerSpacingOk(A, side) {
    const q = innerPitch(A), v = outerSpacing(A, side), slack = Math.max(2.5, 0.06 * q) / q;
    return v >= P.outerSpMin - slack && v <= P.outerSpMax + slack;
  }

  function refitOuter(A, side, pf) {
    const q = innerPitch(A), k = side ? 8 : 1, dir = side ? 1 : -1, b = A.band[k];
    const h = Math.min(A.pos[k] - b.lo, b.hi - A.pos[k]) + 0.5;
    A.outer[side].plain = edgeNear(pf.M, A.pos[k] + dir * (q - h), P.snapRadius * q);
    setOuter(A, side, null);
    if (outerSpacingOk(A, side)) return;
    const e = A.pos[k] + dir * q;
    A.pos[side ? 9 : 0] = e; A.band[side ? 9 : 0] = null;
    if (side) A.hi = e; else A.lo = e;
  }

  function cvOf(v) {
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length);
    return m > 0 ? sd / m : 1;
  }

  function interior(A, c) {
    const a = c === 0 ? (A.band[0] ? A.band[0].hi + 1 : A.lo + 0.5) : A.band[c].hi + 1;
    const b = c === 8 ? (A.band[9] ? A.band[9].lo - 1 : A.hi - 0.5) : A.band[c + 1].lo - 1;
    return [a, b];
  }

  function inkCells(g, gw, X, Y) {
    let count = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const [ax, bx] = interior(X, c), [ay, by] = interior(Y, r), mx = 0.15 * (bx - ax), my = 0.15 * (by - ay);
      const x0 = Math.round(ax + mx), x1 = Math.round(bx - mx) + 1, y0 = Math.round(ay + my), y1 = Math.round(by - my) + 1;
      if (x1 <= x0 || y1 <= y0) continue;
      const vals = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) vals.push(g[y * gw + x]);
      const bg = median(vals);
      let n = 0;
      for (const v of vals) if (Math.abs(v - bg) > P.inkStep) n++;
      if (n >= Math.max(3, P.inkShare * vals.length)) count++;
    }
    return count;
  }

  function verify(img, rect, why) {
    const W = img.width, H = img.height;
    const side = Math.max(rect.width, rect.height), half = side * (0.5 + P.verifyMargin);
    const mx = rect.x + rect.width / 2, my = rect.y + rect.height / 2;
    const cx0 = Math.max(0, Math.floor(mx - half)), cy0 = Math.max(0, Math.floor(my - half));
    const cx1 = Math.min(W, Math.ceil(mx + half)), cy1 = Math.min(H, Math.ceil(my + half));
    const cw = cx1 - cx0, ch = cy1 - cy0;
    if (cw < P.minProbe || ch < P.minProbe) { why.r = "small"; return null; }
    const k = Math.min(1, P.workSide / Math.max(cw, ch));
    const gw = Math.max(1, Math.round(cw * k)), gh = Math.max(1, Math.round(ch * k));
    const g = resampleLuma(img, cx0, cy0, cx1, cy1, gw, gh);
    const pe = side * k / 9;
    const work = { g, gw, gh, pe, dark: true, R: Math.max(2, Math.round(0.25 * pe)) };
    prepare(work);
    const d = {}, best = checkBoard(work, d);
    if (!best) { why.r = d.reason; why.d = d; return null; }
    why.d = best.diag;
    const X = best.X, Y = best.Y, sxk = cw / gw, syk = ch / gh;
    const xs = X.pos.map((u) => cx0 + (u + 0.5) * sxk), ys = Y.pos.map((u) => cy0 + (u + 0.5) * syk);
    const bx0 = cx0 + (X.lo + 0.5) * sxk, bx1 = cx0 + (X.hi + 0.5) * sxk;
    const by0 = cy0 + (Y.lo + 0.5) * syk, by1 = cy0 + (Y.hi + 0.5) * syk;
    const room = (lo, hi, c0, c1, n, cell) => Math.min(c0 > 0 ? (lo - c0) / cell : Infinity, c1 < n ? (c1 - hi) / cell : Infinity);
    const context = Math.min(room(bx0, bx1, cx0, cx1, W, (xs[9] - xs[0]) / 9), room(by0, by1, cy0, cy1, H, (ys[9] - ys[0]) / 9));
    return { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0, xs, ys, context, diag: best.diag, dark: work.dark };
  }

  function darkLines(pf, pos, p) {
    const M = pf.M, n = M.length, at = (x) => M[Math.min(n - 1, Math.max(0, Math.round(x)))], v = [];
    for (let k = 1; k <= 8; k++) {
      const cell = (at(pos[k] - 0.5 * p) + at(pos[k] + 0.5 * p)) / 2;
      let d = 0;
      for (const o of [-1, 0, 1]) if (Math.abs(at(pos[k] + o) - cell) > Math.abs(d)) d = at(pos[k] + o) - cell;
      v.push(d);
    }
    return median(v) < 0;
  }

  function checkBoard(W, d) {
    const f = fitLattice(W);
    if (!f) { d.reason = "nofit"; return null; }
    let r = checkLattice(W, f, d);
    const tryAll = (list) => {
      for (const a of list) {
        if (r) break;
        const d2 = {};
        r = checkLattice(W, a, d2);
        if (r) Object.assign(d, d2, { alt: true });
      }
    };
    tryAll(f.alt);
    if (!r && P.strictQuantile) {
      const g = fitLattice(W, P.strictQuantile), same = (u, v) => Math.abs(u.a - v.a) < 0.1 * v.p && Math.abs(u.p - v.p) < 0.02 * v.p;
      if (g && !(same(g.fx, f.fx) && same(g.fy, f.fy))) tryAll([{ fx: g.fx, fy: g.fy }].concat(g.alt));
    }
    return r;
  }

  function checkLattice(W, f, d) {
    let pr = profiles(W, f.fx.a, f.fx.a + 9 * f.fx.p, f.fy.a, f.fy.a + 9 * f.fy.p);
    if (!pr) { d.reason = "nofit"; return null; }
    let X = axisLines(pr.x, f.fx, false), Y = axisLines(pr.y, f.fy, false), sx = null, sy = null;
    for (let it = 0; it < 2; it++) {
      sx = settleAxis(W, true, X, Y, pr.x);
      sy = settleAxis(W, false, Y, sx.A, pr.y);
      const moved = sx.A.f.a !== X.f.a || sy.A.f.a !== Y.f.a;
      X = sx.A; Y = sy.A;
      if (!moved) break;
      pr = profiles(W, X.f.a, X.f.a + 9 * X.f.p, Y.f.a, Y.f.a + 9 * Y.f.p);
      if (!pr) { d.reason = "nofit"; return null; }
      X = axisLines(pr.x, X.f, false); Y = axisLines(pr.y, Y.f, false);
    }
    W.dark = darkLines(pr.x, X.pos, X.f.p);
    d.pol = W.dark ? "dark" : "light";
    d.score = X.inner + Y.inner;
    d.xs = X.pos.map((v) => Math.round(v * 10) / 10); d.ys = Y.pos.map((v) => Math.round(v * 10) / 10);
    d.px = X.f.p; d.py = Y.f.p;
    const bw = X.pos[9] - X.pos[0], bh = Y.pos[9] - Y.pos[0];
    d.aspect = bw / bh;
    if (d.aspect < P.cellAspectMin || d.aspect > P.cellAspectMax) { d.reason = "aspect"; return null; }
    const sp = (A) => cvOf(A.pos.slice(2, 9).map((v, i) => v - A.pos[i + 1]));
    d.cv = Math.max(sp(X), sp(Y));
    if (d.cv > P.spacingCv) { d.reason = "spacing"; return null; }
    d.outerSp = [X, Y].flatMap((A) => [0, 1].map((side) => Math.round(outerSpacing(A, side) * 1000) / 1000));
    if (![X, Y].every((A) => outerSpacingOk(A, 0) && outerSpacingOk(A, 1))) { d.reason = "outer-spacing"; return null; }
    const thin = [1, 2, 4, 5, 7, 8], box = [3, 6], need = P.minContrast;
    const clear = (A) => thin.filter((i) => A.peak[i] >= need).length;
    d.innerX = X.inner; d.innerY = Y.inner;
    d.thinClear = Math.min(clear(X), clear(Y));
    d.boxMin = Math.min(...box.map((i) => X.peak[i]), ...box.map((i) => Y.peak[i]));
    if (d.boxMin < need || d.thinClear <= thin.length * P.thinShare) { d.reason = "prominence"; return null; }
    d.short = Math.min(sx.short, sy.short); d.over = Math.max(sx.over, sy.over);
    if (d.short < -P.extentSlack) { d.reason = "edges"; return null; }
    if (d.over > P.extentOver) { d.reason = "continues"; return null; }
    d.faint = -Infinity;
    if (d.aspect < P.faintMin || d.aspect > P.faintMax) {
      for (const [A, B, s, alongX] of [[X, Y, sx, true], [Y, X, sy, false]]) {
        for (const side of [0, 1]) if (s.faint[side] > P.extentOver && linesBeyond(W, alongX, A, B, side)) d.faint = Math.max(d.faint, s.faint[side]);
      }
    }
    if (d.faint > P.extentOver) { d.reason = "continues"; return null; }
    d.finer = Math.max(finerLines(W, X, Y, true), finerLines(W, Y, X, false));
    if (d.finer >= P.finerRatio) { d.reason = "finer-grid"; return null; }
    d.finerStep = Math.max(finerSteps(W, X, Y, true), finerSteps(W, Y, X, false));
    if (d.finerStep >= P.finerStepRatio) { d.reason = "finer-step"; return null; }
    d.ink = inkCells(W.g, W.gw, X, Y);
    if (d.ink < P.inkCells) { d.reason = "ink"; return null; }
    return { X, Y, diag: d };
  }

  function badImage(img) {
    return !img || !(img.width > 0) || !(img.height > 0) || !img.data || img.data.length < img.width * img.height * 4;
  }

  function locate(img, opts) {
    P = opts && opts.params ? Object.assign({}, DEFAULTS, opts.params) : DEFAULTS;
    try { return locateWith(img, opts); } finally { P = DEFAULTS; }
  }

  function locateWith(img, opts) {
    const debug = opts && opts.debug ? { cands: [], verified: [] } : null;
    if (badImage(img)) return { ok: false, reason: "no-board" };
    const W = img.width, H = img.height;
    const s = Math.min(1, P.maxSide / Math.max(W, H));
    const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    const g = resampleLuma(img, 0, 0, W, H, w, h);
    const sx = w / W, sy = h / H;
    const minSide = Math.max(9, Math.floor(P.minProbe * Math.min(sx, sy) * 0.9));
    const win = Math.max(15, Math.round(Math.min(w, h) / P.adaptWinDiv)) | 1;
    const masks = adaptiveMasks(g, w, h, win, P.adaptOffset);
    let cands = [];
    for (const mask of [masks.dark, masks.light]) {
      gridComponentCands(mask, w, h, minSide, cands);
      tileCands(mask, w, h, Math.max(3, Math.floor(minSide / 9 * 0.7)), Math.ceil(Math.min(w, h) / 9 * 1.1), cands);
      lineCands(mask, mask, w, h, minSide, cands);
    }
    const wide = adaptiveMasks(g, w, h, Math.max(15, Math.round(Math.min(w, h) / P.adaptWinWide)) | 1, P.adaptOffset);
    const big = Math.max(minSide, Math.round(P.wideMin * Math.min(w, h)));
    for (const mask of [wide.dark, wide.light]) {
      gridComponentCands(mask, w, h, big, cands);
      tileCands(mask, w, h, Math.max(3, Math.floor(big / 9 * 0.7)), Math.ceil(Math.min(w, h) / 9 * 1.1), cands);
    }
    const rm = ridgeMasks(g, w, h, P.faintRidge, P.faintStep);
    lineCands(rm.hm, rm.vm, w, h, minSide, cands);
    tileCands(edgeMask(g, w, h, P.edgeStep), w, h, Math.max(3, Math.floor(minSide / 9 * 0.7)), Math.ceil(Math.min(w, h) / 9 * 1.1), cands);
    cands = mergeCandidates(cands.filter((c) => c.width <= P.candAspect * c.height && c.height <= P.candAspect * c.width));
    const found = [];
    for (const c of cands) {
      const rect = { x: c.x / sx, y: c.y / sy, width: c.width / sx, height: c.height / sy };
      const side = Math.max(rect.width, rect.height);
      if (found.some((f) => inside(rect, f) >= P.skipInside || inside(f, rect) >= P.skipAround || side < P.skipSmaller * Math.max(f.width, f.height))) {
        if (debug) debug.cands.push({ method: c.method, rect, ok: false, why: "skipped", diag: null });
        continue;
      }
      let b = null;
      for (const m of [c].concat(c.members)) {
        const r = { x: m.x / sx, y: m.y / sy, width: m.width / sx, height: m.height / sy }, why = {};
        b = confirm(img, verify(img, r, why));
        if (debug) debug.cands.push({ method: m.method + (m === c ? "" : "*"), rect: r, ok: !!b, why: b ? null : why.r || "unconfirmed", diag: why.d || null });
        if (b) break;
      }
      if (b && !found.some((f) => iou(f, b) >= P.mergeIou)) found.push(b);
    }
    if (debug) debug.verified = found;
    const res = pick(found, img);
    if (debug) res.debug = debug;
    return res;
  }

  function confirm(img, f) {
    if (!f) return null;
    const again = verify(img, f, {});
    return again && iou(again, f) >= P.mergeIou ? again : f.context >= 1 ? f : null;
  }

  function medianRgb(img, alongX, c, lo, hi) {
    const W = img.width, H = img.height, d = img.data, i = Math.round(c - 0.5);
    const lim = alongX ? H : W, a = Math.max(0, Math.ceil(lo)), b = Math.min(lim - 1, Math.floor(hi));
    if (i < 0 || i >= (alongX ? W : H) || b < a) return [1, 1, 1];
    const step = Math.max(1, Math.floor((b - a + 1) / 64)), ch = [[], [], []];
    for (let j = a; j <= b; j += step) {
      const p = alongX ? (j * W + i) * 4 : (i * W + j) * 4, al = d[p + 3] / 255;
      for (let k = 0; k < 3; k++) ch[k].push(1 - (1 - d[p + k] / 255) * al);
    }
    return ch.map(median);
  }

  function measure(img, b) {
    const W = img.width, H = img.height;
    const px = (b.xs[8] - b.xs[1]) / 7, py = (b.ys[8] - b.ys[1]) / 7;
    const cx0 = Math.max(0, Math.floor(b.xs[1] - 2 * px)), cx1 = Math.min(W, Math.ceil(b.xs[8] + 2 * px));
    const cy0 = Math.max(0, Math.floor(b.ys[1] - 2 * py)), cy1 = Math.min(H, Math.ceil(b.ys[8] + 2 * py));
    const cw = cx1 - cx0, ch = cy1 - cy0, k = Math.min(1, P.measureSide / Math.max(cw, ch));
    const gw = Math.max(1, Math.round(cw * k)), gh = Math.max(1, Math.round(ch * k)), sxk = cw / gw, syk = ch / gh;
    const work = { g: resampleLuma(img, cx0, cy0, cx1, cy1, gw, gh), gw, gh, pe: Math.max(px / sxk, py / syk), dark: b.dark };
    work.R = Math.max(2, Math.round(0.25 * work.pe));
    prepare(work);
    const lat = (u1, u8) => ({ a: u1 - (u8 - u1) / 7, p: (u8 - u1) / 7, score: 0 });
    const fx = lat((b.xs[1] - cx0) / sxk - 0.5, (b.xs[8] - cx0) / sxk - 0.5), fy = lat((b.ys[1] - cy0) / syk - 0.5, (b.ys[8] - cy0) / syk - 0.5);
    const pr = profiles(work, fx.a, fx.a + 9 * fx.p, fy.a, fy.a + 9 * fy.p);
    if (!pr) return b;
    pr.x.dark = pr.y.dark = b.dark;
    pr.x.rgb = (u) => medianRgb(img, true, cx0 + (u + 0.5) * sxk, b.ys[1], b.ys[8]);
    pr.y.rgb = (u) => medianRgb(img, false, cy0 + (u + 0.5) * syk, b.xs[1], b.xs[8]);
    const X = axisLines(pr.x, fx, true), Y = axisLines(pr.y, fy, true);
    chooseOuter(X, Y);
    for (const [A, pf] of [[X, pr.x], [Y, pr.y]]) for (const side of [0, 1]) if (!outerSpacingOk(A, side)) refitOuter(A, side, pf);
    const xs = X.pos.map((u) => cx0 + (u + 0.5) * sxk), ys = Y.pos.map((u) => cy0 + (u + 0.5) * syk);
    const bx0 = cx0 + (X.lo + 0.5) * sxk, bx1 = cx0 + (X.hi + 0.5) * sxk, by0 = cy0 + (Y.lo + 0.5) * syk, by1 = cy0 + (Y.hi + 0.5) * syk;
    return Object.assign({}, b, { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0, xs, ys });
  }

  function clampToImage(b, W, H) {
    const cx = (v) => Math.min(W, Math.max(0, v)), cy = (v) => Math.min(H, Math.max(0, v));
    const x0 = cx(b.x), y0 = cy(b.y), x1 = cx(b.x + b.width), y1 = cy(b.y + b.height);
    return Object.assign({}, b, { x: x0, y: y0, width: x1 - x0, height: y1 - y0, xs: b.xs.map(cx), ys: b.ys.map(cy) });
  }

  function pick(boards, img) {
    if (!boards.length) return { ok: false, reason: "no-board" };
    boards.sort((a, b) => b.width * b.height - a.width * a.height);
    const m = measure(img, boards[0]);
    if (Math.round(Math.min(m.width, m.height)) < P.minBoard) return { ok: false, reason: "board-too-small" };
    const best = clampToImage(m, img.width, img.height);
    const area = best.width * best.height, warnings = [];
    if (boards.slice(1).some((f) => inside(f, best) <= P.multipleOverlap && Math.abs(f.width * f.height - area) <= P.multipleArea * area)) {
      warnings.push({ code: "multiple-boards", cells: [] });
    }
    return {
      ok: true,
      board: { x: best.x, y: best.y, width: best.width, height: best.height, xs: best.xs.slice(), ys: best.ys.slice() },
      warnings,
    };
  }

  function lineList(v, limit) {
    if (!v || v.length !== 10) return false;
    for (let k = 0; k < 10; k++) if (typeof v[k] !== "number" || !(v[k] >= -1 && v[k] <= limit + 1) || (k && !(v[k] > v[k - 1]))) return false;
    return true;
  }

  function cellRect(board, i) {
    const r = Math.floor(i / 9), c = i % 9;
    const x0 = board.xs[c], x1 = board.xs[c + 1], y0 = board.ys[r], y1 = board.ys[r + 1];
    const ix = (x1 - x0) * P.cellInset, iy = (y1 - y0) * P.cellInset;
    return [x0 + ix, y0 + iy, x1 - ix, y1 - iy];
  }

  function cutCells(img, board, size) {
    if (badImage(img) || !board || !lineList(board.xs, img.width) || !lineList(board.ys, img.height)) return null;
    const n = Math.max(1, Math.round(Number(size) || 28)), cells = [];
    for (let i = 0; i < 81; i++) {
      const [x0, y0, x1, y1] = cellRect(board, i);
      const cell = resampleLuma(img, x0, y0, x1, y1, n, n);
      for (let j = 0; j < cell.length; j++) cell[j] = Math.min(1, Math.max(0, cell[j]));
      cells.push(cell);
    }
    return cells;
  }

  function inputSize(v, fallback) {
    const n = Math.round(v === undefined || v === null ? fallback : Number(v));
    return n >= 4 && n <= 1024 ? n : 0;
  }

  function deviations(v, n, bg, lo, hi, k) {
    const m = (hi - lo) * (hi - lo), dark = new Float32Array(m), light = new Float32Array(m);
    for (let y = lo, j = 0; y < hi; y++) for (let x = lo; x < hi; x++, j++) { const d = bg - v[y * n + x]; dark[j] = d; light[j] = -d; }
    return [select(dark, m, m - k), select(light, m, m - k)];
  }

  function normalizeRect(img, x0, y0, x1, y1, n, like) {
    const v = resampleLuma(img, x0, y0, x1, y1, n, n);
    const lo = Math.max(1, Math.round(P.cellEdge * n)), hi = n - lo, m = (hi - lo) * (hi - lo);
    const bg = like ? like.bg : select(Float32Array.from(v), n * n, (n * n) >> 1);
    const k = Math.max(3, Math.round(n * n / P.inkRank));
    const sideOf = (dk, lk) => (like ? like.inverted : lk > dk);
    let [dk, lk] = deviations(v, n, bg, lo, hi, k), inverted = sideOf(dk, lk);
    if ((inverted ? lk : dk) < P.flatContrast) { [dk, lk] = deviations(v, n, bg, 0, n, k); inverted = sideOf(dk, lk); }
    const contrast = Math.max(0, inverted ? lk : dk);
    const scale = 1 / Math.max(contrast, P.flatContrast), sign = inverted ? -1 : 1;
    for (let i = 0; i < n * n; i++) {
      const t = sign * (bg - v[i]) * scale;
      v[i] = t <= 0 ? 0 : t >= 1 ? 1 : t;
    }
    let ink = 0;
    for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) if (v[y * n + x] >= P.inkLevel) ink++;
    return { data: v, bg, contrast, inverted, ink: ink / m };
  }

  function normalizeCell(img, rect, size, like) {
    const n = inputSize(size, NaN);
    if (!n || badImage(img) || !rect) return null;
    const x0 = Number(rect.x), y0 = Number(rect.y), x1 = x0 + Number(rect.width), y1 = y0 + Number(rect.height);
    if (!(x0 >= -1 && y0 >= -1 && x1 <= img.width + 1 && y1 <= img.height + 1 && x1 > x0 && y1 > y0)) return null;
    if (like != null && !(typeof like === "object" && Number.isFinite(like.bg))) return null;
    return normalizeRect(img, x0, y0, x1, y1, n, like == null ? null : { bg: like.bg, inverted: like.inverted === true });
  }

  function cellInputs(img, board, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const na = inputSize(o.aSize, 32), nb = inputSize(o.bSize, 48);
    if (!na || !nb || badImage(img) || !board || !lineList(board.xs, img.width) || !lineList(board.ys, img.height)) return null;
    const a = new Float32Array(81 * na * na), b = new Float32Array(81 * nb * nb), stats = [];
    const bFirst = nb >= na;
    for (let i = 0; i < 81; i++) {
      const [x0, y0, x1, y1] = cellRect(board, i);
      const first = normalizeRect(img, x0, y0, x1, y1, bFirst ? nb : na, null);
      const second = normalizeRect(img, x0, y0, x1, y1, bFirst ? na : nb, first);
      a.set((bFirst ? second : first).data, i * na * na);
      b.set((bFirst ? first : second).data, i * nb * nb);
      stats.push({ bg: first.bg, contrast: first.contrast, inverted: first.inverted, ink: first.ink });
    }
    return { a, b, stats };
  }

  const A_LABELS = ["candidates", "1", "2", "3", "4", "5", "6", "7", "8", "9", "empty"];
  // sha256 of cellInputs on dataset.cjs's fingerprint board; renew only with retrained models.
  const INPUTS_FINGERPRINT = Object.freeze({ "32x64": "739affe74fb1400295085fd30339a2729b004c0e026b7438880eb04f96563b13" });
  const B_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const decoded = new WeakMap();
  let b64Map = null;

  // Hand-rolled: a bare Node vm context has neither atob nor Buffer.
  function base64Bytes(text) {
    if (typeof text !== "string") return null;
    if (!b64Map) {
      b64Map = new Int16Array(128).fill(-1);
      for (let i = 0; i < 64; i++) b64Map[B64.charCodeAt(i)] = i;
    }
    let n = text.length;
    while (n > 0 && text.charCodeAt(n - 1) === 61) n--;
    const out = new Uint8Array((n * 3) >> 2);
    let acc = 0, bits = 0, at = 0;
    for (let i = 0; i < n; i++) {
      const ch = text.charCodeAt(i), v = ch < 128 ? b64Map[ch] : -1;
      if (v < 0) return null;
      acc = ((acc << 6) | v) & 0xffffff;
      bits += 6;
      if (bits >= 8) { bits -= 8; out[at++] = (acc >> bits) & 255; }
    }
    return out;
  }

  function int8s(text) {
    const bytes = base64Bytes(text);
    return bytes && new Int8Array(bytes.buffer, 0, bytes.length);
  }

  function float32s(text) {
    const bytes = base64Bytes(text);
    if (!bytes || bytes.length % 4) return null;
    const view = new DataView(bytes.buffer), out = new Float32Array(bytes.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(4 * i, true);
    return out;
  }

  function decodeNet(m, head, labels, fv) {
    if (!m || typeof m !== "object" || m.head !== head || !Array.isArray(m.labels) || m.labels.join() !== labels.join()) return null;
    const inp = m.input, size = Array.isArray(inp) && inp.length === 3 && inp[0] === 1 && inp[1] === inp[2] ? inputSize(inp[1], NaN) : 0;
    if (!size || size !== inp[1] || !Array.isArray(m.layers) || !m.layers.length) return null;
    let C = 1, H = size, W = size;
    const layers = [];
    for (const L of m.layers) {
      if (!L || typeof L !== "object") return null;
      if (L.type === "pool") {
        if (L.size !== 2 || H < 2 || W < 2) return null;
        layers.push({ type: "pool", C, H, W });
        H >>= 1; W >>= 1;
        continue;
      }
      if (L.type === "gmax") {
        if (fv < 2) return null;
        layers.push({ type: "gmax", C, H, W });
        H = W = 1;
        continue;
      }
      const conv = L.type === "conv", O = L.out;
      if (!conv && L.type !== "dense") return null;
      const n = conv ? C * 9 : C * H * W;
      if (!(Number.isInteger(O) && O > 0) || (conv ? L.in !== C || L.kernel !== 3 || L.relu !== true : L.in !== n)) return null;
      const q8 = int8s(L.w), s = float32s(L.scale), b = float32s(L.b);
      if (!q8 || !s || !b || q8.length !== O * n || s.length !== O || b.length !== O) return null;
      // Dequantize per weight to float32 as export.cjs readModel does; scaling the sum breaks bit parity.
      const w = new Float32Array(O * n);
      for (let o = 0, k = 0; o < O; o++) for (let j = 0; j < n; j++, k++) w[k] = q8[k] * s[o];
      layers.push(conv ? { type: "conv", C, H, W, O, w, b } : { type: "dense", n, O, w, b, relu: L.relu === true });
      C = O;
      if (!conv) H = W = 1;
    }
    if (H !== 1 || W !== 1 || C !== labels.length || layers[layers.length - 1].type !== "dense") return null;
    return { size, layers };
  }

  function modelOf(model) {
    if (!model || typeof model !== "object") return null;
    if (decoded.has(model)) return decoded.get(model);
    let out = null;
    const fv = model.formatVersion;
    if (model.format === "sudoku-ocr-model" && (fv === 1 || fv === 2) && model.quantization === "int8-symmetric-per-output-channel") {
      const A = decodeNet(model.A, "softmax", A_LABELS, fv), B = A && decodeNet(model.B, "sigmoid", B_LABELS, fv);
      const inputs = model.meta && model.meta.inputs;
      const known = A && B ? INPUTS_FINGERPRINT[`${A.size}x${B.size}`] : undefined;
      const agree = (r) => !r || (r.aSize === A.size && r.bSize === B.size && (!known || !r.engineFingerprint || r.engineFingerprint === known));
      if (A && B && (!inputs || (agree(inputs.A) && agree(inputs.B)))) out = { A, B };
    }
    decoded.set(model, out);
    return out;
  }

  function convLayer(L, a) {
    const { C, H, W, O, w, b } = L, Wp = W + 2, plane = (H + 2) * Wp, HW = H * W;
    const P0 = new Float32Array(C * plane);
    for (let c = 0; c < C; c++) for (let y = 0; y < H; y++) P0.set(a.subarray(c * HW + y * W, c * HW + y * W + W), c * plane + (y + 1) * Wp + 1);
    const out = new Float32Array(O * HW), C9 = C * 9;
    // As nn.cjs: nine taps summed in double, rounded to float32 into out after each input channel.
    for (let o0 = 0; o0 < O; o0 += 4) {
      const n = Math.min(4, O - o0);
      for (let j = 0; j < n; j++) out.fill(b[o0 + j], (o0 + j) * HW, (o0 + j + 1) * HW);
      const b0 = o0 * HW, b1 = b0 + HW, b2 = b1 + HW, b3 = b2 + HW;
      for (let c = 0; c < C; c++) {
        const pb = c * plane, k0 = o0 * C9 + c * 9;
        if (n === 4) {
          const k1 = k0 + C9, k2 = k1 + C9, k3 = k2 + C9;
          const u0 = w[k0], u1 = w[k0 + 1], u2 = w[k0 + 2], u3 = w[k0 + 3], u4 = w[k0 + 4], u5 = w[k0 + 5], u6 = w[k0 + 6], u7 = w[k0 + 7], u8 = w[k0 + 8];
          const v0 = w[k1], v1 = w[k1 + 1], v2 = w[k1 + 2], v3 = w[k1 + 3], v4 = w[k1 + 4], v5 = w[k1 + 5], v6 = w[k1 + 6], v7 = w[k1 + 7], v8 = w[k1 + 8];
          const t0 = w[k2], t1 = w[k2 + 1], t2 = w[k2 + 2], t3 = w[k2 + 3], t4 = w[k2 + 4], t5 = w[k2 + 5], t6 = w[k2 + 6], t7 = w[k2 + 7], t8 = w[k2 + 8];
          const z0 = w[k3], z1 = w[k3 + 1], z2 = w[k3 + 2], z3 = w[k3 + 3], z4 = w[k3 + 4], z5 = w[k3 + 5], z6 = w[k3 + 6], z7 = w[k3 + 7], z8 = w[k3 + 8];
          for (let y = 0; y < H; y++) {
            const r0 = pb + y * Wp, r1 = r0 + Wp, r2 = r1 + Wp, row = y * W;
            for (let x = 0; x < W; x++) {
              const p0 = P0[r0 + x], p1 = P0[r0 + x + 1], p2 = P0[r0 + x + 2], p3 = P0[r1 + x], p4 = P0[r1 + x + 1], p5 = P0[r1 + x + 2], p6 = P0[r2 + x], p7 = P0[r2 + x + 1], p8 = P0[r2 + x + 2];
              const i = row + x;
              out[b0 + i] += u0 * p0 + u1 * p1 + u2 * p2 + u3 * p3 + u4 * p4 + u5 * p5 + u6 * p6 + u7 * p7 + u8 * p8;
              out[b1 + i] += v0 * p0 + v1 * p1 + v2 * p2 + v3 * p3 + v4 * p4 + v5 * p5 + v6 * p6 + v7 * p7 + v8 * p8;
              out[b2 + i] += t0 * p0 + t1 * p1 + t2 * p2 + t3 * p3 + t4 * p4 + t5 * p5 + t6 * p6 + t7 * p7 + t8 * p8;
              out[b3 + i] += z0 * p0 + z1 * p1 + z2 * p2 + z3 * p3 + z4 * p4 + z5 * p5 + z6 * p6 + z7 * p7 + z8 * p8;
            }
          }
        } else {
          for (let j = 0; j < n; j++) {
            const k = k0 + j * C9, ob = (o0 + j) * HW;
            const w0 = w[k], w1 = w[k + 1], w2 = w[k + 2], w3 = w[k + 3], w4 = w[k + 4], w5 = w[k + 5], w6 = w[k + 6], w7 = w[k + 7], w8 = w[k + 8];
            for (let y = 0; y < H; y++) {
              const r0 = pb + y * Wp, r1 = r0 + Wp, r2 = r1 + Wp, row = ob + y * W;
              for (let x = 0; x < W; x++) {
                out[row + x] += w0 * P0[r0 + x] + w1 * P0[r0 + x + 1] + w2 * P0[r0 + x + 2] +
                  w3 * P0[r1 + x] + w4 * P0[r1 + x + 1] + w5 * P0[r1 + x + 2] +
                  w6 * P0[r2 + x] + w7 * P0[r2 + x + 1] + w8 * P0[r2 + x + 2];
              }
            }
          }
        }
      }
      for (let i = b0, e = b0 + n * HW; i < e; i++) if (out[i] < 0) out[i] = 0;
    }
    return out;
  }

  function poolLayer(L, a) {
    const { C, H, W } = L, h = H >> 1, w = W >> 1, out = new Float32Array(C * h * w);
    for (let c = 0, o = 0; c < C; c++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++, o++) {
          const p = c * H * W + 2 * y * W + 2 * x;
          let m = a[p];
          if (a[p + 1] > m) m = a[p + 1];
          if (a[p + W] > m) m = a[p + W];
          if (a[p + W + 1] > m) m = a[p + W + 1];
          out[o] = m;
        }
      }
    }
    return out;
  }

  function gmaxLayer(L, a) {
    const { C, H, W } = L, HW = H * W, out = new Float32Array(C);
    for (let c = 0; c < C; c++) {
      let m = a[c * HW];
      for (let i = c * HW + 1; i < (c + 1) * HW; i++) if (a[i] > m) m = a[i];
      out[c] = m;
    }
    return out;
  }

  // As nn.cjs: summed in double from the bias, rounded to float32 once.
  function denseLayer(L, a) {
    const { n, O, w, b, relu } = L, out = new Float32Array(O);
    for (let o = 0; o < O; o++) {
      let acc = b[o];
      for (let i = 0, k = o * n; i < n; i++, k++) acc += w[k] * a[i];
      out[o] = relu && acc < 0 ? 0 : acc;
    }
    return out;
  }

  function runNet(net, x) {
    let a = x;
    for (const L of net.layers) a = L.type === "conv" ? convLayer(L, a) : L.type === "pool" ? poolLayer(L, a) : L.type === "gmax" ? gmaxLayer(L, a) : denseLayer(L, a);
    return a;
  }

  function logits(model, name, input) {
    const m = modelOf(model), net = m && (name === "A" || name === "B") ? m[name] : null;
    if (!net || !input || input.length !== net.size * net.size) return null;
    const x = Float32Array.from(input);
    return x.every(Number.isFinite) ? runNet(net, x) : null;
  }

  function inkOf(img, rect, st, edge = P.cellEdge) {
    const [x0, y0, x1, y1] = rect, ex = (x1 - x0) * edge, ey = (y1 - y0) * edge;
    const i0 = Math.max(0, Math.ceil(x0 + ex - 0.5)), i1 = Math.min(img.width, Math.floor(x1 - ex - 0.5) + 1);
    const j0 = Math.max(0, Math.ceil(y0 + ey - 0.5)), j1 = Math.min(img.height, Math.floor(y1 - ey - 0.5) + 1);
    const w = i1 - i0, h = j1 - j0, n = w * h;
    if (w < 3 || h < 3) return null;
    const data = img.data, W = img.width, sign = st.inverted ? -1 : 1;
    const t = new Float32Array(n), rgb = new Float32Array(3 * n);
    for (let y = 0, j = 0; y < h; y++) {
      for (let x = 0, p = ((j0 + y) * W + i0) * 4; x < w; x++, j++, p += 4) {
        const al = data[p + 3] / 255, r = 255 - (255 - data[p]) * al, g = 255 - (255 - data[p + 1]) * al, b = 255 - (255 - data[p + 2]) * al;
        rgb[3 * j] = r; rgb[3 * j + 1] = g; rgb[3 * j + 2] = b;
        t[j] = sign * (st.bg - (0.299 * r + 0.587 * g + 0.114 * b) / 255);
      }
    }
    const kth = () => select(Float32Array.from(t), n, n - Math.max(3, Math.round(n / P.inkRank)));
    let dk = kth();
    if (!(dk >= P.roleInkFloor)) return null;
    const kept = dropBands(t, w, h, dk);
    if (kept.changed) { dk = kth(); if (!(dk >= P.roleInkFloor)) return null; }
    let cn = 0, cr = 0, cg = 0, cb = 0, con = 0;
    for (let j = 0; j < n; j++) {
      const v = t[j] / dk;
      if (v >= 0.75) { cn++; cr += rgb[3 * j]; cg += rgb[3 * j + 1]; cb += rgb[3 * j + 2]; con += t[j]; }
      t[j] = v <= 0 ? 0 : v >= 1 ? 1 : v;
    }
    const runs = (len, lines, step, across) => {
      const out = new Float32Array(n);
      for (let l = 0; l < lines; l++) {
        const base = l * across;
        for (let k = 0; k < len;) {
          if (t[base + k * step] < 0.5) { k++; continue; }
          let e = k, s = k > 0 ? t[base + (k - 1) * step] : 0;
          while (e < len && t[base + e * step] >= 0.5) s += t[base + e++ * step];
          if (e < len) s += t[base + e * step];
          for (; k < e; k++) out[base + k * step] = s;
        }
      }
      return out;
    };
    const hr = runs(w, h, 1, w), vr = runs(h, w, w, 1);
    let area = 0, sum = 0;
    for (let j = 0; j < n; j++) if (t[j] >= 0.5) { area++; sum += Math.min(hr[j], vr[j]); }
    const rowMax = new Float32Array(h);
    let top = -1, bottom = -1, height = 0;
    for (let y = 0; y < h; y++) {
      let m = 0;
      for (let x = 0, j = y * w; x < w; x++, j++) if (t[j] > m) m = t[j];
      rowMax[y] = m;
      if (m >= P.glyphLevel) { if (top < 0) top = y; bottom = y; }
    }
    for (let y = Math.max(0, top - 1); y <= Math.min(h - 1, bottom + 1); y++) height += rowMax[y];
    let clipped = false;
    const inkAt = (j0, step, len) => { for (let i = 0; i < len; i++) if (t[j0 + i * step] >= 0.5) return true; return false; };
    if ((kept.x0 === 0 && inkAt(0, w, h)) || (kept.x1 === w - 1 && inkAt(w - 1, w, h)) || (kept.y0 === 0 && inkAt(0, 1, w)) || (kept.y1 === h - 1 && inkAt((h - 1) * w, 1, w))) clipped = true;
    return { rgb: [cr / cn, cg / cn, cb / cn], contrast: con / cn, width: sum / area, height, clipped };
  }

  function dropBands(t, w, h, dk) {
    const on = (j) => t[j] >= 0.5 * dk;
    const full = (j0, step, len) => { let k = 0; for (let i = 0; i < len; i++) if (on(j0 + i * step)) k++; return k >= P.bandEdge * len; };
    const run = (start, dir, n, line) => { let k = 0; while (k < n && line(start + dir * k)) k++; return k <= P.bandStrip * n ? k : 0; };
    const col = (x) => full(x, w, h), row = (y) => full(y * w, 1, w);
    const l = run(0, 1, w, col), r = run(w - 1, -1, w, col), tp = run(0, 1, h, row), bt = run(h - 1, -1, h, row);
    const x0 = l ? l + 1 : 0, x1 = r ? w - r - 2 : w - 1, y0 = tp ? tp + 1 : 0, y1 = bt ? h - bt - 2 : h - 1;
    if (x1 - x0 < 2 || y1 - y0 < 2) return { changed: false, x0: 0, x1: w - 1, y0: 0, y1: h - 1 };
    let changed = false;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if ((x < x0 || x > x1 || y < y0 || y > y1) && t[y * w + x] !== 0) { t[y * w + x] = 0; changed = true; }
    }
    const iw = x1 - x0 + 1, ih = y1 - y0 + 1, seen = new Uint8Array(w * h), queue = new Int32Array(w * h), drop = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const s = y * w + x;
      if (seen[s] || !on(s)) continue;
      let head = 0, tail = 0, a0 = w, a1 = -1, b0 = h, b1 = -1;
      seen[s] = 1; queue[tail++] = s;
      while (head < tail) {
        const j = queue[head++], px = j % w, py = (j - px) / w;
        if (px < a0) a0 = px; if (px > a1) a1 = px; if (py < b0) b0 = py; if (py > b1) b1 = py;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx, yy = py + dy, q = yy * w + xx;
          if (xx >= x0 && yy >= y0 && xx <= x1 && yy <= y1 && !seen[q] && on(q)) { seen[q] = 1; queue[tail++] = q; }
        }
      }
      const cx = a0 === x0 ? x0 : a1 === x1 ? x1 : -1, cy = b0 === y0 ? y0 : b1 === y1 ? y1 : -1;
      let corner = cx >= 0 && cy >= 0 && on(cy * w + cx) && a1 - a0 + 1 <= P.bandCorner * iw && b1 - b0 + 1 <= P.bandCorner * ih;
      if (corner) {
        const lo = new Int32Array(b1 - b0 + 1).fill(w), hi = new Int32Array(b1 - b0 + 1).fill(-1), n = new Int32Array(b1 - b0 + 1);
        for (let k = 0; k < tail; k++) {
          const px = queue[k] % w, r = (queue[k] - px) / w - b0;
          if (px < lo[r]) lo[r] = px; if (px > hi[r]) hi[r] = px; n[r]++;
        }
        let prev = Infinity;
        for (let k = 0; k <= b1 - b0 && corner; k++) {
          const r = cy === y0 ? k : b1 - b0 - k, len = n[r];
          if (!len) break;
          corner = len === hi[r] - lo[r] + 1 && (cx === x0 ? lo[r] === x0 : hi[r] === x1) && len <= prev + 1;
          prev = len;
        }
      }
      if (corner) for (let k = 0; k < tail; k++) drop.push(queue[k]);
    }
    for (const j of drop) {
      const px = j % w, py = (j - px) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = px + dx, yy = py + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) t[yy * w + xx] = 0;
      }
      changed = true;
    }
    return { changed, x0, x1, y0, y1 };
  }

  const rgbDist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

  function cellColour(img, rect) {
    const [x0, y0, x1, y1] = rect, W = img.width, d = img.data;
    const i0 = Math.max(0, Math.ceil(x0)), i1 = Math.min(W, Math.floor(x1));
    const j0 = Math.max(0, Math.ceil(y0)), j1 = Math.min(img.height, Math.floor(y1));
    const hist = new Int32Array(768);
    let n = 0;
    for (let y = j0; y < j1; y++) {
      for (let x = i0, p = (y * W + i0) * 4; x < i1; x++, p += 4, n++) {
        const al = d[p + 3] / 255;
        for (let c = 0; c < 3; c++) hist[256 * c + Math.round(255 - (255 - d[p + c]) * al)]++;
      }
    }
    const out = [255, 255, 255];
    for (let c = 0; c < 3 && n; c++) {
      for (let v = 0, s = 0; v < 256; v++) { s += hist[256 * c + v]; if (s > n >> 1) { out[c] = v; break; } }
    }
    return out;
  }

  function colourClusters(cols) {
    const n = cols.length, D = [], size = [], alive = [], lab = [];
    for (let i = 0; i < n; i++) { D.push(Float64Array.from(cols, (c) => rgbDist(cols[i], c))); size.push(1); alive.push(true); lab.push(i); }
    for (;;) {
      let bi = -1, bj = -1, bd = Infinity;
      for (let i = 0; i < n; i++) if (alive[i]) for (let j = i + 1; j < n; j++) if (alive[j] && D[i][j] < bd) { bd = D[i][j]; bi = i; bj = j; }
      if (bi < 0 || bd >= P.roleColour) break;
      for (let k = 0; k < n; k++) {
        if (alive[k] && k !== bi && k !== bj) D[bi][k] = D[k][bi] = (size[bi] * D[bi][k] + size[bj] * D[bj][k]) / (size[bi] + size[bj]);
      }
      size[bi] += size[bj];
      alive[bj] = false;
      for (let k = 0; k < n; k++) if (lab[k] === bj) lab[k] = bi;
    }
    const ids = new Map();
    return lab.map((v) => { if (!ids.has(v)) ids.set(v, ids.size); return ids.get(v); });
  }

  function stepChroma(ink, bg) {
    const w0 = ink[0] - bg[0], w1 = ink[1] - bg[1], w2 = ink[2] - bg[2], len = Math.sqrt(w0 * w0 + w1 * w1 + w2 * w2);
    return len > 1 ? (Math.max(w0, w1, w2) - Math.min(w0, w1, w2)) / len : 0;
  }

  function hueOf(rgb) {
    const [r, g, b] = rgb, mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    if (d < 1e-6) return -1;
    const h = 60 * (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
    return h < 0 ? h + 360 : h;
  }

  function dimGain(fs, bgs, base) {
    const steps = fs.map((f, j) => rgbDist(f.rgb, bgs[j])).sort((a, b) => a - b);
    const s = steps[Math.floor(0.9 * (steps.length - 1))];
    const dark = fs.filter((f, j) => luma(f.rgb) < luma(bgs[j])).length * 2 >= fs.length;
    const dimmed = dark ? luma(base) < P.roleDimLight : s < P.roleDimDark;
    return dimmed && s > 0 && s < P.roleDimStep ? P.roleDimStep / s : 1;
  }

  function dimInks(fs, bgs, base, gain) {
    if (gain === 1) return fs.map((f) => f.rgb);
    const s = P.roleDimStep / gain, lb = luma(base) + 1;
    return fs.map((f, j) => {
      const len = rgbDist(f.rgb, bgs[j]), lc = luma(bgs[j]) + 1;
      if (len >= P.roleDimBright * s && Math.max(lc, lb) >= P.roleDimBright * Math.min(lc, lb)) return f.rgb.map((v, c) => ((v - bgs[j][c]) * P.roleDimStep) / len);
      return f.rgb.map((v, c) => (v - base[c]) * gain);
    });
  }

  function assignRoles(feats, digits, other) {
    const roles = feats.map(() => "given"), at = [], fs = [];
    feats.forEach((f, k) => { if (f) { at.push(k); fs.push(f); } });
    const res = { roles, cue: null, by: null, groups: fs.length ? 1 : 0, width: 1 };
    if (fs.length < 2) return res;
    const bgs = at.map((k) => digits[k].bg), all = digits.concat(other).map((d) => d.bg);
    const base = [0, 1, 2].map((c) => medianOf(all.map((b) => b[c]))), gain = dimGain(fs, bgs, base);
    const n = fs.length, lab = joinDiluted(colourClusters(dimInks(fs, bgs, base, gain)), fs, digits, at, gain);
    const groups = Math.max(...lab) + 1, members = Array.from({ length: groups }, () => []);
    lab.forEach((g, j) => members[g].push(j));
    res.groups = groups;
    const minSize = Math.max(P.roleOutlier, P.roleShare * n);
    let big = members.map((m, g) => g).filter((g) => members[g].length >= minSize);
    if (!big.length) big = [members.reduce((b, m, g) => (m.length > members[b].length ? g : b), 0)];
    if (big.length >= 2) {
      const st = new Map(big.map((g) => {
        const m = members[g], ink = [0, 1, 2].map((c) => medianOf(m.map((j) => fs[j].rgb[c])));
        return [g, {
          size: m.length, hue: hueOf(ink),
          chroma: medianOf(m.map((j) => stepChroma(fs[j].rgb, digits[at[j]].bg))),
          colour: medianOf(m.map((j) => Math.max(...fs[j].rgb) - Math.min(...fs[j].rgb))),
          width: medianOf(m.map((j) => fs[j].width)),
          contrast: m.reduce((s, j) => s + fs[j].contrast, 0) / m.length,
        }];
      }));
      const largest = big.reduce((b, g) => (members[g].length > members[b].length ? g : b), big[0]);
      let pool = big.filter((g) => g === largest || members[g].length >= P.roleGivens - P.roleSlack), pick = -1;
      const neutral = pool.filter((g) => st.get(g).chroma <= P.roleNeutral);
      const coloured = pool.filter((g) => st.get(g).chroma >= P.roleColoured);
      if (neutral.length === 1 && neutral.length + coloured.length === pool.length) { pick = neutral[0]; res.by = "chroma"; }
      if (pick < 0) {
        const full = pool.filter((g) => st.get(g).size >= P.roleGivens);
        if (full.length === 1) { pick = full[0]; res.by = "count"; }
        else {
          if (full.length) pool = full;
          const s = (g) => st.get(g);
          const blues = pool.filter((g) => s(g).colour >= P.roleBlueChroma && s(g).hue >= P.roleBlueMin && s(g).hue <= P.roleBlueMax);
          const byW = pool.slice().sort((a, b) => s(b).width - s(a).width), byC = pool.slice().sort((a, b) => s(b).contrast - s(a).contrast);
          if (pool.length === 1) { pick = pool[0]; res.by = "size"; }
          else if (pool.length === 2 && blues.length === 1) { pick = pool.find((g) => g !== blues[0]); res.by = "blue"; }
          else if (s(byC[0]).contrast >= P.roleGroupContrast * s(byC[1]).contrast) { pick = byC[0]; res.by = "contrast"; }
          else if (s(byW[0]).width >= P.roleGroupWidth * s(byW[1]).width) { pick = byW[0]; res.by = "width"; }
          else { pick = byC[0]; res.by = "weak contrast"; }
        }
      }
      res.cue = "colour";
      lab.forEach((g, j) => { if (g !== pick) roles[at[j]] = "user"; });
      return res;
    }
    const main = big[0], idx = members[main];
    lab.forEach((g, j) => { if (g !== main) roles[at[j]] = "user"; });
    const thin = thinDigits(fs, idx, (j) => digits[at[j]].digit);
    if (thin) {
      res.cue = "width";
      res.width = thin.ratio;
      for (const j of thin.thin) roles[at[j]] = "user";
      return res;
    }
    const d = idx.map((j) => digits[at[j]]);
    const users = fillUsers(d.map((x) => x.bg), d.map((x) => x.cell), d.map((x) => x.digit), other.map((o) => o.bg), other.map((o) => o.cell));
    if (users) { res.cue = "fill"; for (const k of users) roles[at[idx[k]]] = "user"; }
    return res;
  }

  function joinDiluted(lab, fs, digits, at, gain) {
    const groups = Math.max(...lab) + 1, mem = Array.from({ length: groups }, () => []);
    lab.forEach((g, j) => mem[g].push(j));
    const values = mem.map((m) => new Set(m.map((j) => digits[at[j]].digit)));
    const ink = mem.map((m) => [0, 1, 2].map((c) => (m.length ? medianOf(m.map((j) => fs[j].rgb[c])) : 0)));
    const out = lab.slice();
    for (let g = 0; g < groups; g++) {
      if (values[g].size !== 1 || !values[g].has(1)) continue;
      let best = -1, bestD = Infinity;
      for (let h = 0; h < groups; h++) {
        if (h === g || values[h].size < 2) continue;
        let worst = 0;
        for (const j of mem[g]) {
          const bg = digits[at[j]].bg, v = [0, 1, 2].map((c) => ink[h][c] - bg[c]), u = [0, 1, 2].map((c) => fs[j].rgb[c] - bg[c]);
          const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], a = vv > 1 ? (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / vv : -1;
          const off = Math.sqrt((u[0] - a * v[0]) ** 2 + (u[1] - a * v[1]) ** 2 + (u[2] - a * v[2]) ** 2);
          worst = a < 0.2 || a > 1.05 ? Infinity : Math.max(worst, off);
        }
        if (gain * worst <= P.roleColour / 2 && worst < bestD) { bestD = worst; best = h; }
      }
      if (best >= 0) for (const j of mem[g]) out[j] = best;
    }
    const ids = new Map();
    return out.map((v) => { if (!ids.has(v)) ids.set(v, ids.size); return ids.get(v); });
  }

  function thinDigits(fs, idx0, digitOf) {
    const mh = medianOf(idx0.map((j) => fs[j].height));
    const idx = idx0.filter((j) => Math.abs(fs[j].height / mh - 1) <= P.roleHeightTol), n = idx.length;
    if (n < 2) return null;
    const lw = idx.map((j) => Math.log(fs[j].width));
    let m0 = Math.min(...lw), m1 = Math.max(...lw), cut = (m0 + m1) / 2;
    for (let it = 0; it < 50; it++) {
      let s0 = 0, n0 = 0, s1 = 0, n1 = 0;
      for (const v of lw) if (v < cut) { s0 += v; n0++; } else { s1 += v; n1++; }
      if (!n0 || !n1) break;
      m0 = s0 / n0; m1 = s1 / n1;
      const next = (m0 + m1) / 2;
      if (next === cut) break;
      cut = next;
    }
    let thinMax = -Infinity, thickMin = Infinity, thick = 0;
    for (const v of lw) if (v < cut) thinMax = Math.max(thinMax, v); else { thickMin = Math.min(thickMin, v); thick++; }
    const ratio = Math.exp(m1 - m0);
    if (thick === n || thick < Math.max(2, P.roleShare * n, n >= P.roleGivens ? P.roleGivens : 0)) return null;
    if (ratio < P.roleWidth || Math.exp(thickMin - thinMax) < P.roleWidthGap) return null;
    const thin = idx.filter((j, k) => lw[k] < cut);
    if (new Set(thin.map(digitOf)).size < 2) return null;
    return { thin, ratio };
  }

  function sameHouse(i, c) {
    const ri = Math.floor(i / 9), qi = i % 9, r = Math.floor(c / 9), q = c % 9;
    return ri === r || qi === q || (Math.floor(ri / 3) === Math.floor(r / 3) && Math.floor(qi / 3) === Math.floor(q / 3));
  }

  function fillUsers(v, vCells, vDigits, other, oCells) {
    const least = P.roleGivens - P.roleSlack;
    if (v.length <= P.roleGivens || other.length < Math.max(1, P.roleFillOther)) return null;
    const near = (a, b) => rgbDist(a, b) <= P.roleFillTight;
    let base = null, bn = -1;
    for (const c of other) { const k = other.filter((x) => near(x, c)).length; if (k > bn) { bn = k; base = c; } }
    if (bn < P.roleFillMost * other.length) return null;
    const users = [], rest = [];
    v.forEach((x, j) => (near(x, base) ? users : rest).push(j));
    if (rest.length < least) return null;
    let level = null, ln = -1;
    for (const j of rest) { const k = rest.filter((i) => near(v[i], v[j])).length; if (k > ln) { ln = k; level = v[j]; } }
    if (rgbDist(level, base) < P.roleFillGap || ln < Math.max(least, P.roleFillShare * rest.length)) return null;
    if (other.filter((x) => near(x, level)).length > P.roleFillFew * other.length) return null;
    const on = [], ds = new Set();
    v.forEach((x, j) => { if (near(x, level)) { on.push(vCells[j]); ds.add(vDigits[j]); } });
    oCells.forEach((c, k) => { if (near(other[k], level)) on.push(c); });
    if (ds.size === 1) return null;
    for (let c = 0; c < 81; c++) if (on.every((i) => sameHouse(i, c))) return null;
    return users;
  }

  function peers(i) {
    const r = Math.floor(i / 9), c = i % 9, out = [];
    for (let j = 0; j < 81; j++) {
      const rj = Math.floor(j / 9), cj = j % 9;
      if (j !== i && (rj === r || cj === c || (Math.floor(rj / 3) === Math.floor(r / 3) && Math.floor(cj / 3) === Math.floor(c / 3)))) out.push(j);
    }
    return out;
  }

  function cellWarnings(cells, emptyCands) {
    const low = [], dup = new Set(), repeated = [];
    let givens = 0;
    cells.forEach((cell, i) => {
      if (cell.confidence < P.lowConfidence) low.push(i);
      if (cell.role === "given") givens++;
      const ps = peers(i);
      if (cell.digit) {
        for (const j of ps) if (cells[j].digit === cell.digit) { dup.add(i); dup.add(j); }
      } else if (cell.candidates) {
        if (ps.some((j) => cells[j].digit && cell.candidates & (1 << (cells[j].digit - 1)))) repeated.push(i);
      }
    });
    const out = [];
    if (dup.size) out.push({ code: "duplicate", cells: [...dup].sort((a, b) => a - b) });
    if (low.length) out.push({ code: "low-confidence", cells: low });
    if (givens < P.fewClues) out.push({ code: "few-clues", cells: [] });
    if (emptyCands.length) out.push({ code: "candidate-cell-empty", cells: emptyCands });
    if (repeated.length) out.push({ code: "repeated-candidate", cells: repeated });
    return out;
  }

  function medianOf(list) {
    const s = list.slice().sort((a, b) => a - b), k = s.length >> 1;
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  }

  function shortDigits(cells, inks) {
    const shortAgainst = (ref, hOf) => {
      const out = [];
      cells.forEach((cell, i) => {
        if (!cell.digit || !inks[i]) return;
        const same = [], all = [];
        cells.forEach((other, j) => {
          if (j === i || !other.digit || !inks[j] || !ref(j)) return;
          all.push(hOf(j));
          if (other.digit === cell.digit) same.push(hOf(j));
        });
        const refs = [];
        if (same.length >= 2) refs.push(medianOf(same));
        if (all.length >= 5) refs.push(all.sort((a, b) => a - b)[all.length >> 2]);
        if (refs.length && hOf(i) < P.glyphRatio * Math.min(...refs)) out.push(i);
      });
      return out;
    };
    const out = shortAgainst(() => true, (j) => inks[j].whole ?? inks[j].height), hs = [];
    cells.forEach((cell, i) => { if (cell.digit && inks[i]) hs.push(inks[i].height); });
    if (hs.length < 5) return out;
    hs.sort((a, b) => a - b);
    const least = P.glyphRatio * hs[Math.floor(P.glyphTall * (hs.length - 1))];
    const tall = (j) => inks[j].height >= least, tallCells = [];
    cells.forEach((cell, j) => { if (cell.digit && inks[j] && tall(j)) tallCells.push(j); });
    for (const i of shortAgainst(tall, (j) => inks[j].height)) {
      if (!out.includes(i) && tallCells.every((j) => rgbDist(inks[i].rgb, inks[j].rgb) >= P.roleColour)) out.push(i);
    }
    return out;
  }

  function readCells(img, board, model, opts) {
    const m = modelOf(model === undefined ? root.SudokuOcrModel : model);
    const inputs = m && cellInputs(img, board, { aSize: m.A.size, bSize: m.B.size });
    if (!inputs) return null;
    const detail = !!(opts && opts.detail), na = m.A.size * m.A.size, nb = m.B.size * m.B.size;
    const cells = [], cls = [], logitsA = [], inks = [], feats = [], digitAt = [], emptyCands = [];
    for (let i = 0; i < 81; i++) {
      const za = runNet(m.A, inputs.a.subarray(i * na, (i + 1) * na));
      let top = 0;
      for (let k = 1; k < za.length; k++) if (za[k] > za[top]) top = k;
      const cell = { digit: top >= 1 && top <= 9 ? top : 0, role: null, candidates: 0, confidence: 0 };
      cls.push(top);
      const ink = cell.digit ? inkOf(img, cellRect(board, i), inputs.stats[i]) : null;
      if (ink && ink.clipped) { const whole = inkOf(img, cellRect(board, i), inputs.stats[i], 0); if (whole) ink.whole = whole.height; }
      inks.push(ink);
      logitsA.push(za);
      cells.push(cell);
    }
    const short = shortDigits(cells, inks);
    for (const i of short) { cells[i].digit = 0; cls[i] = 0; }
    const tA = P.confidenceA, tB = P.confidenceB;
    cells.forEach((cell, i) => {
      const za = logitsA[i];
      let mx = za[0], sum = 0;
      for (let k = 1; k < za.length; k++) if (za[k] > mx) mx = za[k];
      for (let k = 0; k < za.length; k++) sum += Math.exp((za[k] - mx) / tA);
      cell.confidence = Math.exp((za[cls[i]] - mx) / tA) / sum;
      let zb = null;
      if (cls[i] === 0) {
        zb = runNet(m.B, inputs.b.subarray(i * nb, (i + 1) * nb));
        for (let k = 0; k < zb.length; k++) {
          if (zb[k] >= 0) cell.candidates |= 1 << k;
          cell.confidence = Math.min(cell.confidence, 1 / (1 + Math.exp(-Math.abs(zb[k]) / tB)));
        }
        if (!cell.candidates) emptyCands.push(i);
      }
      if (cell.digit) {
        feats.push(inks[i]);
        digitAt.push(i);
      }
      if (detail) cell.detail = { a: za, b: zb, ink: inks[i], short: short.includes(i) };
    });
    const colours = cells.map((cell, i) => cellColour(img, cellRect(board, i))), other = [];
    cells.forEach((cell, i) => { if (!cell.digit) other.push({ cell: i, bg: colours[i] }); });
    const roles = assignRoles(feats, digitAt.map((i) => ({ cell: i, digit: cells[i].digit, bg: colours[i] })), other);
    digitAt.forEach((i, k) => { cells[i].role = roles.roles[k]; });
    const out = { cells, warnings: cellWarnings(cells, emptyCands) };
    if (detail) out.roles = { cue: roles.cue, by: roles.by, groups: roles.groups, width: roles.width };
    return out;
  }

  const PREVIEW_SIZE = 576;

  function fittingModel(model) {
    const m = modelOf(model);
    if (!m) return null;
    const known = INPUTS_FINGERPRINT[`${m.A.size}x${m.B.size}`], inputs = model.meta && model.meta.inputs;
    const fits = (r) => !!r && r.engineFingerprint === known && r.aSize === m.A.size && r.bSize === m.B.size;
    return known && inputs && fits(inputs.A) && fits(inputs.B) ? m : null;
  }

  function rgbaImage(img) {
    if (!img || typeof img !== "object") return false;
    const w = img.width, h = img.height, d = img.data;
    return Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && root.ArrayBuffer.isView(d) &&
      d.BYTES_PER_ELEMENT === 1 && d.length >= w * h * 4;
  }

  function previewOf(img, b) {
    const n = PREVIEW_SIZE, W = img.width, d = img.data;
    const ax = areaWeights(b.x, b.x + b.width, n, W), ay = areaWeights(b.y, b.y + b.height, n, img.height);
    const sx0 = ax.start[0], rw = ax.start[n - 1] + ax.count[n - 1] - sx0;
    const row = new Float64Array(3 * rw), rgba = new root.Uint8ClampedArray(4 * n * n);
    for (let o = 0, q = 0; o < n; o++) {
      row.fill(0);
      for (let c = 0; c < ay.count[o]; c++, q++) {
        const w = ay.w[q];
        for (let x = 0, k = 0, p = ((ay.start[o] + c) * W + sx0) * 4; x < rw; x++, k += 3, p += 4) {
          const a = d[p + 3] / 255;
          row[k] += w * (255 - (255 - d[p]) * a);
          row[k + 1] += w * (255 - (255 - d[p + 1]) * a);
          row[k + 2] += w * (255 - (255 - d[p + 2]) * a);
        }
      }
      for (let x = 0, q2 = 0, p = 4 * n * o; x < n; x++, p += 4) {
        let r = 0, g = 0, bl = 0;
        for (let c = 0, k = 3 * (ax.start[x] - sx0); c < ax.count[x]; c++, q2++, k += 3) {
          const w = ax.w[q2];
          r += w * row[k]; g += w * row[k + 1]; bl += w * row[k + 2];
        }
        rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = bl; rgba[p + 3] = 255;
      }
    }
    return { size: n, rgba };
  }

  function recognize(img, model) {
    const file = model === undefined ? root.SudokuOcrModel : model;
    if (!fittingModel(file)) return { ok: false, reason: "model-mismatch" };
    if (!rgbaImage(img)) return { ok: false, reason: "no-board" };
    const loc = locate(img);
    if (!loc.ok) return { ok: false, reason: loc.reason === "board-too-small" ? "board-too-small" : "no-board" };
    const read = readCells(img, loc.board, file);
    if (!read) return { ok: false, reason: "no-board" };
    return {
      ok: true,
      cells: read.cells.map((c) => ({ digit: c.digit, role: c.role, candidates: c.candidates, confidence: c.confidence })),
      board: loc.board,
      preview: previewOf(img, loc.board),
      warnings: read.warnings.concat(loc.warnings || []),
    };
  }

  root.SudokuOcr = Object.freeze({
    version: VERSION,
    params: Object.freeze(Object.assign({}, DEFAULTS)),
    inputsFingerprint: INPUTS_FINGERPRINT,
    locate,
    cutCells,
    cellInputs,
    normalizeCell,
    readCells,
    logits,
    recognize,
  });
})(globalThis);
