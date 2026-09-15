(function (global) {
  "use strict";

  const scriptUrl = document.currentScript && document.currentScript.src;
  const workerUrl = new URL("sefast_worker.js", scriptUrl || location.href);
  const DEFAULT_TIMEOUT_MS = 600000;
  const MAX_CONSECUTIVE_RESTARTS = 2;

  const modeNumber = (mode) => {
    if (mode === 0 || mode === "current") return 0;
    if (mode === 1 || mode === "se121" || mode === "1.2.1") return 1;
    throw new TypeError("SE mode must be current or se121");
  };

  const failure = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
  };

  class SeFastClient {
    constructor(options = {}) {
      this.nextId = 1;
      this.pending = new Map();
      this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      this.restarts = 0;
      this.state = "active";
      this.worker = null;
      this.startWorker();
    }

    startWorker() {
      const worker = new Worker(workerUrl);
      worker.onmessage = ({ data }) => {
        if (worker !== this.worker) return;
        const request = this.takePending(data.id);
        if (!request) return;
        this.restarts = 0;
        if (data.error) request.reject(failure("engine", data.error));
        else request.resolve(data.result);
      };
      worker.onerror = (event) => {
        if (worker !== this.worker) return;
        this.dropWorker(
          failure("worker-error", event.message || "sefast worker failed"),
          "failed",
        );
      };
      this.worker = worker;
      this.state = "active";
    }

    takePending(id) {
      const request = this.pending.get(id);
      if (!request) return null;
      clearTimeout(request.timer);
      this.pending.delete(id);
      return request;
    }

    dropWorker(error, nextState) {
      const worker = this.worker;
      this.worker = null;
      this.state = nextState;
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      }
      for (const id of [...this.pending.keys()]) {
        this.takePending(id).reject(error);
      }
    }

    rate(puzzle, mode = "current", options = {}) {
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
      if (this.state === "terminated") {
        return Promise.reject(
          failure("terminated", "sefast worker terminated"),
        );
      }
      if (!this.worker) {
        if (this.restarts >= MAX_CONSECUTIVE_RESTARTS) {
          this.state = "failed";
          return Promise.reject(
            failure("unavailable", "sefast worker is unavailable"),
          );
        }
        this.restarts++;
        try {
          this.startWorker();
        } catch (error) {
          this.state = "failed";
          return Promise.reject(
            failure(
              "unavailable",
              error?.message || "sefast worker could not start",
            ),
          );
        }
      }

      const id = this.nextId++;
      const timeoutMs = options.timeoutMs ?? this.timeoutMs;
      return new Promise((resolve, reject) => {
        const timer =
          timeoutMs > 0
            ? setTimeout(
                () =>
                  this.dropWorker(
                    failure("timeout", "sefast rating timed out"),
                    "failed",
                  ),
                timeoutMs,
              )
            : null;
        this.pending.set(id, { resolve, reject, timer });
        try {
          this.worker.postMessage({ id, puzzle, mode: modeValue });
        } catch (error) {
          this.dropWorker(
            failure(
              "post-failed",
              error?.message || "sefast worker rejected the request",
            ),
            "failed",
          );
        }
      });
    }

    terminate() {
      this.dropWorker(
        failure("terminated", "sefast worker terminated"),
        "terminated",
      );
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
      () => new SeFastClient({ timeoutMs: options.timeoutMs }),
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
    rate: (puzzle, mode, options) => defaultClient.rate(puzzle, mode, options),
    ratePuzzles,
    createClient: (options) => new SeFastClient(options),
  };
  global.getSeFastRating = global.SeFast.rate;
})(window);
