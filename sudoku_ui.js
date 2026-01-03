// --- DOM Element Selections ---
const gridContainer = document.getElementById("sudoku-grid");
const puzzleStringInput = document.getElementById("puzzle-string");
const loadBtn = document.getElementById("load-btn");
const solveBtn = document.getElementById("solve-btn");
const clearBtn = document.getElementById("clear-btn");
const clearColorsBtn = document.getElementById("clear-colors-btn");
const autoPencilBtn = document.getElementById("auto-pencil-btn");
const undoBtn = document.getElementById("undo-btn");
const redoBtn = document.getElementById("redo-btn");
const messageArea = document.getElementById("message-area");
const modeSelector = document.getElementById("mode-selector");
const numberPad = document.getElementById("number-pad");
const candidateModal = document.getElementById("candidate-modal");
const candidateGrid = document.getElementById("candidate-grid");
const closeModalBtn = document.getElementById("close-modal-btn");
const formatToggleBtn = document.getElementById("format-toggle-btn");
const exptModeBtn = document.getElementById("expt-mode-btn");
const dateSelect = document.getElementById("date-select");
const levelSelect = document.getElementById("level-select");
const puzzleInfoContainer = document.getElementById("puzzle-info");
const puzzleLevelEl = document.getElementById("puzzle-level");
const puzzleScoreEl = document.getElementById("puzzle-score");
const puzzleTimerEl = document.getElementById("puzzle-timer");
const modeToggleButton = document.getElementById("mode-toggle-btn");
const colorButton = modeSelector.querySelector('[data-mode="color"]');
const difficultyLamp = document.getElementById("difficulty-lamp");
const vagueHintBtn = document.getElementById("vague-hint-btn");

let vagueHintMessage = "";
let currentPuzzleScore = 0;
let lastValidScore = 0;
let isClearStoragePending = false;
let arePencilsHidden = false;
let isSolvingViaButton = false;
let currentElapsedTime = 0;
let currentlyHoveredElement = null;
let pausedElapsedTimes = {};
let puzzleTimers = {}; // { "dateLevel": { elapsedMs, startTime } }
let currentPuzzleKey = null; // Track which puzzle is currently active
let isLoadingSavedGame = false;
let currentHintData = null;
let hintClickCount = 0;

let lampTimestamps = {};
let previousLampColor = null;
let lastValidLampColor = "white";

// --- UI Update Functions ---

function updateColorPalettes(isDarkMode) {
  if (isDarkMode) {
    cellColorPalette = colorPaletteDark;
    candidateColorPalette = colorPaletteLight;
  } else {
    cellColorPalette = colorPaletteLight;
    candidateColorPalette = colorPaletteMid;
  }
}

function updateButtonLabels() {
  const isMobile = window.innerWidth <= 550;
  const titleText = document.getElementById("sudoku-title-text");

  if (titleText) {
    if (isMobile) {
      titleText.innerHTML = ` <a href="https://darksabun.club/" class="hover:underline">D.S.</a>`;
    } else {
      titleText.textContent = " Daily Sudoku";
    }
  }

  if (currentMode === "pencil") {
    modeToggleButton.textContent = isMobile ? "Pen." : "Pen.";
    modeToggleButton.dataset.tooltip =
      "Pencil Mode: Click a cell, then a digit to toggle a candidate. (Z to switch)";
  } else {
    modeToggleButton.textContent = isMobile ? "Num." : "Num. (Z)";
    if (currentMode === "concrete") {
      modeToggleButton.dataset.tooltip =
        "Number Mode: Click a cell, then a digit to set its value. (Z to switch)";
    } else {
      modeToggleButton.dataset.tooltip = "Switch to Number/Pencil mode (Z)";
    }
  }

  if (currentMode === "color") {
    if (coloringSubMode === "cell") {
      colorButton.textContent = isMobile ? "Cell" : "Color: Cell";
      colorButton.dataset.tooltip =
        "Color Cell Mode: Pick a color, then click a cell to paint it. (X to switch)";
    } else {
      colorButton.textContent = isMobile ? "Cand." : "Color: Cand.";
      colorButton.dataset.tooltip =
        "Color Candidate Mode: Pick a color, then click a candidate to paint it. (X to switch)";
    }
  } else {
    colorButton.textContent = isMobile ? "Color" : "Color (X)";
    colorButton.dataset.tooltip = "Switch to Color mode (X)";
  }

  formatToggleBtn.style.display = "none";
  exptModeBtn.style.display = "inline-flex";
  const exptShortcut = isMobile ? "" : " (E)";
  exptModeBtn.textContent =
    (isExperimentalMode ? "Expt!" : "Expt.") + exptShortcut;
  if (isExperimentalMode) {
    exptModeBtn.classList.add("active-green");
    if (isMobile) {
      // Use "past tense" for mobile, describing the new state
      exptModeBtn.dataset.tooltip = "Experimental Mode Enabled!";
    } else {
      // Keep "future tense" for desktop, describing the action
      exptModeBtn.dataset.tooltip = "Disable Experimental Mode (E).";
    }
  } else {
    exptModeBtn.classList.remove("active-green");
    if (isMobile) {
      exptModeBtn.dataset.tooltip = "Experimental Mode Disabled.";
    } else {
      exptModeBtn.dataset.tooltip =
        "Enable Experimental Mode (E): Click candidates directly.";
    }
  }

  vagueHintBtn.textContent = isMobile ? "?" : "? (V)";
  if (isMobile) {
    vagueHintBtn.dataset.tooltip =
      "Get increasingly concrete hints for the next step.";
  } else {
    vagueHintBtn.dataset.tooltip =
      "Get increasingly concrete hints for the next step (V).";
  }

  if (!isMobile) {
    attachTooltipEvents(modeToggleButton);
    attachTooltipEvents(colorButton);
    attachTooltipEvents(exptModeBtn);
  }
}

function addSudokuCoachLink(puzzleString) {
  const container = document.getElementById("solver-link-container");
  if (!container) return;
  container.innerHTML = "";
  if (!puzzleString) return;
  const puzzleForLink = puzzleString.replace(/\./g, "0");
  const solverUrl = `https://sudoku.coach/en/solver/${puzzleForLink}`;
  const link = document.createElement("a");
  link.href = solverUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.dataset.tooltip =
    "Open this puzzle in the Sudoku Coach solver in a new tab (Ctrl+E).";
  const isMobile = window.innerWidth <= 550;
  link.textContent = isMobile
    ? "Export to SC Solver"
    : "Export to Sudoku Coach Solver (Ctrl+E)";
  link.className =
    "w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-orange-500 hover:bg-orange-600";
  container.appendChild(link);
  attachTooltipEvents(link); // Attach events to this newly created element
}

function initBoardState() {
  boardState = Array(9)
    .fill(null)
    .map(() =>
      Array(9)
        .fill(null)
        .map(() => ({
          value: 0,
          isGiven: false,
          pencils: new Set(),
          cellColor: null,
          pencilColors: new Map(),
        }))
    );
}

function createGrid() {
  gridContainer.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const rowEl = document.createElement("div");
    rowEl.className = "grid-row flex";
    for (let j = 0; j < 9; j++) {
      const cellEl = document.createElement("div");
      cellEl.className = "sudoku-cell";
      cellEl.dataset.row = i;
      cellEl.dataset.col = j;
      rowEl.appendChild(cellEl);
    }
    gridContainer.appendChild(rowEl);
  }
}

function updateControls() {
  numberPad.innerHTML = "";
  if (currentMode === "color") {
    const activePalette =
      coloringSubMode === "candidate"
        ? candidateColorPalette
        : cellColorPalette;
    for (let i = 0; i < 9; i++) {
      const btn = document.createElement("button");
      btn.style.backgroundColor = activePalette[i];
      btn.dataset.color = activePalette[i];
      btn.textContent = i + 1;
      const isDarkMode =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      const labelColor =
        coloringSubMode === "candidate"
          ? isDarkMode
            ? "#1f2937"
            : "#e5e7eb"
          : "rgba(255,255,255,0.6)";
      btn.className =
        "color-btn p-2 text-lg font-bold border rounded-md shadow-sm h-12";
      btn.style.color = labelColor;
      btn.addEventListener("mouseenter", () => {
        btn.style.filter = isDarkMode ? "brightness(1.25)" : "brightness(0.9)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.filter = "brightness(1)";
      });
      numberPad.appendChild(btn);
    }
  } else {
    for (let i = 1; i <= 9; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.dataset.number = i;
      btn.className =
        "p-2 text-lg font-bold border rounded-md shadow-sm hover:bg-gray-100 h-12";
      numberPad.appendChild(btn);
    }
  }
}

function renderBoard() {
  const cells = gridContainer.querySelectorAll(".sudoku-cell");
  const isMobile = window.innerWidth <= 550;
  cells.forEach((cell) => {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const state = boardState[row][col];
    cell.innerHTML = "";
    cell.classList.remove(
      "selected",
      "selected-green",
      "invalid",
      "highlighted"
    );
    cell.style.backgroundColor = state.cellColor || "";
    if (state.cellColor) {
      cell.classList.add("has-color");
    } else {
      cell.classList.remove("has-color");
    }
    cell.addEventListener("mouseover", () => {
      currentlyHoveredElement = cell; // Track the cell
      if (
        currentMode === "color" &&
        coloringSubMode === "cell" &&
        selectedColor
      ) {
        cell.style.backgroundColor = selectedColor;
      }
    });
    cell.addEventListener("mouseout", () => {
      currentlyHoveredElement = null; // Clear tracking on leave
      if (currentMode === "color" && coloringSubMode === "cell") {
        cell.style.backgroundColor = state.cellColor || "";
      }
    });
    if (row === selectedCell.row && col === selectedCell.col) {
      const useGreenHighlight =
        currentMode === "pencil" ||
        (currentMode === "color" && coloringSubMode === "candidate");
      if (useGreenHighlight) {
        cell.classList.add("selected-green");
      } else {
        cell.classList.add("selected");
      }
    }
    const content = document.createElement("div");
    content.className = "cell-content";
    if (state.value !== 0) {
      content.textContent = state.value;
      content.classList.add(state.isGiven ? "given-value" : "user-value");
    } else if (!arePencilsHidden && state.pencils.size > 0) {
      const pencilGrid = document.createElement("div");
      pencilGrid.className = "pencil-grid";
      const orderA = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const orderB = [7, 8, 9, 4, 5, 6, 1, 2, 3];
      const currentOrder = candidatePopupFormat === "A" ? orderA : orderB;
      currentOrder.forEach((i) => {
        const mark = document.createElement("div");
        mark.className = "pencil-mark";
        if (state.pencils.has(i)) {
          mark.textContent = i;
          if (state.pencilColors.has(i)) {
            mark.style.color = state.pencilColors.get(i);
          }
          if (!isMobile || (isMobile && isExperimentalMode)) {
            mark.addEventListener("mouseover", (e) => {
              e.stopPropagation(); // Prevents the cell from getting the event
              currentlyHoveredElement = mark;
              if (
                currentMode === "color" &&
                coloringSubMode === "candidate" &&
                selectedColor
              ) {
                mark.style.color = selectedColor;
              }
            });
            mark.addEventListener("mouseout", (e) => {
              e.stopPropagation(); // Prevents the cell from getting the event
              currentlyHoveredElement = null;
              mark.style.color = state.pencilColors.get(i) || "";
            });
            mark.addEventListener("click", (e) => {
              if (
                currentMode === "color" &&
                coloringSubMode === "candidate" &&
                selectedColor
              ) {
                e.stopPropagation();
                const cellState = boardState[row][col];
                const currentColor = cellState.pencilColors.get(i);
                if (currentColor === selectedColor) {
                  cellState.pencilColors.delete(i);
                } else {
                  cellState.pencilColors.set(i, selectedColor);
                }
                saveState();
                renderBoard();
              } else if (isExperimentalMode && currentMode === "pencil") {
                e.stopPropagation();
                const cellState = boardState[row][col];
                if (cellState.pencils.has(i)) {
                  cellState.pencils.delete(i);
                  saveState();
                  onBoardUpdated();
                }
              } else if (isExperimentalMode && currentMode === "concrete") {
                e.stopPropagation();
                const cellState = boardState[row][col];
                if (cellState.isGiven) return;
                cellState.value = i;
                cellState.pencils.clear();
                autoEliminatePencils(row, col, i);
                saveState();
                onBoardUpdated();
                checkCompletion();
              }
            });
          }
        }
        pencilGrid.appendChild(mark);
      });
      content.appendChild(pencilGrid);
    }
    cell.appendChild(content);
    if (highlightState === 1 && highlightedDigit !== null) {
      if (
        state.value === highlightedDigit ||
        (state.value === 0 && state.pencils.has(highlightedDigit))
      ) {
        cell.classList.add("highlighted");
      }
    } else if (highlightState === 2) {
      if (state.value === 0 && state.pencils.size === 2) {
        cell.classList.add("highlighted");
      }
    }
  });
  validateBoard();
}

// --- Custom Tooltip Logic ---
const tooltipEl = document.getElementById("custom-tooltip");
let tooltipHideTimeout = null;
let activeTooltipElement = null;

function showTooltip(targetElement) {
  if (targetElement.tooltipInstance) {
    targetElement.tooltipInstance.remove();
    targetElement.tooltipInstance = null;
  }

  let tooltipText = targetElement.dataset.tooltip;
  if (!tooltipText) return;

  // Conditionally remove ALL parenthetical phrases on mobile
  const isMobile = window.innerWidth <= 550;
  if (isMobile) {
    // This regex now globally removes any parenthetical phrase from the string
    tooltipText = tooltipText.replace(/\s*\([^)]+\)/g, "").trim();
  }

  // 1. Create a new tooltip element
  const tooltipEl = document.createElement("div");
  tooltipEl.className = "custom-tooltip";
  tooltipEl.textContent = tooltipText; // Use the potentially modified text

  // 2. Store it on the target element for later reference
  targetElement.tooltipInstance = tooltipEl;
  document.body.appendChild(tooltipEl);

  // --- Positioning Logic ---
  const targetRect = targetElement.getBoundingClientRect();
  const tooltipRect = tooltipEl.getBoundingClientRect();

  // Define which elements should have their tooltips appear below on mobile
  const elementsForBottomTooltip = [
    "mode-toggle-btn",
    "expt-mode-btn",
    "difficulty-lamp",
    "vague-hint-btn",
  ];
  const isColorButton = targetElement.dataset.mode === "color"; // Special check for the color button

  let top;
  let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;

  // Conditionally position the tooltip below the button on mobile for specific elements
  if (
    isMobile &&
    (elementsForBottomTooltip.includes(targetElement.id) || isColorButton)
  ) {
    // Position BELOW the button
    top = targetRect.bottom + 8; // 8px gap
  } else {
    // Default position: ABOVE the element
    top = targetRect.top - tooltipRect.height - 8; // 8px gap
  }
  // Boundary checks
  // If positioning it 'above' pushes it off-screen, flip it to 'below'
  if (top < 8) {
    top = targetRect.bottom + 8;
  }
  // If positioning it 'below' pushes it off-screen, flip it back to 'above'
  if (top + tooltipRect.height > window.innerHeight - 8) {
    top = targetRect.top - tooltipRect.height - 8;
  }
  if (left < 8) {
    left = 8;
  }
  if (left + tooltipRect.width > window.innerWidth - 8) {
    left = window.innerWidth - tooltipRect.width - 8;
  }

  tooltipEl.style.top = `${top}px`;
  tooltipEl.style.left = `${left}px`;

  // 3. Use requestAnimationFrame to trigger the fade-in transition
  requestAnimationFrame(() => {
    tooltipEl.classList.add("visible");
  });
}

function hideTooltip(targetElement) {
  const tooltipEl = targetElement.tooltipInstance;
  if (!tooltipEl) return;

  // 1. Trigger the fade-out transition
  tooltipEl.classList.remove("visible");

  // 2. Listen for the transition to end, then remove the element
  tooltipEl.addEventListener(
    "transitionend",
    () => {
      tooltipEl.remove();
    },
    { once: true }
  ); // Important: 'once' cleans up the listener automatically

  // 3. Clear the reference
  targetElement.tooltipInstance = null;
}

function attachTooltipEvents(element) {
  const isMobile = window.innerWidth <= 550;

  if (isMobile) {
    // --- Mobile Touch Behavior (REVISED) ---
    element.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevents the global click listener from firing right away

      // If a tooltip is already shown for this exact element, do nothing.
      // This makes it "sticky" instead of toggling off.
      if (activeTooltipElement === element) {
        return;
      }

      // If a different tooltip is open, hide it.
      if (activeTooltipElement) {
        hideTooltip(activeTooltipElement);
      }

      // Show the new tooltip and track it as the active one.
      showTooltip(element);
      activeTooltipElement = element;
    });
  } else {
    // --- Desktop Hover Behavior (Unchanged) ---
    element.addEventListener("mouseenter", () => showTooltip(element));
    element.addEventListener("mouseleave", () => hideTooltip(element));
  }
}

/**
 * Update lamp UI and optionally record timestamp progression.
 * @param {string} color - lamp color
 * @param {object} opts - options
 * opts.record (boolean) - whether to run timestamp bookkeeping (default true).
 * opts.level (number|null) - the exact difficulty level evaluated (optional).
 */
function updateLamp(color, { record = true, level = null } = {}) {
  if (!difficultyLamp) return;

  const allColors = [
    "white",
    "green",
    "yellow",
    "orange",
    "red",
    "violet",
    "gray",
    "black",
    "bug",
  ];

  // Always update visual state so undos/redos show correct lamp
  currentLampColor = color;
  difficultyLamp.classList.remove(...allColors.map((c) => `lamp-${c}`));
  difficultyLamp.classList.add(`lamp-${color}`);

  // Visual-only states that must never touch timestamp logic
  if (color === "black") {
    difficultyLamp.dataset.tooltip =
      "Error: An incorrect progress has been made.";
    return;
  }
  if (color === "bug") {
    difficultyLamp.dataset.tooltip =
      "Bug: Report it to fsrs please!"; /* Currently not used*/
    return;
  }

  // --- Tooltip Generation Logic ---
  const baseLabels = {
    white: "Easy",
    green: "Medium",
    yellow: "Hard",
    orange: "Unfair",
    red: "Extreme",
    violet: "Insane",
    gray: "Invalid",
  };

  const defaultRanges = {
    white: "Level 0",
    green: "Level 1 - 2",
    yellow: "Level 3 - 5",
    orange: "Level 6",
    red: "Level 7 - 8",
    violet: "Level 9+",
    gray: "This puzzle does not have a unique solution.",
  };

  let tooltipText = "Difficulty Indicator";

  if (baseLabels[color]) {
    const label = baseLabels[color];
    let desc = defaultRanges[color] || "";

    // If a specific level is provided (and it's a solved state color), use it
    if (level !== null && color !== "violet" && color !== "gray") {
      desc = `Level ${level}`;
    }

    tooltipText = `${label}: ${desc}`;
  }

  if (window.innerWidth <= 550) {
    tooltipText = tooltipText.replace("Level", "Lv.");
  }

  difficultyLamp.dataset.tooltip = tooltipText;

  // If caller asked to skip timestamp bookkeeping (undo/redo / restore / loading), return now
  if (!record || isLoadingSavedGame) {
    // CRITICAL FIX: When loading a saved game, we still need to update previousLampColor
    if (isLoadingSavedGame && !["black", "bug", "gray"].includes(color)) {
      lastValidLampColor = color;
      previousLampColor = color;
    }
    return;
  }

  // -------------------------
  // Timestamp bookkeeping (record === true AND not loading)
  // -------------------------
  const colorHierarchy = {
    bug: 8,
    gray: 8,
    violet: 7,
    red: 6,
    orange: 5,
    yellow: 4,
    green: 3,
    white: 2,
  };

  const previousRank = colorHierarchy[previousLampColor] || 9;
  const currentRank = colorHierarchy[color] || 9;

  // If difficulty *decreased* (e.g., red -> orange -> ... -> white)
  if (currentRank < previousRank) {
    const colorsToSet = Object.keys(colorHierarchy).filter(
      (key) =>
        colorHierarchy[key] < previousRank && colorHierarchy[key] >= currentRank
    );
    colorsToSet.forEach((colorName) => {
      // Overwrite with the latest time for authoritative final run
      lampTimestamps[colorName] = currentElapsedTime;
    });
  }
  // If difficulty increased (e.g., white -> green) clear timestamps lower than new rank.
  else if (currentRank > previousRank) {
    const colorsToReset = Object.keys(colorHierarchy).filter(
      (key) => colorHierarchy[key] < currentRank
    );
    colorsToReset.forEach((colorName) => {
      if (lampTimestamps[colorName]) {
        delete lampTimestamps[colorName];
      }
    });
  }

  // commit previous color after bookkeeping
  if (!["black", "bug", "gray"].includes(color)) {
    lastValidLampColor = color;
  }
  previousLampColor = color;
}

/**
 * Checks if the current board state exactly matches the pre-computed solution.
 * @returns {boolean} True if the board matches the solution, otherwise false.
 */
function isBoardIdenticalToSolution() {
  // If there's no solution board available (e.g., for an invalid puzzle), it can't be solved.
  if (!solutionBoard) {
    return false;
  }

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      // If any cell in the current state doesn't match the solution, return false immediately.
      if (boardState[r][c].value !== solutionBoard[r][c]) {
        return false;
      }
    }
  }

  // If all cells match, the board is correctly solved.
  return true;
}
// --- Event Handlers and Listeners ---

function setupEventListeners() {
  loadExperimentalModePreference(); // Load the user's preference first
  gridContainer.addEventListener("click", handleCellClick);

  // MODIFIED: Pass the event object 'e' to the handler
  modeSelector.addEventListener("click", (e) => handleModeChange(e));

  numberPad.addEventListener("click", handleNumberPadClick);
  loadBtn.addEventListener("click", () => loadPuzzle(puzzleStringInput.value));

  // --- Auto-format & Auto-resize Textarea ---
  puzzleStringInput.addEventListener("input", function () {
    // 1. Auto-format valid 81-char strings into 9 lines
    const raw = this.value.replace(/\s/g, "");
    if (raw.length === 81 && /^[0-9.]+$/.test(raw)) {
      const formatted = raw.match(/.{1,9}/g).join("\n");
      if (this.value !== formatted) {
        this.value = formatted;
      }
    }

    // 2. Auto-resize height
    this.style.height = "auto"; // Reset to shrink if needed
    this.style.height = this.scrollHeight + "px"; // Expand to fit content
  });

  solveBtn.addEventListener("click", solve);
  clearBtn.addEventListener("click", () => {
    clearUserBoard();
    clearAllColors();
    showMessage("Board cleared.", "gray");
  });
  clearColorsBtn.addEventListener("click", clearAllColors);
  autoPencilBtn.addEventListener("click", autoPencil);
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  closeModalBtn.addEventListener("click", () =>
    candidateModal.classList.add("hidden")
  );
  window.addEventListener("resize", updateButtonLabels);
  formatToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    candidatePopupFormat = candidatePopupFormat === "A" ? "B" : "A";
    // updateButtonLabels();
    const tip = `Candidate display set to ${
      candidatePopupFormat === "A" ? "Numpad (A)" : "Phone (B)"
    } layout.`;
    showMessage(tip, "gray");
    renderBoard();
    if (
      !candidateModal.classList.contains("hidden") &&
      selectedCell.row !== null
    ) {
      showCandidatePopup(selectedCell.row, selectedCell.col);
    }
  });
  dateSelect.addEventListener("change", () => {
    if (dateSelect.value === "custom") {
      dateModal.classList.remove("hidden");
      dateModal.classList.add("flex");
      dateInput.value = "";
      dateError.textContent = "";
      dateInput.focus();
    } else {
      findAndLoadSelectedPuzzle();
    }
  });
  levelSelect.addEventListener("change", findAndLoadSelectedPuzzle);
  document.addEventListener("keydown", handleKeyDown);

  const isMobile = window.innerWidth <= 550;
  if (!isMobile) {
    modeToggleButton.addEventListener("mouseenter", () => {
      if (currentMode === "concrete") {
        modeToggleButton.textContent = "Pencil?";
      } else if (currentMode === "pencil") {
        modeToggleButton.textContent = "Number?";
      }
    });
    modeToggleButton.addEventListener("mouseleave", () => {
      updateButtonLabels();
    });

    colorButton.addEventListener("mouseenter", () => {
      if (currentMode === "color") {
        if (coloringSubMode === "cell") {
          colorButton.textContent = "Color: Cand?";
        } else {
          colorButton.textContent = "Color: Cell?";
        }
      }
    });
    colorButton.addEventListener("mouseleave", () => {
      updateButtonLabels();
    });
  }

  const dateModal = document.getElementById("date-modal");
  const dateInput = document.getElementById("date-input");
  const dateError = document.getElementById("date-error");
  const dateSubmitBtn = document.getElementById("date-submit-btn");
  const dateCancelBtn = document.getElementById("date-cancel-btn");
  dateInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      dateModal.classList.add("hidden");
      dateModal.classList.remove("flex");
      dateSelect.value = dateSelect.querySelector("option").value;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      dateSubmitBtn.click();
    }
    if (e.key === "Backspace") {
      const pos = dateInput.selectionStart;
      if (pos && (pos === 5 || pos === 8)) {
        dateInput.setSelectionRange(pos - 1, pos - 1);
      }
    }
  });
  dateInput.addEventListener("input", () => {
    let val = dateInput.value.replace(/\D/g, "");
    if (val.length > 8) val = val.slice(0, 8);
    let formatted = "";
    if (val.length > 0) formatted = val.slice(0, 4);
    if (val.length > 4) formatted += "-" + val.slice(4, 6);
    if (val.length > 6) formatted += "-" + val.slice(6, 8);
    dateInput.value = formatted;
  });
  dateSelect.addEventListener("change", () => {
    if (dateSelect.value === "custom") {
      dateModal.classList.remove("hidden");
      dateModal.classList.add("flex");
      dateInput.value = "";
      dateError.textContent = "";
      dateInput.focus();
      return;
    }
    findAndLoadSelectedPuzzle();
  });
  dateSubmitBtn.addEventListener("click", () => {
    const rawValue = dateInput.value.replace(/\D/g, "");
    if (!isValidDate(rawValue)) {
      dateError.textContent =
        "Please enter a valid calendar date (YYYY-MM-DD).";
      return;
    }
    const dateNum = parseInt(rawValue, 10);
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const kstOffset = 9 * 60 * 60 * 1000;
    const today = new Date(utc + kstOffset);
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayNum = parseInt(`${yyyy}${mm}${dd}`);
    const todayStr = `${yyyy}-${mm}-${dd}`;
    if (dateNum < 20260101 || dateNum > todayNum) {
      dateError.textContent = `Date must be between 2026-01-01 and ${todayStr}.`;
      return;
    }
    let customOption = [...dateSelect.options].find(
      (opt) => opt.value === rawValue
    );
    if (!customOption) {
      customOption = document.createElement("option");
      customOption.value = rawValue;
      customOption.textContent = `${rawValue.slice(0, 4)}-${rawValue.slice(
        4,
        6
      )}-${rawValue.slice(6, 8)}`;
      dateSelect.appendChild(customOption);
    }
    dateSelect.value = rawValue;
    dateModal.classList.add("hidden");
    dateModal.classList.remove("flex");
    findAndLoadSelectedPuzzle();
  });
  dateCancelBtn.addEventListener("click", () => {
    dateModal.classList.add("hidden");
    dateModal.classList.remove("flex");
    dateSelect.value = dateSelect.querySelector("option").value;
  });
  vagueHintBtn.addEventListener("click", () => {
    if (isBoardIdenticalToSolution()) {
      showMessage("The Sudoku is already solved!", "green");
      return;
    }
    if (currentLampColor === "gray") {
      showMessage("No hint available for an invalid puzzle.", "red");
      return;
    } else if (currentLampColor === "black") {
      showMessage("Hint unavailable: a wrong progress has been made.", "red");
      return;
    }

    if (vagueHintMessage) {
      hintClickCount++; // Increment click count

      let message = "";
      let color = "green"; // Default text color

      if (!currentHintData || !currentHintData.hint) {
        message = `Vague Hint: ${vagueHintMessage}`;
      } else {
        const h = currentHintData.hint;
        const { r, c, num, type } = currentHintData;

        // --- 3-Tier Hint Logic ---
        if (hintClickCount === 1) {
          // Tier 1: Technique Name Only
          message = `Vague Hint: ${h.name}`;
        } else if (hintClickCount === 2) {
          // Tier 2: Specific Info
          message = `Hint: ${h.name} - ${h.mainInfo || ""}`;
        } else {
          // Tier 3: Concrete Action (Formatted)
          let actionStr = "";

          if (type === "place") {
            actionStr = `r${r + 1}c${c + 1} = ${num}`;
          } else {
            const cells = currentHintData.cells || [];

            // 1. Group by removal digit
            const removalsByDigit = new Map();
            cells.forEach((cell) => {
              if (!removalsByDigit.has(cell.num)) {
                removalsByDigit.set(cell.num, []);
              }
              removalsByDigit.get(cell.num).push({ r: cell.r, c: cell.c });
            });

            // 2. Format each group with compact notation
            const groups = [];
            const sortedDigits = Array.from(removalsByDigit.keys()).sort(
              (a, b) => a - b
            );

            for (const d of sortedDigits) {
              const cellGroup = removalsByDigit.get(d);

              // Sort cells: Row first, then Column
              cellGroup.sort((a, b) => a.r - b.r || a.c - b.c);

              let locStr = "";
              const firstR = cellGroup[0].r;
              const isSameRow = cellGroup.every((c) => c.r === firstR);
              const firstC = cellGroup[0].c;
              const isSameCol = cellGroup.every((c) => c.c === firstC);

              if (isSameRow) {
                // Same Row: r1c78
                const cols = cellGroup.map((c) => c.c + 1).join("");
                locStr = `r${firstR + 1}c${cols}`;
              } else if (isSameCol) {
                // Same Column: r23c8
                const rows = cellGroup.map((c) => c.r + 1).join("");
                locStr = `r${rows}c${firstC + 1}`;
              } else {
                // Mixed: Group by Row (r1c45,r2c6)
                const rowMap = new Map();
                for (const c of cellGroup) {
                  if (!rowMap.has(c.r)) rowMap.set(c.r, []);
                  rowMap.get(c.r).push(c.c);
                }
                const parts = [];
                for (const [r, cols] of rowMap) {
                  const colStr = cols.map((c) => c + 1).join("");
                  parts.push(`r${r + 1}c${colStr}`);
                }
                locStr = parts.join(",");
              }

              groups.push(`${locStr}<>${d}`);
            }

            actionStr = groups.join(", ");
          }

          message = `Concrete Hint: ${h.name} -> ${actionStr}`;
          color = "blue";
          hintClickCount = 0;
        }
      }

      // Map "blue" to appropriate class or pass directly if supported
      showMessage(message, color === "blue" ? "blue" : "green");
    } else {
      showMessage("Hint is only available until Level 8 techniques.", "orange");
    }
  });
  exptModeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (arePencilsHidden && !isExperimentalMode) {
      showMessage(
        "Experimental mode is disabled while marks are hidden.",
        "orange"
      );
      return;
    }
    isExperimentalMode = !isExperimentalMode;
    saveExperimentalModePreference();
    updateButtonLabels();
    let tip = "";
    if (isExperimentalMode) {
      tip = isMobile
        ? "Expt. ON: Direct coloring, plus click candidates to remove (Pencil) or set (Number)."
        : "Expt. ON: Click candidates to remove (Pencil mode) or set as value (Number mode).";
    } else {
      tip = isMobile
        ? "Expt. OFF: Popup coloring enabled."
        : "Expt. OFF: Click-to-set/remove candidates disabled.";
    }
    showMessage(tip, "gray");

    // Add the same mobile tooltip logic here
    if (isMobile) {
      if (activeTooltipElement) {
        hideTooltip(activeTooltipElement);
      }
      showTooltip(exptModeBtn);
      activeTooltipElement = exptModeBtn;
    } else {
      // For desktop, if the tooltip is currently visible when clicked, hide it.
      if (exptModeBtn.tooltipInstance) {
        hideTooltip(exptModeBtn);
      }
    }
  });

  // Attach tooltip events to all elements that have the data-tooltip attribute.
  document.querySelectorAll("[data-tooltip]").forEach(attachTooltipEvents);

  // Manually attach listeners to the remaining dynamic buttons.
  attachTooltipEvents(vagueHintBtn);

  // --- Global listener to close mobile tooltips when clicking away ---
  document.addEventListener("click", () => {
    if (activeTooltipElement) {
      hideTooltip(activeTooltipElement);
      activeTooltipElement = null;
    }
  });
  // --- Year Sticker Interaction ---
  const sticker = document.getElementById("year-sticker");
  if (sticker) {
    sticker.addEventListener("click", (e) => {
      // Prevent any other click actions (just in case)
      e.stopPropagation();
      e.preventDefault();

      // Add the falling class to trigger CSS animation
      sticker.classList.add("sticker-falling");

      setTimeout(() => {
        // This triggers the CSS transition we just added.
        // The width shrinks to 0 over 0.8 seconds, causing the title to slide center.
        sticker.classList.add("sticker-collapsed");
      }, 1200); // Start sliding slightly before the drop finishes (1.5s) for a smoother feel
    });
  }
}

function handleKeyDown(e) {
  const key = e.key;
  const key_lower = e.key.toLowerCase();
  const isCtrlOrCmd = e.ctrlKey || e.metaKey;

  if (isCtrlOrCmd && key_lower === "c") {
    if (
      (document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA") &&
      window.getSelection().toString()
    ) {
      return;
    }
    e.preventDefault();
    const asciiBoard = generateAsciiGrid();
    navigator.clipboard
      .writeText(asciiBoard)
      .then(() => {
        showMessage("Board state copied to clipboard!", "green");
      })
      .catch((err) => {
        console.error("Copy failed:", err);
        showMessage("Failed to copy to clipboard.", "red");
      });
    return;
  }
  if (e.altKey && key_lower === "w") {
    e.preventDefault();
    if (!isClearStoragePending) {
      showMessage(
        "Press <span class='shortcut-highlight'>Alt+W</span> again to clear ALL saved data and the current board.",
        "orange"
      );
      isClearStoragePending = true;
      return;
    }
    // Actions on second press
    localStorage.removeItem("sudokuSaves");
    localStorage.removeItem("sudokuExperimentalMode");
    clearUserBoard(); // Clears the current board state
    showMessage("All saved data cleared and board has been reset.", "green");
    isClearStoragePending = false; // Reset flag after completion
    return;
  }
  if (e.altKey && key_lower === "a") {
    e.preventDefault();
    arePencilsHidden = !arePencilsHidden;
    if (arePencilsHidden) {
      let message =
        "Pencil marks hidden. (Press <span class='shortcut-highlight'>Alt+A</span> to make visible)";
      // Force-switch from pencil to number mode if active
      if (currentMode === "pencil") {
        currentMode = "concrete";
        message += " Switched to Number mode.";
      }
      // Force-switch from candidate to cell coloring if active
      if (currentMode === "color" && coloringSubMode === "candidate") {
        coloringSubMode = "cell";
        message += " Switched to Cell coloring mode.";
      }
      // Force-disable experimental mode if active
      if (isExperimentalMode) {
        isExperimentalMode = false;
        message += " Experimental mode disabled.";
      }
      showMessage(message, "gray");
      updateControls();
      updateButtonLabels();
      renderBoard();
    } else {
      showMessage("Pencil marks are now visible.", "gray");
      renderBoard();
    }
    return;
  }
  if (isCtrlOrCmd && key_lower === "z") {
    e.preventDefault();
    undo();
    return;
  }
  if (isCtrlOrCmd && key_lower === "y") {
    e.preventDefault();
    redo();
    return;
  }
  if (isCtrlOrCmd && key_lower === "e") {
    e.preventDefault();
    const solverButton = document.querySelector("#solver-link-container a");
    if (solverButton) {
      solverButton.click();
    }
    return;
  }
  if (
    document.activeElement.tagName === "INPUT" ||
    document.activeElement.tagName === "TEXTAREA"
  ) {
    return;
  }
  if (key === "Escape" && !candidateModal.classList.contains("hidden")) {
    candidateModal.classList.add("hidden");
    return;
  }
  if (!candidateModal.classList.contains("hidden")) {
    if (key >= "1" && key <= "9") {
      const candidateButtons = candidateGrid.querySelectorAll("button");
      let targetButton = null;
      candidateButtons.forEach((btn) => {
        if (btn.textContent === key) {
          targetButton = btn;
        }
      });
      if (targetButton && !targetButton.disabled) {
        targetButton.click();
      }
    }
    return;
  }
  if (key.startsWith("Arrow")) {
    e.preventDefault();
    let { row, col } = selectedCell;
    if (row === null || col === null) {
      selectedCell = { row: 0, col: 0 };
    } else {
      if (key === "ArrowUp") {
        selectedCell.row = (row - 1 + 9) % 9;
      } else if (key === "ArrowDown") {
        selectedCell.row = (row + 1) % 9;
      } else if (key === "ArrowLeft") {
        selectedCell.col = (col - 1 + 9) % 9;
      } else if (key === "ArrowRight") {
        selectedCell.col = (col + 1) % 9;
      }
    }
    onBoardUpdated();
    return;
  }
  if (key === "Enter") {
    if (selectedCell.row !== null) {
      const cellState = boardState[selectedCell.row][selectedCell.col];
      if (highlightState === 0 && cellState.pencils.size === 2) {
        highlightedDigit = null;
        highlightState = 2;
      } else if (cellState.value !== 0) {
        if (highlightedDigit !== cellState.value) {
          highlightedDigit = cellState.value;
          highlightState = 1;
        } else {
          highlightedDigit = null;
          highlightState = 0;
        }
      }
      onBoardUpdated();
    }
    return;
  }
  if (!isCtrlOrCmd && key === "Shift") {
    highlightedDigit = null;
    highlightState = 0;
    onBoardUpdated(true);
    return;
  }
  if (key === "Delete" || key === "Backspace") {
    e.preventDefault();
    if (selectedCell.row !== null) {
      const { row, col } = selectedCell;
      const cellState = boardState[row][col];
      if (
        !cellState.isGiven &&
        (cellState.value !== 0 || cellState.pencils.size > 0)
      ) {
        cellState.value = 0;
        cellState.pencils.clear();
        saveState();
        onBoardUpdated();
      }
    }
    return;
  }
  if (key_lower === "z") {
    modeToggleButton.click();
    return;
  }
  if (key_lower === "x") {
    colorButton.click();
    return;
  }
  if (key_lower === "c") {
    if (
      currentMode === "color" &&
      selectedCell.row !== null &&
      selectedColor !== null
    ) {
      if (coloringSubMode === "cell") {
        const { row, col } = selectedCell;
        const cellState = boardState[row][col];
        const oldColor = cellState.cellColor;
        const newColor = oldColor === selectedColor ? null : selectedColor;
        if (oldColor !== newColor) {
          cellState.cellColor = newColor;
          saveState();
        }
      } else {
        showCandidatePopup(selectedCell.row, selectedCell.col);
      }
      onBoardUpdated();
    }
    return;
  }
  if (key_lower === "v") {
    vagueHintBtn.click();
    return;
  }
  if (key_lower === "d") {
    formatToggleBtn.click();
    return;
  }
  if (key_lower === "a" && !isCtrlOrCmd && !e.altKey) {
    autoPencilBtn.click();
    return;
  }
  if (key_lower === "s" && !isCtrlOrCmd) {
    solveBtn.click();
    return;
  }
  if (key_lower === "e" && !isCtrlOrCmd) {
    if (arePencilsHidden) {
      showMessage(
        "Experimental mode is disabled while marks are hidden. (Press Alt+A to make visible)",
        "orange"
      );
      return;
    }
    exptModeBtn.click();
    return;
  }
  if (key_lower === "q") {
    clearBtn.click();
    return;
  }
  if (key_lower === "w" && !e.altKey) {
    clearColorsBtn.click();
    return;
  }
  if (key >= "1" && key <= "9") {
    if (currentMode === "color") {
      const colorButtons = numberPad.querySelectorAll("button");
      const colorIndex = parseInt(key) - 1;
      if (colorButtons[colorIndex]) {
        colorButtons[colorIndex].click();
      }
    } else if (currentMode === "concrete" || currentMode === "pencil") {
      if (selectedCell.row === null) return;
      const numPadButton = numberPad.querySelector(
        `button[data-number="${key}"]`
      );
      if (numPadButton) {
        numPadButton.click();
      }
    }
  }
}

function handleCellClick(e) {
  const cell = e.target.closest(".sudoku-cell");
  if (!cell) return;
  selectedCell.row = parseInt(cell.dataset.row);
  selectedCell.col = parseInt(cell.dataset.col);
  const cellState = boardState[selectedCell.row][selectedCell.col];
  const isMobile = window.innerWidth <= 550;
  let needsRenderOnly = false;
  if (currentMode === "color") {
    if (coloringSubMode === "cell" && selectedColor) {
      const oldColor = cellState.cellColor;
      const newColor = oldColor === selectedColor ? null : selectedColor;
      if (oldColor !== newColor) {
        cellState.cellColor = newColor;
        saveState();
      }
      needsRenderOnly = true;
    } else if (coloringSubMode === "candidate") {
      if (cellState.value !== 0) {
        // Cell is concrete (has a value), apply highlighting logic
        if (highlightedDigit !== cellState.value) {
          highlightedDigit = cellState.value;
          highlightState = 1;
        } else {
          highlightedDigit = null;
          highlightState = 0;
        }
      } else {
        // Cell is empty, run original logic for candidate popups
        if (isMobile && !isExperimentalMode) {
          showCandidatePopup(selectedCell.row, selectedCell.col);
        }
      }
      needsRenderOnly = true;
    }
  } else {
    if (highlightState === 0 && cellState.pencils.size === 2) {
      highlightedDigit = null;
      highlightState = 2;
    } else if (cellState.value !== 0) {
      if (highlightedDigit !== cellState.value) {
        highlightedDigit = cellState.value;
        highlightState = 1;
      } else {
        highlightedDigit = null;
        highlightState = 0;
      }
    }
    needsRenderOnly = true;
  }
  if (needsRenderOnly) {
    renderBoard();
  }
}

function handleModeChange(e) {
  const clickedButton = e.target.closest("button");
  if (!clickedButton) return;

  // Stop the event here to prevent the global click listener from closing the tooltip immediately
  e.stopPropagation();

  if (clickedButton !== modeToggleButton && clickedButton !== colorButton) {
    return;
  }

  // --- Mode Switching Logic ---
  if (clickedButton === modeToggleButton) {
    const targetMode = currentMode === "concrete" ? "pencil" : "concrete";
    if (targetMode === "pencil" && arePencilsHidden) {
      showMessage(
        "Pencil mode is disabled while marks are hidden. (Press Alt+A to make visible)",
        "orange"
      );
      return;
    }
  }

  if (clickedButton === colorButton) {
    if (currentMode === "color") {
      const targetSubMode = coloringSubMode === "cell" ? "candidate" : "cell";
      if (targetSubMode === "candidate" && arePencilsHidden) {
        showMessage(
          "Candidate coloring is disabled while marks are hidden. (Press Alt+A to make visible)",
          "orange"
        );
        return;
      }
    }
  }

  const previousMode = currentMode;
  if (clickedButton === modeToggleButton) {
    currentMode =
      currentMode === "concrete" || currentMode === "pencil"
        ? currentMode === "concrete"
          ? "pencil"
          : "concrete"
        : "concrete";
  } else if (clickedButton === colorButton) {
    if (currentMode !== "color") {
      currentMode = "color";
      coloringSubMode = "cell";
    } else {
      coloringSubMode = coloringSubMode === "cell" ? "candidate" : "cell";
    }
  }
  const isMobile = window.innerWidth <= 550;
  let tip = "";
  if (currentMode === "concrete") {
    tip = isMobile
      ? "Tip: Touch a filled cell to highlight its number."
      : "Tip: Click a filled&nbsp;cell&nbsp;<span class='shortcut-highlight'>(or press 'Enter')</span> to highlight its number.";
  } else if (currentMode === "pencil") {
    tip = isMobile
      ? "Tip: Touch a cell, then a digit to toggle a pencil mark."
      : "Tip: Click a cell, then a digit to toggle a pencil mark.";
  } else if (currentMode === "color") {
    if (coloringSubMode === "cell") {
      tip = isMobile
        ? "Tip: Pick a color, then touch a cell to paint it."
        : "Tip: Pick a color, then click a&nbsp;cell&nbsp;<span class='shortcut-highlight'>(or press 'C')</span> to paint it.";
    } else {
      tip = isMobile
        ? "Tip: Pick a color, then touch a cell to select a candidate."
        : "Tip: Pick a color, hover over a candidate to preview, and click to apply.";
    }
  }
  showMessage(tip, "gray");
  modeToggleButton.classList.remove("active", "active-green");
  colorButton.classList.remove("active", "active-green");
  if (currentMode === "concrete") {
    modeToggleButton.classList.add("active");
  } else if (currentMode === "pencil") {
    modeToggleButton.classList.add("active-green");
  } else if (currentMode === "color") {
    if (coloringSubMode === "candidate") {
      colorButton.classList.add("active-green");
    } else {
      colorButton.classList.add("active");
    }
  }
  const wasColor = previousMode === "color";
  const isColor = currentMode === "color";
  if (isColor || wasColor) {
    updateControls();
    if (isColor) {
      const firstColorButton = numberPad.querySelector(".color-btn");
      if (firstColorButton) {
        selectedColor = firstColorButton.dataset.color;
        firstColorButton.classList.add("selected");
      }
    } else {
      selectedColor = null;
    }
  }
  renderBoard();
  updateButtonLabels();
  // --- NEW: Integrated Mobile Tooltip Logic ---
  if (isMobile) {
    // Hide any currently active tooltip.
    if (activeTooltipElement) {
      hideTooltip(activeTooltipElement);
    }

    // After the button's state and text have been updated, show the NEW tooltip.
    showTooltip(clickedButton);
    activeTooltipElement = clickedButton;
  } else {
    // For desktop, if the tooltip is currently visible when clicked, hide it.
    // This removes the stale tooltip so the next hover will show the updated one.
    if (clickedButton.tooltipInstance) {
      hideTooltip(clickedButton);
    }
  }
}

function handleNumberPadClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (currentMode === "color") {
    selectedColor = btn.dataset.color;
    numberPad
      .querySelectorAll(".color-btn")
      .forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    if (currentlyHoveredElement) {
      if (coloringSubMode === "cell") {
        if (currentlyHoveredElement.classList.contains("sudoku-cell")) {
          currentlyHoveredElement.style.backgroundColor = selectedColor;
        }
      } else if (coloringSubMode === "candidate") {
        currentlyHoveredElement.style.color = selectedColor;
      }
    }
    return;
  }
  const num = parseInt(btn.dataset.number);
  if (selectedCell.row !== null) {
    const { row, col } = selectedCell;
    const cellState = boardState[row][col];

    if (cellState.isGiven) {
      if (currentMode === "concrete" || currentMode === "pencil") {
        if (highlightedDigit !== num) {
          highlightedDigit = num;
          highlightState = 1;
        } else {
          highlightedDigit = null;
          highlightState = 0;
        }
        // CHANGE: Call saveState() instead of just renderBoard()
        renderBoard();
      }
      return;
    }

    let changeMade = false;
    if (currentMode === "concrete") {
      const oldValue = cellState.value;
      const newValue = oldValue === num ? 0 : num;
      if (oldValue !== newValue) {
        cellState.value = newValue;
        if (newValue !== 0) {
          cellState.pencils.clear();
          autoEliminatePencils(row, col, newValue);
        }
        changeMade = true;
      }
    } else {
      if (cellState.value === 0) {
        if (cellState.pencils.has(num)) {
          cellState.pencils.delete(num);
        } else {
          cellState.pencils.add(num);
        }
        changeMade = true;
      }
    }
    if (changeMade) {
      saveState();
      onBoardUpdated();
      checkCompletion();
    } else {
      renderBoard();
    }
  }
}

// --- Core App Logic ---

async function populateSelectors() {
  levelSelect.innerHTML = "";
  for (let i = 0; i < 11; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `${i} (${difficultyWords[i]})`;
    levelSelect.appendChild(option);
  }
  dateSelect.innerHTML = "";
  const today = new Date();
  const minDateNum = 20260101;
  const recentDates = [];
  for (let i = 0; i < 7; i++) {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const kstOffset = 9 * 60 * 60 * 1000;
    const today = new Date(utc + kstOffset);
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateNum = parseInt(`${yyyy}${mm}${dd}`);
    if (dateNum >= minDateNum) {
      recentDates.push({
        dateNum,
        label:
          i === 0 ? "Today" : i === 1 ? "Yesterday" : `${yyyy}-${mm}-${dd}`,
      });
    }
  }
  recentDates.sort((a, b) => b.dateNum - a.dateNum);
  recentDates.forEach(({ dateNum, label }) => {
    const option = document.createElement("option");
    option.value = dateNum;
    option.textContent = label;
    dateSelect.appendChild(option);
  });
  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "Enter a date";
  dateSelect.appendChild(customOption);
}

function findAndLoadSelectedPuzzle() {
  if (dateSelect.value === "custom") {
    dateSelect.value = dateSelect.options[0].value;
  }
  const selectedDate = parseInt(dateSelect.value, 10);
  const selectedLevel = parseInt(levelSelect.value, 10);
  const puzzle = allPuzzles.find(
    (p) => p.date === selectedDate && p.level === selectedLevel
  );
  if (puzzle) {
    puzzleStringInput.value = puzzle.puzzle;
    loadPuzzle(puzzle.puzzle, puzzle);
  } else {
    initBoardState();
    onBoardUpdated();
    showMessage("No puzzle found for this date and level.", "red");
    puzzleLevelEl.textContent = "";
    puzzleScoreEl.textContent = "";
    puzzleTimerEl.textContent = "";
    stopTimer();
    addSudokuCoachLink(null);
  }
}

function checkCompletion() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (boardState[r][c].value === 0) {
        return;
      }
    }
  }
  if (validateBoard()) {
    savePuzzleTimer();
    if (!isCustomPuzzle) {
      messageArea.innerHTML = "";
      messageArea.className =
        "text-center text-sm font-semibold h-5 flex items-center justify-center gap-2";
      const congratsText = document.createTextNode(
        "Congratulations! You solved it! → "
      );
      const shareButton = document.createElement("button");
      shareButton.textContent = "Share";
      shareButton.className = "puzzle-action-button rounded-md";
      shareButton.onclick = () => {
        const shareText = generateDiscordShareText();
        navigator.clipboard
          .writeText(shareText)
          .then(() => {
            messageArea.innerHTML = "";
            const colorClasses = [
              "text-red-600",
              "text-green-600",
              "text-gray-600",
              "text-orange-500",
            ];
            messageArea.classList.remove(...colorClasses);
            messageArea.classList.add("text-green-600");
            const successText = document.createTextNode(
              "Copied Discord sharable text!"
            );
            messageArea.appendChild(successText);
            const copyAgainButton = document.createElement("button");
            copyAgainButton.textContent = "Copy Again";
            copyAgainButton.className = "puzzle-action-button rounded-md";
            copyAgainButton.onclick = shareButton.onclick;
            messageArea.appendChild(copyAgainButton);
          })
          .catch((err) => {
            console.error("Failed to copy text: ", err);
            showMessage("Error: Could not copy text!", "red");
          });
      };
      messageArea.appendChild(congratsText);
      messageArea.appendChild(shareButton);
    } else {
      showMessage("Congratulations! You solved it!", "green");
    }
    triggerSolveAnimation();
    stopTimer();
  }
}

function triggerSolveAnimation() {
  gridContainer.classList.add("is-solved");
  setTimeout(() => {
    gridContainer.classList.remove("is-solved");
  }, 2620);
}

function showCandidatePopup(row, col) {
  candidateGrid.innerHTML = "";
  const cellState = boardState[row][col];
  if (cellState.pencils.size === 0) return;
  const orderA = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const orderB = [7, 8, 9, 4, 5, 6, 1, 2, 3];
  const currentOrder = candidatePopupFormat === "A" ? orderA : orderB;
  currentOrder.forEach((i) => {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.className =
      "p-3 border dark:border-gray-500 text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-slate-700 rounded-md";
    if (cellState.pencils.has(i)) {
      btn.classList.add("hover:bg-gray-200", "dark:hover:bg-slate-600");
      if (cellState.pencilColors.has(i)) {
        btn.style.backgroundColor = cellState.pencilColors.get(i);
      }
      btn.onclick = () => {
        const currentColor = cellState.pencilColors.get(i);
        if (currentColor === selectedColor) {
          cellState.pencilColors.delete(i);
        } else {
          cellState.pencilColors.set(i, selectedColor);
        }
        saveState();
        candidateModal.classList.add("hidden");
        onBoardUpdated();
      };
    } else {
      btn.disabled = true;
      btn.classList.add("opacity-25");
    }
    candidateGrid.appendChild(btn);
  });
  candidateModal.classList.remove("hidden");
  candidateModal.classList.add("flex");
}

function clearAllColors() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      boardState[r][c].cellColor = null;
      boardState[r][c].pencilColors.clear();
    }
  }
  saveState();
  renderBoard();
  showMessage("All colors cleared.", "gray");
}

function autoPencil() {
  if (hasUsedAutoPencil && !isAutoPencilPending) {
    showMessage(
      "This will overwrite pencil marks. Click again to apply.",
      "orange"
    );
    isAutoPencilPending = true;
    return;
  }
  let emptyWithNoPencils = 0;
  if (!hasUsedAutoPencil) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (
          boardState[r][c].value === 0 &&
          boardState[r][c].pencils.size === 0
        ) {
          emptyWithNoPencils++;
        }
      }
    }
  }
  const shouldSkipEval = !hasUsedAutoPencil && emptyWithNoPencils >= 4;
  const board = boardState.map((row) => row.map((cell) => cell.value));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cellState = boardState[r][c];
      if (cellState.value === 0) {
        cellState.pencils.clear();
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, r, c, num)) {
            cellState.pencils.add(num);
          }
        }
      }
    }
  }
  saveState();
  if (shouldSkipEval) {
    renderBoard();
  } else {
    onBoardUpdated();
  }
  showMessage("Auto-Pencil complete!", "green");
  hasUsedAutoPencil = true;
  isAutoPencilPending = false;

  setTimeout(() => {
    showMessage(
      "Tip: To highlight all bivalue cells, click a cell with exactly two candidates when highlighting is off.",
      "gray"
    );
  }, 2000);
}

async function loadPuzzle(puzzleString, puzzleData = null) {
  if (autoPencilTipTimer) clearTimeout(autoPencilTipTimer);
  vagueHintMessage = "";
  lampTimestamps = {};
  previousLampColor = null;
  isCustomPuzzle = puzzleData === null;
  isLoadingSavedGame = false;
  lastValidScore = 0;

  // 1. Detect if input is an ASCII grid (must have structure)
  const isMultiLine = puzzleString.includes("|") && puzzleString.includes("\n");
  let parsedGridCells = null;

  if (isMultiLine) {
    const lines = puzzleString.trim().split("\n");
    // Filter rows that match the ASCII grid structure
    const dataRows = lines.filter((line) => line.trim().startsWith("|"));

    if (dataRows.length === 9) {
      const extractedCells = [];
      let isParseValid = true;

      for (const row of dataRows) {
        // Extract all digit sequences
        const matches = row.match(/\d+/g);
        if (!matches || matches.length !== 9) {
          isParseValid = false;
          break;
        }
        extractedCells.push(...matches);
      }

      if (isParseValid && extractedCells.length === 81) {
        parsedGridCells = extractedCells;
      }
    }
  }

  initBoardState();

  // 2. Prepare the Normalized String (81 chars of dots/digits)
  let normalizedPuzzleString = "";

  if (parsedGridCells) {
    // --- ASCII Grid Parsing Logic ---
    // Helper to identify peers for single-digit candidate detection
    const getPeers = (idx) => {
      const peers = new Set();
      const r = Math.floor(idx / 9);
      const c = idx % 9;
      const boxR = Math.floor(r / 3) * 3;
      const boxC = Math.floor(c / 3) * 3;
      for (let i = 0; i < 9; i++) {
        if (r * 9 + i !== idx) peers.add(r * 9 + i);
        if (i * 9 + c !== idx) peers.add(i * 9 + c);
      }
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const pIdx = (boxR + i) * 9 + (boxC + j);
          if (pIdx !== idx) peers.add(pIdx);
        }
      }
      return peers;
    };

    for (let i = 0; i < 81; i++) {
      const cellData = parsedGridCells[i];
      const row = Math.floor(i / 9);
      const col = i % 9;

      let isCandidate = false;
      if (cellData.length === 1) {
        const digit = cellData;
        const peers = getPeers(i);
        for (const peerIdx of peers) {
          const peerData = parsedGridCells[peerIdx];
          if (peerData.includes(digit)) {
            isCandidate = true;
            break;
          }
        }
      } else {
        isCandidate = true;
      }

      if (!isCandidate) {
        const num = parseInt(cellData, 10);
        boardState[row][col].value = num;
        boardState[row][col].isGiven = true;
        normalizedPuzzleString += num;
      } else {
        boardState[row][col].value = 0;
        boardState[row][col].isGiven = false;
        const candidates = cellData.split("").map((d) => parseInt(d, 10));
        candidates.forEach((c) => boardState[row][col].pencils.add(c));
        normalizedPuzzleString += ".";
      }
    }
    initialPuzzleString = normalizedPuzzleString;
  } else {
    // --- Standard String Logic (Single or Multi-line) ---
    // 1. Remove ALL whitespace/newlines to handle the user's case
    const cleanString = puzzleString.replace(/\s/g, "");

    // 2. Validate length
    if (cleanString.length !== 81 || !/^[0-9\.]+$/.test(cleanString)) {
      showMessage("Error: Invalid puzzle string.", "red");
      addSudokuCoachLink(null);
      return;
    }

    initialPuzzleString = cleanString;

    // 3. Parse Strict Digits
    for (let i = 0; i < 81; i++) {
      const char = cleanString[i];
      const row = Math.floor(i / 9);
      const col = i % 9;

      // STRICT CHECK: Only parse if char is '1' through '9'
      // This ignores '.', '0', or any accidental slip-ups
      if (char >= "1" && char <= "9") {
        const num = parseInt(char, 10);
        boardState[row][col].value = num;
        boardState[row][col].isGiven = true;
      }
    }
  }

  // --- Common Logic Below ---

  // Build validation board from the normalized initialPuzzleString
  const boardForValidation = Array(9)
    .fill(null)
    .map(() => Array(9).fill(0));

  for (let i = 0; i < 81; i++) {
    const char = initialPuzzleString[i];
    // Same strict check for validation board
    if (char >= "1" && char <= "9") {
      boardForValidation[Math.floor(i / 9)][i % 9] = parseInt(char, 10);
    }
  }

  let savedTime = 0;
  let wasSaveLoaded = false;

  if (!isCustomPuzzle && puzzleData) {
    savedTime = applySavedProgress(puzzleData);
    if (savedTime > 0) {
      wasSaveLoaded = true;
      isLoadingSavedGame = true;
    }
  }

  const initialBoardForSolution = boardForValidation.map((row) => [...row]);
  solveSudoku(initialBoardForSolution);
  solutionBoard = initialBoardForSolution;

  if (isCustomPuzzle) {
    const validity = checkPuzzleUniqueness(boardForValidation);
    if (!validity.isValid) {
      setTimeout(() => showMessage(validity.message, "red"), 750);
    }
  }

  selectedCell = { row: null, col: null };
  history = [];
  historyIndex = -1;
  hasUsedAutoPencil = false;
  isAutoPencilPending = false;
  isSolvePending = false;
  isClearStoragePending = false;
  puzzleInfoContainer.classList.remove("hidden");
  puzzleTimerEl.classList.remove("hidden");

  if (puzzleData) {
    currentPuzzleScore = puzzleData.score;
    puzzleLevelEl.textContent = `Lv. ${puzzleData.level} (${
      difficultyWords[puzzleData.level]
    })`;
    puzzleScoreEl.textContent = `~${puzzleData.score}`;
  } else {
    currentPuzzleScore = 0;
    puzzleLevelEl.textContent = "";
    puzzleScoreEl.textContent = "";
    dateSelect.value = "custom";
  }

  renderBoard();
  savePuzzleTimer();

  currentPuzzleKey = isCustomPuzzle
    ? null
    : `${puzzleData.date}-${puzzleData.level}`;

  loadPuzzleTimer(savedTime);
  await evaluateBoardDifficulty();
  isLoadingSavedGame = false;
  saveState();

  addSudokuCoachLink(initialPuzzleString);

  if (isCustomPuzzle) {
    showMessage("Custom puzzle loaded!", "green");
  } else if (!wasSaveLoaded && puzzleData) {
    showMessage(
      `Loaded puzzle for ${
        dateSelect.options[dateSelect.selectedIndex].text
      }, Level ${puzzleData.level}`,
      "green"
    );
  }

  if (puzzleData) {
    setTimeout(() => {
      const tip = levelTips[puzzleData.level];
      if (tip) {
        showMessage(tip, "gray");
      }
    }, 2000);
  }

  autoPencilTipTimer = setTimeout(() => {
    if (!hasUsedAutoPencil) {
      const isMobile = window.innerWidth <= 550;
      const tip = isMobile
        ? "Tip: Touch 'Auto-Pencil' below to fill in all possible candidates."
        : "Tip: Click&nbsp;'Auto-Pencil'&nbsp;<span class='shortcut-highlight'>(or press 'A')</span> to fill in all possible candidates.";
      showMessage(tip, "gray");
    }
  }, 5000);

  setTimeout(() => {
    // 1. Identify which digits exist in the initial puzzle
    const presentDigits = new Set();
    // initialPuzzleString is the normalized 81-char string of the starting grid
    for (const char of initialPuzzleString) {
      if (char >= "1" && char <= "9") {
        presentDigits.add(char);
      }
    }

    // 2. If we have fewer than 9 unique digits, at least one is missing.
    // Only show the tip in this specific case.
    if (presentDigits.size < 9) {
      const highlightTip =
        "Tip: Select a clue cell and press a number to toggle highlighting.";
      showMessage(highlightTip, "gray");
    }
  }, 8000);
  checkCompletion();
}

function clearUserBoard() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!boardState[r][c].isGiven) {
        boardState[r][c].value = 0;
        boardState[r][c].pencils.clear();
      }
    }
  }
  lampTimestamps = {};
  previousLampColor = null;
  vagueHintMessage = "";
  hasUsedAutoPencil = false;
  isAutoPencilPending = false;
  isSolvePending = false;
  isClearStoragePending = false;
  saveState();
  onBoardUpdated(true);
  evaluateBoardDifficulty();
}

// --- ADD Progress Save/Load Functions ---

/**
 * Converts the current user progress on the board into a serializable array.
 * @returns {Array} An array representing the user's inputs.
 */
function serializeProgress() {
  const progress = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = boardState[r][c];
      // We only need to save data for non-given cells
      if (cell.isGiven) {
        progress.push(null);
      } else {
        progress.push({
          v: cell.value,
          p: [...cell.pencils], // Convert Set to Array for JSON
          cc: cell.cellColor,
          pc: [...cell.pencilColors.entries()], // Convert Map to Array for JSON
        });
      }
    }
  }
  return progress;
}

function savePuzzleProgress() {
  if (isCustomPuzzle || isSolvingViaButton) return; // Do not save custom puzzles or when auto-solving

  const selectedDate = parseInt(dateSelect.value, 10);
  const selectedLevel = parseInt(levelSelect.value, 10);

  if (!selectedDate || isNaN(selectedLevel) || !initialPuzzleString) return;

  // --- MODIFICATION: Check if any user input exists ---
  let hasUserInput = false;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = boardState[r][c];
      if (!cell.isGiven) {
        if (
          cell.value !== 0 ||
          cell.pencils.size > 0 ||
          cell.cellColor !== null ||
          cell.pencilColors.size > 0
        ) {
          hasUserInput = true;
          break; // Found input, no need to check further
        }
      }
    }
    if (hasUserInput) break;
  }

  let allSaves = [];
  try {
    const savedData = localStorage.getItem("sudokuSaves");
    if (savedData) {
      allSaves = JSON.parse(savedData);
      if (!Array.isArray(allSaves)) allSaves = [];
    }
  } catch (e) {
    console.error("Failed to parse saved Sudoku data:", e);
    allSaves = [];
  }

  const existingSaveIndex = allSaves.findIndex(
    (s) => s.date === selectedDate && s.level === selectedLevel
  );

  if (hasUserInput) {
    // If user made progress, create or update the save file.
    const currentSave = {
      date: selectedDate,
      level: selectedLevel,
      puzzle: initialPuzzleString,
      progress: serializeProgress(),
      time: Math.max(0, Math.floor(currentElapsedTime)),
      lampTimes: lampTimestamps,
    };

    if (existingSaveIndex > -1) {
      allSaves[existingSaveIndex] = currentSave; // Update existing save
    } else {
      allSaves.push(currentSave); // Add new save
    }

    // Limit total saves to prevent localStorage from filling up
    if (allSaves.length > 70) {
      allSaves.shift(); // Remove the oldest save
    }
  } else {
    // If no user input, remove any existing save for this puzzle.
    if (existingSaveIndex > -1) {
      allSaves.splice(existingSaveIndex, 1);
    }
  }

  // Update localStorage with the potentially modified saves array.
  localStorage.setItem("sudokuSaves", JSON.stringify(allSaves));
}

/**
 * Applies saved progress to the board state when a daily puzzle is loaded.
 * @param {object} puzzleData - The metadata for the daily puzzle being loaded.
 */
function applySavedProgress(puzzleData) {
  let allSaves = [];
  try {
    const savedData = localStorage.getItem("sudokuSaves");
    if (savedData) allSaves = JSON.parse(savedData);
    else return 0;
  } catch (e) {
    return 0;
  }

  const savedGameIndex = allSaves.findIndex(
    (s) => s.date === puzzleData.date && s.level === puzzleData.level
  );
  if (savedGameIndex === -1) return 0;

  const savedGame = allSaves[savedGameIndex];

  if (savedGame.puzzle !== puzzleData.puzzle) {
    allSaves.splice(savedGameIndex, 1);
    localStorage.setItem("sudokuSaves", JSON.stringify(allSaves));
    return 0;
  }

  const progress = savedGame.progress;
  if (!progress || progress.length !== 81) return 0;

  // CRITICAL: Restore lampTimestamps FIRST
  lampTimestamps = savedGame.lampTimes || {};

  // Restore the lamp visual state
  if (lampTimestamps && Object.keys(lampTimestamps).length > 0) {
    const order = ["red", "orange", "yellow", "green", "white"];
    let last = null;
    for (const c of order) {
      if (lampTimestamps[c] !== undefined) last = c;
    }
    if (last) {
      // Set both current and previous to the saved color
      // This prevents the "decrease" logic from triggering
      currentLampColor = last;
      previousLampColor = last;
      lastValidLampColor = last;

      // Update visual only
      difficultyLamp.classList.remove(
        "lamp-white",
        "lamp-green",
        "lamp-yellow",
        "lamp-orange",
        "lamp-red",
        "lamp-violet",
        "lamp-gray",
        "lamp-black",
        "lamp-bug"
      );
      difficultyLamp.classList.add(`lamp-${last}`);

      const tooltips = {
        white: "Easy: Level 0",
        green: "Medium: Level 1 - 2",
        yellow: "Hard: Level 3 - 5",
        orange: "Unfair: Level 6",
        red: "Extreme: Level 7 - 8",
        violet: "Insane: Level 9+",
      };
      let tooltipText = tooltips[last] || "Difficulty Indicator";
      if (window.innerWidth <= 550)
        tooltipText = tooltipText.replace("Level", "Lv.");
      difficultyLamp.dataset.tooltip = tooltipText;
    }
  }

  for (let i = 0; i < 81; i++) {
    const savedCell = progress[i];
    if (savedCell) {
      const r = Math.floor(i / 9);
      const c = i % 9;
      const currentCell = boardState[r][c];
      currentCell.value = savedCell.v || 0;
      currentCell.pencils = new Set(savedCell.p || []);
      currentCell.cellColor = savedCell.cc || null;
      currentCell.pencilColors = new Map(savedCell.pc || []);
    }
  }

  showMessage("Loaded saved progress.", "green");
  return typeof savedGame.time === "number" ? savedGame.time : 0;
}

function validateBoard() {
  const board = boardState.map((row) => row.map((cell) => cell.value));
  const cells = gridContainer.querySelectorAll(".sudoku-cell");
  let allValid = true;
  cells.forEach((cell) => cell.classList.remove("invalid"));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const num = board[r][c];
      if (num === 0 || boardState[r][c].isGiven) continue;
      board[r][c] = 0;
      if (!isValid(board, r, c, num)) {
        cells[r * 9 + c].classList.add("invalid");
        allValid = false;
      }
      board[r][c] = num;
    }
  }
  return allValid;
}

function solve() {
  if (!isSolvePending) {
    showMessage(
      "This will reveal the solution. Click again to solve.",
      "orange"
    );
    isSolvePending = true;
    return;
  }
  if (!initialPuzzleString) {
    showMessage("Error: No initial puzzle loaded.", "red");
    isSolvePending = false;
    return;
  }

  const initialBoard = Array(9)
    .fill(null)
    .map(() => Array(9).fill(0));
  for (let i = 0; i < 81; i++) {
    const char = initialPuzzleString[i];
    if (char !== "." && char !== "0") {
      initialBoard[Math.floor(i / 9)][i % 9] = parseInt(char);
    }
  }
  const validity = checkPuzzleUniqueness(initialBoard);
  if (!validity.isValid) {
    showMessage(`${validity.message}`, "red");
    return;
  }

  isSolvingViaButton = true; // Prevent saveState from saving progress

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      boardState[r][c].value = solutionBoard[r][c];
      boardState[r][c].pencils.clear();
    }
  }

  saveState(); // Update undo history without saving to localStorage
  removeCurrentPuzzleSave(); // Clear any existing save data

  onBoardUpdated();
  showMessage("Puzzle Solved! (Unique)", "green");
  triggerSolveAnimation();
  stopTimer();

  isSolvingViaButton = false; // Re-enable saving for subsequent user actions
}

function showMessage(text, color) {
  messageArea.innerHTML = "";
  messageArea.innerHTML = `<span>${text}</span>`;
  const colorClasses = [
    "text-red-600",
    "text-green-600",
    "text-blue-500",
    "text-gray-600",
    "text-orange-500",
  ];
  messageArea.classList.remove(...colorClasses);
  const colors = {
    red: "text-red-600",
    green: "text-green-600",
    blue: "text-blue-500",
    gray: "text-gray-600",
    orange: "text-orange-500",
  };
  messageArea.classList.add(colors[color] || "text-gray-600");
}

function generateDiscordShareText() {
  const title = "[fsrs Daily Sudoku](https://fsrs.darksabun.club/sudoku.html)";
  const dateVal = dateSelect.value;

  // --- FIX START: Restore the original dynamic date logic ---
  let puzzleDateStr = new Date().toISOString().slice(0, 10);
  if (dateVal && /^\d{8}$/.test(dateVal)) {
    puzzleDateStr = `${dateVal.slice(0, 4)}-${dateVal.slice(
      4,
      6
    )}-${dateVal.slice(6, 8)}`;
  }
  // --- FIX END ---

  const level = parseInt(levelSelect.value, 10);
  const levelWord = difficultyWords[level] || "Unknown";

  const levelInfo = [
    { emoji: ":white_large_square:", color: "white" }, // 0
    { emoji: ":green_square:", color: "green" }, // 1
    { emoji: ":green_square:", color: "green" }, // 2
    { emoji: ":yellow_square:", color: "yellow" }, // 3
    { emoji: ":yellow_square:", color: "yellow" }, // 4
    { emoji: ":yellow_square:", color: "yellow" }, // 5
    { emoji: ":orange_square:", color: "orange" }, // 6
    { emoji: ":red_square:", color: "red" }, // 7
    { emoji: ":red_square:", color: "red" }, // 8
    { emoji: ":purple_square:", color: "violet" }, // 9
    { emoji: ":purple_square:", color: "violet" }, // 10
  ];

  const colorHierarchy = {
    violet: 7,
    red: 6,
    orange: 5,
    yellow: 4,
    green: 3,
    white: 2,
  };

  const accomplishmentOrder = [
    { color: "red", emoji: ":red_square:" },
    { color: "orange", emoji: ":orange_square:" },
    { color: "yellow", emoji: ":yellow_square:" },
    { color: "green", emoji: ":green_square:" },
    { color: "white", emoji: ":white_large_square:" },
  ];

  const startingColor = levelInfo[level].color;
  const startingRank = colorHierarchy[startingColor] || 9;

  const levelStr = `${levelInfo[level].emoji} Level ${level} (${levelWord})`;

  let timeDetails = "";
  for (const item of accomplishmentOrder) {
    const itemRank = colorHierarchy[item.color];
    if (itemRank < startingRank && lampTimestamps[item.color]) {
      timeDetails += `\n${item.emoji} ${formatTime(
        lampTimestamps[item.color]
      ).replace(/:/g, "\\:")}`;
    }
  }

  const finalTimeStr = puzzleTimerEl.textContent.replace(/:/g, "\\:");
  timeDetails += `\n:ballot_box_with_check: ${finalTimeStr}`;

  const header = `${title} | ${puzzleDateStr}\n${levelStr}${timeDetails}\n`;

  const digitMap = {
    1: ":one:",
    2: ":two:",
    3: ":three:",
    4: ":four:",
    5: ":five:",
    6: ":six:",
    7: ":seven:",
    8: ":eight:",
    9: ":nine:",
  };
  const emptySquare = ":blue_square:";
  let gridStr = "";
  for (let r = 0; r < 9; r++) {
    if (r > 0 && r % 3 === 0) {
      gridStr += "\n";
    }
    for (let c = 0; c < 9; c++) {
      if (c > 0 && c % 3 === 0) {
        gridStr += " ";
      }
      const char = initialPuzzleString[r * 9 + c];
      gridStr += digitMap[char] || emptySquare;
    }
    gridStr += "\n";
  }
  return header + "\n" + gridStr.trim();
}

/**
 * Formats milliseconds into a HH:MM:SS or MM:SS string.
 * @param {number} ms - The elapsed time in milliseconds.
 * @returns {string} The formatted time string.
 */
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const formattedSeconds = String(seconds).padStart(2, "0");
  const formattedMinutes = String(minutes).padStart(2, "0");

  if (hours > 0) {
    const formattedHours = String(hours).padStart(2, "0");
    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
  } else {
    return `${formattedMinutes}:${formattedSeconds}`;
  }
}

function cloneBoardState(state) {
  return state.map((row) =>
    row.map((cell) => ({
      value: cell.value,
      isGiven: cell.isGiven,
      pencils: new Set(cell.pencils),
      cellColor: cell.cellColor,
      pencilColors: new Map(cell.pencilColors),
    }))
  );
}

function saveState() {
  history = history.slice(0, historyIndex + 1);
  history.push({
    boardState: cloneBoardState(boardState),
    lampColor: currentLampColor,
    vagueHint: vagueHintMessage,
    previousLampColor: previousLampColor,
    lampTimestamps: JSON.parse(JSON.stringify(lampTimestamps)),
  });
  historyIndex++;
  updateUndoRedoButtons();
  savePuzzleProgress();
}
function onBoardUpdated(skipEvaluation = false) {
  renderBoard();

  const isBoardValid = validateBoard();

  if (!isBoardValid) {
    updateLamp("black", { record: false });
  } else if (currentLampColor === "black") {
  }

  if (skipEvaluation) return;

  // let emptyWithNoPencils = 0;
  // for (let r = 0; r < 9; r++) {
  //   for (let c = 0; c < 9; c++) {
  //     if (boardState[r][c].value === 0 && boardState[r][c].pencils.size === 0) {
  //       emptyWithNoPencils++;
  //     }
  //   }
  // }
  // if (emptyWithNoPencils >= 4) return;

  if (lampEvaluationTimeout) clearTimeout(lampEvaluationTimeout);
  lampEvaluationTimeout = setTimeout(() => {
    if (isBoardValid) evaluateBoardDifficulty();
  }, 200);
}

/**
 * Stops the active timer interval.
 */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/**
 * Resets global timer variables and clears the display.
 */
function resetTimerState() {
  stopTimer();
  startTime = null;
  currentElapsedTime = 0;
  puzzleTimerEl.textContent = "00:00";
}

/**
 * Starts the timer, continuing from a given initial time.
 * @param {number} initialMs - The time to start from, in milliseconds.
 */
function startTimer(initialMs = 0) {
  stopTimer(); // Ensure no other timers are running.

  // Ensure initialMs is a valid number.
  if (typeof initialMs !== "number" || initialMs < 0) {
    initialMs = 0;
  }

  // Set the start time relative to the elapsed time to ensure continuity.
  startTime = Date.now() - initialMs;
  currentElapsedTime = initialMs;
  puzzleTimerEl.textContent = formatTime(initialMs);

  // Create a new interval to update the timer every second.
  timerInterval = setInterval(() => {
    const elapsedMs = Date.now() - startTime;
    currentElapsedTime = elapsedMs;
    puzzleTimerEl.textContent = formatTime(elapsedMs);
  }, 1000);
}

/**
 * Saves the current timer's elapsed time into an in-session cache
 * before switching to a new puzzle.
 */
function savePuzzleTimer() {
  // If a puzzle was active, stop its timer and save its state.
  if (currentPuzzleKey) {
    stopTimer();
    puzzleTimers[currentPuzzleKey] = currentElapsedTime;
  }
}

/**
 * Loads the timer for the current puzzle. It prioritizes in-session saved
 * time, falling back to time saved in localStorage.
 * @param {number} savedTimeFromStorage - The elapsed time loaded from localStorage.
 */
function loadPuzzleTimer(savedTimeFromStorage) {
  resetTimerState();

  // Do not start a timer for custom puzzles or if the puzzle key is missing.
  if (isCustomPuzzle || !currentPuzzleKey) {
    return;
  }

  // Prioritize the time saved during the current session.
  const inSessionTime = puzzleTimers[currentPuzzleKey];

  // If we have an in-session time, use it; otherwise, use the time from storage.
  const timeToStart =
    typeof inSessionTime === "number" ? inSessionTime : savedTimeFromStorage;

  startTimer(timeToStart > 0 ? timeToStart : 0);
}

function hasLogicChanged(stateA, stateB) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cellA = stateA[r][c];
      const cellB = stateB[r][c];
      // 1. Check Concrete Values
      if (cellA.value !== cellB.value) return true;
      // 2. Check Pencil Marks (Size and Content)
      if (cellA.pencils.size !== cellB.pencils.size) return true;
      for (const p of cellA.pencils) {
        if (!cellB.pencils.has(p)) return true;
      }
    }
  }
  return false;
}

function undo() {
  if (historyIndex > 0) {
    const currentLogic = boardState;
    const prevLogic = history[historyIndex - 1].boardState;
    const logicChanged = hasLogicChanged(currentLogic, prevLogic);

    // Standard diff description only
    const actionDesc = getDiffDescription(prevLogic, currentLogic);

    historyIndex--;
    const historyEntry = history[historyIndex];
    boardState = cloneBoardState(historyEntry.boardState);
    vagueHintMessage = historyEntry.vagueHint;

    lampTimestamps = JSON.parse(
      JSON.stringify(historyEntry.lampTimestamps || {})
    );
    previousLampColor = historyEntry.previousLampColor;

    // REMOVED: Restoring highlightState/highlightedDigit

    updateLamp(historyEntry.lampColor, { record: false });

    renderBoard();
    onBoardUpdated(!logicChanged);
    updateUndoRedoButtons();
    savePuzzleProgress();

    showMessage(`Undid: ${actionDesc}`, "gray");
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    const currentLogic = boardState;
    const nextLogic = history[historyIndex + 1].boardState;
    const logicChanged = hasLogicChanged(currentLogic, nextLogic);

    const actionDesc = getDiffDescription(currentLogic, nextLogic);

    historyIndex++;
    const historyEntry = history[historyIndex];
    boardState = cloneBoardState(historyEntry.boardState);
    vagueHintMessage = historyEntry.vagueHint;

    lampTimestamps = JSON.parse(
      JSON.stringify(historyEntry.lampTimestamps || {})
    );
    previousLampColor = historyEntry.previousLampColor;

    // REMOVED: Restoring highlightState/highlightedDigit

    updateLamp(historyEntry.lampColor, { record: false });

    renderBoard();
    onBoardUpdated(!logicChanged);
    updateUndoRedoButtons();
    savePuzzleProgress();

    showMessage(`Redid: ${actionDesc}`, "gray");
  }
}

function updateUndoRedoButtons() {
  undoBtn.disabled = historyIndex <= 0;
  redoBtn.disabled = historyIndex >= history.length - 1;
}

// --- ADD 'Experimental Mode' Preference Functions ---
/**
 * Saves the current state of isExperimentalMode to localStorage.
 */
function saveExperimentalModePreference() {
  localStorage.setItem(
    "sudokuExperimentalMode",
    JSON.stringify(isExperimentalMode)
  );
}

/**
 * Loads the experimental mode preference from localStorage on startup.
 */
function loadExperimentalModePreference() {
  const savedPref = localStorage.getItem("sudokuExperimentalMode");
  if (savedPref !== null) {
    isExperimentalMode = JSON.parse(savedPref);
  }
}

/**
 * Removes the saved progress for the current daily puzzle from localStorage.
 */
function removeCurrentPuzzleSave() {
  if (isCustomPuzzle) return;

  const selectedDate = parseInt(dateSelect.value, 10);
  const selectedLevel = parseInt(levelSelect.value, 10);
  if (!selectedDate || isNaN(selectedLevel)) return;

  let allSaves = [];
  try {
    const savedData = localStorage.getItem("sudokuSaves");
    if (savedData) {
      allSaves = JSON.parse(savedData);
      if (!Array.isArray(allSaves)) allSaves = [];
    }
  } catch (e) {
    console.error("Failed to parse saved Sudoku data:", e);
    return;
  }

  const existingSaveIndex = allSaves.findIndex(
    (s) => s.date === selectedDate && s.level === selectedLevel
  );

  if (existingSaveIndex > -1) {
    allSaves.splice(existingSaveIndex, 1);
    localStorage.setItem("sudokuSaves", JSON.stringify(allSaves));
  }
}

// --- Difficulty Evaluation Logic ---

async function evaluateBoardDifficulty() {
  await new Promise(requestAnimationFrame);
  vagueHintMessage = "";
  if (!initialPuzzleString || !solutionBoard) {
    updateLamp("gray");
    return;
  }
  const initialBoardForValidation = Array(9)
    .fill(null)
    .map(() => Array(9).fill(0));
  for (let i = 0; i < 81; i++) {
    const char = initialPuzzleString[i];
    if (char !== "." && char !== "0") {
      initialBoardForValidation[Math.floor(i / 9)][i % 9] = parseInt(char);
    }
  }
  if (!checkPuzzleUniqueness(initialBoardForValidation).isValid) {
    updateLamp("gray");
    return;
  }
  const currentBoardForEval = cloneBoardState(boardState);
  let emptyCount = 0;
  let emptyWithNoPencils = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (currentBoardForEval[r][c].value === 0) {
        emptyCount++;
        if (currentBoardForEval[r][c].pencils.size === 0) emptyWithNoPencils++;
      }
    }
  }
  let startingPencils;
  if (emptyCount <= 3 || emptyWithNoPencils >= 4) {
    startingPencils = calculateAllPencils(currentBoardForEval);
  } else {
    startingPencils = currentBoardForEval.map((row) =>
      row.map((cell) => new Set(cell.pencils))
    );
  }
  const virtualBoard = currentBoardForEval.map((row) =>
    row.map((cell) => cell.value)
  );
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (
        virtualBoard[r][c] !== 0 &&
        virtualBoard[r][c] !== solutionBoard[r][c]
      ) {
        updateLamp("black");
        vagueHintMessage = "";
        return;
      }
      if (
        virtualBoard[r][c] === 0 &&
        startingPencils[r][c].size > 0 &&
        !startingPencils[r][c].has(solutionBoard[r][c])
      ) {
        updateLamp("black");
        vagueHintMessage = "";
        return;
      }
    }
  }
  if (emptyCount <= 3) {
    updateLamp("white", { level: 0 });
    vagueHintMessage = "Full House";

    lastValidScore = 4 * emptyCount;

    if (currentPuzzleScore > 0) {
      puzzleScoreEl.textContent = `~${currentPuzzleScore} (${lastValidScore})`;
    } else {
      puzzleScoreEl.textContent = `(${lastValidScore})`;
    }
    return;
  }

  let initialHasEmptyNoCand = false;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (virtualBoard[r][c] === 0 && startingPencils[r][c].size === 0) {
        initialHasEmptyNoCand = true;
        break;
      }
    }
    if (initialHasEmptyNoCand) break;
  }

  let maxDifficulty = 0;
  const techniqueOrder = [
    {
      name: "Eliminate Candidates",
      func: techniques.eliminateCandidates,
      level: 0,
      score: 0,
    },
    { name: "Full House", func: techniques.fullHouse, level: 0, score: 4 },
    { name: "Naked Single", func: techniques.nakedSingle, level: 0, score: 4 },
    {
      name: "Hidden Single",
      func: techniques.hiddenSingle,
      level: 0,
      score: 14,
    },
    {
      name: "Locked Pair",
      func: (b, p) => techniques.lockedSubset(b, p, 2),
      level: 1,
      score: 40,
    },
    {
      name: "Locked Triple",
      func: (b, p) => techniques.lockedSubset(b, p, 3),
      level: 1,
      score: 60,
    },
    {
      name: "Intersection",
      func: (b, p) => techniques.intersection(b, p),
      level: 2,
      score: 50,
    },
    {
      name: "Naked Pair",
      func: (b, p) => techniques.nakedSubset(b, p, 2),
      level: 2,
      score: 60,
    },
    {
      name: "Hidden Pair",
      func: (b, p) => techniques.hiddenSubset(b, p, 2),
      level: 2,
      score: 70,
    },
    {
      name: "Naked Triple",
      func: (b, p) => techniques.nakedSubset(b, p, 3),
      level: 2,
      score: 80,
    },
    {
      name: "Hidden Triple",
      func: (b, p) => techniques.hiddenSubset(b, p, 3),
      level: 2,
      score: 100,
    },
    {
      name: "Naked Quad",
      func: (b, p) => techniques.nakedSubset(b, p, 4),
      level: 3,
      score: 120,
    },
    {
      name: "Hidden Quad",
      func: (b, p) => techniques.hiddenSubset(b, p, 4),
      level: 3,
      score: 150,
    },
    {
      name: "Remote Pair",
      func: (b, p) => techniques.remotePair(b, p),
      level: 3,
      score: 110,
    },
    {
      name: "X-Wing",
      func: (b, p) => techniques.fish(b, p, 2),
      level: 3,
      score: 100,
    },
    {
      name: "XY-Wing",
      func: (b, p) => techniques.xyWing(b, p),
      level: 3,
      score: 120,
    },
    {
      name: "BUG+1",
      func: (b, p) => techniques.bugPlusOne(b, p),
      level: 4,
      score: 100,
    },
    {
      name: "Chute Remote Pair",
      func: (b, p) => techniques.chuteRemotePair(b, p),
      level: 4,
      score: 120,
    },
    {
      name: "Unique Rectangle",
      func: (b, p) => techniques.uniqueRectangle(b, p),
      level: 4,
      score: 100,
    },
    {
      name: "XYZ-Wing",
      func: (b, p) => techniques.xyzWing(b, p),
      level: 4,
      score: 140,
    },
    {
      name: "W-Wing",
      func: (b, p) => techniques.wWing(b, p),
      level: 4,
      score: 160,
    },
    {
      name: "Swordfish",
      func: (b, p) => techniques.fish(b, p, 3),
      level: 4,
      score: 130,
    },
    {
      name: "Jellyfish",
      func: (b, p) => techniques.fish(b, p, 4),
      level: 4,
      score: 160,
    },
    {
      name: "Unique Hexagon",
      func: techniques.uniqueHexagon,
      level: 5,
      score: 120,
    },
    {
      name: "Extended Rectangle",
      func: techniques.extendedRectangle,
      level: 5,
      score: 140,
    },
    {
      name: "Grouped W-Wing",
      func: techniques.groupedWWing,
      level: 5,
      score: 170,
    },
    { name: "Skyscraper", func: techniques.skyscraper, level: 5, score: 110 },
    {
      name: "2-String Kite",
      func: techniques.twoStringKite,
      level: 5,
      score: 120,
    },
    { name: "Turbot Fish", func: techniques.turbotFish, level: 5, score: 130 },
    {
      name: "Hidden Rectangle",
      func: techniques.hiddenRectangle,
      level: 5,
      score: 110,
    },
    {
      name: "Empty Rectangle",
      func: techniques.emptyRectangle,
      level: 5,
      score: 150,
    },
    {
      name: "Rectangle Elimination",
      func: techniques.rectangleElimination,
      level: 5,
      score: 150,
    },
    {
      name: "Finned X-Wing",
      func: techniques.finnedXWing,
      level: 5,
      score: 140,
    },
    {
      name: "Finned Swordfish",
      func: techniques.finnedSwordfish,
      level: 6,
      score: 200,
    },
    {
      name: "Finned Jellyfish",
      func: techniques.finnedJellyfish,
      level: 6,
      score: 260,
    },
    {
      name: "Simple Coloring",
      func: techniques.simpleColoring,
      level: 6,
      score: 150,
    },
    { name: "X-Chain", func: techniques.xChain, level: 6, score: 200 },
    { name: "XY-Chain", func: techniques.xyChain, level: 6, score: 240 },
    { name: "Firework", func: techniques.firework, level: 6, score: 240 },
    { name: "WXYZ-Wing", func: techniques.wxyzWing, level: 6, score: 200 },
    { name: "Sue de Coq", func: techniques.sueDeCoq, level: 6, score: 240 },
    {
      name: "Grouped X-Chain",
      func: techniques.groupedXChain,
      level: 7,
      score: 240,
    },
    { name: "3D Medusa", func: techniques.medusa3D, level: 7, score: 200 },
    {
      name: "Alternating Inference Chain",
      func: techniques.alternatingInferenceChain,
      level: 7,
      score: 280,
    },
    { name: "Grouped AIC", func: techniques.groupedAIC, level: 8, score: 300 },
    {
      name: "Aligned Pair Exclusion",
      func: techniques.alignedPairExclusion,
      level: 8,
      score: 290,
    },
    {
      name: "Almost Locked Set XZ-Rule",
      func: techniques.alsXZ,
      level: 8,
      score: 300,
    },
  ];
  const solveStartTime = performance.now();
  if (IS_DEBUG_MODE) {
    console.clear();
    console.log("--- Starting New Difficulty Evaluation ---");
    console.log("Initial Board State (0 = empty):");
    console.table(virtualBoard);
  }
  let evaluatedScore = 0;
  let progressMade = true;
  while (progressMade) {
    progressMade = false;
    for (const tech of techniqueOrder) {
      const result = tech.func(virtualBoard, startingPencils);
      if (result.change) {
        evaluatedScore += tech.score;
        if (IS_DEBUG_MODE) {
          console.groupCollapsed(`Found: ${tech.name} (Level ${tech.level})`);
          if (result.type === "place") {
            console.log(
              `Action: r${result.r + 1}c${result.c + 1}=${result.num}`
            );
          } else if (result.type === "remove") {
            console.log(`Action: Remove candidates:`);
            result.cells.forEach(({ r, c, num }) => {
              console.log(`  - r${r + 1}c${c + 1}<>${num}`);
            });
          }
        }
        if (!vagueHintMessage) {
          vagueHintMessage = tech.name;
          currentHintData = result;
          hintClickCount = 0;
        }
        maxDifficulty = Math.max(maxDifficulty, tech.level);
        if (result.type === "place") {
          virtualBoard[result.r][result.c] = result.num;
          startingPencils[result.r][result.c].clear();
          for (let i = 0; i < 9; i++) {
            startingPencils[result.r][i].delete(result.num);
            startingPencils[i][result.c].delete(result.num);
          }
          const boxR = Math.floor(result.r / 3) * 3,
            boxC = Math.floor(result.c / 3) * 3;
          for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++)
              startingPencils[boxR + i][boxC + j].delete(result.num);
        } else if (result.type === "remove") {
          result.cells.forEach(({ r, c, num }) =>
            startingPencils[r][c].delete(num)
          );
        }
        if (IS_DEBUG_MODE) {
          if (LOG_CANDIDATE_GRID) {
            logBoardState(virtualBoard, startingPencils);
          }
          console.groupEnd();
        }
        progressMade = true;
        break;
      }
    }
  }
  const isSolved = virtualBoard.flat().every((v) => v !== 0);

  if (isSolved) {
    lastValidScore = evaluatedScore;
    if (IS_DEBUG_MODE) {
      console.log(`Estimated score: ${evaluatedScore}`);
    }
    if (currentPuzzleScore > 0) {
      puzzleScoreEl.textContent = `~${currentPuzzleScore} (${evaluatedScore})`;
    } else {
      puzzleScoreEl.textContent = `(${evaluatedScore})`;
    }
    if (previousLampColor === "black" || previousLampColor === "bug") {
      previousLampColor = null;
    }
    // Pass exact level to updateLamp
    if (maxDifficulty === 0) updateLamp("white", { level: 0 });
    else if (maxDifficulty <= 2) updateLamp("green", { level: maxDifficulty });
    else if (maxDifficulty <= 5) updateLamp("yellow", { level: maxDifficulty });
    else if (maxDifficulty <= 6) updateLamp("orange", { level: maxDifficulty });
    else if (maxDifficulty <= 8) updateLamp("red", { level: maxDifficulty });
  } else {
    evaluatedScore = -1;
    if (currentPuzzleScore > 0) {
      puzzleScoreEl.textContent = `~${currentPuzzleScore}`;
    } else {
      puzzleScoreEl.textContent = "";
    }

    // === Final bug detection ===
    let foundBug = false;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        // If the cell is unsolved in virtualBoard
        if (virtualBoard[r][c] === 0) {
          // Check if the solution candidate was removed from the pencils
          if (!startingPencils[r][c].has(solutionBoard[r][c])) {
            foundBug = true;
            break;
          }
        }
      }
      if (foundBug) break;
    }

    if (foundBug) {
      updateLamp("black");
      vagueHintMessage = "";
      const scoreSuffix = lastValidScore > 0 ? ` (${lastValidScore})` : "";

      if (currentPuzzleScore > 0) {
        puzzleScoreEl.textContent = `~${currentPuzzleScore}${scoreSuffix}`;
      } else if (lastValidScore > 0) {
        puzzleScoreEl.textContent = `(${lastValidScore})`;
      }
    } else {
      updateLamp("violet");
    }
  }
  if (IS_DEBUG_MODE) {
    const solveEndTime = performance.now();
    console.log(
      `Evaluation completed in ${(solveEndTime - solveStartTime).toFixed(2)}ms`
    );
    console.log("----------------------------------------------");
  }
}

// --- ASCII Grid Generation ---
function generateAsciiGrid() {
  const board = boardState.map((row) => row.map((cell) => cell.value));
  const pencils = boardState.map((row) => row.map((cell) => cell.pencils));

  // Helper: Check if a number exists in Row, Col, or Box
  const isValueInvalid = (r, c, num) => {
    // Check Row
    for (let k = 0; k < 9; k++) {
      if (board[r][k] === num) return true;
    }
    // Check Col
    for (let k = 0; k < 9; k++) {
      if (board[k][c] === num) return true;
    }
    // Check Box
    const startR = Math.floor(r / 3) * 3;
    const startC = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[startR + i][startC + j] === num) return true;
      }
    }
    return false;
  };

  // 1. Generate all cell strings and find max width per column
  const cellStrings = Array(9)
    .fill(null)
    .map(() => Array(9).fill(""));
  const colWidths = Array(9).fill(0);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      let s = "";

      if (board[r][c] !== 0) {
        // Case A: Concrete Value
        s = board[r][c].toString();
      } else if (pencils[r][c].size > 0) {
        // Case B: User-entered Pencil Marks
        s = [...pencils[r][c]].sort().join("");
      } else {
        // Case C: Empty Cell -> Calculate all valid candidates
        const validCandidates = [];
        for (let n = 1; n <= 9; n++) {
          if (!isValueInvalid(r, c, n)) {
            validCandidates.push(n);
          }
        }
        s = validCandidates.join("");
      }

      cellStrings[r][c] = s;

      // Update dynamic column width
      if (s.length > colWidths[c]) {
        colWidths[c] = s.length;
      }
    }
  }

  // 2. Helper to generate separator lines
  const makeLine = (left, mid, cross, right, fill) => {
    let line = left;
    for (let b = 0; b < 3; b++) {
      let boxLen = 0;
      for (let i = 0; i < 3; i++) {
        const c = b * 3 + i;
        boxLen += 1 + colWidths[c];
      }
      line += fill.repeat(boxLen);
      if (b < 2) line += cross;
    }
    line += right + "\n";
    return line;
  };

  let output = "";
  output += makeLine(".", ".", ".", ".", "-"); // Top

  for (let r = 0; r < 9; r++) {
    let rowStr = "|";
    for (let c = 0; c < 9; c++) {
      rowStr += " " + cellStrings[r][c].padEnd(colWidths[c], " ");
      if (c === 2 || c === 5) {
        rowStr += "|";
      }
    }
    rowStr += "|\n";
    output += rowStr;

    if (r === 2 || r === 5) {
      output += makeLine(":", "+", "+", ":", "-"); // Mid
    }
  }

  output += makeLine("'", "'", "'", "'", "-"); // Bot
  return output;
}
/**
 * specific helper to map hex codes to "[Color N]" format
 */
function getColorName(hex) {
  if (!hex) return "Color";

  // Try to find the index in any of the palettes
  let idx = colorPaletteLight.indexOf(hex);
  if (idx === -1) idx = colorPaletteMid.indexOf(hex);
  if (idx === -1) idx = colorPaletteDark.indexOf(hex);

  if (idx !== -1) {
    return `[Color ${idx + 1}]`;
  }
  return "Custom Color"; // Fallback
}

/**
 * Compares two board states and returns a detailed string description.
 */
function getDiffDescription(before, after) {
  let placements = [];
  let valueRemovals = [];
  let otherChanges = [];
  let totalChangedCells = 0;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const b = before[r][c];
      const a = after[r][c];
      let isCellChanged = false;
      let cellDesc = null;

      // 1. Value Logic (Concrete Numbers)
      if (b.value !== a.value) {
        isCellChanged = true;
        if (a.value !== 0) {
          placements.push(`Placed r${r + 1}c${c + 1} = ${a.value}`);
        } else {
          valueRemovals.push(`Removed ${b.value} from r${r + 1}c${c + 1}`);
        }
      }
      // 2. Pencil Marks (Candidates)
      else if (b.value === a.value) {
        const added = [];
        const removed = [];

        a.pencils.forEach((p) => {
          if (!b.pencils.has(p)) added.push(p);
        });
        b.pencils.forEach((p) => {
          if (!a.pencils.has(p)) removed.push(p);
        });

        if (added.length > 0) {
          isCellChanged = true;
          cellDesc = `Marked (${added.join("")})r${r + 1}c${c + 1}`;
        } else if (removed.length > 0) {
          isCellChanged = true;
          cellDesc = `Unmarked (${removed.join("")})r${r + 1}c${c + 1}`;
        }

        // 3. Colors (Cell & Candidate)
        if (!isCellChanged) {
          // Cell Color
          if (b.cellColor !== a.cellColor) {
            isCellChanged = true;
            if (a.cellColor) {
              const cName = getColorName(a.cellColor);
              cellDesc = `${cName} in r${r + 1}c${c + 1}`;
            } else {
              cellDesc = `Cleared color in r${r + 1}c${c + 1}`;
            }
          }
          // Candidate Colors
          else {
            for (let n = 1; n <= 9; n++) {
              const cB = b.pencilColors.get(n);
              const cA = a.pencilColors.get(n);
              if (cB !== cA) {
                isCellChanged = true;
                if (cA) {
                  const cName = getColorName(cA);
                  cellDesc = `${cName} in (${n})r${r + 1}c${c + 1}`;
                } else {
                  cellDesc = `Cleared color in (${n})r${r + 1}c${c + 1}`;
                }
                break; // Stop after finding one change per cell
              }
            }
          }
        }

        if (cellDesc) otherChanges.push(cellDesc);
      }

      if (isCellChanged) {
        totalChangedCells++;
      }
    }
  }

  // --- PRIORITIZATION ---
  if (placements.length === 1) return placements[0];
  if (valueRemovals.length === 1 && placements.length === 0)
    return valueRemovals[0];
  if (totalChangedCells === 1 && otherChanges.length > 0)
    return otherChanges[0];
  if (totalChangedCells === 0) return "No visible changes";
  return "Multiple cells updated (Highlight/Wipe/Reset/Solve)";
}
function getHighlightDiff(before, after) {
  // Check if highlight state or digit changed
  if (
    before.highlightState !== after.highlightState ||
    before.highlightedDigit !== after.highlightedDigit
  ) {
    // Case 1: Highlight Turned Off
    if (after.highlightState === 0) {
      return "Unhighlighted all";
    }
    // Case 2: Digit Highlighted
    if (after.highlightState === 1) {
      return `Highlighted Digit ${after.highlightedDigit}`;
    }
    // Case 3: Bi-value Highlighted
    if (after.highlightState === 2) {
      return "Highlighted Bi-value cells";
    }
  }
  return null;
}
