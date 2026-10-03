(function (root) {
  "use strict";

  function candidateMask(cell) {
    return cell.digit === 0 ? cell.candidates | 0 : 0;
  }

  function buildImportString(cells) {
    const givensOnly = cells.every(
      (cell) =>
        (cell.digit === 0 || cell.role !== "user") && candidateMask(cell) === 0,
    );
    if (givensOnly) {
      return cells.map((cell) => (cell.digit ? String(cell.digit) : ".")).join("");
    }

    let board = "";
    let universe = "";
    for (const cell of cells) {
      if (cell.digit === 0) board += ".";
      else board += cell.role === "user" ? `+${cell.digit}` : String(cell.digit);
      const mask = candidateMask(cell);
      for (let digit = 1; digit <= 9; digit++) {
        universe += mask & (1 << (digit - 1)) ? String(digit) : ".";
      }
    }
    return `:0000:x:${universe}:${board}:::`;
  }

  function findConflicts(cells) {
    const conflicts = new Set();
    for (let a = 0; a < 81; a++) {
      if (cells[a].digit === 0) continue;
      for (let b = a + 1; b < 81; b++) {
        if (cells[b].digit !== cells[a].digit) continue;
        if (arePeers(a, b)) {
          conflicts.add(a);
          conflicts.add(b);
        }
      }
    }
    return [...conflicts].sort((x, y) => x - y);
  }

  function arePeers(a, b) {
    const rowA = Math.floor(a / 9);
    const colA = a % 9;
    const rowB = Math.floor(b / 9);
    const colB = b % 9;
    const sameBox =
      Math.floor(rowA / 3) === Math.floor(rowB / 3) &&
      Math.floor(colA / 3) === Math.floor(colB / 3);
    return rowA === rowB || colA === colB || sameBox;
  }

  function autoPencilled(cells) {
    return cells.map((cell, i) => {
      let candidates = 0x1ff;
      cells.forEach((other, j) => {
        if (other.digit && arePeers(i, j)) candidates &= ~(1 << (other.digit - 1));
      });
      return { ...cell, candidates };
    });
  }

  const OCR_WORKER_URL = "sudoku/ocr/sudoku_ocr_worker.js";
  const MAX_IMAGE_SIDE = 4096;
  const PROBE_SIZE = 4;
  const PROBE_TOLERANCE = 48;
  const OCR_DEADMAN_MS = 60000;
  const VISUALLY_HIDDEN =
    "position:absolute;width:1px;height:1px;padding:0;margin:-1px;" +
    "overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
  const MIN_PUZZLE_BOX_WIDTH = 120;
  const FAILURE_MESSAGES = {
    "no-board": "ui_image_import_board_not_found",
    "board-too-small": "ui_image_import_board_too_small",
  };
  const OPEN_MODAL = '[id$="-modal"]:not(.hidden)';

  let ocrWorker = null;
  let pendingJob = null;
  let lastJobId = 0;
  let isReadingImage = false;
  let canvasReadable = false;

  function isImageType(type) {
    return (
      typeof type === "string" &&
      type.startsWith("image/") &&
      type !== "image/svg+xml"
    );
  }

  function clipboardImage(data) {
    if (!data) return null;
    const files = data.files || [];
    for (let i = 0; i < files.length; i++) {
      if (isImageType(files[i].type)) return files[i];
    }
    const items = data.items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind !== "file" || !isImageType(items[i].type)) continue;
      const file = items[i].getAsFile();
      if (file) return file;
    }
    return null;
  }

  function isEditable(element) {
    return Boolean(
      element &&
        element.nodeType === 1 &&
        (element.isContentEditable ||
          element.matches("input, textarea, select")),
    );
  }

  class CanvasReadError extends Error {}

  async function decodeImage(blob) {
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = Math.min(
        1,
        MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height),
      );
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      let pixels;
      try {
        pixels = context.getImageData(0, 0, width, height);
      } catch (error) {
        throw new CanvasReadError("The canvas could not be read back.", { cause: error });
      } finally {
        // Free the 64 MB backing store now instead of whenever the canvas is collected.
        canvas.width = 0;
        canvas.height = 0;
      }
      return { width, height, data: pixels.data };
    } finally {
      bitmap.close();
    }
  }

  // Firefox can withhold pixels until allowed, so only a pass is cached; Brave/Safari noise is in tolerance.
  function canvasReadsBack() {
    if (canvasReadable) return true;
    const canvas = document.createElement("canvas");
    canvas.width = PROBE_SIZE;
    canvas.height = PROBE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const half = PROBE_SIZE / 2;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, half, PROBE_SIZE);
    context.fillStyle = "#ffffff";
    context.fillRect(half, 0, half, PROBE_SIZE);
    let data;
    try {
      ({ data } = context.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE));
    } catch (error) {
      console.warn("Image import: the canvas test pattern could not be read.", error);
      return false;
    }
    if (data?.length !== PROBE_SIZE * PROBE_SIZE * 4) return false;
    for (let pixel = 0; pixel < PROBE_SIZE * PROBE_SIZE; pixel++) {
      const want = pixel % PROBE_SIZE < half ? 0 : 255;
      const at = pixel * 4;
      for (let channel = 0; channel < 4; channel++) {
        const expected = channel === 3 ? 255 : want;
        if (Math.abs(data[at + channel] - expected) > PROBE_TOLERANCE) return false;
      }
    }
    canvasReadable = true;
    return true;
  }

  function settleJob(worker, id, reply) {
    const job = pendingJob;
    if (!job || job.worker !== worker || (id !== null && job.id !== id)) return;
    pendingJob = null;
    clearTimeout(job.deadman);
    job.resolve(reply);
  }

  function deadmanMs() {
    const override = Number(globalThis.__imageImportDeadmanMs);
    return override > 0 ? override : OCR_DEADMAN_MS;
  }

  function dropOcrWorker(worker) {
    worker.terminate();
    if (ocrWorker === worker) ocrWorker = null;
  }

  function ensureOcrWorker() {
    if (ocrWorker) return ocrWorker;
    const worker = new Worker(OCR_WORKER_URL);
    worker.addEventListener("message", (event) => {
      const reply = event.data || {};
      if (reply.error || reply.result?.reason === "model-mismatch") {
        dropOcrWorker(worker);
      }
      settleJob(
        worker,
        reply.id,
        reply.error ? { error: reply.error } : { result: reply.result },
      );
    });
    worker.addEventListener("error", (event) => {
      dropOcrWorker(worker);
      settleJob(worker, null, { error: event.message || "worker error" });
    });
    worker.addEventListener("messageerror", () => {
      dropOcrWorker(worker);
      settleJob(worker, null, { error: "unreadable reply" });
    });
    ocrWorker = worker;
    return worker;
  }

  function recognizeInWorker(image) {
    return new Promise((resolve) => {
      let worker;
      try {
        worker = ensureOcrWorker();
      } catch (error) {
        resolve({ error });
        return;
      }
      const id = ++lastJobId;
      const job = { id, worker, resolve, deadman: 0 };
      pendingJob = job;
      try {
        worker.postMessage({ id, image }, [image.data.buffer]);
      } catch (error) {
        settleJob(worker, id, { error });
        return;
      }
      job.deadman = setTimeout(() => {
        dropOcrWorker(worker);
        settleJob(worker, id, { error: "no reply", timedOut: true });
      }, deadmanMs());
    });
  }

  function whenNoModalOpen() {
    return new Promise((resolve) => {
      if (!document.querySelector(OPEN_MODAL)) {
        resolve();
        return;
      }
      const observer = new MutationObserver(() => {
        if (document.querySelector(OPEN_MODAL)) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    });
  }

  async function handleImageBlob(blob, opener = document.activeElement) {
    if (isReadingImage) {
      showMessage(t("ui_image_import_busy"), "orange");
      return;
    }
    isReadingImage = true;
    // Selection id, not load id: a load already under way when the image arrived must not drop it.
    const selectionId = puzzleSelectionRequestId;
    const isCurrent = () => selectionId === puzzleSelectionRequestId;
    try {
      showMessage(t("ui_image_import_reading"), "blue");
      let image;
      try {
        image = await decodeImage(blob);
      } catch (error) {
        console.warn("Image import: the image could not be decoded.", error);
        if (!isCurrent()) return;
        const blocked = error instanceof CanvasReadError && !canvasReadsBack();
        showMessage(
          t(blocked ? "ui_image_import_canvas_blocked" : "ui_image_import_decode_error"),
          "red",
        );
        return;
      }
      if (!isCurrent()) return;
      if (!canvasReadsBack()) {
        showMessage(t("ui_image_import_canvas_blocked"), "red");
        return;
      }

      const { result, error, timedOut } = await recognizeInWorker(image);
      if (!isCurrent()) return;
      if (timedOut) {
        console.warn("Image import: the recognizer stopped answering; its worker was stopped.");
        showMessage(t("ui_image_import_timeout"), "red");
        return;
      }
      if (error || !result) {
        console.warn("Image import: the recognizer did not run.", error);
        showMessage(t("ui_image_import_engine_error"), "red");
        return;
      }
      if (!result.ok) {
        if (!FAILURE_MESSAGES[result.reason]) {
          console.warn("Image import: the recognizer refused.", result.reason);
        }
        showMessage(
          t(FAILURE_MESSAGES[result.reason] || "ui_image_import_engine_error"),
          "red",
        );
        return;
      }
      if (!Array.isArray(result.cells) || result.cells.length !== 81) {
        console.warn("Image import: the recognizer returned no board.", result);
        showMessage(t("ui_image_import_engine_error"), "red");
        return;
      }
      const notice = document.getElementById("message-area");
      if (notice?.textContent.trim() === t("ui_image_import_reading")) {
        showMessage("", "gray");
      }
      await whenNoModalOpen();
      if (!isCurrent()) return;
      openDialog(result, opener);
    } finally {
      isReadingImage = false;
    }
  }

  function onPaste(event) {
    const image = clipboardImage(event.clipboardData);
    if (!image) return;
    const target = event.target;
    if (target && target.id === "puzzle-string") {
      if (Array.from(event.clipboardData.types || []).includes("text/plain")) {
        return;
      }
    } else if (isEditable(target)) {
      return;
    }
    if (document.querySelector(OPEN_MODAL)) return;
    event.preventDefault();
    handleImageBlob(image, document.activeElement);
  }

  function pasteModifier() {
    return /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? "Cmd" : "Ctrl";
  }

  // clipboard.read() must run inside the click handler: Safari refuses it outside a user gesture.
  async function readClipboardImage(event) {
    const opener = event?.currentTarget || document.activeElement;
    if (!navigator.clipboard?.read) {
      showMessage(t("ui_image_import_unsupported", pasteModifier()), "orange");
      return;
    }
    let blob = null;
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find(isImageType);
        if (type) {
          blob = await item.getType(type);
          break;
        }
      }
    } catch (error) {
      if (error?.name === "NotAllowedError") {
        showMessage(t("ui_image_import_permission", pasteModifier()), "orange");
        return;
      }
      console.warn("Image import: the clipboard could not be read.", error);
    }
    if (!blob) {
      showMessage(t("ui_image_import_no_image"), "orange");
      return;
    }
    handleImageBlob(blob, opener);
  }

  function createImageIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const attributes = {
      viewBox: "0 0 24 24",
      width: "18",
      height: "18",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    };
    for (const [name, value] of Object.entries(attributes)) {
      svg.setAttribute(name, value);
    }
    const shapes = [
      ["rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }],
      ["circle", { cx: "9", cy: "10", r: "1.75" }],
      ["polyline", { points: "21 16 15.5 10.5 6 20" }],
    ];
    for (const [tag, shapeAttributes] of shapes) {
      const shape = document.createElementNS(ns, tag);
      for (const [name, value] of Object.entries(shapeAttributes)) {
        shape.setAttribute(name, value);
      }
      svg.append(shape);
    }
    return svg;
  }

  function ensureImageImportButton() {
    const copyButton = document.getElementById("copy-btn");
    if (!copyButton || document.getElementById("image-import-btn")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "image-import-btn";
    button.className = copyButton.className
      .split(/\s+/)
      .filter((name) => name && !/^(hover:)?bg-/.test(name))
      .concat("bg-purple-600", "hover:bg-purple-700")
      .join(" ");
    button.dataset.tooltip = t("tooltip_image_import");
    button.dataset.i18nTooltip = "tooltip_image_import";

    // Separate label spans: a language switch rewrites [data-i18n] text and would wipe the icon.
    const icon = createImageIcon();
    const label = document.createElement("span");
    label.dataset.i18n = "btn_image_import";
    label.textContent = t("btn_image_import");
    label.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.dataset.i18n = "aria_image_import";
    name.textContent = t("aria_image_import");
    name.style.cssText = VISUALLY_HIDDEN;
    button.append(icon, label, name);

    button.addEventListener("click", readClipboardImage);
    copyButton.insertAdjacentElement("afterend", button);

    const setCompact = (compact) => {
      icon.style.display = compact ? "" : "none";
      label.style.display = compact ? "none" : "";
      button.classList.toggle("px-4", !compact);
      button.classList.toggle("px-2", compact);
    };
    const fit = () => {
      setCompact(false);
      const box = document.getElementById("puzzle-string");
      const width = box ? box.getBoundingClientRect().width : 0;
      if (width > 0 && width < MIN_PUZZLE_BOX_WIDTH) setCompact(true);
    };
    let queued = false;
    const refit = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fit();
      });
    };
    fit();
    window.addEventListener("resize", refit);
    new MutationObserver(refit).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    });
  }

  const DIALOG_ID = "image-import-modal";
  const PREVIEW_SIZE = 576;
  const CANVAS_SCALE = 2;
  const UNCERTAIN_BELOW = 0.9;
  const STILL_LOADING = {};
  const DIGIT_ORDER = {
    A: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    B: [7, 8, 9, 4, 5, 6, 1, 2, 3],
  };
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const BUTTON_BASE =
    "px-3 py-2 text-sm font-semibold rounded-md shadow-sm transition-colors";
  const BUTTON_SECONDARY = `${BUTTON_BASE} bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600`;
  const BUTTON_PRIMARY = `${BUTTON_BASE} bg-blue-600 text-white hover:bg-blue-700`;
  const PROMPTS = {
    discard: ["image_import_discard_confirm", "image_import_discard_desc", "image_import_discard", "bg-red-600 hover:bg-red-700"],
    candidates: [
      "image_import_wrong_candidates",
      "image_import_wrong_candidates_desc",
      "image_import_refill_load",
      "bg-blue-600 hover:bg-blue-700",
    ],
  };
  const KEY_SIZE = "h-12 px-0 text-lg font-bold";
  const TOOL_SIZE = "px-2 py-2 text-sm font-bold";
  // A function, not a constant: NUMBER_PAD_BUTTON_LOOK is declared in core.js, which runs after this file.
  // pressed is "active" or "active-green": the classes #mode-toggle-btn wears, border-gray-300 included for its dark border.
  const padLook = (size, pressed) =>
    `${size} ${NUMBER_PAD_BUTTON_LOOK}${pressed ? ` control-btn ${pressed} border-gray-300` : ""}`;
  const UNIFORM_LINES = Array.from(
    { length: 10 },
    (unused, i) => (i * PREVIEW_SIZE) / 9,
  );

  let dialogUi = null;
  let dialog = null;

  function element(tag, className, i18nKey) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (i18nKey) {
      node.dataset.i18n = i18nKey;
      node.textContent = t(i18nKey);
    }
    return node;
  }

  function ensureDialog() {
    if (dialogUi) return dialogUi;

    const rootNode = element(
      "div",
      "fixed inset-0 z-[100] hidden items-center justify-center bg-black/50",
    );
    rootNode.id = DIALOG_ID;

    const panel = element(
      "div",
      "bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 relative text-gray-800 dark:text-gray-100",
    );
    panel.id = "image-import-dialog";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "image-import-title");
    panel.setAttribute("aria-describedby", "image-import-help");
    panel.tabIndex = -1;
    panel.style.cssText =
      "box-sizing:border-box;width:min(60rem, calc(100vw - 1rem));" +
      "max-height:calc(100vh - 1rem);overflow-y:auto;padding:0.75rem;outline:none;" +
      "scroll-padding-bottom:4.5rem";
    panel.style.maxHeight = "calc(100dvh - 1rem)"; // ignored where unsupported

    const title = element(
      "h3",
      "text-lg font-bold mb-1 text-gray-800 dark:text-gray-100",
      "image_import_title",
    );
    title.id = "image-import-title";
    const help = element(
      "p",
      "text-sm text-gray-600 dark:text-gray-300 mb-2",
      "image_import_help",
    );
    help.id = "image-import-help";

    const canvas = element("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.cssText =
      "display:block;width:100%;max-width:min(576px, calc(100vh - 7rem));" +
      "margin:0 auto;aspect-ratio:1 / 1;cursor:pointer;touch-action:manipulation;" +
      "border-radius:4px";
    canvas.addEventListener("click", onCanvasClick);

    const cellStatus = element("p", "text-sm font-semibold");
    cellStatus.id = "image-import-cell-status";
    cellStatus.setAttribute("role", "status");
    cellStatus.setAttribute("aria-live", "polite");
    cellStatus.style.minHeight = "1.25rem";

    const pad = element("div", "grid grid-cols-9 gap-1 mt-2 min-[880px]:grid-cols-3");
    const digitKeys = [];
    for (let digit = 1; digit <= 9; digit++) {
      const key = element("button", padLook(KEY_SIZE));
      key.type = "button";
      key.textContent = String(digit);
      key.addEventListener("click", () => setSelectedDigit(digit));
      digitKeys.push(key);
    }
    const mode = element("button", padLook(TOOL_SIZE), "btn_number");
    mode.type = "button";
    mode.style.gridColumn = "1 / -1";
    mode.style.minHeight = "44px";
    mode.addEventListener("click", toggleInputMode);
    pad.append(...digitKeys, mode);

    const tools = element("div", "flex flex-wrap gap-2 mt-2");
    const tool = (i18nKey, onClick) => {
      const button = element("button", padLook(TOOL_SIZE), i18nKey);
      button.type = "button";
      button.style.flex = "1 1 auto";
      button.style.minHeight = "44px";
      button.addEventListener("click", onClick);
      tools.append(button);
      return button;
    };
    const roleToggle = tool("image_import_role_toggle", toggleSelectedRole);
    const flipAll = tool("image_import_role_flip_all", flipAllRoles);
    const view = tool("image_import_view_toggle", toggleView);
    view.setAttribute("aria-pressed", "false");
    const reset = tool("image_import_reset", resetCells);

    const status = element("div", "text-sm mt-2");
    status.id = "image-import-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const actions = element(
      "div",
      "flex flex-wrap gap-2 mt-3 justify-end bg-white dark:bg-gray-800",
    );
    actions.style.cssText = "position:sticky;bottom:0;padding:0.5rem 0 0.25rem";
    const cancel = element("button", BUTTON_SECONDARY, "btn_cancel");
    cancel.type = "button";
    cancel.style.minHeight = "44px";
    cancel.addEventListener("click", requestCancel);
    const load = element("button", BUTTON_PRIMARY, "btn_load");
    load.type = "button";
    load.id = "image-import-load-btn";
    load.style.minHeight = "44px";
    load.addEventListener("click", () => confirmDialog());
    actions.append(cancel, load);

    const picture = element("div", "min-[880px]:flex-[0_1_576px] min-[880px]:min-w-80");
    picture.append(canvas);
    const controls = element("div", "min-[880px]:flex-[1_1_16rem] min-[880px]:min-w-60");
    controls.append(cellStatus, pad, tools, status, actions);
    const content = element("div", "flex flex-col gap-3 min-[880px]:flex-row");
    content.append(picture, controls);
    panel.append(title, help, content);

    const discardLayer = element(
      "div",
      "absolute inset-0 hidden items-center justify-center bg-black/50",
    );
    discardLayer.id = "image-import-discard";
    const discardCard = element(
      "div",
      "bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-80 text-center border border-gray-200 dark:border-gray-700 relative",
    );
    discardCard.setAttribute("role", "alertdialog");
    discardCard.setAttribute("aria-modal", "true");
    discardCard.setAttribute("aria-labelledby", "image-import-discard-title");
    discardCard.setAttribute("aria-describedby", "image-import-discard-desc");
    discardCard.style.maxWidth = "calc(100vw - 2rem)";
    const discardTitle = element(
      "h3",
      "text-xl font-bold mb-2 text-gray-800 dark:text-gray-100",
      "image_import_discard_confirm",
    );
    discardTitle.id = "image-import-discard-title";
    const discardDesc = element(
      "p",
      "text-gray-600 dark:text-gray-300 mb-6 text-sm",
      "image_import_discard_desc",
    );
    discardDesc.id = "image-import-discard-desc";
    const discardChoices = element("div", "flex flex-col gap-3");
    const discard = element(
      "button",
      "w-full px-4 py-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-700 shadow-sm transition-colors",
      "image_import_discard",
    );
    discard.type = "button";
    discard.id = "image-import-discard-btn";
    discard.style.minHeight = "44px";
    discard.addEventListener("click", () => {
      const kind = dialog?.prompt?.kind;
      if (kind === "discard") closeDialog();
      if (kind === "candidates") {
        hidePrompt();
        confirmDialog(true);
      }
    });
    const keep = element(
      "button",
      "w-full px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300 shadow-sm transition-colors dark:bg-slate-700 dark:hover:bg-slate-600",
      "image_import_keep_editing",
    );
    keep.type = "button";
    keep.id = "image-import-keep-btn";
    keep.style.minHeight = "44px";
    keep.addEventListener("click", hidePrompt);
    discardChoices.append(discard, keep);
    discardCard.append(discardTitle, discardDesc, discardChoices);
    discardLayer.append(discardCard);
    discardLayer.addEventListener("mousedown", (event) => {
      if (!event.target.closest("button")) event.preventDefault();
    });

    rootNode.append(panel, discardLayer);
    document.body.append(rootNode);

    dialogUi = {
      root: rootNode,
      panel,
      canvas,
      cellStatus,
      status,
      digitKeys,
      mode,
      roleToggle,
      flipAll,
      view,
      reset,
      cancel,
      load,
      discardLayer,
      promptTitle: discardTitle,
      promptDesc: discardDesc,
      promptGo: discard,
      keep,
    };
    return dialogUi;
  }

  function copyCell(cell) {
    const digit =
      Number.isInteger(cell?.digit) && cell.digit >= 0 && cell.digit <= 9
        ? cell.digit
        : 0;
    return {
      digit,
      role: digit === 0 ? null : cell.role === "user" ? "user" : "given",
      // Kept on digit cells so toggling the digit off restores them; candidateMask ignores them there.
      candidates: (cell?.candidates | 0) & 0x1ff,
      confidence: Number.isFinite(cell?.confidence) ? cell.confidence : 1,
    };
  }

  function previewLines(lines, origin, size) {
    if (
      !Array.isArray(lines) ||
      lines.length !== 10 ||
      !(size > 0) ||
      !lines.every((value, i) => Number.isFinite(value) && (i === 0 || value > lines[i - 1]))
    ) {
      return UNIFORM_LINES;
    }
    return lines.map((value) =>
      Math.min(PREVIEW_SIZE, Math.max(0, ((value - origin) / size) * PREVIEW_SIZE)),
    );
  }

  function previewCanvas(preview) {
    const pixels = preview?.rgba;
    if (
      preview?.size !== PREVIEW_SIZE ||
      !pixels ||
      pixels.length !== PREVIEW_SIZE * PREVIEW_SIZE * 4
    ) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = PREVIEW_SIZE;
    canvas.height = PREVIEW_SIZE;
    const data = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.length);
    canvas
      .getContext("2d")
      .putImageData(new ImageData(data, PREVIEW_SIZE, PREVIEW_SIZE), 0, 0);
    return canvas;
  }

  function openDialog(result, opener) {
    const ui = ensureDialog();
    const cells = result.cells.map(copyCell);
    const lowConfidence = new Set();
    for (const warning of Array.isArray(result.warnings) ? result.warnings : []) {
      if (warning?.code === "low-confidence" && Array.isArray(warning.cells)) {
        for (const index of warning.cells) lowConfidence.add(index);
      }
    }
    const preview = previewCanvas(result.preview);
    const board = result.board || {};
    dialog = {
      original: cells.map(copyCell),
      cells,
      doubted: new Set(
        cells
          .map((cell, i) => (cell.confidence < UNCERTAIN_BELOW || lowConfidence.has(i) ? i : -1))
          .filter((i) => i >= 0),
      ),
      edited: new Set(),
      multipleBoards: (result.warnings || []).some((w) => w?.code === "multiple-boards"),
      preview,
      lines: preview
        ? {
            xs: previewLines(board.xs, board.x, board.width),
            ys: previewLines(board.ys, board.y, board.height),
          }
        : null,
      resultOnly: !preview,
      pencil: false,
      selected: 0,
      error: null,
      loading: false,
      opener,
      announced: { cell: null, status: null },
      observer: null,
      prompt: null,
    };
    const conflicts = findConflicts(cells);
    const firstDoubted = [...dialog.doubted].sort((a, b) => a - b)[0];
    dialog.selected = conflicts[0] ?? firstDoubted ?? 0;

    ui.root.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    ui.canvas.width = PREVIEW_SIZE * CANVAS_SCALE;
    ui.canvas.height = PREVIEW_SIZE * CANVAS_SCALE;
    ui.view.disabled = !preview;

    document.querySelectorAll(".custom-tooltip").forEach((tip) => tip.remove());
    if (typeof activeTooltipElement !== "undefined") activeTooltipElement = null;

    ui.root.classList.remove("hidden");
    ui.root.classList.add("flex");
    // Capture phase on window, so no key reaches core.js's handleKeyDown (bubble phase on document).
    window.addEventListener("keydown", onDialogKeyDown, true);
    document.addEventListener("focusin", onDialogFocusIn, true);
    dialog.observer = new MutationObserver(() => renderDialog());
    dialog.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang", "class"],
    });
    document.activeElement?.blur?.();
    ui.panel.focus({ preventScroll: true });
    renderDialog();
  }

  function closeDialog() {
    const state = dialog;
    if (!state) return;
    dialog = null;
    const ui = dialogUi;
    window.removeEventListener("keydown", onDialogKeyDown, true);
    document.removeEventListener("focusin", onDialogFocusIn, true);
    state.observer?.disconnect();
    setPromptLayer(false);
    ui.root.classList.add("hidden");
    ui.root.classList.remove("flex");
    ui.canvas.width = 0;
    ui.canvas.height = 0;
    if (state.preview) {
      state.preview.width = 0;
      state.preview.height = 0;
    }
    ui.cellStatus.textContent = "";
    ui.status.textContent = "";
    const opener = state.opener;
    if (
      opener &&
      opener !== document.body &&
      opener.isConnected &&
      !opener.disabled &&
      typeof opener.focus === "function"
    ) {
      opener.focus({ preventScroll: true });
    }
  }

  const isDirty = () =>
    dialog.cells.some(
      (cell, i) =>
        cell.digit !== dialog.original[i].digit ||
        cell.role !== dialog.original[i].role ||
        candidateMask(cell) !== candidateMask(dialog.original[i]),
    );

  const isDoubted = (index) =>
    dialog.doubted.has(index) && !dialog.edited.has(index);

  function edit(change) {
    if (!dialog || dialog.loading) return;
    change();
    dialog.error = null;
    renderDialog();
  }

  function setSelectedDigit(digit) {
    edit(() => {
      const index = dialog.selected;
      const cell = dialog.cells[index];
      if (digit === 0) {
        cell.digit = 0;
        cell.role = null;
        cell.candidates = 0;
      } else if (dialog.pencil) {
        const bit = 1 << (digit - 1);
        if (cell.digit) {
          cell.digit = 0;
          cell.role = null;
          cell.candidates = bit;
        } else {
          cell.candidates ^= bit;
        }
      } else if (cell.digit === digit) {
        cell.digit = 0;
        cell.role = null;
      } else {
        if (cell.digit === 0) cell.role = "given";
        cell.digit = digit;
      }
      dialog.edited.add(index);
    });
  }

  function toggleInputMode() {
    if (!dialog) return;
    dialog.pencil = !dialog.pencil;
    renderDialog();
  }

  function toggleSelectedRole() {
    edit(() => {
      const cell = dialog.cells[dialog.selected];
      if (cell.digit) cell.role = cell.role === "user" ? "given" : "user";
    });
  }

  function flipAllRoles() {
    edit(() => {
      for (const cell of dialog.cells) {
        if (cell.digit) cell.role = cell.role === "user" ? "given" : "user";
      }
    });
  }

  function toggleView() {
    if (!dialog?.preview) return;
    dialog.resultOnly = !dialog.resultOnly;
    renderDialog();
  }

  function resetCells() {
    edit(() => {
      dialog.cells = dialog.original.map(copyCell);
      dialog.edited.clear();
    });
  }

  function select(index) {
    if (!dialog) return;
    dialog.selected = index;
    renderDialog();
  }

  function moveSelection(key) {
    const row = Math.floor(dialog.selected / 9);
    const col = dialog.selected % 9;
    const next = {
      ArrowUp: [(row + 8) % 9, col],
      ArrowDown: [(row + 1) % 9, col],
      ArrowLeft: [row, (col + 8) % 9],
      ArrowRight: [row, (col + 1) % 9],
    }[key];
    select(next[0] * 9 + next[1]);
  }

  function requestCancel() {
    if (!dialog || dialog.loading) return;
    if (isDirty()) showPrompt("discard");
    else closeDialog();
  }

  function setPromptLayer(shown) {
    const ui = dialogUi;
    ui.discardLayer.classList.toggle("hidden", !shown);
    ui.discardLayer.classList.toggle("flex", shown);
    ui.panel.toggleAttribute("inert", shown);
  }

  function showPrompt(kind, cells = []) {
    if (dialog.prompt) return;
    dialog.prompt = { kind, cells, returnFocus: document.activeElement };
    if (cells.length) dialog.selected = cells[0];
    // Restyled while hidden, or transition-colors would fade the previous kind's colour in.
    renderDialog();
    setPromptLayer(true);
    dialogUi.keep.focus({ preventScroll: true });
  }

  function renderPrompt() {
    const { kind, cells } = dialog.prompt;
    const [title, desc, go, color] = PROMPTS[kind];
    const ui = dialogUi;
    const names = cells.slice(0, 9).map((i) => `r${Math.floor(i / 9) + 1}c${(i % 9) + 1}`);
    if (cells.length > 9) names.push("…");
    for (const [node, key] of [[ui.promptTitle, title], [ui.promptDesc, desc], [ui.promptGo, go]]) {
      node.dataset.i18n = key;
      node.textContent = t(key, cells.length, names.join(", "));
    }
    ui.promptGo.className = `w-full px-4 py-2 text-white font-semibold rounded-md shadow-sm transition-colors ${color}`;
  }

  function hidePrompt() {
    const prompt = dialog?.prompt;
    if (!prompt) return;
    dialog.prompt = null;
    setPromptLayer(false);
    const back = prompt.returnFocus;
    if (back && back.isConnected && dialogUi.panel.contains(back) && !back.disabled) {
      back.focus({ preventScroll: true });
    } else {
      dialogUi.panel.focus({ preventScroll: true });
    }
  }

  function focusDialogHome() {
    (dialog?.prompt ? dialogUi.keep : dialogUi.panel).focus({ preventScroll: true });
  }

  function missingSolutionCandidates(cells) {
    if (!cells.some(candidateMask)) return [];
    const givens = cells.map((cell) => (cell.digit && cell.role !== "user" ? String(cell.digit) : ".")).join("");
    const validity = getPuzzleValidation(givens);
    if (validity.mode !== "standard") return [];
    const missing = [];
    for (let i = 0; i < 81; i++) {
      const answer = 1 << (validity.solution[Math.floor(i / 9)][i % 9] - 1);
      if (!cells[i].digit && !(candidateMask(cells[i]) & answer)) missing.push(i);
    }
    return missing;
  }

  // Only a bad string (load id +1) settles before loadPuzzle's first await; past that the board is replaced.
  async function confirmDialog(refill = false) {
    if (!dialog || dialog.loading) return;
    if (findConflicts(dialog.cells).length) {
      renderDialog();
      return;
    }
    const missing = refill ? [] : missingSolutionCandidates(dialog.cells);
    if (missing.length) {
      showPrompt("candidates", missing);
      return;
    }
    const cells = refill ? autoPencilled(dialog.cells) : dialog.cells;
    const text = buildImportString(cells);
    dialog.loading = true;
    if (puzzleStringInput) puzzleStringInput.value = text;
    puzzleSelectionRequestId++;
    const before = puzzleLoadRequestId;
    let outcome;
    try {
      outcome = await Promise.race([loadPuzzle(text), STILL_LOADING]);
    } catch (error) {
      console.warn("Image import: the board did not load.", error);
      outcome = null;
    }
    if (!dialog) return;
    dialog.loading = false;
    const rejected =
      outcome === null || (outcome === false && puzzleLoadRequestId === before + 1);
    if (rejected) {
      dialog.error = t("ui_invalid_puzzle_string_error");
      renderDialog();
      return;
    }
    closeDialog();
  }

  function onDialogKeyDown(event) {
    if (!dialog) return;
    event.stopPropagation();
    if (event.isComposing) return;
    const key = event.key;
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (key === "Tab") {
      event.preventDefault();
      moveFocus(event.shiftKey ? -1 : 1);
      return;
    }
    if (!plain) {
      // core.js claims these but never sees them; unprevented, Ctrl+Z/Y would undo the puzzle box behind.
      const lower = key.toLowerCase();
      const claimed =
        ((event.ctrlKey || event.metaKey) && ["z", "y", "e", ","].includes(lower)) ||
        (event.altKey && ["a", "w"].includes(lower));
      if (claimed) event.preventDefault();
      return;
    }
    if (dialog.prompt) {
      if (key === "Escape") {
        event.preventDefault();
        hidePrompt();
      } else if (!((key === "Enter" || key === " ") && event.target?.closest?.("button"))) {
        event.preventDefault();
      }
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      requestCancel();
      return;
    }
    if (key === "Enter") {
      if (event.target?.closest?.("button")) return;
      event.preventDefault();
      confirmDialog();
      return;
    }
    if (key.startsWith("Arrow")) {
      event.preventDefault();
      moveSelection(key);
      return;
    }
    if (key.toLowerCase() === "z") {
      event.preventDefault();
      toggleInputMode();
      return;
    }
    if (key >= "1" && key <= "9" && key.length === 1) {
      event.preventDefault();
      setSelectedDigit(Number(key));
      return;
    }
    if (key === "0" || key === "Delete" || key === "Backspace") {
      event.preventDefault();
      setSelectedDigit(0);
    }
  }

  function focusableButtons() {
    const scope = dialog.prompt ? dialogUi.discardLayer : dialogUi.panel;
    return [...scope.querySelectorAll("button")].filter(
      (button) => !button.disabled && button.offsetParent !== null,
    );
  }

  function moveFocus(step) {
    const buttons = focusableButtons();
    if (!buttons.length) {
      focusDialogHome();
      return;
    }
    const index = buttons.indexOf(document.activeElement);
    if (index === -1 && dialog.prompt) {
      focusDialogHome();
      return;
    }
    const next =
      index === -1
        ? step > 0
          ? 0
          : buttons.length - 1
        : (index + step + buttons.length) % buttons.length;
    buttons[next].focus();
  }

  function onDialogFocusIn(event) {
    if (dialog && !dialogUi.root.contains(event.target)) focusDialogHome();
  }

  function currentLines() {
    return !dialog.resultOnly && dialog.lines
      ? dialog.lines
      : { xs: UNIFORM_LINES, ys: UNIFORM_LINES };
  }

  function lineIndex(lines, value) {
    for (let i = 0; i < 8; i++) {
      if (value < lines[i + 1]) return i;
    }
    return 8;
  }

  function onCanvasClick(event) {
    if (!dialog) return;
    const box = dialogUi.canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const x = ((event.clientX - box.left) / box.width) * PREVIEW_SIZE;
    const y = ((event.clientY - box.top) / box.height) * PREVIEW_SIZE;
    const { xs, ys } = currentLines();
    select(lineIndex(ys, y) * 9 + lineIndex(xs, x));
  }

  function palette() {
    const dark = document.documentElement.classList.contains("dark");
    return dark
      ? {
          paper: "#111827",
          thin: "#4b5563",
          thick: "#e5e7eb",
          given: "#f9fafb",
          user: "#60a5fa",
          candidate: "#9ca3af",
          doubted: "#fb923c",
          conflict: "#f87171",
          selected: "#93c5fd",
          halo: "#111827",
        }
      : {
          paper: "#ffffff",
          thin: "#9ca3af",
          thick: "#111827",
          given: "#111827",
          user: "#1d4ed8",
          candidate: "#4b5563",
          doubted: "#ea580c",
          conflict: "#dc2626",
          selected: "#2563eb",
          halo: "#ffffff",
        };
  }

  function drawDigit(context, digit, role, x, y, size, colors) {
    context.font = `${role === "user" ? "500" : "700"} ${size}px ${FONT}`;
    context.fillStyle = role === "user" ? colors.user : colors.given;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(digit), x, y + size * 0.04);
    if (role === "user") {
      const width = context.measureText(String(digit)).width;
      context.fillRect(x - width / 2, y + size * 0.42, width, Math.max(1.5, size * 0.07));
    }
  }

  function drawMark(context, symbol, x, y, size, fill) {
    context.fillStyle = fill;
    context.beginPath();
    context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    context.fill();
    context.font = `700 ${size * 0.8}px ${FONT}`;
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(symbol, x + size / 2, y + size / 2 + size * 0.04);
  }

  function drawBoard(conflicts) {
    const context = dialogUi.canvas.getContext("2d");
    const colors = palette();
    const showPreview = Boolean(dialog.preview) && !dialog.resultOnly;
    const { xs, ys } = currentLines();
    const order =
      DIGIT_ORDER[typeof candidatePopupFormat !== "undefined" && candidatePopupFormat === "B" ? "B" : "A"];
    context.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
    context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

    if (showPreview) {
      context.imageSmoothingEnabled = true;
      context.drawImage(dialog.preview, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    } else {
      context.fillStyle = colors.paper;
      context.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      for (let i = 0; i <= 9; i++) {
        const thick = i % 3 === 0;
        context.fillStyle = thick ? colors.thick : colors.thin;
        const width = thick ? 3 : 1;
        context.fillRect(xs[i] - width / 2, 0, width, PREVIEW_SIZE);
        context.fillRect(0, ys[i] - width / 2, PREVIEW_SIZE, width);
      }
    }

    for (let index = 0; index < 81; index++) {
      const cell = dialog.cells[index];
      const row = Math.floor(index / 9);
      const col = index % 9;
      const x0 = xs[col];
      const y0 = ys[row];
      const w = xs[col + 1] - x0;
      const h = ys[row + 1] - y0;
      const unit = Math.min(w, h);

      if (showPreview) {
        if (cell.digit) {
          const badge = unit * 0.42;
          const bx = x0 + w - badge - 2;
          const by = y0 + 2;
          context.fillStyle = "rgba(255, 255, 255, 0.92)";
          context.fillRect(bx, by, badge, badge);
          context.strokeStyle = "#374151";
          context.lineWidth = 1;
          context.strokeRect(bx + 0.5, by + 0.5, badge - 1, badge - 1);
          drawDigit(
            context,
            cell.digit,
            cell.role,
            bx + badge / 2,
            by + badge / 2,
            badge * 0.8,
            { given: "#111827", user: "#1d4ed8" },
          );
        }
      } else if (cell.digit) {
        drawDigit(context, cell.digit, cell.role, x0 + w / 2, y0 + h / 2, unit * 0.62, colors);
      } else if (cell.candidates) {
        context.font = `500 ${unit * 0.27}px ${FONT}`;
        context.fillStyle = colors.candidate;
        context.textAlign = "center";
        context.textBaseline = "middle";
        for (let digit = 1; digit <= 9; digit++) {
          if (!(cell.candidates & (1 << (digit - 1)))) continue;
          const slot = order.indexOf(digit);
          context.fillText(
            String(digit),
            x0 + ((slot % 3) + 0.5) * (w / 3),
            y0 + (Math.floor(slot / 3) + 0.5) * (h / 3) + unit * 0.01,
          );
        }
      }

      const mark = unit * 0.3;
      let markY = y0 + 3;
      if (conflicts.has(index)) {
        context.strokeStyle = colors.conflict;
        context.lineWidth = 4;
        context.setLineDash([]);
        context.strokeRect(x0 + 3, y0 + 3, w - 6, h - 6);
        drawMark(context, "×", x0 + 4, markY, mark, colors.conflict);
        markY += mark + 2;
      }
      if (isDoubted(index)) {
        context.strokeStyle = colors.doubted;
        context.lineWidth = 3;
        context.setLineDash([6, 4]);
        context.strokeRect(x0 + 7, y0 + 7, w - 14, h - 14);
        context.setLineDash([]);
        drawMark(context, "?", x0 + 4, markY, mark, colors.doubted);
      }
    }

    const row = Math.floor(dialog.selected / 9);
    const col = dialog.selected % 9;
    const x0 = xs[col];
    const y0 = ys[row];
    const w = xs[col + 1] - x0;
    const h = ys[row + 1] - y0;
    context.setLineDash([]);
    context.lineWidth = 8;
    context.strokeStyle = colors.halo;
    context.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
    context.lineWidth = 4;
    context.strokeStyle = colors.selected;
    context.strokeRect(x0 + 1, y0 + 1, w - 2, h - 2);
  }

  function cellAnnouncement() {
    const index = dialog.selected;
    const cell = dialog.cells[index];
    const mask = candidateMask(cell);
    const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((digit) => mask & (1 << (digit - 1)));
    const parts = cell.digit
      ? [
          String(cell.digit),
          t(cell.role === "user" ? "image_import_role_user" : "image_import_role_given"),
        ]
      : mask
        ? [t("image_import_candidates", candidates.join(" "))]
        : [t("image_import_empty")];
    if (isDoubted(index)) parts.push(t("image_import_uncertain_mark"));
    return t(
      "image_import_cell_status",
      Math.floor(index / 9) + 1,
      (index % 9) + 1,
      parts.join(" · "),
    );
  }

  function statusLines(conflicts) {
    const cells = dialog.cells;
    const lines = [];
    const givens = cells.filter((cell) => cell.digit && cell.role !== "user").length;
    const placed = cells.filter((cell) => cell.digit && cell.role === "user").length;
    const candidateCells = cells.filter((cell) => !cell.digit && cell.candidates).length;
    lines.push([t("image_import_counts", givens, placed, candidateCells), ""]);
    if (conflicts.size) {
      const digits = [...new Set([...conflicts].map((i) => cells[i].digit))].sort();
      lines.push([t("image_import_duplicate", digits.join(", ")), "text-red-600 font-semibold"]);
    }
    let doubted = 0;
    for (let i = 0; i < 81; i++) if (isDoubted(i)) doubted++;
    if (doubted) {
      lines.push([t("image_import_uncertain", doubted), "text-orange-600 dark:text-orange-400"]);
    }
    if (dialog.multipleBoards) {
      lines.push([t("image_import_multiple_boards"), "text-orange-600 dark:text-orange-400"]);
    }
    if (dialog.error) lines.push([dialog.error, "text-red-600 font-semibold"]);
    return lines;
  }

  function renderDialog() {
    if (!dialog) return;
    const ui = dialogUi;
    const conflicts = new Set(findConflicts(dialog.cells));
    drawBoard(conflicts);

    const announcement = cellAnnouncement();
    if (announcement !== dialog.announced.cell) {
      dialog.announced.cell = announcement;
      ui.cellStatus.textContent = announcement;
    }
    const lines = statusLines(conflicts);
    const summary = JSON.stringify(lines);
    if (summary !== dialog.announced.status) {
      dialog.announced.status = summary;
      ui.status.replaceChildren(
        ...lines.map(([text, className]) => {
          const line = element("div", className);
          line.textContent = text;
          return line;
        }),
      );
    }

    const cell = dialog.cells[dialog.selected];
    const lit = dialog.pencil ? candidateMask(cell) : cell.digit ? 1 << (cell.digit - 1) : 0;
    const modeLook = dialog.pencil ? "active-green" : "active";
    ui.digitKeys.forEach((key, i) => {
      const on = Boolean(lit & (1 << i));
      key.className = padLook(KEY_SIZE, on && modeLook);
      key.setAttribute("aria-pressed", String(on));
    });
    const modeKey = dialog.pencil ? "ui_pencil_mode_btn" : "btn_number";
    ui.mode.dataset.i18n = modeKey;
    ui.mode.textContent = t(modeKey);
    ui.mode.setAttribute("aria-pressed", String(dialog.pencil));
    ui.mode.className = padLook(TOOL_SIZE, modeLook);
    ui.view.setAttribute("aria-pressed", String(dialog.resultOnly));
    // Disabled without a preview: .control-btn.active would outrank custom.css's disabled look.
    ui.view.className = padLook(TOOL_SIZE, dialog.preview && dialog.resultOnly && "active");
    ui.load.disabled = conflicts.size > 0;
    if (dialog.prompt) renderPrompt();
    if (!ui.root.contains(document.activeElement)) focusDialogHome();
  }

  function init() {
    document.addEventListener("paste", onPaste);
    ensureImageImportButton();
  }

  root.SudokuImageImport = Object.freeze({
    init,
    handleImageBlob,
    buildImportString,
    findConflicts,
  });
})(globalThis);
