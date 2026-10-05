importScripts("tlg/exact.js", "tlg/dlx.js", "tlg/pb.js", "tlg/state.js");
/* @edition-slot worker-001 */
importScripts("tlg/rank.js", "tlg/gate.js");
/* @edition-slot worker-002 */
importScripts("tlg/adapter.js");

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
