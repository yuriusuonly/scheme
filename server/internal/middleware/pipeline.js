/**
 * @module internal/middleware/pipeline
 * Composable middleware pipeline runner.
 *
 * Each middleware is an async function `(context, next) => …`. `pipeline()`
 * composes a stack in order and returns a single entrypoint that runs the
 * middlewares inside-out around the final handler.
 */

/**
 * Execute a stack of middleware in order, wrapping the final handler.
 * @param {Function[]} middlewares
 * @param {Function} finalHandler — (context) => Response
 * @returns {Function} (context) => Promise<Response>
 */
export function pipeline(middlewares, finalHandler) {
  return async function run(context) {
    let index = 0;

    async function next() {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        return middleware(context, next);
      }
      return finalHandler(context);
    }

    return next();
  };
}