Object.assign(techniques, {
  avoidableRectangle: (board, pencils, findAll = false) =>
    techniques.uniqueRectangle(
      board,
      pencils,
      { avoidable: true },
      findAll,
    ),

  _findAvoidableRectangles: () => {
    const rectangles = [];

    for (let r1 = 0; r1 < 8; r1++) {
      for (let r2 = r1 + 1; r2 < 9; r2++) {
        for (let c1 = 0; c1 < 8; c1++) {
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            const rowsSameBand = Math.floor(r1 / 3) === Math.floor(r2 / 3);
            const colsSameStack = Math.floor(c1 / 3) === Math.floor(c2 / 3);
            if (rowsSameBand === colsSameStack) continue;

            rectangles.push({
              cells: [
                [r1, c1],
                [r1, c2],
                [r2, c1],
                [r2, c2],
              ],
            });
          }
        }
      }
    }
    return rectangles;
  },
});
