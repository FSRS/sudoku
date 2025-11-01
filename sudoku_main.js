document.addEventListener("DOMContentLoaded", () => {
  async function initialize() {
    createGrid();
    updateControls();
    initBoardState();
    setupEventListeners();
    updateButtonLabels();

    // Initialize palettes based on the initial system preference
    updateColorPalettes(
      window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    );

    // react to changes in system preference (updates UI instantly)
    const colorSchemeMQ = window.matchMedia("(prefers-color-scheme: dark)");
    colorSchemeMQ.addEventListener?.("change", (e) => {
      updateColorPalettes(e.matches);
      updateControls(); // rebuild the number/color pad
      onBoardUpdated();
    });

    try {
      const response = await fetch("sudoku.json");
      if (!response.ok) throw new Error("Failed to load sudoku.json");
      allPuzzles = await response.json();
      await populateSelectors();
      findAndLoadSelectedPuzzle();
    } catch (error) {
      console.error("Error loading puzzles:", error);
      // Display a user-friendly error message on the page
      showMessage(
        "Could not load puzzles. Please check the connection or refresh.",
        "red"
      );
    }
  }

  initialize();
});
