/**
 * @module internal/router/pages
 * File-based page discovery for the routing layer.
 *
 * Server-rendered page routes are discovered from the top-level directories of
 * `server/external/` (each route directory owns an `index.js`; the shared `_`
 * directory is skipped) and imported via plain absolute-path `import()` at
 * assembly time.
 */

import { joinPath } from "../configuration/join_path.js";

const PAGE_FILENAME = "index.js";
const SHARED_DIRECTORY = "_";

/**
 * Discover every file-based page route under `pagesDirectory` using Bun's
 * native glob scanner. Each top-level directory (except `_`) that contains an
 * `index.js` becomes a route named after the directory.
 * @param {string} pagesDirectory - absolute path to server/external
 * @returns {Array<{ pathname: string, file: string }>}
 */
function scanPages(pagesDirectory) {
  const results = [];
  const glob = new Bun.Glob(`*/${PAGE_FILENAME}`);

  for (const relative of glob.scanSync(pagesDirectory)) {
    const slash = relative.indexOf("/");
    if (slash === -1) continue; // bare index.js at the root, not a route
    const entry = relative.slice(0, slash);
    if (entry === SHARED_DIRECTORY) continue; // shared directory, not a page route
    results.push({ pathname: `/${entry}`, file: joinPath(pagesDirectory, relative) });
  }

  return results;
}

/**
 * Register every discovered page route onto the engine `page` function.
 * @param {object} dependencies
 * @param {Function} dependencies.page         engine.page(pathname, handler)
 * @param {string} dependencies.pagesDirectory absolute path to server/external
 */
export async function registerPages({ page, pagesDirectory }) {
  for (const { pathname: route, file } of scanPages(pagesDirectory)) {
    try {
      // Bun imports absolute filesystem paths directly — no pathToFileURL.
      const module = await import(file);
      const handler = module.default || module.handler;
      if (typeof handler !== "function") {
        console.warn(`[router] ${file}: missing default export — skipped.`);
        continue;
      }
      page(route, handler);
      console.log(`[router] ${route.padEnd(8)} → ${file}`);
    } catch (error) {
      console.error(`[router] Failed to load ${file}:`, error?.message || error);
    }
  }
}