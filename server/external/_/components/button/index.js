/**
 * button — reusable UI element.
 *
 * Carries exactly its own concerns locally:
 *   - styles.js   → `.button`-family styles (embedded as its own <style> block)
 *   - scripts.js  → generic `[data-action]` click delegation that maps
 *                   `data-action="run-query" | toggle-tree | logout"`
 *                   onto `window.SchemeApp` methods
 *
 * Pages/cards that render buttons just pass `dataAction`; the click handling
 * is delegated once per page by the first mounted button script.
 */

import { escapeHtml } from "../../helpers/escape.js";
import { buttonCss } from "./styles.js";
import { buttonScript } from "./scripts.js";

/**
 * @param {object} opts
 * @param {string} [opts.id]
 * @param {string} [opts.type="button"]
 * @param {string} [opts.className="button"]
 * @param {string} [opts.title]
 * @param {string} [opts.style]
 * @param {string} [opts.dataAction]   generic action handled by scripts.js
 * @param {string} [opts.label]        plain-text label (escaped)
 * @param {string} [opts.labelHtml]    raw inner HTML (overrides label — used
 *                                     for icon buttons carrying inline SVG)
 * @returns {string}
 */
export function button({
  id = "",
  type = "button",
  className = "button",
  title = "",
  style = "",
  dataAction = "",
  label = "",
  labelHtml = "",
} = {}) {
  const attrs = [
    id && `id="${escapeHtml(id)}"`,
    `type="${escapeHtml(type)}"`,
    className && `class="${escapeHtml(className)}"`,
    title && `title="${escapeHtml(title)}"`,
    style && `style="${escapeHtml(style)}"`,
    dataAction && `data-action="${escapeHtml(dataAction)}"`,
  ]
    .filter(Boolean)
    .join(" ");
  const content = labelHtml || escapeHtml(label);
  return `<style>
${buttonCss}
</style>
<button ${attrs}>${content}</button>
<script type="module">
${buttonScript}
</script>`;
}