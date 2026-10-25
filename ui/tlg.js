// --- TLG: manual Truth/Link logic editor (state, editing, worker, panel) ---
const TLG = (() => {
  const DEBOUNCE_MS = 150;
  const BLACK_RANK0_KEY = "sudokuTlgBlackRank0";
  const ROLES = ["truth", "link", "aur", "vset"];
  const KIND_LETTER = { row: "r", col: "c", box: "b" };
  const PERM_LIMIT = 1000;
  const HIGHLIGHT_ALS_KEY = "sudokuTlgHighlightAls";
  // Touch-only devices have no right-click, so they get the set-menu toggle.
  const touchOnly = () =>
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  const PANEL_HTML = [
    '<div class="tlg-row">',
    '<button type="button" id="tlg-role-truth" class="tlg-btn tlg-role" aria-pressed="true" data-i18n="tlg_role_truth">Truth</button>',
    '<button type="button" id="tlg-role-link" class="tlg-btn tlg-role" aria-pressed="false" data-i18n="tlg_role_link">Link</button>',
    '<button type="button" id="tlg-role-aur" class="tlg-btn tlg-role" aria-pressed="false" data-i18n="tlg_role_aur">AUR</button>',
    '<button type="button" id="tlg-role-vset" class="tlg-btn tlg-role" aria-pressed="false" data-i18n="tlg_role_vset">Virtual Set</button>',
    "</div>",
    '<div class="tlg-row">',
    '<select id="tlg-kind" class="tlg-select">',
    '<option value="auto" data-i18n="tlg_kind_auto">Auto</option>',
    '<option value="row" data-i18n="tlg_kind_row">Row</option>',
    '<option value="col" data-i18n="tlg_kind_col">Column</option>',
    '<option value="box" data-i18n="tlg_kind_box">Box</option>',
    '<option value="cell" data-i18n="tlg_kind_cell">Cell</option>',
    "</select>",
    '<button type="button" id="tlg-menu-toggle" class="tlg-btn hidden" aria-pressed="false" data-i18n="tlg_menu_toggle">Set menu</button>',
    '<button type="button" id="tlg-undo" class="tlg-btn" data-i18n="btn_undo">Undo</button>',
    '<button type="button" id="tlg-redo" class="tlg-btn" data-i18n="btn_redo">Redo</button>',
    '<button type="button" id="tlg-cancel" class="tlg-btn" data-i18n="tlg_cancel">Cancel</button>',
    '<button type="button" id="tlg-reevaluate" class="tlg-btn" data-i18n="tlg_reevaluate">Re-evaluate</button>',
    '<button type="button" id="tlg-remove-unused" class="tlg-btn" data-i18n="tlg_remove_unused">Remove unused links</button>',
    '<button type="button" id="tlg-clear-all" class="tlg-btn tlg-danger" data-i18n="tlg_clear_all">Clear all</button>',
    "</div>",
    '<div class="tlg-summary-row">',
    '<span id="tlg-summary" class="tlg-summary"></span>',
    '<span id="tlg-perm-stepper" class="tlg-stepper hidden">',
    '<button type="button" id="tlg-perm-prev" class="tlg-btn tlg-step" aria-label="previous permutation">\u25c0</button>',
    '<span id="tlg-perm-label" class="tlg-summary"></span>',
    '<button type="button" id="tlg-perm-next" class="tlg-btn tlg-step" aria-label="next permutation">\u25b6</button>',
    "</span>",
    "</div>",
    '<div id="tlg-status" class="tlg-status"></div>',
    '<div class="tlg-results">',
    '<div><div class="tlg-heading" data-i18n="tlg_kills_title">Eliminations</div><ul id="tlg-kills" class="tlg-list"></ul></div>',
    '<div><div class="tlg-heading" data-i18n="tlg_lives_title">Placements</div><ul id="tlg-lives" class="tlg-list"></ul></div>',
    "</div>",
    '<button type="button" id="tlg-apply" class="tlg-btn tlg-primary" data-i18n="tlg_apply">Apply result</button>',
    '<div class="tlg-section hidden" id="tlg-aur-section">',
    '<span class="tlg-heading" data-i18n="tlg_aur_title">AUR</span>',
    '<span id="tlg-aur-info"></span>',
    '<label class="tlg-check"><input type="checkbox" id="tlg-aur-apply" /><span data-i18n="tlg_aur_apply">Apply AURs</span></label>',
    '<button type="button" id="tlg-aur-clear" class="tlg-btn" data-i18n="tlg_aur_clear">Clear corners</button>',
    '<span id="tlg-aur-reason" class="tlg-reason"></span>',
    "</div>",
    '<div class="tlg-section hidden" id="tlg-vset-section">',
    '<span class="tlg-heading" data-i18n="tlg_vset_title">Virtual Set</span>',
    '<span id="tlg-vset-info"></span>',
    '<label class="tlg-check"><input type="checkbox" id="tlg-vset-apply" /><span data-i18n="tlg_vset_apply">Apply to logic</span></label>',
    '<label class="tlg-check"><span data-i18n="tlg_vset_count_label">No. of Truths</span>',
    '<select id="tlg-vset-count" class="tlg-select"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>',
    "</label>",
    '<button type="button" id="tlg-vset-clear" class="tlg-btn" data-i18n="tlg_vset_clear">Clear set</button>',
    "</div>",
    /* @edition-slot editor-004 */
    '<div class="tlg-section">',
    '<label class="tlg-check"><input type="checkbox" id="tlg-als-highlight" /><span data-i18n="tlg_als_highlight">Highlight ALS and AHS</span></label>',
    "</div>",
    '<div class="tlg-section">',
    '<label class="tlg-check"><input type="checkbox" id="tlg-black-rank0" /><span data-i18n="tlg_black_rank0">Black Rank 0 Links</span></label>',
    "</div>",
    '<div class="tlg-section">',
    '<span class="tlg-heading" data-i18n="tlg_sets_title">Sets</span>',
    '<span id="tlg-set-summary" class="tlg-set-summary"></span>',
    '<ul id="tlg-set-list" class="tlg-list tlg-set-list"></ul>',
    "</div>",
  ].join("");

  function emptyState() {
    const st = {
      sets: [],
      nextId: 1,
      aurMarks: [],
      vset: [],
      vapply: false,
      vcount: 1,
      options: { applyAur: false },
    };
    /* @edition-slot editor-005 */
    return st;
  }

  let state = emptyState();
  let solverOn = false;
  let solverStepIndex = -1;

  let role = "truth";
  let kind = "auto";
  let menuMode = false;
  let pending = null;
  let selectedSetId = null;
  // The reference's LogicView > Black Rank 0 Links: a stored display option, off by default.
  let blackRank0 = false;
  let lastMenuOpenAt = 0;
  let lastMenuCand = null;

  let worker = null;
  let workerPromise = null;
  let nextRequestId = 1;
  let pendingRequestId = 0;
  let debounceTimer = null;
  let result = null;
  let status = "idle";
  let errorText = "";
  let permIndex = -1;
  let highlightAls = false;
  let removeRequestId = 0;
  let removeSnapshot = "";

  const $ = (id) => document.getElementById(id);
  const candKey = (cand) => cand.r * 81 + cand.c * 9 + (cand.n - 1);
  const candOf = (key) => ({
    r: Math.floor(key / 81),
    c: Math.floor((key % 81) / 9),
    n: (key % 9) + 1,
  });
  const boxOf = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);
  const rc = (cand) => `r${cand.r + 1}c${cand.c + 1}`;
  const sameCand = (a, b) => a.r === b.r && a.c === b.c && a.n === b.n;
  const candExists = (cand) => {
    const cell = boardState[cand.r][cand.c];
    return cell.value === 0 && cell.pencils.has(cand.n);
  };

  function isActive() {
    return isSolverMode ? solverOn : currentMode === "tlg";
  }

  function uniqueSolution() {
    return (
      !onlyOneCellTarget &&
      !!initialPuzzleString &&
      getPuzzleValidation(initialPuzzleString).mode === "standard"
    );
  }

  // --- Sets ---------------------------------------------------------------

  function setKey(set) {
    return set.kind === "cell"
      ? `${set.role}:cell:${set.cell}`
      : `${set.role}:${set.kind}:${set.index}:${set.digit}`;
  }

  function houseCells(set) {
    const cells = [];
    for (let i = 0; i < 9; i++) {
      if (set.kind === "row") cells.push([set.index, i]);
      else if (set.kind === "col") cells.push([i, set.index]);
      else {
        cells.push([
          Math.floor(set.index / 3) * 3 + Math.floor(i / 3),
          (set.index % 3) * 3 + (i % 3),
        ]);
      }
    }
    return cells;
  }

  function membersOf(set) {
    const members = [];
    if (set.kind === "cell") {
      const r = Math.floor(set.cell / 9);
      const c = set.cell % 9;
      const cell = boardState[r][c];
      if (cell.value === 0) {
        for (const n of [...cell.pencils].sort((a, b) => a - b)) {
          members.push({ r, c, n });
        }
      }
      return members;
    }
    for (const [r, c] of houseCells(set)) {
      const cell = boardState[r][c];
      if (cell.value === 0 && cell.pencils.has(set.digit)) {
        members.push({ r, c, n: set.digit });
      }
    }
    return members;
  }

  function isSatisfied(set) {
    if (set.kind === "cell") {
      return boardState[Math.floor(set.cell / 9)][set.cell % 9].value !== 0;
    }
    return houseCells(set).some(
      ([r, c]) => boardState[r][c].value === set.digit,
    );
  }

  // Set notation: digit first, lowercase r/c/b; cell sets as <row>n<col>.
  function formatSet(set) {
    if (set.kind === "cell") {
      return `${Math.floor(set.cell / 9) + 1}n${(set.cell % 9) + 1}`;
    }
    return `${set.digit}${KIND_LETTER[set.kind]}${set.index + 1}`;
  }

  function formatSetGroup(sets) {
    const groups = new Map();
    for (const set of sets) {
      const key =
        set.kind === "cell"
          ? `n${(set.cell % 9) + 1}`
          : `${KIND_LETTER[set.kind]}${set.index + 1}`;
      const head = set.kind === "cell" ? Math.floor(set.cell / 9) + 1 : set.digit;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(head);
    }
    return [...groups]
      .map(([key, heads]) => `${heads.sort((a, b) => a - b).join("")}${key}`)
      .join(" ");
  }

  function roleLabel(setRole) {
    return setRole === "truth" ? t("tlg_role_truth") : t("tlg_role_link");
  }

  const sameSet = (a, b) =>
    a.kind === b.kind &&
    (a.kind === "cell" ? a.cell === b.cell : a.index === b.index && a.digit === b.digit);

  function toggleSet(set) {
    const key = setKey(set);
    const index = state.sets.findIndex((s) => setKey(s) === key);
    if (index >= 0) {
      const [removed] = state.sets.splice(index, 1);
      if (selectedSetId === removed.id) selectedSetId = null;
      showMessage(
        t("tlg_set_removed", formatSet(removed), roleLabel(removed.role)),
        "gray",
      );
    } else {
      // A set holds one role: the other role is replaced, not kept alongside.
      const other = state.sets.findIndex((s) => sameSet(s, set));
      if (other >= 0) state.sets.splice(other, 1);
      state.sets.push({ ...set, id: state.nextId++ });
      showMessage(t("tlg_set_added", formatSet(set), roleLabel(set.role)), "gray");
    }
    cleanSets();
    commit();
  }

  // After every set edit, like the reference: sets with no candidates go, and
  // links that touch no truth candidate go.
  function cleanSets() {
    const truthCands = new Set();
    for (const key of state.vset) truthCands.add(key);
    for (const s of state.sets) {
      if (s.role === "truth") for (const m of membersOf(s)) truthCands.add(candKey(m));
    }
    let droppedLinks = 0;
    state.sets = state.sets.filter((s) => {
      const members = membersOf(s);
      if (members.length === 0) return false;
      if (s.role === "link" && !members.some((m) => truthCands.has(candKey(m)))) {
        droppedLinks += 1;
        return false;
      }
      return true;
    });
    if (!state.sets.some((s) => s.id === selectedSetId)) selectedSetId = null;
    if (droppedLinks) showMessage(t("tlg_links_cleaned", droppedLinks), "gray");
  }

  function setFor(setRole, setKind, cand) {
    if (setKind === "cell") {
      return { role: setRole, kind: "cell", cell: cand.r * 9 + cand.c };
    }
    const index =
      setKind === "row" ? cand.r : setKind === "col" ? cand.c : boxOf(cand.r, cand.c);
    return { role: setRole, kind: setKind, index, digit: cand.n };
  }

  function defineSet(a, b) {
    const sameCell = a.r === b.r && a.c === b.c;
    const sameDigit = a.n === b.n;
    const fits = {
      cell: sameCell && !sameDigit,
      row: sameDigit && a.r === b.r && !sameCell,
      col: sameDigit && a.c === b.c && !sameCell,
      box: sameDigit && boxOf(a.r, a.c) === boxOf(b.r, b.c) && !sameCell,
    };
    let chosen = kind;
    if (kind === "auto") {
      chosen = ["cell", "row", "col", "box"].find((k) => fits[k]) || null;
      if (chosen && chosen !== "cell" && chosen !== "box" && fits.box) {
        showMessage(t("tlg_box_hint"), "orange");
      }
    } else if (!fits[kind]) {
      chosen = null;
    }
    if (!chosen) {
      showMessage(
        t("tlg_invalid_pair", t(`tlg_kind_${kind === "auto" ? "auto" : kind}`)),
        "red",
      );
      return;
    }
    toggleSet(setFor(role, chosen, a));
  }

  // --- Candidate input ----------------------------------------------------

  function toggleIn(list, cand) {
    const key = candKey(cand);
    const index = list.indexOf(key);
    if (index >= 0) list.splice(index, 1);
    else list.push(key);
  }

  function handleCandidate(cand) {
    if (role === "aur") {
      toggleIn(state.aurMarks, cand);
      commit();
      return;
    }
    if (role === "vset") {
      toggleIn(state.vset, cand);
      commit();
      return;
    }
    if (!pending) {
      pending = cand;
      showMessage(t("tlg_pick_second", `(${cand.n})${rc(cand)}`), "gray");
      renderLayer();
    } else {
      const first = pending;
      pending = null;
      if (!sameCand(first, cand)) defineSet(first, cand);
      else renderLayer();
    }
  }

  function cancelPending() {
    const had = pending !== null;
    pending = null;
    if (had) renderLayer();
    return had;
  }

  function handleGridEvent(e) {
    const mark = e.target.closest(".pencil-mark");
    const cell = e.target.closest(".sudoku-cell");
    if (!cell) return;
    const visible = mark && mark.style.visibility !== "hidden";
    if (e.type === "contextmenu") {
      if (visible) {
        const cand = markCand(cell, mark);
        openMenu(cand, e);
        // openMenu resets these through closeMenu, so set them afterwards.
        lastMenuCand = cand;
        lastMenuOpenAt = Date.now();
      }
      return;
    }
    if (!visible) {
      closeMenu();
      cancelPending();
      if (!isSolverMode) handleCellClick({ target: cell });
      return;
    }
    const cand = markCand(cell, mark);
    // The tap that opened a long-press menu also arrives as a click.
    if (lastMenuCand && sameCand(cand, lastMenuCand) && Date.now() - lastMenuOpenAt < 700) {
      return;
    }
    if (menuMode) {
      openMenu(cand, e);
      return;
    }
    closeMenu();
    handleCandidate(cand);
  }

  function markCand(cell, mark) {
    return {
      r: parseInt(cell.dataset.row),
      c: parseInt(cell.dataset.col),
      n: parseInt(mark.dataset.num),
    };
  }

  // Letters that would act on controls the editor hides.
  const BLOCKED_PLAY_KEYS = ["z", "x", "c", "v", "a", "e", "q", "w", "t"];

  function handleKey(e) {
    if (!isActive()) return false;
    const lower = e.key.toLowerCase();
    if (e.key === "Escape") {
      if ($("tlg-cand-menu")) {
        closeMenu();
        return true;
      }
      return cancelPending();
    }
    if (e.ctrlKey || e.metaKey) {
      if (!e.shiftKey && (lower === "z" || lower === "y")) {
        stepEdits(lower === "z");
        return true;
      }
      return false;
    }
    if (e.key >= "1" && e.key <= "9") {
      toggleDigitHighlight(parseInt(e.key));
      return true;
    }
    if (e.key === "Delete" || e.key === "Backspace") return true;
    if (isSolverMode) return lower === "a";
    return !e.altKey && BLOCKED_PLAY_KEYS.includes(lower);
  }

  function toggleDigitHighlight(n) {
    if (highlightState === 1 && highlightedDigit === n) {
      highlightedDigit = null;
      highlightState = 0;
    } else {
      highlightedDigit = n;
      highlightState = 1;
    }
    renderBoard();
  }

  // --- Candidate menu -----------------------------------------------------

  function closeMenu() {
    const menu = $("tlg-cand-menu");
    if (menu) menu.remove();
    lastMenuCand = null;
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  }

  function onDocumentPointerDown(e) {
    const menu = $("tlg-cand-menu");
    if (menu && !menu.contains(e.target)) closeMenu();
  }

  function openMenu(cand, e) {
    closeMenu();
    const menu = document.createElement("div");
    menu.id = "tlg-cand-menu";
    menu.className = "tlg-menu";
    const title = document.createElement("div");
    title.className = "tlg-menu-title";
    title.textContent = `(${cand.n})${rc(cand)}`;
    menu.appendChild(title);
    for (const menuRole of ["truth", "link"]) {
      const row = document.createElement("div");
      row.className = "tlg-menu-row";
      row.dataset.role = menuRole;
      const label = document.createElement("span");
      label.textContent = roleLabel(menuRole);
      row.appendChild(label);
      for (const menuKind of ["row", "col", "box", "cell"]) {
        const set = setFor(menuRole, menuKind, cand);
        const exists = state.sets.some((s) => setKey(s) === setKey(set));
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tlg-menu-btn";
        btn.dataset.kind = menuKind;
        btn.setAttribute("aria-pressed", exists ? "true" : "false");
        btn.textContent = `${exists ? "✓ " : ""}${t(`tlg_kind_${menuKind}`)}`;
        btn.addEventListener("click", () => {
          closeMenu();
          pending = null;
          toggleSet(set);
        });
        row.appendChild(btn);
      }
      menu.appendChild(row);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "tlg-menu-btn tlg-menu-close";
    close.textContent = t("tlg_menu_close");
    close.addEventListener("click", closeMenu);
    menu.appendChild(close);
    document.body.appendChild(menu);

    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const x = Math.min(Math.max(8, e.clientX), window.innerWidth - width - 8);
    const y = Math.min(Math.max(8, e.clientY), window.innerHeight - height - 8);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    setTimeout(() => {
      document.addEventListener("pointerdown", onDocumentPointerDown, true);
    }, 0);
  }

  // --- Evaluation (worker) ------------------------------------------------

  function hasLogic() {
    if (state.vapply && state.vset.length > 0) return true;
    return state.sets.length > 0;
  }

  function buildWorker() {
    return Promise.resolve(new Worker("sudoku/sudoku_tlg_worker.js"));
  }

  function getWorker() {
    if (workerPromise) return workerPromise;
    if (typeof Worker === "undefined") return Promise.resolve(null);
    workerPromise = buildWorker()
      .then((created) => {
        worker = created;
        created.onmessage = ({ data }) => {
          if (!data) return;
          if (data.id === removeRequestId) {
            removeRequestId = 0;
            finishRemoveUnused(data);
            return;
          }
          if (data.id !== pendingRequestId) return;
          pendingRequestId = 0;
          if (data.error) {
            status = "error";
            errorText = data.error;
          } else {
            status = "done";
            result = data.result;
          }
          renderAll();
        };
        created.onerror = (event) => {
          const message = event.message || "worker error";
          dropWorker();
          if (status === "pending") {
            status = "error";
            errorText = message;
            renderAll();
          }
        };
        return created;
      })
      .catch((error) => {
        console.warn("TLG worker could not start.", error);
        workerPromise = null;
        return null;
      });
    return workerPromise;
  }

  function dropWorker() {
    if (worker) {
      try {
        worker.terminate();
      } catch (error) {
        console.warn("TLG worker did not terminate.", error);
      }
    }
    worker = null;
    workerPromise = null;
    pendingRequestId = 0;
    removeRequestId = 0;
  }

  function cancel(terminate = false) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    pendingRequestId = 0;
    if (terminate) dropWorker();
    result = null;
    status = "idle";
  }

  function invalidate() {
    pendingRequestId = 0;
    permIndex = -1;
    result = null;
    status = hasLogic() ? "pending" : "idle";
  }

  function scheduleEvaluate() {
    invalidate();
    renderAll();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runEvaluate, DEBOUNCE_MS);
  }

  function runEvaluate() {
    debounceTimer = null;
    if (!isActive() || !hasLogic()) {
      status = "idle";
      renderPanel();
      return;
    }
    const id = nextRequestId++;
    pendingRequestId = id;
    status = "pending";
    renderPanel();
    const input = buildInput();
    getWorker().then((w) => {
      if (pendingRequestId !== id) return;
      try {
        if (!w) throw new Error("no worker");
        w.postMessage({ id, input });
      } catch (error) {
        pendingRequestId = 0;
        status = "error";
        errorText = String(error);
        renderPanel();
      }
    });
  }

  // The reference rebuilds a drawn path's Truths and Links in ascending set
  // order; the permutation order and Remove Unused Links depend on it.
  const SET_BASE = { row: 0, col: 81, cell: 162, box: 243 };
  const setOrder = (s) =>
    SET_BASE[s.kind] + (s.kind === "cell" ? s.cell : s.index * 9 + s.digit - 1);
  function drawnSets(role) {
    return state.sets
      .filter((s) => s.role === role)
      .sort((a, b) => setOrder(a) - setOrder(b));
  }

  function setDescriptor(set) {
    return set.kind === "cell"
      ? { kind: "cell", cell: set.cell }
      : { kind: set.kind, index: set.index, digit: set.digit };
  }

  function buildInput() {
    const values = [];
    const candidates = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = boardState[r][c];
        values.push(cell.value);
        let mask = 0;
        if (cell.value === 0) {
          for (const n of cell.pencils) mask |= 1 << (n - 1);
        }
        candidates.push(mask);
      }
    }
    const unique = uniqueSolution();
    return {
      values,
      candidates,
      truths: drawnSets("truth").map(setDescriptor),
      links: drawnSets("link").map(setDescriptor),
      aurMarks: [...state.aurMarks],
      vset: [...state.vset],
      vapply: state.vapply,
      vcount: state.vcount,
      options: {
        applyAur: state.options.applyAur && unique,
        highlightAls,
        /* @edition-slot editor-014 */
        uniqueSolution: unique,
      },
      wantPerms: PERM_LIMIT,
    };
  }

  function usableResult() {
    return status === "done" && result && result.nperm > 0
      ? result
      : null;
  }

  function canApply() {
    const r = usableResult();
    return (
      !!r &&
      !isSolverMode &&
      (r.kills.length > 0 || r.lives.length > 0)
    );
  }

  function applyResult() {
    if (!canApply()) return;
    const r = usableResult();
    for (const kill of r.kills) {
      const cand = candOf(kill.cand);
      boardState[cand.r][cand.c].pencils.delete(cand.n);
    }
    for (const key of r.lives) {
      const cand = candOf(key);
      const cell = boardState[cand.r][cand.c];
      if (cell.isGiven || cell.value !== 0) continue;
      cell.value = cand.n;
      cell.pencils.clear();
      autoEliminatePencils(cand.r, cand.c, cand.n);
    }
    if (!timerInterval) startTimer(currentElapsedTime);
    showMessage(t("tlg_applied", r.kills.length, r.lives.length), "green");
    saveState();
    onBoardUpdated();
    checkCompletion();
  }

  // The drawing is scratch work with its own undo stack; only applying a
  // result goes through the board history.
  function commit() {
    closeMenu();
    recordEdit();
    scheduleEvaluate();
  }

  let edits = { undo: [], redo: [], current: "" };

  function snapshot() {
    const data = serialize(state);
    return data ? JSON.stringify(data) : "";
  }

  function resetEdits() {
    edits = { undo: [], redo: [], current: snapshot() };
  }

  function recordEdit() {
    const now = snapshot();
    if (now === edits.current) return;
    edits.undo.push(edits.current);
    edits.redo = [];
    edits.current = now;
  }

  function stepEdits(back) {
    const from = back ? edits.undo : edits.redo;
    const to = back ? edits.redo : edits.undo;
    if (from.length === 0) return;
    to.push(edits.current);
    edits.current = from.pop();
    state = edits.current ? parseSaved(JSON.parse(edits.current)) : emptyState();
    selectedSetId = null;
    resetInputState();
    scheduleEvaluate();
  }

  // --- Rendering ----------------------------------------------------------

  // linkInfo follows the order the links were sent in (drawnSets).
  function saturatedLinks(r) {
    const saturated = new Set();
    if (!r) return saturated;
    const links = drawnSets("link");
    r.linkInfo.forEach((info, i) => {
      if (info.saturated && links[i]) saturated.add(links[i].id);
    });
    return saturated;
  }

  // The reference's LogicView > Highlight ALS and AHS: the classifier numbers
  // the ALS/AHS of its best ALS cover from 1. The colours follow the solver
  // hints: one palette slot per ALS/AHS in that order, an ALS fills its cells,
  // an AHS colours its digits, and overlaps are striped.
  const ALS_COLOR_CODES = [6, 7, 2, 3, 4, 1, 8];
  const alsSlot = (index) => ALS_COLOR_CODES[(index - 1) % ALS_COLOR_CODES.length];
  function alsOfSet(r, set) {
    const index = r && r.als ? r.als.sets[setOrder(set)] : 0;
    return index ? cellColorPalette[alsSlot(index)] : null;
  }
  function setFromNumber(s) {
    if (s >= SET_BASE.cell && s < SET_BASE.box) {
      return { kind: "cell", cell: s - SET_BASE.cell };
    }
    const kind = s < SET_BASE.col ? "row" : s < SET_BASE.cell ? "col" : "box";
    const offset = s - SET_BASE[kind];
    return { kind, index: Math.floor(offset / 9), digit: (offset % 9) + 1 };
  }
  function alsVisuals(r) {
    const cells = new Map();
    const cands = new Map();
    const add = (map, key, item, color, exportColor) => {
      const entry = map.get(key) || { ...item, colors: [], exportColors: [] };
      entry.colors.push(color);
      entry.exportColors.push(exportColor);
      map.set(key, entry);
    };
    const colored = r && r.als
      ? r.als.sets.map((index, s) => [index, s]).filter(([index]) => index > 0)
      : [];
    colored.sort((a, b) => a[0] - b[0]);
    for (const [index, s] of colored) {
      const slot = alsSlot(index);
      const set = setFromNumber(s);
      if (set.kind === "cell") {
        const cell = { r: Math.floor(set.cell / 9), c: set.cell % 9 };
        add(cells, set.cell, cell, cellColorPalette[slot], colorPalette300[slot]);
        continue;
      }
      for (const m of membersOf(set)) {
        add(cands, candKey(m), m, candidateColorPalette[slot], colorPalette600[slot]);
      }
    }
    return { alsCells: [...cells.values()], alsCands: [...cands.values()] };
  }
  function buildModel() {
    const r = usableResult();
    const saturated = saturatedLinks(r);
    // A link is drawn only through its Truth candidates and eliminations.
    const shown = new Set();
    for (const key of state.vset) shown.add(key);
    for (const s of state.sets) {
      if (s.role === "truth") for (const m of membersOf(s)) shown.add(candKey(m));
    }
    if (r) for (const k of r.kills) shown.add(k.cand);
    return {
      sets: state.sets.map((set) => ({
        id: set.id,
        role: set.role,
        kind: set.kind,
        members:
          set.role === "link"
            ? membersOf(set).filter((m) => shown.has(candKey(m)))
            : membersOf(set),
        saturated: blackRank0 && saturated.has(set.id),
        selected: set.id === selectedSetId,
      })),
      aurMarks: state.aurMarks.map(candOf).filter(candExists),
      vset: state.vset.map(candOf).filter(candExists),
      ...alsVisuals(r),
      kills: r ? r.kills.map((k) => ({ ...candOf(k.cand), kind: k.kind })) : [],
      lives: r ? r.lives.map(candOf) : [],
      perm:
        r && r.perms && r.perms[permIndex]
          ? r.perms[permIndex].map(candOf)
          : [],
      pending,
    };
  }

  // The slot offsets come from candidateSlotPoint so the board, the SVG layer
  // and the image export share one layout.
  function ensureSkewStyle() {
    if ($("tlg-skew-style")) return;
    const rules = [];
    for (let slot = 0; slot < 9; slot++) {
      const to = candidateSlotPoint(slot, true);
      const from = candidateSlotPoint(slot, false);
      const dx = ((to.x - from.x) * 300).toFixed(2);
      const dy = ((to.y - from.y) * 300).toFixed(2);
      rules.push(
        `.tlg-active .pencil-mark[data-index="${slot}"] { transform: translate(${dx}%, ${dy}%) scale(${TLG_CANDIDATE_SCALE}); }`,
      );
    }
    const style = document.createElement("style");
    style.id = "tlg-skew-style";
    style.textContent = rules.join("\n");
    document.head.appendChild(style);
  }

  function setSkewed(active) {
    if (gridContainer.classList.contains("tlg-active") === active) return;
    gridContainer.classList.toggle("tlg-active", active);
    invalidateCandidateGeometry();
    renderLines();
  }

  function renderLayer() {
    const active = isActive();
    setSkewed(active);
    if (!active || !getBoardGeometry()) {
      TLGRenderer.clear();
      return;
    }
    TLGRenderer.render(buildModel());
  }

  function renderAll() {
    renderLayer();
    renderPanel();
  }

  function setPressed(id, pressed) {
    const btn = $(id);
    if (btn) btn.setAttribute("aria-pressed", pressed ? "true" : "false");
  }

  function fillList(id, items, emptyKey) {
    const list = $(id);
    if (!list) return;
    list.innerHTML = "";
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "tlg-empty";
      li.textContent = t(emptyKey);
      list.appendChild(li);
      return;
    }
    for (const item of items) list.appendChild(item);
  }

  function textItem(text, className) {
    const li = document.createElement("li");
    li.textContent = text;
    if (className) li.className = className;
    return li;
  }

  /* @edition-slot editor-019 */
  function renderPanel() {
    const panel = $("tlg-panel");
    if (!panel) return;
    const active = isActive();
    panel.classList.toggle("hidden", !active);
    updateSolverToggleButton();
    if (!active) return;

    if (!touchOnly()) menuMode = false;
    for (const r of ROLES) setPressed(`tlg-role-${r}`, role === r);
    $("tlg-menu-toggle").classList.toggle("hidden", !touchOnly());
    setPressed("tlg-menu-toggle", menuMode);
    $("tlg-kind").value = kind;
    $("tlg-cancel").disabled = !pending;
    $("tlg-undo").disabled = edits.undo.length === 0;
    $("tlg-redo").disabled = edits.redo.length === 0;
    $("tlg-black-rank0").checked = blackRank0;
    $("tlg-als-highlight").checked = highlightAls;

    const truths = state.sets.filter((s) => s.role === "truth");
    const links = state.sets.filter((s) => s.role === "link");
    const r = usableResult();
    const parts = [t("tlg_counts", truths.length, links.length)];
    if (r) parts.push(t("tlg_rank", r.rankText));
    /* @edition-slot editor-021 */
    const showPerms = !!r;
    if (showPerms) parts[1] += " ·";
    $("tlg-perm-stepper").classList.toggle("hidden", !showPerms);
    if (showPerms) {
      const loaded = r.perms ? r.perms.length : 0;
      $("tlg-perm-label").textContent = `p${permIndex >= 0 ? permIndex + 1 : "-"}/${r.nperm}`;
      $("tlg-perm-prev").disabled = loaded === 0;
      $("tlg-perm-next").disabled = loaded === 0;
    }
    $("tlg-summary").textContent = parts.join(" · ");
    $("tlg-remove-unused").disabled = !r || links.length === 0 || removeRequestId !== 0;

    let statusText = "";
    let statusClass = "";
    if (status === "idle") statusText = t("tlg_status_idle");
    else if (status === "pending") statusText = t("tlg_status_pending");
    else if (status === "error") {
      statusText = t("tlg_status_error", errorText);
      statusClass = "tlg-status-error";
    } else if (result.nperm === 0) {
      statusText = t("tlg_status_illegal");
      statusClass = "tlg-status-error";
    } else if (result.kills.length === 0 && result.lives.length === 0) {
      statusText = t("tlg_status_none");
    } else if (isSolverMode) {
      statusText = t("tlg_apply_blocked_solver");
    }
    const statusEl = $("tlg-status");
    statusEl.textContent = statusText;
    statusEl.className = `tlg-status ${statusClass}`;

    fillList(
      "tlg-kills",
      r
        ? r.kills.map((k) => {
            const cand = candOf(k.cand);
            return textItem(
              `${rc(cand)}<>${cand.n}${k.kind === "cannibal" ? ` (${t("tlg_cannibal")})` : ""}`,
              k.kind === "cannibal" ? "tlg-kill-cannibal" : "tlg-kill-external",
            );
          })
        : [],
      "tlg_list_none",
    );
    fillList(
      "tlg-lives",
      r
        ? r.lives.map((key) => {
            const cand = candOf(key);
            return textItem(`${rc(cand)}=${cand.n}`, "tlg-live");
          })
        : [],
      "tlg_list_none",
    );
    $("tlg-apply").disabled = !canApply();
    $("tlg-reevaluate").disabled = !hasLogic();

    $("tlg-aur-section").classList.toggle(
      "hidden",
      !(role === "aur" || state.aurMarks.length > 0 || state.options.applyAur),
    );
    $("tlg-vset-section").classList.toggle(
      "hidden",
      !(role === "vset" || state.vset.length > 0 || state.vapply),
    );

    const unique = uniqueSolution();
    const aurApply = $("tlg-aur-apply");
    aurApply.checked = state.options.applyAur;
    aurApply.disabled = !unique;
    $("tlg-aur-info").textContent = t(
      "tlg_aur_count",
      r ? r.aur.count : 0,
      state.aurMarks.length,
    );
    $("tlg-aur-reason").textContent = unique ? "" : t("tlg_aur_unavailable");
    $("tlg-aur-clear").disabled = state.aurMarks.length === 0;

    $("tlg-vset-apply").checked = state.vapply;
    $("tlg-vset-count").value = String(state.vcount);
    $("tlg-vset-count").disabled = !state.vapply;
    let vsetInfo = t("tlg_vset_members", state.vset.length);
    if (r && r.virtual.applied) {
      vsetInfo += ` · ${t("tlg_vset_measured", r.virtual.visnp, r.virtual.visnn)}`;
    }
    $("tlg-vset-info").textContent = vsetInfo;
    $("tlg-vset-clear").disabled = state.vset.length === 0;

    /* @edition-slot editor-023 */

    const saturated = saturatedLinks(r);
    fillList(
      "tlg-set-list",
      state.sets.map((set) => {
        const li = document.createElement("li");
        li.className = `tlg-set-item tlg-${set.kind} tlg-${set.role}`;
        if (set.id === selectedSetId) li.classList.add("tlg-selected");
        const als = alsOfSet(r, set);
        if (als) li.style.backgroundColor = als;
        const label = document.createElement("button");
        label.type = "button";
        label.className = "tlg-set-label";
        const members = membersOf(set);
        const extra = saturated.has(set.id)
          ? ` · ${t("tlg_rank0_link")}`
          : members.length === 0
            ? ` · ${t(isSatisfied(set) ? "tlg_satisfied" : "tlg_members_none")}`
            : "";
        label.textContent = `${set.role === "truth" ? "T" : "L"} ${formatSet(set)} (${members.length})${extra}`;
        label.addEventListener("click", () => {
          selectedSetId = selectedSetId === set.id ? null : set.id;
          renderAll();
        });
        const del = document.createElement("button");
        del.type = "button";
        del.className = "tlg-set-delete";
        del.textContent = "×";
        del.setAttribute("aria-label", t("tlg_delete"));
        del.addEventListener("click", () => toggleSet(set));
        li.appendChild(label);
        li.appendChild(del);
        return li;
      }),
      "tlg_sets_empty",
    );
    $("tlg-set-summary").textContent = state.sets.length
      ? `T: ${formatSetGroup(truths) || "-"} / L: ${formatSetGroup(links) || "-"}`
      : "";
    $("tlg-clear-all").disabled =
      state.aurMarks.length === 0 &&
      state.vset.length === 0 &&
      state.sets.length === 0;
  }

  // --- Panel wiring -------------------------------------------------------

  function resetInputState() {
    pending = null;
    closeMenu();
  }

  // The panel is built here, not in the page markup, so a page without it
  // still gets the editor.
  function ensurePanel() {
    if ($("tlg-panel")) return;
    const anchor = $("solver-link-container");
    if (!anchor) return;
    const panel = document.createElement("div");
    panel.id = "tlg-panel";
    panel.className = "tlg-panel hidden mt-2";
    panel.innerHTML = PANEL_HTML;
    anchor.parentNode.insertBefore(panel, anchor);
    panel.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
  }

  function removeUnusedLinks() {
    if (!usableResult() || removeRequestId !== 0) return;
    if (!state.sets.some((s) => s.role === "link")) return;
    const id = nextRequestId++;
    removeRequestId = id;
    removeSnapshot = snapshot();
    renderPanel();
    getWorker().then((w) => {
      if (removeRequestId !== id) return;
      if (!w) {
        removeRequestId = 0;
        renderPanel();
        return;
      }
      w.postMessage({ id, op: "removeUnusedLinks", input: buildInput() });
    });
  }

  function finishRemoveUnused(data) {
    if (snapshot() !== removeSnapshot) {
      renderPanel();
      return;
    }
    if (data.error || !data.result || data.result.aborted) {
      showMessage(t("tlg_remove_unused_failed"), "red");
      renderPanel();
      return;
    }
    const linkIds = drawnSets("link").map((s) => s.id);
    const keep = new Set(data.result.keep.map((i) => linkIds[i]));
    const removed = linkIds.length - keep.size;
    if (removed === 0) {
      showMessage(t("tlg_no_unused_links"), "gray");
      renderPanel();
      return;
    }
    state.sets = state.sets.filter((s) => s.role !== "link" || keep.has(s.id));
    if (!state.sets.some((s) => s.id === selectedSetId)) selectedSetId = null;
    showMessage(t("tlg_removed_unused_links", removed), "gray");
    commit();
  }

  function bindPanel() {
    ensurePanel();
    ensureSkewStyle();
    const panel = $("tlg-panel");
    if (!panel) return;
    blackRank0 = readStoredBoolean(localStorage, BLACK_RANK0_KEY, false);
    highlightAls = readStoredBoolean(localStorage, HIGHLIGHT_ALS_KEY, false);
    for (const r of ROLES) {
      $(`tlg-role-${r}`).addEventListener("click", () => {
        role = r;
        resetInputState();
        renderAll();
      });
    }
    $("tlg-kind").addEventListener("change", (e) => {
      kind = e.target.value;
      resetInputState();
      renderAll();
    });
    $("tlg-menu-toggle").addEventListener("click", () => {
      menuMode = !menuMode;
      resetInputState();
      renderAll();
    });
    $("tlg-undo").addEventListener("click", () => stepEdits(true));
    $("tlg-redo").addEventListener("click", () => stepEdits(false));
    $("tlg-cancel").addEventListener("click", () => {
      resetInputState();
      renderAll();
    });
    $("tlg-apply").addEventListener("click", applyResult);
    $("tlg-reevaluate").addEventListener("click", () => {
      cancel();
      scheduleEvaluate();
    });
    $("tlg-remove-unused").addEventListener("click", removeUnusedLinks);
    // The stepper cycles -, p1 .. pM, -; "-" shows no permutation.
    const stepPerm = (delta) => {
      const r = usableResult();
      const loaded = r && r.perms ? r.perms.length : 0;
      if (loaded === 0) return;
      permIndex = ((permIndex + 1 + delta + loaded + 1) % (loaded + 1)) - 1;
      renderAll();
    };
    $("tlg-perm-prev").addEventListener("click", () => stepPerm(-1));
    $("tlg-perm-next").addEventListener("click", () => stepPerm(1));
    $("tlg-aur-apply").addEventListener("change", (e) => {
      state.options.applyAur = e.target.checked;
      commit();
    });
    $("tlg-aur-clear").addEventListener("click", () => {
      state.aurMarks = [];
      commit();
    });
    $("tlg-vset-apply").addEventListener("change", (e) => {
      state.vapply = e.target.checked;
      commit();
    });
    $("tlg-vset-count").addEventListener("change", (e) => {
      state.vcount = Math.min(4, Math.max(1, parseInt(e.target.value) || 1));
      commit();
    });
    $("tlg-vset-clear").addEventListener("click", () => {
      state.vset = [];
      commit();
    });
    /* @edition-slot editor-025 */
    $("tlg-als-highlight").addEventListener("change", (e) => {
      highlightAls = e.target.checked;
      if (!writeStoredText(localStorage, HIGHLIGHT_ALS_KEY, JSON.stringify(highlightAls))) {
        notifyStorageWriteFailed();
      }
      scheduleEvaluate();
    });
    $("tlg-black-rank0").addEventListener("change", (e) => {
      blackRank0 = e.target.checked;
      if (!writeStoredText(localStorage, BLACK_RANK0_KEY, JSON.stringify(blackRank0))) {
        notifyStorageWriteFailed();
      }
      renderAll();
    });
    $("tlg-clear-all").addEventListener("click", () => {
      const fresh = emptyState();
      fresh.options = state.options;
      Object.assign(state, fresh);
      selectedSetId = null;
      resetInputState();
      commit();
    });
  }

  // --- Mode lifecycle -----------------------------------------------------

  function showPlayControls(show) {
    modeSelector.classList.toggle("hidden", !show);
    modeSelector.classList.toggle("flex", show);
    numberPad.classList.toggle("hidden", !show);
    numberPad.classList.toggle("grid", show);
    $("action-buttons-container").classList.toggle("hidden", !show);
  }

  function enter() {
    showPlayControls(false);
    resetEdits();
    menuMode = false;
    resetInputState();
    showMessage(t(touchOnly() ? "tlg_mode_tip_mobile" : "tlg_mode_tip"), "gray");
    scheduleEvaluate();
  }

  function exit() {
    cancel();
    state = emptyState();
    menuMode = false;
    selectedSetId = null;
    resetInputState();
    showPlayControls(true);
    setSkewed(false);
    TLGRenderer.clear();
    $("tlg-panel").classList.add("hidden");
  }

  function toggleSolver() {
    if (!isSolverMode) return;
    solverOn = !solverOn;
    resetInputState();
    state = emptyState();
    resetEdits();
    if (solverOn) solverStepIndex = currentSolverStep;
    else cancel();
    const bar = $("solver-bar-container");
    bar.classList.toggle("hidden", solverOn);
    bar.classList.toggle("flex", !solverOn);
    renderSolverStep(currentSolverStep);
  }

  function onSolverStepRendered() {
    if (!solverOn) {
      renderAll();
      return;
    }
    if (currentSolverStep !== solverStepIndex) {
      state = emptyState();
      solverStepIndex = currentSolverStep;
      selectedSetId = null;
      resetInputState();
      resetEdits();
    }
    scheduleEvaluate();
  }

  function onEnterSolver() {
    cancel();
    solverOn = false;
    resetInputState();
    renderAll();
  }

  function onExitSolver() {
    cancel();
    solverOn = false;
    state = emptyState();
    resetInputState();
    renderAll();
  }

  function onBoardChanged() {
    if (!isActive()) return;
    scheduleEvaluate();
  }

  function onPuzzleLoaded() {
    cancel(true);
    state = emptyState();
    resetEdits();
    selectedSetId = null;
    menuMode = false;
    resetInputState();
  }

  function reset() {
    state = emptyState();
    resetEdits();
    selectedSetId = null;
    resetInputState();
  }

  // --- Snapshots for the undo stack ---------------------------------------

  function serialize(st) {
    if (
      st.aurMarks.length === 0 &&
      st.vset.length === 0 &&
      !st.vapply &&
      !st.options.applyAur &&
      /* @edition-slot editor-027 */
      st.sets.length === 0
    ) {
      return null;
    }
    return {
      sets: st.sets.map((s) =>
        s.kind === "cell" ? [s.role, "cell", s.cell] : [s.role, s.kind, s.index, s.digit],
      ),
      aur: [...st.aurMarks],
      vset: [...st.vset],
      vapply: st.vapply,
      vcount: st.vcount,
      applyAur: st.options.applyAur,
      /* @edition-slot editor-028 */
    };
  }

  const isIndex = (v, limit) => Number.isInteger(v) && v >= 0 && v < limit;

  function parseSaved(saved) {
    if (saved === null || saved === undefined) return null;
    if (typeof saved !== "object" || Array.isArray(saved)) return null;
    const st = emptyState();
    if (!Array.isArray(saved.sets)) return null;
    for (const entry of saved.sets) {
      if (!Array.isArray(entry)) return null;
      const [setRole, setKind] = entry;
      if (setRole !== "truth" && setRole !== "link") return null;
      if (setKind === "cell") {
        if (entry.length !== 3 || !isIndex(entry[2], 81)) return null;
        st.sets.push({ role: setRole, kind: "cell", cell: entry[2], id: st.nextId++ });
      } else {
        if (!KIND_LETTER[setKind] || entry.length !== 4) return null;
        if (!isIndex(entry[2], 9) || !isIndex(entry[3] - 1, 9)) return null;
        st.sets.push({
          role: setRole,
          kind: setKind,
          index: entry[2],
          digit: entry[3],
          id: st.nextId++,
        });
      }
    }
    for (const [field, target] of [["aur", "aurMarks"], ["vset", "vset"]]) {
      if (saved[field] === undefined) continue;
      if (!Array.isArray(saved[field]) || !saved[field].every((v) => isIndex(v, 729))) {
        return null;
      }
      st[target] = [...saved[field]];
    }
    st.vapply = saved.vapply === true;
    st.vcount = isIndex(saved.vcount - 1, 4) ? saved.vcount : 1;
    st.options.applyAur = saved.applyAur === true;
    /* @edition-slot editor-029 */
    // Only these fields are supported here: reject any other rather than drop it.
    const known = ["sets", "aur", "vset", "vapply", "vcount", "applyAur"];
    return Object.keys(saved).every((key) => known.includes(key)) ? st : null;
  }

  return {
    isActive,
    handleGridEvent,
    handleKey,
    bindPanel,
    enter,
    exit,
    renderLayer,
    renderAll,
    buildModel,
    toggleSolver,
    onSolverStepRendered,
    onEnterSolver,
    onExitSolver,
    onBoardChanged,
    onPuzzleLoaded,
    reset,
  };
})();
