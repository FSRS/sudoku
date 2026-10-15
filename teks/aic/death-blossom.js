Object.assign(techniques, {
  deathBlossom: (board, pencils, findAll = false) => {
    if (findAll) {
      return [
        ...techniques.cellDeathBlossom(board, pencils, true),
        ...techniques.regionDeathBlossom(board, pencils, true),
        ...techniques.aalsDeathBlossom(board, pencils, true),
      ];
    }
    const cell = techniques.cellDeathBlossom(board, pencils, false);
    if (cell.change) return cell;
    const region = techniques.regionDeathBlossom(board, pencils, false);
    if (region.change) return region;
    return techniques.aalsDeathBlossom(board, pencils, false);
  },

  cellDeathBlossom: (
    board,
    pencils,
    findAll = false,
    seenEliminations = null,
  ) => {
    return techniques._almostAicCore(
      board,
      pencils,
      false,
      findAll,
      null,
      seenEliminations,
      true,
    );
  },

  regionDeathBlossom: (
    board,
    pencils,
    findAll = false,
    seenEliminations = null,
  ) => {
    return techniques._almostAicCore(
      board,
      pencils,
      true,
      findAll,
      null,
      seenEliminations,
      true,
    );
  },

  aalsDeathBlossom: (
    board,
    pencils,
    findAll = false,
    seenEliminations = null,
  ) => {
    return techniques._almostAicCore(
      board,
      pencils,
      false,
      findAll,
      "aals",
      seenEliminations,
      true,
    );
  },
});
