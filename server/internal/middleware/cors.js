/**
 * @module internal/middleware/cors
 * CORS middleware — attaches cross-origin headers to every response.
 */

import { configuration } from "../configuration/environment.js";

/**
 * Add CORS headers to the response.
 * @param {object} context
 * @param {Function} next
 */
export async function corsMiddleware(context, next) {
  const response = await next();
  const origin = configuration.corsOrigin;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}