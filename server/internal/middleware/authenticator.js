/**
 * @module internal/middleware/authenticator
 * Authentication middleware factory.
 *
 * The middleware is a factory: the composition root injects the authentication
 * service so the pipeline never imports a service directly. It performs an
 * opportunistic identity lookup — when a valid bearer token is present it is
 * attached to `context.state.session`; authentication failures are not fatal,
 * so anonymous reads still pass through.
 */

/**
 * Create the authenticator middleware bound to an authentication service.
 * @param {object} authenticationService  from internal/services/authentication
 */
export function createAuthenticatorMiddleware(authenticationService) {
  /**
   * @param {object} context
   * @param {Function} next
   */
  async function authenticatorMiddleware(context, next) {
    const authorization = context.request.headers.get("authorization");
    if (authorization) {
      const result = authenticationService.authenticate(authorization);
      if (result.valid) {
        context.state.session = result.session;
      }
    }
    return next();
  }

  return authenticatorMiddleware;
}