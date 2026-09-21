/**
 * @module internal/security/hash_password
 * SHA-256 password hashing.
 *
 * Depends on nothing but the Web Crypto API on the Bun runtime, so the
 * persistence layer and the authentication service can both use it without
 * importing each other.
 */

const encoder = new TextEncoder();

/**
 * SHA-256 hash a plaintext string (hex digest).
 * @param {string} plaintext
 * @returns {Promise<string>}
 */
export async function hashPassword(plaintext) {
  const data = encoder.encode(plaintext);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}