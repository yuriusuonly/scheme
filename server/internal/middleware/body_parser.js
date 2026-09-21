/**
 * @module internal/middleware/body_parser
 * JSON body parser middleware.
 */

/**
 * Parse a JSON request body into `context.state.body`.
 * - Empty bodies are allowed and become `{}`.
 * - Non-JSON content-type on a non-empty body is rejected (415).
 */
export async function jsonBodyMiddleware(context, next) {
  const method = context.request.method;
  context.state.body = {};
  if (["POST", "PUT", "PATCH"].includes(method)) {
    const contentType = context.request.headers.get("content-type") || "";
    const contentLength = context.request.headers.get("content-length");
    // A body exists if a Content-Length > 0 is present, OR (when Content-Length
    // is absent, e.g. curl without -d) if a Content-Type was supplied.
    const hasBody = contentLength !== null ? Number(contentLength) > 0 : contentType.length > 0;

    if (hasBody && !contentType.includes("application/json")) {
      return context.json({ error: "Content-Type must be application/json" }, 415);
    }

    if (hasBody) {
      try {
        context.state.body = await context.request.json();
      } catch {
        return context.json({ error: "Malformed JSON body" }, 400);
      }
    }
  }
  return next();
}