/**
 * @module dashboard/components/data_browser
 * data_browser — embedded click wiring + tree resize for the database panes.
 *
 * The left tree and the right tab strip re-render their innerHTML frequently
 * (core runtime refreshes), so both listeners are event-delegated on the
 * containers, which survive those swaps. Tree actions: clicking a tree item's
 * caret toggles its expanded column children; clicking the item itself opens
 * that table as a tab. Tab actions: clicking a tab activates it; clicking its
 * close button closes it.
 *
 * The tree pane is horizontally resizable: pointer-dragging the workspace's
 * tree drag handle rewrites the `.pane-browser` inline width. The tree can
 * cover the vertical column completely (dragged past the 36px snap threshold)
 * or disappear entirely (snapped shut below 36px — the `.is-snapping` class
 * animates the snap). The row layout and these interactions are identical at
 * every screen size — the tree is never re-laid out as a drawer, so a drag
 * always writes the same inline width. Collapsing the tree itself is driven
 * by core state through the topbar nav button — this script only handles the
 * resize strip. Dropped widths are persisted through the core runtime's
 * layout persistence (`scheme_layout` in localStorage), so reloads restore
 * the user's pane sizes.
 * The drag is touch-friendly: `touch-action: none` on the handle keeps the
 * browser from stealing the gesture for scrolling, and the pointer is captured
 * on the handle (plus a `pointercancel` fallback) so moves keep streaming to
 * the drag even when the finger leaves the 6px-wide strip.
 */

export const dataBrowserScript = `(function () {
  var SchemeApp = window.SchemeApp;
  if (!SchemeApp || SchemeApp.bound.dataBrowser) return;
  SchemeApp.bound.dataBrowser = true;

  var tree = document.getElementById("schema-tree");
  var tabs = document.getElementById("tab-strip");

  function focusTree() {
    if (tree) tree.focus({ preventScroll: true });
  }

  if (tree) {
    tree.addEventListener("click", function (event) {
      var caret = event.target.closest ? event.target.closest(".tree-caret") : null;
      var item = event.target.closest ? event.target.closest(".tree-item") : null;
      if (!item) return;
      var tableName = item.getAttribute("data-table");
      if (!tableName) return;
      if (caret && typeof SchemeApp.toggleTreeTable === "function") {
        SchemeApp.toggleTreeTable(tableName);
      } else {
        SchemeApp.selectTable(tableName);
      }
      focusTree();
    });
  }

  if (tabs) {
    tabs.addEventListener("click", function (event) {
      var close = event.target.closest ? event.target.closest(".tab-close") : null;
      var tab = event.target.closest ? event.target.closest(".tab[data-tab]") : null;
      if (!tab) return;
      var name = tab.getAttribute("data-tab");
      if (!name) return;
      if (close && typeof SchemeApp.closeTab === "function") {
        SchemeApp.closeTab(name);
      } else if (typeof SchemeApp.activateTab === "function") {
        SchemeApp.activateTab(name);
      }
      focusTree();
    });
  }

  // Horizontal tree resizing — a pointer drag on the workspace's handle
  // rewrites the browser pane's inline width so the tree and the vertical
  // column adjust without re-rendering. The tree may cover the vertical
  // column fully; dragging below the 36px snap threshold shuts it away.
  var SNAP_WIDTH = 36;
  var handle = document.getElementById("tree-drag-handle");
  var workspace = document.querySelector(".workspace");
  var browserPane = document.querySelector(".pane-browser");
  var dragging = false;

  function startDrag(event) {
    if (!workspace || !browserPane) return;
    event.preventDefault();
    dragging = true;
    document.body.classList.add("tree-resizing");
    if (typeof handle.setPointerCapture === "function") {
      try { handle.setPointerCapture(event.pointerId); } catch (ignored) { }
    }
    document.addEventListener("pointermove", moveDrag);
    document.addEventListener("pointerup", stopDrag, { once: true });
    document.addEventListener("pointercancel", stopDrag, { once: true });
  }

  function moveDrag(event) {
    if (!dragging || !workspace || !browserPane) return;
    var bounds = workspace.getBoundingClientRect();
    var width = Math.round(event.clientX - bounds.left);
    if (width < SNAP_WIDTH) {
      // Snap shut — a short transition animates the final slide to 0.
      browserPane.classList.add("is-snapping");
      browserPane.style.width = "0px";
      return;
    }
    browserPane.classList.remove("is-snapping");
    // Max = whole workspace content row minus the handle + two 6px gaps: the
    // tree then covers the vertical column completely.
    var maxWidth = Math.max(SNAP_WIDTH, Math.round(bounds.width) - 42);
    browserPane.style.width = Math.min(width, maxWidth) + "px";
  }

  function stopDrag() {
    dragging = false;
    document.body.classList.remove("tree-resizing");
    document.removeEventListener("pointermove", moveDrag);
    // Persist the applied pane width so the next load restores it.
    if (typeof SchemeApp.saveLayout === "function") SchemeApp.saveLayout();
  }

  if (handle) {
    handle.addEventListener("pointerdown", startDrag);
  }

  // On window resize, clamp a drag-applied size so the tree never overflows
  // the (possibly narrower) workspace. The layout is a row at every screen
  // size, so the inline width is always the source of truth for the tree.
  window.addEventListener("resize", function () {
    if (!browserPane || !workspace) return;
    var inline = browserPane.style.width;
    if (!inline) return;
    var bounds = workspace.getBoundingClientRect();
    var maxWidth = Math.max(SNAP_WIDTH, Math.round(bounds.width) - 42);
    var width = parseInt(inline, 10);
    if (width > maxWidth) browserPane.style.width = maxWidth + "px";
  });
})();
`;