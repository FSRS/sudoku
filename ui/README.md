# Sudoku UI sources

`sudoku_ui.js` is a generated compatibility bundle. Edit the files in this
directory, then rebuild the bundle from the repository root:

```text
node scripts/build-ui.cjs
```

Use `node scripts/build-ui.cjs --check` in verification or CI to detect a
stale generated bundle. The source order in `scripts/build-ui.cjs` is also the
runtime dependency order:

1. `technique-catalog.js` defines the solver technique metadata.
2. `puzzle-io.js` defines parsing, sharing and storage codecs.
3. `image-import.js` turns recognised board cells into a puzzle string, and
   takes a pasted or button-read clipboard image to the recognizer worker
   (`ocr/sudoku_ocr_worker.js`, loaded on first use, not bundled), then
   shows what was read in a correction dialog that loads the corrected board.
4. `tlg-renderer.js` draws the manual Truth/Link editor's sets, marks and
   result badges into the board's SVG layer.
5. `tlg.js` owns the Truth/Link editor: its state, candidate input, the
   evaluation worker (built from `tlg/*.js`, not bundled) and the panel.
6. `core.js` binds those modules to the page and owns UI state.

The HTML and service worker load only the generated `sudoku_ui.js`.
