const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "ui");
const outputPath = path.join(root, "sudoku_ui.js");

const sources = ["technique-catalog.js", "puzzle-io.js", "core.js"];

const banner = [
  "// GENERATED FILE. DO NOT EDIT DIRECTLY.",
  "// Edit files under ui and run: node scripts/build-ui.cjs",
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
        "sudoku_ui.js is stale; run node scripts/build-ui.cjs",
      );
    }
    console.log("sudoku_ui.js is up to date.");
    return;
  }

  fs.writeFileSync(outputPath, output, "utf8");
  console.log(`Built ${outputPath} from ${sources.length} source files.`);
}

if (require.main === module) main();

module.exports = { createBundle, outputPath, sourceDir, sources };
