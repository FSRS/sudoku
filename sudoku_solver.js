function logBoardState(board, pencils) {
  // 1. Generate all cell strings and find max width per column
  const cellStrings = Array(9)
    .fill(null)
    .map(() => Array(9).fill(""));
  const colWidths = Array(9).fill(0);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      let s = "";
      if (board[r][c] !== 0) {
        s = board[r][c].toString();
      } else {
        s = [...pencils[r][c]].sort().join("");
      }
      cellStrings[r][c] = s;
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

  let output = "\n";
  output += makeLine(".", ".", ".", ".", "-");

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
      output += makeLine(":", "+", "+", ":", "-");
    }
  }
  output += makeLine("'", "'", "'", "'", "-");

  console.log(output);
}

function isValidDate(yyyymmdd) {
  if (!/^\d{8}$/.test(yyyymmdd)) return false;

  const year = parseInt(yyyymmdd.slice(0, 4), 10);
  const month = parseInt(yyyymmdd.slice(4, 6), 10);
  const day = parseInt(yyyymmdd.slice(6, 8), 10);

  // Month 1–12, Day 1–31
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Construct real JS Date
  const d = new Date(year, month - 1, day);
  return (
    d.getFullYear() === year &&
    d.getMonth() === month - 1 &&
    d.getDate() === day
  );
}

function autoEliminatePencils(row, col, num) {
  // Eliminate from the same row
  for (let c = 0; c < 9; c++) {
    boardState[row][c].pencils.delete(num);
  }

  // Eliminate from the same column
  for (let r = 0; r < 9; r++) {
    boardState[r][col].pencils.delete(num);
  }

  // Eliminate from the same 3x3 box
  const boxRowStart = Math.floor(row / 3) * 3;
  const boxColStart = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      boardState[boxRowStart + r][boxColStart + c].pencils.delete(num);
    }
  }
}

function calculateAllPencils(board) {
  const newPencils = Array(9)
    .fill(null)
    .map(() =>
      Array(9)
        .fill(null)
        .map(() => new Set()),
    );
  const boardValues = board.map((row) => row.map((cell) => cell.value));
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (boardValues[r][c] === 0) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(boardValues, r, c, num)) {
            newPencils[r][c].add(num);
          }
        }
      }
    }
  }
  return newPencils;
}

/**
 * Checks uniqueness first, then recognizes Only one cell Sudoku if needed.
 * @param {number[][]} board - The initial puzzle board.
 * @returns {object} Validation, puzzle mode, and a complete solution witness.
 */
function checkPuzzleUniqueness(board) {
  const reduced = board.map((row) => [...row]);
  // Reject contradictory clues before either kind of solution proof.
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const value = reduced[r][c];
      if (!Number.isInteger(value) || value < 0 || value > 9) {
        return { isValid: false, message: t("error_no_solution") };
      }
      if (!value) continue;
      reduced[r][c] = 0;
      const valid = isValid(reduced, r, c, value);
      reduced[r][c] = value;
      if (!valid) return { isValid: false, message: t("error_initial_conflict") };
    }
  }

  // Keep the original uniqueness prechecks. If uniqueness is impossible,
  // avoid a costly sparse-grid count and let the variant proof check existence.
  const solutions = [];
  if (canHaveUniqueSolution(board)) {
    while (findAndPlaceOneHiddenSingle(reduced)) {
      // Preserve the classic check's cheap propagation before the search.
    }
    // Two witnesses are sufficient to disprove uniqueness; reuse both later.
    const solutionCount = countSolutions(reduced, 2, solutions);
    if (solutionCount === 0) {
      return { isValid: false, message: t("error_no_solution") };
    }
    if (solutionCount === 1) {
      return {
        isValid: true,
        mode: "standard",
        solution: solutions[0],
        message: t("puzzle_unique_solution"),
      };
    }
  }
  const analysis = analyzeOnlyOneCell(board, solutions);
  if (!analysis.solution) {
    return { isValid: false, message: t("error_no_solution") };
  }
  if (analysis.target) {
    return {
      isValid: true,
      mode: "only-one-cell",
      target: analysis.target,
      solution: analysis.solution,
      isProgressValid: createOnlyOneCellProgressValidator(board, analysis),
      message: t("puzzle_only_one_cell"),
    };
  }
  return {
    isValid: false,
    message: t("error_multiple_solutions", "2+"),
  };
}

function canHaveUniqueSolution(board) {
  const clues = board.flat().filter((value) => value !== 0);
  if (clues.length < 17 || new Set(clues).size < 8) return false;
  for (let band = 0; band < 9; band += 3) {
    let emptyRows = 0, emptyCols = 0;
    for (let offset = 0; offset < 3; offset++) {
      const index = band + offset;
      if (board[index].every((value) => value === 0)) emptyRows++;
      if (board.every((row) => row[index] === 0)) emptyCols++;
    }
    if (emptyRows >= 2 || emptyCols >= 2) return false;
  }
  return true;
}

const CANDIDATE_POPCOUNT = new Uint8Array(512);
for (let mask = 1; mask < 512; mask++) {
  CANDIDATE_POPCOUNT[mask] = CANDIDATE_POPCOUNT[mask >> 1] + (mask & 1);
}

const BOX_OF_CELL = new Uint8Array(81);
for (let i = 0; i < 81; i++) {
  BOX_OF_CELL[i] = ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0);
}

// Find one complete witness, optionally excluding one digit or respecting
// pencil restrictions. MRV includes house/digit constraints, so a missing
// digit with no home is rejected even in very sparse grids.
function findSudokuSolution(
  board,
  { forbiddenCell = -1, forbiddenDigit = 0, pencils = null } = {},
) {
  const values = board.flat();
  const rows = new Uint16Array(9);
  const cols = new Uint16Array(9);
  const boxes = new Uint16Array(9);
  const allowed = new Uint16Array(81).fill(511);
  for (let i = 0; i < 81; i++) {
    const r = (i / 9) | 0;
    const c = i % 9;
    const b = BOX_OF_CELL[i];
    const value = values[i];
    if (!Number.isInteger(value) || value < 0 || value > 9) return null;
    if (value) {
      const bit = 1 << (value - 1);
      if ((rows[r] | cols[c] | boxes[b]) & bit) return null;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
    } else if (pencils) {
      allowed[i] = 0;
      for (const digit of pencils[r][c]) allowed[i] |= 1 << (digit - 1);
    }
  }
  if (forbiddenCell >= 0) {
    if (values[forbiddenCell] === forbiddenDigit) return null;
    allowed[forbiddenCell] &= ~(1 << (forbiddenDigit - 1));
  }

  function search() {
    let bestCount = 10;
    let moves = null;
    const candidates = new Uint16Array(81);
    for (let i = 0; i < 81; i++) {
      if (values[i]) continue;
      const mask = allowed[i] &
        ~(rows[(i / 9) | 0] | cols[i % 9] | boxes[BOX_OF_CELL[i]]);
      candidates[i] = mask;
      const count = CANDIDATE_POPCOUNT[mask];
      if (!count) return false;
      if (count < bestCount) {
        bestCount = count;
        moves = [];
        for (let rest = mask; rest; rest &= rest - 1) {
          moves.push([i, rest & -rest]);
        }
      }
    }
    if (moves === null) return true;
    if (bestCount > 1) {
      for (let house = 0; house < 27; house++) {
        const h = house % 9;
        const used = house < 9 ? rows[h] : house < 18 ? cols[h] : boxes[h];
        for (let rest = 511 & ~used; rest; rest &= rest - 1) {
          const bit = rest & -rest;
          const positions = [];
          for (let k = 0; k < 9; k++) {
            const i = house < 9 ? h * 9 + k
              : house < 18 ? k * 9 + h
                : ((h / 3) | 0) * 27 + (h % 3) * 3 + ((k / 3) | 0) * 9 + k % 3;
            if (candidates[i] & bit) positions.push([i, bit]);
          }
          if (!positions.length) return false;
          if (positions.length < bestCount) {
            bestCount = positions.length;
            moves = positions;
          }
        }
      }
    }
    for (const [i, bit] of moves) {
      const r = (i / 9) | 0;
      const c = i % 9;
      const b = BOX_OF_CELL[i];
      values[i] = 32 - Math.clz32(bit);
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (search()) return true;
      values[i] = 0;
      rows[r] ^= bit;
      cols[c] ^= bit;
      boxes[b] ^= bit;
    }
    return false;
  }
  return search()
    ? Array.from({ length: 9 }, (_, r) => values.slice(r * 9, r * 9 + 9))
    : null;
}

function analyzeOnlyOneCell(board, witnesses = []) {
  const solution = witnesses[0] || findSudokuSolution(board);
  if (!solution) return { solution: null, target: null };
  const blanks = [];
  for (let i = 0; i < 81; i++) {
    if (board[(i / 9) | 0][i % 9] === 0) blanks.push(i);
  }
  // A unique grid with one blank is ordinary Sudoku.
  if (blanks.length < 2) return { solution, target: null };
  const variable = new Set();
  for (const witness of witnesses.slice(1)) {
    for (const i of blanks) {
      const r = (i / 9) | 0, c = i % 9;
      if (witness[r][c] !== solution[r][c]) variable.add(i);
    }
  }
  let target = null;
  for (const i of blanks) {
    if (variable.has(i)) continue;
    const r = (i / 9) | 0;
    const c = i % 9;
    const alternative = findSudokuSolution(board, {
      forbiddenCell: i,
      forbiddenDigit: solution[r][c],
    });
    if (!alternative) {
      // Two forced non-clue cells already disprove this variant.
      if (target) return { solution, target: null };
      target = { r, c, num: solution[r][c] };
    } else {
      // This pair of complete solutions proves variability for every cell
      // where they differ. Never infer a forced cell from a sample alone.
      for (const j of blanks) {
        const jr = (j / 9) | 0;
        const jc = j % 9;
        if (alternative[jr][jc] !== solution[jr][jc]) variable.add(j);
      }
    }
  }
  return { solution, target };
}

// Progress must preserve EVERY completion of the original clues. Cache proofs
// per puzzle, checking only removed candidates whose feasibility is unknown.
// A witness also proves the feasibility of its digits in all other cells.
function createOnlyOneCellProgressValidator(board, { solution, target }) {
  const givens = board.map((row) => [...row]);
  const possible = new Uint16Array(81);
  const impossible = new Uint16Array(81);
  for (let i = 0; i < 81; i++) {
    const r = (i / 9) | 0, c = i % 9;
    possible[i] = 1 << (solution[r][c] - 1);
    if (givens[r][c]) continue;
    for (let digit = 1; digit <= 9; digit++) {
      if (!isValid(givens, r, c, digit)) impossible[i] |= 1 << (digit - 1);
    }
    if (r === target.r && c === target.c) impossible[i] = 511 & ~possible[i];
  }

  return function isProgressValid(values, pencils = null) {
    // Only the proved target is a justified placement. Even a feasible value
    // elsewhere excludes original solutions, and must not become a new clue.
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const value = values[r][c];
        if (givens[r][c]) {
          if (value !== givens[r][c]) return false;
        } else if (value && (r !== target.r || c !== target.c || value !== target.num)) {
          return false;
        }
      }
    }
    if (!pencils) return true;

    for (let i = 0; i < 81; i++) {
      const r = (i / 9) | 0, c = i % 9;
      if (values[r][c]) continue;
      let retained = 0;
      for (const digit of pencils[r][c]) retained |= 1 << (digit - 1);
      let removed = 511 & ~retained & ~impossible[i];
      if (removed & possible[i]) return false;
      for (; removed; removed &= removed - 1) {
        const bit = removed & -removed;
        const probe = givens.map((row) => [...row]);
        probe[r][c] = 32 - Math.clz32(bit);
        const witness = findSudokuSolution(probe);
        if (witness) {
          for (let j = 0; j < 81; j++) {
            possible[j] |= 1 << (witness[(j / 9) | 0][j % 9] - 1);
          }
          return false;
        }
        impossible[i] |= bit;
      }
    }
    return true;
  };
}

/**
 * Counts the number of solutions for a given board up to a specified limit.
 * The board is left exactly as it was passed in: the search reads it once and
 * from there works on masks of its own, so it never writes to it at all.
 * @param {number[][]} board - The Sudoku board to solve.
 * @param {number} limit - The maximum number of solutions to find before stopping.
 * @param {number[][][] | null} solutions - Optional output array for witnesses.
 * @returns {number} The number of solutions found (up to the limit).
 */
function countSolutions(board, limit = 10000, solutions = null) {
  const rowMask = new Int16Array(9);
  const colMask = new Int16Array(9);
  const boxMask = new Int16Array(9);
  const filled = new Uint8Array(81);
  const empties = [];
  const values = solutions ? board.flat() : null;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const i = r * 9 + c;
      const value = board[r][c];
      if (!Number.isInteger(value) || value < 0 || value > 9) return 0;
      if (value === 0) {
        empties.push(i);
        continue;
      }
      filled[i] = 1;
      const bit = 1 << (value - 1);
      if ((rowMask[r] | colMask[c] | boxMask[BOX_OF_CELL[i]]) & bit) return 0;
      rowMask[r] |= bit;
      colMask[c] |= bit;
      boxMask[BOX_OF_CELL[i]] |= bit;
    }
  }

  const emptyCount = empties.length;
  let count = 0;

  function search() {
    let bestCell = -1;
    let bestCandidates = 0;
    let bestRemaining = 10;

    for (let k = 0; k < emptyCount; k++) {
      const i = empties[k];
      if (filled[i] !== 0) continue;
      const candidates =
        0x1ff &
        ~(rowMask[(i / 9) | 0] | colMask[i % 9] | boxMask[BOX_OF_CELL[i]]);
      const remaining = CANDIDATE_POPCOUNT[candidates];
      if (remaining < bestRemaining) {
        bestRemaining = remaining;
        bestCell = i;
        bestCandidates = candidates;
        if (remaining <= 1) break;
      }
    }

    if (bestCell === -1) {
      count++;
      if (solutions) {
        solutions.push(Array.from({ length: 9 }, (_, r) => values.slice(r * 9, r * 9 + 9)));
      }
      return count >= limit; // Stop if we've reached the limit
    }

    const row = (bestCell / 9) | 0;
    const col = bestCell % 9;
    const box = BOX_OF_CELL[bestCell];
    filled[bestCell] = 1;

    for (let rest = bestCandidates; rest !== 0; rest &= rest - 1) {
      const bit = rest & -rest;
      if (values) values[bestCell] = 32 - Math.clz32(bit);
      rowMask[row] |= bit;
      colMask[col] |= bit;
      boxMask[box] |= bit;
      const stop = search();
      rowMask[row] ^= bit;
      colMask[col] ^= bit;
      boxMask[box] ^= bit;
      if (values) values[bestCell] = 0;
      if (stop) {
        filled[bestCell] = 0;
        return true;
      }
    }

    filled[bestCell] = 0;
    return false;
  }

  search();
  return count;
}

function findEmpty(board) {
  let bestCell = null;
  let minRemainingValues = 10; // Start with a value higher than the max possible (9)

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) {
        // This cell is empty, so count its legal moves
        let remainingValues = 0;
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, r, c, num)) {
            remainingValues++;
          }
        }

        // If this cell is more constrained than the best one we've found so far
        if (remainingValues < minRemainingValues) {
          minRemainingValues = remainingValues;
          bestCell = [r, c];
        }

        // Optimization: If a cell has only 0 or 1 possible value, it's the best we can do.
        if (minRemainingValues <= 1) {
          return bestCell;
        }
      }
    }
  }
  return bestCell; // This will be null if the board is full
}

/**
 * Finds and places the first available "Hidden Single" on the board.
 * This version is more robust and scans houses systematically.
 * @param {number[][]} board - The Sudoku board.
 * @returns {boolean} - True if a hidden single was found and placed, otherwise false.
 */
function findAndPlaceOneHiddenSingle(board) {
  // --- Scan by ROW ---
  for (let r = 0; r < 9; r++) {
    for (let num = 1; num <= 9; num++) {
      // First, check if the number already exists in this row
      let numExists = false;
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === num) {
          numExists = true;
          break;
        }
      }
      if (numExists) continue; // If it exists, move to the next number

      // If it doesn't exist, find where it could go
      let possibleCells = [];
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0 && isValid(board, r, c, num)) {
          possibleCells.push(c);
        }
      }
      if (possibleCells.length === 1) {
        board[r][possibleCells[0]] = num;
        return true; // Found one, restart the whole process
      }
    }
  }

  // --- Scan by COLUMN ---
  for (let c = 0; c < 9; c++) {
    for (let num = 1; num <= 9; num++) {
      let numExists = false;
      for (let r = 0; r < 9; r++) {
        if (board[r][c] === num) {
          numExists = true;
          break;
        }
      }
      if (numExists) continue;

      let possibleCells = [];
      for (let r = 0; r < 9; r++) {
        if (board[r][c] === 0 && isValid(board, r, c, num)) {
          possibleCells.push(r);
        }
      }
      if (possibleCells.length === 1) {
        board[possibleCells[0]][c] = num;
        return true;
      }
    }
  }

  // --- Scan by BOX ---
  for (let boxStartRow = 0; boxStartRow < 9; boxStartRow += 3) {
    for (let boxStartCol = 0; boxStartCol < 9; boxStartCol += 3) {
      for (let num = 1; num <= 9; num++) {
        let numExists = false;
        for (let r_off = 0; r_off < 3; r_off++) {
          for (let c_off = 0; c_off < 3; c_off++) {
            if (board[boxStartRow + r_off][boxStartCol + c_off] === num) {
              numExists = true;
              break;
            }
          }
          if (numExists) break;
        }
        if (numExists) continue;

        let possibleCells = [];
        for (let r_offset = 0; r_offset < 3; r_offset++) {
          for (let c_offset = 0; c_offset < 3; c_offset++) {
            let r = boxStartRow + r_offset;
            let c = boxStartCol + c_offset;
            if (board[r][c] === 0 && isValid(board, r, c, num)) {
              possibleCells.push({ r, c });
            }
          }
        }
        if (possibleCells.length === 1) {
          const { r, c } = possibleCells[0];
          board[r][c] = num;
          return true;
        }
      }
    }
  }

  return false; // No hidden singles found in a full pass
}

function isValid(board, row, col, num) {
  for (let c = 0; c < 9; c++) {
    if (board[row][c] === num) return false;
  }
  for (let r = 0; r < 9; r++) {
    if (board[r][col] === num) return false;
  }
  const boxRowStart = Math.floor(row / 3) * 3;
  const boxColStart = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (board[boxRowStart + r][boxColStart + c] === num) return false;
    }
  }
  return true;
}

function solveSudoku(board) {
  // 1. Pre-processing: Simplify the board with logical deductions first.
  // This runs only once at the beginning of the solve process.
  while (findAndPlaceOneHiddenSingle(board)) {
    // This loop will fill in all the "obvious" cells without any guessing.
  }

  // 2. Start the recursive backtracking process on the simplified board.
  return solveSudokuRecursive(board);
}

function solveSudokuRecursive(board) {
  // This is your original, working backtracking function.
  // It contains NO logic-based simplification loops.
  const find = findEmpty(board);
  if (!find) return true; // Solved
  const [row, col] = find;

  for (let num = 1; num <= 9; num++) {
    if (isValid(board, row, col, num)) {
      board[row][col] = num; // Guess

      if (solveSudokuRecursive(board)) {
        return true; // Solution found
      }

      board[row][col] = 0; // Backtrack
    }
  }

  return false; // No solution found from this path
}
