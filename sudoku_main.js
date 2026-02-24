document.addEventListener("DOMContentLoaded", () => {
  function applyTheme() {
    const savedTheme = localStorage.getItem("theme");
    const systemDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const isDark = savedTheme === "dark" || (!savedTheme && systemDark);

    document.documentElement.classList.toggle("dark", isDark);

    // Call your UI update functions
    if (typeof updateColorPalettes === "function") {
      updateColorPalettes();
      updateControls();
      onBoardUpdated();
    }
  }

  async function initialize() {
    createGrid();
    updateControls();
    initBoardState();
    setupEventListeners();
    updateButtonLabels();

    // Initial theme application
    applyTheme();

    // React to system preference changes
    const colorSchemeMQ = window.matchMedia("(prefers-color-scheme: dark)");
    colorSchemeMQ.addEventListener?.("change", applyTheme);

    // REACT TO LOCALSTORAGE CHANGES
    window.addEventListener("storage", (e) => {
      if (e.key === "theme") {
        applyTheme();
      }
    });

    try {
      const response = await fetch("sudoku/sudoku.json");
      if (!response.ok) throw new Error("Failed to load sudoku.json");
      allPuzzles = await response.json();
      await populateSelectors();
      findAndLoadSelectedPuzzle();
    } catch (error) {
      console.error("Error loading puzzles:", error);
      // Display a user-friendly error message on the page
      showMessage(
        "Could not load puzzles. Please check the connection or refresh.",
        "red",
      );
    }
  }

  initialize();
});
