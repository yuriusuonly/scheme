/**
 * @module external/_/helpers/user
 * Resolve the authenticated user for a server-rendered page request.
 *
 * Pages accept identity from either the `Authorization: Bearer <token>` header
 * (API-style clients) or the `scheme_token` cookie (browser page loads), so the
 * server can pre-render the logged-in state before the client JS hydrates.
 *
 * The application container (server/index.js) provides the services; this
 * helper never imports repositories directly.
 */

import { getApplication } from "../../../index.js";

/**
 * Read the `scheme_token` cookie value, if present.
 * @param {Request} request
 * @returns {string|null}
 */
function cookieToken(request) {
  const header = request.headers.get("cookie") || "";
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.split("=");
    if (key.trim() === "scheme_token") {
      const value = rest.join("=").trim();
      if (value) {
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      }
    }
  }
  return null;
}

/**
 * Resolve the current user from a page request, or `null` when anonymous.
 * @param {Request} request
 * @returns {object|null}
 */
export function getRequestUser(request) {
  const authorization = request.headers.get("authorization");
  const token = authorization
    ? authorization
    : (() => {
        const cookie = cookieToken(request);
        return cookie ? `Bearer ${cookie}` : null;
      })();

  if (!token) return null;
  const { authentication } = getApplication().services;
  const result = authentication.authenticate(token);
  if (!result.valid || !result.session) return null;
  try {
    return authentication.me(result.session);
  } catch {
    // Orphaned session (valid token, deleted user) — treat as anonymous so
    // the server-rendered page redirects to /login instead of crashing.
    return null;
  }
}