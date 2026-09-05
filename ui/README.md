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
3. `core.js` binds those modules to the page and owns UI state.

The HTML and service worker load only the generated `sudoku_ui.js`.
