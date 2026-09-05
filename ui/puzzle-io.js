(function (root) {
  "use strict";

  const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  function puzzleStringToGrid(puzzle) {
    const board = Array.from({ length: 9 }, () => Array(9).fill(0));
    for (let index = 0; index < 81; index++) {
      const char = puzzle[index];
      if (char >= "1" && char <= "9") {
        board[Math.floor(index / 9)][index % 9] = parseInt(char, 10);
      }
    }
    return board;
  }

  function formatPuzzleStringForInput(raw) {
    const bands = raw.match(/.{1,27}/g);
    if (!bands) return "";
    return bands
      .map((band) =>
        band
          .match(/.{1,9}/g)
          .map((row) => row.match(/.{1,3}/g).join(" "))
          .join("\n"),
      )
      .join("\n\n");
  }

  function decompressPuzzleString(value) {
    if (!value) return "";
    return value.replace(/[a-z]/g, (char) =>
      ".".repeat(char.charCodeAt(0) - 96),
    );
  }

  function parseLibraryBoardField(field) {
    const values = Array(81).fill(0);
    const givens = Array(81).fill(false);
    let index = 0;
    let userPlaced = false;

    for (const char of field) {
      if (char === "+") {
        userPlaced = true;
        continue;
      }
      if (/\s/.test(char)) continue;
      if (index >= 81) return null;
      if (char >= "1" && char <= "9") {
        values[index] = parseInt(char, 10);
        givens[index] = !userPlaced;
      } else if (char !== "." && char !== "0") {
        return null;
      }
      userPlaced = false;
      index++;
    }

    return index === 81 ? { values, givens } : null;
  }

  function parseLibrarySukakuField(field) {
    const compact = field.replace(/[^0-9.]/g, "");
    if (compact.length !== 729) return null;
    return Array.from({ length: 81 }, (unused, index) => {
      const universe = new Set();
      for (let slot = 0; slot < 9; slot++) {
        const digit = parseInt(compact[index * 9 + slot], 10);
        if (digit >= 1 && digit <= 9) universe.add(digit);
      }
      return universe;
    });
  }

  function parseLibraryPuzzleString(text, isValidCandidate) {
    const fields = String(text || "").trim().split(":");
    if (fields.length < 3) return null;

    let boardIndex = 0;
    let board = null;
    while (boardIndex < fields.length && !board) {
      board = parseLibraryBoardField(fields[boardIndex]);
      if (!board) boardIndex++;
    }
    if (!board) return null;

    const universe =
      boardIndex > 0 ? parseLibrarySukakuField(fields[boardIndex - 1]) : null;
    const placedGrid = puzzleStringToGrid(
      board.values.map((value) => (value === 0 ? "." : String(value))).join(""),
    );
    const pencils = Array.from({ length: 81 }, () => new Set());

    for (let index = 0; index < 81; index++) {
      if (board.values[index] !== 0) continue;
      const row = Math.floor(index / 9);
      const col = index % 9;
      for (let num = 1; num <= 9; num++) {
        if (universe && !universe[index].has(num)) continue;
        if (isValidCandidate(placedGrid, row, col, num)) pencils[index].add(num);
      }
    }

    const eliminations = (fields[boardIndex + 1] || "").match(/\d+/g) || [];
    for (const token of eliminations) {
      if (token.length !== 3) continue;
      const [num, row, col] = [...token].map(Number);
      if (num < 1 || row < 1 || row > 9 || col < 1 || col > 9) continue;
      pencils[(row - 1) * 9 + (col - 1)].delete(num);
    }

    return {
      values: board.values,
      givens: board.values
        .map((value, index) => (board.givens[index] ? String(value) : "."))
        .join(""),
      pencils,
    };
  }

  function parsePuzzleInput(text, isValidCandidate) {
    const source = String(text || "").replace(/0/g, ".");
    const libraryState = parseLibraryPuzzleString(source, isValidCandidate);
    if (libraryState) return { kind: "library", source, libraryState };

    const isMultiLine = source.includes("|") && source.includes("\n");
    if (isMultiLine) {
      const cells = source
        .trim()
        .split("\n")
        .filter((line) => line.trim().startsWith("|"))
        .flatMap((line) => line.match(/\d+/g) || []);
      if (cells.length === 81) return { kind: "grid", source, cells };
    }

    const cleanString = source.replace(/\s/g, "");
    if (cleanString.length !== 81 || !/^[0-9.]+$/.test(cleanString)) return null;
    return { kind: "compact", source, cleanString };
  }

  function encodeBoardState(boardState) {
    let value = "";
    for (const row of boardState) {
      for (const cell of row) {
        if (cell.isGiven) value += cell.value;
        else if (cell.value !== 0) value += String.fromCharCode(64 + cell.value);
        else if (cell.pencils.size > 0) {
          let mask = 0;
          for (const pencil of cell.pencils) mask |= 1 << (pencil - 1);
          value +=
            String.fromCharCode(74 + Math.floor(mask / 62)) + BASE62[mask % 62];
        } else value += ".";
      }
    }
    return value.replace(/\.+/g, (match) => {
      let remaining = match.length;
      let compressed = "";
      while (remaining > 26) {
        compressed += "z";
        remaining -= 26;
      }
      return compressed + (remaining ? String.fromCharCode(96 + remaining) : "");
    });
  }

  function decodeBoardState(state) {
    const initial = [];
    const userCells = [];
    let index = 0;
    let cellIndex = 0;

    while (index < state.length && cellIndex < 81) {
      const char = state[index];
      if (char >= "J" && char <= "R") {
        const second = BASE62.indexOf(state[index + 1]);
        if (second < 0) return null;
        const mask = (char.charCodeAt(0) - 74) * 62 + second;
        const values = [];
        for (let bit = 0; bit < 9; bit++) {
          if (mask & (1 << bit)) values.push(bit + 1);
        }
        initial.push(".");
        userCells.push({ index: cellIndex, type: "candidates", values });
        index += 2;
        cellIndex++;
      } else if (char >= "1" && char <= "9") {
        initial.push(char);
        index++;
        cellIndex++;
      } else if (char >= "A" && char <= "I") {
        initial.push(".");
        userCells.push({
          index: cellIndex,
          type: "user",
          value: char.charCodeAt(0) - 64,
        });
        index++;
        cellIndex++;
      } else if (char >= "a" && char <= "z") {
        const dots = char.charCodeAt(0) - 96;
        if (cellIndex + dots > 81) return null;
        initial.push(".".repeat(dots));
        index++;
        cellIndex += dots;
      } else if (char === ".") {
        initial.push(".");
        index++;
        cellIndex++;
      } else {
        return null;
      }
    }

    if (index !== state.length || cellIndex !== 81) return null;
    return { initialPuzzleString: initial.join(""), userCells };
  }

  function readJsonArray(storage, key) {
    try {
      const value = storage.getItem(key);
      if (!value) return [];
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn(`Failed to read ${key}; using defaults.`, error);
      return [];
    }
  }

  root.SudokuPuzzleIO = Object.freeze({
    decodeBoardState,
    decompressPuzzleString,
    encodeBoardState,
    formatPuzzleStringForInput,
    parseLibraryPuzzleString,
    parsePuzzleInput,
    puzzleStringToGrid,
    readJsonArray,
  });
})(globalThis);
