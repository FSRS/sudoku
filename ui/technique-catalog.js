(function (root) {
  "use strict";

  const definitions = [
    ["ui_msg_210", "eliminateCandidates", null, 0, 0],
    ["ui_msg_209", "fullHouse", null, 0, 4],
    ["ui_msg_254", "nakedSingle", null, 0, 4],
    ["ui_msg_255", "hiddenSingle", null, 0, 14],
    ["ui_msg_228", "lockedSubset", 2, 1, 40],
    ["ui_msg_231", "lockedSubset", 3, 1, 60],
    ["ui_msg_234", "intersection", null, 2, 50],
    ["ui_msg_229", "nakedSubset", 2, 2, 60],
    ["ui_msg_237", "hiddenSubset", 2, 2, 70],
    ["ui_msg_232", "nakedSubset", 3, 2, 80],
    ["ui_msg_262", "hiddenSubset", 3, 2, 100],
    ["ui_msg_263", "nakedSubset", 4, 3, 120],
    ["ui_msg_264", "hiddenSubset", 4, 3, 150],
    ["ui_msg_226", "fish", 2, 3, 100],
    ["ui_msg_266", "fish", 3, 3, 130],
    ["ui_msg_242", "xyWing", null, 3, 120],
    ["ui_msg_222", "remotePair", null, 3, 110],
    ["ui_msg_355", "gurthSymmetricalPlacement", null, 4, 100, false],
    ["ui_msg_204", "bugPlusOne", null, 4, 100],
    ["ui_msg_270", "fish", 4, 4, 160],
    ["ui_msg_271", "xyzWing", null, 4, 140],
    ["ui_msg_220", "wWing", null, 4, 160],
    ["ui_msg_273", "skyscraper", null, 4, 110],
    ["ui_msg_274", "twoStringKite", null, 4, 120],
    ["ui_msg_275", "crane", null, 4, 130],
    ["ui_msg_205", "uniqueRectangle", null, 4, 100],
    ["ui_msg_285", "hiddenRectangle", null, 4, 110],
    ["ui_msg_344", "avoidableRectangle", null, 4, 120],
    ["ui_msg_356", "antiGurthSymmetricalPlacement", null, 5, 110, false],
    ["ui_msg_354", "bugPlusN", null, 5, 110],
    ["ui_msg_345", "uniquenessExternalTest", null, 5, 130],
    ["ui_msg_206", "uniqueLoop", null, 5, 120],
    ["ui_msg_207", "extendedRectangle", null, 5, 140],
    ["ui_msg_221", "groupedWWing", null, 5, 170],
    ["ui_msg_215", "finnedXWing", null, 5, 140],
    ["ui_msg_218", "groupedKite", null, 5, 150],
    ["ui_msg_212", "emptyRectangle", null, 5, 150],
    ["ui_msg_334", "simpleColoring", null, 5, 150, false],
    ["ui_msg_283", "almostLockedPair", null, 5, 180],
    ["ui_msg_284", "almostLockedTriple", null, 5, 200],
    ["ui_msg_358", "avoidableUniquenessExternalTest", null, 5, 140],
    ["ui_msg_286", "finnedSwordfish", null, 6, 200],
    ["ui_msg_287", "finnedJellyfish", null, 6, 260],
    ["ui_msg_288", "xChain", null, 6, 200],
    ["ui_msg_289", "xyChain", null, 6, 240],
    ["ui_msg_335", "medusa3D", null, 6, 200, false],
    ["ui_msg_339", "brokenWing", null, 6, 210],
    ["ui_msg_338", "bivalueOddagon", null, 6, 220],
    ["ui_msg_357", "trivalueOddagon", null, 6, 230, false],
    ["ui_msg_224", "firework", null, 6, 240],
    ["ui_msg_245", "wxyzWing", null, 6, 200],
    ["ui_msg_249", "sueDeCoq", null, 6, 240],
    ["ui_msg_240", "groupedXChain", null, 7, 240],
    ["ui_msg_238", "alternatingInferenceChain", null, 7, 280],
    ["ui_msg_241", "groupedAIC", null, 8, 300],
    ["ui_msg_250", "alsXZ", null, 8, 300],
    ["ui_msg_336", "alsXYWing", null, 9, 320],
    ["ui_msg_337", "alsWWing", null, 9, 330],
    ["ui_msg_251", "alsAic", null, 9, 340],
    ["ui_msg_351", "deathBlossom", null, 10, 350, true, ["ui_msg_295", "ui_msg_296", "ui_msg_343"]],
    ["ui_msg_297", "finnedFrankenSwordfish", null, 10, 360],
    ["ui_msg_298", "finnedMutantSwordfish", null, 10, 370],
    ["ui_msg_346", "finnedFrankenJellyfish", null, 10, 380],
    ["ui_msg_347", "finnedMutantJellyfish", null, 10, 390],
    ["ui_msg_352", "blossomLoop", null, 10, 400, true, ["ui_msg_340", "ui_msg_341", "ui_msg_342"]],
    ["ui_msg_299", "complexAic", null, 10, 420],
    ["ui_msg_353", "almostAic", null, 11, 450, true, ["ui_msg_348", "ui_msg_349", "ui_msg_350"]],
  ].map(([id, handler, arg, level, score, defaultEnabled = true, aliases]) =>
    Object.freeze({ id, nameKey: id, handler, arg, level, score, defaultEnabled, aliases }),
  );

  const uniquenessIds = Object.freeze([
    "ui_msg_204",
    "ui_msg_205",
    "ui_msg_206",
    "ui_msg_207",
    "ui_msg_208",
    "ui_msg_344",
    "ui_msg_345",
    "ui_msg_358",
    "ui_msg_285",
  ]);
  const mandatoryIds = Object.freeze(["ui_msg_210", "ui_msg_195"]);
  const hierarchyIds = Object.freeze([
    ["ui_msg_211", "ui_msg_212", "ui_msg_213"],
    ["ui_msg_214", "ui_msg_215", "ui_msg_213"],
    ["ui_msg_217", "ui_msg_218", "ui_msg_213"],
    ["ui_msg_220", "ui_msg_221"],
    ["ui_msg_222", "ui_msg_213"],
    ["ui_msg_222", "ui_msg_225"],
    ["ui_msg_226", "ui_msg_213"],
    ["ui_msg_228", "ui_msg_229", "ui_msg_225"],
    ["ui_msg_231", "ui_msg_232"],
    ["ui_msg_228", "ui_msg_234"],
    ["ui_msg_231", "ui_msg_234"],
    ["ui_msg_237", "ui_msg_238"],
    ["ui_msg_334", "ui_msg_335"],
    ["ui_msg_213", "ui_msg_240", "ui_msg_241"],
    ["ui_msg_242", "ui_msg_225", "ui_msg_238", "ui_msg_241"],
    ["ui_msg_220", "ui_msg_238"],
    ["ui_msg_221", "ui_msg_241"],
    ["ui_msg_283", "ui_msg_241", "ui_msg_251", "ui_msg_299"],
    ["ui_msg_283", "ui_msg_249"],
    ["ui_msg_284", "ui_msg_249"],
    ["ui_msg_242", "ui_msg_250"],
    ["ui_msg_271", "ui_msg_250"],
    ["ui_msg_245", "ui_msg_250"],
    ["ui_msg_250", "ui_msg_251"],
    ["ui_msg_336", "ui_msg_251"],
    ["ui_msg_337", "ui_msg_251"],
  ].map(Object.freeze));

  function createDefaultTechniques(techniqueHandlers, translate) {
    return definitions.map((definition) => {
      const handler = techniqueHandlers[definition.handler];
      const func =
        definition.arg === null
          ? handler
          : (board, pencils, findAll) =>
              handler(board, pencils, definition.arg, findAll);
      return {
        id: definition.id,
        nameKey: definition.nameKey,
        aliases: definition.aliases,
        func,
        level: definition.level,
        score: definition.score,
        defaultEnabled: definition.defaultEnabled,
        name: translate(definition.nameKey),
      };
    });
  }

  function translateIds(ids, translate) {
    return ids.map((id) => translate(id));
  }

  root.SudokuTechniqueCatalog = Object.freeze({
    definitions: Object.freeze(definitions),
    createDefaultTechniques,
    getUniquenessNames: (translate) => translateIds(uniquenessIds, translate),
    getMandatoryNames: (translate) => translateIds(mandatoryIds, translate),
    getHierarchyNames: (translate) =>
      hierarchyIds.map((ids) => translateIds(ids, translate)),
  });
})(globalThis);
