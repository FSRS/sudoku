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
  "INVADER",
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
  "Lv. 9: Triple Sub. Excl., ALS-XY/W-Wing",
  "Lv. 10: ALS-Chain, Death Blossom, Finned Franken/Mutant Swordfish",
];

const PALETTES = {
  // Optimized for Dark Backgrounds (Lighter, Pastels)
  dark: [
    "#f5f5f5", // 0: Whiteish
    "#d4f8d4", // 1: Pale Green
    "#69f0ae", // 2: Vibrant Green
    "#ccff90", // 3: Lime
    "#ffff00", // 4: Yellow
    "#ffc107", // 5: Amber
    "#ff9800", // 6: Orange
    "#ff5722", // 7: Deep Orange
    "#f44336", // 8: Red
    "#d500f9", // 9: Magenta
    "#651fff", // 10: Violet
  ],
  // Optimized for Light Backgrounds (Darker, Saturated)
  light: [
    "#424242", // 0: Dark Grey (instead of white)
    "#2e7d32", // 1: Forest Green
    "#00c853", // 2: Green
    "#9e9d24", // 3: Lime 800 (Brighter Olive)
    "#f9a825", // 4: Yellow 800 (Rich Dark Yellow)
    "#ff8f00", // 5: Amber 800  (Vibrant Golden)
    "#ef6c00", // 6: Orange 800 (Clearly Orange, not Red)
    "#d32f2f", // 7: Red 700    (Classic Bright Red)
    "#880e4f", // 8: Pink 900   (Deep Burgundy/Maroon)
    "#aa00ff", // 9: Purple
    "#6200ea", // 10: Deep Indigo
  ],
};

const emojiScale = [
  "🤩", // 0
  "😁",
  "😄",
  "😊",
  "🙂",
  "😐",
  "🤨",
  "😟",
  "😕",
  "🙁",
  "☹️", // 10
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

// Pre-calculate single bitmasks for every cell index (0-80) for fast access
const CELL_MASK = Array.from({ length: 81 }, (_, i) => 1n << BigInt(i));

// A fixed array of 81 BigInts, each representing the 20 peers of a cell
const PEER_MAP = (() => {
  const peers = Array(81).fill(0n);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const id = r * 9 + c;
      let mask = 0n;

      // Add row and column peers
      for (let i = 0; i < 9; i++) {
        if (i !== c) mask |= CELL_MASK[r * 9 + i];
        if (i !== r) mask |= CELL_MASK[i * 9 + c];
      }

      // Add box peers
      const boxStartR = Math.floor(r / 3) * 3;
      const boxStartC = Math.floor(c / 3) * 3;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const peerR = boxStartR + i;
          const peerC = boxStartC + j;
          if (peerR !== r || peerC !== c) {
            mask |= CELL_MASK[peerR * 9 + peerC];
          }
        }
      }
      peers[id] = mask;
    }
  }
  return peers;
})();

const BITS = {
  // Population Count
  popcount: (n) => {
    n = n - ((n >> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return (((n + (n >> 4)) & 0xf0f0f0f) * 0x1010101) >> 24;
  },
  // Set -> Bitmask
  setToMask: (candIter) => {
    let mask = 0;
    for (const n of candIter) mask |= 1 << (n - 1);
    return mask;
  },
  // Bitmask -> Array
  maskToDigits: (mask) => {
    const digits = [];
    for (let i = 0; i < 9; i++) {
      if (mask & (1 << i)) digits.push(i + 1);
    }
    return digits;
  },
};

// --- End of Constants ---
