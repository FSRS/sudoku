// --- TLG Renderer: draws Truth/Link sets, marks and result badges in SVG ---
const TLGRenderer = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const BAR_WIDTH = 0.7;
  const RING_INNER = 0.3;
  const CELL_PAD = 1.5;
  // Half-extent of the elimination X: the same 88% of the (scaled) TLG
  // candidate box as the board's own X marker.
  const X_ARM = 1.4;

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, value);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  // The drawing layer positions everything in percent, so a nested viewBox of
  // 0..100 lets path data use the same numbers getCandidateCenter returns.
  function ensureLayer() {
    const svg = document.getElementById("drawing-layer");
    if (!svg) return null;
    let group = document.getElementById("tlg-group");
    if (!group) {
      group = el("g", { id: "tlg-group" }, svg);
    }
    let inner = document.getElementById("tlg-layer");
    if (!inner) {
      inner = el(
        "svg",
        {
          id: "tlg-layer",
          x: 0,
          y: 0,
          width: "100%",
          height: "100%",
          viewBox: "0 0 100 100",
          preserveAspectRatio: "none",
        },
        group,
      );
    }
    return inner;
  }

  function clear() {
    const inner = document.getElementById("tlg-layer");
    if (inner) inner.innerHTML = "";
  }

  function center(cand) {
    return getCandidateCenter(cand.r, cand.c, cand.n);
  }

  function lineData(points) {
    if (points.length === 1) {
      const p = points[0];
      return `M ${p.x} ${p.y} L ${p.x} ${p.y}`;
    }
    const first = points[0];
    const last = points[points.length - 1];
    return `M ${first.x} ${first.y} L ${last.x} ${last.y}`;
  }

  // Box sets: one horizontal run per row of members, joined by a vertical
  // trunk at the column that holds the most members.
  function boxData(points) {
    if (points.length <= 1) return lineData(points);
    const rows = new Map();
    const colCount = new Map();
    for (const p of points) {
      if (!rows.has(p.r)) rows.set(p.r, []);
      rows.get(p.r).push(p);
      colCount.set(p.x, (colCount.get(p.x) || 0) + 1);
    }
    let trunkX = points[0].x;
    let best = -1;
    for (const [x, count] of colCount) {
      if (count > best) {
        best = count;
        trunkX = x;
      }
    }
    const parts = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const run of rows.values()) {
      const xs = run.map((p) => p.x).concat(trunkX);
      const y = run[0].y;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      parts.push(
        `M ${Math.min(...xs)} ${y} L ${Math.max(...xs)} ${y}`,
      );
    }
    parts.push(`M ${trunkX} ${minY} L ${trunkX} ${maxY}`);
    return parts.join(" ");
  }

  function drawSet(layer, defs, set) {
    const points = set.members.map((m) => ({ ...center(m), r: m.r, c: m.c }));
    if (points.length === 0) return;
    const classes = ["tlg-set", `tlg-${set.kind}`, `tlg-${set.role}`];
    if (set.saturated) classes.push("tlg-saturated");
    if (set.selected) classes.push("tlg-selected");

    if (set.kind === "cell") {
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const attrs = {
        x: Math.min(...xs) - CELL_PAD,
        y: Math.min(...ys) - CELL_PAD,
        width: Math.max(...xs) - Math.min(...xs) + CELL_PAD * 2,
        height: Math.max(...ys) - Math.min(...ys) + CELL_PAD * 2,
        rx: 1.2,
        "data-set-id": set.id,
        class: classes.join(" "),
      };
      if (set.selected) {
        el("rect", { ...attrs, class: "tlg-select-outline" }, layer);
      }
      el("rect", attrs, layer);
      return;
    }

    const d = set.kind === "box" ? boxData(points) : lineData(points);
    if (set.selected) {
      el("path", { d, class: "tlg-select-outline" }, layer);
    }
    const attrs = {
      d,
      "data-set-id": set.id,
      class: classes.join(" "),
      "stroke-width": BAR_WIDTH,
    };
    if (set.role === "link") {
      // A hollow bar: the same stroke with its middle masked away. The mask
      // region is given in user units because a straight bar has a degenerate
      // bounding box, which the default objectBoundingBox region collapses to.
      const mask = el(
        "mask",
        {
          id: `tlg-mask-${set.id}`,
          maskUnits: "userSpaceOnUse",
          x: -5,
          y: -5,
          width: 110,
          height: 110,
        },
        defs,
      );
      el(
        "rect",
        { x: -5, y: -5, width: 110, height: 110, fill: "white" },
        mask,
      );
      el(
        "path",
        {
          d,
          stroke: "black",
          fill: "none",
          "stroke-width": RING_INNER,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        },
        mask,
      );
      attrs.mask = `url(#tlg-mask-${set.id})`;
    }
    el("path", attrs, layer);
  }

  /* @edition-slot renderer-001 */
  function drawBadges(layer, model) {
    for (const k of model.kills) {
      const { x, y } = center(k);
      const cls = k.kind === "cannibal" ? "tlg-kill-cannibal" : "tlg-kill-external";
      el(
        "path",
        {
          d: `M ${x - X_ARM} ${y - X_ARM} L ${x + X_ARM} ${y + X_ARM} M ${x - X_ARM} ${y + X_ARM} L ${x + X_ARM} ${y - X_ARM}`,
          class: `tlg-badge tlg-kill-x ${cls}`,
        },
        layer,
      );
    }
    for (const l of model.lives) {
      const { x, y } = center(l);
      el("circle", { cx: x, cy: y, r: 1.6, class: "tlg-badge tlg-live" }, layer);
    }
    if (model.pending) {
      const { x, y } = center(model.pending);
      el("circle", { cx: x, cy: y, r: 1.7, class: "tlg-pending" }, layer);
    }
  }

  function render(model) {
    const layer = ensureLayer();
    if (!layer) return;
    layer.innerHTML = "";
    const defs = el("defs", {}, layer);
    const order = { cell: 0, box: 1, row: 2, col: 2 };
    const sets = [...model.sets].sort(
      (a, b) =>
        (a.role === "link") - (b.role === "link") || order[a.kind] - order[b.kind],
    );
    for (const set of sets) drawSet(layer, defs, set);
    /* @edition-slot renderer-002 */
    drawBadges(layer, model);
  }

  // Image export forces light colors, so these mirror the light --tlg-* values in custom.css.
  const EXPORT_COLORS = {
    row: "#7c3aed",
    col: "#059669",
    box: "#b45309",
    cell: "#0284c7",
    sat: "#111827",
    kill: "#f97316",
    cannibal: "#dc2626",
    live: "#16a34a",
    /* @edition-slot renderer-003 */
  };

  function canvasPath(ctx, points, kind) {
    ctx.beginPath();
    if (kind === "box" && points.length > 1) {
      const rows = new Map();
      const colCount = new Map();
      for (const p of points) {
        if (!rows.has(p.r)) rows.set(p.r, []);
        rows.get(p.r).push(p);
        colCount.set(p.x, (colCount.get(p.x) || 0) + 1);
      }
      let trunkX = points[0].x;
      let best = -1;
      for (const [x, count] of colCount) {
        if (count > best) {
          best = count;
          trunkX = x;
        }
      }
      let minY = Infinity;
      let maxY = -Infinity;
      for (const run of rows.values()) {
        const xs = run.map((p) => p.x).concat(trunkX);
        const y = run[0].y;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        ctx.moveTo(Math.min(...xs), y);
        ctx.lineTo(Math.max(...xs), y);
      }
      ctx.moveTo(trunkX, minY);
      ctx.lineTo(trunkX, maxY);
      return;
    }
    const first = points[0];
    const last = points[points.length - 1];
    ctx.moveTo(first.x, first.y);
    ctx.lineTo(last.x, last.y);
  }

  function renderCanvasSets(ctx, model, coord, unit) {
    const order = { cell: 0, box: 1, row: 2, col: 2 };
    const sets = [...model.sets].sort(
      (a, b) =>
        (a.role === "link") - (b.role === "link") || order[a.kind] - order[b.kind],
    );
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const set of sets) {
      const points = set.members.map((m) => ({ ...coord(m), r: m.r, c: m.c }));
      if (points.length === 0) continue;
      const color = set.saturated ? EXPORT_COLORS.sat : EXPORT_COLORS[set.kind];
      if (set.kind === "cell") {
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const pad = CELL_PAD * unit;
        ctx.beginPath();
        ctx.roundRect(
          Math.min(...xs) - pad,
          Math.min(...ys) - pad,
          Math.max(...xs) - Math.min(...xs) + pad * 2,
          Math.max(...ys) - Math.min(...ys) + pad * 2,
          1.2 * unit,
        );
        if (set.role === "truth") {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = color;
          ctx.fill();
        } else {
          ctx.globalAlpha = 1;
          ctx.lineWidth = 0.45 * unit;
          ctx.strokeStyle = color;
          ctx.stroke();
        }
        continue;
      }
      if (set.role === "truth") {
        canvasPath(ctx, points, set.kind);
        ctx.lineWidth = BAR_WIDTH * unit;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        continue;
      }
      // Hollow link: the inner stroke is cut out of the outer one on a scratch
      // canvas so the grid and colors beneath stay visible, as the SVG mask does.
      const scratch = document.createElement("canvas");
      scratch.width = ctx.canvas.width;
      scratch.height = ctx.canvas.height;
      const sctx = scratch.getContext("2d");
      sctx.lineCap = "round";
      sctx.lineJoin = "round";
      canvasPath(sctx, points, set.kind);
      sctx.lineWidth = BAR_WIDTH * unit;
      sctx.strokeStyle = color;
      sctx.stroke();
      sctx.globalCompositeOperation = "destination-out";
      sctx.lineWidth = RING_INNER * unit;
      sctx.stroke();
      ctx.globalAlpha = 0.95;
      ctx.drawImage(scratch, 0, 0);
    }
    ctx.restore();
  }

  function renderCanvasBadges(ctx, model, coord, unit) {
    ctx.save();
    ctx.lineCap = "round";
    /* @edition-slot renderer-004 */
    for (const k of model.kills) {
      const { x, y } = coord(k);
      ctx.strokeStyle = k.kind === "cannibal" ? EXPORT_COLORS.cannibal : EXPORT_COLORS.kill;
      ctx.lineWidth = 0.45 * unit;
      const arm = X_ARM * unit;
      ctx.beginPath();
      ctx.moveTo(x - arm, y - arm);
      ctx.lineTo(x + arm, y + arm);
      ctx.moveTo(x - arm, y + arm);
      ctx.lineTo(x + arm, y - arm);
      ctx.stroke();
    }
    for (const l of model.lives) {
      const { x, y } = coord(l);
      ctx.beginPath();
      ctx.arc(x, y, 1.6 * unit, 0, Math.PI * 2);
      ctx.fillStyle = EXPORT_COLORS.live;
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.45 * unit;
      ctx.strokeStyle = EXPORT_COLORS.live;
      ctx.stroke();
    }
    ctx.restore();
  }
  return { render, clear, renderCanvasSets, renderCanvasBadges };
})();
