/**
 * @module dashboard/components/query_editor
 * query_editor — the SQL editor pane of the SQL training ground.
 *
 * The bottom pane of the right vertical column — a full-featured SQL editor
 * rendered as a self-contained component:
 *   - a syntax-highlighted textarea (overlay <pre> + transparent textarea),
 *     including `*` and comparison operators
 *   - an LSP-lite completion dropdown (keywords, tables, columns) that opens
 *     BELOW the caret line so the text being typed stays visible
 *   - live diagnostics (unbalanced parens, unterminated strings/comments)
 *     surfaced in a small scrollable popup at the top-right of the editor —
 *     hidden while the code is clean
 *   - a runtime error strip above the toolbar
 *   - a toolbar with the shortcut hint on the left and the Clear + Run query
 *     buttons pinned to the right
 *   - Ctrl+Enter run, Tab indentation, Ctrl+Space completions
 *
 * The Run button reuses the shared `button` component (data-action
 * "run-query"); the editor's own script handles the LSP-lite behaviours.
 * The runtime error element is managed by the core runtime's
 * `setEditorError` helper so component inner scripts never own it.
 */

import { escapeHtml } from "../../../_/helpers/escape.js";
import { button } from "../../../_/components/button/index.js";
import { queryEditorCss } from "./styles.js";
import { queryEditorScript } from "./scripts.js";

/**
 * @param {object} opts
 * @param {string} [opts.initialSql=""]  prefilled statement shown on load
 * @returns {string}
 */
export function queryEditor({ initialSql = "" } = {}) {
  return `
<style>
${queryEditorCss}
</style>
<section class="pane pane-editor" id="editor-pane">
  <div class="editor-shell">
    <pre id="sql-highlight" class="sql-highlight" aria-hidden="true"></pre>
    <textarea id="sql-input" class="sql-input" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="SQL editor" placeholder="Write a SQL statement — e.g.&#10;SELECT * FROM users LIMIT 25&#10;&#10;Ctrl+Enter runs the query · Ctrl+Space completes">${escapeHtml(initialSql)}</textarea>
    <div id="editor-diagnostics" class="editor-diagnostics" hidden></div>
    <div id="sql-completions" class="sql-completions" hidden></div>
  </div>
  <div id="editor-error" class="editor-error" hidden></div>
  <div class="editor-toolbar">
    <span class="editor-shortcut">Ctrl+Enter run · Ctrl+Space complete</span>
    <button type="button" id="button-clear-editor" class="button button-ghost" title="Clear the editor">Clear</button>
    ${button({
      id: "button-run-query",
      dataAction: "run-query",
      label: "Run query",
      className: "button button-primary",
      title: "Run the query (Ctrl+Enter)",
    })}
  </div>
</section>
<script type="module">
${queryEditorScript}
</script>`;
}