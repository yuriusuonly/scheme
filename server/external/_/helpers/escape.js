/**
 * @module external/_/helpers/escape
 * XSS-escaping helper used by every server-rendered component before
 * interpolating user-controlled or database-derived values into markup.
 *
 * @param {*} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}