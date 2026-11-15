// --- TLG 3D view: the Truth/Link model inside the candidate cube ---
const TLG3D = (() => {
  "use strict";
  const DEFAULT_ANGLES = Object.freeze({ theta: 0, phi: 0 });
  const THETA_MAX = 75;
  const PHI_MAX = 60;
  const DRAG_DEG_PER_PX = 0.4;
  const CLICK_SLOP_PX = 3;
  const BAR = 0.18;
  const NODE = 0.3;
  const SHORT_BAR = 0.35;
  const HALO = 2.5;
  const MIN_BAR_PX = 3;
  const MIN_NODE_PX = 6;
  const MIN_SYMBOL_PX = 8;
  const MIN_LABEL_PX = 10;
  const TICK_PAD_PX = 18;
  const DIM = 0.35;
  const FACE_SHADE = [0.85, 0.7, 1];
  const SCREEN_ALPHA = { truth: 0.92, linkFill: 0.18, linkStroke: 1 };
  const EXPORT_ALPHA = { truth: 0.6, linkFill: 0.12, linkStroke: 0.8 };
  const FONT = "system-ui, -apple-system, Segoe UI, sans-serif";

  // Corner k of an axis-aligned box takes hi on axis a when bit a is set.
  const FACES = [];
  for (let a = 0; a < 3; a++) {
    const [b, c] = [0, 1, 2].filter((i) => i !== a);
    for (const hi of [0, 1]) {
      const base = hi << a;
      FACES.push({
        axis: a,
        sign: hi ? 1 : -1,
        idx: [0, 1 << b, (1 << b) | (1 << c), 1 << c].map((k) => k | base),
      });
    }
  }

  function clampAngles(theta, phi) {
    const clamp = (v, lo, hi) =>
      Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0;
    return {
      theta: clamp(theta, 0, THETA_MAX),
      phi: clamp(phi, -PHI_MAX, PHI_MAX),
    };
  }

  const keyOf = (m) => m.r * 81 + m.c * 9 + m.n - 1;
  const posOf = (m) => [m.c + 0.5, m.r + 0.5, m.n - 0.5];
  const AXIS_OF = { row: "x", col: "y", cell: "z", box: "box" };
  const DIR_OF = { row: 0, col: 1, cell: 2, box: 0 };

  function setBars(set, bars) {
    const members = set.members || [];
    if (members.length === 0) return;
    const base = {
      setId: set.id,
      kind: set.kind,
      role: set.role,
      saturated: !!set.saturated,
      selected: !!set.selected,
      axis: AXIS_OF[set.kind],
    };
    if (members.length === 1) {
      const from = posOf(members[0]);
      const to = from.slice();
      from[DIR_OF[set.kind]] -= SHORT_BAR;
      to[DIR_OF[set.kind]] += SHORT_BAR;
      bars.push({ ...base, from, to });
      return;
    }
    if (set.kind === "box") {
      const n = members[0].n;
      for (const { from, to } of TLGRenderer.boxSegments(members)) {
        if (from.r === to.r && from.c === to.c) continue;
        bars.push({
          ...base,
          from: posOf({ ...from, n }),
          to: posOf({ ...to, n }),
        });
      }
      return;
    }
    const order =
      set.kind === "row"
        ? (m) => m.c
        : set.kind === "col"
          ? (m) => m.r
          : (m) => m.n;
    const sorted = [...members].sort((a, b) => order(a) - order(b));
    for (let i = 1; i < sorted.length; i++) {
      bars.push({ ...base, from: posOf(sorted[i - 1]), to: posOf(sorted[i]) });
    }
  }

  function buildScene(model, opts = {}) {
    const bars = [];
    const nodes = new Map();
    const selected = new Set();
    const node = (m) => {
      const key = keyOf(m);
      let item = nodes.get(key);
      if (!item) {
        item = {
          r: m.r,
          c: m.c,
          n: m.n,
          truth: false,
          kill: null,
          live: false,
          perm: false,
          aur: false,
          vset: false,
          alsColors: null,
          label: null,
        };
        nodes.set(key, item);
      }
      return item;
    };
    for (const set of model.sets || []) {
      setBars(set, bars);
      for (const m of set.members || []) {
        const item = node(m);
        if (set.role === "truth") item.truth = true;
        if (set.selected) selected.add(keyOf(m));
      }
    }
    for (const k of model.kills || []) {
      node(k).kill = k.kind === "cannibal" ? "cannibal" : "external";
    }
    for (const m of model.lives || []) node(m).live = true;
    for (const m of model.perm || []) node(m).perm = true;
    for (const m of model.aurMarks || []) node(m).aur = true;
    for (const m of model.vset || []) node(m).vset = true;
    for (const m of model.alsCands || []) node(m).alsColors = m.colors.slice();
    for (const [key, item] of nodes) {
      if (opts.nodeLabels || item.kill || item.live || selected.has(key)) {
        item.label = String(item.n);
      }
    }
    return {
      bars,
      nodes: [...nodes.values()],
      floorTiles: (model.alsCells || []).map((m) => ({
        r: m.r,
        c: m.c,
        colors: m.colors.slice(),
      })),
      highlightedDigit: model.highlightedDigit || null,
    };
  }

  // Top view first (screen x = column, screen y = row, depth = digit toward
  // the viewer), then Rx(theta) about the screen's horizontal axis and
  // Ry(phi) about its vertical axis. A larger depth is nearer the viewer.
  function rotation(theta, phi) {
    const t = (theta * Math.PI) / 180;
    const p = (phi * Math.PI) / 180;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    return (x, y, z) => {
      const y1 = y * ct - z * st;
      const z1 = y * st + z * ct;
      return [x * cp + z1 * sp, y1, -x * sp + z1 * cp];
    };
  }

  function project(scene, angles, size) {
    const { theta, phi } = clampAngles(angles.theta, angles.phi);
    const rot = rotation(theta, phi);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < 8; k++) {
      const v = rot(
        k & 1 ? 4.5 : -4.5,
        k & 2 ? 4.5 : -4.5,
        k & 4 ? 4.5 : -4.5,
      );
      minX = Math.min(minX, v[0]);
      maxX = Math.max(maxX, v[0]);
      minY = Math.min(minY, v[1]);
      maxY = Math.max(maxY, v[1]);
    }
    const tilt = Math.min(
      1,
      Math.max(
        Math.sin((theta * Math.PI) / 180),
        Math.abs(Math.sin((phi * Math.PI) / 180)),
      ) / Math.sin(Math.PI / 12),
    );
    const pad = TICK_PAD_PX * tilt;
    const scale = Math.max(
      1e-6,
      Math.min(
        (size.width - 2 * pad) / (maxX - minX),
        (size.height - 2 * pad) / (maxY - minY),
      ),
    );
    const origin = {
      x: size.width / 2 - (scale * (minX + maxX)) / 2,
      y: size.height / 2 - (scale * (minY + maxY)) / 2,
    };
    const toScreen = (x, y, z) => {
      const v = rot(x - 4.5, y - 4.5, z - 4.5);
      return [origin.x + scale * v[0], origin.y + scale * v[1], v[2]];
    };
    const axisDepth = [rot(1, 0, 0)[2], rot(0, 1, 0)[2], rot(0, 0, 1)[2]];
    const planeTransform = (z) => {
      const o = toScreen(0, 0, z);
      const ex = toScreen(1, 0, z);
      const ey = toScreen(0, 1, z);
      return [
        ex[0] - o[0],
        ex[1] - o[1],
        ey[0] - o[0],
        ey[1] - o[1],
        o[0],
        o[1],
      ];
    };
    const flat = (x, y) => toScreen(x, y, 0).slice(0, 2);
    const quad = (x0, y0, x1, y1) => [
      flat(x0, y0),
      flat(x1, y0),
      flat(x1, y1),
      flat(x0, y1),
    ];

    const boxFaces = (lo, hi) => {
      const pts = [];
      for (let k = 0; k < 8; k++) {
        const p = toScreen(
          k & 1 ? hi[0] : lo[0],
          k & 2 ? hi[1] : lo[1],
          k & 4 ? hi[2] : lo[2],
        );
        pts.push([p[0], p[1]]);
      }
      const faces = [];
      for (const f of FACES) {
        if (f.sign * axisDepth[f.axis] <= 1e-9) continue;
        faces.push({
          axis: f.axis,
          points: f.idx.map((k) => pts[k]),
          shade: FACE_SHADE[f.axis],
        });
      }
      return faces;
    };
    const depthAt = (p) => toScreen(p[0], p[1], p[2])[2];

    const barT = Math.max(BAR, MIN_BAR_PX / scale) / 2;
    const cubeT = Math.max(NODE, MIN_NODE_PX / scale) / 2;
    const shadows = [];
    const bars = [];
    const barBox = (from, to, half, extend) => {
      const lo = [];
      const hi = [];
      for (let i = 0; i < 3; i++) {
        const a = Math.min(from[i], to[i]);
        const b = Math.max(from[i], to[i]);
        const along = a !== b;
        lo.push(a - (along ? extend : half));
        hi.push(b + (along ? extend : half));
      }
      return [lo, hi];
    };
    for (const bar of scene.bars) {
      const [lo, hi] = barBox(bar.from, bar.to, barT, 0);
      const mid = bar.from.map((v, i) => (v + bar.to[i]) / 2);
      const fromDigit = Math.round(bar.from[2] + 0.5);
      const toDigit = Math.round(bar.to[2] + 0.5);
      const digits = fromDigit === toDigit ? [fromDigit] : [fromDigit, toDigit];
      const item = {
        setId: bar.setId,
        kind: bar.kind,
        role: bar.role,
        saturated: bar.saturated,
        axis: bar.axis,
        digits,
        depth: depthAt(mid),
        faces: boxFaces(lo, hi),
        halo: null,
      };
      if (bar.selected) {
        const [hlo, hhi] = barBox(bar.from, bar.to, barT * HALO, barT * 1.5);
        item.halo = boxFaces(hlo, hhi);
      }
      bars.push(item);
      shadows.push(quad(lo[0], lo[1], hi[0], hi[1]));
    }

    const nodes = [];
    const symbols = [];
    const labels = [];
    const cubePx = cubeT * scale;
    const symbolPx = Math.max(MIN_SYMBOL_PX / 2, 0.2 * scale);
    const labelPx = Math.max(MIN_LABEL_PX, 0.24 * scale);
    for (const n of scene.nodes) {
      const p = posOf(n);
      const lo = p.map((v) => v - cubeT);
      const hi = p.map((v) => v + cubeT);
      const [x, y, depth] = toScreen(p[0], p[1], p[2]);
      const colors = n.alsColors && n.alsColors.length ? n.alsColors : null;
      let stripes = null;
      if (colors && colors.length > 1 && axisDepth[2] > 1e-9) {
        const w = (hi[0] - lo[0]) / colors.length;
        stripes = colors.map((color, i) => {
          const x0 = lo[0] + i * w;
          const x1 = x0 + w;
          return {
            color,
            points: [
              [x0, lo[1]],
              [x1, lo[1]],
              [x1, hi[1]],
              [x0, hi[1]],
            ].map(([sx, sy]) => toScreen(sx, sy, hi[2]).slice(0, 2)),
          };
        });
      }
      nodes.push({
        type: "cube",
        r: n.r,
        c: n.c,
        n: n.n,
        x,
        y,
        depth,
        faces: boxFaces(lo, hi),
        color: colors ? colors[0] : null,
        stripes,
      });
      shadows.push(quad(lo[0], lo[1], hi[0], hi[1]));
      const at = { n: n.n, x, y, depth };
      if (n.perm) {
        const size = Math.max(symbolPx, cubePx * 1.2);
        symbols.push({ ...at, type: "perm", size });
      }
      if (n.live) {
        const size = Math.max(symbolPx, cubePx * 1.6);
        symbols.push({ ...at, type: "live", size });
      }
      if (n.kill) symbols.push({ ...at, type: n.kill, size: symbolPx });
      if (n.aur) {
        const s = Math.max(MIN_SYMBOL_PX / 2, 0.12 * scale);
        const ax = x + cubePx + s;
        symbols.push({ ...at, type: "aur", x: ax, y: y - cubePx - s, size: s });
      }
      if (n.vset) {
        const s = Math.max(MIN_SYMBOL_PX, 0.16 * scale);
        const vx = x + cubePx + s / 2;
        const vy = y + cubePx + s / 2;
        symbols.push({ ...at, type: "vset", x: vx, y: vy, size: s });
      }
      if (n.label) {
        const lx = x - cubePx - 2;
        labels.push({ ...at, text: n.label, x: lx, size: labelPx });
      }
    }

    const byDepth = (a, b) => a.depth - b.depth;
    bars.sort(byDepth);
    nodes.sort(byDepth);
    symbols.sort(byDepth);
    labels.sort(byDepth);
    return {
      width: size.width,
      height: size.height,
      scale,
      origin,
      planeTransform,
      highlightedDigit: scene.highlightedDigit || null,
      floor: projectFloor(scene, toScreen, flat, quad, scale),
      layers: { shadows, bars, nodes, symbols, labels },
    };
  }

  function projectFloor(scene, toScreen, flat, quad, scale) {
    const lines = [];
    for (let i = 0; i <= 9; i++) {
      const major = i % 3 === 0;
      lines.push({ from: flat(i, 0), to: flat(i, 9), major });
      lines.push({ from: flat(0, i), to: flat(9, i), major });
    }
    const shaded = [];
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        if ((br + bc) % 2 === 1) {
          shaded.push(quad(bc * 3, br * 3, bc * 3 + 3, br * 3 + 3));
        }
      }
    }
    const tiles = [];
    for (const tile of scene.floorTiles || []) {
      const w = 1 / tile.colors.length;
      tile.colors.forEach((color, i) => {
        const x0 = tile.c + i * w;
        tiles.push({ color, points: quad(x0, tile.r, x0 + w, tile.r + 1) });
      });
    }
    const labelPx = Math.max(9, 0.2 * scale);
    const rowLabels = [];
    const colLabels = [];
    for (let i = 0; i < 9; i++) {
      const [rx, ry] = flat(0.16, i + 0.5);
      rowLabels.push({ x: rx, y: ry, text: String(i + 1) });
      const [cx, cy] = flat(i + 0.5, 0.16);
      colLabels.push({ x: cx, y: cy, text: String(i + 1) });
    }
    let edge = null;
    for (const [ex, ey] of [
      [0, 0],
      [9, 0],
      [9, 9],
      [0, 9],
    ]) {
      const bottom = toScreen(ex, ey, 0);
      const top = toScreen(ex, ey, 9);
      const x = (bottom[0] + top[0]) / 2;
      const depth = (bottom[2] + top[2]) / 2;
      if (
        !edge ||
        x < edge.x - 0.5 ||
        (Math.abs(x - edge.x) <= 0.5 && depth < edge.depth)
      ) {
        edge = { x, depth, ex, ey, bottom, top };
      }
    }
    const spacing =
      Math.hypot(edge.top[0] - edge.bottom[0], edge.top[1] - edge.bottom[1]) /
      9;
    const ticks =
      spacing < 8
        ? null
        : {
            from: edge.bottom.slice(0, 2),
            to: edge.top.slice(0, 2),
            size: Math.min(labelPx, spacing * 0.9),
            labels: Array.from({ length: 9 }, (_, i) => {
              const p = toScreen(edge.ex, edge.ey, i + 0.5);
              return { x: p[0] - 4, y: p[1], text: String(i + 1) };
            }),
          };
    return {
      corners: [flat(0, 0), flat(9, 0), flat(9, 9), flat(0, 9)],
      lines,
      shaded,
      tiles,
      labelSize: labelPx,
      rowLabels,
      colLabels,
      ticks,
    };
  }

  const shadeCache = new Map();
  function parseColor(color) {
    const s = String(color).trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) {
        h = [...h].map((ch) => ch + ch).join("");
      }
      if (h.length !== 6 && h.length !== 8) return null;
      const v = (i) => parseInt(h.slice(i, i + 2), 16);
      return [v(0), v(2), v(4), h.length === 8 ? v(6) / 255 : 1];
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (!m) return null;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if (parts.length < 3 || !parts.slice(0, 3).every(Number.isFinite)) {
      return null;
    }
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }
  function shade(color, f) {
    if (f === 1) return color;
    const key = `${color}|${f}`;
    let out = shadeCache.get(key);
    if (out === undefined) {
      const rgb = parseColor(color);
      out = rgb
        ? `rgba(${rgb.slice(0, 3).map((v) => Math.round(v * f))}, ${rgb[3]})`
        : color;
      shadeCache.set(key, out);
    }
    return out;
  }

  function polygon(ctx, points) {
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
  }
  function fillPolygons(ctx, list, color) {
    if (!list.length) return;
    ctx.beginPath();
    for (const points of list) polygon(ctx, points);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawFloor(ctx, floor, colors) {
    const major = colors.gridMajor || colors.grid;
    ctx.globalAlpha = 0.1;
    fillPolygons(ctx, floor.shaded, colors.grid);
    ctx.globalAlpha = 0.5;
    for (const tile of floor.tiles) {
      fillPolygons(ctx, [tile.points], tile.color);
    }
    ctx.lineCap = "butt";
    for (const line of floor.lines) {
      ctx.globalAlpha = line.major ? 0.8 : 0.45;
      ctx.lineWidth = line.major ? 2 : 1;
      ctx.strokeStyle = line.major ? major : colors.grid;
      ctx.beginPath();
      ctx.moveTo(line.from[0], line.from[1]);
      ctx.lineTo(line.to[0], line.to[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = colors.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${floor.labelSize}px ${FONT}`;
    for (const l of floor.rowLabels.concat(floor.colLabels)) {
      ctx.fillText(l.text, l.x, l.y);
    }
    const ticks = floor.ticks;
    if (!ticks) return;
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = major;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ticks.from[0], ticks.from[1]);
    ctx.lineTo(ticks.to[0], ticks.to[1]);
    ctx.stroke();
    ctx.globalAlpha = 0.75;
    ctx.textAlign = "right";
    ctx.font = `${ticks.size}px ${FONT}`;
    for (const l of ticks.labels) ctx.fillText(l.text, l.x, l.y);
  }

  function barColor(bar, colors) {
    if (bar.saturated) return colors.sat;
    if (bar.kind === "box") {
      return bar.role === "link" ? colors.boxLink : colors.box;
    }
    return colors[bar.kind];
  }

  function drawSymbol(ctx, s, colors) {
    const outline = colors.text;
    ctx.setLineDash([]);
    if (s.type === "external" || s.type === "cannibal") {
      const a = s.size;
      const color = s.type === "cannibal" ? colors.cannibal : colors.kill;
      const width = Math.max(2, a * 0.45);
      ctx.beginPath();
      ctx.moveTo(s.x - a, s.y - a);
      ctx.lineTo(s.x + a, s.y + a);
      ctx.moveTo(s.x - a, s.y + a);
      ctx.lineTo(s.x + a, s.y - a);
      ctx.lineCap = "round";
      ctx.strokeStyle = outline;
      ctx.lineWidth = width + 2;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
      return;
    }
    if (s.type === "live" || s.type === "perm") {
      const color = s.type === "live" ? colors.live : colors.perm;
      const width = Math.max(2, s.size * 0.22);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      const alpha = ctx.globalAlpha;
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha * (s.type === "perm" ? 0.55 : 0.2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = outline;
      ctx.lineWidth = width + 2;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    if (s.type === "aur") {
      ctx.moveTo(s.x, s.y - s.size);
      ctx.lineTo(s.x + s.size, s.y);
      ctx.lineTo(s.x, s.y + s.size);
      ctx.lineTo(s.x - s.size, s.y);
      ctx.closePath();
    } else {
      ctx.rect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = s.type === "aur" ? colors.aur : colors.vset;
    ctx.fill();
  }

  function draw(ctx, projected, colors, view = {}) {
    const k = view.dpr || 1;
    const alpha = view.faint ? EXPORT_ALPHA : SCREEN_ALPHA;
    const digit = projected.highlightedDigit;
    const dim = (digits) => (!digit || digits.includes(digit) ? 1 : DIM);
    const visibility =
      typeof view.logicVisibility === "number" ? view.logicVisibility : 100;
    const plateAlpha = Math.min(1, Math.max(0, 1 - visibility / 100));
    const plate = (z) => {
      if (!view.boardTexture || plateAlpha <= 0) return;
      const [a, b, c, d, e, f] = projected.planeTransform(z);
      ctx.setTransform(k * a, k * b, k * c, k * d, k * e, k * f);
      ctx.globalAlpha = plateAlpha;
      ctx.drawImage(view.boardTexture, 0, 0, 9, 9);
      ctx.setTransform(k, 0, 0, k, 0, 0);
    };
    const { layers } = projected;

    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, projected.width, projected.height);
    drawFloor(ctx, projected.floor, colors);
    ctx.globalAlpha = 0.22;
    fillPolygons(ctx, layers.shadows, colors.node);
    if (view.boardBottom) plate(0);

    ctx.lineJoin = "round";
    for (const bar of layers.bars) {
      const level = dim(bar.digits);
      const color = barColor(bar, colors);
      if (bar.halo) {
        ctx.globalAlpha = 0.35 * level;
        fillPolygons(ctx, bar.halo.map((f) => f.points), colors.pending);
      }
      if (bar.role === "truth") {
        ctx.globalAlpha = alpha.truth * level;
        for (const face of bar.faces) {
          fillPolygons(ctx, [face.points], shade(color, face.shade));
        }
        continue;
      }
      ctx.globalAlpha = alpha.linkFill * level;
      for (const face of bar.faces) {
        fillPolygons(ctx, [face.points], shade(color, face.shade));
      }
      ctx.globalAlpha = alpha.linkStroke * level;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const face of bar.faces) polygon(ctx, face.points);
      ctx.stroke();
    }

    for (const item of layers.nodes) {
      const level = dim([item.n]);
      ctx.globalAlpha = level;
      const color = item.color || colors.node;
      for (const face of item.faces) {
        if (item.stripes && face.axis === 2) continue;
        fillPolygons(ctx, [face.points], shade(color, face.shade));
      }
      for (const stripe of item.stripes || []) {
        fillPolygons(ctx, [stripe.points], stripe.color);
      }
      ctx.strokeStyle = shade(color, 0.6);
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (const face of item.faces) polygon(ctx, face.points);
      ctx.stroke();
    }

    for (const s of layers.symbols) {
      ctx.globalAlpha = dim([s.n]);
      drawSymbol(ctx, s, colors);
    }

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = colors.bg;
    ctx.fillStyle = colors.text;
    for (const l of layers.labels) {
      ctx.globalAlpha = dim([l.n]);
      ctx.font = `600 ${l.size}px ${FONT}`;
      ctx.lineWidth = Math.max(2.5, l.size * 0.25);
      ctx.strokeText(l.text, l.x, l.y);
      ctx.fillText(l.text, l.x, l.y);
    }

    if (!view.boardBottom) plate(9);
    ctx.restore();
  }

  function render(canvas, model, view) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = view.dpr || 1;
    const pw = Math.max(1, Math.round(width * dpr));
    const ph = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    const scene = buildScene(model, { nodeLabels: !!view.nodeLabels });
    const projected = project(scene, view, { width, height });
    draw(canvas.getContext("2d"), projected, view.colors, {
      ...view,
      dpr: pw / width,
    });
  }

  // The 2D image copy rules: light colours, no permutation, selection halo or
  // digit highlight.
  function exportCanvas(model, view, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const exportColors = (list) =>
      (list || []).map((m) => ({ ...m, colors: m.exportColors || m.colors }));
    const plain = {
      ...model,
      sets: (model.sets || []).map((set) => ({ ...set, selected: false })),
      perm: [],
      highlightedDigit: null,
      alsCells: exportColors(model.alsCells),
      alsCands: exportColors(model.alsCands),
    };
    const colors = {
      ...TLGRenderer.EXPORT_COLORS,
      perm: TLGRenderer.EXPORT_COLORS.cell,
      pending: TLGRenderer.EXPORT_COLORS.sat,
      bg: "#ffffff",
      grid: "#9ca3af",
      gridMajor: "#111827",
      text: "#111827",
      dark: false,
    };
    const scene = buildScene(plain, { nodeLabels: !!view.nodeLabels });
    const projected = project(scene, view, { width: size, height: size });
    draw(canvas.getContext("2d"), projected, colors, {
      ...view,
      dpr: 1,
      faint: true,
    });
    return canvas;
  }

  function attach(canvas, handlers) {
    let drag = null;
    let frame = 0;
    let dx = 0;
    let dy = 0;
    const flush = () => {
      frame = 0;
      if (!dx && !dy) return;
      const current = handlers.get();
      const next = clampAngles(
        current.theta + dy * DRAG_DEG_PER_PX,
        current.phi + dx * DRAG_DEG_PER_PX,
      );
      dx = 0;
      dy = 0;
      handlers.set(next.theta, next.phi);
    };
    const onDown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (error) {}
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const mx = e.clientX - drag.x;
      const my = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(mx, my) < CLICK_SLOP_PX) return;
      drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      dx += mx;
      dy += my;
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const onEnd = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onEnd);
    canvas.addEventListener("pointercancel", onEnd);
    canvas.addEventListener("lostpointercapture", onEnd);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      dx = 0;
      dy = 0;
      if (drag) {
        try {
          canvas.releasePointerCapture(drag.id);
        } catch (error) {}
      }
      drag = null;
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onEnd);
      canvas.removeEventListener("pointercancel", onEnd);
      canvas.removeEventListener("lostpointercapture", onEnd);
    };
  }

  return {
    buildScene,
    project,
    draw,
    render,
    attach,
    exportCanvas,
    clampAngles,
    DEFAULT_ANGLES,
  };
})();
