/**
 * @module internal/services/errors
 * Error types shared by services and HTTP adapters.
 *
 * Handlers can throw `HttpError` and the error-boundary middleware converts it
 * into the matching JSON response without each route writing its own
 * try/catch.
 */

/**
 * Error carrying an HTTP status code.
 * @param {number} status
 * @param {string} message
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * Throw helpers for the common statuses.
 */
export function badRequest(message) {
  return new HttpError(400, message);
}

export function unauthorized(message) {
  return new HttpError(401, message);
}

export function forbidden(message) {
  return new HttpError(403, message);
}

export function notFound(message) {
  return new HttpError(404, message);
}