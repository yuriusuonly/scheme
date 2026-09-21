/**
 * @module internal/security/generate_token
 * Cryptographically random token generation.
 *
 * Depends on nothing but the Web Crypto API on the Bun runtime, so the
 * authentication service can use it without importing other modules.
 */

/**
 * Generate a cryptographically random hexadecimal token.
 * @param {number} [bytes=32]
 * @returns {string}
 */
export function generateToken(bytes = 32) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}