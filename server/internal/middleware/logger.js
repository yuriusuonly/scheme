/**
 * @module internal/middleware/logger
 * Request logger middleware.
 */

/**
 * Log method, path, status, and elapsed time for every handled request.
 * @param {object} context
 * @param {Function} next
 */
export async function loggerMiddleware(context, next) {
  const start = performance.now();
  try {
    const response = await next();
    const milliseconds = (performance.now() - start).toFixed(1);
    console.log(`${context.request.method} ${context.url.pathname} → ${response.status} (${milliseconds}ms)`);
    return response;
  } catch (error) {
    const milliseconds = (performance.now() - start).toFixed(1);
    console.error(`${context.request.method} ${context.url.pathname} failed (${milliseconds}ms):`, error?.message || error);
    throw error;
  }
}