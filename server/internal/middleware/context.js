/**
 * @module internal/middleware/context
 * Request context factory.
 *
 * A per-request object carrying the raw Request, the parsed URL, matched
 * params, mutable `state`, the resolved remote address (when supplied), and
 * response helper methods (json/text/html/redirect) shared by every HTTP
 * adapter and middleware.
 */

/**
 * Create a context object for the current request.
 * @param {Request} request
 * @param {object} [options]
 * @param {string|null} [options.remoteAddress]  resolved client address from Bun
 * @returns {object}
 */
export function createContext(request, options = {}) {
  const url = new URL(request.url);

  return {
    request,
    url,
    remoteAddress: options.remoteAddress || null,
    params: {},
    state: {},
    // Response helpers
    json(body, status = 200) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
    text(body, status = 200) {
      return new Response(body, {
        status,
        headers: { "Content-Type": "text/plain" },
      });
    },
    html(body, status = 200) {
      return new Response(body, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
    redirect(location, status = 302) {
      return new Response(null, { status, headers: { Location: location } });
    },
  };
}
