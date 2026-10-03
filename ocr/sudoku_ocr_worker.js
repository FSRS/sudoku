"use strict";

let loadError = null;
try {
  importScripts("sudoku_ocr_model.js", "sudoku_ocr.js");
} catch (error) {
  loadError = error;
}

self.onmessage = (event) => {
  const { id, image } = event.data || {};
  try {
    if (loadError) throw loadError;
    if (typeof self.SudokuOcr?.recognize !== "function") {
      throw new Error("SudokuOcr.recognize is not available");
    }
    const result = self.SudokuOcr.recognize(image, self.SudokuOcrModel);
    const rgba = result?.ok ? result.preview?.rgba : null;
    self.postMessage({ id, result }, rgba?.buffer ? [rgba.buffer] : []);
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
