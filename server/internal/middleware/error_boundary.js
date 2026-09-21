/**
 * @module internal/middleware/error_boundary
 * Error-boundary middleware.
 *
 * Catches any downstream error and returns a structured JSON error response
 * instead of crashing the server. `HttpError` instances (from
 * services/errors.js) map their `status` directly; anything else is a 500.
 */

/**
 * Wrap the pipeline so thrown errors become JSON responses.
 * @param {object} context
 * @param {Function} next
 */
export async function errorBoundaryMiddleware(context, next) {
  try {
    return await next();
  } catch (error) {
    const status = error.status && Number.isInteger(error.status) ? error.status : 500;
    console.error(`[error_boundary] ${context.request.method} ${context.url.pathname}:`, error?.message || error);
    return context.json({ error: error?.message || "Internal Server Error", status }, status);
  }
}