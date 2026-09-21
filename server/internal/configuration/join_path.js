/**
 * @module internal/configuration/join_path
 * Bun-native path join helper.
 *
 * Join path parts (no `node:path`): an absolute part resets the base, `.` or
 * empty segments are dropped, and `..` pops the previous segment.
 *   joinPath("/a/b", "..", "c")  → "/a/c"
 *   joinPath("/root", "/abs/x")  → "/abs/x"
 * @param {...string} parts
 * @returns {string} normalized absolute path
 */

const SEPARATOR = "/";

function joinPath(...parts) {
  let segments = [];
  for (const part of parts) {
    const chunk = String(part);
    const absolute = chunk.startsWith(SEPARATOR);
    const chunkSegments = chunk.split(SEPARATOR);
    if (absolute) segments = [];
    for (const segment of chunkSegments) {
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        segments.pop();
        continue;
      }
      segments.push(segment);
    }
  }
  return SEPARATOR + segments.join(SEPARATOR);
}

export { joinPath };