/**
 * @module dashboard/components/workspace
 * workspace — embedded vertical editor-resize wiring.
 *
 * The SQL editor pane and the data table pane share the right vertical column.
 * A pointer drag on the handle between them rewrites the editor pane's inline
 * flex to a fixed pixel height. The editor may cover the data table completely
 * (dragged past the 36px snap threshold) or snap shut below 36px — the
 * `.is-snapping` class animates the snap. The tree resize handle keeps its
 * own wiring in the data_browser component. Dropped panes are persisted
 * through the core runtime's layout persistence (`scheme_layout` in
 * localStorage), so reloads restore the user's pane sizes.
 *
 * The drag is touch-friendly: `touch-action: none` on the handle keeps the
 * browser from stealing the gesture for scrolling, and the pointer is captured
 * on the handle (plus a `pointercancel` fallback) so moves keep streaming to
 * the drag even when the finger leaves the 6px-wide strip.
 */

export const workspaceScript = `(function () {
  var SchemeApp = window.SchemeApp;
  if (!SchemeApp || SchemeApp.bound.workspace) return;
  SchemeApp.bound.workspace = true;

  var editorHandle = document.getElementById("editor-drag-handle");
  var editorPane = document.querySelector(".pane-editor");
  var vertical = document.querySelector(".workspace-vertical");
  if (!editorHandle || !editorPane || !vertical) return;

  var SNAP_HEIGHT = 36;
  var EDITOR_HANDLE_HEIGHT = 6;
  var dragging = false;

  function startDrag(event) {
    event.preventDefault();
    dragging = true;
    document.body.classList.add("editor-resizing");
    if (typeof editorHandle.setPointerCapture === "function") {
      try { editorHandle.setPointerCapture(event.pointerId); } catch (ignored) { }
    }
    document.addEventListener("pointermove", moveDrag);
    document.addEventListener("pointerup", stopDrag, { once: true });
    document.addEventListener("pointercancel", stopDrag, { once: true });
  }

  function moveDrag(event) {
    if (!dragging) return;
    var bounds = vertical.getBoundingClientRect();
    var height = Math.round(bounds.bottom - event.clientY);
    if (height < SNAP_HEIGHT) {
      // Snap shut — a short transition animates the final slide to 0.
      editorPane.classList.add("is-snapping");
      editorPane.style.flex = "0 0 0px";
      return;
    }
    editorPane.classList.remove("is-snapping");
    // Max = whole column height minus the handle + two 6px gaps: the editor
    // then covers the data table completely.
    var maxHeight = Math.max(SNAP_HEIGHT, Math.round(bounds.height) - 18);
    editorPane.style.flex = "0 0 " + Math.min(height, maxHeight) + "px";
  }

  function stopDrag() {
    dragging = false;
    document.body.classList.remove("editor-resizing");
    document.removeEventListener("pointermove", moveDrag);
    // Persist the applied editor height so the next load restores it.
    if (typeof SchemeApp.saveLayout === "function") SchemeApp.saveLayout();
  }

  editorHandle.addEventListener("pointerdown", startDrag);

  // On window resize, clamp a drag-applied editor height (inline flex) so it
  // never exceeds the (possibly shorter) vertical column.
  window.addEventListener("resize", function () {
    var inline = editorPane.style.flex;
    if (!inline) return;
    var bounds = vertical.getBoundingClientRect();
    var maxHeight = Math.max(SNAP_HEIGHT, Math.round(bounds.height) - 18);
    var match = /0 0 (\\d+)px/.exec(inline);
    if (!match) return;
    var height = parseInt(match[1], 10);
    if (height > maxHeight) editorPane.style.flex = "0 0 " + maxHeight + "px";
  });
})();
`;