importScripts("tlg/tle-base.js");
importScripts("tlg/tle-cover.js");
importScripts("tlg/tle-board.js");
importScripts("tlg/tle-marks.js");
importScripts("tlg/tle-eval.js");
importScripts("tlg/tle-rank.js");
importScripts("tlg/tle-stats.js");
importScripts("tlg/tle-shape.js");
importScripts("tlg/tle-onedigit.js");
importScripts("tlg/tle-rank1.js");
importScripts("tlg/tle-api.js");
/* @edition-slot worker-001 */

self.TLE.log = function () {};

self.onmessage = ({ data }) => {
  const { id, input, op } = data || {};
  try {
    const result =
      op === "removeUnusedLinks"
        ? self.TLE.removeUnusedLinks(input)
        : self.TLE.evaluate(input);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String((error && error.message) || error) });
  }
};
