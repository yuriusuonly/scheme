/**
 * @module internal/router/engine
 * Pattern-matching engine for the routing layer.
 *
 * Per-method `:param` API tables plus exact server-rendered page pathnames,
 * dispatched from a single `match(method, pathname)` call that returns
 * `{ type: "page" | "api", handler, params }`. Pages are matched first
 * (exact pathname, method-agnostic), then per-method API patterns.
 */

/**
 * Compile a route pattern into a regex and param-name list.
 *   "/api/data/:table" → { regex: /^\/api\/data\/([^/]+)$/, keys: ["table"] }
 */
function compile(pattern) {
  const keys = [];
  const regex = new RegExp(
    "^" +
      pattern.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
        keys.push(name);
        return "([^/]+)";
      }) +
      "$"
  );
  return { regex, keys };
}

/**
 * Create the routing engine — a self-contained route registry and matcher.
 * @returns {object} engine with add/page/match/listPages + method sugar
 */
export function createRouterEngine() {
  const tables = {};
  const pages = new Map();

  function add(method, pattern, handler) {
    const upper = method.toUpperCase();
    if (!tables[upper]) tables[upper] = [];
    tables[upper].push({ ...compile(pattern), handler });
  }

  /**
   * Register a server-rendered page by exact URL pathname (method-agnostic).
   * @param {string} pathname
   * @param {Function} handler
   */
  function page(pathname, handler) {
    if (pathname !== "/" && pathname.endsWith("/")) {
      pathname = pathname.replace(/\/+$/, "");
    }
    pages.set(pathname, handler);
  }

  /**
   * Match an incoming method + pathname.
   * @returns {{ type: "page" | "api", handler: Function, params: object } | null}
   */
  function match(method, pathname) {
    const pageHandler = pages.get(pathname);
    if (pageHandler) {
      return { type: "page", handler: pageHandler, params: {} };
    }

    const entries = tables[method.toUpperCase()];
    if (entries) {
      for (const entry of entries) {
        const matchResult = pathname.match(entry.regex);
        if (matchResult) {
          const params = {};
          entry.keys.forEach((key, index) => {
            params[key] = decodeURIComponent(matchResult[index + 1]);
          });
          return { type: "api", handler: entry.handler, params };
        }
      }
    }

    return null;
  }

  return {
    add,
    page,
    match,
    listPages: () => [...pages.keys()],
    get: (pathname, handler) => add("GET", pathname, handler),
    post: (pathname, handler) => add("POST", pathname, handler),
    put: (pathname, handler) => add("PUT", pathname, handler),
    patch: (pathname, handler) => add("PATCH", pathname, handler),
    delete: (pathname, handler) => add("DELETE", pathname, handler),
  };
}