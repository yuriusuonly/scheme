/**
 * @module external/_/helpers/html
 * Shared page layout — the HTML document skeleton used by server-rendered
 * pages.
 *
 * The core client runtime (`coreScript` from `./core.js`) is embedded inline in
 * the <head> as a <script type="module"> block, so every SPA page is
 * self-contained and makes no external resource requests aside from the
 * favicon.
 *
 * Global styles are NOT embedded here — the `container` layout component
 * (server/external/_/components/container) owns the base stylesheet and is
 * used to wrap page bodies. Each custom component additionally embeds its own
 * local <style> and <script type="module"> blocks (its own styles.js/scripts.js), so
 * a component carries exactly the styles and behaviour it needs.
 *
 * The core module script lives in the <head>; module scripts are deferred by
 * the browser, so they always run after the document has been parsed — and
 * before the component scripts embedded in the <body>.
 */

import { escapeHtml } from "./escape.js";
import { coreScript } from "./core.js";

/**
 * Wrap server-rendered page content in a full HTML document with the embedded
 * core client runtime.
 *
 * @param {object} opts
 * @param {string} opts.title        page <title>
 * @param {string} opts.body         server-rendered <body> content
 * @param {boolean} [opts.modules=true]  include the embedded core script in <head>
 * @param {string} [opts.bodyClass]  extra class(es) for the <body> element
 * @param {string} [opts.extraHead]  extra <head> content (e.g. meta tags)
 * @returns {string}
 */
export function pageLayout({ title, body, modules = true, bodyClass = "", extraHead = "" }) {
  const scriptBlock = modules
    ? `  <script type="module">\n${coreScript}\n  </script>\n`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
${scriptBlock}  ${extraHead}
</head>
<body${bodyClass ? ` class="${escapeHtml(bodyClass)}"` : ""}>
${body}
</body>
</html>`;
}