/**
 * @module internal/router/create_router
 * Assembles the complete routing layer for Scheme.
 *
 * Creates the pattern-matching engine, registers every REST API adapter, and
 * loads every file-based page route before returning the ready router.
 *
 * @param {object} dependencies
 * @param {object} dependencies.services       { authentication, synchronization, queries, streaming, health }
 * @param {string} dependencies.pagesDirectory absolute path to server/external
 * @returns {Promise<object>} ready router with get/post/put/patch/delete/page/listPages/match
 */

import { createRouterEngine } from "./engine.js";
import { registerApiAdapters } from "./adapters.js";
import { registerPages } from "./pages.js";

export async function createRouter({ services, pagesDirectory }) {
  const engine = createRouterEngine();

  // REST endpoints first — every /api/* endpoint as a thin HTTP adapter.
  registerApiAdapters({ add: engine.add, services });

  // Server-rendered pages next — file-based discovery from server/external/.
  await registerPages({ page: engine.page, pagesDirectory });

  // Pages are matched first (exact pathname), then per-method API patterns.
  return {
    get: engine.get,
    post: engine.post,
    put: engine.put,
    patch: engine.patch,
    delete: engine.delete,
    page: engine.page,
    listPages: engine.listPages,
    match: engine.match,
  };
}