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
const drawButton = modeSelector.querySelector('[data-mode="draw"]');
const colorButton = modeSelector.querySelector('[data-mode="color"]');
const difficultyLamp = document.getElementById("difficulty-lamp");
const vagueHintBtn = document.getElementById("vague-hint-btn");
const techniqueResultCache = new Map();

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
let isCustomDifficultyEvaluated = false;
let customScoreEvaluated = -1;
let lampTimestamps = {};
let previousLampColor = null;
let lastValidLampColor = "white";
let currentEvaluationId = 0;

let drawSubMode = "solid"; // "solid" or "dash"
let drawnLines = []; // Array of { r1, c1, n1, r2, c2, n2, color, style }
let drawingState = null; // { start: {r, c, n}, currentPos: {x, y} }
let lineColorPalette = []; // Specific palette for lines
let hadUsedHint = false;

const lastUsedColors = {
  draw: { solid: null, dash: null },
  color: { cell: null, candidate: null },
};

// --- UI Update Functions ---

function updateColorPalettes(isDarkMode) {
  if (isDarkMode) {
    cellColorPalette = colorPalette800;
    candidateColorPalette = colorPalette400;
    lineColorPalette = colorPalette600;
  } else {
    cellColorPalette = colorPalette300;
    candidateColorPalette = colorPalette700;
    lineColorPalette = colorPalette500;
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

  if (currentMode === "draw") {
    const label = drawSubMode === "solid" ? "Draw: Solid" : "Draw: Dash";
    drawButton.textContent = isMobile
      ? drawSubMode === "solid"
        ? "Solid"
        : "Dash"
      : label;
    drawButton.dataset.tooltip = `Draw Mode (${drawSubMode}): Click two candidates to connect. (X to toggle style)`;

    drawButton.classList.remove("active", "active-green");
    if (drawSubMode === "dash") {
      drawButton.classList.add("active-green");
    } else {
      drawButton.classList.add("active");
    }
  } else {
    drawButton.textContent = isMobile ? "Draw" : "Draw (X)";
    drawButton.dataset.tooltip = "Switch to Draw mode (X)";
    drawButton.classList.remove("active", "active-green");
  }

  if (currentMode === "color") {
    if (coloringSubMode === "cell") {
      colorButton.textContent = isMobile ? "Cell" : "Color: Cell";
      colorButton.dataset.tooltip =
        "Color Cell Mode: Pick a color, then click a cell to paint it. (C to switch)";
    } else {
      colorButton.textContent = isMobile ? "Cand." : "Color: Cand.";
      colorButton.dataset.tooltip =
        "Color Candidate Mode: Pick a color, then click a candidate to paint it. (C to switch)";
    }
  } else {
    colorButton.textContent = isMobile ? "Color" : "Color (C)";
    colorButton.dataset.tooltip = "Switch to Color mode (C)";
  }

  formatToggleBtn.style.display = "none";
  exptModeBtn.style.display = "inline-flex";

  const exptShortcut = isMobile ? "" : " (E)";
  exptModeBtn.textContent =
    (isExperimentalMode ? "Expt!" : "Expt.") + exptShortcut;

  // --- UPDATED LOGIC START ---
  if (isExperimentalMode) {
    // 1. Add active class
    exptModeBtn.classList.add("active-green");

    // 2. Remove default white background/text styling
    exptModeBtn.classList.remove(
      "bg-white",
      "text-gray-700",
      "hover:bg-gray-100",
    );

    // 3. Add explicit Green Active Styling (Background, Text, Border)
    exptModeBtn.classList.add(
      "bg-green-100",
      "text-green-800",
      "border-green-300",
      "hover:bg-green-200",
    );

    if (isMobile) {
      exptModeBtn.dataset.tooltip = "Experimental Mode Enabled!";
    } else {
      exptModeBtn.dataset.tooltip = "Disable Experimental Mode (E).";
    }
  } else {
    // 1. Remove active class
    exptModeBtn.classList.remove("active-green");

    // 2. Restore default white background/text styling
    exptModeBtn.classList.add("bg-white", "text-gray-700", "hover:bg-gray-100");

    // 3. Remove explicit Green Active Styling
    exptModeBtn.classList.remove(
      "bg-green-100",
      "text-green-800",
      "border-green-300",
      "hover:bg-green-200",
    );

    if (isMobile) {
      exptModeBtn.dataset.tooltip = "Experimental Mode Disabled.";
    } else {
      exptModeBtn.dataset.tooltip =
        "Enable Experimental Mode (E): Click candidates directly.";
    }
  }
  // --- UPDATED LOGIC END ---

  vagueHintBtn.textContent = isMobile ? "?" : "? (V)";
  if (isMobile) {
    vagueHintBtn.dataset.tooltip =
      "View increasingly concrete hints for the next step.";
  } else {
    vagueHintBtn.dataset.tooltip =
      "View increasingly concrete hints for the next step (V).";
  }

  if (!isMobile) {
    attachTooltipEvents(modeToggleButton);
    attachTooltipEvents(drawButton);
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
        })),
    );
}

function createGrid() {
  gridContainer.innerHTML = "";

  // 1. Generate the Grid Rows & Cells FIRST
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

  // 2. Add the SVG Drawing Layer LAST
  // Placing it last ensures it doesn't offset the :nth-child CSS selectors for the rows,
  // while z-index/absolute positioning keeps it visually on top.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "drawing-layer";
  svg.setAttribute(
    "class",
    "absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible",
  );
  gridContainer.appendChild(svg);
}

function updateControls() {
  numberPad.innerHTML = "";

  // Treat "draw" mode like "color" mode for the controls
  if (currentMode === "color" || currentMode === "draw") {
    let activePalette;

    // Select the correct palette
    if (currentMode === "draw") {
      activePalette = lineColorPalette;
    } else {
      activePalette =
        coloringSubMode === "candidate"
          ? candidateColorPalette
          : cellColorPalette;
    }

    for (let i = 0; i < 9; i++) {
      const btn = document.createElement("button");
      btn.style.backgroundColor = activePalette[i];
      btn.dataset.color = activePalette[i];
      btn.textContent = i + 1;

      const isDarkMode =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;

      // Text color logic
      let labelColor;
      if (currentMode === "draw") {
        // Lines use specific palettes; usually just ensure contrast
        labelColor =
          drawSubMode === "dash"
            ? isDarkMode
              ? "#1f2937"
              : "#e5e7eb"
            : isDarkMode
              ? "rgba(255,255,255,0.6)"
              : "rgba(31,31,31,0.6)";
      } else {
        labelColor =
          coloringSubMode === "candidate"
            ? isDarkMode
              ? "#1f2937"
              : "#e5e7eb"
            : isDarkMode
              ? "rgba(255,255,255,0.6)"
              : "rgba(31,31,31,0.6)";
      }

      btn.className =
        "color-btn p-2 text-lg font-bold border rounded-md shadow-sm h-12";
      btn.style.color = labelColor;

      // Highlight if selected
      if (selectedColor === activePalette[i]) {
        btn.classList.add("selected");
      }

      btn.addEventListener("mouseenter", () => {
        btn.style.filter = isDarkMode ? "brightness(1.25)" : "brightness(0.9)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.filter = "brightness(1)";
      });
      numberPad.appendChild(btn);
    }
  } else {
    // Concrete / Pencil Modes (Numbers)
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

/* REPLACE getCandidateCenter function in sudoku_ui.js */
function getCandidateCenter(r, c, n) {
  // Try DOM-based positioning first for perfect visual alignment
  const cell = gridContainer.querySelector(
    `.sudoku-cell[data-row="${r}"][data-col="${c}"]`,
  );
  if (cell) {
    const pencilGrid = cell.querySelector(".pencil-grid");
    if (pencilGrid) {
      const orderA = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const orderB = [7, 8, 9, 4, 5, 6, 1, 2, 3];
      const currentOrder = candidatePopupFormat === "A" ? orderA : orderB;
      const index = currentOrder.indexOf(n);

      const marks = pencilGrid.querySelectorAll(".pencil-mark");
      const mark = marks[index];

      if (mark) {
        const markRect = mark.getBoundingClientRect();
        const gridRect = gridContainer.getBoundingClientRect();

        // Account for the grid's border (clientLeft is the border width)
        const borderLeft = gridContainer.clientLeft || 0;
        const borderTop = gridContainer.clientTop || 0;
        const innerWidth = gridContainer.clientWidth;
        const innerHeight = gridContainer.clientHeight;

        // Calculate center relative to the inner content box (where SVG lives)
        const markCenterX =
          markRect.left + markRect.width / 2 - gridRect.left - borderLeft;
        const markCenterY =
          markRect.top + markRect.height / 2 - gridRect.top - borderTop;

        const x = (markCenterX / innerWidth) * 100;
        const y = (markCenterY / innerHeight) * 100;

        return { x, y };
      }
    }
  }

  // FALLBACK: Pure Math (Original Logic) if DOM elements are missing
  // This handles edge cases or initial loads before render
  const orderA = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const orderB = [7, 8, 9, 4, 5, 6, 1, 2, 3];
  const currentOrder = candidatePopupFormat === "A" ? orderA : orderB;

  const idx = currentOrder.indexOf(n);
  const subRow = Math.floor(idx / 3);
  const subCol = idx % 3;

  const cellWidth = 100 / 9;
  const subCellWidth = cellWidth / 3;
  const centerOffset = subCellWidth / 2;

  const x = c * cellWidth + subCol * subCellWidth + centerOffset;
  const y = r * cellWidth + subRow * subCellWidth + centerOffset;

  return { x, y };
}

function handleDrawClick(r, c, n) {
  // 1. Start Drawing
  if (!drawingState || !drawingState.start) {
    drawingState = {
      start: { r, c, n },
      currentPos: getCandidateCenter(r, c, n),
    };
    updatePreview(); // Initialize the preview (start circle)
    return;
  }

  // 2. Cancel (Clicking the same start point)
  if (
    drawingState.start.r === r &&
    drawingState.start.c === c &&
    drawingState.start.n === n
  ) {
    drawingState = null;
    updatePreview(); // Clear the preview
    return;
  }

  // 3. Complete Drawing
  const start = drawingState.start;
  const end = { r, c, n };

  // Use currently selected color or default
  const activeColor = selectedColor || lineColorPalette[0];

  // Create object for label formatting (Solid uses "=", Dash uses "-")
  const lineObj = {
    r1: start.r,
    c1: start.c,
    n1: start.n,
    r2: end.r,
    c2: end.c,
    n2: end.n,
    style: drawSubMode,
  };
  const label = formatLineLabel(lineObj);

  // Check for existing identical line (direction agnostic)
  const existingIdx = drawnLines.findIndex(
    (l) =>
      (l.r1 === start.r &&
        l.c1 === start.c &&
        l.n1 === start.n &&
        l.r2 === end.r &&
        l.c2 === end.c &&
        l.n2 === end.n) ||
      (l.r1 === end.r &&
        l.c1 === end.c &&
        l.n1 === end.n &&
        l.r2 === start.r &&
        l.c2 === start.c &&
        l.n2 === start.n),
  );

  let actionTaken = false;

  if (existingIdx !== -1) {
    const existing = drawnLines[existingIdx];
    // 4-1. Exact match (style & color) -> Delete
    if (existing.color === activeColor && existing.style === drawSubMode) {
      drawnLines.splice(existingIdx, 1);
      actionTaken = true;
    } else {
      // 4-2. Different properties -> Replace
      drawnLines[existingIdx] = {
        r1: start.r,
        c1: start.c,
        n1: start.n,
        r2: end.r,
        c2: end.c,
        n2: end.n,
        color: activeColor,
        style: drawSubMode,
      };
      actionTaken = true;
    }
  } else {
    // New Line
    drawnLines.push({
      r1: start.r,
      c1: start.c,
      n1: start.n,
      r2: end.r,
      c2: end.c,
      n2: end.n,
      color: activeColor,
      style: drawSubMode,
    });
    actionTaken = true;
  }

  // Cleanup
  drawingState = null;

  if (actionTaken) {
    saveState(); // Save history
  }

  renderLines(); // Update the static SVG layer (permits the new line)
  updatePreview(); // Clear the dynamic preview layer
}

function renderBoard() {
  const cells = gridContainer.querySelectorAll(".sudoku-cell");
  const isMobile = window.innerWidth <= 550;
  cells.forEach((cell) => {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const state = boardState[row][col];

    // Clear previous tooltip if exists
    if (cell.tooltipInstance) {
      cell.tooltipInstance.remove();
      cell.tooltipInstance = null;
    }

    cell.innerHTML = "";
    cell.classList.remove(
      "selected",
      "selected-green",
      "invalid",
      "highlighted",
    );
    cell.style.backgroundColor = state.cellColor || "";

    // Remove old handlers before adding new ones
    cell.onmouseover = null;
    cell.onmouseout = null;

    if (state.cellColor) {
      cell.classList.add("has-color");
    } else {
      cell.classList.remove("has-color");
    }

    cell.addEventListener(
      "mouseover",
      () => {
        currentlyHoveredElement = cell;
        if (
          currentMode === "color" &&
          coloringSubMode === "cell" &&
          selectedColor
        ) {
          cell.style.backgroundColor = selectedColor;
        }
      },
      { once: false },
    ); // Changed to explicit false for clarity

    cell.addEventListener(
      "mouseout",
      () => {
        currentlyHoveredElement = null;
        if (currentMode === "color" && coloringSubMode === "cell") {
          cell.style.backgroundColor = state.cellColor || "";
        }
      },
      { once: false },
    );
    if (row === selectedCell.row && col === selectedCell.col) {
      const useGreenHighlight =
        currentMode === "pencil" ||
        (currentMode === "color" && coloringSubMode === "candidate") ||
        (currentMode === "draw" && drawSubMode === "dash"); // ADD THIS CHECK

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
          const allowInteraction =
            !isMobile ||
            (isMobile && (isExperimentalMode || currentMode === "draw"));

          if (allowInteraction) {
            mark.addEventListener("mouseover", (e) => {
              e.stopPropagation();
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
              e.stopPropagation();
              currentlyHoveredElement = null;
              mark.style.color = state.pencilColors.get(i) || "";
            });
            mark.addEventListener("click", (e) => {
              if (currentMode === "draw") {
                e.stopPropagation();
                handleDrawClick(row, col, i);
              } else if (
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
                  // FIX: Start timer if not running
                  if (!timerInterval) startTimer(currentElapsedTime);

                  cellState.pencils.delete(i);
                  saveState();
                  onBoardUpdated();
                }
              } else if (isExperimentalMode && currentMode === "concrete") {
                e.stopPropagation();
                const cellState = boardState[row][col];
                if (cellState.isGiven) return;

                // FIX: Start timer if not running
                if (!timerInterval) startTimer(currentElapsedTime);

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

function pruneInvalidLines() {
  drawnLines = drawnLines.filter((line) => {
    const cell1 = boardState[line.r1][line.c1];
    const cell2 = boardState[line.r2][line.c2];

    // A candidate line endpoint is valid ONLY IF:
    // 1. The cell is empty (value === 0)
    // 2. The specific pencil mark (candidate) exists in the cell's set
    const startExists = cell1.value === 0 && cell1.pencils.has(line.n1);
    const endExists = cell2.value === 0 && cell2.pencils.has(line.n2);

    return startExists && endExists;
  });
}

/* REPLACE renderLines function */
function renderLines() {
  const svg = document.getElementById("drawing-layer");
  if (!svg) return;

  // Clear everything
  svg.innerHTML = "";

  // Create a group for static lines
  const staticGroup = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  );
  staticGroup.id = "static-lines-group";
  svg.appendChild(staticGroup);

  // Create a group for the preview
  const previewGroup = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  );
  previewGroup.id = "preview-lines-group";
  svg.appendChild(previewGroup);

  // Helper to draw a single line entry
  const drawLineEntry = (r1, c1, n1, r2, c2, n2, color, style) => {
    const start = getCandidateCenter(r1, c1, n1);
    const end = getCandidateCenter(r2, c2, n2);

    // Define radius (numeric for calculation)
    const radiusVal = style === "solid" ? 1.6 : 1.2;

    // --- Calculate Shortened Coordinates ---
    let x1 = start.x,
      y1 = start.y;
    let x2 = end.x,
      y2 = end.y;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Only offset if the line is longer than 2x radius (to prevent inversion)
    if (len > radiusVal * 2) {
      const offX = (dx / len) * radiusVal;
      const offY = (dy / len) * radiusVal;
      x1 += offX;
      y1 += offY;
      x2 -= offX;
      y2 -= offY;
    }

    // 1. Connection Line (Shortened)
    const path = document.createElementNS("http://www.w3.org/2000/svg", "line");
    path.setAttribute("x1", `${x1}%`);
    path.setAttribute("y1", `${y1}%`);
    path.setAttribute("x2", `${x2}%`);
    path.setAttribute("y2", `${y2}%`);
    path.setAttribute("stroke", color);
    path.classList.add("draw-line", style);
    staticGroup.appendChild(path);

    // 2. Endpoints (Drawn at original centers)
    const drawEndpoint = (cx, cy) => {
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", `${cx}%`);
      circle.setAttribute("cy", `${cy}%`);
      circle.setAttribute("r", `${radiusVal}%`);
      circle.setAttribute("fill", color);
      circle.setAttribute("opacity", "0.65");
      staticGroup.appendChild(circle);
    };

    drawEndpoint(start.x, start.y);
    drawEndpoint(end.x, end.y);
  };

  // Render ONLY stored lines
  drawnLines.forEach((line) => {
    drawLineEntry(
      line.r1,
      line.c1,
      line.n1,
      line.r2,
      line.c2,
      line.n2,
      line.color,
      line.style,
    );
  });
}

function updatePreview() {
  const svg = document.getElementById("drawing-layer");
  const previewGroup = document.getElementById("preview-lines-group");

  if (!svg || !previewGroup) return;

  if (!drawingState || !drawingState.start) {
    previewGroup.innerHTML = "";
    return;
  }

  const start = drawingState.start;
  const startPos = getCandidateCenter(start.r, start.c, start.n);
  const color = selectedColor || lineColorPalette[0] || "black";

  let endX, endY;
  if (drawingState.currentPos) {
    endX = drawingState.currentPos.x;
    endY = drawingState.currentPos.y;
  } else {
    endX = startPos.x;
    endY = startPos.y;
  }

  // --- Calculate Shortened Coordinates for Preview ---
  const radiusVal = drawSubMode === "solid" ? 1.6 : 1.2;

  let x1 = startPos.x,
    y1 = startPos.y;
  let x2 = endX,
    y2 = endY;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len > radiusVal) {
    x1 += (dx / len) * radiusVal;
    y1 += (dy / len) * radiusVal;

    if (len > radiusVal * 2) {
      x2 -= (dx / len) * radiusVal;
      y2 -= (dy / len) * radiusVal;
    }
  }

  let line = document.getElementById("preview-line-el");
  let circle = document.getElementById("preview-circle-el");

  if (!line) {
    line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.id = "preview-line-el";
    previewGroup.appendChild(line);

    circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.id = "preview-circle-el";
    previewGroup.appendChild(circle);
  }

  // 1. Update Line
  line.setAttribute("x1", `${x1}%`);
  line.setAttribute("y1", `${y1}%`);
  line.setAttribute("x2", `${x2}%`);
  line.setAttribute("y2", `${y2}%`);
  line.setAttribute("stroke", color);
  line.setAttribute("class", `draw-line ${drawSubMode}`);

  // 2. Update Start Circle
  circle.setAttribute("cx", `${startPos.x}%`);
  circle.setAttribute("cy", `${startPos.y}%`);
  circle.setAttribute("r", `${radiusVal}%`);
  circle.setAttribute("fill", color);
  circle.setAttribute("opacity", "0.65");
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
    { once: true },
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
    "magenta",
  ];

  // Always update visual state so undos/redos show correct lamp
  currentLampColor = color;
  difficultyLamp.classList.remove(...allColors.map((c) => `lamp-${c}`));
  difficultyLamp.classList.add(`lamp-${color}`);

  // Visual-only states that must never touch timestamp logic
  if (color === "black") {
    difficultyLamp.dataset.tooltip = hasUsedAutoPencil
      ? "Error: Incorrect progress has been made."
      : "Auto Pencil not used; evaluation halted.";
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
    magenta: "Unmeasured",
    gray: "Invalid",
  };

  const defaultRanges = {
    white: "Level 0",
    green: "Level 1 - 2",
    yellow: "Level 3 - 5",
    orange: "Level 6",
    red: "Level 7 - 8",
    violet: "Level 9-10",
    magenta: "Level 11",
    gray: "This puzzle does not have a unique solution.",
  };

  let tooltipText = "Difficulty Indicator";

  if (baseLabels[color]) {
    const label = baseLabels[color];
    let desc = defaultRanges[color] || "";

    // If a specific level is provided (and it's a solved state color), use it
    if (level !== null && color !== "gray") {
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
    if (isLoadingSavedGame && !["black", "gray"].includes(color)) {
      lastValidLampColor = color;
      previousLampColor = color;
    }
    return;
  }

  // -------------------------
  // Timestamp bookkeeping (record === true AND not loading)
  // -------------------------
  const colorHierarchy = {
    gray: 9,
    magenta: 8,
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
        colorHierarchy[key] < previousRank &&
        colorHierarchy[key] >= currentRank,
    );
    colorsToSet.forEach((colorName) => {
      // Overwrite with the latest time for authoritative final run
      lampTimestamps[colorName] = currentElapsedTime;
    });
  }
  // If difficulty increased (e.g., white -> green) clear timestamps lower than new rank.
  else if (currentRank > previousRank) {
    const colorsToReset = Object.keys(colorHierarchy).filter(
      (key) => colorHierarchy[key] < currentRank,
    );
    colorsToReset.forEach((colorName) => {
      if (lampTimestamps[colorName]) {
        delete lampTimestamps[colorName];
      }
    });
  }

  // commit previous color after bookkeeping
  if (!["black", "gray"].includes(color)) {
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
  const isDarkMode =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  updateColorPalettes(isDarkMode);

  loadExperimentalModePreference();
  gridContainer.addEventListener("click", handleCellClick);
  modeSelector.addEventListener("click", (e) => handleModeChange(e));
  numberPad.addEventListener("click", handleNumberPadClick);
  loadBtn.addEventListener("click", () => loadPuzzle(puzzleStringInput.value));

  puzzleStringInput.addEventListener("input", function () {
    const raw = this.value.replace(/\s/g, "");
    if (/^[0-9.]+$/.test(raw)) {
      const formatted = raw.match(/.{1,9}/g).join("\n");
      if (this.value !== formatted) {
        this.value = formatted;
      }
    }
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
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
    candidateModal.classList.add("hidden"),
  );
  window.addEventListener("resize", updateButtonLabels);
  formatToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    candidatePopupFormat = candidatePopupFormat === "A" ? "B" : "A";
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

  // [REQ 4] Allow re-selecting the same level in Unlimited Mode
  // If the user clicks the menu, we temporarily clear the selection (visually)
  // so that clicking the SAME number triggers a 'change' event.
  levelSelect.addEventListener("mousedown", () => {
    if (dateSelect.value === "unlimited") {
      levelSelect.dataset.lastVal = levelSelect.value;
      levelSelect.value = "";
    }
  });
  // If user clicks away without selecting, restore the old value
  levelSelect.addEventListener("blur", () => {
    if (dateSelect.value === "unlimited" && levelSelect.value === "") {
      levelSelect.value = levelSelect.dataset.lastVal;
    }
  });

  levelSelect.addEventListener("change", findAndLoadSelectedPuzzle);

  dateSelect.addEventListener("change", () => {
    if (dateSelect.value === "custom") {
      const dateModal = document.getElementById("date-modal");
      const dateInput = document.getElementById("date-input");
      const dateError = document.getElementById("date-error");
      dateModal.classList.remove("hidden");
      dateModal.classList.add("flex");
      dateInput.value = "";
      dateError.textContent = "";
      dateInput.focus();
    } else {
      findAndLoadSelectedPuzzle();
    }
  });

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
      (opt) => opt.value === rawValue,
    );
    if (!customOption) {
      customOption = document.createElement("option");
      customOption.value = rawValue;
      customOption.textContent = `${rawValue.slice(0, 4)}-${rawValue.slice(
        4,
        6,
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
  // 1. Select the new modal elements
  const hintModal = document.getElementById("hint-confirm-modal");
  const hintConfirmBtn = document.getElementById("hint-confirm-btn");
  const hintCancelBtn = document.getElementById("hint-cancel-btn");

  // 2. Define the core hint logic (extracted from the original click handler)
  const executeHint = () => {
    if (vagueHintMessage) {
      hadUsedHint = true;
      savePuzzleProgress();
      hintClickCount++;

      let message = "";
      let color = "green";

      if (!currentHintData || !currentHintData.hint) {
        message = `Vague Hint: ${vagueHintMessage}`;
      } else {
        const h = currentHintData.hint;
        const { r, c, num, type } = currentHintData;

        if (hintClickCount === 1) {
          message = `Vague Hint: ${h.name}`;
        } else if (hintClickCount === 2) {
          message = `Hint: ${h.name} - ${h.mainInfo || ""}`;
        } else {
          let actionStr = "";
          if (type === "place") {
            actionStr = `r${r + 1}c${c + 1} = ${num}`;
          } else {
            const cells = currentHintData.cells || [];
            const removalsByDigit = new Map();
            cells.forEach((cell) => {
              if (!removalsByDigit.has(cell.num)) {
                removalsByDigit.set(cell.num, []);
              }
              removalsByDigit.get(cell.num).push({ r: cell.r, c: cell.c });
            });
            const groups = [];
            const sortedDigits = Array.from(removalsByDigit.keys()).sort(
              (a, b) => a - b,
            );
            for (const d of sortedDigits) {
              const cellGroup = removalsByDigit.get(d);
              cellGroup.sort((a, b) => a.r - b.r || a.c - b.c);
              let locStr = "";
              const firstR = cellGroup[0].r;
              const isSameRow = cellGroup.every((c) => c.r === firstR);
              const firstC = cellGroup[0].c;
              const isSameCol = cellGroup.every((c) => c.c === firstC);
              if (isSameRow) {
                const cols = cellGroup.map((c) => c.c + 1).join("");
                locStr = `r${firstR + 1}c${cols}`;
              } else if (isSameCol) {
                const rows = cellGroup.map((c) => c.r + 1).join("");
                locStr = `r${rows}c${firstC + 1}`;
              } else {
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
      showMessage(message, color === "blue" ? "blue" : "green");
    } else {
      showMessage("Hint not found!", "orange");
    }
  };

  // 3. Update the main button listener
  vagueHintBtn.addEventListener("click", (e) => {
    // A. Validation Checks (Keep these before the modal)
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
    if (!vagueHintMessage) {
      showMessage("Hint not found!", "orange");
      return;
    }

    // B. Modal Logic
    if (!hadUsedHint) {
      // If first time, show confirmation
      hintModal.classList.remove("hidden");
      hintModal.classList.add("flex");
    } else {
      // If already used, execute immediately
      executeHint();
    }
  });

  // 4. Add listeners for the new modal buttons
  hintConfirmBtn.addEventListener("click", () => {
    hintModal.classList.add("hidden");
    hintModal.classList.remove("flex");
    executeHint(); // This sets hadUsedHint = true inside the function
  });

  hintCancelBtn.addEventListener("click", () => {
    hintModal.classList.add("hidden");
    hintModal.classList.remove("flex");
    // Do nothing, hadUsedHint remains false
  });
  exptModeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (arePencilsHidden && !isExperimentalMode) {
      showMessage(
        "Experimental mode is disabled while marks are hidden.",
        "orange",
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
    if (isMobile) {
      if (activeTooltipElement) {
        hideTooltip(activeTooltipElement);
      }
      showTooltip(exptModeBtn);
      activeTooltipElement = exptModeBtn;
    } else {
      if (exptModeBtn.tooltipInstance) {
        hideTooltip(exptModeBtn);
      }
    }
  });

  document.querySelectorAll("[data-tooltip]").forEach(attachTooltipEvents);
  attachTooltipEvents(vagueHintBtn);
  document.addEventListener("click", () => {
    if (activeTooltipElement) {
      hideTooltip(activeTooltipElement);
      activeTooltipElement = null;
    }
  });
  const sticker = document.getElementById("year-sticker");
  if (sticker) {
    sticker.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      sticker.classList.add("sticker-falling");
      setTimeout(() => {
        sticker.classList.add("sticker-collapsed");
      }, 1200);
    });
  }
  document.addEventListener("mousemove", (e) => {
    if (currentMode === "draw" && drawingState && drawingState.start) {
      const gridRect = gridContainer.getBoundingClientRect();
      const borderLeft = gridContainer.clientLeft || 0;
      const borderTop = gridContainer.clientTop || 0;
      const innerWidth = gridContainer.clientWidth;
      const innerHeight = gridContainer.clientHeight;
      const relativeX = e.clientX - gridRect.left - borderLeft;
      const relativeY = e.clientY - gridRect.top - borderTop;
      const xPct = (relativeX / innerWidth) * 100;
      const yPct = (relativeY / innerHeight) * 100;
      drawingState.currentPos = { x: xPct, y: yPct };
      requestAnimationFrame(updatePreview);
    }
  });
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
        "orange",
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
    renderBoard();
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
    const drawBtn = modeSelector.querySelector('[data-mode="draw"]');
    if (drawBtn) drawBtn.click();
    return;
  }
  if (key_lower === "c") {
    colorButton.click();
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
        "orange",
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
    if (currentMode === "color" || currentMode === "draw") {
      const colorButtons = numberPad.querySelectorAll("button");
      const colorIndex = parseInt(key) - 1;
      if (colorButtons[colorIndex]) {
        colorButtons[colorIndex].click();
      }
    } else if (currentMode === "concrete" || currentMode === "pencil") {
      if (selectedCell.row === null) return;
      const numPadButton = numberPad.querySelector(
        `button[data-number="${key}"]`,
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

/* REPLACE handleModeChange function */
function handleModeChange(e) {
  const clickedButton = e.target.closest("button");
  if (!clickedButton) return;

  e.stopPropagation();

  // Allow Draw button, plus the existing ones
  const drawButton = modeSelector.querySelector('[data-mode="draw"]');
  if (
    clickedButton !== modeToggleButton &&
    clickedButton !== colorButton &&
    clickedButton !== drawButton
  ) {
    return;
  }

  // --- Logic Checks (Guard Clauses) ---
  if (clickedButton === modeToggleButton) {
    const targetMode = currentMode === "concrete" ? "pencil" : "concrete";
    if (targetMode === "pencil" && arePencilsHidden) {
      showMessage(
        "Pencil mode is disabled while marks are hidden. (Press Alt+A to make visible)",
        "orange",
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
          "orange",
        );
        return;
      }
    }
  }

  const previousMode = currentMode;
  const wasUsingColorPad = previousMode === "color" || previousMode === "draw";

  // 1. Handle Draw Click
  if (clickedButton === drawButton) {
    if (currentMode !== "draw") {
      currentMode = "draw";
      drawSubMode = "solid";
    } else {
      drawSubMode = drawSubMode === "solid" ? "dash" : "solid";
    }
    drawingState = null;
  }
  // 2. Handle Logic/Color Clicks (Switching AWAY from Draw)
  else if (
    clickedButton === modeToggleButton ||
    clickedButton === colorButton
  ) {
    if (currentMode === "draw") {
      drawingState = null;
    }
  }

  // 3. Handle Standard Mode Toggles
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

  if (currentMode === "color" || currentMode === "draw") {
    let activePalette;
    let savedColor = null;

    if (currentMode === "draw") {
      activePalette = lineColorPalette;
      savedColor = lastUsedColors.draw[drawSubMode];
    } else {
      activePalette =
        coloringSubMode === "candidate"
          ? candidateColorPalette
          : cellColorPalette;
      savedColor = lastUsedColors.color[coloringSubMode];
    }

    // Use saved color if it exists; otherwise fallback to first color in palette
    if (savedColor) {
      selectedColor = savedColor;
    } else if (activePalette && activePalette.length > 0) {
      selectedColor = activePalette[0];
    }
  } else {
    selectedColor = null;
  }

  // --- UI Refresh Logic ---

  // Determine if we need to switch the pad (Number Pad <-> Color Palette)
  const isUsingColorPad = currentMode === "color" || currentMode === "draw";
  const padChanged = wasUsingColorPad !== isUsingColorPad;

  // Check if we need to rebuild controls (Switching palettes or sub-modes)
  const modeTypeChanged =
    (previousMode === "color" && currentMode === "draw") ||
    (previousMode === "draw" && currentMode === "color");
  const colorSubChanged =
    clickedButton === colorButton && currentMode === "color";
  const drawSubChanged = clickedButton === drawButton && currentMode === "draw";

  // If any mode/submode changed, rebuild controls to show correct palette & selection
  if (padChanged || modeTypeChanged || colorSubChanged || drawSubChanged) {
    updateControls();
  }

  // --- Visuals (Buttons & Tips) ---
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
    tip =
      coloringSubMode === "cell"
        ? isMobile
          ? "Tip: Pick a color, then touch a cell to paint it."
          : "Tip: Pick a color, then click a&nbsp;cell&nbsp;<span class='shortcut-highlight'>(or press 'C')</span> to paint it."
        : isMobile
          ? "Tip: Pick a color, then touch a cell to select a candidate."
          : "Tip: Pick a color, hover over a candidate to preview, and click to apply.";
  } else if (currentMode === "draw") {
    tip = isMobile
      ? `Draw (${drawSubMode}): Touch start then end candidate.`
      : `Draw (${drawSubMode}): Click two candidates to connect. (X to switch)`;
  }
  showMessage(tip, "gray");

  // Reset Button Classes
  modeToggleButton.classList.remove("active", "active-green");
  colorButton.classList.remove("active", "active-green");
  drawButton.classList.remove("active", "active-green");

  // Apply Active Class
  if (currentMode === "concrete") modeToggleButton.classList.add("active");
  else if (currentMode === "pencil")
    modeToggleButton.classList.add("active-green");
  else if (currentMode === "color") {
    if (coloringSubMode === "candidate")
      colorButton.classList.add("active-green");
    else colorButton.classList.add("active");
  } else if (currentMode === "draw") {
    if (drawSubMode === "dash") {
      drawButton.classList.add("active-green");
    } else {
      drawButton.classList.add("active");
    }
  }

  renderBoard();
  renderLines();
  updateButtonLabels();

  // Handle Mobile Tooltips
  if (isMobile) {
    if (activeTooltipElement) hideTooltip(activeTooltipElement);
    showTooltip(clickedButton);
    activeTooltipElement = clickedButton;
  } else {
    if (clickedButton.tooltipInstance) hideTooltip(clickedButton);
  }
}

function handleNumberPadClick(e) {
  const btn = e.target.closest("button");
  if (!btn) return;

  // Handle Color Selection (Color Mode OR Draw Mode)
  if (currentMode === "color" || currentMode === "draw") {
    selectedColor = btn.dataset.color;

    if (currentMode === "draw") {
      lastUsedColors.draw[drawSubMode] = selectedColor;
    } else {
      lastUsedColors.color[coloringSubMode] = selectedColor;
    }

    // Visual update for buttons
    numberPad
      .querySelectorAll(".color-btn")
      .forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");

    // Immediate preview effect (only for Color mode)
    if (currentMode === "color" && currentlyHoveredElement) {
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

  // Handle Number Input (Concrete / Pencil)
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
      if (!timerInterval) startTimer(currentElapsedTime);
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

  const unlimitedOption = document.createElement("option");
  unlimitedOption.value = "unlimited";
  unlimitedOption.textContent = "Unlimited";
  dateSelect.appendChild(unlimitedOption);
}

/**
 * Decompresses a puzzle string by converting letters a-z back into dots.
 * a = 1 dot, b = 2 dots, ... z = 26 dots.
 */
function decompressPuzzleString(str) {
  if (!str) return "";
  // Check if string needs decompression (contains letters)
  if (!/[a-z]/.test(str)) return str;

  return str.replace(/[a-z]/g, (char) => {
    // 'a' is code 97. 97 - 96 = 1 dot.
    return ".".repeat(char.charCodeAt(0) - 96);
  });
}

async function findAndLoadSelectedPuzzle() {
  // 1. Handle "Unlimited" Mode
  if (dateSelect.value === "unlimited") {
    let level = parseInt(levelSelect.value, 10);

    // Fallback Level 10 to 9
    if (level >= 10) {
      level = 9;
      levelSelect.value = "9";
    }

    // CHECK FOR SAVED GAME
    let allSaves = [];
    try {
      const savedData = localStorage.getItem("sudokuSaves");
      if (savedData) allSaves = JSON.parse(savedData);
    } catch (e) {}

    const savedGame = allSaves.find(
      (s) => s.date === "unlimited" && s.level === level,
    );

    if (savedGame) {
      // CLEAR BOARD VISUALS immediately
      initBoardState();
      renderBoard();
      document.getElementById("candidate-modal").classList.add("hidden");

      // Show Resume Modal
      const modal = document.getElementById("resume-modal");
      const levelText = document.getElementById("resume-level-text");
      const resumeBtn = document.getElementById("resume-btn");
      const newGameBtn = document.getElementById("new-game-btn");

      levelText.textContent = `Level ${level}`;
      modal.classList.remove("hidden");
      modal.classList.add("flex");

      // Define one-time handlers
      resumeBtn.onclick = (e) => {
        e.stopPropagation(); // STOP PROPAGATION
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        puzzleStringInput.value = savedGame.puzzle;

        const unlimitedData = {
          date: "unlimited",
          level: level,
          score: 0,
          puzzle: savedGame.puzzle,
        };

        loadPuzzle(savedGame.puzzle, unlimitedData);
        puzzleLevelEl.textContent = `Unlimited Lv. ${level}`;
      };

      newGameBtn.onclick = (e) => {
        e.stopPropagation(); // STOP PROPAGATION
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        // Remove the old save since user chose New Game
        removeCurrentPuzzleSave();
        fetchUnlimitedPuzzle(level);
      };

      return; // Stop here, wait for user input
    }

    // No save found, fetch new immediately
    fetchUnlimitedPuzzle(level);
    return;
  }

  // 2. Handle Standard Date/Level Selection
  if (dateSelect.value === "custom") {
    dateSelect.value = dateSelect.options[0].value;
  }
  const selectedDate = parseInt(dateSelect.value, 10);
  const selectedLevel = parseInt(levelSelect.value, 10);
  const puzzle = allPuzzles.find(
    (p) => p.date === selectedDate && p.level === selectedLevel,
  );
  if (puzzle) {
    const rawPuzzle = puzzle.puzzle;
    const decompressedPuzzle = decompressPuzzleString(rawPuzzle);

    puzzleStringInput.value = decompressedPuzzle;
    loadPuzzle(decompressedPuzzle, puzzle);
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
        `You solved it!${hadUsedHint ? "" : " ★"} → `,
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
              "Copied Discord sharable text!",
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
      showMessage(`You solved it!${hadUsedHint ? "" : " ★"}`, "green");
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
  drawnLines = []; // Clear the lines array
  drawingState = null; // Reset any active drawing state
  renderLines(); // Update the SVG layer
  saveState();
  renderBoard();
  showMessage("All colors cleared.", "gray");
}

function autoPencil() {
  if (hasUsedAutoPencil && !isAutoPencilPending) {
    showMessage(
      "This will overwrite pencil marks. Click again to apply.",
      "orange",
    );
    isAutoPencilPending = true;
    return;
  }
  if (!timerInterval) startTimer(currentElapsedTime);
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
      "gray",
    );
  }, 2000);
}

async function loadPuzzle(puzzleString, puzzleData = null) {
  if (autoPencilTipTimer) clearTimeout(autoPencilTipTimer);
  if (lampEvaluationTimeout) clearTimeout(lampEvaluationTimeout);
  techniqueResultCache.clear();
  vagueHintMessage = "";
  lampTimestamps = {};
  previousLampColor = null;

  currentEvaluationId++;

  document.querySelectorAll(".custom-tooltip").forEach((tooltip) => {
    tooltip.remove();
  });
  activeTooltipElement = null;

  const isUnlimited = puzzleData && puzzleData.date === "unlimited";
  isCustomPuzzle = puzzleData === null || isUnlimited;

  isCustomDifficultyEvaluated = false;
  customScoreEvaluated = -1;
  isLoadingSavedGame = false;
  lastValidScore = 0;
  hadUsedHint = false;

  // -- 1. Parse Puzzle String --
  const isMultiLine = puzzleString.includes("|") && puzzleString.includes("\n");
  let parsedGridCells = null;
  if (isMultiLine) {
    const lines = puzzleString.trim().split("\n");
    const dataRows = lines.filter((line) => line.trim().startsWith("|"));
    if (dataRows.length === 9) {
      const extractedCells = [];
      dataRows.forEach((row) => {
        const matches = row.match(/\d+/g);
        if (matches) extractedCells.push(...matches);
      });
      if (extractedCells.length === 81) parsedGridCells = extractedCells;
    }
  }

  initBoardState();
  drawnLines = [];
  drawingState = null;
  renderLines();

  if (parsedGridCells) {
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
    let normalizedPuzzleString = "";
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
    const cleanString = puzzleString.replace(/\s/g, "");
    if (cleanString.length !== 81 || !/^[0-9\.]+$/.test(cleanString)) {
      showMessage("Error: Invalid puzzle string.", "red");
      addSudokuCoachLink(null);
      return;
    }
    initialPuzzleString = cleanString;
    for (let i = 0; i < 81; i++) {
      const char = cleanString[i];
      const row = Math.floor(i / 9);
      const col = i % 9;
      if (char >= "1" && char <= "9") {
        const num = parseInt(char, 10);
        boardState[row][col].value = num;
        boardState[row][col].isGiven = true;
      }
    }
  }

  const boardForValidation = Array(9)
    .fill(null)
    .map(() => Array(9).fill(0));
  for (let i = 0; i < 81; i++) {
    const char = initialPuzzleString[i];
    if (char >= "1" && char <= "9") {
      boardForValidation[Math.floor(i / 9)][i % 9] = parseInt(char, 10);
    }
  }

  let savedTime = 0;
  let wasSaveLoaded = false;

  const initialBoardForSolution = boardForValidation.map((row) => [...row]);
  solveSudoku(initialBoardForSolution);
  solutionBoard = initialBoardForSolution;

  if (isCustomPuzzle) {
    const validity = checkPuzzleUniqueness(boardForValidation);
    if (!validity.isValid) {
      setTimeout(() => showMessage(validity.message, "red"), 750);
    }
  }

  // --- SPECIAL HANDLING FOR UNLIMITED: INITIAL EVALUATION ---
  if (isUnlimited) {
    // [FIX] If we loaded a score from the save, use it directly!
    if (puzzleData && puzzleData.score > 0) {
      customScoreEvaluated = puzzleData.score;
      isCustomDifficultyEvaluated = true;
    } else {
      // Otherwise, we must evaluate. Use { waitForFrame: false } to minimize race conditions.
      await evaluateBoardDifficulty({ waitForFrame: false });

      // RETRY LOGIC: If evaluation aborted, retry once.
      if (!isCustomDifficultyEvaluated) {
        currentEvaluationId++;
        await evaluateBoardDifficulty({ waitForFrame: false });
      }
    }
  }

  // --- APPLY SAVED PROGRESS ---
  if (puzzleData) {
    // For Unlimited, puzzleData is constructed manually
    savedTime = applySavedProgress(puzzleData);
    if (savedTime > 0) {
      wasSaveLoaded = true;
      isLoadingSavedGame = true;
      showMessage("Resumed saved game.", "green");
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

  // UI Labels
  if (puzzleData) {
    currentPuzzleScore = puzzleData.score;
    if (!isUnlimited) {
      puzzleLevelEl.textContent = `Lv. ${puzzleData.level} (${difficultyWords[puzzleData.level]})`;
      puzzleScoreEl.textContent = `~${puzzleData.score}`;
    }
    // For Unlimited, the label is set in findAndLoadSelectedPuzzle
  } else {
    currentPuzzleScore = 0;
    puzzleLevelEl.textContent = "";
    puzzleScoreEl.textContent = "";
    dateSelect.value = "custom";
  }

  renderBoard();
  savePuzzleTimer();

  currentPuzzleKey = isCustomPuzzle
    ? isUnlimited
      ? `unlimited-${puzzleData.level}`
      : null
    : `${puzzleData.date}-${puzzleData.level}`;

  loadPuzzleTimer(savedTime);

  // Evaluate AGAIN to update the Lamp color based on current (potentially resumed) progress
  isLoadingSavedGame = false;
  await evaluateBoardDifficulty();

  saveState();

  if (savedTime > 0 && !timerInterval) {
    startTimer(savedTime);
  }

  addSudokuCoachLink(initialPuzzleString);

  if (isCustomPuzzle) {
    if (!isUnlimited && !wasSaveLoaded)
      showMessage("Custom puzzle loaded!", "green");
  } else if (!wasSaveLoaded && puzzleData) {
    showMessage(
      `Loaded puzzle for ${dateSelect.options[dateSelect.selectedIndex].text}, Level ${puzzleData.level}`,
      "green",
    );
  }

  if (puzzleData && !isUnlimited) {
    setTimeout(() => {
      const tip = levelTips[puzzleData.level];
      if (tip) showMessage(tip, "gray");
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

  checkCompletion();
}

function clearUserBoard() {
  // Clean up tooltips
  document.querySelectorAll(".custom-tooltip").forEach((tooltip) => {
    tooltip.remove();
  });
  activeTooltipElement = null;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (!boardState[r][c].isGiven) {
        boardState[r][c].value = 0;
        boardState[r][c].pencils.clear();
      }
    }
  }
  techniqueResultCache.clear();
  lampTimestamps = {};
  previousLampColor = null;
  vagueHintMessage = "";
  hasUsedAutoPencil = false;
  isAutoPencilPending = false;
  isSolvePending = false;
  isClearStoragePending = false;
  drawnLines = [];
  drawingState = null;
  renderLines();
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
  // Allow saving if it's a standard daily puzzle OR an Unlimited puzzle
  const isUnlimited = dateSelect.value === "unlimited";

  // Do not save strictly custom (user-entered) puzzles or during auto-solve
  if ((isCustomPuzzle && !isUnlimited) || isSolvingViaButton) return;

  const selectedDate = isUnlimited
    ? "unlimited"
    : parseInt(dateSelect.value, 10);
  const selectedLevel = parseInt(levelSelect.value, 10);

  if (
    (!selectedDate && selectedDate !== "unlimited") ||
    isNaN(selectedLevel) ||
    !initialPuzzleString
  )
    return;

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
          break;
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

  // Find existing save for this specific Date + Level
  const existingSaveIndex = allSaves.findIndex(
    (s) => s.date === selectedDate && s.level === selectedLevel,
  );

  if (hasUserInput) {
    const currentSave = {
      date: selectedDate,
      level: selectedLevel,
      puzzle: initialPuzzleString,
      progress: serializeProgress(),
      lines: drawnLines,
      time: Math.max(0, Math.floor(currentElapsedTime)),
      lampTimes: lampTimestamps,
      usedHint: hadUsedHint,
      // [FIX] Save the initial difficulty score if available
      difficultyScore: customScoreEvaluated > 0 ? customScoreEvaluated : 0,
    };

    if (existingSaveIndex > -1) {
      // Preserve difficultyScore if we already have it but current session lost it (edge case)
      if (
        currentSave.difficultyScore === 0 &&
        allSaves[existingSaveIndex].difficultyScore > 0
      ) {
        currentSave.difficultyScore =
          allSaves[existingSaveIndex].difficultyScore;
      }
      allSaves[existingSaveIndex] = currentSave; // Overwrite
    } else {
      allSaves.push(currentSave); // Add new
    }

    if (allSaves.length > 999) {
      allSaves.shift();
    }
  } else {
    // If board is empty (reset), remove the save
    if (existingSaveIndex > -1) {
      allSaves.splice(existingSaveIndex, 1);
    }
  }

  localStorage.setItem("sudokuSaves", JSON.stringify(allSaves));
}

function removeCurrentPuzzleSave() {
  const isUnlimited = dateSelect.value === "unlimited";
  if (isCustomPuzzle && !isUnlimited) return;

  const selectedDate = isUnlimited
    ? "unlimited"
    : parseInt(dateSelect.value, 10);
  const selectedLevel = parseInt(levelSelect.value, 10);
  if ((!selectedDate && selectedDate !== "unlimited") || isNaN(selectedLevel))
    return;

  let allSaves = [];
  try {
    const savedData = localStorage.getItem("sudokuSaves");
    if (savedData) {
      allSaves = JSON.parse(savedData);
      if (!Array.isArray(allSaves)) allSaves = [];
    }
  } catch (e) {
    return;
  }

  const existingSaveIndex = allSaves.findIndex(
    (s) => s.date === selectedDate && s.level === selectedLevel,
  );

  if (existingSaveIndex > -1) {
    allSaves.splice(existingSaveIndex, 1);
    localStorage.setItem("sudokuSaves", JSON.stringify(allSaves));
  }
}

/* ADD helper function to fetch new unlimited puzzles */
async function fetchUnlimitedPuzzle(level) {
  const fileIndex = String(level).padStart(2, "0");
  const filename = `./sudoku/unlimited/Lv${fileIndex}.txt`;

  showMessage(`Fetching Unlimited Puzzle (Lv. ${level})...`, "blue");

  try {
    const response = await fetch(filename);
    if (!response.ok) throw new Error(`Failed to fetch ${filename}`);

    const text = await response.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) throw new Error("Puzzle file is empty or invalid.");

    const randomIndex = Math.floor(Math.random() * lines.length);
    const rawString = lines[randomIndex];
    const puzzleStr = decompressPuzzleString(rawString);

    if (puzzleStr.length !== 81)
      throw new Error("Puzzle integrity check failed.");

    puzzleStringInput.value = puzzleStr;

    const unlimitedData = {
      date: "unlimited",
      level: level,
      score: 0,
      puzzle: puzzleStr,
    };

    loadPuzzle(puzzleStr, unlimitedData);

    puzzleLevelEl.textContent = `Unlimited Lv. ${level}`;
    puzzleScoreEl.textContent = "";
    showMessage("Loaded Unlimited Puzzle!", "green");
  } catch (err) {
    console.error(err);
    showMessage("Error loading unlimited puzzle.", "red");
    initBoardState();
    renderBoard();
  }
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
    (s) => s.date === puzzleData.date && s.level === puzzleData.level,
  );
  if (savedGameIndex === -1) return 0;

  const savedGame = allSaves[savedGameIndex];

  if (savedGame.lines) {
    drawnLines = savedGame.lines;
  } else {
    drawnLines = [];
  }

  hadUsedHint = savedGame.usedHint !== undefined ? savedGame.usedHint : true;

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
        "lamp-magenta",
      );
      difficultyLamp.classList.add(`lamp-${last}`);

      const tooltips = {
        white: "Easy: Level 0",
        green: "Medium: Level 1 - 2",
        yellow: "Hard: Level 3 - 5",
        orange: "Unfair: Level 6",
        red: "Extreme: Level 7 - 8",
        violet: "Insane: Level 9-10",
        magenta: "Unmeasured: Level 11",
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

  renderLines();

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
      "orange",
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

  let puzzleDateStr = new Date().toISOString().slice(0, 10);
  if (dateVal && /^\d{8}$/.test(dateVal)) {
    puzzleDateStr = `${dateVal.slice(0, 4)}-${dateVal.slice(
      4,
      6,
    )}-${dateVal.slice(6, 8)}`;
  }

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

  let levelStr = `${levelInfo[level].emoji} Level ${level} (${levelWord})`;

  // Append star if hints were never used
  if (!hadUsedHint) {
    levelStr += " :star:";
  }

  let timeDetails = "";
  for (const item of accomplishmentOrder) {
    const itemRank = colorHierarchy[item.color];
    if (itemRank < startingRank && lampTimestamps[item.color]) {
      timeDetails += `\n${item.emoji} ${formatTime(
        lampTimestamps[item.color],
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
    })),
  );
}

function saveState() {
  history = history.slice(0, historyIndex + 1);
  history.push({
    boardState: cloneBoardState(boardState),
    drawnLines: JSON.parse(JSON.stringify(drawnLines)), // Deep copy lines
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
  pruneInvalidLines();

  currentEvaluationId++; // Increment this to cancel any running evaluations
  renderBoard();

  renderLines();

  const isBoardValid = validateBoard();

  if (!isBoardValid) {
    updateLamp("black", { record: false });
  } else if (currentLampColor === "black") {
  }

  if (skipEvaluation) return;

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

  // Prioritize the time saved during the current session.
  const inSessionTime = puzzleTimers[currentPuzzleKey];

  // If we have an in-session time, use it; otherwise, use the time from storage.
  const timeToStart =
    typeof inSessionTime === "number" ? inSessionTime : savedTimeFromStorage;

  // MODIFIED: Set time but DO NOT start the interval automatically
  currentElapsedTime = timeToStart > 0 ? timeToStart : 0;
  puzzleTimerEl.textContent = formatTime(currentElapsedTime);
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
    const currentEntry = history[historyIndex];
    const prevEntry = history[historyIndex - 1];

    // 1. Calculate Diff (Board)
    const actionDesc = getDiffDescription(
      prevEntry.boardState,
      currentEntry.boardState,
    );

    // 2. Calculate Diff (Lines)
    const lineDesc = getLineDiffDescription(
      prevEntry.drawnLines,
      currentEntry.drawnLines,
    );

    // 3. Combine Diffs
    let finalDesc = actionDesc;
    if (finalDesc === "No visible changes" && lineDesc) {
      finalDesc = lineDesc;
    } else if (lineDesc) {
      finalDesc += `, ${lineDesc}`;
    }

    historyIndex--;
    const historyEntry = history[historyIndex];
    boardState = cloneBoardState(historyEntry.boardState);
    drawnLines = JSON.parse(JSON.stringify(historyEntry.drawnLines || [])); // Restore lines
    vagueHintMessage = historyEntry.vagueHint;

    lampTimestamps = JSON.parse(
      JSON.stringify(historyEntry.lampTimestamps || {}),
    );
    previousLampColor = historyEntry.previousLampColor;

    updateLamp(historyEntry.lampColor, { record: false });

    renderBoard();
    renderLines();
    // Pass true to skip evaluation if logic didn't change (purely aesthetic line change)
    const logicChanged = actionDesc !== "No visible changes" || lineDesc;
    onBoardUpdated(!logicChanged);

    updateUndoRedoButtons();
    savePuzzleProgress();

    showMessage(`Undid: ${finalDesc}`, "gray");
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    const currentEntry = history[historyIndex];
    const nextEntry = history[historyIndex + 1];

    // 1. Calculate Diff
    const actionDesc = getDiffDescription(
      currentEntry.boardState,
      nextEntry.boardState,
    );
    const lineDesc = getLineDiffDescription(
      currentEntry.drawnLines,
      nextEntry.drawnLines,
    );

    // 2. Combine
    let finalDesc = actionDesc;
    if (finalDesc === "No visible changes" && lineDesc) {
      finalDesc = lineDesc;
    } else if (lineDesc) {
      finalDesc += `, ${lineDesc}`;
    }

    historyIndex++;
    const historyEntry = history[historyIndex];
    boardState = cloneBoardState(historyEntry.boardState);
    drawnLines = JSON.parse(JSON.stringify(historyEntry.drawnLines || []));
    vagueHintMessage = historyEntry.vagueHint;

    lampTimestamps = JSON.parse(
      JSON.stringify(historyEntry.lampTimestamps || {}),
    );
    previousLampColor = historyEntry.previousLampColor;

    updateLamp(historyEntry.lampColor, { record: false });

    renderBoard();
    renderLines();

    const logicChanged = actionDesc !== "No visible changes" || lineDesc;
    onBoardUpdated(!logicChanged);

    updateUndoRedoButtons();
    savePuzzleProgress();

    showMessage(`Redid: ${finalDesc}`, "gray");
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
    JSON.stringify(isExperimentalMode),
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

// --- Difficulty Evaluation Logic ---
const getThemeColor = (level) => {
  // Check if browser is in dark mode
  const isDarkMode =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const palette = isDarkMode ? PALETTES.dark : PALETTES.light;

  // Return color or fallback
  return palette[level] || palette[0];
};
/**
 * Generates a fast 32-bit hash of the current board state.
 * Inputs: Concrete values and candidate bitmasks.
 */
function getBoardStateHash(board, pencils) {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < 81; i++) {
    const r = (i / 9) | 0;
    const c = i % 9;
    const val = board[r][c];
    let mask = 0;

    if (val === 0) {
      // Encode candidates as a bitmask
      const p = pencils[r][c];
      if (p.size > 0) {
        for (const n of p) mask |= 1 << n;
      }
    } else {
      // Concrete value: Shift to separate from masks and set high bit
      mask = (val << 12) | 0x80000000;
    }

    // FNV-1a mixing
    h = Math.imul(h ^ mask, 0x01000193);
  }
  return h;
}

async function evaluateBoardDifficulty(opts = {}) {
  // [FIX] Support options to skip frame waiting for more robust initialization
  const { waitForFrame = true } = opts;

  // 1. Capture the ID of this specific run
  const myEvaluationId = currentEvaluationId;

  if (waitForFrame) {
    // Yield immediately to let UI render any pending changes
    await new Promise(requestAnimationFrame);

    // Abort if a new update happened while we were waiting
    if (myEvaluationId !== currentEvaluationId) return;
  }

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
      row.map((cell) => new Set(cell.pencils)),
    );
  }
  const virtualBoard = currentBoardForEval.map((row) =>
    row.map((cell) => cell.value),
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
      name: "Unique Loop",
      func: techniques.uniqueHexagon,
      level: 5,
      score: 120,
    },
    {
      name: "Extended Unique Rectangle",
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
      name: "Grouped 2-String Kite",
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
    {
      name: "Aligned Triple Exclusion",
      func: techniques.alignedTripleExclusion,
      level: 9,
      score: 310,
    },
    {
      name: "Almost Locked Set XY-Wing",
      func: techniques.alsXYWing,
      level: 9,
      score: 320,
    },
    {
      name: "Almost Locked Set W-Wing",
      func: techniques.alsWWing,
      level: 9,
      score: 340,
    },
    {
      name: "Almost Locked Set Chain",
      func: techniques.alsChain,
      level: 10,
      score: 360,
    },
    {
      name: "Death Blossom",
      func: techniques.deathBlossom,
      level: 10,
      score: 380,
    },
    {
      name: "Finned Franken Swordfish",
      func: techniques.finnedFrankenSwordfish,
      level: 10,
      score: 410,
    },
    {
      name: "Finned Mutant Swordfish",
      func: techniques.finnedMutantSwordfish,
      level: 10,
      score: 490,
    },
  ];
  const solveStartTime = performance.now();
  if (IS_DEBUG_MODE) {
    console.clear();
    console.log("--- Starting New Difficulty Evaluation ---");
    console.log("Initial Board State (0 = empty):");
    console.table(virtualBoard);
  }
  // --- ASYNC SOLVING LOOP ---
  let evaluatedScore = 0;
  let progressMade = true;
  let lastYieldTime = performance.now();
  while (progressMade) {
    // A. NON-BLOCKING CHECK
    // If more than 12ms have passed since the last frame, yield to the browser
    if (performance.now() - lastYieldTime > 12) {
      // [FIX] Ensure we respect the waitForFrame option even inside the loop
      // to keep initialization logic tight if requested.
      if (waitForFrame) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        // B. CANCELLATION CHECK
        // If the user changed the board during the pause, stop this calculation
        if (myEvaluationId !== currentEvaluationId) return;
      }
      lastYieldTime = performance.now();
    }

    const isSolved = virtualBoard.flat().every((v) => v !== 0);
    if (isSolved) break;

    progressMade = false;

    alsCacheBuilt = false;
    alsRccMapBuilt = false;

    for (const tech of techniqueOrder) {
      // [OPTIMIZATION] Compute hash for the current board state
      const currentHash =
        tech.level > 5
          ? getBoardStateHash(virtualBoard, startingPencils)
          : null;
      // console.log(currentHash);
      const cacheKey = currentHash ? `${currentHash}_${tech.name}` : null;

      let result;

      // Check Cache
      if (cacheKey && techniqueResultCache.has(cacheKey)) {
        result = techniqueResultCache.get(cacheKey);
        // console.log(`Used cache ${tech.name}`);
      } else {
        if (tech.name === "Almost Locked Set XZ-Rule") {
          alsCacheBuilt = true;
        } else if (tech.name === "Almost Locked Set XY-Wing") {
          if (!alsCacheBuilt) _alsCache = [];
          alsCacheBuilt = true;
          alsRccMapBuilt = true;
        } else if (
          (tech.name === "Almost Locked Set W-Wing") |
          (tech.name === "Almost Locked Set Chain")
        ) {
          if (!alsCacheBuilt) _alsCache = [];
          alsCacheBuilt = true;
          if (!alsRccMapBuilt) {
            _alsDigitCommonPeers = {};
            _alsRccMap = {};
            _alsLookup = {};
          }
          alsRccMapBuilt = true;
        } else if (tech.name === "Death Blossom") {
          if (!alsCacheBuilt) _alsCache = [];
          alsCacheBuilt = true;
        }
        // Run Technique
        result = tech.func(virtualBoard, startingPencils);
        // Store in Cache (if safe)
        if (cacheKey) techniqueResultCache.set(cacheKey, result);
      }
      if (result.change) {
        evaluatedScore += tech.score;
        if (IS_DEBUG_MODE) {
          const logColor = getThemeColor(tech.level);
          console.groupCollapsed(
            `%c${tech.level.toString().padStart(2)} ${emojiScale[tech.level]} ${tech.name.padEnd(27)} (+${tech.score.toString().padStart(3)}, ${evaluatedScore.toString().padStart(4)})`,
            `color: ${logColor}; font-weight: bold;`,
          );
          if (result.type === "place") {
            console.log(
              `Action: r${result.r + 1}c${result.c + 1}=${result.num}`,
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
            startingPencils[r][c].delete(num),
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
  if (waitForFrame && myEvaluationId !== currentEvaluationId) return;
  isSolved = virtualBoard.flat().every((v) => v !== 0);
  if (isSolved) {
    lastValidScore = evaluatedScore;
    if (IS_DEBUG_MODE) {
      console.log(`Level: ${maxDifficulty}, Score: ${evaluatedScore}`);
    }
    if (currentPuzzleScore > 0) {
      puzzleScoreEl.textContent = `~${currentPuzzleScore} (${evaluatedScore})`;
    } else if (isCustomPuzzle) {
      if (!isCustomDifficultyEvaluated) {
        if (dateSelect.value !== "unlimited") {
          puzzleLevelEl.textContent = `Custom Lv. ${maxDifficulty}`;
        }
        customScoreEvaluated = evaluatedScore;
        isCustomDifficultyEvaluated = true;
      }
      if (customScoreEvaluated > 0) {
        puzzleScoreEl.textContent = `~${customScoreEvaluated} (${evaluatedScore})`;
      } else {
        puzzleScoreEl.textContent = `(${evaluatedScore})`;
      }
    }
    if (previousLampColor === "black") {
      previousLampColor = null;
    }
    // Pass exact level to updateLamp
    if (maxDifficulty === 0) updateLamp("white", { level: 0 });
    else if (maxDifficulty <= 2) updateLamp("green", { level: maxDifficulty });
    else if (maxDifficulty <= 5) updateLamp("yellow", { level: maxDifficulty });
    else if (maxDifficulty <= 6) updateLamp("orange", { level: maxDifficulty });
    else if (maxDifficulty <= 8) updateLamp("red", { level: maxDifficulty });
    else if (maxDifficulty <= 10)
      updateLamp("violet", { level: maxDifficulty });
  } else {
    evaluatedScore = -1;
    if (currentPuzzleScore > 0) {
      puzzleScoreEl.textContent = `~${currentPuzzleScore}`;
    } else {
      puzzleScoreEl.textContent = "";
    }

    if (isCustomPuzzle && !isCustomDifficultyEvaluated) {
      if (dateSelect.value !== "unlimited") {
        puzzleLevelEl.textContent = `Custom Lv. 11`;
      }
      isCustomDifficultyEvaluated = true;
    }

    if (isCustomPuzzle && !isCustomDifficultyEvaluated) {
      puzzleLevelEl.textContent = `Lv. 11 (NULL)`;
      isCustomDifficultyEvaluated = true;
    }

    // === Final magenta detection ===
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
      updateLamp("magenta");
    }
  }
  if (IS_DEBUG_MODE) {
    const solveEndTime = performance.now();
    console.log(
      `Evaluation completed in ${(solveEndTime - solveStartTime).toFixed(2)} ms`,
    );
    console.log("-----------------------------------------------");
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

  // Group palettes to make the search logic scalable
  const palettes = [
    colorPalette300,
    colorPalette400,
    colorPalette500,
    colorPalette600,
    colorPalette700,
    colorPalette800,
  ];

  // Check each palette and return immediately if found
  for (const palette of palettes) {
    const idx = palette.indexOf(hex);
    if (idx !== -1) {
      return `[Color ${idx + 1}]`;
    }
  }

  return "Custom Color";
}

/**
 * Compares two board states and returns a detailed string description.
 */
function formatLineLabel(l) {
  if (!l) return "";
  const connector = l.style === "solid" ? "=" : "-";
  return `(${l.n1})r${l.r1 + 1}c${l.c1 + 1}${connector}(${l.n2})r${l.r2 + 1}c${l.c2 + 1}`;
}

function getLineDiffDescription(before, after) {
  if (!before) before = [];
  if (!after) after = [];

  // Helper to check if two lines are the "same" (coordinates & props)
  // We check both directions (A->B and B->A) just in case
  const isSameLine = (a, b) => {
    const forward =
      a.r1 === b.r1 &&
      a.c1 === b.c1 &&
      a.n1 === b.n1 &&
      a.r2 === b.r2 &&
      a.c2 === b.c2 &&
      a.n2 === b.n2;
    const backward =
      a.r1 === b.r2 &&
      a.c1 === b.c2 &&
      a.n1 === b.n2 &&
      a.r2 === b.r1 &&
      a.c2 === b.c1 &&
      a.n2 === b.n1;

    // For exact match, style and color must also match
    return (forward || backward) && a.color === b.color && a.style === b.style;
  };

  // Case 1: Line Added
  if (after.length > before.length) {
    // Find the line in 'after' that isn't in 'before'
    const added = after.find((a) => !before.some((b) => isSameLine(a, b)));
    if (added) return `Line added: ${formatLineLabel(added)}`;
    return "Line added";
  }

  // Case 2: Line Removed
  if (before.length > after.length) {
    // Find the line in 'before' that isn't in 'after'
    const removed = before.find((b) => !after.some((a) => isSameLine(a, b)));
    if (removed) return `Line removed: ${formatLineLabel(removed)}`;
    return "Line removed";
  }

  // Case 3: Line Modified (Style/Color change)
  // We look for a line that has the same coordinates but different style/color
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    const changed = after.find((a) => {
      // Find the "same coordinate" line in the 'before' array
      const match = before.find(
        (b) =>
          (a.r1 === b.r1 &&
            a.c1 === b.c1 &&
            a.n1 === b.n1 &&
            a.r2 === b.r2 &&
            a.c2 === b.c2 &&
            a.n2 === b.n2) ||
          (a.r1 === b.r2 &&
            a.c1 === b.c2 &&
            a.n1 === b.n2 &&
            a.r2 === b.r1 &&
            a.c2 === b.c1 &&
            a.n2 === b.n1),
      );
      // If found, check if properties changed
      return match && (match.color !== a.color || match.style !== a.style);
    });

    if (changed) return `Line updated: ${formatLineLabel(changed)}`;
    return "Line style updated";
  }

  return null;
}

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
