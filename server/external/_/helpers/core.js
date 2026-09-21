/**
 * @module external/_/helpers/core
 * The core client runtime — a single embedded script string.
 *
 * The shared page layout (server/external/_/helpers/html.js) embeds `coreScript`
 * in a head <script type="module"> block on every SPA page. It exposes the
 * generic runtime as `window.SchemeApp` (state, IndexedDB pending-write outbox,
 * offline overlay, REST plumbing, schema/data rendering, SQL query execution,
 * authentication, SSE, toasts, shell hydration) and boots on its own.
 *
 * Because the host page imports this as a template-literal string, the
 * embedded script must not contain backticks or ${ — any dynamic markup is
 * built with string concatenation.
 *
 * Component-specific scripts are NOT centralised here — each custom component
 * keeps its own local scripts.js in its component directory and embeds its own
 * <script type="module"> block when rendered, sharing state with the core
 * runtime through `window.SchemeApp`. The head module executes before the body
 * modules (deferred module ordering), so `SchemeApp` is always available when
 * a component script runs.
 */

export const coreScript = `/**
 * Scheme core client runtime — SQL training ground.
 *
 * Embedded once in the document <head> by the shared page layout. Exposes
 * window.SchemeApp (state, IndexedDB pending-write outbox, offline overlay,
 * REST plumbing, schema + data rendering, SQL query execution, authentication,
 * SSE, toasts, shell hydration) used by every component script embedded in
 * <body>. Boots after DOM parse: hydrates the empty fallback shell (fetches
 * the server-rendered dashboard and re-instantiates the inline component
 * scripts), restores the session, loads the schema, and opens the SSE stream.
 * No table is opened by default — the tab strip stays empty until the trainee
 * picks one from the tree or runs a query. When the connection drops the
 * runtime shows a dedicated offline overlay that blocks every action, queues
 * in-flight SQL writes in the IndexedDB outbox, and flushes them on reconnect.
 */

"use strict";

var API = "/api";
var SSE_URL = API + "/events";
var IDB_NAME = "scheme";
var IDB_VERSION = 3;
var IDB_STORE = "outbox";

var authenticationToken = window.localStorage.getItem("scheme_token") || null;
var currentUser = null;
var eventSource = null;
// Id of the browser's own most recent mutation. Set BEFORE the POST is sent
// (each runQuery mints a clientRequestId that the server reuses as the
// mutation id), so the SSE echo is recognized as ours whether it arrives
// before or after the response.
var lastLocalMutationId = "";

var state = {
  schema: null,
  selectedTable: null,
  tableData: null,
  queryResult: null,
  resultViewActive: false,
  openTabs: [],
  expandedTables: {},
  treePaneCollapsed: false,
  offline: false,
  busy: false
};

// SQL keywords surfaced to the editor for highlighting and completions.
// Aligned with the SQLite dialect — the sandbox executes SQL exactly as
// written, so MySQL-isms (TRUNCATE, SHOW, DESCRIBE, USE, AUTO_INCREMENT, …)
// are deliberately absent: they would compile-time fail in the engine.
var KEYWORDS = [
  "ADD", "AFTER", "ALL", "ALTER", "ANALYZE", "AND", "AS", "ASC", "ATTACH",
  "AUTOINCREMENT", "AVG", "BEGIN", "BETWEEN", "BY", "CASCADE", "CASE",
  "CAST", "CHECK", "COLLATE", "COLUMN", "COMMIT", "CONFLICT", "CONSTRAINT",
  "COUNT", "CREATE", "CROSS", "CURRENT", "DATABASE", "DEFAULT",
  "DEFERRABLE", "DELETE", "DESC", "DETACH", "DISTINCT", "DO", "DROP", "ELSE",
  "END", "ESCAPE", "EXCEPT", "EXCLUDE", "EXCLUDED", "EXISTS", "EXPLAIN",
  "FAIL", "FILTER", "FOREIGN", "FROM", "FULL", "FUNCTION", "GLOB", "GROUP",
  "GROUP_CONCAT", "HAVING", "IF", "IGNORE", "IN", "INDEX", "INDEXED",
  "INITIALLY", "INNER", "INSERT", "INSTEAD", "INTERSECT", "INTO", "IS",
  "ISNULL", "JOIN", "KEY", "LAST", "LEFT", "LIKE", "LIMIT", "MATCH", "MAX",
  "MIN", "NATURAL", "NO", "NOT", "NOTHING", "NOTNULL", "NULL", "NULLS", "OF",
  "OFFSET", "ON", "OR", "ORDER", "OUTER", "OVER", "PARTITION", "PLAN",
  "PRAGMA", "PRECEDING", "PRIMARY", "QUERY", "RAISE", "RANGE", "RECURSIVE",
  "REFERENCES", "REINDEX", "RELEASE", "RENAME", "REPLACE", "RESTRICT",
  "RETURNING", "RIGHT", "ROLLBACK", "ROW", "ROWS", "SAVEPOINT", "SELECT",
  "SET", "SUM", "TABLE", "THEN", "TIES", "TO", "TRANSACTION", "TRIGGER",
  "UNBOUNDED", "UNION", "UNIQUE", "UPDATE", "USING", "VACUUM", "VALUES",
  "VIEW", "VIRTUAL", "WHEN", "WHERE", "WINDOW", "WITH", "WITHOUT"
];

// ---------------------------------------------------------------------------
// Session cookie — the "scheme_token" cookie mirrors the localStorage token so
// server-rendered pages (e.g. /dashboard) recognise the session immediately.
// ---------------------------------------------------------------------------

function setSessionCookie(token) {
  var maxAge = 86400;
  document.cookie = "scheme_token=" + encodeURIComponent(token) +
    "; path=/; max-age=" + maxAge + "; SameSite=Lax";
}

function clearSessionCookie() {
  document.cookie = "scheme_token=; path=/; max-age=0; SameSite=Lax";
}

// ---------------------------------------------------------------------------
// Tiny event bus — lets components react without importing each other
// ---------------------------------------------------------------------------

var bus = {
  handlers: {},
  on: function (name, fn) {
    (this.handlers[name] = this.handlers[name] || []).push(fn);
  },
  emit: function (name, detail) {
    var list = this.handlers[name] || [];
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](detail);
      } catch (error) {
        console.error("[scheme] bus " + name, error);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// IndexedDB — pending-write outbox, FIFO.
//
// The client never caches server data (schema, table snapshots): the server
// is the single source of truth and reads fail loudly when the network drops
// so the offline overlay takes over. The only thing stored locally is the
// queue of SQL mutations that failed to reach the server while offline; each
// entry is deleted as soon as the server confirms the write.
// ---------------------------------------------------------------------------

function openIDB() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = function (event) {
      var database = event.target.result;
      // The legacy v2 "cache" store held the retired dataset cache — delete it
      // so old cached rows from earlier sessions are dropped with the cache.
      if (database.objectStoreNames.contains("cache")) {
        database.deleteObjectStore("cache");
      }
      if (!database.objectStoreNames.contains(IDB_STORE)) {
        database.createObjectStore(IDB_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = function (event) { resolve(event.target.result); };
    request.onerror = function (event) { reject(event.target.error); };
  });
}

function idbPut(entry) {
  return openIDB().then(function (database) {
    return new Promise(function (resolve, reject) {
      var transaction = database.transaction(IDB_STORE, "readwrite");
      transaction.objectStore(IDB_STORE).put(entry);
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function (event) { reject(event.target.error); };
    });
  });
}

function idbDelete(id) {
  return openIDB().then(function (database) {
    return new Promise(function (resolve, reject) {
      var transaction = database.transaction(IDB_STORE, "readwrite");
      transaction.objectStore(IDB_STORE).delete(id);
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror = function (event) { reject(event.target.error); };
    });
  });
}

function idbGetAllPending() {
  return openIDB().then(function (database) {
    return new Promise(function (resolve, reject) {
      var transaction = database.transaction(IDB_STORE, "readonly");
      var request = transaction.objectStore(IDB_STORE).getAll();
      request.onsuccess = function () {
        // Auto-increment ids are monotonic — re-sort so the oldest write is
        // flushed first.
        var entries = request.result || [];
        entries.sort(function (left, right) { return left.id - right.id; });
        resolve(entries);
      };
      request.onerror = function (event) { reject(event.target.error); };
    });
  });
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function authenticationHeaders() {
  var headers = { "Content-Type": "application/json" };
  if (authenticationToken) headers["Authorization"] = "Bearer " + authenticationToken;
  return headers;
}

async function checkedJson(response) {
  if (response.status === 401) throw new Error("unauthorized");
  var data = await response.json();
  if (!response.ok) {
    var error = new Error(data.error || "Request failed");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function apiGet(path) {
  return checkedJson(await fetch(API + path, { headers: authenticationHeaders() }));
}

async function apiPost(path, body) {
  return checkedJson(await fetch(API + path, {
    method: "POST",
    headers: authenticationHeaders(),
    body: JSON.stringify(body || {})
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHTML(value) {
  var element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

function formatCell(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

// ---------------------------------------------------------------------------
// Rendering — file-browser table tree + tabbed data views (kept in sync with
// the server-side builders in
// server/external/dashboard/components/data_browser/index.js). The database
// pane splits horizontally: the left file tree lists every table/view, each
// with expandable column children; selecting one opens it as a tab on the
// right where its rows render as an HTML table. SQL query results render
// inside a real table's tab — when the returned columns exactly match a table
// that table opens (and its tab shows the result), otherwise the result view
// replaces the active tab's panel content; there is no separate "query
// result" tab. Runtime SQL failures render in the error strip below the SQL
// editor.
// ---------------------------------------------------------------------------

function activeTableName() {
  return state.selectedTable;
}

function treeItemMarkup(table, selected) {
  var classes = "tree-item";
  var caret = "▸";
  var hidden = " hidden";
  if (selected || state.expandedTables[table.name]) {
    classes += " selected";
    caret = "▾";
    hidden = "";
  }
  var icon = table.type === "view" ? "◈" : "▦";
  var count = "";
  if (table.type === "table" && typeof table.rowCount === "number") {
    count = '<span class="tree-count" title="' + escapeHTML(table.rowCount + " rows") + '">' + table.rowCount + "</span>";
  }
  var columns = "";
  for (var columnIndex = 0; columnIndex < table.columns.length; columnIndex++) {
    var column = table.columns[columnIndex];
    columns += '<div class="tree-column"><span class="tree-column-name">' +
      escapeHTML(column.name) + "</span>" +
      '<span class="tree-column-type">' + escapeHTML(column.type || "") + "</span></div>";
  }
  return '<div class="' + classes + '" data-table="' + escapeHTML(table.name) + '" title="Open ' + escapeHTML(table.name) + '">' +
    '<span class="tree-caret">' + caret + "</span>" +
    '<span class="tree-icon">' + icon + "</span>" +
    '<span class="tree-label">' + escapeHTML(table.name) + "</span>" + count + "</div>" +
    '<div class="tree-children"' + hidden + ">" + columns + "</div>";
}

function renderSchemaTree() {
  var tree = document.getElementById("schema-tree");
  if (!tree) return;
  var schema = state.schema;
  if (!schema || !schema.tables || !schema.tables.length) {
    tree.innerHTML = '<div class="schema-empty">No tables in the database.</div>';
    return;
  }
  var html = "";
  for (var index = 0; index < schema.tables.length; index++) {
    html += treeItemMarkup(schema.tables[index], schema.tables[index].name === activeTableName());
  }
  tree.innerHTML = html;
}

function tabMarkup(name, active) {
  var classes = "tab";
  if (active) classes += " is-active";
  return '<button class="' + classes + '" role="tab" aria-selected="' + (active ? "true" : "false") + '"' +
    ' data-tab="' + escapeHTML(name) + '" title="' + escapeHTML(name) + '">' +
    '<span class="tab-label">' + escapeHTML(name) + "</span>" +
    '<span class="tab-close" data-close="' + escapeHTML(name) + '" title="Close ' + escapeHTML(name) + '">×</span></button>';
}

// Renders one tab per open table. An empty strip gets no children, which the
// stylesheet collapses with '.tab-strip:empty' so the table pane shows only its
// panel prompt ("Select a table to view its rows.") until a table is opened.
function renderTabs() {
  var strip = document.getElementById("tab-strip");
  if (!strip) return;
  var active = activeTableName();
  var html = "";
  for (var index = 0; index < state.openTabs.length; index++) {
    html += tabMarkup(state.openTabs[index], active === state.openTabs[index]);
  }
  strip.innerHTML = html;
}

function renderTabPanel() {
  var panel = document.getElementById("tab-panel");
  if (!panel) return;
  if (state.queryResult && state.resultViewActive) {
    panel.innerHTML = queryResultMarkup();
    return;
  }
  panel.innerHTML = state.tableData ? buildTableData(state.tableData) :
    '<div class="data-empty">Select a table to view its rows.</div>';
}

function renderDatabase() {
  renderSchemaTree();
  renderTabs();
  renderTabPanel();
  refreshStatusbar();
  applyTreePaneCollapsed();
}

// Footer status bar — the bottom readout is the single writer for
// #table-count, replacing the per-panel '.data-summary' rows. It describes
// real table snapshots, SQL query results, and the empty state alike, so the
// same markup serves every render path without duplicating summary HTML.
function refreshStatusbar() {
  var element = document.getElementById("table-count");
  if (!element) return;
  if (state.queryResult && state.resultViewActive) {
    element.textContent = state.queryResult.statement + " · " +
      state.queryResult.rows.length + " row(s) returned · " +
      state.queryResult.durationMs + "ms";
    return;
  }
  if (state.tableData) {
    element.textContent = state.tableData.table + " · " +
      state.tableData.rowCount + " total · showing " + state.tableData.limit;
    return;
  }
  if (state.selectedTable) {
    element.textContent = state.selectedTable;
    return;
  }
  element.textContent = "No table selected";
}

function updateTableCount(table, total) {
  var element = document.getElementById("table-count");
  if (!element) return;
  element.textContent = table + " · " + total + " rows";
}

function updateLastSynchronization() {
  var element = document.getElementById("last-synchronization");
  if (!element) return;
  element.textContent = "Last synchronization: " + new Date().toLocaleTimeString();
}

// Completing any data exchange (schema/table load, query run, SSE-synced
// mutation) stamps the last-synchronization readout through the bus.
function markSynchronized() {
  bus.emit("scheme:synchronized", { time: Date.now() });
}

// ---------------------------------------------------------------------------
// Layout persistence — the resizable pane sizes (tree width, editor height)
// and the tree-collapse state survive reloads in localStorage.
// The temporary IndexedDB cache holds table snapshots; layout is per-browser
// UI state, so localStorage is the natural home. Values are re-clamped against
// the actual window on every load, so a pane sized on a desktop can never
// overflow a smaller screen.
// ---------------------------------------------------------------------------

var LAYOUT_KEY = "scheme_layout";
var LAYOUT_MIN_PANE_SIZE = 36;

function readLayoutState() {
  var raw = window.localStorage.getItem(LAYOUT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (ignored) {
    return null;
  }
}

function writeLayoutState(data) {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
  } catch (ignored) {
    // localStorage can be unavailable (private mode, full storage) — a missed
    // layout save is acceptable; the draft layout simply does not persist.
  }
}

// Called when a pane drag ends or the tree toggle fires, so the dragged size
// (or the new collapsed state) becomes the next load's starting point. Only
// sizes above the snap threshold are recorded — a drag-snapped 0px (a stowed
// pane next to a dangling handle) is not a state worth restoring; the
// tree-collapse flag is the sanctioned way to hide the tree.
function saveLayout() {
  var workspace = document.querySelector(".workspace");
  var browserPane = document.querySelector(".pane-browser");
  var editorPane = document.querySelector(".pane-editor");
  var data = { savedAt: Date.now() };
  if (browserPane && browserPane.style.width) {
    var width = parseInt(browserPane.style.width, 10);
    if (!isNaN(width) && width >= LAYOUT_MIN_PANE_SIZE) data.treePaneWidth = width;
  }
  if (editorPane && editorPane.style.flex) {
    var flexParts = editorPane.style.flex.split(" ");
    var height = parseInt(flexParts[flexParts.length - 1], 10);
    if (!isNaN(height) && height >= LAYOUT_MIN_PANE_SIZE) data.editorPaneHeight = height;
  }
  data.treePaneCollapsed = !!state.treePaneCollapsed;
  writeLayoutState(data);
}

// Restore the saved layout once the dashboard shell is in the DOM. Values are
// re-clamped against the current window here (a tree width saved on a desktop
// must shrink on a laptop, never overflow a phone). Because the layout is a
// row at every screen size, the same clamp applies everywhere — there is no
// smaller breakpoint to reconcile. Runs before the schema fetch, so the first
// render already carries the restored collapse class and pane sizes.
function applyLayout() {
  var saved = readLayoutState();
  if (!saved) return;
  var workspace = document.querySelector(".workspace");
  var browserPane = document.querySelector(".pane-browser");
  var editorPane = document.querySelector(".pane-editor");
  if (saved.treePaneCollapsed) state.treePaneCollapsed = true;
  if (saved.treePaneWidth && browserPane && workspace) {
    var workspaceWidth = Math.round(workspace.getBoundingClientRect().width);
    var maxTreeWidth = Math.max(LAYOUT_MIN_PANE_SIZE, workspaceWidth - 42);
    browserPane.style.width = Math.min(saved.treePaneWidth, maxTreeWidth) + "px";
  }
  if (saved.editorPaneHeight && editorPane) {
    var vertical = document.querySelector(".workspace-vertical");
    if (vertical) {
      var columnHeight = Math.round(vertical.getBoundingClientRect().height);
      var maxEditorHeight = Math.max(LAYOUT_MIN_PANE_SIZE, columnHeight - 18);
      editorPane.style.flex = "0 0 " + Math.min(saved.editorPaneHeight, maxEditorHeight) + "px";
      editorPane.classList.remove("is-snapping");
    }
  }
  applyTreePaneCollapsed();
}

// The topbar's left nav button toggles the file-browser tree on any screen
// size. The toggle collapses/expands the tree pane ('treePaneCollapsed' -> the
// '.workspace.tree-collapsed' class) and animates the slide: the
// '.pane-browser.is-snapping' width transition (the same one the drag-snap
// uses) slides the tree shut or back open while the vertical column glides to
// the full pane width. The class lives on ".workspace" (the layout container,
// which owns the tree pane), so it survives every innerHTML re-render and
// applying it on every render keeps the visual state in sync with the core
// state.
function applyTreePaneCollapsed() {
  var workspace = document.querySelector(".workspace");
  if (!workspace) return;
  workspace.classList.toggle("tree-collapsed", state.treePaneCollapsed);
}

function toggleTreePane() {
  state.treePaneCollapsed = !state.treePaneCollapsed;
  var browserPane = document.querySelector(".pane-browser");
  // The toggle animates at every screen size: the '.pane-browser.is-snapping'
  // width transition (the same one the drag-snap uses) slides the tree shut or
  // back open on any viewport — there is no separate small-screen layout, so
  // one animation path serves all widths. The class is dropped once the 180ms
  // transition has settled.
  if (browserPane) {
    browserPane.classList.add("is-snapping");
    window.setTimeout(function () {
      if (browserPane) browserPane.classList.remove("is-snapping");
    }, 200);
  }
  // Expanding after a collapse only clears a drag-snapped width of 0 — that
  // hidden zero-state would otherwise stay stuck next to an empty handle. A
  // stored width (dragged, or restored from a persisted layout) survives the
  // toggle cycle instead of resetting to the default 224px.
  if (!state.treePaneCollapsed) {
    if (browserPane && browserPane.style.width) {
      var currentWidth = parseInt(browserPane.style.width, 10);
      if (isNaN(currentWidth) || currentWidth === 0) browserPane.style.width = "";
    }
  }
  applyTreePaneCollapsed();
  saveLayout();
}

function queryResultMarkup() {
  var result = state.queryResult;
  return buildTable(result.columns, result.rows);
}

function buildTable(columns, rows) {
  var names = [];
  var columnIndex;
  for (columnIndex = 0; columnIndex < columns.length; columnIndex++) {
    var column = columns[columnIndex];
    names.push(typeof column === "string" ? column : column.name);
  }

  var header = "<tr>";
  for (columnIndex = 0; columnIndex < names.length; columnIndex++) {
    header += "<th>" + escapeHTML(names[columnIndex]) + "</th>";
  }
  header += "</tr>";

  var bodyRows;
  if (!rows || rows.length === 0) {
    bodyRows = '<tr class="empty-row"><td colspan="' + names.length + '">No rows returned</td></tr>';
  } else {
    bodyRows = "";
    for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      var row = rows[rowIndex];
      bodyRows += "<tr>";
      for (columnIndex = 0; columnIndex < names.length; columnIndex++) {
        bodyRows += "<td>" + escapeHTML(formatCell(row[names[columnIndex]])) + "</td>";
      }
      bodyRows += "</tr>";
    }
  }
  return '<table class="data-table"><thead>' + header + "</thead><tbody>" + bodyRows + "</tbody></table>";
}

function buildTableData(data) {
  return buildTable(data.columns, data.rows);
}

function updateTableData() {
  // The active tab's panel owns its selected table's rows — re-render the
  // whole database view so the tree, tabs, panel, and statusbar stay in sync.
  renderDatabase();
}

// Runtime SQL failures render in the error strip below the editor, not in the
// data browser pane — the pane stays focused on schema + table data.
function setEditorError(message) {
  var element = document.getElementById("editor-error");
  if (!element) return;
  if (message) {
    element.hidden = false;
    element.textContent = message;
  } else {
    element.hidden = true;
    element.textContent = "";
  }
}

function clearQueryError() {
  state.queryError = null;
  setEditorError(null);
}

// When the returned columns exactly match one table's column set, the result
// is rendered inside that real table's tab; ambiguity (or no match) means the
// result view replaces the active tab's panel content instead.
function findQueryTable(columns) {
  var schema = state.schema;
  if (!schema || !schema.tables || !columns || !columns.length) return null;
  var names = [];
  for (var index = 0; index < columns.length; index++) {
    names.push(typeof columns[index] === "string" ? columns[index] : columns[index].name);
  }
  var matches = [];
  for (var tableIndex = 0; tableIndex < schema.tables.length; tableIndex++) {
    var table = schema.tables[tableIndex];
    var tableColumns = table.columns || [];
    if (tableColumns.length !== names.length) continue;
    var allMatch = true;
    for (var columnIndex = 0; columnIndex < names.length; columnIndex++) {
      var found = false;
      for (var tableColumnIndex = 0; tableColumnIndex < tableColumns.length; tableColumnIndex++) {
        if (tableColumns[tableColumnIndex].name === names[columnIndex]) {
          found = true;
          break;
        }
      }
      if (!found) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) matches.push(table.name);
  }
  return matches.length === 1 ? matches[0] : null;
}

function renderQueryResult(result) {
  state.queryResult = (result && result.kind === "results") ? result : null;
  state.queryError = null;
  setEditorError(null);
  if (state.queryResult) {
    // Results live inside a real table's tab — open the matching table when
    // the columns map exactly, otherwise keep the active tab.
    var mapped = findQueryTable(state.queryResult.columns);
    if (mapped) {
      addOpenTab(mapped);
      state.selectedTable = mapped;
    }
    state.resultViewActive = true;
  }
  renderDatabase();
}

function renderQueryError(message) {
  state.queryResult = null;
  state.resultViewActive = false;
  state.queryError = message;
  setEditorError(message);
  renderDatabase();
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadSchema() {
  var data;
  try {
    data = await apiGet("/schema");
  } catch (error) {
    if (error.message === "unauthorized") { redirectToLogin(); return; }
    if (isNetworkFailure(error)) {
      // Offline — no client-side cache exists, so the dedicated offline
      // overlay takes over; reconnecting retries the load.
      setOnlineStatus("offline");
      return;
    }
    showToast("Failed to load schema", "error");
    return;
  }
  state.schema = data;
  renderDatabase();
  setOnlineStatus("online");
  markSynchronized();
}

async function loadTable(tableName, openTab) {
  var name = tableName || state.selectedTable;
  if (!name) {
    renderDatabase();
    return;
  }
  state.selectedTable = name;
  // A table view supersedes the last query's result view.
  state.queryResult = null;
  state.resultViewActive = false;
  state.queryError = null;
  setEditorError(null);
  if (openTab !== false) addOpenTab(name);
  var data;
  try {
    data = await apiGet("/data/" + encodeURIComponent(name));
  } catch (error) {
    if (error.message === "unauthorized") { redirectToLogin(); return; }
    if (isNetworkFailure(error)) {
      // Offline — no table cache exists, so the offline overlay takes over.
      setOnlineStatus("offline");
      return;
    }
    showToast("Failed to load table " + name, "error");
    return;
  }
  state.tableData = data;
  renderDatabase();
  setOnlineStatus("online");
  markSynchronized();
}

function addOpenTab(name) {
  if (!name) return;
  if (state.openTabs.indexOf(name) !== -1) return;
  state.openTabs.push(name);
}

function selectTableAt(name) {
  if (!name) return;
  state.selectedTable = name;
  state.queryResult = null;
  state.resultViewActive = false;
  state.queryError = null;
  setEditorError(null);
  state.tableData = null;
  renderDatabase();
  loadTable(name);
}

function selectTable(tableName) {
  // Explicit browsing supersedes the last query's result view.
  state.queryResult = null;
  state.resultViewActive = false;
  state.queryError = null;
  setEditorError(null);
  loadTable(tableName);
}

function closeTableTab(name) {
  var index = state.openTabs.indexOf(name);
  if (index === -1) return;
  state.openTabs.splice(index, 1);
  if (state.selectedTable === name) {
    var neighbor = state.openTabs[Math.max(0, index - 1)];
    if (neighbor) {
      selectTableAt(neighbor);
    } else {
      // The very last table tab may be closed too — leave the browser empty
      // until the trainee picks another table from the tree.
      state.selectedTable = null;
      state.tableData = null;
      state.queryResult = null;
      state.resultViewActive = false;
      state.queryError = null;
      setEditorError(null);
      renderDatabase();
    }
  } else {
    renderDatabase();
  }
}

function refreshTableTab(name) {
  return apiGet("/data/" + encodeURIComponent(name)).then(function (data) {
    updateSchemaCount(name, data.rowCount);
    if (state.selectedTable === name) {
      state.tableData = data;
      renderDatabase();
    } else {
      // The tree was re-rendered by loadSchema already; patch the badge count
      // from the fresh table read so an unselected tab stays accurate too.
      renderSchemaTree();
    }
  }).catch(function (error) {
    if (error.message === "unauthorized") { redirectToLogin(); return; }
    // The table may have been dropped (or renamed) by the mutation — a 404
    // means it no longer exists, so close its dead tab. Any other failure
    // leaves the current rows on screen and the next reload retries the table
    // naturally.
    if (error.status === 404 && state.openTabs.indexOf(name) !== -1) {
      closeTableTab(name);
    }
  });
}

function normalizeMutationScope(source) {
  var scope = { affectedTables: [], schemaChanged: false, allTables: false };
  if (source) {
    scope.affectedTables = Array.isArray(source.affectedTables) ? source.affectedTables : [];
    scope.schemaChanged = Boolean(source.schemaChanged);
    scope.allTables = Boolean(source.allTables);
  }
  return scope;
}

function updateSchemaCount(name, count) {
  if (!state.schema || typeof count !== "number") return;
  var tables = state.schema.tables || [];
  for (var index = 0; index < tables.length; index++) {
    if (tables[index].name === name) {
      tables[index].rowCount = count;
      return;
    }
  }
}

function toggleTreeTable(name) {
  if (state.expandedTables[name]) {
    delete state.expandedTables[name];
  } else {
    state.expandedTables[name] = true;
  }
  renderSchemaTree();
}

function activateTab(name) {
  if (state.openTabs.indexOf(name) !== -1) {
    selectTableAt(name);
  }
}

function closeTab(name) {
  closeTableTab(name);
}

// ---------------------------------------------------------------------------
// SQL query execution
// ---------------------------------------------------------------------------

function runQueryFromEditor() {
  var input = document.getElementById("sql-input");
  runQuery(input ? input.value : "");
}

function runQuery(sql) {
  if (state.busy) return;
  if (state.offline) {
    // The offline overlay blocks the UI — this guard covers keyboard paths
    // (Ctrl+Enter) so no new work can start while the connection is down.
    showToast("You are offline — reconnecting", "info");
    return;
  }
  if (!sql || !sql.trim()) {
    showToast("Write a SQL statement first", "info");
    return;
  }
  state.busy = true;

  // Mint the client request id up front: the server re-uses it as the
  // mutation id, so lastLocalMutationId is already populated when the echo
  // arrives — even on a loopback where the broadcast beats the response.
  var clientRequestId = "req-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  lastLocalMutationId = clientRequestId;

  apiPost("/queries", { sql: sql, clientId: clientRequestId }).then(function (result) {
    state.busy = false;
    renderQueryResult(result);
    setOnlineStatus("online");
    markSynchronized();
    if (result.kind === "changes") {
      // Own mutations do not need the SSE echo: lastLocalMutationId was set
      // before the POST, so the identical-id echo is skipped in
      // handleSSEBroadcast. The refresh below uses the authoritative response
      // scope (result.affectedTables / result.schemaChanged / result.allTables).
      lastLocalMutationId = String(result.mutationId || clientRequestId);
      showToast(result.statement + " — " + result.changes + " row(s) affected", "success");
      refreshAfterMutation(result);
    }
  }).catch(function (error) {
    state.busy = false;
    if (error.message === "unauthorized") { redirectToLogin(); return; }
    if (isNetworkFailure(error) && isMutationStatement(sql)) {
      // The server is unreachable (network failure / 5xx) and the statement
      // would have written — queue it in the IndexedDB outbox and bring up the
      // offline overlay so no further actions run until it has synced. The
      // overlay itself is the message: no toast is needed here.
      enqueuePendingWrite(sql);
      setOnlineStatus("offline");
      return;
    }
    renderQueryError(error.message);
  });
}

async function refreshAfterMutation(source) {
  var scope = normalizeMutationScope(source || {});
  try {
    await loadSchema();
  } catch (ignored) { /* schema refresh best-effort */ }
  // The result view is stale after a mutation — drop it and refresh only the
  // open tabs whose tables the statement actually touched (or all of them
  // when the scope is unknown/conservative — \`allTables\`). The schema
  // re-read above keeps every tree row-count badge accurate; the per-tab
  // refetch below replaces the heavyweight all-tabs refetch from before.
  state.queryResult = null;
  state.resultViewActive = false;
  state.queryError = null;
  setEditorError(null);
  var list = state.openTabs.slice();
  for (var index = 0; index < list.length; index++) {
    var name = list[index];
    if (scope.allTables || scope.affectedTables.indexOf(name) !== -1) {
      refreshTableTab(name);
    }
  }
  markSynchronized();
  // The reload is complete — now consume any audit entries this client has
  // not yet acknowledged so the backend can stamp \`synchronized_at\` for real.
  // Best-effort: an acknowledge failure must never fail the reload itself.
  acknowledgePendingEntries();
}

/**
 * Consume the synchronization audit trail.
 *
 * Every SQL mutation is appends an audit row to \`synchronizations\` with
 * \`synchronized_at\` left NULL (pending). The server can only stamp that
 * column when a client tells it the entry has been consumed — that's the
 * pending/acknowledge handshake:
 *
 *   1. \`GET /api/synchronization/pending\`    → entries with \`synchronized_at: null\`
 *   2. \`POST /api/synchronization/acknowledge\` → \`{ ids: [...] }\` for each one
 *                                                this client is now consuming
 *
 * Called after every successful reload that follows a mutation — both for the
 * acting client's own mutations (which flow back through the SSE echo) and
 * for mutations broadcast by other clients. The acting client learns its own
 * row ids from the pending list and acknowledges them, stamping
 * \`synchronized_at\` so the audit trail records a real synchronization time.
 */
async function acknowledgePendingEntries() {
  var pending;
  try {
    pending = await apiGet("/synchronization/pending");
  } catch (ignored) { return; }  // Best-effort — never block the reload.
  if (!pending || !pending.entries || !pending.entries.length) return;
  var ids = [];
  for (var index = 0; index < pending.entries.length; index++) {
    if (pending.entries[index].id != null) ids.push(pending.entries[index].id);
  }
  if (!ids.length) return;
  try {
    await apiPost("/synchronization/acknowledge", { ids: ids });
  } catch (ignored) { return; }  // Next reload retries naturally.
  updateLastSynchronization();
}

// ---------------------------------------------------------------------------
// Offline mode — pending-write outbox + dedicated offline overlay
// ---------------------------------------------------------------------------

function isNetworkFailure(error) {
  // Fetch rejects without a Response for network failures, while HTTP errors
  // carry a .status set by checkedJson; any 5xx also means the server cannot
  // receive writes right now.
  return !error || !error.status || error.status >= 500;
}

function isMutationStatement(sql) {
  var first = String(sql || "").replace(/^\\s+/, "").split(/\\s|\\(/)[0].toUpperCase();
  return first !== "SELECT" && first !== "VALUES" && first !== "WITH" && first !== "EXPLAIN";
}

function enqueuePendingWrite(sql) {
  // FIFO via the auto-increment id; createdAt is informational only — every
  // flush retries the whole queue.
  return idbPut({ sql: sql, createdAt: new Date().toISOString() });
}

function refreshOfflinePending() {
  var line = document.getElementById("offline-pending");
  if (!line) return;
  idbGetAllPending().then(function (entries) {
    var count = entries ? entries.length : 0;
    if (count) {
      line.hidden = false;
      line.textContent = count + (count === 1 ? " statement" : " statements") + " waiting to sync";
    } else {
      line.hidden = true;
    }
  }).catch(function () { line.hidden = true; });
}

function showOfflineOverlay() {
  var overlay = document.getElementById("offline-overlay");
  if (!overlay) return;
  overlay.hidden = false;
  refreshOfflinePending();
}

function hideOfflineOverlay() {
  var overlay = document.getElementById("offline-overlay");
  if (overlay) overlay.hidden = true;
}

async function flushPendingWrites() {
  var entries;
  try {
    entries = await idbGetAllPending();
  } catch (ignored) { return; }
  if (!entries || !entries.length) return;

  for (var index = 0; index < entries.length; index++) {
    var entry = entries[index];
    // Mint a client id per queued statement so the SSE echo for this write is
    // skipped exactly like a live query — the response refresh is the
    // authoritative re-read for it.
    var clientRequestId = "req-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    lastLocalMutationId = clientRequestId;
    var result;
    try {
      result = await apiPost("/queries", { sql: entry.sql, clientId: clientRequestId });
    } catch (error) {
      if (error.message === "unauthorized") { redirectToLogin(); return; }
      if (isNetworkFailure(error)) {
        // Still unreachable — stop the flush; the next reconnect retries.
        setOnlineStatus("offline");
        return;
      }
      // Poisoned entry: the statement now fails as an engine/HTTP error (e.g.
      // its table was dropped while offline). Drop it, surface the rejection
      // in the editor error strip, and keep flushing — one bad statement must
      // never block the whole queue.
      try { await idbDelete(entry.id); } catch (ignored) { /* best-effort */ }
      setEditorError(entry.sql + " — " + error.message);
      continue;
    }
    try { await idbDelete(entry.id); } catch (ignored) { /* best-effort */ }
    if (result && result.kind === "changes") {
      lastLocalMutationId = String(result.mutationId || clientRequestId);
      showToast(entry.sql + " — " + result.changes + " row(s) affected", "success");
      refreshAfterMutation(result);
    } else if (result) {
      renderQueryResult(result);
    }
    markSynchronized();
  }
  refreshOfflinePending();
}

async function handleConnected() {
  // Probe the server before clearing the overlay — an open EventSource alone
  // does not prove write connectivity, and an offline boot must not hide the
  // overlay prematurely (there is no client cache to fall back on).
  var healthy = true;
  try {
    await apiGet("/health");
  } catch (error) {
    if (error.message === "unauthorized") { redirectToLogin(); return; }
    healthy = false;
  }
  if (!healthy) {
    setOnlineStatus("offline");
    return;
  }
  setOnlineStatus("online");
  // An offline boot may never have fetched the schema — re-read it before the
  // flush so the dashboard behind the overlay is fresh once it clears.
  if (!state.schema) {
    try { await loadSchema(); } catch (ignored) { /* best-effort */ }
  }
  await flushPendingWrites();
  if (!state.offline) {
    // The overlay is hidden only after every pending write has synced — the
    // flush above reports failures by flipping the offline state again.
    hideOfflineOverlay();
    updateLastSynchronization();
    markSynchronized();
  }
}

// ---------------------------------------------------------------------------
// Completions — keywords + public tables + their columns
// ---------------------------------------------------------------------------

function completionCandidates() {
  var words = {};
  var index;
  for (index = 0; index < KEYWORDS.length; index++) words[KEYWORDS[index]] = true;
  var schema = state.schema;
  if (schema && schema.tables) {
    for (index = 0; index < schema.tables.length; index++) {
      var table = schema.tables[index];
      words[table.name] = true;
      if (table.name === state.selectedTable) {
        for (var columnIndex = 0; columnIndex < table.columns.length; columnIndex++) {
          words[table.columns[columnIndex].name] = true;
        }
      }
    }
  }
  return Object.keys(words).sort();
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

function redirectToLogin() {
  authenticationToken = null;
  currentUser = null;
  window.localStorage.removeItem("scheme_token");
  clearSessionCookie();
  window.location.href = "/login";
}

async function tryAutoLogin() {
  if (!authenticationToken) return false;
  try {
    var data = await apiGet("/authentication/me");
    if (data.user) {
      currentUser = data.user;
      setSessionCookie(authenticationToken);
      updateUIForUser();
      return true;
    }
  } catch (error) {
    if (isNetworkFailure(error)) {
      // Network unreachable — do not wipe the session. Proceed into the
      // dashboard so the offline overlay can take over; the connection is
      // retried on reconnect and any stale session revalidates then.
      return true;
    }
    // Token invalid or expired
    authenticationToken = null;
    window.localStorage.removeItem("scheme_token");
    clearSessionCookie();
  }
  return false;
}

async function login(username, password) {
  var response = await fetch(API + "/authentication/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username, password: password })
  });
  var data = await response.json();
  if (!response.ok) throw new Error(data.error || "Login failed");

  authenticationToken = data.token;
  currentUser = data.user;
  window.localStorage.setItem("scheme_token", authenticationToken);
  setSessionCookie(authenticationToken);
  updateUIForUser();
  return data;
}

async function logout() {
  try {
    await apiPost("/authentication/logout", {});
  } catch (ignored) { /* ignore */ }
  authenticationToken = null;
  currentUser = null;
  window.localStorage.removeItem("scheme_token");
  clearSessionCookie();
  window.location.href = "/login";
}

function updateUIForUser() {
  bus.emit("scheme:user", currentUser);
}

// ---------------------------------------------------------------------------
// Server-Sent Events — live reactive data flow from other clients
// ---------------------------------------------------------------------------

function connectEventSource() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  eventSource = new EventSource(SSE_URL);

  eventSource.onopen = function () {
    console.log("EventSource connected");
    handleConnected();
  };

  var EVENT_NAMES = [
    "data:changed"
  ];
  for (var index = 0; index < EVENT_NAMES.length; index++) {
    (function (name) {
      eventSource.addEventListener(name, function (event) {
        handleSSEBroadcast(name, event.data);
      });
    })(EVENT_NAMES[index]);
  }

  // Unnamed frames (keep-alives, the welcome event) are ignored.
  eventSource.onmessage = function () { /* no-op */ };

  eventSource.onerror = function () {
    // EventSource handles reconnection internally — reflect the status change.
    if (eventSource && eventSource.readyState === EventSource.CONNECTING) {
      console.log("EventSource reconnecting…");
    }
    setOnlineStatus("offline");
  };
}

function handleSSEBroadcast(type, data) {
  var message = null;
  try { message = JSON.parse(data); } catch (ignored) { /* non-JSON */ }

  // The acting client set lastLocalMutationId from its own POST response —
  // the echo repeats the same mutationId, so the match is deterministic: no
  // wall-clock window, no double-refresh when the echo beats the response.
  var isOwnMutation = false;
  if (type === "data:changed" && message && message.mutationId) {
    if (String(message.mutationId) === lastLocalMutationId) {
      isOwnMutation = true;
    }
  }

  // The acting client already refreshed from its own POST response — the echo
  // is skipped, not duplicated. Remote mutations refresh scoped: the message
  // carries affectedTables/schemaChanged/allTables derived from the statement,
  // so only the tabs the mutation touched are re-read.
  if (!isOwnMutation) {
    refreshAfterMutation(message);
    showToast("Database changed — reloaded", "info");
  }
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

function showToast(message, type) {
  var container = document.getElementById("toast-container");
  if (!container) return;
  if (!type) type = "info";

  var toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(function () {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(function () { toast.remove(); }, 300);
  }, 3000);
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function setOnlineStatus(status) {
  state.offline = status !== "online";
  var badge = document.getElementById("synchronization-status");
  if (badge) {
    if (status === "online") {
      badge.innerHTML = '<span class="dot dot-green"></span> Online';
    } else {
      badge.innerHTML = '<span class="dot dot-red"></span> Offline';
    }
  }
  if (state.offline) {
    // Going offline shows the dedicated overlay immediately — every action is
    // blocked until the pending outbox has synced on reconnect. Restoring
    // connectivity is handled by handleConnected (probe → flush → hide).
    showOfflineOverlay();
  }
}

// ---------------------------------------------------------------------------
// Shell hydration
// ---------------------------------------------------------------------------

/**
 * The fallback shell body is empty — the page DOM lives in the
 * server-rendered dashboard (server/external/dashboard/). On the SSR page this
 * function is a no-op (the full shell is already in the DOM). When the empty
 * fallback shell is loaded (asset requests or client-side navigation), fetch
 * the server-rendered dashboard page and hydrate it in place.
 *
 * innerHTML does not execute injected <script> elements, so the component
 * module scripts carried in the fetched body are re-instantiated in place
 * (clone + replace) to attach their behaviour. The fetched document's head
 * module is ignored — this module is already running, so no double-init.
 */
async function hydrateShell() {
  if (document.getElementById("topbar")) return;

  var headers = {};
  if (authenticationToken) headers["Authorization"] = "Bearer " + authenticationToken;

  var response = await fetch("/dashboard", { headers: headers, credentials: "same-origin" });
  if (!response.ok) {
    throw new Error("Hydration failed: " + response.status + " " + response.statusText);
  }

  var text = await response.text();
  var parsedDocument = new DOMParser().parseFromString(text, "text/html");
  if (parsedDocument.title) document.title = parsedDocument.title;
  document.body.innerHTML = parsedDocument.body.innerHTML;

  var scripts = document.body.querySelectorAll('script[type="module"]');
  for (var index = 0; index < scripts.length; index++) {
    var source = scripts[index];
    var copy = document.createElement("script");
    copy.type = "module";
    copy.textContent = source.textContent;
    source.replaceWith(copy);
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function init() {
  try {
    await hydrateShell();
  } catch (error) {
    console.warn("[scheme] shell hydration failed:", error);
  }

  var loggedIn = await tryAutoLogin();
  if (loggedIn) {
    // Restore the persisted pane sizes + collapse state before the first
    // schema fetch so the initial render already carries them.
    applyLayout();
    // The browser's online/offline events drive state alongside the SSE
    // stream: both paths re-run handleConnected, so a dropped connection shows
    // the overlay and a restored one flushes the outbox and clears it.
    window.addEventListener("online", handleConnected);
    window.addEventListener("offline", function () { setOnlineStatus("offline"); });
    await loadSchema();
    connectEventSource();
    // Probe connectivity once — when the page boots offline the overlay shows
    // immediately and any leftover outbox entries flush on reconnect.
    handleConnected();
  } else {
    redirectToLogin();
  }
}

// ---------------------------------------------------------------------------
// Public surface — consumed by every component script in <body>
// ---------------------------------------------------------------------------

window.SchemeApp = {
  config: { API: API, SSE_URL: SSE_URL },
  bound: {},
  bus: bus,
  KEYWORDS: KEYWORDS,
  getState: function () { return state; },
  getUser: function () { return currentUser; },
  escapeHTML: escapeHTML,
  completionCandidates: completionCandidates,
  loadSchema: loadSchema,
  loadTable: loadTable,
  selectTable: selectTable,
  selectTableAt: selectTableAt,
  toggleTreeTable: toggleTreeTable,
  toggleTreePane: toggleTreePane,
  saveLayout: saveLayout,
  refreshStatusbar: refreshStatusbar,
  updateTableCount: updateTableCount,
  updateLastSynchronization: updateLastSynchronization,
  activateTab: activateTab,
  closeTab: closeTab,
  runQuery: runQuery,
  runQueryFromEditor: runQueryFromEditor,
  clearQueryError: clearQueryError,
  showToast: showToast,
  setOnlineStatus: setOnlineStatus,
  apiGet: apiGet,
  apiPost: apiPost,
  tryAutoLogin: tryAutoLogin,
  login: login,
  logout: logout,
  redirectToLogin: redirectToLogin,
  connectEventSource: connectEventSource,
  hydrateShell: hydrateShell,
  init: init
};

// Start when the DOM is parsed (module scripts execute after parsing).
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
`;
