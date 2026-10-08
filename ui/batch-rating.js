(function (root) {
  "use strict";

  const { decompressPuzzleString, parsePuzzleInput, puzzleStringToGrid } =
    root.SudokuPuzzleIO;

  const MODAL_ID = "batch-rating-modal";
  // A leading + marks a placed digit in the library format, not a given.
  const PUZZLE_RUN = /(?:^|[^0-9.+])([0-9.]{81})(?![0-9.])/;
  const MAX_WORKERS = 4;
  const YIELD_MS = 12;
  const BUTTON = {
    primary:
      "px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 shadow-sm transition-colors",
    plain:
      "px-2 py-1 bg-gray-200 text-gray-800 text-sm font-semibold rounded hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 shadow-sm transition-colors",
  };

  function extractPuzzle(line) {
    const run = line.match(PUZZLE_RUN);
    if (run) return run[1].replace(/0/g, ".");
    const filePuzzle = decompressPuzzleString(line);
    if (filePuzzle.length === 81 && /^[0-9.]+$/.test(filePuzzle))
      return filePuzzle.replace(/0/g, ".");
    const parsed = parsePuzzleInput(line, () => false);
    return parsed?.kind === "library" ? parsed.libraryState.givens : null;
  }

  function parseBatchText(text) {
    const rows = [];
    String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .forEach((raw, index) => {
        const line = raw.trim();
        if (!line || line.startsWith("#")) return;
        rows.push({ line: index + 1, text: line, puzzle: extractPuzzle(line) });
      });
    return rows;
  }

  const tenths = (value) =>
    Number.isFinite(value) ? (value / 10).toFixed(1) : "";

  const isRated = (result) => result.type === "standard" || result.type === "joc";

  function formatTxt(rows) {
    return rows
      .filter((row) => row.result)
      .map(({ text, puzzle, result }) =>
        isRated(result)
          ? `${puzzle} ${[result.er, result.ep, result.ed]
              .map((value) => tenths(value) || "-")
              .join("/")}`
          : `${puzzle || text} # ${result.note}`,
      )
      .map((line) => `${line}\r\n`)
      .join("");
  }

  function csvField(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function formatCsv(rows) {
    const lines = [["line", "puzzle", "type", "ER", "EP", "ED", "note"]];
    for (const { line, text, puzzle, result } of rows) {
      if (!result) continue;
      lines.push([
        line,
        puzzle || text,
        result.type,
        tenths(result.er),
        tenths(result.ep),
        tenths(result.ed),
        result.note,
      ]);
    }
    return `\uFEFF${lines
      .map((cells) => `${cells.map(csvField).join(",")}\r\n`)
      .join("")}`;
  }

  let ui = null;
  let current = null;

  function element(tag, className, i18nKey) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (i18nKey) {
      node.dataset.i18n = i18nKey;
      node.textContent = t(i18nKey);
    }
    return node;
  }

  function button(id, look, i18nKey, onClick) {
    const node = element("button", BUTTON[look], i18nKey);
    node.id = id;
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function ensureModal() {
    if (ui) return ui;

    const modal = element(
      "div",
      "fixed inset-0 z-[100] hidden items-center justify-center bg-black/50",
    );
    modal.id = MODAL_ID;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "batch-rating-title");

    const box = element(
      "div",
      "bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg shadow-xl w-[95vw] max-w-sm flex flex-col border border-gray-200 dark:border-gray-700 relative max-h-[85vh] overflow-hidden",
    );
    box.tabIndex = -1;
    const title = element(
      "h3",
      "text-lg font-bold mb-2 text-gray-800 dark:text-gray-100",
      "batch_title",
    );
    title.id = "batch-rating-title";

    const body = element(
      "div",
      "flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar",
    );
    const help = element(
      "p",
      "mb-2 text-sm text-gray-600 dark:text-gray-300",
      "batch_help",
    );
    const input = element(
      "textarea",
      "shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full text-xs border border-gray-300 rounded-md p-2 resize-y whitespace-pre overflow-x-auto font-mono",
    );
    input.id = "batch-rating-input";
    input.rows = 8;
    input.spellcheck = false;
    input.dataset.i18nPlaceholder = "batch_placeholder";
    input.placeholder = t("batch_placeholder");

    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".txt,.csv,text/plain";
    file.className = "hidden";
    file.addEventListener("change", loadFile);

    const actions = element("div", "mt-2 flex flex-wrap gap-2");
    const fileButton = button("batch-rating-file-btn", "plain", "batch_file", () =>
      file.click(),
    );
    const startButton = button("batch-rating-start", "primary", "batch_start", start);
    const stopButton = button("batch-rating-stop", "plain", "batch_stop", stop);
    actions.append(fileButton, startButton, stopButton, file);

    const progress = element("p", "mt-2 text-sm text-gray-700 dark:text-gray-200");
    progress.id = "batch-rating-progress";
    progress.setAttribute("aria-live", "polite");
    const summary = element("p", "mt-1 text-sm text-gray-600 dark:text-gray-300");
    summary.id = "batch-rating-summary";
    body.append(help, input, actions, progress, summary);

    const footer = element(
      "div",
      "mt-3 flex flex-wrap justify-between gap-2 pt-3 border-t border-gray-300 dark:border-gray-700",
    );
    const downloads = element("div", "flex flex-wrap gap-2");
    const txtButton = button("batch-rating-txt", "plain", "batch_download_txt", () =>
      download("sudoku-ratings.txt", formatTxt(current.rows), "text/plain;charset=utf-8"),
    );
    const csvButton = button("batch-rating-csv", "plain", "batch_download_csv", () =>
      download("sudoku-ratings.csv", formatCsv(current.rows), "text/csv;charset=utf-8"),
    );
    downloads.append(txtButton, csvButton);
    const closeButton = button("batch-rating-close", "plain", "btn_close", close);
    footer.append(downloads, closeButton);

    box.append(title, body, footer);
    modal.append(box);
    modal.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    document.body.append(modal);

    ui = {
      modal,
      box,
      input,
      fileButton,
      startButton,
      stopButton,
      progress,
      summary,
      txtButton,
      csvButton,
    };
    render();
    return ui;
  }

  async function loadFile(event) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked || isRunning()) return;
    try {
      ui.input.value = await picked.text();
      ui.summary.textContent = "";
    } catch (error) {
      console.warn("Failed to read the batch file.", error);
      ui.summary.textContent = t("batch_file_error");
    }
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const isRunning = () => Boolean(current && !current.finished);

  function render() {
    if (!ui) return;
    const running = isRunning();
    ui.input.disabled = running;
    ui.fileButton.disabled = running;
    ui.startButton.disabled = running;
    ui.stopButton.disabled = !running;
    const hasResults = Boolean(current && current.done > 0);
    ui.txtButton.disabled = !hasResults;
    ui.csvButton.disabled = !hasResults;
    if (isOpen() && !ui.modal.contains(document.activeElement)) ui.box.focus();
    if (!current) {
      ui.progress.textContent = "";
      ui.summary.textContent = "";
      return;
    }
    const { counts } = current;
    ui.progress.textContent = t("batch_progress", current.done, current.rows.length);
    const summary = t(
      "batch_summary",
      counts.standard,
      counts.joc,
      counts.invalid,
      counts.error,
    );
    ui.summary.textContent = current.stopped
      ? `${t("batch_stopped")} ${summary}`
      : summary;
  }

  function classify(row) {
    if (!row.puzzle) return { type: "invalid", note: t("batch_note_unreadable") };
    const check = checkPuzzleUniqueness(puzzleStringToGrid(row.puzzle));
    if (!check.isValid) return { type: "invalid", note: check.message };
    return check.mode === "only-one-cell"
      ? { type: "joc", options: { onlyOneCell: true } }
      : { type: "standard", options: {} };
  }

  function ratingResult(type, rating) {
    if (rating?.ep == null) return { type: "error", note: t("batch_note_no_rating") };
    return {
      type,
      er: type === "joc" ? null : rating.er,
      ep: rating.ep,
      ed: rating.ed,
    };
  }

  function failedResult(error) {
    const code = typeof error?.code === "string" ? error.code : "error";
    return { type: "error", note: t("batch_note_failed", code) };
  }

  function openClient(run) {
    const client = root.Rating.createClient();
    run.clients.add(client);
    return client;
  }

  function closeClient(run, client) {
    run.clients.delete(client);
    client.terminate();
  }

  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function lane(run) {
    let client = null;
    try {
      while (!run.stopped && run.next < run.rows.length) {
        if (performance.now() - run.lastYield > YIELD_MS) {
          await pause();
          run.lastYield = performance.now();
          continue;
        }
        const row = run.rows[run.next++];
        let result = classify(row);
        if (result.options) {
          try {
            client ??= openClient(run);
            const rating = await client.rate(row.puzzle, "skfr", result.options);
            run.lastYield = performance.now();
            result = ratingResult(result.type, rating);
          } catch (error) {
            if (run.stopped) return;
            result = failedResult(error);
            if (client) closeClient(run, client);
            client = null;
          }
        }
        if (run.stopped) return;
        row.result = result;
        run.counts[result.type]++;
        run.done++;
        if (current === run) render();
      }
    } finally {
      if (client) closeClient(run, client);
    }
  }

  async function start() {
    if (isRunning()) return;
    if (!root.Rating?.createClient) {
      ui.summary.textContent = t("batch_unavailable");
      return;
    }
    const rows = parseBatchText(ui.input.value);
    if (rows.length === 0) {
      current = null;
      render();
      ui.summary.textContent = t("batch_empty");
      return;
    }
    const puzzles = rows.filter((row) => row.puzzle).length;
    const run = {
      rows,
      next: 0,
      done: 0,
      counts: { standard: 0, joc: 0, invalid: 0, error: 0 },
      stopped: false,
      finished: false,
      clients: new Set(),
      lastYield: performance.now(),
    };
    current = run;
    render();
    const width = Math.max(
      1,
      Math.min(MAX_WORKERS, navigator.hardwareConcurrency || 2, puzzles),
    );
    const lanes = Array.from({ length: width }, () => lane(run));
    const outcomes = await Promise.allSettled(lanes);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected")
        console.warn("Batch rating lane failed.", outcome.reason);
    }
    run.finished = true;
    if (current === run) render();
  }

  function stop() {
    const run = current;
    if (!run || run.finished || run.stopped) return;
    run.stopped = true;
    for (const client of run.clients) client.terminate();
    run.clients.clear();
    render();
  }

  function isOpen() {
    return Boolean(ui && !ui.modal.classList.contains("hidden"));
  }

  function open() {
    const { modal, box } = ensureModal();
    render();
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    box.focus();
  }

  function close() {
    stop();
    if (!ui) return;
    ui.modal.classList.add("hidden");
    ui.modal.classList.remove("flex");
  }

  root.BatchRating = Object.freeze({
    open,
    close,
    isOpen,
    parseBatchText,
    formatTxt,
    formatCsv,
  });
})(globalThis);
