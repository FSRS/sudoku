(function (global) {
  "use strict";

  const scriptUrl = document.currentScript && document.currentScript.src;
  const workerUrl = new URL("sefast_worker.js", scriptUrl || location.href);
  const modeNumber = (mode) => {
    if (mode === 0 || mode === "current") return 0;
    if (mode === 1 || mode === "se121" || mode === "1.2.1") return 1;
    throw new TypeError("SE mode must be current or se121");
  };

  class SeFastClient {
    constructor() {
      this.nextId = 1;
      this.pending = new Map();
      this.worker = new Worker(workerUrl);
      this.worker.onmessage = ({ data }) => {
        const request = this.pending.get(data.id);
        if (!request) return;
        this.pending.delete(data.id);
        if (data.error) request.reject(new Error(data.error));
        else request.resolve(data.result);
      };
      this.worker.onerror = (event) => {
        const error = new Error(event.message || "sefast worker failed");
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
      };
    }

    rate(puzzle, mode = "current") {
      if (typeof puzzle !== "string" || !/^[.1-9]{81}$/.test(puzzle)) {
        return Promise.reject(
          new TypeError("puzzle must contain 81 characters from . and 1-9"),
        );
      }
      let modeValue;
      try {
        modeValue = modeNumber(mode);
      } catch (error) {
        return Promise.reject(error);
      }
      const id = this.nextId++;
      return new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker.postMessage({ id, puzzle, mode: modeValue });
      });
    }

    terminate() {
      this.worker.terminate();
      const error = new Error("sefast worker terminated");
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    }
  }

  const defaultClient = new SeFastClient();

  async function ratePuzzles(puzzles, mode = "current", options = {}) {
    const concurrency = Math.max(
      1,
      Math.min(
        puzzles.length,
        options.concurrency || navigator.hardwareConcurrency || 4,
      ),
    );
    const clients = Array.from(
      { length: concurrency },
      () => new SeFastClient(),
    );
    const results = new Array(puzzles.length);
    let next = 0;
    try {
      await Promise.all(
        clients.map(async (client) => {
          while (next < puzzles.length) {
            const index = next++;
            results[index] = await client.rate(puzzles[index], mode);
          }
        }),
      );
      return results;
    } finally {
      for (const client of clients) client.terminate();
    }
  }

  global.SeFast = {
    rate: (puzzle, mode) => defaultClient.rate(puzzle, mode),
    ratePuzzles,
    createClient: () => new SeFastClient(),
  };
  global.getSeFastRating = global.SeFast.rate;
})(window);
