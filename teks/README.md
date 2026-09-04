# Sudoku technique sources

`sudoku_teks.js` is a generated compatibility bundle. Edit the files in this
directory, then rebuild the bundle from the repository root:

```text
node scripts/build-teks.cjs
```

The explicit source order in `scripts/build-teks.cjs` is also the dependency
order. `core.js` creates the shared `techniques` object; the remaining files
register related technique methods on that object.

Technique detection should return serializable visual instructions in a
`visualPlan` instead of closing over UI globals. `visuals.js` owns the renderer
and new technique results must use `visualPlan`.

Pushes to `main` rebuild `sudoku_teks.js` at the repository root and deploy the
result as a GitHub Pages artifact. The generated bundle is not committed by the
workflow; edit only the files in this directory.

Large technique families use subdirectories or filename prefixes to separate
shared search helpers from public detectors. Keep related files adjacent in the
build list because the generated bundle preserves that order.
