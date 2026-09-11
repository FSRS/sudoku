const runCombinedUniquenessTechniques = (findAll, finders) => {
  if (findAll) return finders.flatMap((finder) => finder(true));

  for (const finder of finders) {
    const result = finder(false);
    if (result.change) return result;
  }
  return { change: false };
};

Object.assign(techniques, {
  combinedUniqueRectangle: (board, pencils, findAll = false) =>
    runCombinedUniquenessTechniques(findAll, [
      (all) => techniques.uniqueRectangle(board, pencils, all),
      (all) => techniques.hiddenRectangle(board, pencils, all),
      (all) => techniques.avoidableRectangle(board, pencils, all),
    ]),

  combinedUniqueRectangleType7: (board, pencils, findAll = false) =>
    runCombinedUniquenessTechniques(findAll, [
      (all) => techniques.uniqueRectangleType7(board, pencils, all),
      (all) => techniques.avoidableRectangleType7(board, pencils, all),
    ]),

  combinedUniquenessExternalTest: (board, pencils, findAll = false) =>
    runCombinedUniquenessTechniques(findAll, [
      (all) => techniques.uniquenessExternalTest(board, pencils, all),
      (all) => techniques.avoidableUniquenessExternalTest(board, pencils, all),
    ]),

  combinedUniqueLoop: (board, pencils, findAll = false) =>
    runCombinedUniquenessTechniques(findAll, [
      (all) => techniques.uniqueLoop(board, pencils, all),
      (all) => techniques.avoidableUniqueLoop(board, pencils, all),
    ]),

  combinedExtendedRectangle: (board, pencils, findAll = false) =>
    runCombinedUniquenessTechniques(findAll, [
      (all) => techniques.extendedRectangle(board, pencils, all),
      (all) => techniques.avoidableExtendedRectangle(board, pencils, all),
    ]),
});
