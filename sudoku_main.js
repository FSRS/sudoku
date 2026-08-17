document.addEventListener("DOMContentLoaded", () => {
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      navigator.serviceWorker.controller?.postMessage({
        type: "refresh-puzzle-data",
      });
    });

    navigator.serviceWorker
      .register("./service-worker.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        registration.active?.postMessage({ type: "refresh-puzzle-data" });
      })
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  }

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
    registerServiceWorker();

    // Initialize language
    currentLang = detectLanguage();
    applyTranslations();
    setupLanguageSwitcher();

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
      await populateSelectors();

      // 1. Check if the user is loading a puzzle via URL parameters first
      const loadedFromUrl = await handleUrlParameters();

      // 2. If no URL parameters were found, load the default daily puzzle
      if (!loadedFromUrl) {
        findAndLoadSelectedPuzzle();
      }
    } catch (error) {
      console.error("Error loading puzzles:", error);
      // Display a user-friendly error message on the page
      showMessage(
        t("error_load_puzzle"),
        "red",
      );
    }
  }

  initialize();
});
