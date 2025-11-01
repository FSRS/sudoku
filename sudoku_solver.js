// --- START: NEW DEBUG HELPER FUNCTION ---
function logBoardState(board, pencils) {
  let output = "\n";
  const topBorder =
    ".----------------------.---------------------.-------------------.\n";
  const midBorder =
    ":----------------------+---------------------+-------------------:\n";
  const botBorder =
    "'----------------------'---------------------'-------------------'\n";

  output += topBorder;

  for (let r = 0; r < 9; r++) {
    let rowStr = "|";
    for (let c = 0; c < 9; c++) {
      let cellContent = "";
      if (board[r][c] !== 0) {
        // It's a solved cell
        cellContent = `  ${board[r][c]}  `;
      } else {
        // It's an unsolved cell with candidates
        cellContent = [...pencils[r][c]].sort().join("");
      }
      // Pad the string to 5 characters and add a space
      rowStr += ` ${cellContent.padEnd(5, " ")}`;
      if (c === 2 || c === 5) {
        rowStr += "|";
      }
    }
    rowStr += " |\n";
    output += rowStr;

    if (r === 2 || r === 5) {
      output += midBorder;
    }
  }
  output += botBorder;
  console.log(output);
}
// --- END: NEW DEBUG HELPER FUNCTION ---

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
        .map(() => new Set())
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
 * Checks if a puzzle board has a unique solution and returns the result.
 * @param {number[][]} board - The initial puzzle board.
 * @returns {{isValid: boolean, message: string}} An object with the validation result.
 */
function checkPuzzleUniqueness(board) {
  // Pre-check 1: Clue count
  const clueCount = board.flat().filter((v) => v !== 0).length;
  if (clueCount < 17) {
    return {
      isValid: false,
      message: "Error: Puzzle has fewer than 17 clues; solution is not unique.",
    };
  }

  // Pre-check 2: Missing numbers
  const presentNumbers = new Set(board.flat().filter((v) => v !== 0));
  if (presentNumbers.size < 8) {
    return {
      isValid: false,
      message:
        "Error: More than one number is missing; solution is not unique.",
    };
  }
  // Pre-Check 3
  // Check for two empty rows in any horizontal band
  for (let bandStartRow = 0; bandStartRow < 9; bandStartRow += 3) {
    let emptyRowCount = 0;
    for (let r_offset = 0; r_offset < 3; r_offset++) {
      const r = bandStartRow + r_offset;
      if (board[r].every((cell) => cell === 0)) {
        emptyRowCount++;
      }
    }
    if (emptyRowCount >= 2) {
      return {
        isValid: false,
        message: "Error: Two empty rows in a band; solution is not unique.",
      };
    }
  }

  // Check for two empty columns in any vertical band
  for (let bandStartCol = 0; bandStartCol < 9; bandStartCol += 3) {
    let emptyColCount = 0;
    for (let c_offset = 0; c_offset < 3; c_offset++) {
      const c = bandStartCol + c_offset;
      let isColEmpty = true;
      for (let r = 0; r < 9; r++) {
        if (board[r][c] !== 0) {
          isColEmpty = false;
          break;
        }
      }
      if (isColEmpty) {
        emptyColCount++;
      }
    }
    if (emptyColCount >= 2) {
      return {
        isValid: false,
        message: "Error: Two empty columns in a band; solution is not unique.",
      };
    }
  }

  function isBoardValid(b) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (b[r][c] !== 0) {
          const num = b[r][c];
          b[r][c] = 0;
          const valid = isValid(b, r, c, num);
          b[r][c] = num;
          if (!valid) return false;
        }
      }
    }
    return true;
  }
  // Pre-check 3: Initial conflicts (on a copy to be safe)
  if (!isBoardValid(board.map((row) => [...row]))) {
    return {
      isValid: false,
      message: "Error: The initial puzzle state has conflicts.",
    };
  }

  const boardCopy = board.map((row) => [...row]);
  while (findAndPlaceOneHiddenSingle(boardCopy)) {
    // This loop simplifies the board before counting.
  }

  // Final Check: Count solutions (on a copy to be safe)
  const solutionCount = countSolutions(boardCopy);

  if (solutionCount === 0) {
    return {
      isValid: false,
      message: "Error: This puzzle has no solution.",
    };
  }
  if (solutionCount > 1) {
    return {
      isValid: false,
      message: "Error: This puzzle has more than one solution.",
    };
  }

  return { isValid: true, message: "Puzzle has a unique solution." };
}

/**
 * Counts the number of solutions for a given board up to a specified limit.
 * @param {number[][]} board - The Sudoku board to solve.
 * @param {number} limit - The maximum number of solutions to find before stopping.
 * @returns {number} The number of solutions found (up to the limit).
 */
function countSolutions(board, limit = 2) {
  let count = 0;

  function search() {
    // The hidden single loop has been removed from here.

    const find = findEmpty(board);
    if (!find) {
      count++;
      return count >= limit; // Stop if we've reached the limit
    }

    const [row, col] = find;
    for (let num = 1; num <= 9; num++) {
      if (isValid(board, row, col, num)) {
        board[row][col] = num;
        if (search()) {
          return true; // Propagate the stop signal
        }
      }
    }
    board[row][col] = 0; // Backtrack
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
