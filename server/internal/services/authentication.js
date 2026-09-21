/**
 * @module internal/services/authentication
 * Authentication microservice — registration, login, logout, session identity.
 *
 * Pure domain service: it knows nothing about HTTP. It receives the
 * repositories (users, sessions), the security helpers, and a session TTL from
 * the composition root, and exposes use-cases consumed by HTTP adapters and
 * the SSR user helper.
 *
 * An in-memory session cache lives here (service-local), mirroring sessions
 * from SQLite for fast lookups.
 */

import { HttpError, badRequest, unauthorized, notFound } from "./errors.js";

/**
 * Create the authentication service.
 * @param {object} dependencies
 * @param {object} dependencies.repositories        repository set from persistence
 * @param {Function} dependencies.hashPassword      sha-256 hashing helper
 * @param {Function} dependencies.generateToken     random token helper
 * @param {number} dependencies.sessionTtlSeconds   session lifetime in seconds
 */
export function createAuthenticationService({ repositories, hashPassword, generateToken, sessionTtlSeconds }) {
  const sessionCache = new Map(); // token → { userId, expiresAt, user }

  /**
   * Parse a bearer token from an Authorization header value.
   * @param {string|null} authorizationHeader
   * @returns {string|null}
   */
  function tokenFromAuthorization(authorizationHeader) {
    if (!authorizationHeader) return null;
    const parts = authorizationHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") return null;
    return parts[1];
  }

  /**
   * Validate a bearer token and return the live session.
   * @param {string|null} authorizationHeader
   * @returns {{ valid: boolean, session?: object, error?: string }}
   */
  function authenticate(authorizationHeader) {
    const token = tokenFromAuthorization(authorizationHeader);
    if (!token) return { valid: false, error: "Missing or malformed Authorization header" };
    const session = repositories.sessions.getByToken(token);
    if (!session) return { valid: false, error: "Invalid or expired token" };
    return { valid: true, session };
  }

  /**
   * Login with username/password; returns the token + user + expiry.
   * @param {object} credentials
   * @param {string} credentials.username
   * @param {string} credentials.password
   */
  async function login({ username, password }) {
    if (!username || !password) throw badRequest("Username and password are required");

    const user = repositories.users.getByUsername(username);
    if (!user) throw unauthorized("Invalid credentials");

    const hash = await hashPassword(password);
    if (hash !== user.password) throw unauthorized("Invalid credentials");

    const token = generateToken(32);
    const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000).toISOString();
    repositories.sessions.insert({ id: crypto.randomUUID(), userId: user.id, token, expiresAt });

    const publicUser = { id: user.id, username: user.username, role: user.role };
    sessionCache.set(token, { userId: user.id, expiresAt, user: publicUser });

    return { token, user: publicUser, expiresAt };
  }

  /**
   * Register a new account and sign it in immediately (mirrors `login`).
   * New users always get the `editor` role — the client never supplies one.
   * @param {object} details
   * @param {string} details.username
   * @param {string} details.password
   * @returns {Promise<{ token: string, user: object, expiresAt: string }>}
   */
  async function register({ username, password }) {
    if (!username || !password) throw badRequest("Username and password are required");
    if (typeof username !== "string" || !/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
      throw badRequest("Username must be 3-32 characters (letters, digits, _, ., -)");
    }
    if (typeof password !== "string" || password.length < 8) {
      throw badRequest("Password must be at least 8 characters");
    }

    const existing = repositories.users.getByUsername(username);
    if (existing) throw badRequest("Username is already taken");

    const passwordHash = await hashPassword(password);
    const user = repositories.users.insert({ username, password: passwordHash, role: "editor" });

    const token = generateToken(32);
    const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000).toISOString();
    repositories.sessions.insert({ id: crypto.randomUUID(), userId: user.id, token, expiresAt });

    sessionCache.set(token, { userId: user.id, expiresAt, user });

    return { token, user, expiresAt };
  }

  /**
   * Logout — invalidate the session behind the given bearer header (if any).
   * @param {string|null} authorizationHeader
   */
  function logout(authorizationHeader) {
    const token = tokenFromAuthorization(authorizationHeader);
    if (!token) return;
    sessionCache.delete(token);
    repositories.sessions.deleteByToken(token);
  }

  /**
   * Resolve the authenticated user for `GET /api/authentication/me`.
   * Prefers the in-memory cache; falls back to SQLite.
   * @param {object} session  a valid session row (validated upstream)
   */
  function me(session) {
    if (!session) throw unauthorized("Not authenticated");
    const cached = sessionCache.get(session.token);
    if (cached && cached.user) return cached.user;
    const user = repositories.users.getPublicById(session.userId);
    if (!user) throw notFound("User not found");
    return user;
  }

  return { authenticate, login, logout, me, register };
}