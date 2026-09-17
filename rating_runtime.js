/*
 * WebAssembly entry-point adapter for the combined skfr + SEROB rating module,
 * written in 2026 by ClubDS.
 * SPDX-License-Identifier: LGPL-2.1-only
 */
(function (root, makeRuntime) {
  if (typeof module === 'object' && module.exports) {
    module.exports = options => makeRuntime(require('./rating.js'), options);
  } else {
    root.createRating = options => makeRuntime(root.createRatingNative, options);
  }
})(globalThis, async function (createNative, options) {
  const native = await createNative(options || {});
  const modeError = 'ERROR,java.lang.IllegalArgumentException,mode must be 0 (current) or 1 (SE 1.2.1)';
  const stateError = 'ERROR,java.lang.IllegalArgumentException,invalid rating state';
  const validMode = mode => mode === 0 || mode === 1;
  const call = (name, types, args) => native.ccall(name, 'string', types, args);

  // TeaVM used UTF-16 code units, including NULs. ccall strings are UTF-8
  // and NUL-terminated, so cross this boundary with Board's ASCII snapshot.
  function encodeState(state) {
    if (typeof state !== 'string' || state.length !== 162) return null;
    let values = '', masks = '';
    for (let cell = 0; cell < 81; cell++) {
      const value = state.charCodeAt(cell);
      if (value > 9) return null;
      values += value === 0 ? '.' : String(value);
      masks += (state.charCodeAt(81 + cell) & 1022).toString(16).padStart(3, '0');
    }
    return values + ':' + masks;
  }

  return {
    // The whole module behind one call: 0 SE, 1 SE 1.2.1, 2 skfr -- 0 and 1 as
    // sefast_rate numbers them. Every mode answers "er,ep,ed" in tenths, and ""
    // when the engine declined the puzzle.
    rate(puzzle, mode) {
      return call('rating_rate', ['string', 'number'], [puzzle, mode]);
    },

    // The SE engine's own surface, keeping its 0 (current) / 1 (SE 1.2.1) modes.
    se: {
      rate(puzzle, mode) {
        return call('sefast_rate', ['string', 'number'], [puzzle, mode]);
      },
      rateDiag(puzzle, mode) {
        return call('sefast_rate_diag', ['string', 'number'], [puzzle, mode]);
      },
      rateLowCurrent(puzzle) {
        return call('sefast_rate_low_current', ['string'], [puzzle]);
      },
      rateChainCells(state, mode, multiple, dynamic, nishio, level, nestingLimit, cells) {
        if (!validMode(mode)) return modeError;
        const encoded = encodeState(state);
        if (encoded === null) return stateError;
        return call('sefast_best_chain_cells',
            ['string', 'string', 'number', 'number', 'number', 'number', 'number'],
            [encoded, cells, multiple, dynamic, nishio, level, nestingLimit]);
      },
      rateStaticBest(state, mode) {
        if (!validMode(mode)) return modeError;
        const encoded = encodeState(state);
        if (encoded === null) return stateError;
        return call('sefast_best_static', ['string'], [encoded]);
      },
    },
  };
});
