// --- START: ADDED DEBUG FLAG ---
// Set this to 'true' to see detailed solver logs in the console.
// Set this to 'false' for release to hide them.
let IS_DEBUG_MODE = false;
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

const colorPalette300 = [
  "#fca5a5", // red-300
  "#fdba74", // orange-300
  "#fde047", // yellow-300
  "#bef264", // lime-300
  "#6ee7b7", // emerald-300
  "#67e8f9", // cyan-300
  "#93c5fd", // blue-300
  "#c4b5fd", // violet-300
  "#f9a8d4", // pink-300
];

const colorPalette400 = [
  "#f87171", // red-400
  "#fb923c", // orange-400
  "#facc15", // yellow-400
  "#a3e635", // lime-400
  "#34d399", // emerald-400
  "#22d3ee", // cyan-400
  "#60a5fa", // blue-400
  "#c084fc", // violet-400
  "#f472b6", // pink-400
];

const colorPalette450 = [
  "#f45b5b", // red-450
  "#fa8329", // orange-450
  "#f2c00f", // yellow-450
  "#94d926", // lime-450
  "#2bcc7c", // green-450
  "#14c5e1", // cyan-450
  "#4e94f8", // blue-450
  "#a670f9", // violet-450
  "#f05da8", // pink-450
];

// const colorPalette500 = [
//   "#ef4444", // red-500
//   "#f97316", // orange-500
//   "#eab308", // yellow-500
//   "#84cc16", // lime-500
//   "#22c55e", // green-500
//   "#06b6d4", // cyan-500
//   "#3b82f6", // blue-500
//   "#8b5cf6", // violet-500
//   "#ec4899", // pink-500
// ];

const colorPalette600 = [
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

const colorPalette800 = [
  "#991b1b", // red-800
  "#9a3412", // orange-800
  "#854d0e", // yellow-800
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
  "Lv. 3: Quads, X-Wing, Swordfish, XY-Wing, Remote Pair",
  "Lv. 4: BUG+1, Jellyfish, XYZ-Wing, W-Wing, Turbot-Fishes, Unique Rectangles",
  "Lv. 5: BUG Lite, Grouped Turbot-Fishes, Almost Locked Pair/Triple, Hidden Rectangles",
  "Lv. 6: Finned Fishes, X-Chain, XY-Chain, Firework, WXYZ-Wing, Sue de Coq",
  "Lv. 7: Grouped X-Chain, Alternating Inference Chain",
  "Lv. 8: Grouped Alternating Inference Chain, ALS-XZ",
  "Lv. 9: ALS-AIC",
  "Lv. 10: Death Blossom, Finned Franken/Mutant Swordfish, Complex AIC",
];

const PALETTES = {
  // Optimized for Dark Backgrounds (Lighter, Pastels, High Luminosity)
  dark: [
    "#e0e0e0", // 0: Off-white/Silver (Slightly dimmed to allow colors to pop)
    "#a7ffeb", // 1: Teal/Mint (Higher saturation than Pale Green, clearly distinct)
    "#69f0ae", // 2: Vibrant Green
    "#beff5e", // 3: Electric Lime
    "#ffff8d", // 4: Pale Yellow
    "#ffd54f", // 5: Light Amber
    "#ffb74d", // 6: Soft Orange
    "#ff8a65", // 7: Peach
    "#e57373", // 8: Soft Red
    "#ea80fc", // 9: Bright Lavender
    "#b388ff", // 10: Periwinkle
  ],
  // Optimized for Light Backgrounds (Darker, Saturated, High Contrast)
  light: [
    "#616161", // 0: Medium-Dark Grey (Lightened to distinguish from deep colors)
    "#2e7d32", // 1: Forest Green
    "#008c3a", // 2: Deep Emerald
    "#afb42b", // 3: Citrine/Mustard Lime (More yellow-pigment to pop against grey)
    "#f57f17", // 4: Yellow 900 (Darkened to a deep, brownish-gold)
    "#ff6f00", // 5: Amber 900 (Deepened for better contrast)
    "#e65100", // 6: Orange 900 (Darkened to ensure it stands out clearly)
    "#d32f2f", // 7: Red 700 (Unchanged - Great contrast)
    "#880e4f", // 8: Pink 900 (Unchanged - Great contrast)
    "#aa00ff", // 9: Purple (Unchanged)
    "#6200ea", // 10: Deep Indigo (Unchanged)
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
// Array of 9 items (for digits 1-9).
// Each item is an array of 3 ints [part0, part1, part2] representing the 81 cells.
let currentCandidateBitsets = Array.from({ length: 9 }, () => [0, 0, 0]);
let virtualCandidateBitsets = Array.from({ length: 9 }, () => [0, 0, 0]);
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
let copyTipTimer = null;
let currentLampColor = "gray";
let isExperimentalMode = false;

// --- Pre-calculated Sudoku Constants ---

// Array of 27 units: 0-8 (Rows), 9-17 (Cols), 18-26 (Boxes).
// Each is represented by an array of 3 numbers holding 27 bits each.
const UNIT_BITSETS = (() => {
  const units = [];

  // Helper to set a bit for a specific cell ID (0-80)
  const addCellToParts = (parts, r, c) => {
    const id = r * 9 + c;
    const partIndex = Math.floor(id / 27);
    const bitPos = id % 27;
    parts[partIndex] |= 1 << bitPos;
  };

  // 0-8: Rows
  for (let r = 0; r < 9; r++) {
    const parts = [0, 0, 0];
    for (let c = 0; c < 9; c++) addCellToParts(parts, r, c);
    units.push(parts);
  }

  // 9-17: Columns
  for (let c = 0; c < 9; c++) {
    const parts = [0, 0, 0];
    for (let r = 0; r < 9; r++) addCellToParts(parts, r, c);
    units.push(parts);
  }

  // 18-26: Boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const parts = [0, 0, 0];
      for (let r_offset = 0; r_offset < 3; r_offset++) {
        for (let c_offset = 0; c_offset < 3; c_offset++) {
          addCellToParts(parts, br * 3 + r_offset, bc * 3 + c_offset);
        }
      }
      units.push(parts);
    }
  }
  return units;
})();

// Array of 81 bitsets, one for each cell (0-80).
// Each represents the 20 mutual peers of that cell using the [part0, part1, part2] format.
const PEER_BITSETS = (() => {
  const peers = [];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const parts = [0, 0, 0];

      // Helper to set peer bit
      const addPeer = (peerR, peerC) => {
        const id = peerR * 9 + peerC;
        parts[Math.floor(id / 27)] |= 1 << (id % 27);
      };

      // Add row and column peers
      for (let i = 0; i < 9; i++) {
        if (i !== c) addPeer(r, i);
        if (i !== r) addPeer(i, c);
      }

      // Add box peers
      const boxStartR = Math.floor(r / 3) * 3;
      const boxStartC = Math.floor(c / 3) * 3;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const peerR = boxStartR + i;
          const peerC = boxStartC + j;
          // Avoid adding self or re-adding row/col peers unnecessarily
          // (though bitwise OR is idempotent so overlap is fine, we just exclude self)
          if (peerR !== r || peerC !== c) {
            addPeer(peerR, peerC);
          }
        }
      }
      peers.push(parts);
    }
  }
  return peers;
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
