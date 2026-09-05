Object.assign(techniques, {
  _collectBlossomStems: (
    board,
    pencils,
    kind,
    maxBranches,
    maxAalsCandidates,
  ) => {
    const stems = [];
    if (kind === "cell") {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const size = pencils[r][c].size;
          if (size >= 3 && size <= maxBranches) {
            stems.push({
              size,
              r,
              c,
              cellId: r * 9 + c,
              startDigits: [...pencils[r][c]].sort((a, b) => a - b),
            });
          }
        }
      }
    } else if (kind === "region") {
      for (let digit = 1; digit <= 9; digit++) {
        for (let unit = 0; unit < 27; unit++) {
          const cells = techniques
            ._getUnitCellsCached(unit)
            .filter(([r, c]) => pencils[r][c].has(digit))
            .map(([r, c]) => r * 9 + c);
          if (cells.length < 3 || cells.length > maxBranches) continue;
          stems.push({
            size: cells.length,
            digit,
            cells,
            houseName:
              unit < 9
                ? t("teks_r", unit + 1)
                : unit < 18
                  ? t("teks_c", unit - 8)
                  : t("teks_b", unit - 17),
          });
        }
      }
    } else {
      const seenAals = new Set();
      const unitLabel = (unit) =>
        unit < 9
          ? t("teks_r", unit + 1)
          : unit < 18
            ? t("teks_c", unit - 8)
            : t("teks_b", unit - 17);

      for (let unit = 0; unit < 27; unit++) {
        const eligibleCells = [];
        for (let id = 0; id < 81; id++) {
          const part = Math.floor(id / 27);
          const bit = id % 27;
          if ((UNIT_BITSETS[unit][part] & (1 << bit)) === 0) continue;
          const r = Math.floor(id / 9);
          const c = id % 9;
          if (board[r][c] === 0 && pencils[r][c].size > 0) {
            eligibleCells.push(id);
          }
        }

        const addAalsStems = (cells) => {
          let mask = 0;
          const cellsByDigit = Array.from({ length: 10 }, () => []);
          for (const id of cells) {
            const r = Math.floor(id / 9);
            const c = id % 9;
            for (const digit of pencils[r][c]) {
              mask |= 1 << digit;
              cellsByDigit[digit].push(id);
            }
          }
          if (techniques._bits.popcount(mask) !== cells.length + 2) return;
          const key = [...cells].sort((a, b) => a - b).join(",");
          if (seenAals.has(key)) return;
          seenAals.add(key);

          const digits = [];
          for (let digit = 1; digit <= 9; digit++) {
            if (mask & (1 << digit)) digits.push(digit);
          }
          for (let first = 0; first < digits.length - 2; first++) {
            for (let second = first + 1; second < digits.length - 1; second++) {
              for (let third = second + 1; third < digits.length; third++) {
                const startDigits = [
                  digits[first],
                  digits[second],
                  digits[third],
                ];
                const startCandidates = startDigits.flatMap((digit) =>
                  cellsByDigit[digit].map((id) => ({ id, digit })),
                );
                if (
                  startCandidates.length < 3 ||
                  startCandidates.length > maxAalsCandidates
                ) {
                  continue;
                }
                stems.push({
                  size: startCandidates.length,
                  kind: "aals",
                  unit,
                  cells: [...cells],
                  houseName: unitLabel(unit),
                  startDigits,
                  startCandidates,
                  startCandidateKeys: new Set(
                    startCandidates.map(({ id, digit }) => `${id}:${digit}`),
                  ),
                });
              }
            }
          }
        };

        const chooseCells = (start, size, cells) => {
          if (cells.length === size) {
            addAalsStems(cells);
            return;
          }
          const needed = size - cells.length;
          for (
            let index = start;
            index <= eligibleCells.length - needed;
            index++
          ) {
            cells.push(eligibleCells[index]);
            chooseCells(index + 1, size, cells);
            cells.pop();
          }
        };

        for (let size = 2; size <= Math.min(7, eligibleCells.length); size++) {
          chooseCells(0, size, []);
        }
      }
    }
    stems.sort((left, right) => left.size - right.size);
    return stems;
  },

});
