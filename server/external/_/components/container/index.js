/**
 * container — base layout component.
 *
 * A generic wrapper div that carries the app's base stylesheet (see
 * ./styles.js). Pages compose their custom components inside it so the reset,
 * CSS variables, and base typography are present wherever the markup is
 * served — every page stays self-contained.
 */

import { globalCss } from "./styles.js";

/**
 * @param {object} opts
 * @param {string} [opts.children=""]  raw HTML string to wrap
 * @param {string} [opts.className="container"]  wrapper class(es)
 * @returns {string}
 */
export function container({ children = "", className = "container" } = {}) {
  return `<style>
${globalCss}
</style>
<div class="${className}">${children}</div>`;
}