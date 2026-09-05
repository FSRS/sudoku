(function (root) {
  "use strict";

  const definitions = [
    ["ui_eliminate_cands", "eliminateCandidates", null, 0, 0],
    ["ui_FH", "fullHouse", null, 0, 4],
    ["ui_NakedS", "nakedSingle", null, 0, 4],
    ["ui_HiddenS", "hiddenSingle", null, 0, 14],
    ["ui_LockedP", "lockedSubset", 2, 1, 40],
    ["ui_LockedT", "lockedSubset", 3, 1, 60],
    ["ui_LockedCand", "intersection", null, 2, 50],
    ["ui_NakedP", "nakedSubset", 2, 2, 60],
    ["ui_HiddenP", "hiddenSubset", 2, 2, 70],
    ["ui_NakedT", "nakedSubset", 3, 2, 80],
    ["ui_HiddenT", "hiddenSubset", 3, 2, 100],
    ["ui_NakedQ", "nakedSubset", 4, 3, 120],
    ["ui_HiddenQ", "hiddenSubset", 4, 3, 150],
    ["ui_X_Wing", "fish", 2, 3, 100],
    ["ui_swordfish", "fish", 3, 3, 130],
    ["ui_XY_Wing", "xyWing", null, 3, 120],
    ["ui_RP", "remotePair", null, 3, 110],
    ["ui_GSP_beta", "gurthSymmetricalPlacement", null, 4, 100, false],
    ["ui_BUG_plus_1", "bugPlusOne", null, 4, 100],
    ["ui_jellyfish", "fish", 4, 4, 160],
    ["ui_XYZ_Wing", "xyzWing", null, 4, 140],
    ["ui_W_Wing", "wWing", null, 4, 160],
    ["ui_skyscraper", "skyscraper", null, 4, 110],
    ["ui_TSK", "twoStringKite", null, 4, 120],
    ["ui_crane", "crane", null, 4, 130],
    ["ui_UR", "uniqueRectangle", null, 4, 100],
    ["ui_HR", "hiddenRectangle", null, 4, 110],
    ["ui_AR", "avoidableRectangle", null, 4, 120],
    ["ui_anti_GSP_beta", "antiGurthSymmetricalPlacement", null, 5, 110, false],
    ["ui_BUG_plus_n", "bugPlusN", null, 5, 110],
    ["ui_UET", "uniquenessExternalTest", null, 5, 130],
    ["ui_UL", "uniqueLoop", null, 5, 120],
    ["ui_EUR", "extendedRectangle", null, 5, 140],
    ["ui_grouped_W_Wing", "groupedWWing", null, 5, 170],
    ["ui_finned_X_Wing", "finnedXWing", null, 5, 140],
    ["ui_Grouped_TSK", "groupedKite", null, 5, 150],
    ["ui_ER", "emptyRectangle", null, 5, 150],
    ["ui_SimpleColor", "simpleColoring", null, 5, 150, false],
    ["ui_ALP", "almostLockedPair", null, 5, 180],
    ["ui_ALT", "almostLockedTriple", null, 5, 200],
    ["ui_AUET", "avoidableUniquenessExternalTest", null, 5, 140],
    ["ui_finned_swordfish", "finnedSwordfish", null, 6, 200],
    ["ui_finned_jellyfish", "finnedJellyfish", null, 6, 260],
    ["ui_X_Chain", "xChain", null, 6, 200],
    ["ui_XY_Chain", "xyChain", null, 6, 240],
    ["ui_Medusa", "medusa3D", null, 6, 200, false],
    ["ui_BW", "brokenWing", null, 6, 210],
    ["ui_BVO", "bivalueOddagon", null, 6, 220],
    ["ui_TVO_beta", "trivalueOddagon", null, 6, 230, false],
    ["ui_firework", "firework", null, 6, 240],
    ["ui_WXYZ_Wing", "wxyzWing", null, 6, 200],
    ["ui_SdC", "sueDeCoq", null, 6, 240],
    ["ui_grouped_X_Chain", "groupedXChain", null, 7, 240],
    ["ui_AIC", "alternatingInferenceChain", null, 7, 280],
    ["ui_Grouped_AIC", "groupedAIC", null, 8, 300],
    ["ui_ALS_XZ", "alsXZ", null, 8, 300],
    ["ui_ALS_XY_Wing", "alsXYWing", null, 9, 320],
    ["ui_ALS_W_Wing", "alsWWing", null, 9, 330],
    ["ui_ALS_AIC", "alsAic", null, 9, 340],
    ["ui_DB", "deathBlossom", null, 10, 350, true, ["ui_cell_DB", "ui_region_DB", "ui_AALS_DB"]],
    ["ui_finned_franken_swordfish", "finnedFrankenSwordfish", null, 10, 360],
    ["ui_finned_mutant_swordfish", "finnedMutantSwordfish", null, 10, 370],
    ["ui_finned_franken_jellyfish", "finnedFrankenJellyfish", null, 10, 380],
    ["ui_finned_mutant_jellyfish", "finnedMutantJellyfish", null, 10, 390],
    ["ui_BLo", "blossomLoop", null, 10, 400, true, ["ui_cell_BLo", "ui_region_BLo", "ui_AALS_BLo"]],
    ["ui_Complex_AIC", "complexAic", null, 10, 420],
    ["ui_AAIC", "almostAic", null, 11, 450, true, ["ui_cell_AAIC", "ui_region_AAIC", "ui_AALS_AAIC"]],
  ].map(([id, handler, arg, level, score, defaultEnabled = true, aliases]) =>
    Object.freeze({ id, nameKey: id, handler, arg, level, score, defaultEnabled, aliases }),
  );

  const uniquenessIds = Object.freeze([
    "ui_BUG_plus_1",
    "ui_UR",
    "ui_UL",
    "ui_EUR",
    "ui_HR_vague_hint",
    "ui_AR",
    "ui_UET",
    "ui_AUET",
    "ui_HR",
  ]);
  const mandatoryIds = Object.freeze(["ui_eliminate_cands", "ui_FH_vague_hint"]);
  const hierarchyIds = Object.freeze([
    ["ui_crane_vague_hint", "ui_ER", "ui_X_Chain_vague_hint"],
    ["ui_skyscraper_vague_hint", "ui_finned_X_Wing", "ui_X_Chain_vague_hint"],
    ["ui_TSK_vague_hint", "ui_Grouped_TSK", "ui_X_Chain_vague_hint"],
    ["ui_W_Wing", "ui_grouped_W_Wing"],
    ["ui_RP", "ui_X_Chain_vague_hint"],
    ["ui_RP", "ui_XY_Chain_vague_hint"],
    ["ui_X_Wing", "ui_X_Chain_vague_hint"],
    ["ui_LockedP", "ui_NakedP", "ui_XY_Chain_vague_hint"],
    ["ui_LockedT", "ui_NakedT"],
    ["ui_LockedP", "ui_LockedCand"],
    ["ui_LockedT", "ui_LockedCand"],
    ["ui_HiddenP", "ui_AIC"],
    ["ui_SimpleColor", "ui_Medusa"],
    ["ui_X_Chain_vague_hint", "ui_grouped_X_Chain", "ui_Grouped_AIC"],
    ["ui_XY_Wing", "ui_XY_Chain_vague_hint", "ui_AIC", "ui_Grouped_AIC"],
    ["ui_W_Wing", "ui_AIC"],
    ["ui_grouped_W_Wing", "ui_Grouped_AIC"],
    ["ui_ALP", "ui_Grouped_AIC", "ui_ALS_AIC", "ui_Complex_AIC"],
    ["ui_ALP", "ui_SdC"],
    ["ui_ALT", "ui_SdC"],
    ["ui_XY_Wing", "ui_ALS_XZ"],
    ["ui_XYZ_Wing", "ui_ALS_XZ"],
    ["ui_WXYZ_Wing", "ui_ALS_XZ"],
    ["ui_ALS_XZ", "ui_ALS_AIC"],
    ["ui_ALS_XY_Wing", "ui_ALS_AIC"],
    ["ui_ALS_W_Wing", "ui_ALS_AIC"],
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
