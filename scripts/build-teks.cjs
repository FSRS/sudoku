const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "teks");
const outputPath = path.join(root, "sudoku_teks.js");

const sources = [
  "core.js",
  "visuals.js",
  "blossom-stems.js",
  "basic.js",
  "wings-sdp.js",
  "symmetry-bug.js",
  "uniqueness/rectangles.js",
  "uniqueness/rectangle-patterns.js",
  "uniqueness/avoidable.js",
  "uniqueness/extended.js",
  "uniqueness/loops.js",
  "uniqueness/external.js",
  "als-firework.js",
  "aic/graph.js",
  "aic/search.js",
  "aic/blossom-als.js",
  "aic/death-blossom.js",
  "aic/almost-aic.js",
  "complex-fish.js",
  "coloring.js",
  "oddagons/bivalue.js",
  "oddagons/trivalue.js",
  "oddagons/broken-wing.js",
  "blossom-loop.js",
];

const banner = [
  "// GENERATED FILE. DO NOT EDIT DIRECTLY.",
  "// Edit files under teks and run: node scripts/build-teks.cjs",
  "",
].join("\n");

function createBundle() {
  return (
    banner +
    sources
      .map((source) =>
        fs.readFileSync(path.join(sourceDir, source), "utf8").trimEnd(),
      )
      .join("\n\n") +
    "\n"
  );
}

function main() {
  const output = createBundle();
  if (process.argv.includes("--check")) {
    const current = fs.readFileSync(outputPath, "utf8");
    if (current !== output) {
      throw new Error(
        "sudoku_teks.js is stale; run node scripts/build-teks.cjs",
      );
    }
    console.log("sudoku_teks.js is up to date.");
    return;
  }

  fs.writeFileSync(outputPath, output, "utf8");
  console.log(`Built ${outputPath} from ${sources.length} source files.`);
}

if (require.main === module) main();

module.exports = { createBundle, sourceDir, sources };
