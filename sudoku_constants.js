// --- START: ADDED DEBUG FLAG ---
// Set this to 'true' to see detailed solver logs in the console.
// Set this to 'false' for release to hide them.
let IS_DEBUG_MODE = false;
let LOG_CANDIDATE_GRID = false;
// --- END: ADDED DEBUG FLAG ---

const difficultyWords = [
  "ROOKIE",
  "LAYMAN",
  "AMATEUR",
  "TECHNICIAN",
  "WIZARD",
  "EXPERT",
  "MASTER",
  "NEMESIS",
  "DOMINATOR",
  "VANQUISHER",
];

const colorPaletteLight = [
  "#f87171",
  "#fb923c",
  "#facc15",
  "#a3e635",
  "#34d399",
  "#22d3ee",
  "#60a5fa",
  "#c084fc",
  "#f472b6",
];

const colorPaletteMid = [
  "#dc2626", // red-600
  "#ea580c", // orange-600
  "#ca8a04", // yellow-600
  "#65a30d", // lime-600
  "#16a34a", // green-600
  "#0891b2", // cyan-600
  "#2563eb", // blue-600
  "#7c3aed", // violet-600
  "#db2777", // pink-600
];

// darker palette for dark-mode (deeper/jewel tones)
const colorPaletteDark = [
  "#991b1b", // red-800
  "#9a3412", // orange-800
  "#92400e", // amber-800
  "#3f6212", // lime-800
  "#065f46", // emerald-800
  "#155e75", // cyan-800
  "#1e3a8a", // blue-900
  "#5b21b6", // violet-800
  "#9d174d", // pink-800
];

const levelTips = [
  "Lv. 0: Singles",
  "Lv. 1: Locked Pair, Locked Triple",
  "Lv. 2: Intersections, Pairs, Triples",
  "Lv. 3: Quads, X-Wing, XY-Wing, Remote Pair",
  "Lv. 4: Unique Rectangles, BUG+1, XYZ-Wing, W-Wing, Swordfish, Jellyfish",
  "Lv. 5: Hidden Rectangles, BUG Lite (6 cells), (Grouped) Turbot-Fishes",
  "Lv. 6: Finned Fishes, X-Chain, XY-Chain, Firework, WXYZ-Wing, Sue de Coq",
  "Lv. 7: Grouped X-Chain, 3D Medusa, Alternating Inference Chain",
  "Lv. 8: Grouped AIC, Pair Subset Exclusion, ALS-XZ",
  "Lv. 9: Triple Sub. Excl., ALS-XY/W-Wing, Finned Franken/Mutant Swordfish",
];

// live palette variables used by updateControls()
let cellColorPalette;
let candidateColorPalette;

let boardState = [];
let allPuzzles = [];
let selectedCell = { row: null, col: null };
let currentMode = "concrete";
let coloringSubMode = "cell";
let candidatePopupFormat = "A"; // 'A' for numpad, 'B' for phone pad
let selectedColor = null;
let highlightedDigit = null;
let highlightState = 0; // 0: off, 1: digit, 2: bi-value
let history = [];
let historyIndex = -1;
let timerInterval = null;
let startTime = 0;
let initialPuzzleString = "";
let solutionBoard = null;
let isCustomPuzzle = false;
let hasUsedAutoPencil = false;
let isAutoPencilPending = false;
let isSolvePending = false;
let autoPencilTipTimer = null;
let lampEvaluationTimeout = null;
let currentLampColor = "gray";
let isExperimentalMode = false;

// --- Pre-calculated Sudoku Constants ---

// An array of all 27 units (9 rows, 9 cols, 9 boxes)
const ALL_UNITS = (() => {
  const units = [];
  // Rows
  for (let i = 0; i < 9; i++) {
    const unit = [];
    for (let j = 0; j < 9; j++) unit.push([i, j]);
    units.push(unit);
  }
  // Columns
  for (let i = 0; i < 9; i++) {
    const unit = [];
    for (let j = 0; j < 9; j++) unit.push([j, i]);
    units.push(unit);
  }
  // Boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const unit = [];
      for (let r_offset = 0; r_offset < 3; r_offset++) {
        for (let c_offset = 0; c_offset < 3; c_offset++) {
          unit.push([br * 3 + r_offset, bc * 3 + c_offset]);
        }
      }
      units.push(unit);
    }
  }
  return units;
})();

// A map from each cell's ID (0-80) to its set of 20 peers.
const PEER_MAP = (() => {
  const peers = Array(81)
    .fill(0)
    .map(() => new Set());
  const getBoxIndex = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const id = r * 9 + c;
      // Add row and column peers
      for (let i = 0; i < 9; i++) {
        if (i !== c) peers[id].add(r * 9 + i);
        if (i !== r) peers[id].add(i * 9 + c);
      }
      // Add box peers
      const boxStartR = Math.floor(r / 3) * 3;
      const boxStartC = Math.floor(c / 3) * 3;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const peerR = boxStartR + i;
          const peerC = boxStartC + j;
          if (peerR !== r || peerC !== c) {
            peers[id].add(peerR * 9 + peerC);
          }
        }
      }
    }
  }
  return peers;
})();

// Build CELL_MASK, PEER_MASK, UNIT_MASKS globally
const CELL_MASK = Array.from({ length: 81 }, (_, i) => 1n << BigInt(i));
const PEER_MASK = Array(81).fill(0n);
for (let r = 0; r < 9; r++) {
  for (let c = 0; c < 9; c++) {
    let mask = 0n;
    for (let cc = 0; cc < 9; cc++) if (cc !== c) mask |= CELL_MASK[r * 9 + cc];
    for (let rr = 0; rr < 9; rr++) if (rr !== r) mask |= CELL_MASK[rr * 9 + c];
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const rr = br + i,
          cc = bc + j;
        if (rr === r && cc === c) continue;
        mask |= CELL_MASK[rr * 9 + cc];
      }
    PEER_MASK[r * 9 + c] = mask;
  }
}

// --- End of Constants ---
