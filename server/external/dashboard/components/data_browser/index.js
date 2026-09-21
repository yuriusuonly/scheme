/**
 * @module dashboard/components/data_browser
 * data_browser — the database panes of the SQL training ground.
 *
 * The component renders as TWO pane fragments composed by the workspace:
 *   - dataBrowserTree — the left pane: a file-browser tree of every
 *     table/view with expandable column children and a row-count badge;
 *     clicking an item opens it as a tab on the right
 *   - dataBrowserTable — the right pane: the tab strip showing every open
 *     table and the panel rendering the active table's rows as an HTML table.
 *     SQL query results arrive inside a real table's tab (the matching table
 *     opens when the returned columns map exactly, otherwise the active tab's
 *     panel shows the result) — there is no separate "query result" tab.
 *
 * A table with zero rows opens as a normal tab whose column headers come from
 * PRAGMA — the panel just renders no body rows. Runtime SQL failures DO NOT
 * render here: they surface in the error strip below the SQL editor
 * (query_editor component).
 *
 * The tree pane embeds the component styles and the shared click/resize
 * script; the table pane is markup only (its styles and the tab-delegated
 * events come from the tree fragment). The server pre-renders the tree and —
 * when the caller passes an open table — its tab and data so the first paint
 * is meaningful; no tab is opened by default, so the initial tab strip is
 * empty (and therefore hidden by `.tab-strip:empty`) until the trainee picks a
 * table. The core runtime refreshes all of it from /api/schema + /api/data
 * after boot and on every `data:changed` SSE signal.
 */

import { escapeHtml } from "../../../_/helpers/escape.js";
import { dataBrowserCss } from "./styles.js";
import { dataBrowserScript } from "./scripts.js";

/**
 * Server-side copy of the client's file-browser tree markup (kept in sync with
 * the renderSchemaTree builder in server/external/_/helpers/core.js). The
 * table selected as `selectedTable` is highlighted and its column children are
 * expanded.
 */
function renderTreeMarkup(schema, selectedTable) {
  if (!schema || !schema.tables || !schema.tables.length) {
    return '<div class="schema-empty">No tables in the database.</div>';
  }
  return schema.tables
    .map((table) => {
      const expanded = table.name === selectedTable;
      const classes = ["tree-item"];
      if (expanded) classes.push("selected");
      const caret = expanded ? "▾" : "▸";
      const hidden = expanded ? "" : " hidden";
      const icon = table.type === "view" ? "◈" : "▦";
      let count = "";
      if (table.type === "table" && typeof table.rowCount === "number") {
        count = `<span class="tree-count" title="${escapeHtml(String(table.rowCount))} rows">${table.rowCount}</span>`;
      }
      const columns = table.columns
        .map(
          (column) =>
            `<div class="tree-column"><span class="tree-column-name">${escapeHtml(column.name)}</span>` +
            `<span class="tree-column-type">${escapeHtml(column.type || "")}</span></div>`
        )
        .join("");
      return `<div class="${classes.join(" ")}" data-table="${escapeHtml(table.name)}" title="Open ${escapeHtml(table.name)}">` +
        `<span class="tree-caret">${caret}</span>` +
        `<span class="tree-icon">${icon}</span>` +
        `<span class="tree-label">${escapeHtml(table.name)}</span>${count}</div>` +
        `<div class="tree-children"${hidden}>${columns}</div>`;
    })
    .join("");
}

/**
 * Server-side copy of the client's tab strip markup (kept in sync with the
 * renderTabs builder in server/external/_/helpers/core.js). The server renders
 * whatever tabs the caller passes (none for the initial "no table open"
 * paint — the core runtime adds and closes tabs as the trainee browses).
 */
function renderTabsMarkup(openTabs, activeTab) {
  return openTabs
    .map((name) => {
      const active = name === activeTab;
      const classes = ["tab"];
      if (active) classes.push("is-active");
      return `<button class="${classes.join(" ")}" role="tab" aria-selected="${active ? "true" : "false"}"` +
        ` data-tab="${escapeHtml(name)}" title="${escapeHtml(name)}">` +
        `<span class="tab-label">${escapeHtml(name)}</span>` +
        `<span class="tab-close" data-close="${escapeHtml(name)}" title="Close ${escapeHtml(name)}">×</span></button>`;
    })
    .join("");
}

/**
 * Server-side copy of the client's tab panel markup (kept in sync with the
 * renderTabPanel builder in server/external/_/helpers/core.js). Renders the
 * selected table's rows as an HTML table, or an empty prompt when no data
 * snapshot is available.
 */
function renderPanelMarkup(tableData) {
  if (!tableData || !tableData.columns || !tableData.columns.length) {
    return '<div class="data-empty">Select a table to view its rows.</div>';
  }
  return renderDataMarkup(tableData);
}

/**
 * Server-side copy of the client's data-table markup (kept in sync with the
 * buildTableData builder in server/external/_/helpers/core.js). Rendered
 * inside the active tab's panel.
 */
function renderDataMarkup(tableData) {
  const head = `<tr>${tableData.columns.map((column) => `<th>${escapeHtml(column.name)}</th>`).join("")}</tr>`;
  const body = tableData.rows.length
    ? tableData.rows
        .map((row) => `<tr>${tableData.columns.map((column) => `<td>${escapeHtml(formatCell(row[column.name]))}</td>`).join("")}</tr>`)
        .join("")
    : `<tr class="empty-row"><td colspan="${tableData.columns.length}">No rows</td></tr>`;
  return `<table class="data-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function formatCell(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Left pane — the file-browser table tree. Owns the component styles and the
 * click/resize script (which also delegates the tab events of the table pane).
 *
 * @param {object} opts
 * @param {Array<object>} [opts.schema=[]]         server-side structure snapshot
 * @param {string|null} [opts.selectedTable=null]  table shown expanded (none by default)
 * @returns {string}
 */
export function dataBrowserTree({ schema = [], selectedTable = null } = {}) {
  return `
<style>
${dataBrowserCss}
</style>
<section class="pane pane-browser" id="tree-pane">
  <div id="schema-tree" class="schema-tree" tabindex="-1" aria-label="Database tables">${renderTreeMarkup(schema, selectedTable)}</div>
</section>
<script type="module">
${dataBrowserScript}
</script>`;
}

/**
 * Right pane — the tabbed data view. Markup only: the component styles and the
 * event delegation come from the sibling `dataBrowserTree` fragment.
 *
 * @param {object} opts
 * @param {string|null} [opts.selectedTable=null]  table shown open + active (none by default)
 * @param {object|null} [opts.tableData=null]      server-side data snapshot for the selected table
 * @returns {string}
 */
export function dataBrowserTable({ selectedTable = null, tableData = null } = {}) {
  const openTabs = selectedTable ? [selectedTable] : [];
  return `
<section class="pane pane-table" id="table-pane">
  <div id="tab-strip" class="tab-strip" role="tablist">${renderTabsMarkup(openTabs, selectedTable)}</div>
  <div id="tab-panel" class="tab-panel" role="tabpanel">${renderPanelMarkup(tableData)}</div>
</section>`;
}